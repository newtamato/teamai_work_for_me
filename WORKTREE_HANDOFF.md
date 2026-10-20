# UNO 多 Agent 工作区规范

## 当前隔离目录

- Codex 客户端：`.worktrees/uno-client-codex`
- Codex 服务端：`.worktrees/caii-server-codex`
- 分支：`codex/uno-turn-timing`
- pi agent 继续使用原目录和 `master` 分支。

两个 worktree 都从创建时的 `HEAD` 建立；原目录中的未提交改动没有被移动、提交或覆盖。

## 工作规则

1. Codex 只在 `.worktrees/*-codex` 中编辑，不在原目录操作。
2. 每个逻辑阶段完成后提交一次，提交信息说明范围。
3. 不执行 `reset --hard`、批量清理或删除 worktree。
4. 合并前先确认 pi agent 已提交并记录提交号；再在对应原仓库执行：

```bash
git merge codex/uno-turn-timing
```

5. 如果双方改到同一文件，先暂停合并，保留两个提交，人工解决冲突。

## 会话中断后的恢复

```bash
cd /Users/joliehou/ct_workspace/uno_workspace
git -C UnoOnline-Client worktree list
git -C caii-server worktree list
git -C .worktrees/uno-client-codex status
git -C .worktrees/caii-server-codex status
```

继续工作时直接进入对应目录即可。已提交内容始终可通过：

```bash
git -C .worktrees/uno-client-codex log --oneline --decorate -20
git -C .worktrees/caii-server-codex log --oneline --decorate -20
```

找回工作目录后，不要凭记忆重做改动；先查看 `status` 和 `log`，再从最后一个提交继续。

