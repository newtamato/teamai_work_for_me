# 提交与分支规范

## Commit Message（Conventional Commits）
格式：`<type>(<scope>): <描述>`

type：
- feat: 新功能
- fix: 修 bug
- refactor: 重构（不改行为）
- docs: 文档
- test: 测试
- chore: 杂项/构建

示例：
- `feat(login): 实现登录接口的 token 下发`
- `fix(net): 修复粘包导致的丢包`

## 分支
- `main`：稳定分支，可随时联调
- `feat/<功能名>`：功能分支
- `fix/<问题>`：修复分支
- 合并走 MR/PR，至少一人 review

## 协议相关提交
- 涉及协议改动，commit 里标注 `[proto]`，并在 api-contract.md 同步更新
