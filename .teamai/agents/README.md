# UNO Agent Team

所有 Agent 共享当前工作区，但只能写入自己的职责范围。Linear 是唯一的任务状态中心，TeamAI 负责调度，项目文档库是最新项目事实来源。

## Agent 目录与写入范围

| Agent | System prompt | 可写范围 |
|---|---|---|
| project-manager | `project-manager.md` | `.teamai/` 中的任务编排记录；Linear 任务与评论 |
| client-developer | `client-developer.md` | `UnoOnline-Client/`、客户端相关文档 |
| server-developer | `server-developer.md` | `caii-server/`、服务端相关文档 |
| protocol-developer | `protocol-developer.md` | 两端协议源、生成代码和协议文档 |
| knowledge-steward | `knowledge-steward.md` | `.teamai/knowledge/knowledge-steward/`；不得修改其他 Agent 的经验 |
| code-reviewer | `code-reviewer.md` | 只读审查代码；不得修改业务代码或其他 Agent 的经验 |

所有 Agent 都可以读取整个工作区和其他 Agent 的经验，但不得修改职责范围外的代码或经验记录。

## 任务协作

开发 Agent 遇到技术问题先联系项目经理；遇到产品、交互、人工设备验证、权限或不可逆操作问题，由项目经理向用户提问。客户端 Agent 编译通过后将任务置为 `Ready for User Test`，最终业务验收由用户完成。
