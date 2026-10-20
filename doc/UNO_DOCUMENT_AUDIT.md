# UNO 文档审计结果

审计依据：当前 `caiisvr`、`caiirobotsvr`、`caiilivesvr`、`caiichunksvr` 和 `UnoOnline-Client` 代码。详细正确流程见 `doc/UNO_PROJECT_SPEC.md`。

## 结论

现有文档混合了需求草案、历史实现记录和当前实现，不能直接作为 agent 规范使用。主要问题不是规则描述，而是协议号、入口、费用、机器人归属、隐私和正式匹配行为已经发生变化。

## 必须按新规范理解的文档

| 文档 | 状态 | 处理 |
|---|---|---|
| `uno-first-version-notes.md` | 历史需求 | 保留作为需求来源；不能代表当前规则。当前已实现 +4 质疑、UNO pending/漏喊罚和部分 v2 规则。 |
| `uno-client-protocol-draft.md` | 过时草案 | 协议入口和托管描述不准确；以 canonical spec 和 `UNO_PROTOCOLS.md` 为准。 |
| `uno-full-game-lifecycle.md` | 部分过时 | `entryFee`、GameBoutData、直播私有状态、匹配通知描述需要以当前代码为准。 |
| `uno-round-protocol-flow.md` | 部分过时 | 仍把部分响应/通知当作旧版；当前专用动作通知和 `EnterGameResp` 以 proto 为准。 |
| `uno-implementation-status.md` | 严重过时 | 文件仍写网络接入/GameTable/机器人未完成，但当前正式 `UnoGameRoom/UnoGameTable` 已接入。 |
| `uno-table-entry-and-settlement-implementation-status.md` | 历史阶段记录 | 可追溯开发过程，不作为现状。 |
| `uno-formal-room-table-robot-architecture.md` | 架构目标 | 其中“机器人服负责 AI”和“完全不使用 GameBoutData”尚未完全符合当前实现。 |
| `uno-v2-rules-notes.md` | 基本有效 | 规则能力已较完整，但仍需以 `uno.proto` 和实际代码验证。 |
| `uno-v2-trustee-ai-notes.md` | 部分有效 | 当前正式桌已在服务端执行自动托管，不能把机器人服接管视为完成事实。 |
| `uno-v2-matchmaking-and-level-notes.md` | 仅 dev HTTP 有效 | 不能当作正式 `UnoGameRoom` 的匹配配置。 |
| `doc/client/archive/uno-live-chat-gift-integration.md` | 部分过时 | UNO 已改走独立礼物协议/模块；观战房公开指定被观战真人手牌的例外规则需以当前共同规范为准。 |
| `doc/client/archive/uno-client-server-logic-notes.md` | 部分过时 | 入场费 0、直播 public-only 等内容与当前服务端不符。 |

## 当前已确认的关键更正

1. UNO 进入匹配使用 `GR_C_ENTER_GAME=10185001`；`GR_C_UNO_TABLE_QUERY=10185600` 用于查询/重连。不存在当前可用的 `GR_C_UNO_ENTER` 主流程。
2. 当前 UNO 入场费默认 `30`，读取 `[UNO] EntryFee`；客户端文档中“入场费 0”错误。
3. 当前 `StartGame()` 初始化 `UnoGameBoutData` 并仍使用部分 `GameTable` 生命周期；不能声称已经完全移除 GameBoutData/Carrom 基类。
4. 当前正式房间匹配从 8 秒开始请求机器人，12 秒时要求补满；不是简单固定 10 秒规则。
5. 当前匹配状态通知不是持续广播；`BroadcastMatchState()` 只在四人就位时发送。
6. 当前每个真人开局通知包含自己的 `private_state`；这是正确的玩家隐私行为。
7. 当前 `NotifyLive()` 将 1 号椅子的手牌填入直播通知；这仅在该椅子被明确指定为观战公开真人时符合观战房规则，否则必须修复为不广播私有手牌。
8. 当前成功动作主要广播专用动作通知，而不是统一依赖 `GN_C_UNO_ACTION_NTF`。
9. 当前超时自动出牌主要在 `caiisvr` 的 `UnoGame` 中执行；`caiirobotsvr` 不是当前正式真人托管 AI 的权威执行者。
10. UNO 礼物已经是独立链路，保留 `to_robot` 和 `bout_id`，不应复用 Carrom 的促销、免费礼物、联盟或埋点逻辑。

## 使用规则

以后新增文档必须标记：

```text
需求草案 / 架构目标 / 当前实现 / 测试记录 / 历史记录
```

任何写有“当前已实现”的内容，都必须能在代码路径、协议定义或测试日志中找到依据。
