# caii-server 数据库表与 Redis 用途梳理

> 生成时间：2026-08-19  
> 范围：基于当前代码仓库 `caii-server` 静态分析。仓库内没有找到完整 `.sql` DDL 文件，因此下方表结构是根据 `db_tables.hpp`、SQL 字符串、ResultSet 读取字段、Redis key 定义反推出来的，字段类型为合理推断。

## 1. 数据库连接

服务器主要连接 MySQL，库名为：

```text
caiidb
```

主要配置文件：

```text
caiichunksvr/ini/caiichunksvr.ini
caiisvr/ini/caiisvr_ops.ini
release_config/caiichunksvr/ini/caiichunksvr.ini
release_config/caiisvr/ini/caiisvr_ops.ini
```

主要使用 MySQL 的服务：

- `caiichunksvr`：玩家资产、排行、任务、礼物、联盟等业务数据。
- `caiisvr`：游戏服会查询/更新少量玩家隐藏分、奖杯、1v1 对局数等。

开发配置中常见：

```ini
[mysql]
hostName=192.168.103.106:3306
schema=caiidb
userName=caii
password=123456
```

或：

```ini
[mysql]
host=192.168.103.106:3306
dbname=caiidb
user=caii
password=123456
DBIndex=12
```

## 2. MySQL 表结构反推

### 2.1 玩家对局 / 排行 / 资产

#### `tbl_player_bout_info`

用途：按对局分类统计玩家总局数和胜场数，例如 VIP、Elite 等。

```sql
CREATE TABLE tbl_player_bout_info (
  userid INT NOT NULL,
  category INT NOT NULL,
  win INT DEFAULT 0,
  total INT DEFAULT 0,
  PRIMARY KEY (userid, category)
);
```

#### `tbl_player_game_1v1`

用途：普通 1v1 对局统计。

```sql
CREATE TABLE tbl_player_game_1v1 (
  userid INT NOT NULL,
  win INT DEFAULT 0,
  total INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_rank`

用途：玩家奖杯数据。

```sql
CREATE TABLE tbl_player_rank (
  userid INT NOT NULL,
  cur_trophy INT DEFAULT 0,
  max_trophy INT DEFAULT 0,
  max_award_trophy INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_win`

用途：玩家累计赢取金币。

```sql
CREATE TABLE tbl_player_win (
  userid INT NOT NULL,
  win_coin BIGINT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_hide_score`

用途：游戏服使用的隐藏分。

```sql
CREATE TABLE tbl_player_hide_score (
  userid INT NOT NULL,
  score INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_score`

用途：积分/赛季积分系统。

```sql
CREATE TABLE tbl_player_score (
  user_id INT NOT NULL,
  score INT DEFAULT 0,
  settled_score INT DEFAULT 0,
  settled_time DATETIME,
  PRIMARY KEY (user_id)
);
```

### 2.2 玩家资料 / 国家 / VIP / 订阅

#### `tbl_player_country`

用途：玩家真实国家和展示国家。

```sql
CREATE TABLE tbl_player_country (
  userid INT NOT NULL,
  country_actual VARCHAR(64),
  country_show VARCHAR(64),
  PRIMARY KEY (userid)
);
```

#### `tbl_player_vip`

用途：旧版/礼包类 VIP 信息。

```sql
CREATE TABLE tbl_player_vip (
  userid INT NOT NULL,
  vip_type INT DEFAULT 0,
  expire_time BIGINT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_subscribe`

用途：订阅类 VIP / VIP 状态。

```sql
CREATE TABLE tbl_player_subscribe (
  userid INT NOT NULL,
  subscribe_type INT NOT NULL,
  expire_time BIGINT DEFAULT 0,
  PRIMARY KEY (userid, subscribe_type)
);
```

#### `tbl_player_stats`

用途：玩家粉丝数、关注数等统计缓存落库。

```sql
CREATE TABLE tbl_player_stats (
  userid INT NOT NULL,
  fans_count INT DEFAULT 0,
  follow_count INT DEFAULT 0,
  is_data_init INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_bit_status`

用途：玩家 bit 状态字段。

```sql
CREATE TABLE tbl_player_bit_status (
  userid INT NOT NULL,
  bit1 INT DEFAULT 0,
  bit2 INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

### 2.3 关注 / 粉丝 / 好友度

#### `tbl_player_follow`

用途：关注关系。

```sql
CREATE TABLE tbl_player_follow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  follow_id INT NOT NULL,
  UNIQUE KEY uk_user_follow (userid, follow_id)
);
```

#### `tbl_player_fans`

用途：粉丝关系。

```sql
CREATE TABLE tbl_player_fans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  fans_id INT NOT NULL,
  UNIQUE KEY uk_user_fans (userid, fans_id)
);
```

#### `tbl_player_friendship`

用途：玩家之间好友度/亲密度。

```sql
CREATE TABLE tbl_player_friendship (
  userid1 INT NOT NULL,
  userid2 INT NOT NULL,
  friendship INT DEFAULT 0,
  reward_level INT DEFAULT 0,
  cacl_gift_value INT DEFAULT 0,
  PRIMARY KEY (userid1, userid2)
);
```

### 2.4 礼物 / 充值 / 邀请

#### `tbl_player_gift_record`

用途：玩家累计收/送礼价值。

```sql
CREATE TABLE tbl_player_gift_record (
  userid INT NOT NULL,
  receive_value INT DEFAULT 0,
  send_value INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_player_gift_detail`

用途：玩家按礼物 ID 统计收/送数量。

```sql
CREATE TABLE tbl_player_gift_detail (
  userid INT NOT NULL,
  giftid INT NOT NULL,
  send_count INT DEFAULT 0,
  recv_count INT DEFAULT 0,
  PRIMARY KEY (userid, giftid)
);
```

#### `tbl_player_recharge`

用途：充值商品购买次数，代码会读取 `UNIX_TIMESTAMP(updatetime)`。

```sql
CREATE TABLE tbl_player_recharge (
  userid INT NOT NULL,
  recharge_id INT NOT NULL,
  recharge_count INT DEFAULT 0,
  updatetime DATETIME,
  PRIMARY KEY (userid, recharge_id)
);
```

#### `tbl_recharge_gifts`

用途：充值赠礼次数。

```sql
CREATE TABLE tbl_recharge_gifts (
  from_userid INT NOT NULL,
  to_userid INT NOT NULL,
  exchange_id INT NOT NULL,
  giftcount INT DEFAULT 0,
  PRIMARY KEY (from_userid, to_userid, exchange_id)
);
```

#### `tbl_regist_invite_award`

用途：注册邀请奖励领取状态。

```sql
CREATE TABLE tbl_regist_invite_award (
  userid1 INT NOT NULL,
  userid2 INT NOT NULL,
  award INT DEFAULT 0,
  invite_type INT DEFAULT 0,
  PRIMARY KEY (userid1, userid2)
);
```

### 2.5 道具 / 装备 / 成长

#### `tbl_player_property`

用途：玩家已拥有道具。

```sql
CREATE TABLE tbl_player_property (
  user_id INT NOT NULL,
  prop_id INT NOT NULL,
  prop_type INT DEFAULT 0,
  cur_prop_level INT DEFAULT 0,
  cur_fragments INT DEFAULT 0,
  PRIMARY KEY (user_id, prop_id)
);
```

#### `tbl_player_property_equip`

用途：玩家当前装备中的道具。代码按 `userid` 查询，按 `prop_type` 维度更新 `prop_id`。

```sql
CREATE TABLE tbl_player_property_equip (
  userid INT NOT NULL,
  prop_id INT NOT NULL,
  prop_type INT NOT NULL,
  PRIMARY KEY (userid, prop_type)
);
```

#### `tbl_player_property_process`

用途：道具广告进度/碎片进度。

```sql
CREATE TABLE tbl_player_property_process (
  userid INT NOT NULL,
  propid INT NOT NULL,
  process INT DEFAULT 0,
  PRIMARY KEY (userid, propid)
);
```

### 2.6 任务 / 更新奖励 / 成就

#### `tbl_newbie_task`

用途：新手任务。注意当前代码中 DB 读写函数被注释，实际更多使用 Redis。

```sql
CREATE TABLE tbl_newbie_task (
  userid INT NOT NULL,
  task_id INT NOT NULL,
  task_status INT DEFAULT 0,
  task_process INT DEFAULT 0,
  task_detail TEXT,
  PRIMARY KEY (userid, task_id)
);
```

#### `tbl_player_update_award`

用途：版本更新奖励领取状态。

```sql
CREATE TABLE tbl_player_update_award (
  userid INT NOT NULL,
  version INT NOT NULL,
  award INT DEFAULT 0,
  PRIMARY KEY (userid, version)
);
```

#### `tbl_player_achievement`

用途：玩家成就计数。

```sql
CREATE TABLE tbl_player_achievement (
  userid INT NOT NULL,
  achieveid INT NOT NULL,
  count INT DEFAULT 0,
  PRIMARY KEY (userid, achieveid)
);
```

### 2.7 PeakShot / Unlimited / League

#### `tbl_player_peakshot_levelinfo2`

用途：PeakShot 关卡进度。

```sql
CREATE TABLE tbl_player_peakshot_levelinfo2 (
  userid INT NOT NULL,
  level INT NOT NULL,
  star INT DEFAULT 0,
  bout INT DEFAULT 0,
  unlock INT DEFAULT 0,
  award_star INT DEFAULT 0,
  reward_flag INT DEFAULT 0,
  PRIMARY KEY (userid, level)
);
```

#### `tbl_unlimited_record`

用途：Unlimited 房间创建次数和最大观众数。

```sql
CREATE TABLE tbl_unlimited_record (
  userid INT NOT NULL,
  `create` INT DEFAULT 0,
  max_audience INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_peak_room_heat`

用途：Peak 房间热度。

```sql
CREATE TABLE tbl_peak_room_heat (
  userid INT NOT NULL,
  peak_room_heat INT DEFAULT 0,
  PRIMARY KEY (userid)
);
```

#### `tbl_league_info`

用途：联盟基础信息。

```sql
CREATE TABLE tbl_league_info (
  league_id BIGINT NOT NULL,
  owner INT NOT NULL,
  `describe` TEXT,
  name VARCHAR(255),
  hashed_name BIGINT,
  icon_url TEXT,
  icon_status INT DEFAULT 0,
  total_league_value INT DEFAULT 0,
  total_league_value2 INT DEFAULT 0,
  status INT DEFAULT 0,
  minimum_trophy INT DEFAULT 0,
  total_funds INT DEFAULT 0,
  level INT DEFAULT 0,
  PRIMARY KEY (league_id),
  KEY idx_owner (owner),
  KEY idx_hashed_name (hashed_name)
);
```

#### `tbl_league_members`

用途：联盟成员信息。

```sql
CREATE TABLE tbl_league_members (
  userid INT NOT NULL,
  league_id BIGINT NOT NULL,
  role INT DEFAULT 0,
  total_league_value INT DEFAULT 0,
  cacl_league_value INT DEFAULT 0,
  total_donate INT DEFAULT 0,
  is_leaved INT DEFAULT 0,
  PRIMARY KEY (userid, league_id, is_leaved)
);
```

## 3. Redis 连接

Redis 配置主要在：

```text
caiichunksvr/ini/caiichunksvr.ini
caiisvr/ini/caiisvr_ops.ini
caiilivesvr/ini/caiilivesvr.ini
caiilivesvr/ini/caiilivesvr_busi.ini
caiirobotsvr/ini/caiirobotsvr.ini
caiiassistsvr/ini/caiiassistsvr_busi.ini
```

开发配置常见：

```ini
[new_redis1]
ip=redis.comfun.org
port=10019
auth=...
dbindex=11
```

release 配置常见：

```ini
[new_redis]
ip=sbjon0h3.2zp9c9.ng.0001.aps1.cache.amazonaws.com
port=6379
auth=...
dbindex=6
```

Redis 主要用作：

1. 玩家资料缓存。
2. 任务/活动进度缓存。
3. 排行榜 ZSET。
4. 聊天/客服消息队列。
5. 联盟缓存。
6. 防重复/分布式锁。
7. 在线玩家集合。
8. 游戏服临时状态缓存。

## 4. Redis key 与用途

### 4.1 公共 key 前缀

`MakeGameRedisKey("xxx")` 会生成：

```text
caii:xxx
```

### 4.2 在线玩家

```text
caii:online_users
```

类型：Set  
用途：在线玩家集合。`score_module` 会用 `SSCAN` 扫描它做积分相关处理。

### 4.3 玩家资料缓存

```text
caii:player_info:{userid}
```

类型：Hash  
用途：玩家综合信息缓存。字段包括：

```text
nick_name
avatar_url
fans_count
follow_count
cur_trophy
max_trophy
max_award_trophy
total_win_coin
play_1v1
win_1v1
play_vip_1round
play_1v1_vip
win_1v1_vip
total_send_gift_value
total_receive_gift_value
country_actual
country_show
vip_type
vip_expire_time
vip_status
vip_try_status
unlimited_created
unlimited_max_audience
user_attribute
attribute_update_time
elite_joined
elite_final_phase_won
history_top_friendship
league_id
peak_room_heat
```

TTL：通常 7 天。

### 4.4 玩家社交行为

```text
caii:social_behavior:{date}:{userid}
```

类型：Hash  
用途：每日社交行为统计，例如：

```text
create_play_room
change_name
change_avatar
change_frame
play_vip
gem_cost
```

### 4.5 隐藏分

```text
caii:hide_score:{userid}
caii:hide_score_sort:{date}
```

类型：Hash / ZSET  
用途：游戏服隐藏分缓存和按天排序。TTL 约 3 天。

### 4.6 积分系统

```text
caii:score_info:{userid}
```

类型：Hash  
字段：

```text
score
settled_score
settled_time
task_version
```

```text
caii:score_task:{userid}:{week_start_ts}
```

类型：Hash  
用途：周积分任务状态。

```text
caii:score_login_flag:{userid}
```

用途：积分登录标记。

```text
caii:socre_settle_lock:{userid}
caii:score_receive_task_reward_lock:{userid}
caii:socre_receive_settledcoin_lock:{userid}
caii:score_shop_buy_lock:{userid}
```

类型：String lock  
用途：结算、领奖、兑换等防并发锁。注意源码中 `socre` 拼写就是这样。

### 4.7 排行榜

排行榜通常使用 ZSET 保存分数，Hash 保存更新时间或领奖记录。

主要排行榜：

```text
caii:receive_gift_rank
caii:send_gift_rank
caii:win_coin_rank
caii:gem_weekly_rank
caii:friendship_weekly_rank
caii:elite_daily_rank
caii:league_daily_rank
caii:leagueinner_daily_rank
caii:league_exp_rank
caii:Leaderboard:LegExpRecentXDay
```

对应更新时间/领奖状态 key：

```text
caii:receive_gift_update_time
caii:daily_gift_received_award
caii:send_gift_update_time
caii:daily_gift_send_award
caii:win_coin_update_time
caii:daily_win_coin_received_award
caii:gem_weekly_update_time
caii:gem_weekly_award
caii:friendship_weekly_update_time
caii:friendship_weekly_award
caii:friendship_weekly_rank_user_top
caii:elite_daily_update_time
caii:elite_daily_award
caii:league_daily_update_time
caii:league_daily_award
caii:leagueinner_daily_update_time
caii:leagueinner_daily_award
caii:league_exp_update_time
caii:league_exp_award
caii:Leaderboard:LegExpRecentXDayUT
```

### 4.8 聊天 / 客服 / 直播聊天

定义在 `common/redis_keys.h`。

```text
chat:{gameid}:user_ack:{userid}
```

类型：Hash  
用途：用户已确认消息，注释为 `session:msgid`。

```text
chat:{gameid}:user_session:{userid}
```

类型：Set  
用途：用户所在聊天 session 集合。

```text
chat:{gameid}:msgid:{session_id}
```

类型：String  
用途：当前 session 消息 ID。

```text
chat:{gameid}:history:{session_id}
```

类型：List  
用途：聊天历史。注意：这个 key 在 `common/redis_keys.h` 有定义，`TestServer/utils/chat_session_manager.cpp` 有实际读写示例，会 `RPUSH` 消息、`LRANGE` 恢复、并 `LTRIM` 限制最多约 300 条；但当前生产 `caiilivesvr/live_cache/live_chat.cpp` 的桌内/直播聊天逻辑只做内存转发广播，没有看到写入这个 history key 的代码。

```text
chat:{gameid}:members:{session_id}
```

类型：Set  
用途：聊天室成员 userid。

```text
chat:{gameid}:service_task
chat:new_service_task
```

类型：List / Set  
用途：客服任务队列和新任务通知集合。

```text
chat:{gameid}:player_mute:{userid}
```

用途：玩家禁言信息。

### 4.9 道具 / 装备

```text
caii:player_property:{userid}
```

类型：Hash  
用途：玩家拥有的道具。

```text
caii:player_property_equip:{userid}
```

类型：Hash  
用途：玩家已装备道具。field 通常为 `prop_type`，value 为 `prop_id`。

```text
caii:player_property_trial:{date}:{userid}
```

类型：Hash  
用途：每日试用道具次数。

### 4.10 任务

```text
caii:task_newbie:{userid}
```

类型：Hash  
用途：新手任务状态。

```text
caii:task_normal:{userid}
```

类型：Hash  
用途：普通任务状态。

```text
caii:player_status:{userid}
```

类型：Hash  
用途：玩家任务相关状态 bit，例如 `bit1`、`bit2`。

### 4.11 好友 / 关注 / 粉丝

```text
caii:player_follow_info:{userid}
```

类型：Hash  
用途：关注列表缓存，field 类似 `follow_{follow_id}`。

```text
caii:player_new_fans_count:{userid}
```

用途：新增粉丝数。

```text
caii:player_black_list:{userid}
```

用途：黑名单。

```text
caii:friendship:{userid1}:{userid2}
```

类型：Hash  
用途：两个玩家之间好友度详情。

```text
caii:friendship_top:{userid}
```

用途：玩家好友度 Top 缓存。

### 4.12 礼物 / 直播礼物

```text
caii:live_gift_record_detail:{userid}
```

类型：Hash  
用途：礼物明细。

```text
caii:live_tmp_gift:{userid}
```

类型：Hash  
用途：临时礼物计数。

```text
caii:gift_promotion_record:{promotion_id}
```

类型：Hash  
用途：促销礼包/礼物购买计数。代码注释：`[userid:gift_id, count]`。

```text
caii:user_live_giftbag:{userid}
```

用途：用户直播礼包状态。

### 4.13 联盟 League

```text
caii:league:info:{league_id}
```

类型：Hash  
用途：联盟基础信息。

```text
caii:league:members:{league_id}
```

类型：Set  
用途：联盟成员 userid 集合。

```text
caii:league:members:{league_id}:{userid}
```

类型：Hash  
用途：单个联盟成员信息。

```text
caii:league:joinreq:{league_id}
```

类型：ZSET  
用途：加入申请。

```text
caii:league:recommend
```

类型：ZSET  
用途：推荐联盟。

```text
caii:league:rejected:{league_id}:{userid}
```

类型：String  
用途：拒绝加入 CD。

```text
caii:league:pre:{userid}
```

类型：String  
用途：玩家上一个联盟/被踢状态。

```text
caii:league:ad_task:{date}
```

类型：Hash  
用途：联盟广告任务次数，field 是 userid。

```text
caii:league:main_members:{league_id}
```

类型：ZSET  
用途：核心成员/捐献排序。

```text
caii:league:donate_history:{league_id}
```

类型：ZSET  
用途：捐献历史。

### 4.14 活动 / 玩法缓存

```text
caii:peakshot_info:{userid}
```

用途：PeakShot 进度缓存。

```text
caii:daily_supply:{userid}
```

用途：每日补给。

```text
caii:fuel_up:{start_time}:{userid}
```

用途：Fuel Up Mania 活动状态。

```text
caii:result_bonus:{userid}
caii:result_bonus:guid_{guid}
```

用途：结算奖励、防重复 GUID。

```text
caii:free_coins:{userid}
caii:free_coins_daily_gift:{userid}
caii:free_coins_daily_gift_cfg
```

用途：破产补助、每日免费金币、相关配置缓存。

```text
caii:vip_room_user_info:{userid}
```

用途：VIP 房间试用/状态信息。

```text
caii:update_award:{userid}
```

类型：Hash  
用途：版本更新奖励领取状态缓存，field 为 version。

```text
caii:regist_invite_award:{userid}
```

用途：注册邀请奖励状态缓存。

```text
caii:player_message:{userid}
caii:player_message_times:{userid}
caii:player_message_relation:{userid}
```

用途：玩家消息、消息次数、消息关系状态。

```text
caii:recharge_detail:{userid}
caii:recharge_ack:{userid}
caii:recharge_recvgift_ack:{userid}
```

用途：充值详情、充值确认/赠礼确认防重复。

## 5. 和“实时牌桌状态”的关系

这些 MySQL 表和 Redis key 主要保存的是玩家长期业务数据和部分短期缓存，并不是完整实时牌桌列表。

实时桌子/房间状态主要在 `caiisvr` 的内存对象中，例如房间对象、桌子对象、chair/player 状态等。Redis/MySQL 更多负责：

- 玩家资产、奖杯、积分、VIP、道具等长期数据。
- 排行榜、任务进度、活动进度等可缓存业务状态。
- 聊天和客服队列。
- 联盟信息缓存。
- 分布式锁/防重复标记。

因此如果要查“当前已经开了多少桌、每桌有哪些玩家、哪桌匹配中/结算中”，应该优先看 `caiisvr` 内存中的 room/table 管理逻辑，而不是从 MySQL 表直接查。
