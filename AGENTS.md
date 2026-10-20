# UNO workspace — Agent 入口与规则索引

本文件是工作区的唯一规则入口。规则正文维护在 `rules/`，知识维护在 `memory/`，操作流程维护在 `.agents/skills/`。服务端改动另读 `caii-server/AGENTS.md`。

## 接手与交付

1. 读取 [记忆规则](rules/memory.md) 与 [记忆索引](memory/INDEX.md)，按范围、状态及关键词读取相关条目，核实容易变化的事实。
2. 修改前读取 [开发规范](rules/development.md)；Skill 工作读 [Skill 规范](rules/skills.md)；定时任务读 [定时规范](rules/automations.md)；协作前读 [协作规范](rules/collaboration.md)。
3. 核对工作区、分支、远程基线和真实实现。默认分支保持稳定，每个修改任务使用独立工作树；只读咨询不创建空任务。
4. 工程入口为 `npm run agent -- help`。交付前主动完成记忆、Skill 复盘，执行 `npm run check`，提交后运行 `npm run agent -- merge-check`。
5. 没有新增稳定知识或可复用流程时写具体 none 理由，不制造知识。

## 规则索引

| 文件 | 职责 | 读取条件 |
|---|---|---|
| [development.md](rules/development.md) | 工作树、验证、CLI同步、合并与发布 | 任何修改任务 |
| [memory.md](rules/memory.md) | 读取、主动沉淀、证据、失效与交付回执 | 每次接手 |
| [skills.md](rules/skills.md) | 触发、版本、资源、主动固化与认证边界 | Skill 创建/修改或任务复盘 |
| [automations.md](rules/automations.md) | 定时只触发Skill、日期、幂等与配置回读 | 定时任务及其Skill |
| [collaboration.md](rules/collaboration.md) | 授权、派发、文件归属、交接与整合 | 多人/子代理协作 |

## 范围与授权

- 最新用户指令优先；规则约束执行，记忆提供参考，Skill 不扩大授权。外部发布、发消息、合并、部署及业务数据写入必须有明确任务授权。
- 不覆盖他人未提交改动，不把密钥、身份标识、原始私有数据、生产日志或会话历史提交到仓库。
- 确定性工具检查结构与关联，Agent 负责语义审查。平台 CI、分支保护与发布适配器须由维护者接入。

## UNO 客户端/服务端工作区规则

Before changing UNO client or server code, read:

- `doc/README.md`
- `doc/UNO_PROJECT_SPEC.md`
- `rules/uno-cross-repo.md`
- `rules/uno-development-and-acceptance.md`
- `doc/teamai-workflow.md`
- `doc/LINEAR_TEAMAI_WORKFLOW.md`

For server work, also read `caii-server/AGENTS.md`: edit locally, then sync changed files to `root@192.168.53.48:/root/projects/caii-server` before compiling and testing.

## Unity client validation gate

When changing `UnoOnline-Client/` code, an agent must not report completion from C# diff inspection alone:

1. Read `UnoOnline-Client/ProjectSettings/ProjectVersion.txt` and identify the required Unity version.
2. Check whether that Unity Editor is installed locally or whether the approved build/validation machine is available.
3. Run Unity in batch mode at minimum to import/compile the project; when Unity Test Framework tests exist, also run EditMode/PlayMode tests and write a test-results XML file:

```bash
Unity -batchmode -nographics -quit \
  -projectPath "$PWD/UnoOnline-Client" \
  -runTests -testPlatform editmode \
  -testResults /tmp/uno-editmode-results.xml
```

4. Inspect the process exit code, `Editor.log`, compiler errors, and test-results XML. A failed or unavailable Unity validation is `BLOCKED/UNVERIFIED`, never `PASS`.
5. Report Unity version, command, result path, and remaining manual visual checks in Linear. Visual layout, animation, touch flow, and real-device behavior still require human acceptance.

If the required Unity Editor is not available, stop before claiming completion and record the exact missing tool/host in the Linear Issue. The local `caii-server/` checkout is the server source of truth for editing; the server at 192.168.53.48 is used for compilation and runtime validation only.

## caii-test 测试代码边界

- `caii-test/` 只能修改自身测试代码；新增测试场景、参数和输出也必须限制在 `caii-test/`。
- 运行或扩展 `caii-test` 时，不得为迁就测试而修改 UNO 客户端、服务端或其他项目代码。
- 若测试暴露确实需要修改项目代码的问题，必须先向用户说明原因、影响范围和拟修改文件，获得明确同意后再修改。

## Agent handoff and knowledge capture

After every delegated Agent task, the main Agent must produce a concise handoff containing: task result and status; files changed; validation performed and results; remaining risks or follow-up work; reusable conclusions worth preserving. Save only reusable, cross-session conclusions to Agent Memory; write protocol rules, implementation conventions, and verified workflows to the appropriate project documentation.

## Agent governance

- Read `memory/INDEX.md` at task start; keep reusable project knowledge in `memory/` and use `memory/TEMPLATE.md` for new entries.
- Keep constraints in `rules/`, repeatable verified procedures in `.agents/skills/`, and one-off results out of durable memory.
- 本仓库是治理 git 仓库；`caii-server/`、`UnoOnline-Client/` 是独立 git 仓库，代码改动分别提交，不通过本仓库的 `task create`/`merge-check` 覆盖子项目。
- 集成边界记录在 `memory/2026-10-09-workspace-governance.md`。
