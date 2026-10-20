# UNO 开发与自动验收强制规则

适用于所有 UNO 客户端、服务端、协议和测试任务。Linear 只记录任务状态和证据；本文件才是 Agent 每次接手任务必须执行的规范。

## 1. 接手任务

开始修改前必须：

1. 读取 `AGENTS.md`、`doc/README.md`、`doc/UNO_PROJECT_SPEC.md`、`rules/uno-cross-repo.md`、`doc/teamai-workflow.md`、`doc/LINEAR_TEAMAI_WORKFLOW.md`。
2. 读取本文件和适用的 `.codex/skills/*/SKILL.md`。
3. 查找或创建 Linear Issue，并记录范围、影响链路、验证计划。
4. 检查 `caii-server/` 和 `UnoOnline-Client/` 各自 git status，禁止覆盖无关未提交改动。

## 2. MVP 协议契约

每个新功能或协议修改先写清：

```text
请求 / 响应 / 通知
protobuf message 和字段
request id / 方向
错误码
状态机变化
权限和隐私边界
重连、超时、退出清理
客户端页面行为
自动验收场景
```

## 3. 全链路影响图

修改前必须从入口追到 UI 和清理：

```text
MessageNo / proto
→ Unity sender/receiver
→ MP/proxy
→ server handler
→ service/module
→ cache/state
→ response/notify
→ Unity state/UI
→ disconnect/reconnect/cleanup
→ caii-test
```

没有确认的链路必须标为风险，不能只凭局部编译通过交付。

## 4. 代码边界

新增代码按职责拆分：

- Protocol/DTO：只负责协议模型和转换；
- Application/UseCase：只负责编排业务流程；
- Port/Interface：定义依赖方向；
- Adapter：TCP、Assist、Live、Chunk、Unity SDK 等外部实现；
- Presentation：UI 展示和用户输入。

遵守：

- SRP：一个类只有一个主要变化原因；
- ISP：调用方依赖最小接口，不依赖万能管理器；
- DIP：业务依赖接口，运行环境注入 TCP/Unity/测试实现；
- 不在 UI 中直接拼 protobuf、扣费、裁决服务端状态或直接操作 socket；
- 不为了通过测试修改生产逻辑；测试暴露生产问题时先说明影响并取得确认。

旧代码不要求一次性重构；修改附近必须遵守，逐步用新边界替换旧边界。

## 5. 自动验收门禁

### 服务端/协议

- 编译目标服务；
- 检查进程 PID 和 `/proc/<pid>/exe`，确认不是 `(deleted)` 旧二进制；
- 运行 caii-test 协议场景；
- 检查成功、错误、超时、重连和清理；
- 保存日志、JSONL、构建输出和关键时间点。

### Unity

修改 `UnoOnline-Client/` 时必须读取 `ProjectSettings/ProjectVersion.txt`，确认对应 Unity Editor 是否可用。可用时至少执行：

```bash
Unity -batchmode -nographics -quit \
  -projectPath "$PWD/UnoOnline-Client" \
  -runTests -testPlatform editmode \
  -testResults /tmp/uno-editmode-results.xml
```

并检查退出码、Editor.log、编译错误和 XML 结果。若 Unity 不可用，必须标记 `BLOCKED/UNVERIFIED`，不能声称客户端通过。若存在 PlayMode 测试，必须一并运行。

自动测试不能替代人工视觉验收，但应把人工范围限制在布局、动画、触摸、真机网络和体验判断。

## 6. 交付状态

最终报告必须分开写：

```text
已修改
已编译
已自动验证
已人工验证
未验证/阻塞
剩余风险
```

以下任一项未完成，都不能写“整体已通过”：Unity 不可用、跨链路未验证、只编译未运行、只服务端通过但客户端未验证、只人工观察但无协议证据。
