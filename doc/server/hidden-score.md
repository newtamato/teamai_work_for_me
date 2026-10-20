# 隐藏分（Hidden Score）机制

## 1. 结论

Carrom/Pool/Freestyle 等传统房间使用隐藏分参与匹配；UNO 当前使用独立的匹配和机器人补位流程，不使用 Carrom 的隐藏分匹配，也不更新隐藏分。

## 2. 数据来源与缓存

服务端用户对象 `GameUser` 持有：

```cpp
int32_t hide_score_;
```

默认隐藏分：

```cpp
DEFAULT_HIDE_SCORE = 1200
```

初始化优先读取 Redis 缓存；缓存不存在时查询数据库表：

```sql
tbl_player_hide_score
```

主要代码：

- `caiisvr/manager/game_user.cpp`
- `caiisvr/manager/game_user.h`
- `caiisvr/utils/common/commonfunc.cpp`
- `caiisvr/utils/common/commonfunc.h`

Redis 相关 key 由 `MakeGameRedisKey("hide_score")` 和每日排序 key 生成。

## 3. 匹配用途

`GameRoom::GetUserMatchScore()` 默认返回：

```cpp
match_user->HideScore()
```

玩家进入匹配池后按以下层级组织：

```text
match_key
  -> hide_score
    -> players
```

匹配循环在 `GameRoom::MatchPlayer()` 中执行：

1. 根据房间和等待时长读取匹配参数；
2. 在隐藏分附近查找候选玩家；
3. 使用允许分差 `score_diff` 判断是否匹配；
4. 随等待时间增加放宽分差；
5. 超时后允许机器人匹配。

主要代码：

- `caiisvr/base/game_room.cpp`
- `caiisvr/base/game_room.h`

## 4. 匹配参数配置

匹配参数注册为 `MatchParams`：

```cpp
REGISTE_CONF_TYPE(MatchParams, "match_config");
```

源码配置文件：

```text
caiisvr/config/match_config.json
```

运行时使用对应服务 `config/` 目录中的 `match_config.json`。

常见字段：

- `roomid`：房间 ID；
- `match_time`：匹配等待时间，配置通常以秒填写，加载时转换为毫秒；
- `score_diff`：允许的隐藏分差；
- `match_type`：匹配类型；
- `rand`：机器人匹配随机范围等。

配置解析在：

```text
caiisvr/manager/game_config.cpp
```

## 5. 对局后更新

传统玩法对局结束时调用：

```text
GameTable::UpdatePlayerHideScore()
  -> GameBoutData::GetPlayerHideScoreChange()
  -> GameUser::UpdateHideScore()
  -> GS_C_UPDATE_HIDE_SCORE
  -> Redis/数据库
```

隐藏分计算位于：

```text
caiisvr/playtype/game_bout_data.cpp
```

当前计算使用常量：

```cpp
HIDE_SCORE_CONSTANT = 30;
```

该流程根据玩家当前隐藏分和胜负计算变化量，并将结果写回缓存及数据库。

## 6. 统计和其他用途

隐藏分还会被用于：

- `GameRecord.player_score`；
- 对手隐藏分记录；
- 机器人匹配日志；
- 部分直播推荐排序。

相关代码包括：

- `caiisvr/base/game_table.cpp`
- `caiisvr/log/log.h/.cpp`
- `caiichunksvr/busi/live_list_module.cpp`
- `caiichunksvr/busi/recommend_follow_module.cpp`

## 7. UNO 边界

UNO 当前不应直接复用 Carrom 隐藏分流程：

- `UnoGameRoom` 使用自己的匹配和机器人补位逻辑；
- 不依赖 `GameRoom::MatchPlayer()` 的隐藏分池；
- 不调用 Carrom 的 `UpdatePlayerHideScore()` 结算路径；
- UNO 的对局统计使用独立的 `GameRecord` 记录生命周期，但这不等于接入隐藏分匹配。

后续如果 UNO 需要隐藏分，应单独定义：

1. UNO 是否使用隐藏分匹配；
2. UNO 隐藏分的初始值和更新公式；
3. 是否与 Carrom 共用 `tbl_player_hide_score`；
4. 是否需要为 UNO 增加独立匹配参数和更新协议。

在这些规则明确前，不要在 UNO 中调用传统 Carrom 的隐藏分更新逻辑。
