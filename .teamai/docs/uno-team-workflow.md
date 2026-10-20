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

## 4. 提交前

- `git diff --check`；
- 确认没有编译产物和日志；
- 更新 `doc/UNO_PROJECT_SPEC.md`；
- 写明客户端、服务端、协议生成和测试结果；
- 不在 53.48 直接编辑源码。

