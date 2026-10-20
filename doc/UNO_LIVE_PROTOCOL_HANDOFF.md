# UNO Live / Spectator Protocol Handoff

> 面向后续 Agent 的运行协议、排障经验和验证约定。本文不记录账号密码或 token。

## 1. 整体链路

```text
Unity / caii-test
  ├─ Hall 4511：登录、房间发现、Assist 发现
  ├─ Game endpoint（Hall 广告通常为 caiisvrmp:4500/4501）
  │    └─ GR_C_UNO_TABLE_QUERY / GR_C_ENTER_GAME / UNO gameplay
  ├─ Live endpoint
  │    └─ GR_C_PLAYER_LIVE_ENTER / GR_C_PLAYER_CHAT_ENTER / GR_C_TABLE_CHAT
  └─ Assist 4530/4531
       └─ GR_LIVE_GIFT_SEND

caiilivesvr
  ├─ AudienceContainer：直播进入连接
  ├─ ChatterContainer：聊天进入连接
  ├─ LiveBoutContainer：bout 元数据
  └─ LiveChat（按 bout_id）：聊天和礼物广播

caiichunksvr / LiveModule
  └─ 礼物扣费、道具和礼物记录；通过 GN_LIVE_GIFT_SEND 路由到直播服务
```

相同的 IP/端口可以建立多条 TCP 连接；每条连接有独立的客户端临时端口和服务端 socket/token。服务端按请求号和连接上下文处理业务，不按监听端口区分 live/chat。

## 2. 直播/聊天/礼物语义

- `GR_C_PLAYER_LIVE_ENTER`：把玩家/观众登记到 live bout（直播连接）。
- `GR_C_PLAYER_CHAT_ENTER`：把连接登记到该 bout 的 chatter（聊天连接）。
- `GR_C_TABLE_CHAT`：通过 `LiveChat` 广播聊天。
- `GR_LIVE_GIFT_SEND`：当前统一礼物入口，发送到 Assist/Chunk 业务链路；不要恢复已废弃的 `GR_C_UNO_GIFT_SEND`。
- `GN_C_PLAYER_GIFT`：礼物业务成功后由 LiveChat 广播给 bout 内连接。
- caii-test 直接连 53.48 时，直播 socket 使用 `4580`；Unity/Hall 广告的 `4581` 是 MP/proxy 入口，不能混用。
- 礼物测试通常直接连 AssistSvr `4531`；`4530` 是 Unity-facing Assist MP/proxy。

礼物目标可以是真人或机器人：请求的 `to_robot=false/true` 必须与目标座位类型一致。目标必须属于当前 bout/桌，不能跨桌送礼。

## 3. UNO 四人桌和入场费

当前 UNO 直播/旁观桌要求四个座位：

```cpp
uno::kUnoPlayerCount = 4
```

真人不足四人时由 `RequestRobot()` 补机器人。`BuildSeats()` 必须看到四个有效 userid 后才能开局。

入场费只扣真人；机器人由机器人服务处理。`PayUnoEntryFee()` 会跳过 `USER_TYPE_ROBOT`，并通过 `entry_fee_state_` 防止重复扣费。若看到 `entry fee already committed users[1]`，这通常表示一名真人扣费、机器人未扣费，符合设计，不能单独当作失败原因。

## 4. 已遇到的关键问题与解决方式

### 4.1 旧二进制仍在运行

Linux 覆盖运行中的 ELF 后，旧进程仍运行旧 inode，并显示：

```text
/proc/<pid>/exe -> caiisvr (deleted)
```

旧 `manage-unosvr.sh` 因路径带 `(deleted)` 找不到该进程，错误启动第二个实例。

已修复 `caii-server/scripts/manage-unosvr.sh`：比较 executable 时去除 ` (deleted)` 后缀。以后必须用：

```bash
UNOSVR_ROOT=/root/projects/caii-server \
/root/projects/caii-server/scripts/manage-unosvr.sh restart caiisvr
```

并确认 `/proc/<pid>/exe` 指向未删除的新文件。

### 4.2 增量编译复用旧目标文件

`build-caiisvr-linux.sh` 没有可靠的头文件依赖追踪。修改 `uno_game.h` 的 `kUnoPlayerCount 3 -> 4` 后，`uno_game.cpp` 旧 `.o` 仍被链接，运行二进制实际包含：

```asm
cmp $0x3
```

表现为 `BuildSeats seats[4]` 后 `UnoGame::Start()` 仍失败。处理办法是删除受影响目标文件后重新编译；必须用反汇编或等价证据确认：

```asm
cmp $0x4
```

以后修改公共头文件时不要只相信 `BUILD_OK`，应清理相关对象或做 clean build。

### 4.3 `BuildSeats` 成功但仍不能开局

日志可能是：

```text
BuildSeats chair ... userid=...
UNO StartGame UnoGame::Start failed
```

这说明座位已经正常，继续看 `UnoGame::Start()` 和运行二进制常量，不要再次修改座位校验。

### 4.4 查询 `-10002`

`GR_C_UNO_TABLE_QUERY` 返回 `-10002` 表示没有可恢复的活动游戏（非查询传输失败）。新的匹配测试应将它视为 `in_game=false` 并继续 `GR_C_ENTER_GAME`；只有 query 超时、载荷损坏或其它错误才失败。

### 4.5 三真人顺序进入被机器人抢座

旧 `--live-flow` 严格要求三真人进入同一局，并按顺序发送 Enter。第二个真人进入后，服务端可能马上补机器人，第三个真人收到 `-2010`（已离开/座位状态变化）。这不是直播服务本身挂掉。

因此压力/经济验证应允许每个真人独立匹配，不要求同桌；只有专门验证三人 live chat 时才使用严格同 bout 流程。

## 5. caii-test 现有验证模式

### 严格同 bout 的直播流

```bash
--live-flow --userids A,B,C
```

用于验证同一 bout 的直播列表、聊天互收和礼物互发；要求三个真人都成功进入同一局，容易受机器人抢座影响。

### 独立匹配、送礼和聊天流

```bash
--gift-wave-probe \
  --userids A,B,C --probe-count 3 \
  --games-per-account 20 --probe-wave-size 3 \
  --prop-id 26001
```

当前实现目标：每个真人独立完成最多 20 局；每局开始后向自己桌上的其他所有座位送礼（真人和机器人），并通过 4580 进入聊天频道发送一条消息。JSONL 记录：

```text
gift_attempts / gift_successes
chat_attempts / chat_successes
```

礼物成本会改变真人余额，所以经济校验可能出现 `MISMATCH`；`gift-wave-probe` 不因经济差异把已结算对局判为失败。测试凭证只使用：

```text
/root/projects/caii-server/bin/x64/Debug/test/credentials.tsv
```

## 6. 运行和交付约定

- 服务验证服务器只用 `192.168.53.48`，不要访问 `192.168.103.154`。
- 不使用 `rsync --delete`，不覆盖远端无关改动。
- `caii-test/` 只能修改测试自身；测试失败不能直接推动生产代码修改。
- 生产服务编译成功不等于用户流程通过；报告需分别说明 build、进程、协议和最终对局结果。
- 看到服务日志不更新时先检查 `/proc/<pid>/fd/1` 是否指向已删除日志文件，以及是否存在重复服务进程。
