# PlayerPropertyModule 访问与数据链路

## 1. 模块职责

`PlayerPropertyModule` 位于 `caiichunksvr`，负责玩家道具/装备状态：

- 道具配置由 `PlayerPropertysConfig` 提供；
- `PlayerPropertyInfo` 表示玩家拥有的道具及状态；
- `PlayerActivationInfo` 表示每种道具类型当前激活的道具；
- `PlayerTrialInfo` 表示按天计算的试用次数和过期时间；
- Redis 是高频读取和临时状态缓存；
- MySQL 是永久拥有关系和永久装备关系的持久化来源。

它不是一个独立进程，不能通过 HTTP 直接访问，主要有两种访问方式：

1. 客户端通过 chunksvr 协议请求；
2. chunksvr 内部模块直接调用静态 API。

## 2. 对外网络访问

构造函数注册以下请求：

| 请求 | 作用 |
|---|---|
| `GR_PLAYER_PROPERTY_QUERY` | 查询全部道具配置和玩家状态 |
| `GR_PLAYER_PROPERTY_QUERY_V2` | 按道具 ID 查询 |
| `GR_PLAYER_PROPERTY_USE` | 激活/装备道具 |
| `GR_PLAYER_PROPERTY_UNLOCK` | 消耗金币或钻石解锁道具 |
| `GR_PLAYER_PROPERTY_ADD` | 可信服务内部发放道具 |
| `GR_PLAYER_PROPERTY_TRIAL` | 申请道具试用 |
| `GR_PLAYER_PROPERTY_TRIAL_QUERY` | 查询试用配置和次数 |
| `GR_PLAYER_PROPERTY_ADD_PROCESS` | 增加广告解锁进度 |

网络请求最终都通过 `SendOpeRequest()` 返回，涉及道具变化的路径还会通过：

```cpp
GN_PLAYER_RPOPERTY_CHANGE
```

通知 Assist 客户端刷新道具状态。

## 3. 内部访问

其他 chunksvr 模块直接调用静态接口：

```cpp
PlayerPropertyModule::GetPlayerProperty(userid);
PlayerPropertyModule::GetPlayerActivationInfo(userid, activation_info);
PlayerPropertyModule::AddPlayerPropertys(userid, properties);
PlayerPropertyModule::RemovePlayerPropertys(userid, property_ids);
```

主要调用者：

- `PlayerInfoModule`：读取头像、头像框等激活道具；
- `LiveListModule`：判断 Facebook 头像，用于直播推荐；
- `RecommendFollowModule`：判断推荐用户头像属性；
- `LeagueModule`：发放或移除联盟奖励道具；
- `MqMessageModule`：发放 VIP 相关试用道具；
- `PlayerFriendshipModule`：读取玩家道具；
- `ScoreModule`：读取道具状态；
- `PeakShotModule`：同步道具变化；
- `UnlimitedRoomModule`：读取玩家道具；
- `chunk_common.cpp`：读取玩家道具。

## 4. 普通读取链路

```text
调用 GetPlayerProperty(userid)
        |
        v
QueryPlayerPropertyCache
        |
        |-- Redis 命中且未过期
        |       └─ 返回道具状态
        |
        |-- Redis 未命中/为空/过期
        |       └─ QueryPlayerPropertyDB
        |             ├─ tbl_player_property
        |             └─ tbl_player_property_process
        |
        v
QueryPlayerActivationProperty
        |
        |-- player_property_equip Redis
        |-- 未命中时读取 tbl_player_property_equip
        |-- 缺少类型时补充配置中的默认道具
        |
        v
FixPlayerProperty
        |
        |-- 清理已过期激活道具
        |-- 增加配置中新出现的默认道具
        |-- 保证同一类型只有一个激活道具
        |
        v
UpdatePlayerActivationProperty / UpdatePlayerPropertyCache
        |
        v
返回 PlayerPropertyInfo
```

## 5. 激活/装备链路

```text
GR_PLAYER_PROPERTY_USE
        |
        v
读取玩家拥有道具 + 当前激活道具
        |
        v
校验道具属于玩家且状态允许激活
        |
        v
UpdatePlayerActivationProperty
        |
        |-- 永久装备写入 tbl_player_property_equip
        |-- 所有激活结果写入 player_property_equip Redis
        |-- 旧道具改为未激活
        |
        v
返回变更道具列表
```

## 6. 发放道具链路

```text
奖励/VIP/联盟/内部模块
        |
        v
AddPlayerPropertys 或 AddPlayerProperty
        |
        v
校验道具配置和道具类型
        |
        v
永久道具写入 tbl_player_property
临时道具只写 Redis
        |
        v
更新激活关系和 Redis 道具缓存
        |
        v
NotifyAllAssistSvr(GN_PLAYER_RPOPERTY_CHANGE)
```

`AddPlayerPropertys()` 适合批量奖励；`AddPlayerProperty()` 适合内部单道具发放。

## 7. 删除道具链路

```text
RemovePlayerPropertys
        |
        v
删除 Redis 道具字段
        |
        v
如果删除的是当前激活道具
        └─ 切换到配置默认道具
        |
        v
删除 tbl_player_property 持久化记录
        |
        v
广播 GN_PLAYER_RPOPERTY_CHANGE
```

## 8. 临时试用和广告进度

试用数据按日期保存在：

```text
player_property_trial:<date>:<userid>
```

流程：

```text
GR_PLAYER_PROPERTY_TRIAL
        └─ 检查每日次数
        └─ AddPlayerProperty 临时道具
        └─ 增加 trial_times
        └─ 设置 trial_expire
```

广告解锁流程：

```text
GR_PLAYER_PROPERTY_ADD_PROCESS
        |
        v
更新 tbl_player_property_process.process
        |
        |-- 未达到阈值：继续保留进度
        |-- 达到阈值：转为正式拥有道具
        |
        v
UpdatePlayerPropertyProcess
        └─ 更新 Redis 并广播道具变化
```

## 9. 缓存和数据库键/表

Redis：

```text
player_property:<userid>
player_property_equip:<userid>
player_property_trial:<date>:<userid>
```

MySQL：

```text
tbl_player_property
tbl_player_property_equip
tbl_player_property_process
```

永久道具缓存默认保留 7 天；装备缓存默认保留 3 天；试用缓存保留 1 天。访问时会根据过期道具和配置重新修复缓存。

## 10. 重要边界

- 配置中的道具不等于玩家已拥有道具；配置只描述道具定义和默认状态。
- `PlayerPropertyInfo` 是“拥有状态”；`PlayerActivationInfo` 是“当前装备关系”。
- 临时道具通常不写入永久拥有表，只保存在 Redis，并在过期后被清理。
- 查询玩家资料时可能触发道具激活状态修复，因此读取操作不一定是完全只读。
- `is_search=true` 用于搜索其他玩家：没有装备记录时不自动生成默认装备，以此区分不存在玩家。
