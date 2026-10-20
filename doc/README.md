# UNO 项目文档中心

这是客户端和服务端共用的唯一文档目录。切换 agent 时不要分别寻找旧的 `server_doc` 或客户端 `docs` 目录。

## 入口顺序

1. `UNO_PROJECT_SPEC.md`：跨客户端/服务端的当前真实流程、协议和不变量，最高优先级。
2. `UNO_DOCUMENT_AUDIT.md`：旧文档审计结果和已纠正的事实。
3. `LINEAR_TEAMAI_WORKFLOW.md`：Linear、TeamAI、Git 和 agent 交接规范。
4. `server/`：服务端部署、账号资产、机器人和公共服务文档。
5. `client/`：客户端专项上下文和公共资产/聊天文档。
6. `server/archive/`、`client/archive/`：历史需求、设计草案和阶段性实现记录，只用于追溯，不能当作当前实现。

## 文档分类规则

每份新文档开头必须注明目的：

```text
当前规范 / 实现说明 / 运维手册 / 测试记录 / 需求草案 / 历史记录
```

规则：

- 当前实现以代码和 `UNO_PROJECT_SPEC.md` 为准。
- 需求或架构文档不能写成“已实现”，除非有代码路径或测试记录支持。
- 协议、流程、费用、隐私和玩家可见性变化时，先更新共同规范，再更新专项文档。
- 历史文档不删除，但必须放在 `archive/`，避免 agent 误读。
- 不在 `UnoOnline-Client/docs` 或 `server_doc/docs` 新建文档；新文档统一放入本目录。
- 配置 Excel 统一放在工作区根目录 `excels/`；Luban 生成规范见 `LINEAR_TEAMAI_WORKFLOW.md`。

## 当前最重要的待办

详见 `UNO_PROJECT_SPEC.md` 的“当前未完成/高风险项”和 `UNO_TODO.md`，尤其是：

- UNO 观战房允许公开指定被观战真人的手牌，但必须避免误广播其他玩家私有手牌、牌堆顺序或未公开摸牌结果；
- UNO LiveChat 创建、销毁、`bout_id` 和观众送礼需要实测；
- 正式桌的服务端托管 AI 与机器人服职责需要统一；
- GameTable/GameBoutData 公共生命周期仍需 UNO 回归测试。
