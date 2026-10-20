# caiirobotsvr 服务说明

## 服务职责

`caiirobotsvr` 是机器人账号和连接管理服务，不负责 UNO 牌局规则或机器人出牌决策。

当前主要职责：

- 加载和管理机器人账号
- 机器人登录大厅
- 机器人断线续玩查询
- 查询和变更机器人金币/银两
- 维护大厅、游戏服、分片服连接
- 机器人状态和消息队列监控
- 异常告警

UNO 的牌局状态、机器人选牌、摸牌、出牌、+4 质疑和回合推进均由 `caiisvr` 权威处理。即使 `caiirobotsvr` 中断，已进入 UNO 牌桌的机器人仍应由 `caiisvr` 自动完成回合。

## 定时任务

### RobotMgr 驱动定时器

实现位置：

```text
caiirobotsvr/robot/robot_mgr.cpp
caiirobotsvr/robot/robot_mgr.h
```

定时器成员：

```cpp
std::unique_ptr<boost::asio::deadline_timer> drive_timer_;
int32_t timer_interval_ = 30;
```

服务启动后立即执行一次：

```cpp
StartDriveTimer(0);
```

之后默认每 30 秒执行一次：

```cpp
RobotMgr::DriveRobots()
```

驱动任务包括：

- 检查登录中的机器人是否超时
- 重试机器人登录
- 重试断线续玩查询
- 重试金币/银两查询
- 批量登录等待中的机器人
- 批量处理机器人金币变更
- 统计机器人队列数量
- 发送异常告警

### 主线程监控循环

实现位置：

```text
caiirobotsvr/main.cpp
```

监控间隔来自 `RobotBusiConfig::monitor_interval`，默认值为：

```text
5000 毫秒
```

监控对象包括：

- `robot_mgr` 工作消息队列
- `hall_client` 工作消息队列
- `hall_client` 网络消息队列
- `game_client` 工作消息队列
- `game_client` 网络消息队列

超过 `warn_msg_count` 时，通过 UDP/告警服务发送告警。

### HallClient 心跳定时器

实现位置：

```text
caiirobotsvr/client/hall_client.cpp
```

当前间隔为：

```text
30 分钟
```

目前代码主要负责重新调度定时器，实际心跳发送逻辑仍标记为 TODO。

### GameClient 心跳定时器

实现位置：

```text
caiirobotsvr/client/game_client.cpp
```

当前间隔为：

```text
30 分钟
```

与 `HallClient` 类似，目前保留了定时器框架，实际心跳发送逻辑仍标记为 TODO。

## UNO 架构边界

```text
caiirobotsvr
  ├─ 机器人账号管理
  ├─ 登录和连接维护
  ├─ 断线续玩查询
  └─ 金币/银两管理

caiisvr
  ├─ UNO 牌局状态
  ├─ 机器人出牌策略
  ├─ 真人托管策略
  ├─ 摸牌、出牌、Pass
  ├─ +4 质疑
  └─ 回合超时和回合推进
```

`caiirobotsvr` 不应重新增加 UNO 出牌定时器或依赖 UNO 状态通知来驱动机器人操作。
