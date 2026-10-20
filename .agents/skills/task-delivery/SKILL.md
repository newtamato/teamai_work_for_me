---
name: task-delivery
description: 收尾当前项目修改任务，生成记忆与Skill复盘、执行配置检查并核验合并前状态；不执行平台合并或生产部署。
metadata:
  author: 项目维护者
  version: 1.0.0
  created_at: 2026-10-07
  updated_at: 2026-10-07
---

# 任务交付核验

用于已有修改任务收尾，不为只读咨询创建空任务。读取 [开发规则](../../../rules/development.md)、[记忆规则](../../../rules/memory.md)、[Skill规则](../../../rules/skills.md) 和相关知识；用户指定的范围与授权优先。

## 操作

1. 在任务工作树执行 `npm run agent -- task status`，确认任务、分支、基线和变动属于本轮。脏主目录或其他人的文件不自行清理。
2. 检索memory与Skill，判断新增知识、旧知识失效和重复流程价值；维护实际条目/索引/Skill资源后准备 `.runtime/review-input.json`。按 [示例](../../../templates/delivery/review-input.json)填写真实内容，不编造读过的路径或验证。
3. 若启用能力登记且来源改变，先审查help/schema/示例及Skill，再执行 `npm run agent -- capabilities sync`与`capabilities check`，输入补cliReview。
4. 执行 `npm run agent -- review --input .runtime/review-input.json`，修复结构或实际变动不匹配错误，再执行 `npm run check`。业务页面/数据等必要验收按项目规则另做，不能以工程检查替代。
5. 主代理确认diff且收回所有写入责任后，只提交本任务变动。提交后执行 `npm run agent -- merge-check`。内容或基线变化需重新复盘和验收，不能沿用旧指纹。
6. 输出任务分支、实际检查结果、知识/Skill判断、合并前门禁、未完成项。平台合并及部署依明确授权和适配器另行执行，这个Skill不发外部消息或强制审核。

## 验证与停止

正常场景应生成关联当前任务指纹的回执并通过检查；缺skillReview、未提交回执、失效验收应被拒绝。失败保留现场，只处理本轮允许的文件；平台不可用不改为直接push默认分支。没有可复用知识时允许none，禁止为过门禁硬造知识。
