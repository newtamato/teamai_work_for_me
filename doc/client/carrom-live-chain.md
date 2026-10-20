服务器侧看，**客户端并没有一个“开启直播房间”的独立开关请求**。房间是否可直播由 `caiisvr` 的 `GameBoutData::CanLive()` 自动判断；客户端发送的请求主要是连接 Live 服务并进入该直播间。

---

# 一、房间创建时：服务器判断是否允许直播

核心代码：

```text
caiisvr/playtype/game_bout_data.cpp
```

```cpp
bool GameBoutData::CanLive()
{
    if (config_.room_category == ERoomCategory::ERC_VIP)
        return allow_to_watch_;

    if (config_.room_category == ERoomCategory::ERC_GemRumble)
        return false;

    return !robot_bout_;
}
```

判断结果：

| 房间类型 | 直播条件 |
|---|---|
| 普通房 `ERC_Normal` | 无机器人时可以 |
| VIP 房 `ERC_VIP` | `allow_to_watch_ == true` |
| 钻石房 `ERC_GemRumble` | 永远不可以 |
| Unlimited 房 `ERC_Unlimited` | 无机器人时可以 |
| Elite 房 `ERC_Elite` | 无机器人时底层允许 |

VIP 房的 `allow_to_watch_` 来自：

```cpp
!static_cast<bool>(user->DisAllowToWatch())
```

位置：

```text
caiisvr/viproom/vip_room.cpp
```

---

# 二、游戏服向 Live 服务注册当前对局

当 Live 服务连接到 `caiisvr` 时，使用：

```cpp
CLIENT_TYPE_LIVE = 19
```

位置：

```text
caiisvr/server/game_server.cpp
```

Live 服务连接验证成功后：

```cpp
LiveClientManager::GetInstance().AddLiveSvrContext(...)
NotifyLiveAllGameBout();
```

`caiisvr` 遍历当前正在进行的桌子，只把满足以下条件的对局发送给 Live 服务：

```cpp
game_bout_data != nullptr
&& game_bout_data->CanLive()
&& game_bout_data->GetBoutVer() > 101
```

发送协议：

```text
GN_C_GAME_BOUT_LIST
```

消息：

```protobuf
game.live.LiveGameBoutListNotify
```

包含：

```text
room_id
table_no
room_category
bout_id
live_player_info
prize
```

代码位置：

```text
caiisvr/server/game_server.cpp
```

---

# 三、游戏开始后，caiisvr持续同步对局给caiilivesvr

`caiisvr` 会把游戏过程中的关键消息转发给 Live 服务，包括：

```text
GN_C_GAME_START
GN_C_STRIKER_MOVE
GN_C_STRIKER_POWER
GN_C_STRIKER_SHOOT
GN_C_SYNC_PUCK_NOTIFY
GN_C_GAME_RESULT
GN_C_TABLE_DISSOLVED
GN_C_TABLE_FORCE_DISSOLVE
```

Live 服务注册这些协议：

```text
caiilivesvr/busi/live_module.cpp
```

```cpp
AddMethod(GN_C_GAME_START, ...)
AddMethod(GN_C_GAME_RESULT, ...)
AddMethod(GN_C_TABLE_DISSOLVED, ...)
AddMethod(GN_C_STRIKER_MOVE, ...)
AddMethod(GN_C_STRIKER_POWER, ...)
AddMethod(GN_C_STRIKER_SHOOT, ...)
AddMethod(GN_C_SYNC_PUCK_NOTIFY, ...)
```

Live 服务根据这些消息建立和更新：

```text
LiveBout
```

并把对局状态同步给观众。

---

# 四、chunksvr维护可观看的Live房间列表

`caiilivesvr` 和 `caiichunksvr` 之间通过：

```text
GN_LIVE_GAME_START
GN_LIVE_GAME_RESULT
```

等协议同步直播状态。

chunksvr注册：

```text
caiichunksvr/busi/live_list_module.cpp
```

```cpp
AddMethod(GN_LIVE_GAME_START, &LiveListModule::OnLiveGameStart);
AddMethod(GN_LIVE_GAME_RESULT, &LiveListModule::OnLiveGameOver);
```

chunksvr中维护：

```text
live_room_container_
```

每个直播房间会包含：

```text
bout_id
room_category
section_id
live_player_info
audience_count
live_host
live_port
heat
peak_heat
game_will_end_time
```

---

# 五、客户端查询可观看的直播列表

这一步不是游戏房主发送，而是大厅中想观看其他玩家的客户端发送。

客户端通过 assist 发送：

```text
GR_LIVE_GAME_LIST_QUERYV2
```

代码：

```text
Carrom2/Assets/Scripts/Mgrs/GameLiveMgr.cs
```

返回：

```text
LiveGameBoutListResp
```

服务端主要返回：

```cpp
ERC_Unlimited
ERC_VIP
```

代码：

```text
caiichunksvr/busi/live_list_module.cpp
```

```cpp
FillLiveGameList(resp, 999, ERC_Unlimited);
FillLiveGameList(resp, 15, ERC_VIP);
```

因此公开直播列表主要是：

```text
Unlimited 房
VIP 房
```

客户端拿到列表后，会读取：

```text
bout_id
live_host
live_port
room_category
section_id
```

---

# 六、客户端连接 Live 服务

当客户端进入一个游戏房间后，游戏服的 `EnterGameResp` 或 `GameStartNotify` 会返回：

```text
LiveHost
LivePort
Guid
```

客户端保存：

```csharp
GlobalInfo.Instance.gameLiveBoutGuid
GlobalInfo.Instance.gameLiveServerIp
GlobalInfo.Instance.gameLiveServerPort
```

代码：

```text
Game.OnlineUnlimitedRoom/OnlineBoard/MultiRoundsOnlineUnlimitedBoard.cs
```

```csharp
DelayInitilizeLive(liveHost, livePort, guid);
```

然后：

```csharp
GameLiveClient.Instance.Active();
```

连接成功后触发：

```text
E_NETWORK_GAMELIVE_OPEN
```

随后调用：

```csharp
GameLiveClient.Instance.EnterGame();
```

---

# 七、客户端进入直播间发送的请求

客户端真正进入 Live 服务的请求是：

```text
GR_C_PLAYER_LIVE_ENTER
```

协议消息：

```protobuf
game.live.EnterGameLiveReq
```

客户端代码：

```text
Assets/Scripts/Network/GameLiveClient.cs
```

```csharp
EnterGameLiveReq req = new EnterGameLiveReq();

req.Userid = GlobalInfo.Instance.CurrentUserid;
req.Gameid = GlobalInfo.Instance.gameid;
req.Deviceid = GlobalInfo.Instance.deviceid;
req.Version = Application.version;
req.Guid = GlobalInfo.Instance.gameLiveBoutGuid;
req.PlayerExInfo = playerExInfo;

SendRequest(
    req,
    GR_C_PLAYER_LIVE_ENTER);
```

请求字段：

```text
userid
gameid
guid
player_ex_info
deviceid
version
```

这里的：

```text
guid
```

就是目标直播对局的 `bout_id`。

---

# 八、caiilivesvr处理进入直播请求

Live 服务注册：

```cpp
AddMethod(
    GR_C_PLAYER_LIVE_ENTER,
    &LiveModule::OnPlayerEnterLive);
```

代码：

```text
caiilivesvr/busi/live_module.cpp
```

处理函数：

```cpp
int LiveModule::OnPlayerEnterLive(...)
```

它会：

1. 根据 `req.guid()` 查找 `LiveBout`；
2. 判断用户是否被主播拉黑；
3. 判断用户是否被踢出；
4. 创建或更新 `Audience`；
5. 把观众加入直播间；
6. 返回当前直播间状态；
7. 向直播间其他客户端发送：

```text
GN_C_PLAYER_LIVE_ENTER
```

对应响应：

```text
EnterGameLiveResp
```

客户端注册响应：

```csharp
GR_C_PLAYER_LIVE_ENTER
```

收到成功响应后：

```csharp
E_NETWORK_GAMELIVE_ENTER_SUCCEED
```

---

# 九、直播开启后的其他协议

## 观众进入通知

```text
GN_C_PLAYER_LIVE_ENTER
```

## 观众离开通知

```text
GN_C_PLAYER_LIVE_LEAVE
```

## 查询观众列表

客户端请求：

```text
GR_CLIVE_AUDIENCE_REQ
```

服务端返回：

```text
GameLiveAudienceResp
```

## 房主踢出观众

客户端请求：

```text
GR_C_KICK_PLAYER
```

通知：

```text
GR_C_KICK_PLAYER_NTF
```

## 直播心跳

客户端持续发送：

```text
GR_C_PULSE
```

## 直播礼包

```text
GR_C_LIVE_GIFTBAG_QUERY
GR_C_LIVE_GIFTBAG_AWARD
GN_C_LIVE_GIFTBAG_STATUS
GR_C_LIVE_GIFTBAG_CONFIG
GN_C_LIVE_GIFTBAG_PROCESS
```

---

# 十、完整链路

```text
创建游戏房间
    ↓
caiisvr 创建 GameBoutData
    ↓
GameBoutData::CanLive()
    ↓
判断：
    VIP 是否允许围观
    是否是钻石房
    是否有机器人
    ↓
caiisvr 与 caiilivesvr 建立 Live 服务连接
    ↓
GN_C_GAME_BOUT_LIST
    ↓
caiilivesvr 建立 LiveBout
    ↓
caiilivesvr 同步游戏开始、击球、结算等消息
    ↓
chunksvr 接收并维护直播列表
    ↓
其他客户端发送 GR_LIVE_GAME_LIST_QUERYV2
    ↓
chunksvr 返回直播房间列表
    ↓
客户端拿到 live_host、live_port、bout_id
    ↓
GameLiveClient.Active()
    ↓
客户端发送 GR_C_PLAYER_LIVE_ENTER
    ↓
caiilivesvr::OnPlayerEnterLive()
    ↓
创建 Audience
    ↓
返回 EnterGameLiveResp
    ↓
观众收到 GN_C_GAME_START、GN_C_STRIKER_*、
GN_C_SYNC_PUCK_NOTIFY、GN_C_GAME_RESULT
    ↓
其他玩家观看对局
```

## 最重要的结论

客户端没有发送类似：

```text
OPEN_LIVE_ROOM
ENABLE_LIVE
START_LIVE
```

这样的请求。

直播是否开启，首先由服务器的：

```cpp
GameBoutData::CanLive()
```

决定。

客户端的关键请求是：

```text
GR_C_PLAYER_LIVE_ENTER
```

但它的含义是：

```text
连接 Live 服务并进入已经存在的直播对局
```

不是创建或开启直播房间。