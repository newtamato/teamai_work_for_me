# UNO workspace 治理仓库

这是 `uno_workspace` 工作区的**治理层 git 仓库**，只版本化跨客户端/服务端的规则、记忆、技能与工程守卫。各子项目（`caii-server/`、`UnoOnline-Client/` 等）是独立 git 仓库，代码改动在各自仓库提交，不入本仓库。

## 目录与职责

| 位置 | 保存什么 |
|---|---|
| `AGENTS.md` | 规则入口，正文维护在 `rules/` |
| `rules/` | 开发、记忆、Skill、定时、协作等执行约束 |
| `memory/` | 可检索的稳定知识（索引 + 条目 + 模板） |
| `.agents/skills/` | 可复用操作流程（Agent Skills 规范） |
| `scripts/`、`tests/` | 确定性治理工具与合成验证 |
| `templates/` | Skill 模板、交付复盘输入示例、定时配置示例 |

## 常用命令

```sh
npm run agent -- help            # 离线帮助
npm run agent -- memory-check    # 检查记忆结构及当前任务复盘
npm run agent -- check           # 结构、记忆、Skill、可选能力、测试及配置检查
npm run agent -- merge-check     # 合并前本地门禁（不执行平台合并）
npm test                         # 运行合成测试
```

工程工具使用 Node 22 内置模块，无第三方运行依赖。接入与维护见 [新项目接入](doc/getting-started.md) 与 [维护与升级](doc/maintenance.md)。
