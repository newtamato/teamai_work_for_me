# UNO 开始对局与出牌协议链路

## 1. 玩家进入 UNO

客户端发送：

```text
GR_C_UNO_ENTER = 进入 UNO
```

当前复用的请求结构是：

```protobuf
UnoTableQueryReq {
  int32 userid = 1;
  int32 roomid = 2;
  int32 tableno = 3;
}
```

服务端：

```text
GameServer::OnUnoEnter()
  → token 校验 userid
  → UnoGameRoom::PlayerEnterGame()
  → 查找/创建匹配桌
  → BindPlayer 分配座位
  → 返回 UnoTableQueryResp
```

## 2. 匹配阶段

`UnoGameRoom::CheckTablesStart()` 定时检查桌子：

```text
kTableMatching
  → UnoGameTable::BroadcastMatchState()
  → GN_C_UNO_MATCH_STATE
```

通知结构：

```protobuf
UnoMatchStateNotify {
  int32 roomid = 1;                 // 匹配房间 ID。
  int32 tableno = 2;                // 当前匹配桌号。
  int32 matched_real_player_count = 3; // 当前真人数量。
  int32 target_player_count = 4;    // 开局所需人数，UNO 为 4。
  int32 wait_remaining_ms = 5;      // 距离机器人补位/匹配阶段结束的剩余时间。
  repeated UnoPlayerPublicInfo players = 6; // 当前桌上公开玩家列表。
}
```

超过机器人补位时间后：

```text
UnoGameRoom::RequestRobot()
  → GameTable::CallRobot()
  → GN_C_CALL_ROBOT
  → caiirobotsvr 选择机器人
  → GR_C_ROBOT_ENTERGAME
  → UnoGameRoom::PlayerEnterGame()
```

这里仍然使用 Carrom 定义的：

```text
game::carrom::CallRobot
GN_C_CALL_ROBOT
GR_C_ROBOT_ENTERGAME
```

这是机器人召唤基础设施的历史协议，不代表进入 Carrom 牌局逻辑。

## 3. 匹配成功和扣入场费

四名玩家进入后：

```text
kTableMatching
  → kTableWaitingStart
  → UnoGameRoom::CheckTablesStart()
  → UnoGameTable::StartGame()
```

`StartGame()` 当前处理：

```text
ChargeEntryFee()
  → 读取 entryFee=30
  → 检查每名玩家余额
  → 真人构造 RefreshGameResult
  → TransmitNotify2CheckSvr(10010012, result)
  → 机器人走 caiirobotsvr 资产链
  → 创建 UnoGame
```

入场费协议不是 UNO protobuf，而是：

```protobuf
hall::base::RefreshGameResult
```

入场费的 `diff_deposit`：

```text
-30
```

30 金币是系统入场费，不进入 UNO 奖池。

## 4. 开始对局通知

UNO 开局通知：

```text
GN_C_UNO_GAME_START
```

结构：

```protobuf
UnoGameStartNotify {
  UnoTablePublicState public_state = 1; // 开局时的完整公共桌面状态。
  int64 entry_fee = 2;                  // 本局每名玩家扣除的系统入场费。
}
```

`public_state` 包含：

```protobuf
UnoTablePublicState {
  int32 roomid;                 // 房间 ID，由大厅/服务端下发；历史测试代码曾使用 <historical-test-roomid>。
  int32 tableno;                // 桌号。
  UnoTableStatus status;        // matching / playing / round_end / dissolved。
  repeated UnoPlayerPublicInfo players; // 所有玩家公开信息，不含手牌。
  int32 current_userid;         // 当前应该操作的玩家 ID。
  int32 current_chairno;        // 当前应该操作的座位号。
  UnoDirection direction;        // 顺时针或逆时针。
  UnoCard top_card;             // 弃牌堆顶部的牌。
  UnoColor current_color;        // 当前生效颜色，可能与 top_card.color 不同。
  int32 draw_penalty_count;     // 当前累计摸牌惩罚数量。
  bool stacking_active;         // 是否处于 +2/+4 叠加状态。
  int32 draw_pile_count;        // 摸牌堆剩余数量。
  int32 discard_pile_count;     // 弃牌堆数量。
  int32 action_timeout_ms;      // 单回合操作时长，不是整局时长。
  int64 turn_deadline_ms;       // 当前回合截止时间，Unix 毫秒时间戳。
  int32 turn_seq;               // 回合序号，请求必须带回并由服务端校验。
  int64 round_deadline_ms;      // 本局截止时间，开局后 3 分钟，Unix 毫秒时间戳。
}
```

第一张牌一定是数字牌，首位玩家随机选择，默认方向为顺时针。

## 5. 玩家私有手牌和可出牌提示

开局及每次状态变化后，服务端给每个玩家发送：

```text
GN_C_UNO_HAND_UPDATE
```

结构：

```protobuf
UnoHandUpdateNotify {
  UnoPrivateState private_state = 1; // 只发送给对应玩家的手牌和可出牌信息。
}

UnoPrivateState {
  int32 userid = 1;                  // 私有状态所属玩家。
  repeated UnoCard hand_cards = 2;   // 仅本人可见的完整手牌。
  repeated int32 playable_card_ids = 3; // 当前允许打出的牌 ID。
  bool must_draw = 4;                // 没有可出牌时为 true。
  bool under_draw_penalty = 5;       // 是否承受 +2/+4 惩罚。
  int32 draw_penalty_count = 6;      // 当前累计惩罚数量。
  bool must_declare_uno = 7;         // 是否需要喊 UNO。
}
```

客户端使用：

```text
playable_card_ids
```

高亮当前可以出的牌。

## 6. 轮到谁出牌

服务端发送：

```text
GN_C_UNO_TURN_CHANGED
```

结构：

```protobuf
UnoTurnChangedNotify {
  int32 roomid = 1;                 // 房间 ID。
  int32 tableno = 2;                // 桌号。
  int32 current_userid = 3;         // 当前行动玩家 ID。
  int32 current_chairno = 4;        // 当前行动玩家座位号。
  UnoDirection direction = 5;       // 当前出牌方向。
  int32 turn_seq = 6;               // 当前回合序号。
  int64 turn_deadline_ms = 7;       // 当前回合截止时间。
  int32 draw_penalty_count = 8;     // 累计摸牌惩罚数量。
  bool stacking_active = 9;         // 是否仍可继续叠加惩罚牌。
}
```

客户端判断：

```text
current_userid == 本机 userid
```

则进入自己的出牌回合。

操作倒计时使用：

```text
turn_deadline_ms
```

整局超时使用独立的：

```text
roundTimeoutMs = 180000
```

## 7. 玩家出牌请求

客户端发送：

```text
GR_C_UNO_PLAY_CARD
```

请求结构：

```protobuf
UnoPlayCardReq {
  int32 userid = 1;                 // 请求玩家 ID，服务端结合 token 校验。
  int32 roomid = 2;                 // 请求房间 ID，必须匹配当前牌桌。
  int32 tableno = 3;                // 请求桌号，必须匹配当前牌桌。
  int32 card_id = 4;                // 要打出的牌 ID，必须属于本人手牌。
  UnoColor chosen_color = 5;        // 万能牌选择的生效颜色。
  int32 turn_seq = 10;              // 当前回合序号，防止重复或过期请求。
}
```

服务端链路：

```text
GameServer::OnUnoPlayCard()
  → 解析 protobuf
  → 校验 token/userid
  → 根据 userid 查找 UnoGameTable
  → UnoGameTable::HandlePlay()
  → 校验 roomid/tableno/card_id
  → UnoGame::PlayCard()
  → 校验回合、牌归属、牌是否合法、颜色和叠加规则
```

## 8. 出牌响应

服务端返回：

```text
GR_C_UNO_PLAY_CARD response
```

结构：

```protobuf
UnoPlayCardResp {
  int32 code = 1;                    // 0 表示成功，非 0 表示请求或规则错误。
  UnoTablePublicState public_state = 2; // 请求处理后的公共状态。
  UnoPrivateState private_state = 3;   // 请求玩家处理后的私有状态。
}
```

失败时：

```text
只返回错误码和当前状态
不修改牌局
不广播成功动作
```

## 9. 出牌成功后的通知

出牌成功后，服务端广播：

```text
GN_C_UNO_ACTION_NTF
GN_C_UNO_TURN_CHANGED
GN_C_UNO_TABLE_STATE
GN_C_UNO_HAND_UPDATE
```

动作通知：

```protobuf
UnoActionNotify {
  UnoActionType action_type = 1;     // 本次发生的动作类型。
  int32 userid = 2;                  // 执行动作的玩家 ID。
  int32 target_userid = 3;           // 被惩罚/被跳过的玩家，没有目标时为 0。
  UnoCard card = 10;                 // 本次相关的牌。
  UnoColor chosen_color = 11;        // 万能牌最终生效颜色。
  int32 draw_count = 12;             // 本次摸牌或惩罚摸牌数量。
  int32 card_count_after = 13;       // 动作后玩家手牌数量。
  UnoTablePublicState public_state = 20; // 动作后的公共桌面状态。
}
```

`action_type` 可以是：

```text
UNO_ACTION_PLAY_CARD
UNO_ACTION_DRAW_PENALTY
UNO_ACTION_SKIP
UNO_ACTION_REVERSE
UNO_ACTION_CHOOSE_COLOR
UNO_ACTION_AUTO_UNO
UNO_ACTION_ROUND_END
```

每次广播后，服务端重新给每名玩家发送私有手牌状态，因此当前玩家的：

```text
playable_card_ids
```

也会同步更新。

## 10. 摸牌和摸牌后跳过

摸牌请求：

```text
GR_C_UNO_DRAW_CARD
```

```protobuf
UnoDrawCardReq {
  int32 userid = 1;                 // 请求摸牌的玩家。
  int32 roomid = 2;                 // 房间 ID。
  int32 tableno = 3;                // 桌号。
  int32 turn_seq = 4;               // 当前回合序号。
}
```

响应：

```protobuf
UnoDrawCardResp {
  int32 code = 1;                    // 摸牌结果码。
  UnoCard drawn_card = 2;             // 本次摸到的牌。
  bool can_play_drawn_card = 3;       // 摸到的牌能否立即打出。
  UnoTablePublicState public_state = 4; // 摸牌后的公共状态。
  UnoPrivateState private_state = 5;   // 摸牌后的本人私有状态。
}
```

摸牌后不出：

```text
GR_C_UNO_PASS_AFTER_DRAW
```

## 11. +4 质疑操作

A 打出非叠加的万能 +4 后，服务端立即将当前玩家切换为 B，同时开启质疑窗口：

```text
A 出 +4
  → current_userid = B
  → turn_deadline_ms = now + 10 秒
  → pending_challenge_deadline_ms = now + 10 秒
  → B 可选择质疑或接受 +4
```

B 的质疑倒计时与普通回合倒计时同时开始，不等待 A 的动画。

```text
GR_C_UNO_CHALLENGE_WILD4
GR_C_UNO_DECLINE_WILD4
```

B 选择接受惩罚时：

```text
摸累计惩罚牌（通常为 4 张）
  → 清除质疑和叠加状态
  → 切换到下一位玩家
  → 发送 GN_C_UNO_ACTION_NTF
  → 发送 GN_C_UNO_TURN_CHANGED
```

B 超时后由服务端自动执行默认策略，不能停留在质疑状态。

## 12. 托管操作

UNO 没有客户端主动托管请求。以下字段/请求号仅为旧协议兼容保留，正式客户端不应发送：

```text
GR_C_UNO_SET_TRUSTEE
UnoActionCommand::SET_TRUSTEE
```

托管只由服务端在连续回合超时或玩家断线时触发。

结构：

```protobuf
UnoActionReq {
  int32 userid = 1;                 // 请求玩家 ID。
  int32 roomid = 2;                 // 房间 ID。
  int32 tableno = 3;                // 桌号。
  bool is_trustee = 4;              // SET_TRUSTEE 时表示目标托管状态。
  UnoActionCommand action = 5;      // 质疑、放弃质疑或喊 UNO。
  // UNO 没有客户端主动托管请求；托管由服务端在连续超时后自动设置。
}
```

托管动作枚举：

```text
UNO_ACTION_COMMAND_CHALLENGE_WILD4
UNO_ACTION_COMMAND_DECLINE_WILD4
UNO_ACTION_COMMAND_DECLARE_UNO
```

真人连续超时：

```text
第 1 次：系统自动使用托管出牌逻辑，不显示托管
第 2 次：系统自动使用托管出牌逻辑，不显示托管
第 3 次：系统自动出牌，并标记为托管
```

配置：

```json
"autoPlayBeforeTrustee": 3
```

## 13. 结算

结束条件：

```text
某玩家手牌清空
或整局超过 roundTimeoutMs
```

结算通知：

```text
GN_C_UNO_GAME_RESULT
```

结构：

```protobuf
UnoGameResultNotify {
  int32 roomid = 1;                 // 结算房间 ID。
  int32 tableno = 2;                // 结算桌号。
  int32 winner_userid = 3;          // 第一名玩家 ID。
  int32 winner_chairno = 4;         // 第一名座位号。
  UnoGameEndReason end_reason = 7;  // 手牌清空、牌堆耗尽或 3 分钟超时。
  repeated UnoPlayerResult players = 10; // 全部玩家的结算明细。
}

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

结算金币：

```text
第 3、4 名实际扣款 = min(手牌分, 当前余额)
奖池 = 第 3、4 名实际扣款之和
第 1、2 名从实际奖池分配
```

真人：

```text
coin_delta
  → RefreshGameResult
  → TransmitNotify2CheckSvr(10010012, result)
```

机器人：

```text
coin_delta
  → caiirobotsvr
  → Robot::deposit_
  → RobotGainDeposit / RobotBackDeposit
```

## 13. 结算后释放桌子

```text
SetGameEnd()
  → kTableEnding
  → UnoGameRoom::CheckTablesStart()
  → DissolveTable(kDissolveGameEnd)
  → GN_C_TABLE_DISSOLVED
  → 清理玩家和机器人
  → ResetTable()
  → 桌子恢复可用
```

## 14. 必须避免的 Carrom 逻辑

UNO 不能调用：

```text
GameTable::GiveUp()
GameTable::GameOver()
GameTable::PayForEntryFee()
GameTable::CommitFinalResult()
GameBoutData
ResetPucks()
物理参数和击球逻辑
```

当前仍存在的 Carrom 公共/历史代码：

```text
GameTable 基类
GameTable::BindPlayer
GameTable::NotifyPlayers
GameTable::DissolveTable
GameTable::ResetTable
CallRobot / RobotEnterGame 基础协议
```

这些代码需要继续逐步替换为 UNO 专用实现，尤其是：

```text
UnoGameTable::ResetTable()
UnoGameTable 的桌子解散流程
UNO 专用机器人召唤协议
```

## 15. 协议合并建议

目前字段存在一定重复，建议先按以下职责保留，不要直接删除字段：

### `UnoTablePublicState` 与 `UnoTurnChangedNotify`

两者有重复的回合字段，但职责不同：

```text
UnoTablePublicState
  → 完整公共快照，用于进入、重连和状态恢复

UnoTurnChangedNotify
  → 轻量回合变化通知，用于客户端立即切换当前操作玩家和倒计时
```

后续如果希望简化协议，可以删除 `UnoTurnChangedNotify`，统一只发送 `UnoTableStateNotify.public_state`，但客户端需要从完整状态中刷新所有 UI。

### `UnoHandUpdateNotify` 与 `UnoPrivateState`

```text
UnoHandUpdateNotify
  → 服务端主动推送私有状态

UnoPrivateState
  → 被多个响应复用的私有状态结构
```

不建议删除 `UnoPrivateState`，因为 `UnoPlayCardResp`、`UnoDrawCardResp`、`UnoTableQueryResp` 都需要返回请求玩家自己的状态。

### `UnoTableQueryResp` 与进入响应

当前 `GR_C_UNO_ENTER` 和 `GR_C_UNO_TABLE_QUERY` 都使用：

```text
UnoTableQueryReq / UnoTableQueryResp
```

这是可以保留的合并方式：进入和重连本质上都是“获取当前 UNO 桌面状态”。

### `UnoActionResp` 与各专用响应

```text
UnoPlayCardResp
UnoDrawCardResp
UnoPassAfterDrawResp
UnoActionResp
```

目前不建议立即合并，因为摸牌响应有：

```text
drawn_card
can_play_drawn_card
```

而出牌响应和托管响应没有这些字段。可以继续共享 `UnoTablePublicState` 和 `UnoPrivateState`，保留不同请求的专用响应。

### 动作通知和状态通知

推荐保留：

```text
GN_C_UNO_ACTION_NTF
  → 播放动作动画

GN_C_UNO_TURN_CHANGED
  → 更新回合和倒计时

GN_C_UNO_TABLE_STATE
  → 公共状态快照

GN_C_UNO_HAND_UPDATE
  → 私有手牌和可出牌列表
```

它们虽然都在一次操作后发送，但客户端用途不同。若合并，客户端需要从一个大协议中自行判断动作、回合、公共状态和私有状态变化，反而会降低可维护性。
