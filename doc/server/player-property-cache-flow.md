不是每次都查数据库，已经做了 Redis 缓存。

## 查询流程

以 `GR_PLAYER_PROPERTY_QUERY` 为例：

```text
客户端请求
  ↓
QueryPlayerProperty()
  ↓
先查询 Redis
  ↓
Redis 有效 → 直接返回
Redis 不存在/过期 → 查询 MySQL
  ↓
查询结果写回 Redis
  ↓
返回客户端
```

代码位置：

```text
caiichunksvr/busi/player_property_module.cpp
```

---

## 玩家道具缓存

Redis Key：

```text
caii:player_property:<userid>
```

数据结构：

```text
Hash
```

每个道具大致保存：

```text
prop_id
type
expire_time
cur_prop_level
cur_fragments
trial_type
ad_process
```

缓存默认有效期：

```cpp
player_property_expire_time = 86400 * 7;
```

也就是 7 天。

如果道具有单独的过期时间，缓存有效期会根据道具过期时间适当延长。

另外，读取缓存时会检查道具是否已经过期，过期道具会从 Redis Hash 中删除。

---

## 玩家装备缓存

Redis Key：

```text
caii:player_property_equip:<userid>
```

数据结构也是：

```text
Hash
```

Hash 内容：

```text
prop_type → prop_id
```

例如：

```text
Avatar → 3001
Frame  → 4002
```

装备缓存有效期：

```cpp
player_property_equip_expire_time = 86400 * 3;
```

也就是 3 天。

---

## MySQL 回源表

当 Redis 缓存不存在、为空或失效时，会查询：

```text
tbl_player_property
tbl_player_property_equip
tbl_player_property_process
```

其中：

```text
tbl_player_property
```

保存玩家拥有的道具、等级、碎片。

```text
tbl_player_property_equip
```

保存玩家当前激活的装备。

```text
tbl_player_property_process
```

保存道具解锁或广告进度。

查询数据库后，会重新写入 Redis：

```text
UpdatePlayerPropertyCache()
UpdatePlayerActivationPropertyCache()
```

---

## `QUERY_V2` 也是同样机制

```text
GR_PLAYER_PROPERTY_QUERY_V2
```

虽然只查询指定的 `prop_id`，但底层仍然是：

```text
优先 Redis
Redis 无效时查询 MySQL
```

## 总结

```text
正常情况：
Redis → 返回客户端

缓存不存在或过期：
MySQL → 回写 Redis → 返回客户端
```

所以数据库是持久化存储，Redis 是玩家道具和装备的主要读取缓存。
