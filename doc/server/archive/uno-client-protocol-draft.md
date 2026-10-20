# UNO 客户端通讯协议草案

本文是 UNO 完全替换 Carrom 后，`caiisvr <-> 客户端` 的第一版通讯协议草案。

目标：

```text
1. 保留现有 GameClient socket 链路：客户端 -> caiimpsvr -> caiisvr。
2. 保留现有 GR/GN 协议号风格。
3. 新增 UNO 专用协议号和 PB 结构。
4. 服务端权威维护牌局状态。
5. 客户端只提交操作请求，服务端校验并广播结果。
```

---

## 1. 设计决策

### 1.1 UNO 完全替换 Carrom

```text
UNO 是唯一核心对局。
不做 Carrom / UNO 双玩法并存。
```

因此：

```text
GR_C_SYNC_PUCK_DATA
GR_C_SHOOT
GR_C_SHOOT_ACK
GR_C_CONTROL_ACK
GN_C_SYNC_PUCK_NOTIFY
GN_C_STRIKER_MOVE
GN_C_STRIKER_POWER
GN_C_STRIKER_SHOOT
GN_C_PUCK_HOLED_LEVEL_NOTIFY
```

这些 Carrom 物理同步协议在 UNO 第一版中不再使用。

### 1.2 进游戏协议可复用

保留现有：

```cpp
GR_C_ENTER_GAME
GR_C_LEAVE_GAME
GR_C_PULSE
GR_C_GAME_READY / GN_C_GAME_READY     // 如果仍需要准备阶段，可复用
GN_C_PLAYER_ENTER
GN_C_PLAYER_LEAVE
GN_C_PLAYER_DISCONNECT
GN_C_PLAYER_CONTINUE
GN_C_TABLE_DISSOLVED
```

`EnterGameResp.table_info` 可以承载 UNO 桌面快照，或者也可以在进桌后单独下发 `GN_C_UNO_TABLE_STATE` + `GN_C_UNO_HAND_UPDATE`。

推荐第一版：

```text
EnterGameResp 只返回基础 roomid/tableno/table_status。
UNO 完整桌面状态通过 GN_C_UNO_TABLE_STATE 下发。
玩家自己的手牌通过 GN_C_UNO_HAND_UPDATE 单独下发。
```

这样避免在旧 `EnterGameResp.table_info` 里塞太多新语义。

---

## 2. 协议号规划

现有游戏协议基准：

```cpp
GR_CAII_CHATLIVE_BASE = GR_CAII_REQUEST_COMMON + 5000
```

已有占用：

```text
+1 ~ +237    游戏通用 / Carrom / 桌子通知
+300 ~ +305  Chat
+400 ~ +504  机器人 / Carrom robot
+1000+       Live
```

建议 UNO 使用：

```text
GR_CAII_CHATLIVE_BASE + 600 ~ +699
```

### 2.1 客户端请求/响应

建议添加到：

```text
caii-server/common/request_enum.h
```

```cpp
// -------------------------------------------- UNO -------------------------------------------------------------
GR_C_UNO_TABLE_QUERY      = GR_CAII_CHATLIVE_BASE + 600,  // 查询/重连 UNO 桌面状态
GR_C_UNO_PLAY_CARD        = GR_CAII_CHATLIVE_BASE + 601,  // 出牌
GR_C_UNO_DRAW_CARD        = GR_CAII_CHATLIVE_BASE + 602,  // 摸牌
GR_C_UNO_PASS_AFTER_DRAW  = GR_CAII_CHATLIVE_BASE + 603,  // 摸牌后不出，结束回合
GR_C_UNO_CHALLENGE_WILD4  = GR_CAII_CHATLIVE_BASE + 604,  // 质疑 +4
GR_C_UNO_DECLINE_WILD4   = GR_CAII_CHATLIVE_BASE + 605,  // 不质疑 +4
GR_C_UNO_DECLARE_UNO      = GR_CAII_CHATLIVE_BASE + 606,  // 喊 UNO
GR_C_UNO_SET_TRUSTEE      = GR_CAII_CHATLIVE_BASE + 607,  // 托管开关
GR_C_UNO_ENTER            = GR_CAII_CHATLIVE_BASE + 608,  // 真实登录用户进入 UNO，服务端校验 token
// GR_C_UNO_AUTO_HINT      = GR_CAII_CHATLIVE_BASE + 604,  // 可选：请求服务端提示可出牌；第一版建议不做
// GR_C_UNO_SET_TRUSTEE    = GR_CAII_CHATLIVE_BASE + 605,  // 手动开关托管；至少需要支持取消托管
```

说明：

- `GR_C_UNO_PASS_AFTER_DRAW` 用于“摸到可出的牌但玩家选择不出”的情况，第一版需要保留。
- Unity 正式客户端不使用 4510 HTTP 调试接口，走 `NetworkClient -> YXTcpClient -> TcpCodec -> caiisvr:4501`。
- `GR_C_UNO_DEBUG_ENTER` 仅保留给 UNO Web fake user 测试；真实 Unity 玩家使用 `GR_C_UNO_ENTER`，服务端校验 socket token 与 userid 一致。
- `GR_C_UNO_AUTO_HINT` 是给客户端请求“哪些牌可出”的自动提示接口，例如高亮可出牌；第一版建议不做独立请求，因为 `GN_C_UNO_HAND_UPDATE.playable_card_ids` 已经可以下发可出牌列表。

### 2.2 服务端通知

```cpp
GN_C_UNO_MATCH_STATE      = GR_CAII_CHATLIVE_BASE + 620,  // 匹配/等待状态通知
GN_C_UNO_GAME_START       = GR_CAII_CHATLIVE_BASE + 621,  // UNO 开局通知，公共信息
GN_C_UNO_TABLE_STATE      = GR_CAII_CHATLIVE_BASE + 622,  // UNO 桌面公共状态快照
GN_C_UNO_HAND_UPDATE      = GR_CAII_CHATLIVE_BASE + 623,  // 单个玩家私有手牌更新，只发给本人
GN_C_UNO_ACTION_NTF       = GR_CAII_CHATLIVE_BASE + 624,  // 出牌/摸牌/惩罚/跳过等动作广播
GN_C_UNO_TURN_CHANGED     = GR_CAII_CHATLIVE_BASE + 625,  // 当前行动玩家变化
GN_C_UNO_GAME_RESULT      = GR_CAII_CHATLIVE_BASE + 626,  // UNO 本轮结算
GN_C_UNO_ERROR_NTF        = GR_CAII_CHATLIVE_BASE + 627,  // 可选：异步错误/强制同步
GN_C_UNO_TRUSTEE_STATE    = GR_CAII_CHATLIVE_BASE + 628,  // 托管状态通知
```

### 2.3 机器人内部协议

机器人上桌协议暂时复用现有：

```cpp
GN_C_CALL_ROBOT
GR_C_ROBOT_ENTERGAME
```

UNO 回合内机器人协议建议新增：

```cpp
GN_C_UNO_ROBOT_STATE      = GR_CAII_CHATLIVE_BASE + 650,  // caiisvr -> caiirobotsvr，机器人私有状态/轮到机器人
```

机器人出牌/摸牌可以直接复用客户端请求：

```cpp
GR_C_UNO_PLAY_CARD
GR_C_UNO_DRAW_CARD
GR_C_UNO_PASS_AFTER_DRAW
```

原因：机器人在 UNO 中和真人玩家的操作语义一致，只是请求来自 `caiirobotsvr`。

---

## 3. PB 文件建议

建议新增文件：

```text
caii-server/pb/game/uno.proto
```

包名建议：

```proto
package game.uno;
```

不建议继续放在 `package game.carrom`，因为 UNO 完全替换 Carrom，语义已经不同。

---

## 4. UNO PB 草案

```proto
syntax = "proto3";
package game.uno;

// ======================= 基础枚举 =======================

enum UnoColor {
  UNO_COLOR_UNKNOWN = 0;
  UNO_COLOR_RED = 1;
  UNO_COLOR_YELLOW = 2;
  UNO_COLOR_GREEN = 3;
  UNO_COLOR_BLUE = 4;
  UNO_COLOR_WILD = 5;      // 仅表示黑牌本身颜色；当前指定颜色不能是 WILD
}

enum UnoCardType {
  UNO_CARD_TYPE_UNKNOWN = 0;
  UNO_CARD_TYPE_NUMBER = 1;
  UNO_CARD_TYPE_SKIP = 2;
  UNO_CARD_TYPE_REVERSE = 3;
  UNO_CARD_TYPE_DRAW_TWO = 4;
  UNO_CARD_TYPE_WILD = 5;
  UNO_CARD_TYPE_WILD_DRAW_FOUR = 6;
}

enum UnoDirection {
  UNO_DIRECTION_CLOCKWISE = 0;
  UNO_DIRECTION_COUNTER_CLOCKWISE = 1;
}

enum UnoTableStatus {
  UNO_TABLE_STATUS_UNKNOWN = 0;
  UNO_TABLE_STATUS_MATCHING = 1;      // 等待真人/机器人补位
  UNO_TABLE_STATUS_PLAYING = 2;       // 牌局中
  UNO_TABLE_STATUS_ROUND_END = 3;     // 本轮结束
  UNO_TABLE_STATUS_DISSOLVED = 4;     // 桌子解散
}

enum UnoActionType {
  UNO_ACTION_UNKNOWN = 0;
  UNO_ACTION_PLAY_CARD = 1;
  UNO_ACTION_DRAW_CARD = 2;
  UNO_ACTION_DRAW_PENALTY = 3;
  UNO_ACTION_SKIP = 4;
  UNO_ACTION_REVERSE = 5;
  UNO_ACTION_CHOOSE_COLOR = 6;
  UNO_ACTION_PASS = 7;
  UNO_ACTION_AUTO_UNO = 8;
  UNO_ACTION_ROUND_END = 9;
}

// ======================= 基础结构 =======================

message UnoCard {
  int32 card_id = 1;          // 单局内唯一 ID，服务端生成
  UnoColor color = 2;         // 普通牌为红黄绿蓝；万能牌为 WILD
  UnoCardType type = 3;
  int32 number = 4;           // 数字牌 0-9；非数字牌为 -1 或 0，建议服务端统一填 -1
}

message UnoPlayerPublicInfo {
  int32 userid = 1;
  int32 chairno = 2;          // 1-4
  int32 user_type = 3;        // 沿用 USER_TYPE_ROBOT 等 bit
  int32 card_count = 4;       // 对其他玩家只展示手牌数量
  int32 round_score = 5;      // 当前轮得分，第一版可为 0
  int32 total_score = 6;      // 多轮总分，第一版可为 0
  bool online = 7;
  bool is_robot = 8;
  bool is_trustee = 9;       // 是否处于托管状态；机器人也可始终视为自动操作

  string nick_name = 20;
  string country_actual = 21;
  bytes player_ex_info = 22;
}

message UnoTablePublicState {
  int32 roomid = 1;
  int32 tableno = 2;
  UnoTableStatus status = 3;

  repeated UnoPlayerPublicInfo players = 10;

  int32 current_userid = 20;        // 当前该谁行动
  int32 current_chairno = 21;
  UnoDirection direction = 22;

  UnoCard top_card = 30;            // 弃牌堆顶部牌
  UnoColor current_color = 31;      // 当前需要匹配的颜色；Wild 后由出牌者指定
  int32 draw_penalty_count = 32;    // +2/+4 叠加累计摸牌数；无惩罚为 0
  bool stacking_active = 33;        // 是否处于 +2/+4 叠加状态

  int32 draw_pile_count = 40;       // 剩余摸牌堆数量
  int32 discard_pile_count = 41;    // 弃牌堆数量

  int32 action_timeout_ms = 50;     // 单回合操作超时，第一版固定 30000ms
  int64 turn_deadline_ms = 51;      // 当前回合截止时间戳，毫秒；由服务端权威维护
  int32 turn_seq = 52;              // 回合序号，用于客户端去重/校验
}

message UnoPrivateState {
  int32 userid = 1;
  repeated UnoCard hand_cards = 2;
  repeated int32 playable_card_ids = 3;     // 服务端可选下发，方便客户端高亮
  bool must_draw = 4;                       // 当前无可出牌，需要摸牌
  bool under_draw_penalty = 5;              // 当前处于 +2/+4 惩罚响应中
  int32 draw_penalty_count = 6;
}

// ======================= 请求/响应 =======================

// GR_C_UNO_TABLE_QUERY
message UnoTableQueryReq {
  int32 userid = 1;
  int32 roomid = 2;
  int32 tableno = 3;
}

message UnoTableQueryResp {
  int32 code = 1;
  UnoTablePublicState public_state = 2;
  UnoPrivateState private_state = 3;        // 只包含请求者自己的手牌
}

// GR_C_UNO_PLAY_CARD
message UnoPlayCardReq {
  int32 userid = 1;
  int32 roomid = 2;
  int32 tableno = 3;
  int32 card_id = 4;

  // 出 Wild / Wild Draw Four 时必填，且只能为红黄绿蓝。
  UnoColor chosen_color = 5;

  // 客户端当前看到的 turn_seq，服务端可用于拒绝过期操作。
  int32 turn_seq = 10;
}

message UnoPlayCardResp {
  int32 code = 1;
  UnoTablePublicState public_state = 2;     // 可选：返回操作后的公共状态
  UnoPrivateState private_state = 3;        // 可选：返回自己的最新手牌
}

// GR_C_UNO_DRAW_CARD
message UnoDrawCardReq {
  int32 userid = 1;
  int32 roomid = 2;
  int32 tableno = 3;
  int32 turn_seq = 4;
}

message UnoDrawCardResp {
  int32 code = 1;
  UnoCard drawn_card = 2;                   // 只返回给摸牌玩家
  bool can_play_drawn_card = 3;             // 摸到的牌是否可立即出
  UnoTablePublicState public_state = 4;
  UnoPrivateState private_state = 5;
}

// GR_C_UNO_PASS_AFTER_DRAW
message UnoPassAfterDrawReq {
  int32 userid = 1;
  int32 roomid = 2;
  int32 tableno = 3;
  int32 turn_seq = 4;
}

message UnoPassAfterDrawResp {
  int32 code = 1;
  UnoTablePublicState public_state = 2;
}

// GR_C_UNO_AUTO_HINT 可选，第一版暂不做。
// 作用：客户端请求服务端计算哪些手牌当前可出，用于 UI 高亮/自动提示。
// 第一版可直接通过 UnoPrivateState.playable_card_ids 下发，因此不需要单独请求。
// message UnoAutoHintReq {
//   int32 userid = 1;
//   int32 roomid = 2;
//   int32 tableno = 3;
// }
//
// message UnoAutoHintResp {
//   int32 code = 1;
//   repeated int32 playable_card_ids = 2;
// }

// ======================= 服务端通知 =======================

// GN_C_UNO_MATCH_STATE
message UnoMatchStateNotify {
  int32 roomid = 1;
  int32 tableno = 2;
  int32 matched_real_player_count = 3;
  int32 target_player_count = 4;            // 第一版固定 4
  int32 wait_remaining_ms = 5;              // 10 秒倒计时剩余
  repeated UnoPlayerPublicInfo players = 6;
}

// GN_C_UNO_GAME_START
message UnoGameStartNotify {
  UnoTablePublicState public_state = 1;
}

// GN_C_UNO_TABLE_STATE
message UnoTableStateNotify {
  UnoTablePublicState public_state = 1;
}

// GN_C_UNO_HAND_UPDATE，只发给对应 userid
message UnoHandUpdateNotify {
  UnoPrivateState private_state = 1;
}

// GN_C_UNO_ACTION_NTF
message UnoActionNotify {
  UnoActionType action_type = 1;
  int32 userid = 2;                         // 执行动作的玩家
  int32 target_userid = 3;                  // 被影响玩家，如被跳过/摸牌者

  UnoCard card = 10;                        // 出牌时有值；摸牌广播时不带具体牌，可只填 type unknown
  UnoColor chosen_color = 11;               // Wild 指定颜色
  int32 draw_count = 12;                    // 摸牌数量或累计惩罚数量
  int32 card_count_after = 13;              // 动作后该玩家剩余手牌数

  UnoTablePublicState public_state = 20;    // 动作后的公共状态，便于客户端同步
}

// GN_C_UNO_TURN_CHANGED
message UnoTurnChangedNotify {
  int32 roomid = 1;
  int32 tableno = 2;
  int32 current_userid = 3;
  int32 current_chairno = 4;
  UnoDirection direction = 5;
  int32 turn_seq = 6;
  int64 turn_deadline_ms = 7;
  int32 draw_penalty_count = 8;
  bool stacking_active = 9;
}

enum UnoGameEndReason {
  UNO_GAME_END_REASON_UNKNOWN = 0;
  UNO_GAME_END_REASON_HAND_EMPTY = 1;       // 有玩家先出完
  UNO_GAME_END_REASON_DECK_EMPTY = 2;       // 牌堆用完，按剩余手牌分数判定
}

// GN_C_UNO_GAME_RESULT
message UnoGameResultNotify {
  int32 roomid = 1;
  int32 tableno = 2;
  int32 winner_userid = 3;
  int32 winner_chairno = 4;
  UnoGameEndReason end_reason = 7;

  repeated UnoPlayerResult players = 10;
}

message UnoPlayerResult {
  int32 userid = 1;
  int32 chairno = 2;
  repeated UnoCard left_cards = 3;          // 结算时可以公开所有剩余手牌
  int32 left_card_score = 4;
  int32 total_score = 5;
  bool is_winner = 6;
}

// GN_C_UNO_ERROR_NTF，可选
message UnoErrorNotify {
  int32 code = 1;
  string message = 2;
  UnoTablePublicState public_state = 3;
  UnoPrivateState private_state = 4;        // 如只发给本人，可带私有状态
}

// GN_C_UNO_TRUSTEE_STATE
message UnoTrusteeStateNotify {
  int32 roomid = 1;
  int32 tableno = 2;
  int32 userid = 3;
  bool is_trustee = 4;
  UnoTablePublicState public_state = 5;
}

// ======================= 机器人内部通知 =======================

// GN_C_UNO_ROBOT_STATE，caiisvr -> caiirobotsvr
message UnoRobotStateNotify {
  int32 robot_userid = 1;
  UnoTablePublicState public_state = 2;
  UnoPrivateState private_state = 3;        // 机器人自己的手牌
}
```

---

## 5. 客户端流程

### 5.1 进桌/等待

```text
客户端 -> GR_C_ENTER_GAME
服务端 -> EnterGameResp
服务端 -> GN_C_UNO_MATCH_STATE       // 等待真人/机器人补齐，可能多次
```

当 4 人凑齐，或者 10 秒到且至少 1 个真人时：

```text
服务端补机器人到 4 人
服务端发牌
服务端 -> GN_C_UNO_GAME_START        // 广播公共状态
服务端 -> GN_C_UNO_HAND_UPDATE       // 分别给每个玩家发自己的手牌
服务端 -> GN_C_UNO_TURN_CHANGED      // 通知第一个行动玩家，携带 30s 截止时间
```

### 5.2 回合倒计时与托管

第一版由服务器权威维护回合倒计时：

```text
每个玩家回合 30 秒。
服务端在回合开始时设置 action_timeout_ms = 30000 和 turn_deadline_ms。
客户端只根据通知展示倒计时。
客户端不能裁决超时。
```

如果 30 秒内玩家没有完成操作：

```text
服务端设置该玩家 is_trustee = true。
服务端广播 GN_C_UNO_TRUSTEE_STATE，客户端展示“托管中”。
服务端按机器人出牌逻辑自动帮该玩家行动。
```

托管自动出牌逻辑第一版与机器人一致：

```text
有功能牌就出功能牌。
没功能牌出同颜色牌。
再没有出同数字/同符号牌。
没有则摸牌。
摸到能出就出。
摸到不能出则结束回合。
```

第一版需要支持玩家手动取消托管：玩家一旦因超时进入托管，客户端必须展示“取消托管”按钮；点击后发送 `GR_C_UNO_SET_TRUSTEE(is_trustee=false)`，服务端将该玩家 `is_trustee=false` 并广播最新桌面状态。后续可扩展手动开启托管。

### 5.3 出牌

```text
当前玩家 -> GR_C_UNO_PLAY_CARD
服务端校验：
  是否轮到该玩家
  card_id 是否在该玩家手牌
  是否符合当前颜色/数字/符号/叠加状态
  Wild 是否带 chosen_color
服务端更新状态
服务端 -> UnoPlayCardResp 给请求者
服务端 -> GN_C_UNO_ACTION_NTF 广播
服务端 -> GN_C_UNO_HAND_UPDATE 给出牌者
服务端 -> GN_C_UNO_TURN_CHANGED 广播
```

### 5.4 摸牌

```text
当前玩家 -> GR_C_UNO_DRAW_CARD
服务端摸 1 张，加入该玩家手牌
服务端 -> UnoDrawCardResp，只给该玩家，包含 drawn_card 和 can_play_drawn_card
服务端 -> GN_C_UNO_ACTION_NTF 广播：某玩家摸了 1 张，但不公开具体牌
服务端 -> GN_C_UNO_HAND_UPDATE 给摸牌者
```

如果 `can_play_drawn_card = false`：

```text
服务端直接结束该玩家回合
服务端 -> GN_C_UNO_TURN_CHANGED
```

如果 `can_play_drawn_card = true`：

```text
玩家可以继续 GR_C_UNO_PLAY_CARD 出刚摸到的牌。
玩家也可以选择不出，发送 GR_C_UNO_PASS_AFTER_DRAW 结束回合。
```

已确认：

```text
玩家摸到后可以不出。
因此 GR_C_UNO_PASS_AFTER_DRAW 第一版需要实现。
```

### 5.5 +2/+4 叠加

当 `draw_penalty_count > 0` 且 `stacking_active = true`：

```text
当前玩家只能：
1. 出 Draw Two
2. 出 Wild Draw Four
3. 摸累计惩罚牌并跳过
```

流程：

```text
A 出 +2 -> draw_penalty_count = 2
B 出 +4 -> draw_penalty_count = 6，B 选择颜色
C 无 +2/+4 或选择不叠加 -> GR_C_UNO_DRAW_CARD
服务端让 C 摸 6 张并跳过
轮到 D
```

注意：叠加惩罚时的 `GR_C_UNO_DRAW_CARD` 表示摸累计惩罚，不是普通摸 1 张。

---

## 6. 需要客户端注意的数据隔离

### 6.1 所有人可见

```text
玩家列表
每个玩家手牌数量
当前玩家
当前方向
当前玩家回合截止时间/剩余倒计时
玩家是否托管
顶部弃牌
当前颜色
剩余牌堆数量
弃牌堆数量
累计惩罚数量
最近动作
结算时所有剩余手牌
```

### 6.2 只给本人

```text
自己的完整手牌
自己可出牌列表
自己摸到的具体牌
```

### 6.3 永不下发给客户端

```text
其他玩家未结算前的具体手牌
摸牌堆顺序
未公开的随机结果
```

---

## 7. 错误码建议

第一版可以先沿用现有 `code`，同时补充 UNO 局内错误码。

建议范围：

```text
UNO_ERROR_BASE = 30000
```

```cpp
UNO_OK = 0
UNO_ERR_NOT_IN_TABLE = 30001
UNO_ERR_NOT_YOUR_TURN = 30002
UNO_ERR_CARD_NOT_IN_HAND = 30003
UNO_ERR_CARD_NOT_PLAYABLE = 30004
UNO_ERR_INVALID_CHOSEN_COLOR = 30005
UNO_ERR_INVALID_TABLE_STATUS = 30006
UNO_ERR_INVALID_TURN_SEQ = 30007
UNO_ERR_DRAW_NOT_ALLOWED = 30008
UNO_ERR_STACKING_ONLY_DRAW_CARD = 30009
UNO_ERR_INTERNAL_STATE = 30010
```

---

## 8. 第一版建议最终确认点

正式落地前建议确认这 4 个点：

1. 初始牌如果翻到功能牌，已确认：必须重新翻到数字牌。
2. 玩家摸到可出牌后，已确认：可以不出，因此需要 `GR_C_UNO_PASS_AFTER_DRAW`。
3. `GR_C_UNO_AUTO_HINT` 是自动提示/高亮可出牌接口，已确认：第一版不需要单独做，使用 `UnoPrivateState.playable_card_ids` 即可。
4. 结算已确认：第一版只做单轮。谁先出完谁赢；如果牌堆用完，按手里剩余牌分数判定胜负。
5. 已确认：服务端权威维护回合倒计时；当前 Web/dev 节奏为每人 10 秒；超时进入托管；服务端按机器人逻辑自动出牌；客户端展示托管状态，并提供“取消托管”按钮。
6. 牌堆用完时如果最低分并列，仍需确认并列规则。
