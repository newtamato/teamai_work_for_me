# 实现说明：UNO HomeScene 观战流程审计

> 本文目的：梳理普通用户从 LobbyExplore 进入 UNO 观战后的客户端流程，确认 HomeScene 不切换场景时的事件、网络、桌面状态、聊天和礼物链路。
>
> 当前状态：代码审计记录，**不是已完成实现声明**。当前实现仍存在若干阻断项，修复并完成 Unity 验证后才能作为正式流程。

## 1. 结论

当前“普通用户从 Lobby 进入 UNO 观战”的监听链路不完整，直接运行存在失败风险。

已基本接通的部分：

- LobbyExplore 的观战按钮事件。
- `E_NOTIFY_ENTER_SPECTOR_MODE` 事件。
- `UnoLiveClient` 到 `UnoGameManager` 的大部分 UNO 状态消息转发。
- `UnoGamePlayerItem` 到礼物选择面板的目标事件。

当前主要阻断项：

1. HomeScene 观战路径没有可靠创建 `UnoLiveClient`。
2. `UnoGameManager.spectorMode` 没有在当前 UNO prefab/scene 中绑定。
3. Lobby 进入观战时没有把 `ChatHost/ChatPort` 写入当前聊天连接使用的地址。
4. 直播解散事件没有由 `UnoGameManager` 处理并返回 Lobby。
5. 观战状态为空时，部分 Manager/UI 代码仍直接访问被观战手牌，存在空引用和身份语义错误。

---

## 2. 当前实际入口流程

```text
LobbyExploreBehaviour
  └─ OnGameLiveEnterButtonClick
      └─ ToGameLive
          ├─ 保存 currentLiveGameInfo
          ├─ 保存 gameLiveBoutGuid
          ├─ 保存 gameLiveServerIp / gameLiveServerPort
          └─ ToScene.ToUnoOnlineGameLiveSceneAsync

ToScene
  ├─ SceneDataTunnel.PushData(liveInfo)
  └─ Post E_NOTIFY_ENTER_SPECTOR_MODE

UnoOnHomeScene
  └─ OnShowSpectorNodes
      └─ UnoGameManager.TryEnterSpectatorFromSceneData

UnoGameManager
  ├─ 读取 LiveGameBoutListInfo
  ├─ 显示观战相关 UI
  ├─ SetMode(Spectator)
  ├─ 配置 UnoLiveClient
  ├─ Enter Live
  └─ ChatRoomMgr.EnterGameChatRoom
```

`ToScene.ToUnoOnlineGameLiveSceneAsync()` 当前只传递数据并发送事件，不切换 Unity 场景，这符合 HomeScene 复用 UNO 节点的目标。

相关文件：

```text
UnoOnline-Client/Assets/Scripts/Lobby.Explore/LobbyExploreBehaviour.cs
UnoOnline-Client/Assets/Scripts/SceneSwitch/ToScene.cs
UnoOnline-Client/Assets/Scripts/UNO/UnoOnHomeScene.cs
UnoOnline-Client/Assets/Scripts/UNO/Manager/UnoGameManager.cs
```

---

## 3. 入口事件监听状态

### 3.1 `E_NOTIFY_ENTER_SPECTOR_MODE`

注册位置：

```text
Assets/Scripts/UNO/UnoOnHomeScene.cs
```

注册逻辑：

```csharp
CfEventCenter.Instance.AddListener(
    CfEventType.E_NOTIFY_ENTER_SPECTOR_MODE,
    OnShowSpectorNodes);
```

回调：

```csharp
void OnShowSpectorNodes()
{
    UnoGameManager.Instance.TryEnterSpectatorFromSceneData();
}
```

HomeScene 当前有 `UnoOnHomeScene` 组件，因此这条事件在场景中理论上能够收到。

风险：

- `UnoOnHomeScene` 没有对应的 `OnDestroy` 移除监听。
- HomeScene 重建或重复加载时，可能出现重复监听和重复进入观战。
- 回调没有检查 `UnoGameManager.Instance` 是否为空。

建议：

- 增加成对的 `RemoveListener`。
- 进入流程增加幂等保护。
- 统一由一个 HomeScene 生命周期对象管理监听。

---

## 4. `UnoLiveClient` 状态

### 4.1 当前问题：HomeScene 入口没有可靠创建

`UnoGameManager.SetMode(Spectator)` 当前逻辑：

```csharp
if (UnoLiveClient.Instance == null)
{
    DebugEx.Log("where is UnoLiveClient?");
    return;
}
```

但当前显式创建 `UnoLiveClient` 的代码主要在旧的：

```text
Assets/Scripts/UNO/UnoGameScene.cs
```

新的 HomeScene 观战入口不会经过旧的 `UnoGameScene`，因此很可能出现：

```text
UnoLiveClient.Instance == null
```

随后 `EnterSpectator()` 仍然执行：

```csharp
UnoLiveClient.Instance.ConfigureEndpoint(...)
```

会产生空引用。

### 4.2 建议

HomeScene 观战路径需要提供明确的创建入口，例如：

```text
EnsureUnoLiveClient()
  ├─ 查找现有 UnoLiveClient
  ├─ 不存在则创建 GameObject
  ├─ AddComponent<UnoLiveClient>()
  └─ 确认 Instance 已完成初始化
```

创建后的客户端应跨 HomeScene UI 生命周期保留，但在离开观战时必须显式 `Leave()`。

---

## 5. UNO 直播消息监听

`UnoLiveClient.RegisterHandlers()` 已注册以下核心消息：

```text
GR_C_PLAYER_LIVE_ENTER
GR_C_PLAYER_CHAT_ENTER

GN_C_UNO_GAME_START
GN_C_UNO_TABLE_STATE
GN_C_UNO_PLAY_CARD_NTF
GN_C_UNO_DRAW_CARD_NTF
GN_C_UNO_PASS_AFTER_DRAW_NTF
GN_C_UNO_CHALLENGE_WILD4_NTF
GN_C_UNO_DECLINE_WILD4_NTF
GN_C_UNO_DECLARE_UNO_NTF
GN_C_UNO_MISSED_UNO_PENALTY_NTF
GN_C_UNO_TURN_CHANGED
GN_C_UNO_TRUSTEE_STATE
GN_C_UNO_GAME_RESULT
GN_LIVE_BOUT_DISSOLVE
```

UNO 消息会通过 `CfEventCenter` 转发，并带有：

```text
EnumSendClient.UnoLive
```

`UnoGameManager.RegisterEventListener()` 已监听大部分对应事件：

```text
E_NOTIFY_GAME_START
E_NOTIFY_GAME_TABLE_STATE
E_NOTIFY_GAME_TURNCHANGE
E_NOTIFY_GAME_TRUSTEESTATE
E_NOTIFY_GAME_DRAWCRADANI
E_NOTIFY_GAME_DRAWPASS
E_NOTIFY_GAME_PLAYCARDANI
E_NOTIFY_GAME_WILD4CHALLENGE
E_NOTIFY_GAME_WILD4GIVEUP
E_NOTIFY_GAME_UNO
E_NOTIFY_GAME_UNO_MISS
E_NOTIFY_GAME_RESULT
```

因此 UNO 公共状态和动作动画的基本链路是：

```text
UnoLiveClient
  └─ Parse protobuf
      └─ CfEventCenter.PostEventAsync(..., EnumSendClient.UnoLive)
          └─ UnoGameManager
              └─ UnoGameWindow / 玩家节点 / 动画
```

---

## 6. 观战状态和手牌处理

### 6.1 `GAME_START`

`UnoGameManager.OnGameStart()` 在观战模式下：

- 保存公共桌面状态。
- 只接受被观战玩家的 `private_state`。
- 显示 `unoGameWindow`。
- 播放开局动画。

这是当前设计中比较正确的一部分。

### 6.2 `TABLE_STATE`

当前 `OnTableState()`：

```csharp
localUnoTablePublicState = notify.PublicState;
if (notify.PrivateState != null && IsWatchedPlayer(notify.PrivateState))
    userPlayerCardInfo = notify.PrivateState;
unoGameWindow.UpdatePlayerUI();
```

问题：

- 没有在必要时重新初始化牌桌表现。
- 如果 `TABLE_STATE` 早于 `GAME_START` 到达，UI 可能只有玩家数量和卡牌数量，没有完整牌面。
- 没有统一处理“没有公开被观战手牌”的情况。

### 6.3 动作通知空引用风险

`OnPlayCardAnimation()` 中存在类似逻辑：

```csharp
if (notify.Userid == userPlayerCardInfo.Userid)
```

如果观战快照暂时没有被观战玩家手牌，`userPlayerCardInfo` 可能为空。

建议：

```text
观战没有被观战手牌时：
  ├─ 只更新公共 card_count
  ├─ 播放公共出牌/摸牌动画
  └─ 不访问 userPlayerCardInfo.HandCards
```

---

## 7. `uno_live` 和 `spectorMode` 节点

`UnoGameManager` 定义了：

```csharp
[SerializeField] private GameObject unoMode;
[SerializeField] private GameObject spectorMode;
```

但当前检查到的：

```text
Assets/Prefabs/UNO/Game/UnoGameRoot.prefab
Assets/Scenes/UnoGameScene.unity
```

中，`UnoGameManager` 的序列化数据没有看到 `unoMode` 和 `spectorMode` 的绑定。

而观战入口会执行：

```csharp
spectorMode.Show();
```

这存在空引用风险。

建议确认 HomeScene 中的结构：

```text
UnoGameRoot
  ├─ UnoGameManager
  ├─ unoMode
  └─ uno_live
      ├─ UnoGameWindow
      ├─ UnoOnlinePlayBoard
      ├─ ChatRoot
      ├─ GiftRoot
      └─ 观战专用按钮/返回按钮
```

并把 `unoMode`、`uno_live` 绑定到当前实际使用的 HomeScene prefab，而不是旧的独立 UNO 场景。

---

## 8. 聊天流程

当前聊天建议继续使用独立的 `ChatRoomMgr`，而不是把聊天消息全部塞进 `UnoGameManager`：

```text
UnoGameManager.EnterSpectator
  └─ ChatRoomMgr.EnterGameChatRoom
      └─ GameChatClient
          ├─ ChatBehaviour
          ├─ ChatQuickView
          ├─ ChatRecords
          └─ GiftMgr
```

`UnoLiveClient` 中以下注册目前是注释状态：

```csharp
// GN_C_TABLE_CHAT_NOTIFY
// GN_C_PLAYER_GIFT
// GR_C_TABLE_CHAT
```

这不一定是错误，因为当前聊天和礼物由 `ChatRoomMgr/GameChatClient` 管理。

但是入口参数存在问题。

### 8.1 Chat endpoint 没有从 Lobby 直播数据传递

`LiveGameBoutListInfo` 已经包含：

```text
ChatHost
ChatPort
```

但 `LobbyExploreBehaviour.ToGameLive()` 当前只保存：

```csharp
GlobalInfo.Instance.gameLiveServerIp
GlobalInfo.Instance.gameLiveServerPort
```

没有保存：

```csharp
GlobalInfo.Instance.gameLiveChatHost
GlobalInfo.Instance.gameLiveChatPort
```

随后 `UnoGameManager.EnterSpectator()` 却使用：

```csharp
GlobalInfo.Instance.gameLiveChatHost
GlobalInfo.Instance.gameLiveChatPort
```

所以从 Lobby Explore 进入观战时，聊天地址可能为空或仍然是旧直播地址。

建议：

```text
ToGameLive
  ├─ 保存 LiveHost / LivePort
  ├─ 保存 ChatHost / ChatPort
  └─ 保存 BoutId
```

或者直接让 `TryEnterSpectatorFromSceneData()` 把 `LiveGameBoutListInfo` 传入 `EnterSpectator()`，避免依赖可变的 GlobalInfo。

---

## 9. 礼物流程

当前 UNO 礼物目标链路：

```text
UnoGamePlayerItem
  └─ E_ON_GAME_ONLINE_GIFT_BUTTON_CLICK
      └─ HandleGameGiftWindow
          └─ GiftSelectorPanel
              └─ GiftMgr / Assist
```

`UnoGamePlayerItem` 点击目标玩家的 GiftNode 后会发送目标用户 ID。

`HandleGameGiftWindow` 使用：

```csharp
UnoGameManager.Instance.localUnoTablePublicState
UnoGameManager.Instance.userPlayerCardInfo
```

构建礼物目标列表。

### 9.1 观战礼物风险

观战状态下：

```csharp
userPlayerCardInfo
```

表示被观战玩家的公开手牌，而不是当前观众自己的身份。

因此礼物面板不应使用：

```csharp
userPlayerCardInfo.Userid
```

作为当前送礼人身份。

应使用：

```csharp
GlobalInfo.Instance.CurrentUserid
```

`userPlayerCardInfo` 只用于展示被观战玩家手牌，不应承担观众身份语义。

### 9.2 礼物面板打开时机

如果 `GAME_START` 或 `TABLE_STATE` 尚未收到，`localUnoTablePublicState` 或被观战手牌可能为空，当前代码会直接终止打开礼物面板。

建议：

- 牌局公共状态到达后即可构建玩家目标列表。
- 被观战手牌不是礼物功能的必要条件。
- 没有被观战手牌时仍允许观众送礼。

---

## 10. 直播解散和离开流程

`UnoLiveClient` 收到解散消息后会发送：

```text
E_NOTIFY_GAME_LIVE_DISSOLVED
```

但是当前 `UnoGameManager` 没有注册该事件。

旧的 `UnoOnlineGameLiveScene` 有监听，但当前流程不再切换到这个场景，不能依赖它。

建议由 `UnoGameManager` 或 HomeScene 的统一观战控制器处理：

```text
E_NOTIFY_GAME_LIVE_DISSOLVED
  ├─ UnoLiveClient.Leave()
  ├─ 离开/清理 ChatRoomMgr
  ├─ 隐藏 uno_live
  ├─ 清理观战状态
  └─ 刷新 LobbyExplore 直播列表
```

返回按钮也应复用同一套清理流程，避免“按钮返回”和“直播解散”产生两套生命周期逻辑。

---

## 11. 旧实现和当前实现的边界

以下脚本仍然存在，但不应继续作为 HomeScene 观战主流程依据：

```text
Assets/Scripts/UNO/UnoOnlineGameLiveScene.cs
Assets/Scripts/UNO/UnoGameScene.cs
```

原因：

- `UnoOnlineGameLiveScene` 是独立场景方案，当前 `ToUnoOnlineGameLiveSceneAsync()` 已不切场景。
- `UnoOnlineGameLiveScene` 中很多 LiveClient 和 UNO 状态监听仍被注释。
- `UnoGameScene` 中虽然会创建 `UnoLiveClient`，但 HomeScene 观战不会经过它。

应明确保留一条主路径：

```text
HomeScene
  → UnoOnHomeScene
  → UnoGameManager
  → UnoLiveClient
  → ChatRoomMgr / GiftMgr
```

旧场景脚本要么标记为 legacy，要么后续删除，避免维护时误接回旧链路。

---

## 12. 建议的目标流程

```text
LobbyExploreBehaviour.ToGameLive
  ├─ 保存 LiveHost / LivePort
  ├─ 保存 ChatHost / ChatPort
  ├─ 保存 BoutId
  └─ Post E_NOTIFY_ENTER_SPECTOR_MODE

UnoOnHomeScene
  └─ UnoGameManager.TryEnterSpectatorFromSceneData

UnoGameManager
  ├─ Ensure UnoLiveClient
  ├─ Mode = Spectator
  ├─ 隐藏 unoMode
  ├─ 打开 uno_live
  ├─ 配置 Live endpoint
  ├─ Enter Live
  └─ ChatRoomMgr.EnterGameChatRoom(ChatHost, ChatPort, BoutId)

UnoLiveClient
  ├─ EnterGameLiveResp
  ├─ GameStart / TableState / TurnChanged
  ├─ UNO 动作通知
  └─ 转发到 UnoGameManager

UnoGameManager
  ├─ 更新公共桌面
  ├─ 更新被观战玩家公开手牌
  ├─ 播放出牌/摸牌/回合动画
  └─ 禁止普通玩家操作按钮

ChatRoomMgr
  ├─ 进入聊天频道
  ├─ 接收聊天
  └─ 接收礼物通知

GiftMgr / GiftSelectorPanel
  └─ 观众向指定 UNO 玩家送礼

Dissolve / Back
  ├─ 关闭 LiveClient
  ├─ 离开 ChatRoom
  ├─ 隐藏 uno_live
  ├─ 清理观战状态
  └─ 返回/刷新 LobbyExplore
```

---

## 13. 修复优先级

### P0：不修复无法进入观战

1. HomeScene 路径显式创建/确保 `UnoLiveClient`。
2. 给 `UnoGameManager` 绑定 `unoMode` 和 `uno_live`。
3. 从 `LiveGameBoutListInfo` 正确传递 `ChatHost/ChatPort`。

### P1：进入后核心体验不完整

4. `UnoGameManager` 监听 `E_NOTIFY_GAME_LIVE_DISSOLVED`。
5. 观战状态为空时避免 `userPlayerCardInfo` 空引用。
6. 礼物面板使用观众 `CurrentUserid`，而不是被观战玩家 ID。
7. 确认 `ChatBehaviour`、`ChatQuickView`、`GiftMgr` 在 HomeScene/`uno_live` 激活。

### P2：生命周期和维护性

8. `UnoOnHomeScene` 增加监听移除和重复进入保护。
9. 统一返回和解散清理流程。
10. 标记或移除旧的独立场景观战实现。

---

## 14. 验收清单

普通用户从 LobbyExplore 点击观战后，应验证：

- [ ] 不发生场景切换。
- [ ] `E_NOTIFY_ENTER_SPECTOR_MODE` 只触发一次。
- [ ] `uno_live` 正确显示。
- [ ] `unoMode` 被隐藏。
- [ ] `UnoLiveClient` 成功创建并连接正确 Live endpoint。
- [ ] 收到 `EnterGameLiveResp`。
- [ ] 收到 `GAME_START` 或当前桌面快照。
- [ ] 公共玩家信息正确显示。
- [ ] 被观战玩家手牌按产品规则显示。
- [ ] 其他玩家私有手牌不误显示。
- [ ] 出牌、摸牌、颜色、回合、托管动画正常。
- [ ] 观众不能触发出牌、摸牌、UNO、托管等玩家操作。
- [ ] ChatRoomMgr 使用当前直播的 ChatHost/ChatPort/BoutId。
- [ ] 普通聊天可以收发。
- [ ] 礼物面板可以打开。
- [ ] 礼物目标为指定 UNO 玩家。
- [ ] 礼物 source tag 使用当前 BoutId。
- [ ] 直播解散后自动清理并返回列表。
- [ ] 手动返回后 Live socket 和 Chat socket 都被关闭。
- [ ] 重复进入第二个直播不会复用旧 BoutId 或旧聊天连接。
