# UNO 项目共同规范与真实流程

> 本文是 UNO 当前实现的唯一流程基线，供不同 agent、客户端和服务端共同使用。
> 代码变更后先更新本文中的“已验证事实/未完成项”，再修改其他说明文档。
>
> 服务端源码（本地编辑）：`caii-server/`
> 服务端编译/运行机：`root@192.168.53.48:/root/projects/caii-server`
> 客户端：`UnoOnline-Client/`
> GameID：`1028`；`roomid` 由大厅/服务端房间配置动态下发，不固定；当前 UNO 玩法要求四人桌。

## 1. 先读这几份代码

| 领域 | 当前真实入口 |
|---|---|
| 服务端请求路由 | `caiisvr/server/game_server.cpp` |
| UNO 房间/匹配 | `caiisvr/uno/uno_game_room.cpp` |
| UNO 桌子/协议广播/结算 | `caiisvr/uno/uno_game_table.cpp` |
| UNO 规则状态机 | `caiisvr/uno/uno_game.cpp` |
| 服务端协议 | `pb/game/uno.proto`、`common/request_enum.h` |
| 客户端 UNO 网络 | `Assets/Scripts/UNO/Game/UnoGameClient.cs`、`Assets/Scripts/UNO/UnoLiveClient.cs` |
| 客户端 UNO 场景 | `Assets/Scenes/HomeScene.unity`、`Assets/Prefabs/UNO/Game/UnoGameRoot.prefab` |
| 客户端协议副本 | `Proto/uno.proto`、生成的 `Assets/Scripts/Proto/Uno/Uno.cs` |
| UNO 直播状态 | `UnoGameTable::NotifyLive()`、`caiilivesvr` |
| UNO 礼物 | `UnoGiftMgr.cs`、`caiichunksvr/busi/uno_live_gift_module.*`、`LiveChat::DealUnoGiftSend()` |

## 2. 连接、登录和认证边界

大厅登录和游戏连接是两个 TCP 连接。大厅返回客户端使用的 `Gameip/Mpport` 后，客户端连接游戏入口，再发送 UNO 请求。

`caiisvr` 不信任请求 protobuf 中单独的 `userid`，请求必须满足：

```text
IsUserValid(userid, context.lTokenID)
```

因此测试工程可以直连客户端使用的游戏入口（例如 `caiihallmp` 或配置为入口的端口），但不能对内部 caiisvr socket 仅发送 userid 来伪造登录身份。测试工程若要绕过大厅，必须增加仅 Debug 可用的测试认证入口；不得在生产协议中降低 token 校验。

## 3. 当前协议号

协议基准为 `GR_CAII_CHATLIVE_BASE = 10185000`。

| 协议 | 数值 | 方向 | 消息 |
|---|---:|---|---|
| `GR_C_ENTER_GAME` | 10185001 | 客户端→服务端 | `game.uno.EnterGameReq` / `EnterGameResp` |
| `GR_C_UNO_TABLE_QUERY` | 10185600 | 客户端→服务端 | `UnoTableQueryReq` / `EnterGameResp` |
| `GR_C_UNO_PLAY_CARD` | 10185601 | 双向 | `UnoPlayCardReq/Resp` |
| `GR_C_UNO_DRAW_CARD` | 10185602 | 双向 | `UnoDrawCardReq/Resp` |
| `GR_C_UNO_PASS_AFTER_DRAW` | 10185603 | 双向 | `UnoPassAfterDrawReq/Resp` |
| `GR_C_UNO_CHALLENGE_WILD4` | 10185604 | 双向 | `UnoActionReq/Resp`，action=1 |
| `GR_C_UNO_DECLINE_WILD4` | 10185605 | 双向 | `UnoActionReq/Resp`，action=2 |
| `GR_C_UNO_DECLARE_UNO` | 10185606 | 双向 | `UnoActionReq/Resp`，action=3 |
| `GR_C_UNO_SET_TRUSTEE` | 10185607 | 双向 | `UnoActionReq/Resp`，action=4 |
| `GR_C_UNO_MATCH_STATE` | 10185620 | 服务端→客户端 | `UnoMatchStateNotify` |
| `GN_C_UNO_GAME_START` | 10185621 | 服务端→客户端 | `UnoGameStartNotify` |
| `GN_C_UNO_TABLE_STATE` | 10185622 | 服务端→客户端 | `UnoTableStateNotify` |
| `GN_C_UNO_HAND_UPDATE` | 10185623 | 服务端→客户端 | `UnoHandUpdateNotify` |
| `GN_C_UNO_TURN_CHANGED` | 10185625 | 服务端→客户端 | `UnoTurnChangedNotify` |
| `GN_C_UNO_GAME_RESULT` | 10185626 | 服务端→客户端 | `UnoGameResultNotify` |
| `GN_C_UNO_TRUSTEE_STATE` | 10185628 | 服务端→客户端 | `UnoTrusteeStateNotify` |
| `GN_C_UNO_RELATION_NOTIFY` | 10185637 | 服务端→客户端 | `UnoRelationNotify`（recipient/target/relation） |

`GN_C_UNO_ACTION_NTF` 仍保留，但当前桌子实际主要发送专用动作通知：`PLAY_CARD_NTF`、`DRAW_CARD_NTF`、`PASS_AFTER_DRAW_NTF`、`CHALLENGE_WILD4_NTF`、`DECLINE_WILD4_NTF`、`DECLARE_UNO_NTF` 等。

## 4. 正式玩家流程

```text
LobbyClient 登录大厅
  → 获取服务端下发的 Gameip/Mpport 和 roomid（不硬编码）
  → UnoGameClient 连接游戏入口
  → GR_C_UNO_TABLE_QUERY（查询是否仍在牌局）
      ├─ 已在局：服务端走 checksvr ContinueGame，返回公共状态+本人手牌
      └─ 不在局：客户端发送 GR_C_ENTER_GAME
                    → checksvr 校验/取得 RoomData
                    → GameRoomMgr 创建/取得 UnoGameRoom
                    → UnoGameRoom::PlayerEnterGame
                    → 加入匹配桌
  → 匹配满四人
  → UnoGameRoom::CheckTablesStart
  → UnoGameTable::StartGame
  → 开局通知、回合通知、私有手牌
  → 操作循环
  → 结算
  → kTableEnding 短暂保留
  → CleanAllPlayers/ResetTable
```

当前 `GR_C_UNO_TABLE_QUERY` 的服务端最终返回类型是 `game.uno.EnterGameResp`，不是 `UnoTableQueryResp`。`UnoTableQueryReq` 作为请求结构复用；其 `player_ex_info` 字段使用与 `EnterGameReq` 相同的序列化 `PlayerExInfo` payload，并由 `OnUnoTableQuery` 转发给 Hall/checksvr。

匹配中没有独立的“UNO enter”协议；旧文档中的 `GR_C_UNO_ENTER` / `OnUnoEnter()` 是过时名称。

## 5. 匹配真实行为

当前 `UnoGameRoom::CheckTablesStart()` 的真实逻辑：

1. 新桌进入第一个玩家时状态为 `kTableMatching`。
2. 前 8 秒不请求机器人。
3. 8 秒后按 `1 + (elapsed-8000)/1000` 计算目标机器人数量，每次只发起一个尚未完成的机器人请求。
4. 单个机器人请求最多等待约 3 秒；达到 12 秒后目标数量变为补满四人。
5. 机器人通过公共的 `GN_C_CALL_ROBOT` / `GR_C_ROBOT_ENTERGAME` 上桌。
6. 满四人后改为 `kTableWaitingStart`，下一次检查调用 `StartGame()`。
7. `BroadcastMatchState()` 当前只在四人就位时发送一次（若桌面签名发生变化则可再次发送），不是持续每秒广播。
8. 至少一个真人才能形成这条匹配桌；不要把“纯机器人桌”写入产品承诺。

因此旧文档中“10 秒统一补满”“匹配阶段持续广播”均不准确。等级差匹配的 dev HTTP 逻辑不能自动视为正式 `UnoGameRoom` 的规则，除非正式房间代码也实现相同配置。

## 6. 开局、隐私和费用

`UnoGameTable::StartGame()` 当前：

1. 加载 `uno_level_config.json` 的 `expPerGame`。
2. Chunk 单独加载 `uno_room_section_config.json`（可包含多个 UNO 房间配置，字段包括 `roomid`、`entry_fee` 等），但复用 `RoomSectionConfigList` 解析器；共享 `room_section_config.json` 及其注册继续供 Carrom/Pool 等使用。caiisvr 保留 `ChunkToGameConfigNotify.uno_room_section` 专用传输字段，并将其合并到统一 room-section cache；UNO 按 roomid 查找配置。CacheManager 的按 entry_fee 查询在无匹配或多个房间使用同一费用时返回空，调用方应改用 roomid（或 roomid+entry_fee）消除歧义。旧 `[UNO] EntryFee` 不再作为 UNO 入场费来源。
3. 为四个座位建立 `UnoGame`。
4. 初始化 `UnoGameBoutData`（当前实现仍通过公共 `GameTable` 生命周期持有它）。
5. 真人先检查余额；`PayUnoEntryFee()` 对每桌维护一次性扣费状态，先向 checksvr 分玩家提交 `RefreshGameResult`，全部提交成功后才更新 caiisvr 本地余额。若提交失败，该桌扣费状态进入失败并禁止自动重试，避免 `StartGame()` 再次触发重复扣款；需等 `ResetTable()` 清理。
6. 机器人由 `caiirobotsvr` 收到开局通知后扣款。
7. 每名对战玩家分别收到 `UnoGameStartNotify`，其中含公共状态和该玩家自己的 `private_state`。
8. 开局后发送公共状态、私有手牌和当前回合通知。公共 `UnoTablePublicState.room_category`（字段号 4）由活动 UNO 房间配置透传，供客户端识别房间类别。

数据隔离不变量：

```text
普通玩家：只能收到 public_state 和自己的 private_state。
普通玩家不能收到其他玩家具体手牌或摸牌牌面。
```

注意：当前 `NotifyLive()` 的代码仍会向 live 通知中填充 1 号椅子的 `private_state`。这是直播隐私风险，必须在正式开放观战前修复；直播默认只能收到公共状态，除非产品明确规定某个玩家牌面可见。

## 7. UNO 规则和操作循环

当前规则引擎已支持：

- 标准 108 张牌、四人、每人 7 张；初始牌翻到数字牌。
- 颜色/数字/符号匹配。
- Wild / Wild Draw Four 选色。
- +2/+4 叠加：+2 后可叠 +2/+4，+4 后只能叠 +4；当前版本取消 +4 质疑窗口。
- 普通摸 1 张；摸到可出牌时允许继续出牌或 `PassAfterDraw`。
- 牌堆耗尽时回收弃牌堆（保留最后一张）继续。
- 托管自动喊 UNO、UNO 抓牌窗口和漏喊 UNO 罚牌由服务端权威维护。
- 若玩家打出最后一张普通牌，立即结算；若最后一张是 +2/+4，先强制结算下家惩罚且不允许继续叠加，再发送最终结算。

### UNO 喊牌与抓牌窗口

当当前玩家手里正好有 2 张牌且至少存在一张合法可出的牌时，服务端建立待喊窗口。
玩家可以在出牌前或出牌后喊 UNO；托管玩家由服务端自动喊 UNO。

玩家从 2 张牌成功打出一张后，如果尚未喊 UNO，则进入可抓窗口。服务端在公共
`UnoTablePublicState.pending_uno_userid` 中提供可被抓的漏喊玩家 ID；其他玩家
发送 `UnoActionReq.action=5`（`UNO_ACTION_COMMAND_CATCH_UNO`）主动抓牌。
抓牌成功时漏喊者摸 2 张；牌面只发送给受罚者。若其他玩家先执行普通动作，窗口
关闭且漏喊者不受罚；抓牌与普通动作同时到达时由服务端串行裁决，先处理者生效。

重连玩家通过 `UnoTableQueryResp.public_state.pending_uno_userid` 获得当前目标。
玩家本人不能抓自己；该字段为 0 时表示当前没有可抓目标。普通玩家不会收到其他
玩家的私有手牌。

一次成功动作的服务端路径：

```text
请求
  → GameServer token/user/table 校验
  → UnoGameTable::HandlePlay/HandleDraw/HandlePass/HandleAction
  → UnoGame 规则校验和状态变更
  → response.code
  → 个性化动作通知
  → TurnChanged（若回合变化）
  → TableState
  → HandUpdate（分别发给每个对战玩家）
```

响应中的 `code` 是动作成功判断的第一依据；客户端不能只等待某一个通知来判断请求成功。通知可能有多个，且针对不同接收者内容不同。

当前实际动作通知主要为：

```text
PLAY_CARD_NTF
DRAW_CARD_NTF
PASS_AFTER_DRAW_NTF
CHALLENGE_WILD4_NTF
DECLINE_WILD4_NTF
DECLARE_UNO_NTF
MISSED_UNO_PENALTY_NTF
WILD4_CHALLENGE_PROMPT_NTF
```

`UnoActionNotify` 不是当前客户端主流程的统一动作消息。

## 8. 回合、超时和托管

- 普通回合操作时长当前为 `30000ms`。
- `turn_deadline_ms` 由服务端权威维护。
- `round_deadline_ms` 当前由规则状态维护；整局超时由房间定时器检查。
- 断线时 `GameServer::OnCloseSocket()` 找到 UNO 桌子并调用 `SetTrusteeOnDisconnect()`。
- 超时由 `UnoGameRoom::CheckTablesStart()` 调用 `CheckRoundTimeout()` 和 `CheckTimeoutAndAutoPlay()`。
- `GR_C_UNO_SET_TRUSTEE` 当前仍支持 `is_trustee=false`，用于取消托管；客户端 UI 已使用该能力。
- 自动出牌在当前服务端规则引擎执行，不能把“caiirobotsvr 负责正式 AI”当成当前已完成事实。

## 9. 结算和桌子生命周期

结束原因包括：手牌清空、牌堆无法继续或整局时间结束。结算时：

1. 按规则计算排名和剩余手牌分。
2. 第 3、4 名实际扣款为 `min(left_card_score, balance)`。
3. 奖池由实际扣款组成，第 1、2 名按差值比例分配。
4. 真人的金币变化提交 checksvr；机器人金币变化由机器人服处理。
5. 记录 start/settle 统计。
6. 广播 `GN_C_UNO_GAME_RESULT`。
7. 桌子进入 `kTableEnding`，`IsDissolveEnable()` 后清理并重置。

必须注意：当前 `UnoGameTable::StartGame()` 仍调用 `InitGameBoutData(UnoGameBoutData)`，且 `ResetTable()` 最终调用 `GameTable::ResetTable()`。因此“UNO 完全不使用 GameBoutData/Carrom 基类”的旧说法不正确；实际是 UNO 已绕开 Carrom 业务支付/物理逻辑，但仍依赖部分公共生命周期。任何 agent 修改这些基类时必须回归 UNO。

## 10. 直播、聊天、礼物

### 玩家资产信息透传

头像、边框、气泡等玩家资产不是由服务端查询或下载，而是客户端通过 `GameLiveMgr.GetMyselfPlayerExInfo()` 组装序列化的 `game.carrom.PlayerExInfo`，其中包含 `avatar_asset_id`、`frame_asset_id`、`bubble_asset_id` 等字段。

游戏进入和断线重连分别通过 `EnterGameReq.player_ex_info`、`UnoTableQueryReq.player_ex_info` 发送；服务端保存/校验后，在 `UnoTablePublicState.players[].player_ex_info` 中透传给客户端。直播和聊天同样遵循客户端组装、服务端透传原则：开局公共状态进入 `LivePlayerInfo`，`EnterGameChatReq.player_ex_info` 进入 `Chatter`/`ChatterInfo`，`EnterGameLiveReq.player_ex_info` 进入 `Audience`/`UnoLiveBout`。服务端不负责获取资产，排查显示异常时应依次检查客户端组装、请求携带、服务端透传和客户端解析。

### 直播状态

`UnoGameTable::NotifyLive()` 使用 `GameCommonMessage4Live`，`id=GetBoutId()`。正式开局后 bout id 当前形如：

```text
uno-<roomid>-<tableno>-<game_start_timestamp>
```

`UnoGameBoutData::CanLive()` 按当前决策默认返回 `false`；这意味着正式开放 UNO 直播前仍需明确开启策略。UNO 仍会调用 `NotifyLive()` 推送部分状态，不能仅依据 `CanLive()` 判断所有 live 链路是否存在。

### 聊天

UNO 聊天需要有对应的 `LiveChat`，并把四名牌局玩家加入 `players_`。观众可以进入聊天，但 `LiveChat::DealPlaySendGift()`/UNO 等价处理只允许目标是牌局玩家，不允许给普通观众送礼。

### UNO 礼物

UNO 当前沿用统一直播送礼链路：

```text
GR_LIVE_GIFT_SEND
  → caiichunksvr::LiveGiftModule
  → GN_LIVE_GIFT_SEND
  → caiilivesvr::LiveModule::OnChunkGiftSend
  → LiveChat::DealPlaySendGift
  → GN_C_PLAYER_GIFT
```

原独立的 `GR_C_UNO_GIFT_SEND` 请求已撤销，不再注册监听；`UnoLiveGiftModule` 暂时保留，用于礼物记录和缓存查询等既有逻辑。专用 UNO 礼物发送实现暂不作为客户端入口使用。

统一链路仍要求目标是 UNO 牌局玩家；机器人收礼不计入普通玩家接收统计。

## 11. 客户端状态处理规范

客户端状态来源优先级：

```text
EnterGameResp（进入/重连快照）
TableStateNotify（公共快照）
HandUpdateNotify（本人完整手牌）
TurnChangedNotify（当前回合和当前行动玩家的 playable_card_ids）
专用动作通知（动画和局部表现）
```

客户端必须：

- 允许 `HandUpdate` 和 `TurnChanged` 乱序到达，分别缓存后刷新手牌可用状态。
- 只用自己的 `private_state` 创建真实牌面；对手只显示牌背。
- 使用 `turn_deadline_ms` 展示倒计时，不在客户端裁决超时。
- 动画完成后将手牌放回 `CardArea`、弃牌放入 `DiscardPile`。
- 牌桌表现职责（GAM-24）：回合通知立即更新箭头、服务器 deadline 倒计时和输入权限，不能等待出牌/抓牌特效，也不能因视觉牌数暂时落后而重建手牌。出牌/抓牌/摸后 Pass 按座位串行执行，座位之间及回合提示彼此独立；动作完成仅刷新该座位最新交互布局，不重播回合。弃牌落点按通知顺序衔接，不让跨座位完成顺序覆盖最新弃牌。对手自动摸后立即出牌可能只收到出牌通知，按该动作的 `hand_count_after` 处理，不能机械少显示一张。
- 本人手动出牌（非抓牌）必须即时预测出牌动画并发送请求，不等待网络往返；预测仅改变视觉，不改 Store。成功出牌通知按 card id 确认现有预测牌，不重复飞牌/特效。其他玩家出牌和所有玩家抓牌都等待服务端通知。本地请求失败时从 Store 恢复本人手牌；完整快照/重连、换桌和退出先取消旧手牌动画和预测牌再重建。实现后的 Unity 和人工动画验收需单独记录，不能以此规范代替通过证据。
- Wild 选择颜色只能使用红/黄/绿/蓝，不能把 WILD 当作生效颜色。Wild/WildDrawFour 的本人选色界面在点击后立即关闭并预览 DeskArrow 颜色，不等待服务器往返或额外颜色渐显；预览不写 Store，出牌失败时恢复权威颜色。对手及本人托管的出牌通知已提供选色时，禁用选色按钮并播放短暂的非交互特效后关闭，不能同帧隐藏；非交互特效不阻塞抓牌或回合。
- 桌面特效展示采用 latest-wins：普通非交互特效新到即关闭旧特效，不排队、不阻塞抓牌和回合。本人交互选色界面优先，打开期间抑制新装饰特效和重复选色请求，不能覆盖或取消已有选择；关闭后不补播已抑制的旧特效。退出/隐藏牌桌时停止全部特效并取消隐藏计时。
- 收到 `GN_C_UNO_ERROR_NTF` 或重连成功快照时，以服务端快照覆盖本地状态。

## 12. 当前未完成/高风险项

1. UNO 观战房允许将指定被观战真人的手牌作为公开观战信息下发给全部观众；必须确保只选择该指定真人，不能误广播其他玩家私有手牌或牌堆/未公开摸牌信息。
2. UNO 的 live/chat 创建、销毁和 `bout_id` 全链路需要实测，不能只以游戏状态通知编译通过为准。
3. 正式 `caiirobotsvr` 是否接管 UNO AI 与当前服务端自动托管实现存在架构文档差异，应统一决策。
4. `GameTable`/`GameBoutData` 公共生命周期仍被 UNO 使用，基类改动需测试。
5. `UnoGameRoom` 当前正式匹配与 dev HTTP 的等级差匹配不是同一套实现。
6. `UnoGameStartNotify`、`TableStateNotify`、`TurnChangedNotify` 等协议已经变化过；修改 proto 必须同时生成客户端和服务端代码。
7. `UnoGameResultNotify` 的 `rank` / `total_score` / `coin_delta` 需要客户端和机器人端共同回归。
8. 开局后 caiisvr 按每名真人向 caiichunksvr 查询一次四人经验/关系快照，并缓存结果；发送 `GN_C_UNO_RELATION_NOTIFY`（10185637）给对应真人。结算不再查询 chunksvr，直接使用开局经验快照 + `exp_per_game` 发送个性化结果；机器人保持 0/none。该链路完成 pb 生成、编译和 caii-test 实测后方可视为已验证。
8. `caii-test` 只在客户端游戏入口已建立用户上下文时才能执行正式请求；若要直连内部 caiisvr，应先实现 Debug-only bootstrap auth。

## 13. caii-test 经济/崩溃恢复探针

`caii-test --economic-wave-probe` 是经济测试入口；`--crash-recovery-probe` 是独立崩溃恢复入口，不改变业务协议或 Unity。它从远程运行目录的 `credentials.tsv` 读取指定数量账号，按可配置 wave 投放并等待匹配、开局、自动操作和结算；记录 `roomid/tableno/bout_id`、公共玩家 `is_robot`、真人 Hall `deposit` 开局/结束快照和 `UnoGameResultNotify.players[].coin_delta`。机器人余额没有公开查询路径时必须输出 `robot_balance_unavailable`，不能伪造余额。JSONL 禁止 token/password/deviceid/hardid。

崩溃步骤只能由用户明确传入 53.48 supervisor/SIGKILL 命令；探针不得通过业务协议模拟崩溃。崩溃重启窗口的查询结果记录为 `UNKNOWN`，并断言无 public/private 状态后再开始新 wave。退出码：0 全部完成，1 协议/连接/匹配/结算失败，2 参数、安全或输出文件错误。该探针仅完成本地实现，部署和远程真实运行需单独批准。

## 14. 修改协议/流程的同步规则

1. 先修改 `doc/UNO_PROJECT_SPEC.md` 中协议和状态机。
2. 同步修改服务端 `pb/game/uno.proto` 和客户端 `UnoOnline-Client/Proto/uno.proto`。
3. 重新生成 `pb/game/uno.pb.*` 和 `Assets/Scripts/Proto/Uno/Uno.cs`。C# 生成必须使用与 Unity 项目兼容的方式；从 192.168.53.48 生成并同步 `Uno.cs` 后，确认 Unity 的 `GOOGLE_PROTOBUF_REFSTRUCT_COMPATIBILITY_MODE` 宏仍存在（已配置于 `ProjectSettings/ProjectSettings.asset` 的 Android/Standalone/iPhone，以及 `Assets/Editor/BuildEditor.cs`），用于兼容旧版 `Google.Protobuf`。不得手工修改生成的 C# 文件解决 `IBufferMessage`/`WriteContext`/`ParseContext` 错误。
4. 同步 `common/request_enum.h` 与客户端 `MessageNo.cs`/`UnoProtocol`。
5. 编译 `caiisvr`、`caiirobotsvr`、`caiichunksvr`、`caiilivesvr` 和客户端。
6. 不提交 `.linux-build`、日志、临时文件和编译产物。
7. 最少回归：重连、匹配、四人开局、普通出牌、摸牌后 Pass、+2/+4 叠加、最后一张 +2/+4 的强制惩罚后结算、无 +4 质疑窗口、漏喊 UNO、断线托管、取消托管、结算、观众聊天和三类送礼目标。
