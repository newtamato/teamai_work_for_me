原先机器人的资产更新链路主要在 `caiirobotsvr`，不是 `caiisvr`、`caiichunksvr`，也不是 `checksvr/blocksvr` 直接管理。

## 1. 机器人登录后查询金币

```text
caiirobotsvr
  → HallClient
  → money_url HTTP 接口
  → 返回机器人金币
  → Robot::deposit_
```

配置：

```ini
money_url=http://gatewayapi.comfun.org:1505/gamewealth?gameid=1018
```

代码：

```text
caiirobotsvr/client/hall_client.cpp
```

处理函数：

```cpp
OnMsgSearchMoneyOwn()
OnSearchMoneyOwnResp()
```

---

## 2. 被召唤进游戏

```text
caiisvr → GN_C_CALL_ROBOT
  → caiirobotsvr::OnCallRobot()
  → 选择 deposit 足够的机器人
  → 发送 RobotEnterGameReq
```

选择条件：

```cpp
robot->get_deposit() >= call.entry_fee()
```

机器人进入游戏后，`caiirobotsvr` 会把机器人放入：

```text
ingame_robots_
```

---

## 3. 游戏开始扣除入场费

收到游戏开始通知：

```text
GameStartNotify
```

机器人服务本地扣除：

```cpp
robot->change_deposit(-robot->get_entry_fee());
```

这个阶段只是修改：

```text
Robot::deposit_
```

还没有立刻调用外部金币接口。

---

## 4. 游戏结算增加获胜金币

收到：

```text
GameResultNotify
```

如果机器人所在队伍获胜：

```cpp
robot->change_deposit(notify->win_deposit());
```

同样只是更新 `caiirobotsvr` 内存中的金币数。

---

## 5. 机器人金币超出范围后重新调整

机器人服务会检查：

```ini
[robot]
min_deposit=...
max_deposit=...
default_deposit=...
```

如果：

```text
deposit < min_deposit
```

则补金币：

```cpp
RobotGainDeposit()
```

如果：

```text
deposit > max_deposit
```

则回收金币：

```cpp
RobotBackDeposit()
```

实际请求由：

```text
caiirobotsvr/robot/robot_http.cpp
```

发送到：

```ini
[change_deposit]
url=...
```

请求外部资产服务：

```text
change_deposit.url
```

返回结果后：

```cpp
RobotMgr::OnRobotChangeDeposit()
```

再更新：

```cpp
robot->set_deposit(notify->deposit());
```

---

## 6. checksvr/blocksvr 的作用

它们主要参与：

```text
机器人登录校验
机器人进入游戏校验
userid/token 验证
```

机器人金币的真实查询和修改不由它们直接完成。

当前架构是：

```text
机器人金币查询：
caiirobotsvr → money_url

机器人金币补充/回收：
caiirobotsvr → change_deposit.url

checksvr/blocksvr：
只负责认证和进入校验
```

## 对 UNO 的影响

原先这套资产链路是围绕 Carrom 的：

```text
GameStartNotify
GameResultNotify
entry_fee
win_deposit
```

当前 UNO 使用的是自己的：

```text
GN_C_UNO_GAME_RESULT
```

所以 UNO 不能直接依赖旧的 `OnGameStart()` / `OnGameResult()` 资产逻辑。

UNO 后续结算需要单独决定：

```text
真人金币：
通过正式资产接口扣除/增加

机器人金币：
不扣机器人资产，但按理论输金币计入奖池，由系统承担
```

也就是说，机器人原有资产系统可以继续维护机器人自身余额，但 UNO 奖池不应该直接从机器人 `deposit_` 中扣除。
