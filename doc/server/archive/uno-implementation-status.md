# UNO 服务端实现状态

更新时间：2026-08-20

## 已完成

### 1. 协议号预留

已在：

```text
caii-server/common/request_enum.h
```

新增 UNO 协议号段：

```text
GR_C_UNO_TABLE_QUERY      = GR_CAII_CHATLIVE_BASE + 600
GR_C_UNO_PLAY_CARD        = GR_CAII_CHATLIVE_BASE + 601
GR_C_UNO_DRAW_CARD        = GR_CAII_CHATLIVE_BASE + 602
GR_C_UNO_PASS_AFTER_DRAW  = GR_CAII_CHATLIVE_BASE + 603

GN_C_UNO_MATCH_STATE      = GR_CAII_CHATLIVE_BASE + 620
GN_C_UNO_GAME_START       = GR_CAII_CHATLIVE_BASE + 621
GN_C_UNO_TABLE_STATE      = GR_CAII_CHATLIVE_BASE + 622
GN_C_UNO_HAND_UPDATE      = GR_CAII_CHATLIVE_BASE + 623
GN_C_UNO_ACTION_NTF       = GR_CAII_CHATLIVE_BASE + 624
GN_C_UNO_TURN_CHANGED     = GR_CAII_CHATLIVE_BASE + 625
GN_C_UNO_GAME_RESULT      = GR_CAII_CHATLIVE_BASE + 626
GN_C_UNO_ERROR_NTF        = GR_CAII_CHATLIVE_BASE + 627
GN_C_UNO_TRUSTEE_STATE    = GR_CAII_CHATLIVE_BASE + 628
GN_C_UNO_ROBOT_STATE      = GR_CAII_CHATLIVE_BASE + 650
```

### 2. UNO proto 草案

已新增：

```text
caii-server/pb/game/uno.proto
```

包含：

```text
UnoCard
UnoTablePublicState
UnoPrivateState
UnoPlayCardReq/Resp
UnoDrawCardReq/Resp
UnoPassAfterDrawReq/Resp
UnoActionNotify
UnoTurnChangedNotify
UnoGameResultNotify
UnoTrusteeStateNotify
UnoRobotStateNotify
```

已在 53.48 准备匹配项目 protobuf runtime 的 protoc：

```text
/usr/local/bin/protoc -> /usr/local/src/protobuf-3.11.3/src/protoc
libprotoc 3.11.3
```

已生成并同步：

```text
caii-server/pb/game/uno.pb.cc
caii-server/pb/game/uno.pb.h
```

生成命令：

```bash
cd /root/projects/caii-server
protoc -I=pb --cpp_out=pb pb/game/uno.proto
```

### 3. 纯 C++ UNO 服务端核心引擎

已新增：

```text
caii-server/caiisvr/uno/uno_game.h
caii-server/caiisvr/uno/uno_game.cpp
```

该模块不依赖 protobuf，方便先保证服务端核心逻辑可编译、可测试。

已实现：

```text
标准 UNO 108 张牌
4 人桌
开局每人 7 张牌
初始牌必须是数字牌
服务端洗牌/发牌/摸牌
出牌合法性校验
Wild / Wild Draw Four 指定颜色
Skip
Reverse
Draw Two
+2 / +4 互相叠加
摸牌后可以 Pass
30 秒回合 deadline
超时进入托管
托管自动出牌
托管逻辑暂与机器人逻辑一致
单轮结束：有人手牌为空
牌堆耗尽：按剩余手牌分最低者获胜
单轮计分
公共状态/私有手牌状态结构
```

### 4. 构建接入

已修改：

```text
caii-server/caiisvr/caiisvr.vcxproj
```

新增编译：

```text
pb/game/uno.pb.cc
pb/game/uno.pb.h
caiisvr/uno/uno_game.cpp
caiisvr/uno/uno_game.h
```

已在 53.48 编译通过：

```text
/root/projects/caii-server/bin/x64/Debug/caiisvr
```

构建命令：

```bash
cd /root/projects/caii-server
scripts/build-vs-linux-project.py caiisvr/caiisvr.vcxproj --config Debug --platform x64 --output bin/x64/Debug/caiisvr
```

结果：

```text
BUILD_OK /root/projects/caii-server/bin/x64/Debug/caiisvr
ldd 未发现 not found
```

## 当前还未完成

### 1. 网络协议接入

还没有把：

```text
GR_C_UNO_TABLE_QUERY
GR_C_UNO_PLAY_CARD
GR_C_UNO_DRAW_CARD
GR_C_UNO_PASS_AFTER_DRAW
```

接入 `GameServer::OnRequest()`。

`uno.pb.cc/.h` 已生成并接入编译；下一步可以开始实现 PB 与内部 UNO 结构转换函数，并接入 `GameServer::OnRequest()`。

### 2. GameTable/GameRoom 替换

当前 UNO 引擎是独立模块，尚未替换旧 `GameTable`/`GameRoom` 的 Carrom 状态机。

后续需要决定：

```text
方案 A：新增 UnoTable/UnoRoom，逐步替换原 GameTable/GameRoom 调用点。
方案 B：直接改造 GameTable/GameRoom，把 Carrom 物理逻辑删除或旁路。
```

建议优先方案 A：新增 `UnoTable`/`UnoRoom`，保留进房/机器人上桌框架，降低一次性大改风险。

### 3. 机器人服接入

当前已实现服务端托管/自动出牌策略，并补充 dev Web 的“取消托管”入口；正式协议需要保留 `GR_C_UNO_SET_TRUSTEE(is_trustee=false)` 能力。

## 第二版规则进展

已新增文档：`docs/uno-v2-rules-notes.md`。

第二版已补充服务器规则：`+4` 质疑能力、`+2/+4` 无限叠加、`+2` 可叠 `+2/+4`、`+4` 只能叠 `+4`，累计罚牌摸牌后跳过回合，普通无牌可出摸 1 张后的出/过选择，以及公共牌库耗尽时回收弃牌堆洗牌继续。Web 入口后续再接。

已新增托管 AI 文档：`docs/uno-v2-trustee-ai-notes.md`。当前已实现托管/机器人 2–6 秒延迟、普通出牌优先级、罚牌连锁承接、默认质疑 +4、UNO pending/declareUno/漏喊罚 2 张；正式经济结算后续接入。

已新增匹配与等级文档：`docs/uno-v2-matchmaking-and-level-notes.md`。当前 dev HTTP 多桌路径已实现真人优先匹配、0–8 秒等级差 <=5、8–12 秒等级差 <=10、12 秒后机器人 1–3 秒逐个补位，以及每局真人 +20 经验、每 100 经验 1 级的配置化等级规则。

还未接入：

```text
caiisvr -> caiirobotsvr: GN_C_UNO_ROBOT_STATE
caiirobotsvr -> caiisvr: GR_C_UNO_PLAY_CARD / GR_C_UNO_DRAW_CARD / GR_C_UNO_PASS_AFTER_DRAW
```

### 4. Web 客户端

尚未开始。优先级低于服务端核心逻辑。

## 下一步建议

1. 新增 PB 与内部 UNO 结构之间的转换函数。
2. 接入 `GameServer::OnRequest()` 的 UNO 请求处理。
3. 新增 `UnoTable/UnoRoom`，将 4 人桌开局流程接入 `UnoGame`。
4. 接机器人回合通知。
5. 将 `uno.pb.*` 加入后续需要解析 UNO 协议的 `caiirobotsvr.vcxproj`。
