# Carrom 社交系统迁移盘点与 UNO 复用原则

- 类型：设计决策
- 状态：active
- 创建日期：2026-09-21（北京时间）
- 更新日期：2026-09-21（北京时间）
- 适用范围：UNO 社交模块（好友/关注/粉丝/私聊/观战/直播）复用 Carrom 链路
- 关键词：Carrom、社交、好友、关注、粉丝、私聊、观战、直播、复用、League、工会
- 来源：Linear GAM-10；需求文档 game_documents/UNO社交模块.xlsx；客户端与服务端代码盘点
- 验证方式：code-verified + document-derived
- 最近核实日期：2026-09-21
- 替代关系：无

## 内容

原 Carrom 的好友、关注、粉丝、私聊、观战/直播链路已存在，UNO 第一阶段应复用而非从零重写，再按 UNO 需求屏蔽 Carrom 专属入口。

服务端：好友/关注/粉丝走 `PlayerRelationModule`（MySQL `tbl_player_follow`/`tbl_player_fans`，Redis `caii:player_follow_info:<userid>` 缓存约 3 天）；私聊走 `CaiiPlayerMessageModule`/`PlayerMessageModule`（离线消息 Redis 约 7 天，次数 MySQL `tbl_player_message_times`）；观战/直播分布在 `caiisvr`/`caiichunksvr`/`caiilivesvr` 与 GameTable/LiveBout/LiveChat，不是单一模块。

客户端：社交入口 `LobbyFrameLauncher`→`LobbySocialBehaviour`；好友/关注 `SocialFollowMgr`；私聊 `PlayerMessageMgr` + SQLite 本地缓存；观战 `GameLiveMgr`/`GameLiveConnector`。

工会/League 第一阶段不做：屏蔽入口与访问链，不删底层代码，保留协议/模块/公共 `league_id` 字段，确认无其他业务依赖后才考虑编译级拆除。

## 证据与定位

- 需求：`game_documents/UNO社交模块.xlsx`
- 盘点范围：`UnoOnline-Client/`、`caii-server/`

## 下次行动

开发原则：先盘点再改造，引用文件/符号/请求号/存储字段后再提方案；复用原有协议与数据模型；UNO 与 Carrom 差异靠入口隔离/功能开关/断链实现，默认不删旧模块；跨端协议变化同步两端 proto/请求号/生成文件（生成文件只用服务器工具）；新增服务端逻辑说明并发/幂等/TTL/频率/缓存回源。待决策：黑名单是否保留、私聊 SQLite 缓存与过期、观战房间类型、亲密度/排行榜/礼物是否关闭、服务端配置 UNO 子集。

## 失效条件

- 复用策略、模块拆除或 UNO 第一阶段范围改变时重新核实。
- 确认无其他业务依赖并决定编译级拆除旧模块时更新本条目。

## 变更记录

- 2026-09-21：由 TeamAI 知识迁移；GAM-10 社交系统盘点，确定第一阶段复用范围。
