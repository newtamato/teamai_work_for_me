# UNO 机器人进入游戏与资产结算流程

## 一、配置

### UNO 游戏配置

```text
GameID = 1028
入场费 = 30
```

配置位置：

```text
caiisvr/ini/caiisvr_busi.ini
[UNO]
EntryFee=30
```

### 机器人资产配置

```cpp
WUNO_GAMEID       = 1028
WUNO_DEPOSIT_TYPE = 20
```

机器人配置：

```ini
[robot]
min_deposit=1000
default_deposit=5000
max_deposit=80000000
```

## 二、真人进入游戏

```text
客户端
  → caiisvr GR_C_ENTER_GAME
  → caiisvr 校验 GameID=1028
  → caiisvr 请求 checksvr HR_ENTER_GAME_V2
  → checksvr 返回玩家资产
  → caiisvr 创建/加入 UNO 房间
  → 返回进入成功
```

`caiisvr` 给 checksvr 使用的是：

```cpp
kDepositType_GameOwn
```

这个是 checksvr 内部的“游戏自身货币类型”，和机器人 HTTP 请求中的 `Type=20` 是两套不同的类型定义。

## 三、机器人查询余额

机器人登录大厅后，通过大厅接口发起资产查询：

```text
http://gatewayapi.comfun.org:1505/gamewealth?gameid=1028
```

使用 Cookie：

```text
CF_AccessToken
CF_NickName
CF_UserID
```

返回结果中的 `deposit` 作为机器人当前余额：

```json
{"Code":0,"Data":5000}
```

机器人只有满足：

```text
deposit >= 入场费 30
```

才会被选中进入游戏。

## 四、机器人进入游戏

```text
caiisvr 发现桌上缺少玩家
  ↓
发送 GN_C_CALL_ROBOT 给 caiirobotsvr
  ↓
caiirobotsvr 自己查询机器人余额
  ↓
选择余额足够的机器人
  ↓
发送 GR_C_ROBOT_ENTERGAME 给 caiisvr
  ↓
caiisvr 收到 GR_C_ROBOT_ENTERGAME
  ↓
caiisvr 转发给 checksvr：HR_ENTER_GAME_V2
  ↓
checksvr 查询机器人资产并校验
  ↓
checksvr 响应 HR_ENTER_GAME_V2
  ↓
caiisvr 进入 OnRobotEnterGame
  ↓
caiisvr 在这里更新机器人的 deposit
  ↓
机器人正式加入 UNO 桌子
```

机器人进入请求使用：

```text
GameID = 1028
RoomID = 当前房间
TableNo = 当前桌号
UserID = 机器人账号
```

关键点：

- `caiirobotsvr` 查询余额只是为了**选择可用机器人**；
- `caiirobotsvr` 不会把余额直接传给 `caiisvr`；
- `caiisvr` 中机器人的最终 `deposit` 来自 checksvr；
- checksvr 通过 `HR_ENTER_GAME_V2` 响应中的资产信息更新 caiisvr；
- 机器人资产实际上被查询了两次：
  1. `caiirobotsvr` 查询，用于筛选机器人；
  2. `checksvr` 查询，用于 caiisvr 正式建立游戏用户。

也就是说：

```text
机器人服余额：用于选机器人
checksvr余额：用于更新 caiisvr 中的机器人 deposit
```

## 五、开局扣入场费

开局时入场费是 `30`。

### 真人

`caiisvr` 直接处理：

```text
旧余额 - 30 = 新余额
```

然后通过：

```text
RefreshGameResult
requestid = 10010012
```

提交给 checksvr。

### 机器人

机器人不由 caiisvr 直接扣钱。

```text
caiisvr 向 caiirobotsvr 发送一次 GN_C_UNO_GAME_START
  → caiirobotsvr 遍历本桌机器人
  → 每个机器人扣除 30
  → 调用 Robot/ChipsOperate
```

机器人扣款请求：

```text
http://activityapi.comfun.org:1505/Robot/ChipsOperate
```

主要 JSON 字段：

```json
{
  "GameId": 1028,
  "ActId": "530",
  "UserId": 738099,
  "Num": 30,
  "Operation": 2,
  "Type": 20
}
```

其中：

```text
Operation=2：扣除资产
Type=20：UNO 游戏货币
ActId=530
```

签名：

```text
MD5(ActId + "|" + UserId + "|" + Time + "|" + key)
```

## 六、结算

UNO 结算由 `caiisvr` 统一计算每个玩家的：

```text
coin_delta
```

例如：

```text
真人：-25
机器人：+25
机器人：-30
机器人赢家：+30
```

### 真人结算

由 caiisvr 更新本地余额，并通过 `RefreshGameResult` 提交 checksvr。

### 机器人结算

当前方案：

```text
caiisvr 每局只发送一次整桌 GN_C_UNO_GAME_RESULT
  → caiirobotsvr 根据 userid 匹配 players[].coin_delta
  → 每个机器人只处理自己的变化
```

机器人资产接口规则：

```text
coin_delta > 0：
  Operation=1，加钱

coin_delta < 0：
  Operation=2，扣钱
```

例如机器人赢家：

```json
{
  "GameId": 1028,
  "UserId": 738142,
  "Num": 30,
  "Operation": 1,
  "Type": 20
}
```

接口返回：

```json
{"Code":0,"Data":5030}
```

其中 `Data` 是接口返回的最终余额，机器人服会用它覆盖本地余额。

## 七、当前方案总结

```text
caiisvr：
  对机器人开局通知发送一次
  对机器人结算通知发送一次

caiirobotsvr：
  收到整桌通知后，按 userid 分别处理机器人资产
```

机器人资产接口始终使用：

```text
Type=20
GameId=1028
```

加钱/扣钱 URL：

```text
http://activityapi.comfun.org:1505/Robot/ChipsOperate
```
