# Carrom 社交系统迁移盘点

## 类型

架构盘点 / 跨端链路 / UNO 迁移原则

## 来源

- Linear: `GAM-10`
- 需求文档: `game_documents/UNO社交模块.xlsx`
- 盘点范围: `UnoOnline-Client/`、`caii-server/`

## 结论

原 Carrom 的好友、关注、粉丝、私聊和观战/直播链路已经存在，不应从零重写。UNO 第一阶段应优先复用已存在的通用链路，再按 UNO 需求屏蔽 Carrom 专属入口。

## 服务端链路

- 好友/关注/粉丝：`PlayerRelationModule`，关系数据使用 MySQL `tbl_player_follow`、`tbl_player_fans`，Redis `caii:player_follow_info:<userid>` 缓存，TTL 约 3 天。
- 亲密度：`PlayerFriendshipModule`，使用 `tbl_player_friendship`、关系 Redis 和 Top ZSET；UNO 若暂不做亲密度业务，不应顺带启用排行榜逻辑。
- 私聊：`CaiiPlayerMessageModule` / `PlayerMessageModule`，离线消息主要在 Redis 保存 7 天，次数数据使用 Redis 日 key 和 MySQL `tbl_player_message_times`。
- 观战/直播：分布在 `caiisvr`、`caiichunksvr`、`caiilivesvr` 和 GameTable/LiveBout/LiveChat，不是单一 spectator 模块。

## 客户端链路

- 社交入口：`LobbyFrameLauncher` → `LobbySocialBehaviour`。
- 好友/关注：`SocialFollowMgr` 注册关注、粉丝、推荐、黑名单请求和事件，列表使用多个 Scroll/Item Behaviour。
- 私聊：`PlayerMessageMgr` → Message 页面/聊天弹窗，除内存缓存外还有 `PlayerMessageDbContext`、`PlayerMessageDao` 和 SQLite 本地消息缓存。
- 观战：`GameLiveMgr` / `GameLiveConnector` / `LobbyExploreBehaviour` / `OnlineGameLiveBehaviour`。

## 工会/League 处理

文档明确工会暂不做。UNO 阶段应先屏蔽入口和访问链，不直接删除底层代码：

- 客户端不初始化 League Tab、League rank/member、League Chat、League donation；
- 服务端不从 UNO 新入口调用 `LeagueModule` 或 league Redis key；
- 保留协议、模块和公共 `league_id` 字段，避免破坏 Carrom 遗留路径；
- 只有确认没有其他业务依赖后，才考虑编译级拆除。

## 开发原则

1. 先盘点，再改造；先引用文件、符号、请求号和存储字段，再提出实现方案。
2. 优先复用原有好友/关注/私聊协议和数据模型，不重复建立第二套关系系统。
3. UNO 与 Carrom 的差异通过入口隔离、功能开关和调用链断开实现，默认不删除旧模块。
4. 跨端协议变化必须同步两端 proto、请求号和生成文件；生成文件只能使用服务器环境工具。
5. 服务端新增或改造前必须说明并发、幂等、Redis TTL、MySQL 频率、缓存回源和资源边界。
6. 不把高频路径的无缓存 MySQL 查询、Redis `HGETALL` 大响应或双写不一致带入 UNO 新功能。
7. 直播/观战默认只发送公共状态，禁止向观众下发其他玩家私有手牌或牌堆信息。
8. 每次跨端功能先完成服务端真实链路和必要测试，再进入客户端联调。
9. 代码、Prefab 和协议都先断开入口；删除文件必须在确认无依赖后单独决策。
10. 用户负责 Unity 实机和业务体验验收，Agent 负责代码、编译、链路证据和风险报告。

## 待决策

- UNO 第一阶段是否保留黑名单；
- 私聊是否保留 SQLite 缓存及消息过期策略；
- 观战需要支持哪些房间类型；
- 亲密度、排行榜和礼物相关链路是否完全关闭；
- `prop_item_config.json` 等服务端配置的 UNO 子集和下发边界。

## UNO 第一阶段确认范围

- 好友、关注、粉丝；
- 黑名单；
- 普通私聊；
- 观战和直播；
- 直播礼物。

客户端专项梳理确认：`LobbySocialBehaviour` 负责普通 Social 页签和列表刷新；`SocialFollowMgr` 负责关系/黑名单通信；`SocialFollowingPlayerButtons` 和 `SocialPlayerItem` 连接普通私聊和 Watch 入口；`PlayerMessageMgr` 负责私聊通信和 SQLite 缓存；礼物展示/发送还需要结合 `GameLiveConnector`、`GiftMgr`、资产配置和直播通知继续确认。

League/工会仍不属于第一阶段。应关闭 `LobbySocial` 的 League Tab，断开 `SocialLeague*`、`MessageLeagueChat*` 和工会礼物/捐赠入口，但保留底层文件以避免 Carrom 旧引用破坏编译。
