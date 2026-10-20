# UNO 工作区治理边界

- 类型：设计决策
- 状态：active
- 创建日期：2026-10-09（北京时间）
- 更新日期：2026-10-09（北京时间）
- 适用范围：`/Users/joliehou/ct_workspace/uno_workspace` 工作区及其客户端/服务端协作
- 关键词：多仓库、TeamAI、记忆、Skill、工作区接入、UNO
- 来源：用户确认采用模板接入默认方案；`AGENTS.md`、`doc/README.md`、`.teamai/README.md`、`.teamai/workflow.md`
- 验证方式：user-reported / code-verified / document-derived
- 最近核实日期：2026-10-09
- 替代关系：无

## 内容

UNO 工作区不是单一 Git 仓库，而是由 `UnoOnline-Client/`、`caii-server/`、`Carrom2/`、`luban/` 等独立目录组成。现阶段以工作区根目录的 `AGENTS.md`、`doc/` 和 `.teamai/` 作为跨客户端/服务端的治理中心；不复制或覆盖现有 TeamAI、Codex 规则。

接入范围优先为 `UnoOnline-Client/` 和 `caii-server/`。`Carrom2/`、`luban/`、`uno-web/`、`uno-query-web/` 暂不纳入本轮治理。各子仓库已有未提交改动必须保留，不得通过 reset、clean、stash 或覆盖来“清理”。

项目记忆使用工作区根目录 `memory/`；可复用操作继续使用已有 `.codex/skills/` 或经验证后新增 Skill。当前不启用 capabilities、automation 或 release，也不把模板仓库的单仓库 `task create`/`merge-check` 直接宣称为工作区能力。

## 证据与定位

- [工作区入口](../AGENTS.md)
- [文档中心](../doc/README.md)
- [TeamAI 工作流](../doc/teamai-workflow.md)
- [UNO 跨仓库规则](../rules/uno-cross-repo.md)
- [Linear + TeamAI 流程](../doc/LINEAR_TEAMAI_WORKFLOW.md)

2026-10-09 核对：工作区根目录不是 Git 仓库；客户端和服务端是独立 Git 仓库；客户端、服务端、Carrom2、Luban 均存在未提交或未跟踪内容，未对其执行写操作。

## 下次行动

接手跨端任务时，先读 `AGENTS.md`、`doc/README.md`、`doc/UNO_PROJECT_SPEC.md`、`.teamai/rules/uno-cross-repo.md` 和 `.teamai/workflow.md`，再分别检查 `git -C UnoOnline-Client status` 与 `git -C caii-server status`。只有在重复流程经过验证后，才创建或更新对应 Skill。

## 失效条件

工作区改为单一 Git 根目录、TeamAI 规则迁移、纳管范围扩大、客户端/服务端仓库拆分或合并、当前未提交改动处理策略变化时，必须重新核实并更新本条目。

## 变更记录

- 2026-10-09：根据用户确认建立工作区治理边界；保留既有 TeamAI/Codex 体系，先接入记忆和交付约束，不修改业务仓库。
