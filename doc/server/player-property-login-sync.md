不会自动下发。

当前登录成功链路只会触发：

```text
GR_ASSIST_UPLOAD_USER_INFO_REQ
  → GR_SCORE_LOGIN
  → 积分任务登录处理
```

不会自动调用：

```text
GR_PLAYER_PROPERTY_QUERY
```

## 玩家道具数据的获取方式

客户端登录后需要主动发送：

```text
GR_PLAYER_PROPERTY_QUERY
```

协议编号：

```text
GR_CAII_REQUEST_COMMON + 5
```

请求：

```protobuf
QueryPlayerProperty {
    int32 userid;
    string guid;
}
```

服务端处理：

```text
PlayerPropertyModule::OnPlayerPropertyQuery()
```

返回：

```protobuf
PlayerPropertyInfoList
```

包含：

- 道具配置
- 是否拥有
- 道具状态
- 当前等级
- 碎片数量
- 过期时间
- 试用状态
- 广告进度
- 当前激活状态

## 两张表的处理

代码中实际通过 Redis 缓存读取：

```text
caii:player_property:<userid>
caii:player_property_equip:<userid>
```

如果缓存不存在或过期，会回源查询数据库：

```text
tbl_player_property
tbl_player_property_equip
```

其中：

```text
tbl_player_property
```

保存玩家拥有的所有道具；

```text
tbl_player_property_equip
```

保存玩家当前激活的装备，例如：

- 头像
- 边框
- 气泡
- VIP 棋盘
- 击球器

`GetPlayerProperty()` 查询完整道具时，也会额外读取装备信息，并修复过期装备或默认装备。

## 道具变化通知

玩家登录后如果发生道具变化，服务端会发送：

```text
GN_PLAYER_RPOPERTY_CHANGE
```

数据类型：

```protobuf
PlayerPropertyInfoList
```

但它是**变化通知**，不是登录时的初始全量同步。

因此当前客户端正确流程应该是：

```text
登录成功
  → 主动发送 GR_PLAYER_PROPERTY_QUERY
  → 接收 PlayerPropertyInfoList
  → 后续监听 GN_PLAYER_RPOPERTY_CHANGE
```

目前没有发现 `caiichunksvr` 在 `GR_SCORE_LOGIN` 中自动触发道具查询或主动下发完整道具数据。
