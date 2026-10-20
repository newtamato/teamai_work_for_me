如果不在 `GameServer::OnCloseSocket()` 中清理机器人，分两种情况。

## 1. 结算时机器人服仍未启动

### caiisvr 不会崩溃

`NotifyRobotSvr()` 会先检查连接：

```cpp
auto context = GetRobotSvrContext();
if (!context) {
    LOG_WARN("NotifyRobotSvr skipped. no robotsvr context");
    return kCommFaild;
}
```

所以：

```text
机器人结算通知发送失败
caiisvr 不会崩溃
```

### 结算函数本身不会立即发送 HN_LEAVE_GAME

UNO 结算流程是：

```text
SetGameEnd()
  → SettleUnoResult()
  → NotifyPlayers(GN_C_UNO_GAME_RESULT)
  → NotifyRobotSvr(GN_C_UNO_GAME_RESULT)
  → NotifyLive(...)
```

`SettleUnoResult()` 对机器人只计算 `coin_delta`，不会直接更新机器人资产，也不会发送 `HN_LEAVE_GAME`。

但是，牌桌进入：

```text
kTableEnding
```

之后，`UnoGameRoom::CheckTablesStart()` 会在结束保留时间到期后执行：

```cpp
table->CleanAllPlayers();
table->ResetTable();
```

`CleanAllPlayers()` → `CleanPlayer()`，而 `CleanPlayer()` 会发送：

```cpp
HN_LEAVE_GAME
```

因此实际效果是：

```text
结算时：不发送 HN_LEAVE_GAME
牌桌结束清理时：发送 HN_LEAVE_GAME
```

前提是机器人仍然保留在 `GameTable` 的座位上。

但机器人资产结算不会成功，因为：

```text
caiirobotsvr 没有收到 GN_C_UNO_GAME_RESULT
```

---

## 2. 结算前机器人服重新启动

机器人服的重连流程大致是：

```text
GameClient 断线
  → OnGameClientSocketClose
  → 清空 ingame_robots_
  → 重连 caiisvr
  → Valid2GameSvr
  → 机器人重新登录大厅
  → HR_SEARCH_GAMEPLAYER
  → 发现仍在房间
  → GR_C_ROBOT_ENTERGAME
  → caiisvr RobotContinueGame
  → OnRobotEnterGameResp
  → 加入 ingame_robot cache
```

如果 caiisvr 本地仍保留原来的机器人和 UNO 牌桌：

```text
RobotContinueGame() 可以成功
```

它主要做的是：

```text
校验原 room/table/chair 仍然存在
更新 robot 的 socket/token
恢复机器人服务侧的桌缓存
```

不会重新创建 UNO 牌局，也不会重置：

```text
手牌
当前玩家
牌堆
turn_seq
回合状态
```

所以对正在运行的 caiisvr 牌局本身没有重置影响。

## 但存在一个重要竞态

如果机器人服重启后，结算通知到达时已经完成：

```text
OnRobotEnterGameResp()
AddInGameRobotCache(...)
```

则：

```text
GN_C_UNO_GAME_RESULT
  → OnUnoGameResult
  → 找到机器人
  → 执行机器人资产结算
```

可以正常完成。

但是如果顺序是：

```text
机器人服刚连接
  → 还没完成 OnRobotEnterGameResp
  → caiisvr 已发送 GN_C_UNO_GAME_RESULT
```

此时机器人服的：

```cpp
GetInGameRobots(roomid, tableno)
```

可能为空，结算通知会被丢弃，当前没有重试机制。

结果是：

```text
caiisvr 认为通知已发送
机器人服没有处理结算
机器人资产没有结算
```

## 结论

### 情况 1：机器人服没起来

```text
caiisvr 不崩溃
机器人结算通知发送失败
结算时不会发 HN_LEAVE_GAME
牌桌最终清理时会发 HN_LEAVE_GAME
机器人资产结算失败
```

### 情况 2：结算前机器人服起来

```text
如果先完成 OnRobotEnterGameResp，再发生结算：
    可以正常收到结算并处理资产

如果结算先发生，再完成 OnRobotEnterGameResp：
    当前结算通知可能丢失
```

机器人重连成功本身不会重置或破坏 caiisvr 正在运行的 UNO 牌局；主要风险是**重连和结算通知之间的时序竞争**。

---

## 3. 机器人服务断开时的处理方案

如果 `caiirobotsvr` 连接断开，`caiisvr::GameServer::OnCloseSocket()` 暂不清理 caiisvr 中的机器人状态：

```text
不调用 PlayerLeaveGame
不立即发送 HN_LEAVE_GAME
保留机器人 User、GameTable 座位和 UNO 牌局状态
仅清空 robotsvrs_context_
```

原因是 UNO 的完整牌局状态、手牌和回合都在 caiisvr 内存中。保留机器人状态可以让 caiisvr 继续完成当前牌局；即使结算期间 caiirobotsvr 尚未恢复，结算通知发送失败也不会破坏 caiisvr 的牌局状态。

牌局结算后，桌子进入 `kTableEnding`。等结束保留时间到期，`UnoGameRoom::CheckTablesStart()` 执行：

```cpp
table->CleanAllPlayers();
table->ResetTable();
```

其中 `CleanAllPlayers()` → `CleanPlayer()` 会：

```text
删除 caiisvr UserMgr 中的机器人
清理 GameTable 座位
发送 HN_LEAVE_GAME
```

因此机器人服务断开时的清理延后到牌桌结束阶段，避免提前移除机器人座位导致 UNO 牌局状态、GameTable 座位状态和结算数据不一致。
