# Agent 治理与经验沉淀规则

> 本规则补充 TeamAI 的 Agent 交付约束，不替代 `doc/UNO_PROJECT_SPEC.md`、`rules/uno-cross-repo.md` 或现有 `.codex/rules/`。

## 适用范围

- 工作区根目录不是 Git 仓库；客户端和服务端分别在 `UnoOnline-Client/`、`caii-server/` 维护。
- 需要修改代码时，先检查两个目标仓库的分支、脏文件和 worktree；不覆盖未提交改动。
- 跨端任务继续以 Linear Issue、共同文档和两个仓库的 Git 提交作为记录来源。

## 接手顺序

1. 读取根目录 `AGENTS.md`。
2. 读取 `doc/README.md`、`doc/UNO_PROJECT_SPEC.md`、`rules/uno-cross-repo.md`、`doc/teamai-workflow.md` 和相关 Linear Issue。
3. 执行：

   ```bash
   git -C UnoOnline-Client status --short --branch
   git -C caii-server status --short --branch
   ```

4. 明确本轮允许修改的仓库、目录、协议、文档和验证范围。

## 经验沉淀

只有跨任务仍然有效的内容才写入 `memory/`：

- 项目事实、协议不变量、已验证修复、设计决策、用户长期偏好：写记忆；
- 权限、边界、接手顺序和禁止事项：写规则；
- 可重复执行的构建、生成、测试或发布步骤：经验证后写 Skill；
- 一次性结果、日志、聊天过程、账号、Token、生产原件：不沉淀。

新增或更新记忆时：

1. 使用 `memory/TEMPLATE.md`；
2. 文件名使用 `YYYY-MM-DD-short-topic.md`；
3. 同步更新 `memory/INDEX.md`；
4. 写清来源、验证方式、证据、失效条件和下次行动；
5. 事实过期时标记 `pending`，被新结论替代时保留历史并标记 `superseded`，不得静默删除。

## Skill 沉淀

Skill 继续放在已有 `.codex/skills/` 体系中，除非后续明确决定迁移目录。创建或更新前必须判断：

```text
create / update / reuse / defer / none
```

仅当流程有明确重复价值并至少完整验证成功一次，才创建或更新 Skill。Skill 必须说明输入、输出、权限、停止条件、失败处理和验收方式。不要把一次性任务或长篇提示词直接保存为 Skill。

## 交付复盘

每个修改任务完成后，主 Agent 必须报告：

- 修改了哪个仓库和哪些文件；
- 客户端、服务端、协议生成、文档和配置分别发生了什么；
- 实际运行过的构建和测试命令及结果；
- 新增/更新/复用/延后/不沉淀的记忆和 Skill 判断；
- 未完成项、阻塞和风险。

模板项目的单仓库 `task create`、`review`、`check`、`merge-check` 不适用于当前工作区根目录，除非后续建立明确的工作区 Git 根或为多仓库场景实现适配器。当前不得把手工检查结果描述成这些命令已通过。
