# 隐藏分与匹配规则梳理

> 生成时间：2026-08-19  
> 范围：结合策划文档 `caii-server/docs/匹配对手的隐藏分逻辑.png` 与当前服务端代码静态分析。  
> 主要代码位置：
>
> - `caiisvr/playtype/game_bout_data.cpp`
> - `caiisvr/base/game_room.cpp`
> - `caiisvr/base/game_table.cpp`
> - `caiisvr/manager/game_user.cpp`
> - `caiisvr/utils/common/commonfunc.cpp`
> - `caiisvr/config/match_config.json`

## 1. 隐藏分是什么

`tbl_player_hide_score.score` 是玩家隐藏实力分，类似 Elo Rating。

用途主要是：

1. 玩家匹配时，优先匹配隐藏分接近的对手。
2. 对局结束后，根据双方隐藏分和胜负结果调整隐藏分。
3. Redis 中按天维护隐藏分排序，用于推荐等 chunk 侧逻辑。

初始隐藏分：

```cpp
#define DEFAULT_HIDE_SCORE 1200
```

持久化表：

```sql
tbl_player_hide_score(userid, score)
```

Redis 缓存：

```text
caii:hide_score:{userid}       // Hash: score
caii:hide_score_sort:{date}    // ZSET: score -> userid
```

## 2. 策划文档里的核心规则

策划文档目标：

1. 在规定时间内，在一定 Rank 值区间内，匹配 Rating 值最接近的玩家。
2. 在规定时间内没有符合条件的玩家，则匹配对应水平的 AI。

策划文档给出的隐藏分公式：

```text
P1 = 1 / (1 + pow(10, ((R2 - R1) / 400)))
P2 = 1 / (1 + pow(10, ((R1 - R2) / 400)))
```

基础公式：

```text
R' = R + k * (实际得分 - 期望得分)
```

其中：

```text
k = 30
实际得分：赢 = 1，输 = 0
期望得分：P1 / P2
```

示例：

```text
玩家1隐藏分 R1 = 1200
玩家2隐藏分 R2 = 1000
P1 ≈ 0.76
P2 ≈ 0.24
```

玩家1赢：

```text
R1' = 1200 + 30 * (1 - 0.76) = 1207.2，约 +7
```

玩家1输：

```text
R1' = 1200 + 30 * (0 - 0.76) = 1177.2，约 -23
```

## 3. 当前代码中的隐藏分计算

代码位置：

```cpp
caiisvr/playtype/game_bout_data.cpp
```

常量：

```cpp
const int HIDE_SCORE_CONSTANT = 30;
```

核心代码：

```cpp
auto player1_win = 1 / (1 + std::pow(10, (user_score2 - user_score1) / 400.0));
auto player1_win_score = static_cast<int>(std::round(HIDE_SCORE_CONSTANT * (1 - player1_win)));
auto player1_lose_score = static_cast<int>(-std::round(HIDE_SCORE_CONSTANT * player1_win));

hide_score_diff_[userids_[0]] = std::make_pair(player1_win_score, player1_lose_score);
hide_score_diff_[userids_[1]] = std::make_pair(-player1_lose_score, -player1_win_score);
```

含义：

```text
玩家1赢：+ round(30 * (1 - P1))
玩家1输：- round(30 * P1)
玩家2赢：+ round(30 * P1)
玩家2输：- round(30 * (1 - P1))
```

这与策划文档中的 Elo 公式一致。

## 4. 计算时机

隐藏分变化值在第一回合开始时计算：

```cpp
bool GameBoutData::RoundStart()
{
    ++curr_round_;
    if (curr_round_ == 1) {
        CalcPlayerHideScoreChange();
        IncPlayerBoutIndex();
    }
    return true;
}
```

注意：这里不是立刻写入玩家隐藏分，而是先把“如果赢/如果输分别加减多少”算出来，存在 `hide_score_diff_` 中。

真正应用是在牌局结束时：

```cpp
GameTable::UpdatePlayerHideScore(GROUP_ENUM win_group)
```

核心代码：

```cpp
auto score_diff = game_bout_data_->GetPlayerHideScoreChange(userid, win_group == GetUserGroup(userid));
game_user->UpdateHideScore(score_diff);
```

然后 `GameUser::UpdateHideScore` 会把新隐藏分发给 block 线程落库：

```cpp
GS_C_UPDATE_HIDE_SCORE
```

最终写入：

```cpp
UpdateUserHideScore(userid, score)
```

## 5. 哪些房间更新隐藏分

代码位置：

```cpp
caiisvr/base/game_table.cpp
```

限制：

```cpp
// 只有online场会更新隐藏分
if (game_bout_data_->GetRoomCategory() != ERoomCategory::ERC_Normal &&
    game_bout_data_->GetRoomCategory() != ERoomCategory::ERC_Elite) return;
```

当前只有这些房间类型会更新隐藏分：

```text
ERC_Normal
ERC_Elite
```

机器人不更新隐藏分：

```cpp
if (IS_BIT_SET(user->get_user_type(), USER_TYPE_ROBOT)) {
    continue;
}
```

## 6. 匹配使用隐藏分

代码位置：

```cpp
caiisvr/base/game_room.h
```

默认匹配分：

```cpp
virtual int GetUserMatchScore(std::shared_ptr<GameUser> match_user) {
    return match_user->HideScore();
}
```

也就是说普通房间默认使用 `hide_score` 作为匹配分。

例外：Elite 房间覆盖了这个逻辑：

```cpp
virtual int GetUserMatchScore(std::shared_ptr<GameUser> match_user) {
    return match_user->GetElitePhase();
}
```

即 Elite 匹配用的是 Elite 阶段，不是隐藏分。

## 7. 当前代码的匹配等待区间

当前代码使用配置文件：

```text
caiisvr/config/match_config.json
```

默认配置 `roomid = -1`：

```json
[
  { "match_time": 2,  "score_diff": 50,  "match_type": 1 },
  { "match_time": 4,  "score_diff": 50,  "match_type": 0 },
  { "match_time": 7,  "score_diff": 150, "match_type": 1 },
  { "match_time": 10, "score_diff": 150, "match_type": 0 },
  { "match_time": 15, "score_diff": 200, "match_type": 1 },
  { "match_time": 20, "score_diff": 200, "match_type": 0 }
]
```

大致含义：

| 等待时间达到 | 允许隐藏分差 | match_type |
| --- | ---: | ---: |
| 2 秒 | 50 | 1 |
| 4 秒 | 50 | 0 |
| 7 秒 | 150 | 1 |
| 10 秒 | 150 | 0 |
| 15 秒 | 200 | 1 |
| 20 秒 | 200 | 0 |

策划文档中的匹配状态是：

| 状态 | 等待时间区间/s | 隐藏分差值 |
| --- | --- | ---: |
| 状态1 | [0,5] | 50 |
| 状态2 | (5,10] | 150 |
| 状态3 | (10,20] | 200 |
| 状态4 | (20,40] | AI |

当前代码与策划文档的主要差异：

1. 代码中时间点是 2/4/7/10/15/20 秒，不是文档的 0/5/10/20/40 秒。
2. 代码里 `match_type` 有 0/1 两种；文档没有展开这个概念。
3. 文档状态 4 是 20~40 秒匹配 AI；代码里是否叫 AI/机器人由 `score_diff < 0` 或房间特定配置/机器人匹配逻辑决定，需要结合房间配置继续确认。

## 8. 匹配时如何找对手

代码在 `GameRoom` 中维护匹配池，默认按隐藏分分桶：

```text
match_pool_[match_key][hide_score][userid]
```

匹配时会：

1. 取当前玩家的匹配分 `player_score`。
2. 在匹配池里找比自己高的最近分数。
3. 找比自己低的最近分数。
4. 比较哪个更近。
5. 如果最近分差小于等于当前等待阶段允许的 `score_diff`，则匹配成功。

关键逻辑：

```cpp
int high_score_diff = find_it->first - player_score;
int low_score_diff = player_score - find_it->first;

if (high_score_diff <= score_diff || low_score_diff <= score_diff) {
    match_score = low_score_diff < high_score_diff
        ? player_score - low_score_diff
        : player_score + high_score_diff;
}
```

所以实际逻辑是：

```text
在允许分差内，找隐藏分最接近的玩家。
```

这和策划文档目标一致。

## 9. AI / 机器人档位

策划文档给出的 AI 档位概率：

### 第一档

| min_score | max_score | prob |
| ---: | ---: | ---: |
| 0 | 30 | 1 |
| 30 | 90 | 10 |
| 90 | 100 | 30 |

### 第二档

| min_score | max_score | prob |
| ---: | ---: | ---: |
| 0 | 30 | 15 |
| 30 | 60 | 10 |
| 60 | 80 | 30 |
| 80 | 90 | 25 |
| 90 | 100 | 30 |

### 第三档

| min_score | max_score | prob |
| ---: | ---: | ---: |
| 0 | 10 | 20 |
| 10 | 30 | 30 |
| 30 | 60 | 50 |
| 60 | 80 | 40 |
| 80 | 100 | 60 |

### 第四档

| min_score | max_score | prob |
| ---: | ---: | ---: |
| 0 | 10 | 55 |
| 10 | 50 | 60 |
| 50 | 80 | 60 |
| 80 | 95 | 45 |
| 95 | 100 | 55 |

### 第五档

| min_score | max_score | prob |
| ---: | ---: | ---: |
| 0 | 10 | 95 |
| 10 | 30 | 85 |
| 30 | 50 | 90 |
| 50 | 80 | 80 |
| 80 | 100 | 70 |

策划文档给出的 AI 隐藏分：

| AI 档位 | AI 隐藏分 | 对应玩家隐藏分区间 |
| ---: | ---: | --- |
| 1 | 800 | < 1000 |
| 2 | 1100 | [1000, 1200) |
| 3 | 1300 | [1200, 1400) |
| 4 | 1400 | [1400, 1600) |
| 5 | 1600 | >= 1600 |

当前代码中机器人会带 `hide_score` 进入游戏：

```cpp
enter_req->set_hide_score(robot->get_hide_score());
```

机器人 fake info 生成时：

```cpp
level_ = CalcRobotLevel(player_score, player_max_trophy);
auto robot_score = ROBOT_SCORE_MAP.at(level_);
hide_score_ = robot_score;
```

这部分需要继续对照 `caiirobotsvr/robot/robot.cpp` 和机器人配置，确认是否完全等同策划文档中的 5 档 AI 隐藏分与概率。

## 10. 总结

当前代码与策划文档一致的部分：

1. 隐藏分初始值是 1200。
2. 隐藏分更新公式是 Elo 风格公式。
3. K 值是 30。
4. 匹配目标是找隐藏分接近的玩家。
5. 匹配等待越久，允许的隐藏分差越大。

当前代码与策划文档需要注意的差异：

1. 策划文档的匹配时间段是 `[0,5] / (5,10] / (10,20] / (20,40]`，代码配置目前是 `2/4/7/10/15/20` 秒多个节点。
2. 策划文档状态 4 明确是 AI；当前代码的 AI/机器人匹配还需要结合机器人服务和房间配置继续确认。
3. Elite 房间当前不是用隐藏分匹配，而是用 `GetElitePhase()`。
4. 隐藏分目前只在 `ERC_Normal` 和 `ERC_Elite` 房间结算时更新，机器人不更新。
