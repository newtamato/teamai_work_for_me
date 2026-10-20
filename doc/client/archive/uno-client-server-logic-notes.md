# UNO 客户端与服务端逻辑整理

> 记录近期 UNO 四人历史测试房间版本的协议、通知、客户端渲染和服务端生命周期逻辑，便于后续排查与扩展。

## 1. 项目与运行环境

- 客户端：`UnoOnline-Client`
- 服务端：`192.168.53.48:/root/projects/caii-server`
- 历史测试房间示例：`<historical-test-roomid>`（当前 roomid 不固定）
- 固定桌型：四人桌
- 入场费：0
- 单局最长时间：3 分钟
- 服务端程序：`bin/x64/Debug/caiisvr`
- 匹配/管理程序：`caiisvrmp`

服务端重启：

```bash
cd /root/projects/caii-server/bin/x64/Debug
nohup ./caiisvr > /tmp/caiisvr-uno.log 2>&1 &
nohup ./caiisvrmp > /tmp/caiisvrmp.log 2>&1 &
```

检查进程：

```bash
pgrep -af 'caiisvr|caiisvrmp'
```

## 2. 核心设计原则

1. **动作响应只返回 `code`**。动作结果不依赖响应体，使用独立通知广播。
2. **客户端按通知类型分别监听**，UNO 场景不依赖统一 `StateReceived` 驱动界面。
3. **公共状态和私有状态分离**：公共状态可广播，手牌和真实摸牌只发送给本人。
4. **可出牌列表以 `TurnChangedNotify.playable_card_ids` 为准**。
5. **真实牌面只发送给拥有该牌的玩家，其他玩家只显示牌背**。
6. **卡牌资源通过 Addressables 加载**，代码不再给卡牌涂色。
7. **自己出牌时复用原手牌对象**，避免同时出现原手牌和飞行牌残影。

## 3. 服务端主要流程

核心文件：

- `caiisvr/uno/uno_game.cpp`
- `caiisvr/uno/uno_game_table.cpp`
- `caiisvr/uno/uno_game_table.h`
- `pb/game/uno.proto`

### 3.1 入场和开局

1. 玩家进入大厅/服务端下发的 UNO 房间；`roomid` 不应硬编码。
2. 匹配满足四人后，不足玩家由机器人补位。
3. 服务端创建牌局并发牌。
4. 发送：
   - `GameStartNotify`
   - `TableStateNotify`
   - 当前玩家的 `HandUpdateNotify`
   - `TurnChangedNotify`
5. `TableStateNotify.public_state.top_card` 用于初始化弃牌堆。

### 3.2 出牌

服务端验证：

- 是否当前玩家；
- `turn_seq` 是否匹配；
- 卡牌是否在玩家手牌；
- 是否符合当前颜色、数字或功能牌规则；
- UNO、+2、+4、质疑和惩罚状态。

成功后通过 `UnoPlayCardNotify` 广播：

- 出牌玩家 ID；
- 真实牌面；
- 选择后的颜色；
- 出牌后手牌数；
- 新弃牌顶牌；
- 下一回合相关状态。

随后发送 `TurnChangedNotify`。

### 3.3 摸牌

普通摸牌使用 `UnoDrawCardNotify`：

- 所有玩家收到摸牌数量和受影响玩家；
- 受影响玩家额外收到 `drawn_cards` 真实牌面；
- 其他玩家的 `drawn_cards` 为空；
- `can_play_drawn_card` 表示最后摸到的牌是否允许立即出牌。

客户端行为：

- 本人：真实牌面飞入 `CardArea`；
- 其他人：牌背飞向对应玩家的对方手牌区域；
- 若可以立即出牌，最后一张牌保留在手牌区并弹出“出牌/不出”窗口。

### 3.4 +4 质疑和接受惩罚

`ChallengeWild4Notify` 和 `DeclineWild4Notify` 均包含：

```protobuf
repeated UnoCard drawn_cards
```

字段规则：

- 被惩罚玩家：包含真实摸到的牌；
- 其他玩家：字段为空，但仍有 `penalty_count`。

服务端现在直接把惩罚摸牌信息放在对应结果通知中，**不再额外发送 `UnoDrawCardNotify`**，避免客户端重复播放动画。

服务端通过逐玩家发送个性化通知实现隐私隔离：

```cpp
for (const auto player_id : uno_game_.userids()) {
    auto personalized = notify;
    if (player_id == penalty_userid) {
        // 填充 drawn_cards
    }
    NotifyOnePlayer(player_id, protocol, personalized);
}
```

### 3.5 漏喊 UNO 惩罚

`UnoMissedUnoPenaltyNotify` 已有：

```protobuf
repeated UnoCard penalty_cards
```

当前客户端会把该通知转换为一次摸牌动画：

- 被罚玩家使用真实 `penalty_cards`；
- 其他玩家使用牌背；
- 被罚玩家的私有手牌同步刷新。

### 3.6 托管

托管动作使用 `UnoActionReq.is_trustee`。

服务端收到成功动作后发送 `UnoTrusteeStateNotify`：

- 玩家 ID；
- `is_trustee`；
- 公共状态。

断线时服务端自动设置托管，并广播托管通知。

### 3.7 回合超时和结算

- 回合截止时间：`TurnChangedNotify.turn_deadline_ms`；
- 单局截止时间：公共状态中的 `round_deadline_ms`；
- 超时由服务端处理托管或自动动作；
- 结算发送 `UnoGameResultNotify`。

结算结果包括：

- 获胜者；
- 玩家名次；
- 剩余手牌分 `left_card_score`；
- 金币变化 `coin_delta`；
- 是否获胜 `is_winner`。

## 4. 客户端通知链路

核心文件：

- `Assets/Scripts/UNO/UnoNetworkClient.cs`
- `Assets/Scripts/UNO/UnoGameScene.cs`
- `Assets/Scripts/UNO/UnoCardVisual.cs`
- `Assets/Scripts/UNO/UnoCardFlyInController.cs`
- `Assets/Scripts/UNO/UnoCardFlyOutController.cs`
- `Assets/Scripts/UNO/CountDownTimer.cs`
- `Assets/Scripts/UNO/UnbiasedTime.cs`

### 4.1 事件映射

| 网络通知 | 客户端事件 | 场景处理 |
|---|---|---|
| `GameStartNotify` | `GameStartReceived` | 初始化公共状态 |
| `TableStateNotify` | `TableStateReceived` | 初始化桌面、弃牌顶牌 |
| `TurnChangedNotify` | `TurnChangedReceived` | 更新回合标识、倒计时和可出牌状态 |
| `HandUpdateNotify` | `HandUpdateReceived` | 重建本人手牌 |
| `PlayCardNotify` | `PlayCardAnimationReceived` | 播放出牌动画 |
| `DrawCardNotify` | `DrawCardAnimationReceived` | 播放摸牌动画 |
| `ChallengeWild4Notify` | 当前通知事件 | 播放质疑惩罚摸牌 |
| `DeclineWild4Notify` | 当前通知事件 | 播放接受惩罚摸牌 |
| `MissedUnoPenaltyNotify` | 内部转换为摸牌动画 | 播放漏喊 UNO 惩罚 |
| `TrusteeStateNotify` | `TrusteeStateReceived` | 更新托管按钮 |
| `GameResultNotify` | `GameResultReceived` | 显示结算面板 |

### 4.2 手牌和可出牌提示

`HandUpdateNotify` 负责提供完整手牌快照。

`TurnChangedNotify` 负责提供当前回合的：

- `playable_card_ids`；
- `can_draw`；
- 回合截止时间。

客户端必须在两个通知到达顺序不确定的情况下工作：

1. 保存最新 `privateState`；
2. 收到 `HandUpdateNotify` 时创建手牌；
3. 收到 `TurnChangedNotify` 时更新 `privateState.PlayableCardIds`；
4. 重新刷新所有手牌的透明度、描边、缩放和按钮可用状态。

因此不能只在手牌创建时判断 `PlayableCardIds`。

### 4.3 卡牌父节点约定

- 本人手牌：`CardArea`
- 对手手牌背区域：
  - `PlayersTop/cards`
  - `PlayersLeft/cards`
  - `PlayersRight/cards`
- 弃牌：`Playfield/DiscardPile`
- 牌堆：`Playfield/DrawPile`

动画完成后必须修改父节点：

- 摸牌保留牌：设置父节点为 `CardArea`；
- 出牌保留牌：设置父节点为 `DiscardPile`。

否则会出现牌视觉位置正确但层级错误、布局不更新或后续清理不到的问题。

### 4.4 Addressables

卡牌视觉由 `UnoCardVisual.Apply()` 根据卡牌类型加载：

- 数字牌背景：`atlas_cardfront_0__card_front_Bg_1` ～ `Bg_4`；
- 数字图标：`atlas_cardfront_0__card_0` ～ `card_9`；
- 功能图标：`add2`、`add4`、`stop`、`anticlockwise`、`trasformcorlor`；
- 其他玩家牌背：`atlas_cardfront_0__card_back`。

`Apply(null)` 表示隐藏牌面信息并加载牌背。

### 4.5 回合标识

`UnoCanvas` 中的结构是：

```text
PlayersTop
└── PlayerTopFrame
    └── turn_sign
```

其他三个座位结构相同。

客户端通过：

```csharp
seat.Find("turn_sign")
```

绑定四个标识，根据 `VisualSeatForChair()` 找到当前玩家的视觉座位，只显示对应的 `turn_sign`。

### 4.6 回合倒计时

`TurnTimer` 使用 `CountDownTimer`：

```csharp
timer.UpdateTime(TimeSpan.FromMilliseconds(remainingMs));
```

调用方只提供剩余时间跨度，组件内部通过：

```csharp
UnbiasedTime.Instance.Now().Add(span)
```

计算截止时间。

`UnbiasedTime` 使用 `CfFramework.Singleton<UnbiasedTime>`，不要再使用已移除的 `QFramework.Singleton`。

### 4.7 托管按钮

`CallButton` 当前作为“取消托管”按钮：

- 非托管：隐藏；
- 已托管：显示；
- 点击后发送 `SetTrustee(false)`，并立即隐藏；
- 服务端通知负责同步最终状态。

## 5. 结算面板

`UnoCanvas.prefab` 中固定包含：

```text
ResultPanel
├── ResultTitle
├── ResultHeader
├── ResultRow1
├── ResultRow2
├── ResultRow3
└── ResultRow4
```

`UnoGameScene` 只更新这些固定文本，不再运行时创建 UI。

排序优先使用服务端下发的 `rank`，没有 rank 时才按剩余手牌分升序排序。

## 6. 常见问题排查

### 6.1 收到通知但没有手牌

检查：

1. 是否触发了 `HandUpdateReceived`；
2. `privateState` 是否被局部变量遮蔽；
3. `CardArea` 是否为空；
4. `HandCards` 是否包含新增牌；
5. 牌是否被动画完成后的清理逻辑删除。

### 6.2 其他玩家看到了真实牌面

检查服务端是否按玩家个性化填充 `drawn_cards`。除受罚/摸牌玩家外，其他通知的 `drawn_cards` 必须为空。

### 6.3 惩罚牌重复飞行

检查是否同时发送了：

- `ChallengeWild4Notify` / `DeclineWild4Notify`；
- `UnoDrawCardNotify`。

新逻辑中质疑和接受 +4 只发送结果通知，不再发送额外 `UnoDrawCardNotify`。

### 6.4 可出牌没有高亮

检查：

- `TurnChangedNotify.playable_card_ids` 是否有内容；
- `TurnChangedReceived` 是否把列表写入 `privateState`；
- 是否调用 `RefreshHandCardStates()`；
- 是否因为通知顺序导致使用了旧状态。

### 6.5 回合标识全部显示

检查：

- `turnSigns` 四个引用是否分别指向四个 `PlayerXFrame/turn_sign`；
- `UpdateTurnIndicators()` 是否先隐藏四个数组元素；
- `VisualSeatForChair()` 的座位映射是否正确；
- Unity 场景中是否存在重复的 `UnoCanvas` 实例。

### 6.6 飞牌残影

检查：

- `CardArea`、`DiscardPile` 是否使用有效 Camera；
- DOTween 的 `OnKill` 是否错误销毁正常到达的牌；
- 动画完成后是否正确设置父节点；
- 是否同时保留了原手牌和临时飞牌。

## 7. 修改协议后的同步步骤

1. 修改客户端 `Proto/uno.proto`；
2. 修改服务端 `/root/projects/caii-server/pb/game/uno.proto`；
3. 重新生成客户端 `Assets/Scripts/Proto/Uno/Uno.cs`；
4. 重新生成服务端 `pb/game/uno.pb.h/.cc`；
5. 编译服务端：

```bash
cd /root/projects/caii-server
./scripts/build-caiisvr-linux.sh
```

6. 重启 `caiisvr`，必要时重启 `caiisvrmp`；
7. Unity 中确认 protobuf 兼容宏仍然存在：

```text
GOOGLE_PROTOBUF_REFSTRUCT_COMPATIBILITY_MODE
```

8. 进行四人完整对局测试：普通摸牌、+2、+4、质疑、接受 +4、漏喊 UNO、托管、超时和结算。

## 8. 最近关键提交

客户端：

```text
2557b59 完善 UNO 客户端牌面动画与回合交互
f075d8bc 增加 UNO 回合标识调试日志
cee6311b 统一 UNO 惩罚摸牌通知与动画
```

服务端最新构建产物：

```text
/root/projects/caii-server/bin/x64/Debug/caiisvr
```

## 9. 客户端请求 → 服务端响应/通知对照表

> 所有请求的直接响应都只看 `code`。成功后的牌局变化由独立通知下发；不要等待 `Resp.public_state` 或 `Resp.private_state`。

| 客户端调用 | 协议 | 请求体 | 直接响应 | 成功后服务端通知 |
|---|---|---|---|---|
| `Enter()` 建立游戏连接 | `EnterGame=10185001` | 通用进入游戏请求 | 通用 `code` | 后续进入 UNO |
| `SendEnter()` | `EnterUno=10185608` | `UnoTableQueryReq`：`userid/roomid/tableno` | `UnoTableQueryResp.code` | `MatchStateNotify`、开局后的状态/手牌/回合通知 |
| `Query()` | `TableQuery=10185600` | `UnoTableQueryReq` | `UnoTableQueryResp.code` | 响应中返回 `public_state` + 本人 `private_state`，用于查询/重连 |
| `Play()` | `PlayCard=10185601` | `UnoPlayCardReq`：`card_id/chosen_color/turn_seq` | `UnoPlayCardResp.code` | `PlayCardNotify`，然后通常是 `TurnNotify`；结束时 `GameResultNotify` |
| `Draw()` | `DrawCard=10185602` | `UnoDrawCardReq`：`turn_seq` | `UnoDrawCardResp.code` | `DrawCardNotify`；可出牌时附带 `can_play_drawn_card`，随后 `TurnNotify` |
| `Pass()` | `PassAfterDraw=10185603` | `UnoPassAfterDrawReq`：`turn_seq` | `UnoPassAfterDrawResp.code` | `PassAfterDrawNotify`，随后 `TurnNotify` |
| `Challenge()` | `ChallengeWild4=10185604` | `UnoActionReq.action=1` | `UnoActionResp.code` | `ChallengeWild4Notify`；受罚玩家有 `drawn_cards`，其他人为空；随后 `TurnNotify` |
| `DeclineChallenge()` | `DeclineWild4=10185605` | `UnoActionReq.action=2` | `UnoActionResp.code` | `DeclineWild4Notify`；受罚玩家有 `drawn_cards`，其他人为空；不再额外发送 `DrawCardNotify` |
| `DeclareUno()` | `DeclareUno=10185606` | `UnoActionReq.action=3` | `UnoActionResp.code` | `DeclareUnoNotify`；若漏喊则 `MissedUnoPenaltyNotify` |
| `SetTrustee(true/false)` | `SetTrustee=10185607` | `UnoActionReq.is_trustee`，`action=4` | `UnoActionResp.code` | `TrusteeStateNotify`；断线自动托管也发送该通知 |

### 9.1 通知字段和客户端动画规则

#### `PlayCardNotify`

服务端广播真实出的牌。所有客户端播放对应玩家手牌飞向 `DiscardPile`，然后更新弃牌顶牌和当前颜色。

#### `DrawCardNotify`

- `userid`：实际摸牌玩家；
- `draw_count`：摸牌数量；
- `drawn_cards`：只给实际摸牌玩家；
- `can_play_drawn_card`：只给实际摸牌玩家有效。

本人收到牌面，其他人收到牌背动画。

#### `ChallengeWild4Notify`

- `penalty_userid`：受罚玩家；
- `penalty_count`：罚牌数量；
- `drawn_cards`：只在受罚玩家的通知中填充。

客户端收到后直接播放惩罚摸牌动画。服务端不再同时发送 `DrawCardNotify`。

#### `DeclineWild4Notify`

- `userid`：接受 +4 的玩家/动作发起者；
- `offender_userid`：上一张 +4 的玩家；
- `penalty_count` 和 `penalty_hand_count_after`：惩罚信息；
- `drawn_cards`：只在受罚玩家的通知中填充。

同样不再额外发送 `DrawCardNotify`。

#### `MissedUnoPenaltyNotify`

- `userid`：受罚玩家；
- `penalty_count`：罚牌数量；
- `penalty_cards`：只给受罚玩家。

当前客户端将其转换为一次内部摸牌动画：本人显示真实牌面，其他人显示牌背。

### 9.2 错误处理

请求失败时只依赖响应或错误通知中的：

```protobuf
code
message
```

客户端不应根据失败响应中的旧状态更新手牌或桌面。收到 `ErrorNotify` 后可使用其中的 `public_state/private_state` 恢复状态。

### 9.3 服务器实现位置

请求路由主要在：

```text
caiisvr/server/game_server.cpp
```

UNO 动作处理和通知广播主要在：

```text
caiisvr/uno/uno_game_table.cpp
```

`UnoGameTable::BroadcastAction()` 负责根据动作枚举生成独立通知。动作判断使用：

```cpp
static_cast<game::uno::UnoActionCommand>(result.action_command)
```

不要再使用 `action_command == 1/2/3` 这类魔法数字。
