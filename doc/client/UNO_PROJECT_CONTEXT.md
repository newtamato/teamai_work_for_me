# UNO 项目上下文入口

UNO 的跨客户端/服务端共同规范位于工作区：

```text
../UNO_PROJECT_SPEC.md
```

切换 agent 时必须先阅读该文件。它记录当前已按代码验证的：

- GameID、房间和端口边界
- 登录、游戏连接、进房和重连流程
- 客户端/服务端协议号及 protobuf 对照
- 匹配、机器人补位、开局和入场费
- UNO 操作、隐私、回合、托管和结算
- 直播、聊天、UNO 独立礼物链路
- 已知不一致、风险和未完成项
- 修改协议后客户端/服务端同步步骤

客户端专项实现和 UI 细节继续记录在：

```text
Assets/Scripts/UNO/UNO_PROTOCOLS.md
Assets/Scripts/UNO/README.md
../client/archive/uno-client-server-logic-notes.md
../client/archive/uno-live-chat-gift-integration.md
```

如果专项文档与共同规范冲突，以共同规范和当前代码为准，并在同一次修改中修正文档。
