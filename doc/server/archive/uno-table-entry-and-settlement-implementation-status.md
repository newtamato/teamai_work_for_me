已继续开发，机器人入场资产链路也接上了。

## 本次完成

### UNO 开局通知增加入场费

```protobuf
UnoGameStartNotify.entry_fee
```

正式 UNO 开局后发送：

```text
GN_C_UNO_GAME_START
```

### 机器人入场扣款

```text
caiirobotsvr 收到 GN_C_UNO_GAME_START
  → Robot::deposit_ -= entry_fee
  → RobotBackDeposit(entry_fee)
  → change_deposit.url 执行实际扣款
```

因此机器人和真人都会扣除：

```text
30 金币
```

但资产执行路径不同：

```text
真人 → caiisvr → checksvr
机器人 → caiirobotsvr → change_deposit.url
```

### 最终结算

UNO 结算现在会：

```text
第 3、4 名：
实际扣款 = min(手牌分, 当前余额)

奖池：
第 3、4 名实际扣款之和

第 1、2 名：
从实际奖池分配

真人：
RefreshGameResult → checksvr

机器人：
coin_delta → caiirobotsvr → change_deposit.url
```

### Carrom 逻辑隔离

UNO 当前不再调用：

```text
GameTable::PayForEntryFee()
GameTable::CommitFinalResult()
GameBoutData
```

并已给 Carrom 的 `PayForEntryFee()` 增加详细注释，明确它只是入场扣款，不是最终结算。

## 编译结果

```text
caiisvr       BUILD_OK
caiirobotsvr  BUILD_OK
caiichunksvr  BUILD_OK
```

下一步继续验证结算完成后的桌子释放、玩家重新匹配，以及多机器人同桌时的结算通知分发。
