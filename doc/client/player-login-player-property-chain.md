是的，登录成功后客户端会请求 `PlayerPropertyModule`。

## 登录成功后的关键链路

```text
LobbyClient 登录成功
    ↓
发布 E_NETWORK_LOBBY_LOGIN_SUCCEED
    ↓
AssetsMgr / PlayerInfoMgr 等管理器响应
    ↓
通过 AssistClient 连接 caiichunksvr
```

## `AssetsMgr` 发出的道具请求

`AssetsMgr.OnLobbyLoginSucceed()` 会调用：

```csharp
QueryUserAssets();
AssistClient.Instance.UploadUserInfo();
```

其中 `QueryUserAssets()` 发送两个请求：

### 1. 查询玩家全部道具

```text
GR_PLAYER_PROPERTY_QUERY
```

请求：

```protobuf
QueryPlayerProperty {
    userid
}
```

服务端进入：

```cpp
PlayerPropertyModule::OnPlayerPropertyQuery()
```

服务端处理链路：

```text
OnPlayerPropertyQuery
    ↓
GetPlayerProperty(userid)
    ↓
读取 Redis
    ↓ Redis 缺失/过期
读取 MySQL
    ↓
修复默认装备和过期道具
    ↓
返回 PlayerPropertyInfoList
```

客户端由：

```csharp
AssetsMgr.NetworkQueryUserAssetsResponse()
```

接收并保存到：

```csharp
AssetsMgr.userAssets
AssetsMgr.playerProps
```

### 2. 查询道具试用状态

```text
GR_PLAYER_PROPERTY_TRIAL_QUERY
```

服务端进入：

```cpp
PlayerPropertyModule::OnPlayerPropertyTrialQuery()
```

返回：

- 试用配置；
- 每日试用次数；
- 当前试用剩余时间。

## 登录后其他相关请求

`PlayerInfoMgr.OnLobbyLoginSucceed()` 还会发送：

```text
GR_PLAYER_INFO_QUERY
GR_PLAYER_COUNTRY_REPORT
```

其中 `GR_PLAYER_INFO_QUERY` 处理玩家资料时，服务端的 `PlayerInfoModule` 还会间接调用：

```cpp
PlayerPropertyModule::GetPlayerActivationInfo()
```

用于获取：

- 当前头像；
- 当前头像框；
- 当前装备；
- 其他激活道具。

所以玩家资料请求也会间接访问 `PlayerPropertyModule`。

## 道具变化通知

玩家之后购买、解锁、试用或领取道具时，服务端会通过：

```text
GN_PLAYER_RPOPERTY_CHANGE
```

通知客户端。

客户端由：

```csharp
AssetsMgr.NetworkAssetsStatusChangeResponse()
```

更新本地道具缓存。

## 注意

登录成功事件和 Assist 连接成功事件都会触发道具查询：

```csharp
AssetsMgr.OnLobbyLoginSucceed()
AssetsMgr.OnAssistNetworkOpened()
```

因此在某些连接时序下，`GR_PLAYER_PROPERTY_QUERY` 可能发送两次，但这是为了兼容登录成功和 Assist 延迟连接两种情况。
