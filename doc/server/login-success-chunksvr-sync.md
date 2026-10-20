我看完了，当前链路是这样的。

## 一、登录成功本身不直接触发 caiichunksvr

登录主链路：

```text
客户端
  → caiihall::HR_LOGON
  → caiihall 转发给 blocksvr
  → blocksvr 返回 hall::game::LogonResp
  → caiihall 先把登录结果返回客户端
  → hall_cache 保存 userid/token 登录关系
```

关键代码：

```text
caiihall/main_server.cpp
caiihall/client/block_client.cpp
```

登录成功处：

```cpp
BlockClient::OnLogonResp()
```

这里主要做两件事：

1. 向客户端返回 `LogonResp`
2. 保存：
   ```text
   userid
   token
   socket
   user_type
   ```

这里**没有直接调用 caiichunksvr**。

---

## 二、caiichunksvr 收到的“登录后同步”协议

玩家上线后，`caiiassistsvr` 会收到：

```text
GR_ASSIST_UPLOAD_USER_INFO_REQ
```

定义：

```text
common/request_enum.h
GR_ASSIST_UPLOAD_USER_INFO_REQ = GR_CAII_REQUEST_COMMON + 500
```

协议内容：

```protobuf
message ClientUploadInfoReq {
    int32 userid = 1;
    int32 old_userid = 2;
    int32 create_day = 3;
    int32 create_time = 4;
    string version = 5;
}
```

`caiiassistsvr` 收到后：

```cpp
SockServer::OnRecordTokenMap()
```

会做：

```text
1. 记录 userid → token/socket
2. 转发 GR_ASSIST_UPLOAD_USER_INFO_REQ 到 caiichunksvr
3. 将 userid 加入 Redis 在线用户集合
```

关键代码：

```text
caiiassistsvr/server/socksvr.cpp
```

---

## 三、caiichunksvr 如何处理

`caiichunksvr` 的 `SockServer::OnBusiRequest()` 对这个协议特殊处理：

```cpp
if (request.head.nRequest == GR_ASSIST_UPLOAD_USER_INFO_REQ) {
    ParseFromRequest(...);
    SimulateMsg2Svr(GR_SCORE_LOGIN, params);
}
```

也就是说：

```text
GR_ASSIST_UPLOAD_USER_INFO_REQ
  → caiichunksvr 内部模拟 GR_SCORE_LOGIN
```

协议：

```text
GR_SCORE_LOGIN = GR_CAII_REQUEST_COMMON + 558
```

处理模块：

```text
caiichunksvr/busi/score_module.cpp
ScoreModule::OnLogin()
```

---

## 四、GR_SCORE_LOGIN 实际同步/处理的数据

### 1. 积分任务状态

`OnLogin()` 会：

```text
查询任务版本
读取 score_task_config.json
检查玩家是否满足任务条件
执行每日登录任务
```

如果登录任务产生进度变化，会发送：

```text
GN_SCORE_TASK_STATUS_NTF
```

数据类型：

```protobuf
ScoreTaskStatusNotify
```

内容包括：

- 玩家任务配置
- 任务 ID
- 任务进度
- 任务状态
- 奖励积分
- 任务类型和参数

发送方式：

```cpp
GetSockSvr()->AssistNotifyOneUser(
    user_id,
    GN_SCORE_TASK_STATUS_NTF,
    ntf
);
```

---

### 2. 积分跨月结算

`OnLogin()` 内部还会执行：

```cpp
SettleScore(user_id, ...)
```

如果检测到跨自然月，可能发送：

```text
GR_SCORE_SETTLE_NTF
```

数据：

```protobuf
ScoreSettleNTF
```

包括：

- userid
- 上月结算积分
- 可兑换金币数量

---

### 3. Redis 在线用户记录

这部分不是 caiichunksvr 做的，而是 `caiiassistsvr`：

```text
RedisKey::onlineusers
```

执行：

```text
SADD onlineusers userid
```

---

## 五、当前不会在登录成功时自动同步的数据

当前登录链路中，caiichunksvr **没有自动下发**：

- 玩家完整资料
- 昵称、头像
- 金币/钻石
- 玩家段位
- 好友列表
- 关注列表
- VIP 状态
- 礼包状态
- 活动状态
- UNO 等级/经验

这些通常需要客户端登录后主动请求，例如：

```text
GR_SCORE_QUERY_TASK_REQ
GR_PLAYER_INFO_QUERY
GR_RANK_QUERY
GR_PLAYER_PROPERTY_QUERY
```

具体请求是否发送，要看客户端登录后的代码。

---

## 六、一个值得注意的问题

`caiichunksvr` 触发的是：

```text
GR_SCORE_LOGIN
```

但 `TaskModule::OnLogin()` 当前是被注释掉的，旧的新手任务登录逻辑没有启用。

因此目前自动执行的主要是：

```text
ScoreModule::OnLogin()
```

也就是：

```text
积分任务登录进度
积分跨月结算
```

不是完整的“玩家登录数据同步”。

总体链路可以总结为：

```text
HR_LOGON
  → blocksvr 登录成功
  → hall_cache 保存登录信息
  → assistsvr 收到 GR_ASSIST_UPLOAD_USER_INFO_REQ
  → 转发给 caiichunksvr
  → caiichunksvr 模拟 GR_SCORE_LOGIN
  → ScoreModule::OnLogin
  → 可能发送：
       GN_SCORE_TASK_STATUS_NTF
       GR_SCORE_SETTLE_NTF
```
