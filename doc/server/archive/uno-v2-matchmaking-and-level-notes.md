# UNO 第二版匹配与等级配置

## 匹配目标

游戏采用：

```text
真人优先匹配 + AI 机器人补位
```

## 真人匹配窗口

以一张匹配桌第一个真人进入时间为起点：

### 0–8 秒

优先匹配等级差值小于等于 5 级的真人玩家：

```text
abs(player_level - table_player_level) <= 5
```

### 8–12 秒

扩大匹配范围，允许等级差值小于等于 10 级：

```text
abs(player_level - table_player_level) <= 10
```

### 超过 12 秒

进入机器人补位阶段。

机器人不是一次性填满，而是按间隔逐个进入：

```text
平均 1–3 秒进入 1 个机器人
```

如果在等待机器人补位期间有符合条件的真人进入，真人仍然可以加入该匹配桌。

## 等级与经验

当前 dev 版本使用内存经验数据，后续可接正式账号 / DB。

配置文件：

```text
caiisvr/config/uno_level_config.json
```

当前默认配置：

```json
{
  "expPerGame": 20,
  "expPerLevel": 100,
  "baseLevel": 1,
  "matching": {
    "strictWindowMs": 8000,
    "strictMaxLevelDiff": 5,
    "relaxedWindowMs": 12000,
    "relaxedMaxLevelDiff": 10,
    "robotFillStartMs": 12000,
    "robotFillMinIntervalMs": 1000,
    "robotFillMaxIntervalMs": 3000
  },
  "devInitialExp": {}
}
```

等级计算：

```text
level = baseLevel + floor(exp / expPerLevel)
```

默认：

```text
每玩 1 局 +20 经验
每 100 经验升 1 级
初始等级 1
```

## 当前实现状态

已在 `UnoDebugTable` HTTP dev 多桌路径实现：

- `LevelConfig`
- 配置读取 `UNO_LEVEL_CONFIG` 或默认 JSON
- 玩家内存经验 `dev_player_exp_`
- `GetPlayerLevelLocked()`
- 按等级差选择 matching table
- 超 12 秒后机器人逐个补位
- 单局结束后真人玩家 +20 经验

## 限制

当前经验是进程内存态，`caiisvr` 重启后会丢失。后续接正式账号系统后，应从 DB/玩家资料服务读取和写回经验。
