这部分可以复用相当多现有基础设施，但要把“游戏同步”和“直播互动”分开设计。

当前 Carrom 的直播系统实际上有三条链路：

```text
1. 游戏状态直播
2. 直播聊天
3. 直播送礼
```

UNO 需要增加对应的：

```text
GN_C_UNO_GAME_START
GN_C_UNO_TABLE_STATE
GN_C_UNO_PLAY_CARD
GN_C_UNO_DRAW_CARD
GN_C_UNO_ACTION
GN_C_UNO_GAME_RESULT
GN_C_UNO_BOUT_DISSOLVE
```

这部分只负责：

- 牌局开始；
- 当前玩家；
- 出牌；
- 摸牌；
- +4 质疑；
- 喊 UNO；
- 托管；
- 结算；
- 对局结束。

---

# 二、直播聊天

聊天并不依赖 `LiveBout` 的 Carrom 游戏消息，而是由独立的：

```cpp
LiveChat
```

管理。

代码：

```text
caiilivesvr/live_cache/live_chat.cpp
caiilivesvr/busi/live_module.cpp
```

## 进入聊天

客户端发送：

```text
GR_C_PLAYER_CHAT_ENTER
```

消息：

```protobuf
game.live.EnterGameChatReq
```

字段：

```text
userid
gameid
guid
visitor
room_category
chat_voice_info
player_ex_info
```

服务端处理：

```cpp
LiveModule::OnPlayerEnterChat()
```

它会：

1. 根据 `guid` 查找 `LiveChat`；
2. 检查黑名单；
3. 创建或更新 `Chatter`；
4. 加入聊天房间；
5. 返回当前聊天成员；
6. 广播：

```text
GN_C_PLAYER_CHAT_ENTER
```

退出聊天：

```text
GR_C_PLAYER_CHAT_LEAVE
GN_C_PLAYER_CHAT_LEAVE
```

发送聊天消息：

```text
GR_C_TABLE_CHAT
```

消息：

```protobuf
game.live.TableChat
```

服务端执行：

```cpp
LiveChat::DealPlayerChat()
```

然后广播：

```text
GN_C_TABLE_CHAT_NOTIFY
```

## UNO 如何接入聊天

UNO 不需要创建 Carrom 的 `GameBoutData`，但在创建 UNO Live 对局时，应同时创建：

```text
LiveChat(bout_id)
```

并把 UNO 的 4 个对战玩家加入：

```cpp
chat->AddPlayer(userid);
```

Carrom 当前是在收到游戏开始消息时创建聊天：

```cpp
auto chat = std::make_shared<LiveChat>(bout_id, ntf.bout_type());

for (auto player_info : game_start.players()) {
    chat->AddPlayer(player_info.userid());
}

chat->FillChatBoutInfo(...);
LiveCacheMgr.AddLiveChat(chat);
```

UNO 应新增类似：

```cpp
CreateUnoLiveChat(...)
```

但不要解析：

```cpp
game::carrom::GameStartNotify
```

建议给 `LiveChat` 增加一个通用初始化接口，例如：

```cpp
void FillUnoChatBoutInfo(
    int section_id,
    int room_id,
    int table_no,
    const std::vector<int>& players);
```

这样观战玩家和 UNO 对战玩家都可以进入同一个聊天房间。

---

# 三、观战玩家与对战玩家的连接区别

现有系统中，游戏直播和聊天是两个逻辑连接。

## 直播连接

客户端使用：

```text
GR_C_PLAYER_LIVE_ENTER
```

进入：

```text
LiveBout
```

接收游戏状态。

## 聊天连接

客户端使用：

```text
GR_C_PLAYER_CHAT_ENTER
```

进入：

```text
LiveChat
```

发送和接收聊天消息。

因此 UNO 客户端应该同时建立：

```text
UnoLiveClient
UnoChatClient
```

或者继续复用底层连接类，但协议处理必须区分 UNO。

---

# 四、直播送礼

送礼不是直接发给 `caiilivesvr`，而是先发给 assist/chunksvr。

客户端代码：

```text
Carrom2/Assets/Scripts/Mgrs/GiftMgr.cs
```

客户端发送：

```text
GR_LIVE_GIFT_SEND
```

消息：

```protobuf
game.busi.LiveGiftSendReq
```

关键字段：

```text
userid
to_userid
source_tag
prop_id
req_guid
scene
```

在游戏直播场景中：

```text
scene = 0
source_tag = bout_id
to_userid = 对战玩家 userid
```

客户端调用逻辑类似：

```csharp
GiftMgr.Instance.RequestSendGift(
    toUserId,
    giftPropId,
    boutId,
    sendPos,
    false);
```

---

# 五、送礼服务端链路

完整链路是：

```text
观战客户端
    ↓ GR_LIVE_GIFT_SEND
assist
    ↓
chunksvr::LiveGiftModule
    ↓
检查礼物配置、余额、折扣、免费礼物
    ↓
外部商城/财富系统扣除金币或钻石
    ↓
记录送礼、排行榜、任务、好友度
    ↓ GN_LIVE_GIFT_SEND
caiilivesvr
    ↓
LiveChat::DealPlaySendGift()
    ↓
GN_C_PLAYER_GIFT
    ↓
聊天房间内所有客户端
```

chunksvr 处理函数：

```cpp
LiveGiftModule::DealSendPlayerGift()
```

它会：

1. 解析 `LiveGiftSendReq`；
2. 从 `source_tag` 取得 `bout_id`；
3. 校验礼物类型；
4. 判断免费礼物；
5. 调用商城接口扣费；
6. 更新送礼和收礼记录；
7. 更新排行榜、任务、好友度；
8. 发送：

```cpp
GN_LIVE_GIFT_SEND
```

发送条件：

```cpp
if (req.scene() == kInGame) {
    GetSockSvr()->NotifyAllLiveSvr(GN_LIVE_GIFT_SEND, req);
}
```

---

# 六、caiilivesvr如何广播礼物

Live 服务收到：

```text
GN_LIVE_GIFT_SEND
```

处理：

```cpp
LiveModule::OnChunkGiftSend()
```

它根据：

```cpp
req.source_tag()
```

查找：

```text
LiveChat
```

然后：

```cpp
chat->DealChatMessage(GN_LIVE_GIFT_SEND, req);
```

最终进入：

```cpp
LiveChat::DealPlaySendGift()
```

它会把 `LiveGiftSendReq` 包装成：

```protobuf
game.live.TableChat
```

并设置：

```text
msg.flag = kChatGift
msg.data = LiveGiftSendReq
```

然后广播：

```text
GN_C_PLAYER_GIFT
```

客户端的 `GiftShowBehaviour` 会解析：

```text
TableChat.msg.data
```

再还原成：

```protobuf
LiveGiftSendReq
```

最后播放礼物动画。

---

# 七、UNO 送礼需要改什么

如果 UNO 复用现有互动链路，chunksvr 基本不需要新增送礼逻辑。

只需要保证：

```text
UNO 的 bout_id
```

在所有服务中保持一致：

```text
caiisvr
caiilivesvr
chunksvr
客户端
```

客户端送礼时：

```text
source_tag = UNO bout_id
to_userid = UNO 对战玩家 userid
scene = 0
```

然后 chunksvr 会照常：

```text
扣除金币/钻石
记录礼物
通知 caiilivesvr
广播 GN_C_PLAYER_GIFT
```

但是 `caiilivesvr` 必须已经创建：

```text
LiveChat(UNO bout_id)
```

否则这里会找不到聊天房间：

```cpp
LiveCacheMgr.GetLiveChat(bout_id)
```

日志会类似：

```text
find chat_bout[...] failed
```

所以 UNO 开播时必须同时注册：

```text
UnoLiveBout
UnoLiveChat
```

---

# 八、聊天和礼物不应该绑定到 Carrom 类型

当前 `LiveChat` 已经基本是通用的：

```text
LiveChat
Chatter
Audience
TableChat
LiveGiftSendReq
GN_C_TABLE_CHAT_NOTIFY
GN_C_PLAYER_GIFT
```

它本身不要求 Carrom 牌局，只需要：

```text
bout_id
玩家列表
聊天成员
```

真正和 Carrom 强绑定的部分主要是：

```cpp
LiveModule::OnGameStartNotify()
```

因为这里写死了解析：

```cpp
game::carrom::GameStartNotify
game::carrom::GameMultiRoundsData
```

所以建议改为：

```text
CarromLive 创建流程
UNO Live 创建流程
共同使用 LiveChat
```

而不是复制一套聊天、礼物系统。

---

# 九、推荐的 UNO 直播对象关系

```text
UnoGameTable
 ├─ UnoLiveBoutMetadata
 ├─ UnoGame
 └─ UNO 玩家列表
          │
          ├──────────────→ caiilivesvr::UnoLiveBout
          │
          └──────────────→ caiilivesvr::LiveChat
                                  ├─ 对战玩家
                                  ├─ 观战玩家
                                  └─ 礼物与聊天
```

其中：

```text
UnoLiveBout
```

负责：

- UNO 游戏状态；
- UNO 动作同步；
- 观众接入；
- 对局结束。

```text
LiveChat
```

负责：

- 玩家加入聊天；
- 观众加入聊天；
- 文本聊天；
- 语音聊天；
- 礼物广播；
- 观众离开。

---

# 十、建议的协议划分

## UNO 游戏同步协议

```text
GN_C_UNO_GAME_BOUT_LIST
GN_C_UNO_GAME_START
GN_C_UNO_TABLE_STATE
GN_C_UNO_PLAY_CARD
GN_C_UNO_DRAW_CARD
GN_C_UNO_ACTION
GN_C_UNO_GAME_RESULT
GN_C_UNO_BOUT_DISSOLVE
```

## 通用直播进入协议

可以继续复用：

```text
GR_C_PLAYER_LIVE_ENTER
GR_C_PLAYER_CHAT_ENTER
GR_C_PLAYER_CHAT_LEAVE
GR_CLIVE_AUDIENCE_REQ
```

或者为了避免 Carrom/UNO 混淆，增加：

```text
GR_C_UNO_PLAYER_LIVE_ENTER
GR_C_UNO_PLAYER_CHAT_ENTER
```

但从现有代码看，`LiveChat` 和 `LiveBout` 已经可以根据 `bout_id` 区分房间，协议层不一定需要复制。

## 通用聊天协议

建议直接复用：

```text
GR_C_TABLE_CHAT
GN_C_TABLE_CHAT_NOTIFY
GN_C_PLAYER_CHAT_ENTER
GN_C_PLAYER_CHAT_LEAVE
```

## 通用送礼协议

直接复用：

```text
GR_LIVE_GIFT_SEND
GN_LIVE_GIFT_SEND
GN_C_PLAYER_GIFT
```

---

# 十一、一个重要的安全校验

当前 chunksvr 的送礼逻辑主要使用：

```cpp
source_tag = bout_id
```

来转发礼物，但它不是完整的游戏状态校验。

UNO 接入后建议在 `caiilivesvr::OnChunkGiftSend()` 增加：

```text
bout_id 是否存在
to_userid 是否是该直播间对战玩家
直播间是否仍然有效
```

尤其要校验：

```text
to_userid ∈ UnoLiveBout.players
```

避免：

- 给不在直播间的玩家送礼；
- 使用旧 bout_id 送礼；
- 对局结束后继续转发礼物；
- 伪造 `to_userid`。

---

## 最终建议

UNO 不需要重新实现完整的聊天和送礼系统。

推荐复用：

```text
LiveChat
Chatter
TableChat
LiveGiftSendReq
GR_LIVE_GIFT_SEND
GN_LIVE_GIFT_SEND
GN_C_PLAYER_GIFT
```

只新增：

```text
UnoLiveBout
UNO 游戏状态同步协议
UNO 直播创建和销毁流程
UNO 直播/聊天房间元数据初始化
```

核心是：

```text
UNO bout_id 必须同时存在于：
caiisvr
caiilivesvr LiveBout
caiilivesvr LiveChat
chunksvr 直播列表
客户端 LiveClient
客户端 ChatClient
```

这样观战玩家就可以同时实现：

```text
观看 UNO 对局
发送聊天
给 UNO 对战玩家送礼
接收礼物动画
查看观众列表
```