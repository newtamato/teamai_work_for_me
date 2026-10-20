# UNO 房间列表与 block/check 房间管理影响分析

> 本文中的“固定房间列表”是历史设计讨论，不代表当前 roomid 固定。当前 roomid 必须由大厅/服务端下发，不能硬编码。

本文记录 UNO 改造中，是否可以将房间列表从 blocksvr 管理改为本地固定配置，以及这样改会影响哪些链路。

## 1. 结论

可以将**客户端看到的房间列表**改成本地固定配置。

但不建议第一阶段完全去掉 blocksvr/checksvr 对房间和玩家状态的管理。

推荐方案：

```text
房间展示：caiihall 本地 fixed_rooms 配置
进房校验/玩家占用/断线续玩/后台踢人/状态通知：继续走 checksvr/blocksvr/blackhall 链路
```

这样可以先满足 UNO 第一版“只展示固定 4 人房”的需求，同时避免一次性破坏原来的玩家在线状态和后台控制链路。

---

## 2. 当前房间列表来源

### 2.1 caiihall 启动时从 blocksvr 拉房间

代码：

```text
caii-server/caiihall/client/block_client.cpp
```

函数：

```cpp
int32_t BlockClient::LoadRooms()
```

流程：

```text
BlockClient::LoadRooms()
  -> 向 blocksvr 发送 GR_GET_ROOMS
  -> blocksvr 返回 ROOMS/ROOM 结构
  -> 转成 hall::game::Room
  -> hall_cache_->InitRooms(rooms)
```

关键代码：

```cpp
REQUEST request(GR_GET_ROOMS, nullptr, 0);
SendRequest(request, response);

LPROOMS pRs = (LPROOMS)response.pDataPtr;
LPROOM pRoom = LPROOM((char*)response.pDataPtr + sizeof(ROOMS));

std::list<hall::game::Room> rooms;
for (int32_t i = 0; i < pRs->nRoomCount; i++) {
    if (pRoom->nGameID != GAMEID) {
        pRoom++;
        continue;
    }
    hall::game::Room room = GetPbRoomFromSt(*pRoom);
    rooms.emplace_back(room);
    pRoom++;
}

hall_cache_->InitRooms(rooms);
```

### 2.2 客户端请求房间列表时，caiihall 从缓存返回

代码：

```text
caii-server/caiihall/main_server.cpp
```

函数：

```cpp
int32_t MainServer::OnGetAreaRooms(...)
```

流程：

```text
客户端 -> HR_GET_AREA_ROOMS
caiihall -> hall_cache_->GetAllArea()
caiihall -> hall_cache_->GetAllRooms()
caiihall -> 按 areasfilter/roomsfilter 过滤
caiihall -> 返回 GetGameAreaRoomsResp
```

关键代码：

```cpp
std::unordered_map<int32_t, hall::game::Area> areas = hall_cache_->GetAllArea();
std::unordered_map<int32_t, hall::game::Room> rooms = hall_cache_->GetAllRooms();
auto rooms_filter = HallConfig::GetRoomsFilter();

for (auto& room_itr : rooms) {
    hall::game::Room& room(room_itr.second);
    ...
    *area_itr->second.add_rooms() = room;
}
```

所以：

```text
客户端展示房间列表这一步可以从 blocksvr 数据改成本地配置。
```

---

## 3. 但真正进游戏不只依赖 caiihall 房间列表

玩家点击房间进入游戏后，走的是 `caiisvr -> checksvr/blocksvr` 链路。

### 3.1 客户端进游戏入口

代码：

```text
caii-server/caiisvr/server/game_server.cpp
```

函数：

```cpp
int32_t GameServer::OnBlackHallEnter(...)
```

以及普通玩家：

```text
GR_C_ENTER_GAME -> GameCheck -> HR_ENTER_GAME_V2
```

`GameServer::OnBlackHallEnter()` 示例：

```cpp
hall::base::EnterGameReqV2 req2check;
req2check.set_userid(enter_room.nUserID);
req2check.set_gameid(enter_room.nGameID);
req2check.set_roomid(enter_room.nRoomID);
req2check.set_hardid(enter_room.szHardID);

TransmitReq2CheckSvr(context, HR_ENTER_GAME_V2, req2check);
```

### 3.2 check 返回 roomdata，caiisvr 根据 roomdata 创建房间

代码：

```text
caii-server/caiisvr/client/game_check.cpp
```

函数：

```cpp
int32_t GameCheck::OnEnterGameRespFromCheck(...)
```

关键代码：

```cpp
if (hall_resp.code() == kCommSucc) {
    GetGameSvr().GetGameRoomMgr().GetOrCreateRoom(hall_resp.roomdata());
}
```

也就是说：

```text
游戏服最终认的是 check/block 返回的 RoomData，不是 caiihall 展示给客户端的 Room PB。
```

---

## 4. GameRoom 创建依赖 RoomData.manages

代码：

```text
caii-server/caiisvr/manager/gameroom_mgr.cpp
```

函数：

```cpp
std::shared_ptr<GameRoom> GameRoomMgr::NewRoom(const game::base::RoomData& room_data)
```

关键代码：

```cpp
auto room_type = static_cast<ROOM_MANAGES_FLAG>(room_data.manages());
switch (room_type) {
case ROOM_MANAGES_FLAG::kRoomCarrom:
    room = std::make_shared<CarromRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomFreeStyle:
    room = std::make_shared<FreeStyleRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomPool:
    room = std::make_shared<PoolRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomUniversal:
    room = std::make_shared<UniversalRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomVip:
    room = std::make_shared<VIPRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomGemRumble:
    room = std::make_shared<GemRumbleRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomUnlimited:
    room = std::make_shared<UnlimitedRoom>(room_data);
    break;
case ROOM_MANAGES_FLAG::kRoomElite:
    room = std::make_shared<EliteRoom>(room_data);
    break;
default:
    LOG_ERROR("unknow room data");
    return nullptr;
}
```

因此如果 caiihall 本地配置了一个 block/check 不认识的 roomid：

```text
客户端能看到房间
但进游戏时 check/block 可能返回失败，或者返回不符合 UNO 预期的 RoomData
caiisvr 可能无法创建正确房间
```

第一阶段最好使用 check/block 已存在的 roomid，只是由 hall 固定展示它。

---

## 5. 完全去掉 blocksvr 房间管理的影响

### 5.1 玩家是否在其他房间

当前进游戏时，check/block 会参与判断玩家是否已在房间中。

`caiisvr` 也有本地断线续玩/房间冲突判断：

```cpp
if (user_old->get_room_id() != roomid) {
    enter_resp.set_code(kUserInOthreRoom);
}
```

如果绕过 check/block，风险：

```text
同一个玩家可能被多个房间/多个服务认为在线
断线重连可能进入错误房间
玩家在其他房间的占用状态无法及时清理
```

### 5.2 房间/桌子状态同步

当前游戏服会持续向 check/block/blackhall 通知状态。

常见通知包括：

```text
HN_ENTER_GAME_OK
HN_LEAVE_GAME
HN_START_GAME
NotifyBlackHall_UserEnter
NotifyBlackHall_UserLeave
NotifyBlackHall_StartGame
NotifyBlackHall_SwitchTable
```

相关代码分布：

```text
caii-server/caiisvr/client/game_check.cpp
caii-server/caiisvr/server/game_server.cpp
caii-server/caiisvr/base/game_table.cpp
caii-server/caiisvr/base/game_room.cpp
```

这些链路用于：

```text
后台房间人数
玩家所在房间查询
黑大厅桌子状态
后台踢人
断线续玩
离开/解散清理
```

如果完全去掉 block/check，需要替代这些状态管理能力。

### 5.3 后台控制

现有 block/hall 链路还处理：

```text
IR_UPDATE_ROOM
IR_UPDATE_ROOM_STATUS
IR_ADD_ROOM
GR_KICKOFF_ROOM_PLAYER
GR_LOGON_KICKOFF
```

影响：

```text
后台隐藏/开放房间可能失效
后台踢房间玩家可能失效
后台更新房间状态可能不再生效
```

---

## 6. 推荐改造方案

### 6.1 第一阶段：只本地化房间展示

新增 caiihall 本地固定房间配置，例如：

```ini
[fixed_rooms]
enable=1
count=1

roomid0=<server-assigned-roomid>  # 示例，不要硬编码历史测试值
areaid0=1
gameid0=1018
roomname0=UNO Room
gameip0=192.168.53.48
gameport0=4501
mpport0=4500
tablecount0=4000
chaircount0=4
mindeposit0=0
maxdeposit0=0
manages0=...
configs0=...
options0=0
status0=0
```

目标：

```text
客户端房间列表不再由 blocksvr 决定。
客户端只看到固定 UNO 4 人房。
```

但保留：

```text
caiihall -> blocksvr 登录/踢人/assist/查询玩家等链路
caiisvr -> checksvr/blocksvr 进房校验链路
caiisvr -> checksvr/blocksvr/blackhall 状态通知链路
```

### 6.2 第一阶段 roomid 选择

建议固定房间配置里的 roomid 使用 block/check 已存在的 roomid。

原因：

```text
check/block 仍需识别该 roomid
caiisvr 仍需从 check 返回 roomdata
避免客户端能看到房间但无法进入
```

### 6.3 第二阶段：逐步替换 check/block 房间状态

如果后续目标是完全摆脱 block/check 房间管理，需要补齐：

```text
本地房间定义
本地玩家房间占用表
本地断线续玩状态
本地踢人/封禁/后台控制接口
本地房间人数统计
本地桌子状态同步
本地跨服务玩家唯一在线/唯一房间控制
结算/离开清理一致性
```

这属于更大的服务治理改造，不建议和 UNO 第一版玩法替换同时做。

---

## 7. 已有临时配置能力

当前代码已支持 `roomsfilter` 白名单：

```ini
[roomsfilter]
filter=<server-assigned-roomid>  # 示例；实际值必须来自服务端配置
```

它的作用是：

```text
仍从 blocksvr 拉房间
但返回给客户端时只返回白名单房间
```

这不是完全本地固定房间列表，但可以作为过渡手段。

另外当前已加 UNO 展示配置：

```ini
[uno_room]
enable=1
only_four_chair=0
force_chair_count=4
```

作用：

```text
返回给客户端时强制 chaircount=4
```

该能力适合临时验证 UI/客户端流程，但不是最终的 fixed_rooms 本地房间源。

---

## 8. 最终建议

UNO 第一版建议走三步：

```text
1. 先用 roomsfilter + uno_room.force_chair_count=4 快速验证。
2. 再实现 caiihall fixed_rooms，本地固定返回 UNO 房间列表。
3. 保留 caiisvr -> check/block 的进房校验与状态通知，直到 UNO 核心玩法稳定。
```

不要第一阶段直接移除 block/check 房间管理。
