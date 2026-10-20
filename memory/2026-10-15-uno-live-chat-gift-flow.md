# UNO 聊天与礼物链路经验

- 类型：工程经验
- 状态：active
- 创建日期：2026-10-15（北京时间）
- 更新日期：2026-10-15（北京时间）
- 适用范围：UNO 玩家、观众、Unity 客户端、caii-test 的实时聊天与礼物问题
- 关键词：UNO、LiveChat、GameChatClient、LiveClient、GR_C_TABLE_CHAT、GN_C_TABLE_CHAT_NOTIFY、GR_LIVE_GIFT_SEND、GN_C_PLAYER_GIFT、4530、4531
- 来源：本次聊天/礼物联调；客户端与服务器代码及 192.168.53.48 实测
- 验证方式：code-verified + test-verified
- 最近核实日期：2026-10-15
- 替代关系：无

## 内容

### 1. 服务职责与端口

```text
Hall/Assist discovery
        |
        +-- caiisvr : UNO 游戏、匹配、SendEnterGame、牌局通知
        |
        +-- caiilivesvr : LiveBout/LiveChat、玩家/观众聊天、礼物通知广播
        |
        +-- caiiassistsvr : Assist 协议入口
        |
        +-- caiichunksvr : 礼物业务、扣费/道具校验、LiveGiftModule
```

- Unity 使用 Hall 广告的 live MP/proxy 入口（当前通常为 4581）；caii-test 在内网测试时直接连接 caiilivesvr 的 Live socket 4580。
- `4530` 是 Unity 客户端使用的 Assist MP/代理入口。
- `4531` 是内网测试工具直接连接 `caiiassistsvr` 的入口；caii-test 礼物测试必须使用 4531，不能使用 4530。
- `caiisvr` 的 UNO 游戏 socket 当前为 Hall 广告的 game endpoint（测试环境 4500）。

### 2. LiveChat 创建和进入

UNO 开局通知到达 `caiilivesvr` 后，`UnoLiveModule` 创建/维护 `UnoLiveBout` 和 `LiveChat`。通用聊天逻辑在：

- `caiilivesvr/busi/live_module.cpp`
- `caiilivesvr/uno_live/uno_live_module.cpp`
- `caiilivesvr/live_cache/live_chat.cpp`

玩家或观众通过 `GR_C_PLAYER_CHAT_ENTER` 加入指定 `bout_id`。`LiveModule::OnPlayerEnterChat` 创建 `Chatter`，调用 `LiveChat::ChatterEnter`，保存到 `chatter_map_`，并返回当前 chatters。

UNO 服务内不应再用 `bout_id` 是否以 `uno-` 开头来决定是否处理；`LiveModule` 与 `UnoLiveModule` 当前共同服务 UNO。

### 3. 玩家/观众聊天

发送方（玩家或观众）必须先进入同一 `LiveChat`，然后通过 `GameChatClient/LiveClient` 发送：

```text
GR_C_TABLE_CHAT + TableChat
        |
        v
caiilivesvr::UnoLiveModule::OnPlayerChatMessage
        |
        v
LiveModule::OnPlayerChatMessage
        |
        +-- 按 token 查找 Chatter
        +-- 检查禁言/敏感词
        +-- LiveChat::DealChatMessage
        +-- 返回 GR_C_TABLE_CHAT / TableChatResp(code=0)
        +-- 广播 GN_C_TABLE_CHAT_NOTIFY 给同 bout 的其他 chatters
```

当前普通聊天广播会屏蔽发送者自身；因此发送者的本地气泡依赖 response：

```text
GR_C_TABLE_CHAT response
 -> ChatRoomMgr.NetworkGameChatResponse
 -> DealMyChatMsg
 -> DealChatMsg
 -> E_NETWORK_GAMECHAT_MSG
 -> ChatQuickView.OnChatMsgRecived
```

其他玩家和观众通过 `GN_C_TABLE_CHAT_NOTIFY` 收到消息。也就是说：

- 玩家发消息：同一 LiveChat 的其他玩家、观众收到通知；发送玩家自己由 response 本地显示。
- 观众发消息：同一 LiveChat 的玩家和其他观众收到通知；观众自己同样由 response 本地显示。
- 如果服务器收到了请求但没有 `DealMyChatMsg`，先确认 response code 和 `GameChatClient` 的 `GR_C_TABLE_CHAT` handler，不要先怀疑 `chatter_map_`。

### 4. 礼物链路

礼物不能使用 UNO 游戏 socket 的旧礼物路径。统一路径为：

```text
客户端/内网测试 AssistClient
  |
  +-- GR_LIVE_GIFT_SEND + LiveGiftSendReq
       |
       v
caiiassistsvr（4530 代理；caii-test 直连 4531）
       |
       v
caiichunksvr/busi/live_gift_module.cpp
       |
       +-- 校验 userid/to_userid/prop_id/余额/道具
       +-- 扣费或购买道具
       +-- 返回 LiveGiftSendResp
       +-- 转发 GN_LIVE_GIFT_SEND
       v
caiilivesvr
       |
       v
LiveChat::DealPlaySendGift / DealSendPlayerGift
       |
       v
GN_C_PLAYER_GIFT
```

`GN_C_PLAYER_GIFT` 的 payload 是 `TableChat`，礼物请求序列化在 `TableChat.msg.data` 中。所有同一 `LiveChat` 的非机器人 chatter（包括发送者、目标玩家、其他玩家和观众）都应收到礼物通知。

UNO 礼物的 `source_tag` 应使用当前 UNO 开局 GUID（客户端使用保存的 `GlobalInfo.unoGameStartNotify.Guid`；caii-test 使用 `UnoGameStartNotify.guid`）。caii-test 当前固定使用 `prop_id=26001`。

### 5. caii-test 正确测试方式

`caii-test --live-flow --userids p1,p2,p3` 的 LiveFlow 必须：

1. 三个账号进入同一 UNO 牌局；
2. 三个账号各自建立 `LiveTestClient`，直连 `caiilivesvr:4580`；
3. 三个账号执行 `GR_C_PLAYER_CHAT_ENTER`；
4. 三个账号随机发送多条 `GR_C_TABLE_CHAT`；
5. 三个账号各自连接 `caiiassistsvr:4531`；
6. 使用 `GR_LIVE_GIFT_SEND`、固定 `prop_id=26001` 随机互送礼物；
7. 检查 `LiveGiftSendResp.code=0` 与三个 LiveClient 的 `GN_C_PLAYER_GIFT`。

只使用 `UnoTestClient` 的游戏 socket 发聊天/礼物，不能验证 LiveChat/LiveGift 链路。发送礼物前必须已经拿到动态 `bout_id`；三人没有 `GAME_START` 时，LiveClient 和礼物阶段不会开始。

## 证据与定位

- 服务端聊天：`caii-server/caiilivesvr/busi/live_module.cpp:OnPlayerEnterChat/OnPlayerChatMessage`
- 服务端 LiveChat：`caii-server/caiilivesvr/live_cache/live_chat.cpp`
- UNO 服务入口：`caii-server/caiilivesvr/uno_live/uno_live_module.cpp`
- 服务端礼物业务：`caii-server/caiichunksvr/busi/live_gift_module.cpp`
- Unity 聊天 response：`UnoOnline-Client/Assets/Scripts/Chat/ChatRoomMgr.cs`
- Unity 快速气泡：`UnoOnline-Client/Assets/Scripts/Chat/ChatQuickView.cs`
- 内网 Live 测试：`caii-server/caii-test/live_flow_test.h`
- 实测成功日志：`/tmp/caii-test-live-flow-3-human.log`
- 已验证：玩家/观众聊天互收；Assist 4531 发送 `GR_LIVE_GIFT_SEND`；prop 26001 返回 code=0；`GN_C_PLAYER_GIFT` 到达三个 LiveClient。

## 下次行动

遇到 UNO 聊天/礼物问题，按以下顺序检查：

1. 确认 UNO `GAME_START` 和动态 `bout_id` 已产生。
2. 确认玩家/观众都执行 `GR_C_PLAYER_CHAT_ENTER`，服务端有 `ChatterEnter` 和正确 bout。
3. 聊天检查 `OnPlayerChatMessage`、`TableChatResp`、`GN_C_TABLE_CHAT_NOTIFY`；发送者气泡检查 Unity `DealMyChatMsg`。
4. 礼物确认 endpoint：Unity 4530，caii-test 4531；确认 Assist context upload、`GR_LIVE_GIFT_SEND`、`LiveGiftSendResp`。
5. 再查 `caiichunksvr/live_gift_module.cpp` 的业务日志和 `caiilivesvr` 的 `OnChunkGiftSend/DealPlaySendGift`。
6. 最后检查 LiveClient 是否进入同一 bout 以及是否收到 `GN_C_PLAYER_GIFT`。

## 失效条件

- Assist 端口、Live socket 端口或代理拓扑改变时重新核实。
- 礼物协议、通知 payload 或客户端自显逻辑改变时重新核实。
- UNO 改回多游戏共用 `LiveModule` 时，重新确认是否需要游戏类型路由；当前约定是不使用 `uno-` 前缀判断。

## 变更记录

- 2026-10-15：新增；依据本次服务器、Unity、caii-test 联调及成功的聊天/礼物实测。
