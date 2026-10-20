# UNO 普通对局与直播模块架构方案

> 文档目的：架构方案 / 执行计划
>
> 当前状态：方案草案，尚未全部实现。当前代码仍以 `UnoGameManager`、`UnoGameClient`、`UnoLiveClient`、`ChatRoomMgr` 等现有实现为准。

## 一、总体结论

普通对局和直播观战具有大量共同能力：

- UNO 桌面状态
- 玩家座位
- 当前回合
- 颜色、方向
- 出牌/摸牌动画
- 结算展示
- 网络断线和结束处理

但两者的权限和网络连接不同：

- 普通对局：可以匹配、出牌、摸牌、托管。
- 直播观战：只能观看，可聊天、送礼，不能操作牌局。

因此不应该维护两套完全独立的 UNO 流程，也不应该强行合并成一个网络客户端。

推荐原则：

> 统一会话管理、状态模型、消息模型和牌桌 UI；
> 普通对局和直播对局保留独立 Session 和网络 Client。

## 二、目标架构

```text
UnoGameRoot
└── UnoSessionCoordinator
    ├── UnoPlayerSession
    │   └── UnoGameClient
    │
    ├── UnoSpectatorSession
    │   ├── UnoLiveClient
    │   ├── UnoLiveChatSession
    │   └── UnoLiveGiftService
    │
    ├── UnoTableStateStore
    └── UnoTableView
```

### 1. UnoSessionCoordinator

统一管理当前 UNO 会话：

```csharp
public enum UnoSessionMode
{
    None,
    Player,
    Spectator
}
```

职责：

- 当前模式管理。
- 普通对局和直播之间切换。
- 创建、启动、退出 Session。
- 防止两个模式同时占用连接。
- 统一处理错误、结束和清理。
- 对 UI 暴露统一入口。

建议接口：

```text
EnterPlayerGame()
EnterSpectator(LiveGameBoutListInfo info)
Leave()
SendChat(string text)
SendGift(...)
```

UI 不再直接访问：

```csharp
UnoGameClient.Instance
UnoLiveClient.Instance
ChatRoomMgr.Instance
```

### 2. UnoPlayerSession

负责普通对局：

```text
UnoPlayerSession
├── 匹配
├── 进入牌局
├── 断线重连
├── 出牌
├── 摸牌
├── UNO
├── 托管
└── 结算
```

底层使用 `UnoGameClient`。

### 3. UnoSpectatorSession

负责直播观战：

```text
UnoSpectatorSession
├── 进入直播
├── 接收直播牌局
├── 观战状态
├── 直播结束
├── 聊天
└── 礼物
```

底层拆分为：

```text
UnoLiveClient       UNO 直播网络
UnoLiveChatSession  聊天连接
UnoLiveGiftService  礼物服务
```

`UnoLiveClient` 不再承担聊天和礼物逻辑。

## 三、共享部分

### 1. 统一桌面状态

抽出 `UnoTableStateStore`，负责维护：

- 公共牌桌状态
- 玩家列表
- 当前颜色
- 当前方向
- 当前回合
- 手牌数量
- 结算状态
- 直播中被观战玩家的公开手牌

普通和直播客户端收到的协议，先转换为统一的领域事件：

```text
UnoGameClient ──┐
                 ├── UnoTableStateStore ──> UnoTableView
UnoLiveClient ───┘
```

### 2. 统一牌桌 UI

普通和直播共用：

```text
UnoTableView
├── UnoPlayerSeatView
├── UnoHandView
├── UnoTurnView
├── UnoCardAnimationView
└── UnoResultView
```

差异通过能力控制：

```text
PlayerSessionCapabilities
- CanPlayCard
- CanDrawCard
- CanDeclareUno
- CanSetTrustee

SpectatorSessionCapabilities
- CanWatch
- CanChat
- CanSendGift
```

直播 UI 不应该复制一套完整牌桌。

## 四、统一状态机

```text
None
├── Player
│   ├── Matching
│   ├── Playing
│   ├── Result
│   └── Leaving
│
└── Spectator
    ├── EnteringLive
    ├── EnteringChat
    ├── Watching
    ├── Reconnecting
    ├── Ended
    └── Leaving
```

所有进入和退出都经过 `UnoSessionCoordinator`，不再由多个对象分别调用：

```text
UnoLiveClient.Leave()
ChatRoomMgr.QuitGameChatRoom()
UnoGameGlobalInfo.ResetGameInfo()
GameSceneHide()
```

统一流程：

```text
Coordinator.Leave()
  → Session.Leave()
  → 关闭游戏连接
  → 关闭聊天连接
  → 清理上下文
  → 清理状态
  → 恢复大厅 UI
```

## 五、直播上下文统一管理

目前 `boutId`、`roomId`、聊天 Guid、观看用户等信息分散在多个对象中。

建议建立：

```csharp
public sealed class UnoSessionContext
{
    public string BoutId;
    public int RoomId;
    public string LiveHost;
    public int LivePort;
    public string ChatBoutId;
    public string ChatHost;
    public int ChatPort;
    public int WatchedUserId;
}
```

所有直播相关模块使用同一个 Context，避免游戏连接、聊天连接和礼物请求使用不同的房间标识。

## 六、当前代码对应关系

| 当前代码 | 目标职责 |
|---|---|
| `UnoGameManager` | 拆分为 `UnoSessionCoordinator` + `UnoPlayerSession` |
| `UnoGameClient` | 保留为普通对局网络 Client |
| `UnoLiveClient` | 保留为直播 UNO 网络 Adapter |
| `ChatRoomMgr` | 后续包装为 `UnoLiveChatSession` |
| `GiftMgr` | 后续包装为 `UnoLiveGiftService` |
| `UnoGameGlobalInfo` | 逐步拆为 `UnoTableStateStore` + `UnoSessionContext` |
| `GameLiveMgr` | 逐步拆出 `UnoLiveDiscoveryService` |
| `UnoOnHomeScene` | 只保留页面和列表展示职责 |

## 七、执行方案

### 阶段一：明确边界，低风险清理

目标：不改变主要功能，只减少职责混乱。

1. 清理 `UnoLiveClient` 中重复的聊天和礼物代码。
2. 确定 `UnoLiveClient` 只处理 UNO 直播协议。
3. 暂时保留 `ChatRoomMgr`、`GiftMgr` 作为底层服务。
4. 为直播进入、退出、结束建立统一调用入口。
5. 统一保存 `boutId`、`roomId`、`chatGuid` 和观看用户。
6. 禁止 UI 直接操作网络 Client。

完成标准：

- 直播聊天只有一个入口。
- 直播退出可以一次性关闭游戏和聊天连接。
- 不再依赖多个地方分别清理直播状态。

### 阶段二：抽出 UnoSpectatorSession

目标：集中直播生命周期。

将当前 `UnoGameManager.EnterSpectator()` 中的逻辑迁移到 `UnoSpectatorSession`：

```text
配置直播端点
→ 建立直播连接
→ 进入直播
→ 建立聊天连接
→ 接收直播状态
→ 直播解散
→ 退出聊天
→ 关闭直播连接
```

`UnoGameManager` 不再直接处理直播网络细节。

### 阶段三：抽出 UnoPlayerSession

目标：整理普通对局流程。

将 `UnoGameManager` 中普通对局相关逻辑拆出 `UnoPlayerSession`，负责：

- 开始匹配
- 取消匹配
- 进入牌局
- 普通对局操作
- 重连
- 结算
- 退出

`UnoGameManager` 只负责协调和兼容旧 UI。

### 阶段四：建立共享状态层

目标：消除普通对局和直播对局的重复状态处理。

新增：

```text
UnoTableStateStore
UnoTableEvent
UnoTableView
```

普通和直播 Client 只负责：

```text
协议接收 → 领域事件
```

状态和 UI 统一处理：

```text
领域事件 → StateStore → TableView
```

### 阶段五：统一 Coordinator

目标：建立最终唯一入口。

最终由 `UnoSessionCoordinator` 统一处理：

```text
EnterPlayer()
EnterSpectator()
Leave()
Reconnect()
HandleSessionEnded()
```

之后：

- `UnoGameManager` 逐步降级为 UI/兼容层。
- `UnoOnHomeScene` 只负责 HomeScene 展示。
- 直播列表由 `UnoLiveDiscoveryService` 管理。
- 牌桌由 `UnoTableView` 统一展示。

## 八、验证方案

### 普通对局

- 开始匹配。
- 取消匹配。
- 进入牌局。
- 出牌、摸牌、UNO、托管。
- 断线重连。
- 结算。
- 返回大厅。

### 直播观战

- 查询直播列表。
- 进入直播。
- 直播牌局状态同步。
- 聊天进入和退出。
- 发送聊天。
- 发送礼物。
- 直播解散。
- 网络断线和重连。
- 返回大厅后旧消息不再影响新状态。

### 模式切换

- 普通对局 → 直播。
- 直播 → 普通对局。
- 直播中重复进入其他直播。
- 直播结束后重新进入。
- 连接失败时正确清理。

## 九、阶段一实施记录

已完成的低风险边界清理：

- `UnoLiveClient` 删除重复的聊天和礼物发送/接收逻辑，仅保留 UNO 直播网络协议。
- `UnoGameManager` 集中直播退出清理，同时关闭 `UnoLiveClient` 和 `ChatRoomMgr`。
- 普通模式切换前，仅在原模式为直播时执行直播服务清理，避免初次进入普通对局时误关闭普通聊天。
- 新增 `UnoSessionContext`，集中保存直播 bout、房间、聊天端点和被观战用户信息。
- `UnoOnHomeScene` 改为通过 `GameLiveMgr.RequestQueryUnoLiveList()` 请求 UNO 直播列表，避免页面直接注册/发送 Assist 协议。
- 直播聊天端点缺失时不再盲目进入聊天房间，而是记录警告并继续直播连接。

验证结果：

- 旧聊天方法和事件处理器在 `UnoLiveClient` 中无残留引用。
- `git diff --check` 通过。
- Unity Editor 自动验证暂未完成：当前环境的 `Unity` 命令是 Unity CLI，不支持项目要求的 `-batchmode` 参数，因此状态为 BLOCKED/UNVERIFIED。

## 十、阶段二实施记录

已完成 `UnoSpectatorSession` 抽取：

- 新增 `Assets/Scripts/UNO/UnoSpectatorSession.cs`。
- `UnoSpectatorSession` 统一拥有一次直播观战会话的进入、聊天连接和退出生命周期。
- `UnoGameManager` 不再直接配置 `UnoLiveClient` 或 `ChatRoomMgr`，仅负责模式切换、UI 状态和会话结果协调。
- 直播上下文由 `UnoSpectatorSession.Context` 持有。
- 直播端点校验和聊天端点缺失处理集中到 Session。
- `TryEnterSpectatorFromSceneData()` 现在会返回 Session 进入结果，进入失败不会继续报告成功。

尚未完成：

- `UnoPlayerSession` 尚未抽取。
- 普通/直播消息尚未统一转换为共享领域事件。
- `UnoTableStateStore` 和 `UnoSessionCoordinator` 尚未建立。

## 十一、阶段三实施记录

已完成 `UnoPlayerSession` 抽取：

- 新增 `Assets/Scripts/UNO/UnoPlayerSession.cs`。
- 普通对局的匹配启动、取消匹配、重连、模式切换关闭和牌局操作均通过 `UnoPlayerSession` 调用 `UnoGameClient`。
- `UnoGameManager` 不再持有或直接调用 `UnoGameClient`，保留普通对局的 UI 状态、权限判断和牌桌状态更新。
- 普通对局和直播观战现在分别由 `UnoPlayerSession`、`UnoSpectatorSession` 持有网络会话生命周期。

尚未完成：

- 两种 Session 尚未由统一的 `UnoSessionCoordinator` 编排。
- 普通/直播消息尚未统一转换为共享领域事件。
- `UnoTableStateStore` 尚未建立。

## 十二、阶段四实施记录

已建立普通对局和直播观战共用的桌面状态边界：

- 新增 `UnoTableEvent`，统一描述普通/直播来源、开局、桌面状态、回合、动作和结算事件。
- 新增 `UnoTableStateStore`，保存当前桌面快照、当前回合、事件来源和最近事件，并提供 `Changed` 订阅入口。
- `UnoGameManager` 将普通和直播消息转换为统一 `UnoTableEvent` 后交给 Store，再继续驱动现有 UI，保持本阶段兼容性。
- 重新启用 `UnoGameClient` 和 `UnoLiveClient` 的桌面状态通知链路。
- 直播桌面状态包含私有状态时，会先按被观战用户过滤，避免 Store 保存不应公开的其他玩家私有手牌。
- 普通重连和直播进入快照也统一进入 Store。
- `UnoGameManager.TableState` 暴露共享状态入口，供后续 Presenter/`UnoTableView` 迁移使用。
- `UnoGameWindow.UpdatePlayerUI()` 和 `UnoGameManager` 的牌桌玩家查询优先消费 `UnoTableStateStore`，同时保留旧全局状态作为兼容回退。

本阶段是渐进式接入：现有 `UnoGameGlobalInfo` 和 `UnoGameWindow` 仍兼容保留，尚未完全迁移到 Store。

尚未完成：

- `UnoSessionCoordinator` 尚未建立。
- `UnoGameWindow` 尚未改为完全消费 `UnoTableStateStore`。
- 网络 Client 尚未直接输出独立领域事件；当前由 `UnoGameManager` 作为兼容适配层完成转换。

## 十三、阶段五实施记录

已建立 `UnoSessionCoordinator`：

- 新增 `Assets/Scripts/UNO/UnoSessionCoordinator.cs`。
- Coordinator 统一持有 `UnoPlayerSession` 和 `UnoSpectatorSession`。
- 普通对局与直播观战的模式切换由 Coordinator 统一处理。
- 进入直播、开始普通匹配、直播退出和网络互斥由 Coordinator 编排。
- `UnoGameManager` 不再直接持有两个 Session，只保留 UI、状态展示和兼容转发职责。
- 普通对局操作和重连通过 `sessionCoordinator.Player` 转发。
- 直播进入和退出通过 `sessionCoordinator.EnterSpectator()` / `LeaveSpectator()` 转发。

当前仍保留 `UnoGameManager.SetMode()` 作为兼容入口，但实际状态已由 Coordinator 持有。

尚未完成：

- `UnoGameManager` 中仍保留部分 UI 与状态协调逻辑。
- `UnoGameWindow` 尚未完全改为事件驱动。
- `UnoGameGlobalInfo` 仍作为兼容状态源保留。

## 十四、阶段六实施记录

已开始将 `UnoGameWindow` 迁移为 Store 事件驱动：

- `UnoGameWindow` 在启用时订阅 `UnoTableStateStore.Changed`，禁用时解除订阅。
- 桌面状态事件由 Window 自己触发 `UpdatePlayerUI()`，`UnoGameManager` 不再直接刷新该 UI。
- 回合事件由 Window 自己调用 `ApplyTurnChanged()`，统一处理座位回合标记、箭头和操作按钮。
- `UpdatePlayerUI()` 优先使用 Store 快照，旧 `UnoGameGlobalInfo` 仅作为兼容回退。
- Manager 仍负责复杂的开局流程，后续继续迁移。
- 出牌、摸牌、Pass、+4 质疑、漏喊 UNO 和结算已改为先更新 Store，再由 Window 事件订阅触发动画/表现。

尚未完成：

- 出牌、摸牌、UNO、质疑和结算动画尚未全部迁移到 Store 事件订阅。
- `UnoGameWindow` 仍有部分方法直接读取 `UnoGameGlobalInfo`。
- 开局、断线重连和直播进入快照已接入 Store 事件；普通玩家的匹配/Cut 开局编排仍暂时保留在 Manager。
- 完成全部迁移后，才能移除 Manager 对 Window 的大部分主动调用。

## 十五、阶段七实施记录

已将 `UnoTableStateStore` 提升为牌桌状态的优先来源：

- `UnoTableStateStore.Active` 暴露当前活动牌桌 Store。
- `UnoGameGlobalInfo.CurrentUnoGameStartNotify`、`unoTablePublicState`、`unoPrivateState` 改为优先代理 Store 状态。
- 旧全局对象只保留 `legacyStartNotify` 作为过渡回退，不再作为正常流程的独立状态源。
- `UnoGameClient` 不再在收到开局通知时直接写入全局牌桌状态。
- Manager、Window、重连和直播快照流程统一先更新 Store。

尚未完成：

- 已删除 `legacyStartNotify` 和 `SetLegacyStartNotify()`。
- `HandleEnterGameResp()` 在 Manager 尚未加载时会把续局快照写入活动 Store，保证跨场景续局状态可保留。
- Manager 使用 `EnsureActive()` 获取同一个 Store，避免 HomeScene 创建新 Store 时丢失续局快照。
- 所有 UNO 牌桌代码中的状态读取已迁移到 `UnoTableStateStore` 或 Manager 的 Store 查询入口。

## 十六、阶段八实施记录

已开始收敛旧 `CfEventCenter` 到统一 Store 的兼容边界：

- 新增 `Assets/Scripts/UNO/UnoTableEventBridge.cs`。
- Bridge 统一负责 `EnumSendClient` 到 `UnoTableEventSource` 的转换。
- `UnoGameManager` 不再直接调用 `UnoTableStateStore.Apply(UnoTableEvent...)`，改由 Bridge 发布规范化事件。
- 现有 `CfEventCenter` 监听暂时保留，确保旧网络协议和非 UNO 模块不受影响。

尚未完成：

- Bridge 已直接订阅开局、回合、动作和结算类 UNO 桌面事件。
- Manager 继续保留必要的业务回调（匹配窗口、私有手牌变更、关系状态等），但不再直接监听规范化桌面事件。
- Bridge 通过 `Published` 向 Manager 提供规范化事件，Manager 只负责业务协调。
- 桌面状态通知已由 Bridge 直接订阅并转交 Store。
- Manager 只通过 `TableStateNormalizer` 提供直播观战隐私过滤策略，不再监听桌面状态事件。
- UNO 标准桌面事件已完成从 Manager 到 Bridge 的监听迁移。
- 阶段八运行验收：测试玩家分别以非观战模式进入匹配，并由独立直播观战账号观察；普通对局、直播观战、桌面状态同步、聊天和礼物流程均表现正常。

## 十七、阶段九实施记录

已开始稳定性收敛：

- Bridge 与 Manager 的订阅生命周期已成对管理。
- 规范化事件采用“业务回调先执行、Store 再通知 Presenter”的顺序，避免旧业务逻辑与 UI 状态竞争。
- Manager 的回合、托管、摸牌和出牌回调增加了空状态保护。
- Manager 的开局、托管和 +4 UI 回调增加了 Presenter 空引用保护。
- `UnoGameGlobalInfo` 中残留的牌桌状态代理属性已删除，不再承担 UNO 牌桌兼容读取职责。
- 普通事件、直播事件和桌面状态事件的监听边界已完成静态检查。

尚未完成：

- Unity Editor 编译和 EditMode/PlayMode 测试仍需在可用 Unity 6000.0.59f2 环境执行。
- 需要真实验证普通对局、直播观战、重连、模式切换和结算事件顺序。

## 十八、最终原则

```text
UnoSessionCoordinator
    管理当前会话

UnoPlayerSession
    管理普通对局

UnoSpectatorSession
    管理直播观战

UnoGameClient / UnoLiveClient
    只负责网络协议

UnoTableStateStore
    管理共享牌桌状态

UnoTableView
    管理共享牌桌表现

UnoLiveChatSession / UnoLiveGiftService
    管理直播附属能力
```

核心目标：

> 普通对局和直播观战属于同一个 UNO Session 体系；
> 它们共享状态和牌桌表现，但拥有独立的会话能力和网络连接。
