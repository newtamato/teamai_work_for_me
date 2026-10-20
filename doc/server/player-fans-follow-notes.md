# 玩家关注 / 粉丝功能梳理

> 生成时间：2026-08-19  
> 范围：基于 `caii-server/caiichunksvr/busi/player_relation_module.cpp/.h`、`pb/common/game_busi.proto` 静态分析。

## 1. 核心结论

`tbl_player_fans` 是关注关系的反向索引。

假设：

```text
A = 发起关注的人
B = 被关注的人
```

当 A 关注 B 时：

```sql
tbl_player_follow: (userid=A, follow_id=B)
tbl_player_fans:   (userid=B, fans_id=A)
```

也就是说：

- `tbl_player_follow` 表示“我关注了谁”。
- `tbl_player_fans` 表示“谁关注了我”。

## 2. 相关代码位置

```text
caii-server/caiichunksvr/busi/player_relation_module.cpp
caii-server/caiichunksvr/busi/player_relation_module.h
caii-server/pb/common/game_busi.proto
```

注册的请求：

```cpp
GR_PLAYER_FOLLOW_INFO_QUERY   // 查询玩家关注&粉丝
GR_PLAYER_FANS_QUERY          // 查询玩家粉丝
GR_PLAYER_FOLLOW_REQUEST      // 玩家关注/取消关注
GR_PLAYER_NEW_FAN_QUERY       // 查询新粉丝数量
GR_PLAYER_NEW_FAN_CLEAR       // 清除新粉丝数量
GR_PLAYER_FOLLOW_INFO_QUERY_V2 // 批量查询指定玩家关系信息
```

## 3. 数据表含义

### 3.1 `tbl_player_follow`

用途：保存玩家主动关注的人。

```sql
CREATE TABLE tbl_player_follow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  follow_id INT NOT NULL,
  UNIQUE KEY uk_user_follow (userid, follow_id)
);
```

字段含义：

- `userid`：关注发起者。
- `follow_id`：被关注者。
- `id`：关注记录 ID，用于分页/返回给客户端。

### 3.2 `tbl_player_fans`

用途：保存玩家的粉丝，也就是关注自己的那些人。

```sql
CREATE TABLE tbl_player_fans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  fans_id INT NOT NULL,
  UNIQUE KEY uk_user_fans (userid, fans_id)
);
```

字段含义：

- `userid`：被关注者。
- `fans_id`：粉丝，即关注 `userid` 的人。
- `id`：粉丝记录 ID，用于分页查询，按 `id DESC` 查询最新粉丝。

## 4. 关注流程

入口：

```cpp
PlayerRelationModule::OnPlayerFollowRequest
```

关注类型：

```cpp
enum { kTypeFollow = 1, kTypeUnFollow };
```

当用户请求关注时，会调用：

```cpp
FollowPlayer(userid, other_userid)
```

其中 `userid` 是发起关注的人，`other_userid` 是被关注的人。

流程：

1. 写入 `tbl_player_follow`：

```sql
INSERT IGNORE INTO tbl_player_follow(userid, follow_id) VALUES(userid, other_userid);
```

2. 更新关注缓存：

```text
caii:player_follow_info:{userid}
```

field 类似：

```text
follow_{other_userid} = id
```

3. 增加发起者关注数：

```cpp
PlayerInfo::Add(userid, PlayerInfo::kFollowCount, 1);
```

4. 写入被关注者粉丝表：

```sql
INSERT IGNORE INTO tbl_player_fans(userid, fans_id) VALUES(other_userid, userid);
```

5. 增加被关注者粉丝数：

```cpp
PlayerInfo::Add(other_userid, PlayerInfo::kFansCount, 1);
```

6. 增加被关注者的新粉丝计数：

```text
caii:player_new_fans_count:{other_userid}
```

field：

```text
count
```

7. 通知 assist server：

```cpp
GN_NEW_FANS_ADD
```

## 5. 取消关注流程

入口仍是：

```cpp
PlayerRelationModule::OnPlayerFollowRequest
```

当 `follow_type == 2` 时，会调用：

```cpp
UnFollowPlayer(userid, other_userid)
```

流程：

1. 从 `tbl_player_follow` 删除：

```sql
DELETE FROM tbl_player_follow WHERE userid=? AND follow_id=?;
```

2. 删除关注缓存：

```text
HDEL caii:player_follow_info:{userid} follow_{other_userid}
```

3. 发起者 `follow_count - 1`。

4. 从 `tbl_player_fans` 删除：

```sql
DELETE FROM tbl_player_fans WHERE userid=? AND fans_id=?;
```

这里的 `userid` 是被关注者，`fans_id` 是取消关注的人。

5. 被关注者 `fans_count - 1`。

## 6. 关系判断

关系类型定义在：

```cpp
PlayerRelationModule::RelationType
```

```cpp
kNone = 0
kFollow = 1          // 我关注了对方
kFriend = 2          // 双方互关
kBeenFollowed = 3    // 对方关注了我
kBlackListed = 10
kBeenBlackListed = 11
kMutualBlackListed = 12
```

### 6.1 `GetRelation`

`GetRelation(userid, other_userid)` 主要判断：

- `userid` 是否关注 `other_userid`
- 如果关注了，再判断对方是否也关注自己

结果：

```text
我关注对方，对方未关注我 => kFollow
双方互相关注 => kFriend
否则 => kNone
```

### 6.2 `GetAllRelation`

`GetAllRelation(userid, other_userid)` 更完整，会额外判断：

- 我是否关注对方
- 对方是否关注我
- 我是否拉黑对方
- 对方是否拉黑我

结果包括：

```text
kFollow
kFriend
kBeenFollowed
kBlackListed
kBeenBlackListed
kMutualBlackListed
```

## 7. 粉丝列表查询

入口：

```cpp
PlayerRelationModule::OnPlayerFansQuery
```

SQL：

```sql
SELECT id, userid, fans_id
FROM tbl_player_fans
WHERE userid=? AND id < ?
ORDER BY id DESC
LIMIT ?;
```

特点：

- 粉丝过多时不缓存完整粉丝列表。
- 直接从 DB 分页查询。
- 按 `id DESC`，也就是新粉丝排前面。
- 查询数量受配置限制。

相关配置在 `caiichunksvr/ini/caiichunksvr.ini`：

```ini
[busi]
FansQueryLimit=30
FansCountPerQuery=10
```

代码中还有兜底默认值：

```cpp
fans_count_per_query 默认 100
fans_query_limit_count 默认 500
```

## 8. 关注 & 粉丝列表查询

入口：

```cpp
PlayerRelationModule::OnPlayerFollowInfoQuery
```

返回：

```proto
message PlayerFollowInfoResp
{
    repeated FollowInfo follow_list = 1;
    repeated FollowInfo fans_list = 2;
    int32 total_fans_count = 3;
}
```

其中 `FollowInfo`：

```proto
message FollowInfo
{
    int32 id = 1;
    PlayerInfo player_info = 2;
    LiveGameInfo online_game_info = 3;
    int32 relation = 4;   // 0无 1关注 2互关
    int32 friendship = 5; // 亲密度
}
```

注意：

- `follow_list` 会填充对方是否在线游戏中的 `online_game_info`。
- `fans_list` 会填充粉丝的玩家信息和亲密度。
- `total_fans_count` 来自 `PlayerInfo::kFansCount`。

## 9. 新粉丝计数

Redis key：

```text
caii:player_new_fans_count:{userid}
```

类型：Hash

字段：

```text
count
```

### 9.1 增加新粉丝数

当 A 关注 B 后，会对 B 调用：

```cpp
AddPlayerNewFansCount(B, count)
```

逻辑：

1. 读取当前 count。
2. count++。
3. `HSET key count {count}`。
4. `EXPIRE key 3天`。
5. 发送 `GN_NEW_FANS_ADD` 通知。

### 9.2 查询新粉丝数

入口：

```cpp
OnPlayerNewFansQuery
```

返回：

```proto
message PlayerNewFans
{
    int32 userid = 1;
    int32 new_fans_count = 2;
}
```

### 9.3 清除新粉丝数

入口：

```cpp
OnPlayerNewFansQueryClear
```

执行：

```text
HDEL caii:player_new_fans_count:{userid} count
```

## 10. 关注上限

关注时会限制关注数量，除非用户在白名单中。

代码常量：

```cpp
constexpr int guest_follow_limit = 20;
constexpr int facebook_follow_limit = 50;
```

规则：

```text
guest 用户最多关注 20 人
facebook 用户最多关注 50 人
白名单用户不受限制
```

白名单配置：

```text
player_follow_whitelist_config.json
```

## 11. 拉黑对关注/粉丝的影响

拉黑时会检查双方关系：

- 如果我关注了对方：取消我的关注。
- 如果双方互关：取消双方关注。
- 如果对方关注了我：取消对方对我的关注。

代码入口：

```cpp
OnPlayerAddBlackListReq
```

相关逻辑：

```cpp
case kFollow:
    UnFollowPlayer(userid, other_userid);
    break;
case kFriend:
    UnFollowPlayer(userid, other_userid);
    UnFollowPlayer(other_userid, userid);
    break;
case kBeenFollowed:
    UnFollowPlayer(other_userid, userid);
    break;
```

所以拉黑会清理关注/粉丝关系。

## 12. 关注和其他系统的关系

### 12.1 新手/任务进度

关注成功后会增加任务进度：

```cpp
TaskModule::AddTaskProcess(userid, ETaskType::ETT_FollowPlayer, 1, std::to_string(other_userid));
```

也就是说“关注别人”可能是任务条件之一。

### 12.2 亲密度不是由关注直接增加

代码中没有看到“关注”直接增加 `tbl_player_friendship.friendship`。

亲密度主要在 `player_friendship_module` 中处理，常见来源包括：

- 送礼。
- VIP 对局。

因此：

```text
成为粉丝 ≠ 直接增加亲密度
互相关注 ≠ 直接增加亲密度
```

但查询关注/粉丝列表时，会附带返回两人当前亲密度。

### 12.3 私信关系

私信发送时会调用：

```cpp
PlayerRelationModule::GetAllRelation(userid, receive_userid)
```

主要用于判断是否被拉黑，以及记录社交行为日志。当前代码中没有看到“只有粉丝/互关才能发私信”的硬限制。

### 12.4 在线游戏信息

查询关注列表时，如果被关注的人正在可展示的游戏/直播中，会附带：

```proto
LiveGameInfo online_game_info
```

这意味着关注列表可以用于展示“我关注的人正在玩/直播”，并支持跳转观看/进入相关房间。

## 13. 成为某人的粉丝有什么特殊意义？

从当前服务端代码看，成为某人的粉丝主要有这些意义：

1. 你会出现在对方的粉丝列表里。
2. 对方的 `fans_count` 会增加。
3. 对方会有新粉丝计数，并可能收到 `GN_NEW_FANS_ADD` 通知。
4. 如果对方也关注你，你们的关系会变成 `kFriend`，即互关。
5. 关注/粉丝关系会被拉黑逻辑处理；拉黑会解除相关关注关系。
6. 关注别人可能推进任务进度。
7. 对方查看粉丝列表时可以看到你的玩家信息和你们之间的亲密度。

当前没有看到单纯“成为粉丝”直接带来的游戏内特权，例如：

- 不直接增加亲密度。
- 不直接改变匹配。
- 不直接解锁桌子或房间。
- 不直接发奖励。
- 不直接绕过私信次数限制。

真正有一点“关系变化”的是双方互相关注后变成 `kFriend`。
