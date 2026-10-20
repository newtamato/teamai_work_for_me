# UNO 崩溃恢复压力测试（53.48）

> 测试记录 / 运维手册

## 目的

验证大量玩家在 UNO 对局中时，`caiisvr` 非优雅崩溃并重启后：

1. caiisvr 内存牌局全部丢失；
2. 玩家不能通过旧的续玩状态恢复旧牌局；
3. `GR_C_UNO_TABLE_QUERY` 返回干净状态；
4. 玩家可以重新进入新的 UNO 对局。

本测试只允许在 `192.168.53.48` 执行，不得用于 `192.168.103.154`。

## 测试阶段

```text
启动/确认 53.48 caiisvr
  → 启动大量玩家，等待 GAME_START
  → SIGKILL caiisvr（模拟崩溃）
  → 等待后重新启动 caiisvr
  → 玩家重新连接并发送 TABLE_QUERY
  → 验证 UNKNOWN、无 public/private state
  → 玩家重新 ENTER_GAME，验证进入新牌局
```

不能使用正常 `stop` 模拟崩溃，因为正常停止可能触发清理逻辑。脚本使用
`SIGKILL`，不会发送 LeaveGame 流程。

## 脚本

```text
caii-server/scripts/crash-recovery-supervisor.sh
```

脚本只管理传入的 `caiisvr`，不会访问 103.154，也不会重启其他服务。

```bash
cd /root/projects/caii-server
./scripts/crash-recovery-supervisor.sh \
  --pre-command '/tmp/caii-test-build/caii-test --hall-host 127.0.0.1 --hall-port <hall-port> --userids <id1>,<id2>,... --match-timeout 180' \
  --post-command '/tmp/caii-test-build/caii-test --hall-host 127.0.0.1 --hall-port <hall-port> --userids <id1>,<id2>,... --match-timeout 180' \
  --crash-after 120 \
  --restart-wait 15
```

建议使用远程凭证文件：

```text
/root/projects/caii-server/bin/x64/Debug/test/credentials.tsv
```

保持权限：

```bash
chmod 600 /root/projects/caii-server/bin/x64/Debug/test/credentials.tsv
```

## 日志

脚本默认写入：

```text
/tmp/uno-crash-recovery-YYYYMMDD-HHMMSS/
```

包括：

- `pre-command.log`
- `post-command.log`
- `caiisvr.stdout.log`
- `caiisvr.pid`

## 验收标准

每个崩溃前已开局的玩家，重连查询必须满足：

```text
response.code == 0
response.table_status == UNO_TABLE_STATUS_UNKNOWN
response.has_public_state() == false
response.has_private_state() == false
```

随后重新进入时：

- 不得恢复旧 `roomid/tableno/bout_id`；
- 不得收到旧手牌；
- 必须进入新的匹配桌；
- 新局必须产生新的 `GAME_START` 和新的 `bout_id`。

## 当前实现边界

该 supervisor 已完成 53.48 上的启动、SIGKILL、重启和前后测试命令编排。
下一步需要给 `caii-test` 增加专用 `--crash-recovery-probe`：

- `prepare` 阶段记录已收到 `GAME_START` 的玩家；
- `probe` 阶段只查询，不自动把 `UNKNOWN` 当作普通进入前的无状态；
- 逐玩家输出 `CLEAN` / `STALE` / `RECONNECTED`；
- 任意玩家仍带有 public/private state 时返回非零。

在该 probe 完成前，不能仅根据普通多玩家场景成功就宣称崩溃恢复测试通过。

## 53.48 首次实测记录

使用远程 `credentials.tsv` 中的 5 个已有账号，仅在 `192.168.53.48` 执行。

结果：

- 崩溃前：3 个玩家成功进入并完成对局；其余账号未形成有效对局；
- 对 `caiisvr` 执行 `SIGKILL` 后，重新启动 Debug 二进制成功；
- 重启后查询：可查询的玩家均返回 `table_status=0`，日志显示 `in_game=false`；
- 没有恢复旧牌局、旧手牌或旧 `bout_id`；
- 重连后 3 个玩家成功重新进入新桌并完成对局；
- 个别账号因 Hall 登录/余额等业务条件失败，不计入服务器状态恢复失败；
- 服务器最终仍运行在 53.48 的 Game 端口 `4500`。

该结果初步证明“本地牌局丢失后不恢复旧局”的链路正常；正式压力测试仍需完成
专用 probe，使每个玩家的 `UNKNOWN/public_state/private_state` 都能机器化断言。
