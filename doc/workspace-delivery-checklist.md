# UNO 工作区 Agent 交付清单

> 用于跨 `UnoOnline-Client/` 与 `caii-server/` 的任务收尾。不是平台合并或发布命令。

## 任务开始

- [ ] 已读取 `AGENTS.md`、`doc/README.md`、`doc/UNO_PROJECT_SPEC.md`、`rules/uno-cross-repo.md`、`doc/teamai-workflow.md`
- [ ] 已确认 Linear Issue、负责人、依赖和验收标准
- [ ] 已记录客户端和服务端当前分支、脏文件、worktree
- [ ] 已明确本轮允许修改的仓库和文件范围

## 修改过程中

- [ ] 协议/流程变化先更新 `doc/UNO_PROJECT_SPEC.md`
- [ ] protobuf、请求号或生成代码变更已同步客户端和服务端
- [ ] 未覆盖已有未提交改动、日志、编译产物或凭据
- [ ] 跨仓库写入责任已明确，主 Agent 已收回并审查全部 diff

## 经验与 Skill

- [ ] 已读取 `memory/INDEX.md` 并检查重复条目
- [ ] 已判断本次记忆：`updated` / `none` / `defer`
- [ ] 已判断 Skill：`create` / `update` / `reuse` / `defer` / `none`
- [ ] 新记忆已使用 `memory/TEMPLATE.md` 并同步索引
- [ ] 新 Skill 已有重复价值、输入输出、失败处理和验证证据

## 验证

- [ ] `git diff --check`（每个受影响 Git 仓库分别执行）
- [ ] 服务端按项目规则在 53.48 编译/测试
- [ ] 客户端完成对应 Unity 编译或设备/场景验证
- [ ] 已验证正常、失败、断线/重连、超时及权限/隐私边界（按任务适用）
- [ ] 已确认无日志、凭据、临时目录和编译产物进入提交

## 交付记录

- [ ] Linear Issue 已补充完成内容、提交、构建、测试、风险和未完成项
- [ ] 两个仓库分别记录 commit（如任务涉及两端）
- [ ] 最终报告区分：已实现、已验证、已提交、已同步、已发布
- [ ] 平台合并、远程部署和定时任务未被误报为已完成
