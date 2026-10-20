梳理后可以分成两条资产链路：

## 1. 金币 / 钻石：大厅查询，外部财富系统存储

客户端请求：

```text
HR_GET_MONEY_OWN_V2
```

代码位置：

```text
Carrom2/Assets/Scripts/Network/LobbyClient.cs
```

请求地址：

```csharp
RlsDbg.USER_ASSET_URL + "?gameid=" + GlobalInfo.Instance.gameid
```

当前地址类似：

```text
http://gatewayapi-internal.comfun.com/gamewealth
```

大厅返回的是：

```text
Hall.Base.HttpResp
```

其中 `Data` 是 JSON 字符串：

```json
{
  "Code": 0,
  "Data": {
    "GameSilver": {
      "UserID": 123,
      "GameID": 1018,
      "Deposit": 1000,
      "EscrowDeposit": 0
    },
    "GameDiamond": {
      "UserID": 123,
      "Diamond": 200
    }
  }
}
```

客户端反序列化到：

```text
Assets/Scripts/Proto/UserAsset.cs
```

最终保存到内存：

```csharp
GlobalInfo.Instance.userAsset
```

访问方式：

```csharp
GlobalInfo.Instance.CurrentUserCoin
GlobalInfo.Instance.CurrentUserGem
```

也就是：

```csharp
GameSilver.Deposit
GameDiamond.Diamond
```

### 结论

金币和钻石的权威存储不在：

- Unity 客户端；
- assist 服务；
- chunksvr 的 `PlayerPropertyModule`；
- chunksvr 的玩家道具表。

它们实际由外部财富/商城/任务系统管理，游戏服务通过 HTTP 读取或扣除。

---

## 2. 道具：assist 转发到 chunksvr，由 PlayerPropertyModule 管理

客户端通过 assist 发送：

```text
GR_PLAYER_PROPERTY_QUERY
GR_PLAYER_PROPERTY_QUERY_V2
GR_PLAYER_PROPERTY_USE
GR_PLAYER_PROPERTY_ADD
GR_PLAYER_PROPERTY_UNLOCK
GR_PLAYER_PROPERTY_TRIAL
```

客户端入口：

```text
Carrom2/Assets/Scripts/Mgrs/AssetsMgr.cs
```

例如：

```csharp
AssistClient.Instance.SendRequest(
    req,
    GR_PLAYER_PROPERTY_QUERY);
```

assist 收到 chunksvr 的通知后，再转发给客户端：

```text
GN_PLAYER_RPOPERTY_CHANGE
```

assist 代码：

```text
caiiassistsvr/server/socksvr.cpp
```

其中：

```cpp
GN_PLAYER_RPOPERTY_CHANGE
    -> game::busi::PlayerPropertyInfoList
    -> NotifyOneUserSomeData()
```

客户端由 `AssetsMgr` 更新本地道具缓存：

```csharp
Dictionary<int, PlayerPropertyInfo> userAssets
```

---

## 3. PlayerPropertyModule 的实际存储

服务端代码：

```text
caiichunksvr/busi/player_property_module.cpp
caiichunksvr/busi/player_property_module.h
```

### Redis 缓存

主要 Key：

```cpp
player_property:{userid}
player_property_equip:{userid}
player_property_trial:{userid}
```

道具缓存值类似：

```text
type|expire_time|level|fragments|trial_type|ad_process
```

缓存有效期：

```cpp
player_property_expire_time = 86400 * 7;
player_property_equip_expire_time = 86400 * 3;
```

### MySQL 持久化

道具主体表：

```sql
tbl_player_property
```

字段主要包括：

```text
user_id
prop_id
prop_type
cur_prop_level
cur_fragments
```

进度表：

```sql
tbl_player_property_process
```

用于保存广告解锁等进度。

装备信息则另外保存到：

```text
Redis player_property_equip:{userid}
```

并且有 MySQL 对应的装备查询/更新逻辑。

---

## 4. 金币、钻石在 PlayerPropertyModule 中的特殊含义

服务端定义了特殊道具 ID：

```cpp
ESPID_Coin = 1001
ESPID_Gem  = 7001
```

对应类型：

```cpp
kCoin    = 1
kDiamond = 7
```

因此在配置和奖励协议中，金币/钻石有时会被包装成“特殊道具”：

```text
prop_id = 1001 -> 金币
prop_id = 7001 -> 钻石
```

但这不代表它们真的存入 `tbl_player_property`。

`PlayerPropertyModule` 会对这两类特殊 ID 做分流。

例如奖励逻辑：

```cpp
SendPlayerAward(...)
```

遇到金币：

```cpp
HttpSyncTaskReward(...)
```

遇到钻石：

```cpp
HttpSyncTaskReward(...)
```

也就是说，金币和钻石最终仍然通过外部财富/任务系统发放。

---

## 5. chunksvr 如何扣除或增加金币钻石

chunksvr 通过 HTTP 调用外部系统：

### 查询余额

```cpp
HttpSyncGetDeposit(
    userid,
    cohttp::kDepositCoin,
    GAME_ID);
```

或者：

```cpp
HttpSyncGetDeposit(
    userid,
    cohttp::kDepositDiamond,
    GAME_ID);
```

实现位置：

```text
third_party/common_utils/cohttp/cohttp_func.cpp
```

### 消费资产

```cpp
HttpSyncGoShoping(...)
```

最终请求：

```text
{mall_url}/api/Exchange
```

适用于：

- 购买道具；
- 消耗钻石；
- VIP 房间钻石费用；
- Gem Rumble 入场费；
- 礼物消费；
- 道具解锁。

### 发放奖励

```cpp
HttpSyncTaskReward(...)
```

最终请求：

```text
{task_url}/mission/Complete
```

适用于：

- 对局奖励；
- 任务奖励；
- 每日奖励；
- 排行榜奖励；
- 活动奖励；
- 充值礼包；
- 金币/钻石奖励。

---

## 6. 客户端当前的更新方式

客户端存在两种更新方式。

### A. 服务器查询后的权威更新

```csharp
LobbyClient.Instance.RequestUserAsset();
```

收到 `HR_GET_MONEY_OWN_V2` 后直接替换：

```csharp
GlobalInfo.Instance.userAsset = userAsset;
```

这是最终可信余额。

### B. 客户端本地乐观更新

例如：

```csharp
GlobalInfo.Instance.AddGem(-entryFee);
GlobalInfo.Instance.AddDeposit(prize);
```

本质只是修改内存中的：

```csharp
userAsset.Data.GameDiamond.Diamond
userAsset.Data.GameSilver.Deposit
```

然后发 UI 通知：

```text
E_NOTIFY_COIN_UPDATE
E_NOTIFY_GEM_UPDATE
```

用于立即刷新界面和播放动画。

之后很多业务会再次调用：

```csharp
LobbyClient.Instance.RequestUserAsset();
```

进行服务器余额校准。

---

## 总体架构

```text
Unity 客户端
 ├─ HR_GET_MONEY_OWN_V2
 │       ↓
 │   大厅服务 / Gateway
 │       ↓
 │   外部财富系统
 │       └─ GameSilver / GameDiamond
 │
 └─ GR_PLAYER_PROPERTY_*
         ↓
     assist 服务
         ↓
     chunksvr
         ├─ PlayerPropertyModule
         ├─ Redis：道具缓存
         ├─ MySQL：道具持久化
         └─ GN_PLAYER_RPOPERTY_CHANGE
                 ↓
             assist
                 ↓
             Unity AssetsMgr
```

## 关键结论

| 类型 | 权威管理方 | chunksvr 是否直接持久化 |
|---|---|---|
| 金币 `GameSilver.Deposit` | 外部财富系统 | 否 |
| 钻石 `GameDiamond.Diamond` | 外部财富系统 | 否 |
| 头像、边框、球杆、礼物等道具 | chunksvr `PlayerPropertyModule` | 是 |
| 道具缓存 | Redis | 是 |
| 道具永久数据 | MySQL | 是 |
| 客户端显示余额 | `GlobalInfo.userAsset` | 仅内存缓存 |

对 UNO 来说，因为当前入场费为 0，暂时不会触发金币扣除；如果以后要增加 UNO 金币入场费，应该让服务端通过财富系统扣除，不能只在 Unity 中调用 `AddDeposit(-fee)`。