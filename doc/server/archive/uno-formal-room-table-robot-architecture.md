# UNO 正式房间、桌子与机器人架构

## 1. 目标

UNO Web 只用于玩法测试；正式 Unity 客户端使用真实大厅登录、真实 userid、socket/PB 协议和正式游戏桌。

目标链路：

```text
Unity LoginScene / LobbyClient
  -> caiisvr socket
  -> check/block 正式校验
  -> UnoGameRoom
  -> UnoGameTable
  -> UnoGame 规则引擎
  -> caiirobotsvr（真实机器人）
```

## 2. 领域对象

### UnoGame

纯 UNO 规则状态机，不负责：

- 大厅登录
- 房间匹配
- socket 生命周期
- 机器人账号管理
- 金币/经验结算

负责：

- 牌堆、弃牌堆、手牌
- 当前颜色、方向、行动轮次
- 出牌、摸牌、Pass
- +2/+4 叠加
- +4 质疑
- UNO 喊牌与漏喊罚 2
- 托管状态下的规则动作
- 回合结束和本轮结果

### UnoGameTable

正式桌子，继承现有 `GameTable` 生命周期，持有一个 `UnoGame`。

负责：

- 真人玩家坐下/离开/断线/重连
- 桌椅分配
- 桌面状态广播
- UNO socket 请求转换为 `UnoGame` 操作
- 开局、结束、结算、桌子重置
- 向 caiirobotsvr 请求机器人补位
- 向 caiirobotsvr 推送机器人私有状态和回合通知

不负责：

- 自己创建机器人账号
- 自己执行机器人 AI

### UnoGameRoom

正式 UNO 房间，继承现有 `GameRoom`。

负责：

- 创建和管理 `UnoGameTable`
- 真人匹配池
- 等级差匹配窗口
- 机器人补位时机
- 正式 EnterGame/ContinueGame
- 将机器人绑定到空桌
- 桌子回收

历史方案曾建议使用 `roomid=<historical-test-roomid>`；当前实现不得硬编码 roomid，应使用大厅/服务端下发的房间配置。

### UnoRobot

`caiirobotsvr` 中的 UNO 机器人状态和决策对象。

负责：

- 机器人登录后的 UNO 桌状态
- 私有手牌
- 可出牌列表
- 当前回合和惩罚链
- 2–6 秒思考延迟
- 出牌、摸牌、Pass
- Wild/+4 选色
- 自动 UNO
- 默认质疑 +4

不负责：

- 牌堆和最终规则裁决
- 发牌
- 结算
- 直接修改桌面公共状态

所有机器人动作必须回到 `caiisvr -> UnoGameTable -> UnoGame` 校验。

## 3. 正式匹配规则

配置来源继续使用：

```text
caiisvr/caiisvr/config/uno_level_config.json
```

规则：

```text
0–8 秒：等级差 <= 5
8–12 秒：等级差 <= 10
超过 12 秒：开始机器人补位
每 1–3 秒补 1 个机器人
```

真人进入匹配池后：

1. 优先进入符合等级窗口的等待桌。
2. 桌子未满时允许继续加入真人。
3. 机器人补位阶段仍允许符合规则的真人加入。
4. 满 4 人后进入开局等待延迟。
5. 正式桌满员后只由 `UnoGameTable` 开局。

## 4. caiisvr 与 caiirobotsvr 协议

### caiisvr -> caiirobotsvr

新增 UNO 机器人消息：

```text
GN_C_UNO_CALL_ROBOT
GN_C_UNO_GAME_START
GN_C_UNO_TABLE_STATE
GN_C_UNO_HAND_UPDATE
GN_C_UNO_TURN_CHANGED
GN_C_UNO_GAME_RESULT
GN_C_UNO_ROBOT_RELEASE
```

### caiirobotsvr -> caiisvr

新增 UNO 机器人请求：

```text
GR_C_UNO_ROBOT_ENTER
GR_C_UNO_PLAY_CARD
GR_C_UNO_DRAW_CARD
GR_C_UNO_PASS_AFTER_DRAW
GR_C_UNO_CHALLENGE_WILD4
GR_C_UNO_DECLINE_WILD4
GR_C_UNO_DECLARE_UNO
GR_C_UNO_SET_TRUSTEE
GR_C_UNO_ROBOT_LEAVE
```

机器人请求与真人请求使用相同的 UNO 规则语义；区别只有消息来源必须经过机器人 socket/token 校验。

## 5. 断线与托管

真人断线：

```text
UnoGameTable 保留座位和手牌
  -> player.online=false
  -> player.is_trustee=true
  -> caiisvr 继续控制回合
```

真人重连：

```text
真实 token 校验
  -> ContinueGame
  -> 恢复 UnoGameTable
  -> 下发公共状态和本人私有手牌
  -> 取消托管
```

机器人断线：

```text
桌子暂停/进入机器人重连等待
  -> 超时则由 caiirobotsvr 回收并重新补位
```

## 6. 结算和回收

本轮结束：

```text
ROUND_END
  -> 广播 UnoGameResult
  -> 结算经验/积分/金币（正式接入时）
  -> 保留短暂结算状态
  -> 回收机器人
  -> 重置或释放 UnoGameTable
```

开发阶段建议 ROUND_END 保留 3–10 秒后回收；正式时由结算确认和桌子生命周期决定。

## 7. 迁移边界

保留：

```text
UnoDebugTable
```

用途仅限：

- UNO Web fake user
- HTTP 玩法测试
- 规则回归测试

新增正式实现：

```text
caiisvr/uno/uno_game_room.h/.cpp
caiisvr/uno/uno_game_table.h/.cpp
caiirobotsvr/robot/uno_robot.h/.cpp
```

正式 Unity 客户端不得调用 `4510 HTTP` 或 `GR_C_UNO_DEBUG_ENTER`。

## 8. 实施顺序

1. 抽取/稳定 UNO 公共 PB 与 request enum。
2. 实现 `UnoGameTable`，接入 `GameTable` 生命周期。
3. 实现 `UnoGameRoom`，接入正式房间创建和匹配。
4. 实现 caiisvr 机器人召唤、进入、回收协议。
5. 实现 `UnoRobot` 和机器人 AI。
6. 切换 Unity 正式 EnterGame 到 `UnoGameRoom`。
7. 增加正式结算和数据库经验/积分。
8. 用 uno-web 做规则回归，不再作为正式入口。

## 9. 当前明确决策

- 正式对象名称：`UnoGameRoom`、`UnoGameTable`、`UnoRobot`。
- 规则核心继续复用当前 `UnoGame`。
- 正式 Unity 使用 socket/PB，不使用 HTTP。
- UNO Web 保留 HTTP，仅用于玩法测试。
- roomid 不固定，由大厅/服务端房间配置下发；`<historical-test-roomid>` 仅是历史测试值。
- 正式机器人由 `caiirobotsvr` 提供，caiisvr 不再执行正式机器人 AI。
