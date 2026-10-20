# UNO 完整游戏链路

> 服务端工作目录：`192.168.53.48:/root/projects/caii-server`
>
> 历史测试房间示例：`<historical-test-roomid>`；当前 roomid 由大厅/服务端下发，不固定。UNO 玩法当前要求四人桌。

## 一、玩家进入游戏

客户端登录成功后，通过 `GR_C_UNO_ENTER` 请求进入 UNO。

服务端入口：

```text
caiisvr/server/game_server.cpp
  → GR_C_UNO_ENTER
  → GameServer::OnUnoEnter()
  → UnoGameRoom::PlayerEnterGame()
```

`UnoGameRoom::PlayerEnterGame()` 负责：

1. 将请求用户转换为 `GameUser`；
2. 读取玩家 UNO 等级/经验；
3. 查找可加入的 UNO 匹配桌；
4. 真人按等级差加入匹配桌；
5. 机器人按指定桌号加入；
6. 调用 `GameTable::BindPlayer()` 分配座位；
7. 写入 room/table/chair；
8. 加入 `UserMgr`；
9. 第一名玩家进入时将桌子设置为 `kTableMatching`；
10. 满 4 人后设置为 `kTableWaitingStart`。

## 二、匹配

匹配和机器人补位由 `UnoGameRoom::CheckTablesStart()` 定时处理。

```text
kTableMatching
  → 等待真人匹配
  → 广播 GN_C_UNO_MATCH_STATE
  → 超过 robotFillStartMs 后请求机器人
  → GN_C_CALL_ROBOT
  → caiirobotsvr 选择机器人
  → GR_C_ROBOT_ENTERGAME
  → UnoGameRoom::PlayerEnterGame()
```

匹配配置来自：

```text
caiisvr/config/uno_level_config.json
```

主要配置：

```json
{
  "entryFee": 30,
  "roundTimeoutMs": 180000,
  "matching": {
    "firstWindowMs": 5000,
    "secondWindowMs": 10000,
    "thirdWindowMs": 15000,
    "robotFillStartMs": 15000
  }
}
```

匹配成功后：

```text
玩家数量 == 4
  → kTableWaitingStart
  → CheckTablesStart() 调用 UnoGameTable::StartGame()
```

## 三、扣除入场费

入口：

```text
UnoGameTable::StartGame()
  → ChargeEntryFee()
```

UNO 不调用 Carrom 的：

```text
GameTable::PayForEntryFee()
```

每名玩家扣除配置中的：

```text
entryFee = 30
```

30 金币属于系统入场费，不进入 UNO 奖池。

### 真人

```text
检查 User::deposit_
  → 本地 User::change_deposit(-30)
  → 组装 hall::base::RefreshGameResult
  → TransmitNotify2CheckSvr(10010012, result)
  → checksvr 执行实际资产扣款
  → PAY_RESULT / CURRENCY_EXCHANGE_EX 回调
  → caiisvr 更新最终余额
```

如果任意玩家余额不足，游戏不开始。

### 机器人

```text
GN_C_UNO_GAME_START
  → caiirobotsvr
  → Robot::deposit_ -= 30
  → RobotBackDeposit(30)
  → change_deposit.url 执行实际扣款
```

机器人资产不由 checksvr 执行，而由 `caiirobotsvr` 通过机器人资产接口执行。

## 四、开始 UNO 游戏

入场费处理通过后：

```text
UnoGameTable::StartGame()
  → 构造 UnoSeatPlayer
  → UnoGame::Start()
  → 洗牌、发 7 张手牌
  → 翻出初始数字牌
  → 设置当前玩家和回合序号
  → 设置 3 分钟 round deadline
  → 发送 GN_C_UNO_GAME_START
  → 设置 GameTable 状态为 kTablePlaying
  → 广播 UNO 桌面状态
```

核心模块：

```text
caiisvr/uno/uno_game.cpp
caiisvr/uno/uno_game_table.cpp
caiisvr/uno/uno_game_room.cpp
```

## 五、出牌、摸牌和回合

客户端请求通过 `GameServer` 分发到 UNO 专用接口：

```text
GR_C_UNO_PLAY_CARD
  → UnoGameTable::HandlePlay()
  → UnoGame::PlayCard()

GR_C_UNO_DRAW_CARD
  → UnoGameTable::HandleDraw()
  → UnoGame::DrawCard()

GR_C_UNO_PASS_AFTER_DRAW
  → UnoGameTable::HandlePass()
  → UnoGame::PassAfterDraw()
```

服务端校验：

```text
牌桌状态
回合序号
当前玩家
牌是否在手牌中
牌是否可以出
万能牌颜色
叠加惩罚规则
```

操作成功后广播：

```text
GN_C_UNO_ACTION_NTF
GN_C_UNO_TURN_CHANGED
GN_C_UNO_TABLE_STATE
GN_C_UNO_HAND_UPDATE
```

## 六、托管和超时

托管请求：

```text
GR_C_UNO_SET_TRUSTEE
  → GameServer::OnUnoAction()
  → UnoGameTable::HandleAction()
  → UnoGame::SetTrustee()
```

`HandleAction()` 使用：

```text
UNO_ACTION_COMMAND_CHALLENGE_WILD4
UNO_ACTION_COMMAND_DECLINE_WILD4
UNO_ACTION_COMMAND_DECLARE_UNO
UNO_ACTION_COMMAND_SET_TRUSTEE
```

不会使用 1、2、3、4 这类魔法数字。

定时处理：

```text
UnoGameRoom::CheckTablesStart()
  → UnoGameTable::CheckTimeoutAndAutoPlay()
  → UnoGame::CheckTimeoutAndAutoPlay()
```

两种超时要区分：

```text
单回合超时：自动摸牌/出牌/托管操作
整局 3 分钟超时：进入最终结算
```

## 七、游戏结束条件

### 手牌清空

```text
UnoGame::MaybeFinishByEmptyHand()
  → FillResult(kHandEmpty, winner_userid)
```

### 3 分钟超时

```text
UnoGame::CheckTimeoutAndAutoPlay()
  → FinishByRoundTimeout()
  → 按手牌分最低者作为第一名
  → 分数相同按座位号排序
  → FillResult(kRoundTimeout, winner_userid)
```

### 牌堆耗尽

```text
FinishByDeckEmpty()
```

## 八、UNO 结算

入口：

```text
UnoGameTable::BroadcastAction()
  → SetGameEnd()
  → SettleUnoResult()
```

结算顺序：

1. 计算每名玩家剩余手牌分；
2. 按手牌分从低到高排序；
3. 分数相同时按座位号升序；
4. 计算第 3、4 名实际可扣金币：

```text
actual_loss = min(hand_score, current_balance)
```

5. 计算奖金池：

```text
pool = actual_loss_rank3 + actual_loss_rank4
```

6. 根据 `D = abs(score_rank4 - score_rank3)` 选择第 1、2 名分配比例；
7. `D=0` 时第 1 名额外获得 1 金币，保证第 1 名严格多于第 2 名；
8. 为每名玩家写入 `coin_delta`；
9. 真人通过 `RefreshGameResult` 通知 checksvr；
10. 机器人通过 `GN_C_UNO_GAME_RESULT` 通知 caiirobotsvr；
11. 发放真人经验，机器人不发经验；
12. 广播 `GN_C_UNO_GAME_RESULT`。

### `UnoPlayerResult` 结算明细

`GN_C_UNO_GAME_RESULT.players` 中每个元素都是一个 `UnoPlayerResult`：

```protobuf
UnoPlayerResult {
  int32 userid = 1;                 // 玩家 ID。
  int32 chairno = 2;                // 玩家座位号。
  repeated UnoCard left_cards = 3;  // 结算时剩余手牌。
  int32 left_card_score = 4;        // 剩余手牌分。
  bool is_winner = 6;               // 是否为第一名。
  int32 rank = 7;                   // 本轮排名，分数相同按座位号排序。
  int64 coin_delta = 8;             // 本轮金币变化值。
}
```

字段用途：

```text
left_cards       → 结算界面展示玩家剩余的牌
left_card_score  → 展示手牌分和结算依据
rank             → 展示本轮名次
is_winner        → 判断是否显示胜利状态
coin_delta       → 更新金币变化，正数为获得，负数为扣除
```

真人的 `coin_delta` 通过 checksvr 执行，机器人由 caiirobotsvr 执行。

### 真人最终结算

```text
UnoGameTable::SettleUnoResult()
  → 组装 RefreshGameResult
  → diff_deposit = coin_delta
  → TransmitNotify2CheckSvr(10010012, result)
  → checksvr 执行资产变化
```

### 机器人最终结算

```text
GN_C_UNO_GAME_RESULT
  → GameClient::OnUnoGameResult()
  → 多机器人逐个转发给 RobotMgr
  → RobotMgr::OnUnoGameResult()
  → Robot::deposit_ += coin_delta
  → 正数 RobotGainDeposit()
  → 负数 RobotBackDeposit()
```

## 九、结算后释放桌子

结算时牌桌先设置为：

```text
kTableEnding
```

下一次房间定时检查：

```text
UnoGameRoom::CheckTablesStart()
  → 检测 kTableEnding
  → DissolveTable(kDissolveGameEnd)
  → 发送 GN_C_TABLE_DISSOLVED
  → 清理玩家
  → ResetTable()
  → 桌子恢复 kTableDefault
```

机器人收到解散通知后：

```text
获取同桌所有机器人
  → 逐个归还机器人可用池
  → 清理同桌机器人缓存
```

玩家之后可以重新进入 UNO 匹配。

## 十、发现的 Carrom 相关代码

UNO 主流程已经尽量放在：

```text
UnoGameRoom
UnoGameTable
UnoGame
```

但以下是当前仍然使用的公共或历史 Carrom 代码，需要持续注意：

### 1. `GameTable` 基类

`UnoGameTable` 继承自：

```cpp
GameTable
```

因此会继承一些通用方法：

```text
BindPlayer
UnbindPlayer
NotifyPlayers
NotifyOnePlayer
ResetTable
DissolveTable
```

其中 `DissolveTable()` 内部使用了 Carrom 的：

```text
game::carrom::TableDissolvedNotify
GN_C_TABLE_DISSOLVED
```

目前作为公共桌子解散通知使用，但不是 UNO 专用协议，后续可以改成 UNO 专用解散通知。

### 2. 机器人召唤

当前机器人召唤仍复用了：

```text
game::carrom::CallRobot
GN_C_CALL_ROBOT
```

原因是 `caiirobotsvr` 当前机器人召唤接口仍基于 Carrom 协议。UNO 业务逻辑没有进入 Carrom 的牌局、物理或 GameBoutData 逻辑。

### 3. `GameTable::ResetTable()`

该基类方法内部仍然调用：

```cpp
ResetPucks();
game_bout_data_.reset();
```

UNO 的 `UnoGameTable::ResetTable()` 当前调用了基类 ResetTable，因此存在潜在 Carrom 依赖。虽然当前流程没有初始化 `GameBoutData`，但后续应为 UNO 实现独立的桌子重置逻辑，避免进入：

```text
ResetPucks()
GameBoutData
Carrom GameOver
```

### 4. 不能进入的 Carrom 逻辑

UNO 绝不能调用：

```text
GameTable::GiveUp()
GameTable::GameOver()
GameTable::PayForEntryFee()
GameTable::CommitFinalResult()
GameBoutData
物理参数
开球/击球/球桌逻辑
```

UNO 应继续使用：

```text
UnoGame::Start()
UnoGame::PlayCard()
UnoGame::DrawCard()
UnoGame::SetTrustee()
UnoGame::FillResult()
UnoGameTable::ChargeEntryFee()
UnoGameTable::SettleUnoResult()
UnoGameRoom::CheckTablesStart()
```
