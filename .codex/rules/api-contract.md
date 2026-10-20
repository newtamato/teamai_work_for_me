# 接口契约（TCP 长连接 + Protobuf）

> 本文件是客户端(Unity/C#)与服务端(Linux/C++)唯一的接口对齐依据。任何网络消息的增删改都必须先改这里，双方按此实现。

## 1. 传输与序列化
- 传输：TCP 长连接
- 序列化：Protobuf（proto3）
- 字节序：所有长度/ID 字段统一小端（little-endian）

## 2. 帧格式
每个消息一帧，格式如下：

```
+----------------+----------------+------------------------+
| uint32 长度 LE  | uint32 msg_id LE| protobuf 序列化 payload |
+----------------+----------------+------------------------+
```

- 长度 = msg_id(4字节) + payload 的总字节数（不含长度字段本身）
- 拆帧规则：先读 4 字节长度，再读完整一帧；不足则等待（半包），多出则截断留作下一帧（粘包）

## 3. 消息 ID 分配
| 范围 | 用途 |
|------|------|
| 1000–1999 | 通用：心跳、握手、通用错误 |
| 2000–2999 | 账号/登录/鉴权 |
| 3000–3999 | 业务数据（按模块继续细分） |
| 9000+ | 保留，调试用 |

已分配：
| msg_id | 名称 | 方向 |
|--------|------|------|
| 1001 | HeartbeatReq / HeartbeatRes | C↔S |
| 2001 | LoginReq / LoginRes | C→S / S→C |

## 4. 心跳与超时
- 客户端每 10s 发一次 HeartbeatReq，服务端回 HeartbeatRes
- 服务端 30s 未收到任何包判定断线；客户端 15s 未收到响应判定断线，走重连逻辑

## 5. 通用响应格式（错误码）
所有响应建议带统一错误码：

```protobuf
message CommonRes {
  int32 code = 1;   // 0 成功；非 0 见错误码表
  string msg = 2;   // 错误描述（可空）
}
```

错误码：
| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 参数非法 |
| 1002 | 未登录/鉴权失败 |
| 1003 | 服务内部错误 |
| 1004 | 协议版本不匹配 |

## 6. 示例消息定义（proto3）
```protobuf
// 登录
message LoginReq {
  string account = 1;
  string password = 2;   // 生产环境应为加密/hash
  uint32 proto_ver = 3;  // 协议版本号
}
message LoginRes {
  int32 code = 1;
  string msg = 2;
  string token = 3;      // 后续请求鉴权用
  uint64 uid = 4;
}

// 心跳
message HeartbeatReq { uint64 ts = 1; }
message HeartbeatRes { uint64 ts = 1; }
```

## 7. 变更流程（重要）
1. 先在本文档修改/新增消息定义和 msg_id
2. 双方同步更新各自的 .proto 文件并重新生成代码
3. 客户端、服务端按新契约各自实现
4. 联调通过后再合并；若涉及不兼容改动，走「先兼容、后切换」策略
5. 用 proto_ver 保证两端协议版本一致
