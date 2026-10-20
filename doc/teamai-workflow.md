# 本地开发与 53.48 编译流程

## 1. 本地

```bash
cd /Users/joliehou/ct_workspace/uno_workspace
```

修改范围：

```text
UnoOnline-Client/
caii-server/
doc/
.teamai/
```

先运行：

```bash
git -C caii-server status
git -C UnoOnline-Client status
```

## 2. 服务端同步到 53.48

服务端独立入口规则见 `caii-server/AGENTS.md`。本地完成源码修改后，必须同步到
`root@192.168.53.48:/root/projects/caii-server` 再编译；远程仅用于编译和运行验证。
同步前检查两端差异，不覆盖已有未提交工作，不通过恢复 HEAD 清理远程源码。

已提交代码使用 Git（以下 master 仅为示例，以实际确认分支为准）：

```bash
git -C caii-server push origin master
ssh root@192.168.53.48 'cd /root/projects/caii-server && git pull --ff-only'
```

未提交的迭代代码可用 scp 按相对路径精确同步；也可使用临时 rsync，
但必须先 dry-run，不使用 --delete，并排除运行环境配置及以下内容：

```text
.git
.linux-build
bin
runlogs
*.log
credentials.tsv
```

## 3. 远程编译

```bash
ssh root@192.168.53.48 'cd /root/projects/caii-server && ./scripts/build-caiisvr-linux.sh Debug x64'
```

跨服务修改时同时编译相关项目：`caiisvr`、`caiirobotsvr`、`caiichunksvr`、`caiilivesvr`、`caii-test`。

## 4. 53.48 → 103.154 共享开发环境发布

53.48 是个人编译/验证机，103.154 是小组共享 UNO 开发环境。稳定版本才允许发布到 103.154。

同步脚本（在 53.48 执行）：

```bash
cd /root/projects/caii-server
./scripts/sync-unosvr-to-103154.sh --dry-run
./scripts/sync-unosvr-to-103154.sh
```

目标目录为 `/root/game/unosvr/bin/x64/Debug/`，只同步可执行文件、INI、JSON 和 `config/`；日志、PID、缓存、备份文件和 `credentials.tsv` 必须排除。旧 `/root/game/caiisvr` 环境不触碰。

103.154 使用：

```bash
cd /root/game/unosvr
./manage-unosvr.sh status all
./manage-unosvr.sh restart caiichunksvr
./manage-unosvr.sh restart all
```

服务启动顺序必须先 Chunk，再 Assist，再 Hall/Live/Robot，最后 Game；Assist 启动时会连接 Chunk 的 4520 端口。详细目录、配置覆盖、校验和回滚规则见 `doc/server/unosvr-103154-deployment.md`。

## 5. 提交前

- `git diff --check`；
- 确认没有编译产物和日志；
- 更新 `doc/UNO_PROJECT_SPEC.md`；
- 写明客户端、服务端、协议生成和测试结果；
- 不在 53.48 直接编辑源码。
