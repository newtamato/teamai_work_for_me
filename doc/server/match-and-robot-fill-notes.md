# caii-server 匹配与机器人补位逻辑

本文记录玩家匹配时，服务端如何在找不到真人对手后召唤机器人补齐桌子的代码链路。

## 结论

补机器人不是客户端逻辑，也不是 `caiirobotsvr` 主动扫描匹配池。

主流程是：

```text
玩家进入匹配
  -> caiisvr 将玩家放入匹配池
  -> caiisvr 定时执行 MatchPlayer()
  -> 优先按隐藏分/国家分组/配置时间匹配真人
  -> 超过匹配配置最后一档后，认为需要机器人
  -> caiisvr 先把真人切到正式游戏桌，桌子状态设为 kTableWaiting
  -> 桌子检测缺人后 CallRobot()
  -> caiisvr 转发 GN_C_CALL_ROBOT 给 caiirobotsvr
  -> caiirobotsvr 从已登录机器人池选择一个机器人
  -> caiirobotsvr 发送 GR_C_ROBOT_ENTERGAME 让机器人进桌
```

关键文件：

```text
caii-server/caiisvr/utils/table_match_timer.cpp
caii-server/caiisvr/base/game_room.cpp
caii-server/caiisvr/base/game_table.cpp
caii-server/caiisvr/server/game_server.cpp
caii-server/caiirobotsvr/client/game_client.cpp
caii-server/caiirobotsvr/robot/robot_mgr.cpp
caii-server/caiisvr/config/match_config.json
```

---

## 1. 匹配定时入口

文件：

```text
caii-server/caiisvr/utils/table_match_timer.cpp
```

入口函数：

```cpp
void GameTableMatchTimer::CheckRoomsMatch()
{
    auto rooms = GetGameSvr().GetGameRoomMgr().GetAllRooms();
    for (const auto& itr : rooms) {
        auto room = itr.second;
        room->MatchPlayer();
    }
}
```

含义：`caiisvr` 定时遍历所有房间，调用每个房间的 `MatchPlayer()`。

---

## 2. 玩家进入匹配池

文件：

```text
caii-server/caiisvr/base/game_room.cpp
```

函数：

```cpp
void GameRoom::AddMatchPlayer(std::shared_ptr<GameUser> match_user)
```

核心逻辑：

```cpp
match_user->match_time = now;
match_pool_[match_key][user_score].emplace(userid, match_user);
waiting_pool_[now].emplace(userid, match_user);
match_user->match_robot_rand = robot_match_rand > 0 ? rand() % robot_match_rand : 0;
```

含义：

- `match_time`：记录玩家开始匹配的时间。
- `match_key`：匹配维度，例如玩法、局数等。
- `user_score`：匹配分，默认来自 `GetUserMatchScore()`，普通房里通常是隐藏分。
- `match_robot_rand`：部分房间可以配置机器人召唤随机延迟。

---

## 3. 真人匹配与超时判定

文件：

```text
caii-server/caiisvr/base/game_room.cpp
```

函数：

```cpp
void GameRoom::MatchPlayer()
```

核心判断：

```cpp
param_player1 = MatchParams::GetMatchParam(get_room_id(), match_time, match_player->match_robot_rand);
score_diff = param_player1.score_diff;

if (score_diff < 0) {
    // 分差小于0，超时了
    match_success = true;
    match_player2 = nullptr;
    LOG_TRACE("times up, match robot.");
}
```

含义：

- `score_diff >= 0`：继续尝试匹配真人。
- `score_diff < 0`：匹配配置已超时，本轮匹配结果为“需要机器人”。
- `match_player2 = nullptr` 是后续判断“缺真人对手”的关键标记。

---

## 4. 匹配参数配置

文件：

```text
caii-server/caiisvr/config/match_config.json
```

默认配置示例：

```json
{
  "roomid": -1,
  "match_time": 2,
  "score_diff": 50,
  "match_type": 1,
  "rand": 0
}
```

字段含义：

- `roomid`：房间 ID，`-1` 表示默认配置。
- `match_time`：匹配等待时间，代码加载时会转成毫秒。
- `score_diff`：允许的隐藏分差。
- `match_type`：匹配类型。
  - `1`：同分组优先/要求同组阶段。
  - `0`：不限分组阶段。
- `rand`：最后召唤机器人时可附加的随机等待时间。

默认配置大致策略：

```text
2 秒内：隐藏分差 <= 50，同组
4 秒内：隐藏分差 <= 50，不限组
7 秒内：隐藏分差 <= 150，同组
10 秒内：隐藏分差 <= 150，不限组
15 秒内：隐藏分差 <= 200，同组
20 秒内：隐藏分差 <= 200，不限组
超过最后一档：返回默认 MatchParameter，score_diff 为 -1，触发机器人
```

对应代码：

```text
caii-server/caiisvr/manager/game_config.cpp
```

```cpp
MatchParams::MatchParameter MatchParams::GetMatchParam(int roomid, int64_t match_time, int match_robot_rand)
```

当超过最后一档 `match_time + rand` 后，会返回默认 `MatchParameter()`，其 `score_diff` 默认为 `-1`，于是 `GameRoom::MatchPlayer()` 判断为超时补机器人。

---

## 5. 超时后切到正式游戏桌

文件：

```text
caii-server/caiisvr/base/game_room.cpp
```

`GameRoom::MatchPlayer()` 在形成匹配结果后，会发内部消息：

```cpp
GS_C_SWITCH_TO_GAME_TABLE
```

然后进入：

```cpp
int32_t GameRoom::PlayerMatchOK(const game::carrom::SwitchTableInner& notify)
```

关键逻辑：

```cpp
if (table->GetPlayerCount() == 2) {
    table->set_table_status(kTableWaitingStart);  // 人够了，直接等待开始
} else {
    table->set_table_status(kTableWaiting);       // 人不够，去找机器人
}
```

含义：

- 如果匹配到真人，桌子人数够，进入 `kTableWaitingStart`。
- 如果超时没真人，桌上只有主玩家，进入 `kTableWaiting`，等待机器人补位。

---

## 6. 桌子检测缺人并召唤机器人

文件：

```text
caii-server/caiisvr/base/game_room.cpp
```

函数：

```cpp
void GameRoom::CheckTablesStart()
```

关键逻辑：

```cpp
if (table->IsNeedRobot()) {
    (void)table->CallRobot();
}
```

`IsNeedRobot()` 在：

```text
caii-server/caiisvr/base/game_table.cpp
```

```cpp
bool GameTable::IsNeedRobot()
```

核心条件：

```cpp
if (get_table_status() != kTableWaiting) {
    return false;
}

if (1 <= player_count && player_count < get_chair_count()) {
    // 存在真实玩家才召唤机器人
} else {
    return false;
}
```

并且有防重复召唤间隔：

```cpp
int default_wait_robot_ms = 3000;
```

含义：桌子状态是 `kTableWaiting`，且桌上有真人但未满座，才会召唤机器人。

---

## 7. caiisvr 构造 CallRobot 消息

文件：

```text
caii-server/caiisvr/base/game_table.cpp
```

函数：

```cpp
int32_t GameTable::CallRobot()
```

核心字段：

```cpp
game::carrom::CallRobot notify;
notify.set_roomid(get_room_id());
notify.set_tableno(get_table_no());
notify.set_entry_fee(get_entry_fee());
notify.set_playerid(...);
notify.set_bout_count(...);
notify.set_player_score(game_user->HideScore());
notify.set_player_trophy(game_user->Trophy());
notify.set_player_max_trophy(game_user->MaxTrophy());
```

发送：

```cpp
GetGameSvr().PutRequest2Worker(GN_C_CALL_ROBOT, context, notify);
```

协议定义：

```text
caii-server/pb/game/game.proto
```

```proto
message CallRobot {
    int32 roomid = 1;
    int32 tableno = 2;
    int64 entry_fee = 3;
    int32 bout_count = 4;
    int32 player_score = 5;
    int32 player_trophy = 6;
    int32 player_max_trophy = 7;
    int32 playerid = 20;
}
```

---

## 8. caiisvr 转发给 caiirobotsvr

文件：

```text
caii-server/caiisvr/server/game_server.cpp
```

函数：

```cpp
int32_t GameServer::OnCallRobot(...)
```

核心逻辑：

```cpp
auto robotsvr_context = GetRobotSvrContext();
NotifyOneClient(GN_C_CALL_ROBOT, robotsvr_context->hSocket, robotsvr_context->lTokenID, request.pDataPtr, request.nDataLen);
```

含义：`caiisvr` 保存了机器人服连接上下文，收到内部 `GN_C_CALL_ROBOT` 后转发给 `caiirobotsvr`。

---

## 9. caiirobotsvr 接收召唤并选机器人

入口文件：

```text
caii-server/caiirobotsvr/client/game_client.cpp
```

函数：

```cpp
int32_t GameClient::OnCallRobot(...)
```

它解析 `CallRobot` 后转给：

```text
caii-server/caiirobotsvr/robot/robot_mgr.cpp
```

```cpp
RobotMgr::OnCallRobot()
```

选机器人：

```cpp
std::shared_ptr<Robot> robot = GetEnterGameRobot(*call_robot.get());
```

具体函数：

```cpp
std::shared_ptr<Robot> RobotMgr::GetEnterGameRobot(const game::carrom::CallRobot& call)
```

核心条件：

```cpp
if ((*itr)->get_deposit() >= call.entry_fee()) {
    robot = *itr;
    logon_robots_.erase(itr);

    robot->set_entry_fee(call.entry_fee());
    robot->GenerateFakeInfo(call.player_score(), call.player_trophy(), call.player_max_trophy());
    robot->set_roomid(call.roomid());
    robot->set_tableno(call.tableno());
    robot->set_playerid(call.playerid());
    break;
}
```

含义：

- 从 `logon_robots_` 可用机器人队列里挑选。
- 要求机器人金币/资产 `deposit >= entry_fee`。
- 根据真人隐藏分、奖杯、最高奖杯生成机器人伪装信息和难度。
- 放入 `ingame_robots_`。

---

## 10. caiirobotsvr 发送机器人进桌

文件：

```text
caii-server/caiirobotsvr/robot/robot_mgr.cpp
```

函数：

```cpp
RobotMgr::OnCallRobot()
```

构造：

```cpp
std::shared_ptr<game::carrom::RobotEnterGameReq> enter_req = std::make_shared<game::carrom::RobotEnterGameReq>();
enter_req->set_userid(robot->get_userid());
enter_req->set_gameid(CARROM_GAMEID);
enter_req->set_roomid(call_robot->roomid());
enter_req->set_tableno(call_robot->tableno());
enter_req->set_hide_score(robot->get_hide_score());
```

发送：

```cpp
game_client_->TransmitMsg(GR_C_ROBOT_ENTERGAME, robot, enter_req);
```

`caiisvr` 收到后走机器人进桌逻辑，最终调用类似：

```cpp
GameRoom::RobotEnterGame(...)
```

当桌上机器人补齐后：

```cpp
if (table->RobotEnough()) {
    table->set_table_status(kTableWaitingStart);
}
```

游戏进入等待开始阶段。

---

## 11. 低入场费房间的特殊路径

文件：

```text
caii-server/caiisvr/base/game_room.cpp
```

函数：

```cpp
int32_t GameRoom::PlayerEnterGame(std::shared_ptr<User> user)
```

逻辑：

```cpp
if (game_user->EntryFee() <= 11000) {
    return PlayerEnterNormalTable(game_user);
} else {
    AddMatchPlayer(game_user);
    return PlayerEnterWaitingTable(game_user);
}
```

含义：

- `EntryFee <= 11000` 的房间不走上面那套隐藏分等待池匹配。
- 玩家直接进入一张等待桌：`PlayerEnterNormalTable()`。
- 桌子状态设为 `kTableWaiting`。
- 后续同样由 `CheckTablesStart()` -> `IsNeedRobot()` -> `CallRobot()` 补机器人。

所以低入场费房间更像是“直接坐桌，缺人就补机器人”。

---

## 总链路图

```text
高入场费/需要匹配：

PlayerEnterGame()
  -> AddMatchPlayer()
  -> PlayerEnterWaitingTable()
     -> table_status = kTableMatching

GameTableMatchTimer::CheckRoomsMatch()
  -> GameRoom::MatchPlayer()
     -> MatchParams::GetMatchParam()
     -> 找真人
        -> 成功：match_player2 != nullptr
        -> 超时：match_player2 == nullptr
     -> GS_C_SWITCH_TO_GAME_TABLE

GameRoom::PlayerMatchOK()
  -> SwitchMatchPlayersTable()
  -> if 人数满：kTableWaitingStart
  -> else：kTableWaiting

GameRoom::CheckTablesStart()
  -> GameTable::IsNeedRobot()
  -> GameTable::CallRobot()
  -> GN_C_CALL_ROBOT

GameServer::OnCallRobot()
  -> 转发 GN_C_CALL_ROBOT 给 caiirobotsvr

caiirobotsvr GameClient::OnCallRobot()
  -> RobotMgr::OnCallRobot()
  -> RobotMgr::GetEnterGameRobot()
  -> GR_C_ROBOT_ENTERGAME

caiisvr RobotEnterGame()
  -> table->BindPlayer(robot)
  -> RobotEnough()
  -> kTableWaitingStart
```

```text
低入场费：

PlayerEnterGame()
  -> PlayerEnterNormalTable()
  -> table_status = kTableWaiting
  -> CheckTablesStart()
  -> IsNeedRobot()
  -> CallRobot()
  -> 后续同上
```
