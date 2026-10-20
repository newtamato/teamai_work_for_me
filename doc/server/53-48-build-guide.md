# 53.48 服务器编译与重启指南

> 面向其他 coding agent。服务器地址：`192.168.53.48`。所有命令默认在服务器上执行。

## 1. 项目位置

```text
/root/projects/caii-server
```

主要服务：

```text
caiisvr      游戏服务器
caiisvrmp    游戏服务器管理/匹配相关进程
```

源码目录：

```text
caiisvr/
caiirobotsvr/
caiichunksvr/
caiihall/
caiihallmp/
caiilivesvr/
caiilogsvr/
pb/
```

UNO 相关源码：

```text
caiisvr/uno/
caiisvr/server/game_server.cpp
common/request_enum.h
pb/game/uno.proto
```

## 2. 登录服务器

```bash
ssh root@192.168.53.48
cd /root/projects/caii-server
```

如果 SSH 连接失败，先确认网络和本机 SSH 配置，不要重复启动多个服务进程。

## 3. 编译 caiisvr

推荐使用仓库自带脚本：

```bash
cd /root/projects/caii-server
./scripts/build-caiisvr-linux.sh
```

成功标志：

```text
BUILD_OK /root/projects/caii-server/bin/x64/Debug/caiisvr
```

构建产物：

```text
/root/projects/caii-server/bin/x64/Debug/caiisvr
```

编译过程中的 Boost `pragma message`、整数转换 warning 和配置 warning 通常不代表失败，必须检查最后是否出现 `BUILD_OK`。

## 4. 修改 protobuf 后的编译

修改 `pb/game/uno.proto` 后，需要先重新生成 C++ 文件：

```bash
cd /root/projects/caii-server
protoc -I . --cpp_out=. pb/game/uno.proto
```

确认生成文件已更新：

```text
pb/game/uno.pb.h
pb/game/uno.pb.cc
```

随后再编译：

```bash
./scripts/build-caiisvr-linux.sh
```

不要只修改 `.proto` 而不重新生成 `.pb.h/.pb.cc`。

## 5. 检查服务进程

```bash
pgrep -af 'caiisvr|caiisvrmp'
```

也可以：

```bash
ps -ef | grep '[c]aiisvr'
```

## 6. 重启 caiisvr

编译成功后，旧进程不会自动加载新二进制，需要重启：

```bash
old=$(pgrep -x caiisvr || true)
for p in $old; do kill -TERM "$p" 2>/dev/null || true; done
sleep 2
for p in $(pgrep -x caiisvr || true); do kill -KILL "$p" 2>/dev/null || true; done

cd /root/projects/caii-server/bin/x64/Debug
nohup ./caiisvr >/tmp/caiisvr-uno.log 2>&1 </dev/null &
echo $! >/tmp/caiisvr-uno.pid
sleep 2
pgrep -af 'caiisvr|caiisvrmp'
```

查看启动日志：

```bash
tail -50 /tmp/caiisvr-uno.log
```

## 7. 启动或重启 caiisvrmp

启动：

```bash
cd /root/projects/caii-server/bin/x64/Debug
nohup ./caiisvrmp >/tmp/caiisvrmp.log 2>&1 </dev/null &
echo $! >/tmp/caiisvrmp.pid
```

仅重启 `caiisvr` 时不要随意重启 `caiisvrmp`。如果确实需要完整重启：

```bash
for p in $(pgrep -x caiisvrmp || true); do kill -TERM "$p" 2>/dev/null || true; done
sleep 2
for p in $(pgrep -x caiisvrmp || true); do kill -KILL "$p" 2>/dev/null || true; done
cd /root/projects/caii-server/bin/x64/Debug
nohup ./caiisvrmp >/tmp/caiisvrmp.log 2>&1 </dev/null &
```

## 8. 清理旧进程的注意事项

不要使用宽泛的：

```bash
killall server
pkill -f game
```

这可能误杀其他服务。只操作精确进程名：

```bash
pgrep -x caiisvr
pgrep -x caiisvrmp
```

通常先发送 `SIGTERM`，等待 2～10 秒仍未退出时再使用 `SIGKILL`。

## 9. UNO 修改后的验证清单

1. 确认服务端 `pb/game/uno.proto` 与客户端协议字段一致；
2. 修改协议后重新生成 `uno.pb.h/.cc`；
3. 执行 `build-caiisvr-linux.sh`；
4. 确认最后输出 `BUILD_OK`；
5. 重启 `caiisvr`；
6. 确认 `caiisvrmp` 是否仍在运行；
7. 检查 `pgrep -af 'caiisvr|caiisvrmp'`；
8. 再进行客户端测试。

当前 UNO 惩罚通知约定：

- `ChallengeWild4Notify` 和 `DeclineWild4Notify` 携带 `drawn_cards`；
- 只有受罚玩家收到真实牌面；
- 其他玩家收到空的 `drawn_cards`，根据 `penalty_count` 播放牌背动画；
- 质疑和接受 +4 不再额外发送 `UnoDrawCardNotify`。

## 10. Git 注意事项

服务器仓库可能存在其他 agent 的未提交修改。提交文档或代码前先检查：

```bash
git status --short
git diff --stat
```

不要使用 `git add .` 或 `git commit -a` 把其他 agent 的修改混入当前提交。应按文件显式添加：

```bash
git add docs/53-48-build-guide.md
git commit -m "补充 53.48 服务器编译指南"
```

## 11. 本次验证结果

在 53.48 上执行：

```bash
./scripts/build-caiisvr-linux.sh
```

已验证成功，最终输出：

```text
BUILD_OK /root/projects/caii-server/bin/x64/Debug/caiisvr
```
