# UNO TeamAI 协作规范

本目录是客户端与服务端的共同协作规则。工作区结构：

```text
UnoOnline-Client/   Unity 客户端
caii-server/        C++ 服务端源码，本地编辑
doc/                共同文档中心
```

任务管理规范详见 `../doc/LINEAR_TEAMAI_WORKFLOW.md`。Linear 负责任务状态和验收，TeamAI 负责工作规则，Git 负责代码。

## Agent 开始工作时

1. 阅读 `doc/README.md`。
2. 阅读 `doc/UNO_PROJECT_SPEC.md`。
3. 阅读 `rules/uno-cross-repo.md`。
4. 阅读 `../doc/LINEAR_TEAMAI_WORKFLOW.md`。
5. 检查客户端和服务端各自的 Git 状态。
5. 涉及协议或流程时，先更新规范，再修改代码。

## 仓库职责

- 本地 `caii-server` 是服务端源码编辑和提交位置。
- 53.48 是远程编译/运行机，不作为日常编辑目录。
- 服务端修改在本地提交后，再同步到 53.48 编译。
- 不提交编译产物、日志、`.linux-build` 或临时文件。
