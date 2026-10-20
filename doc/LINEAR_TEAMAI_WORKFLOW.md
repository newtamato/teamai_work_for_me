# UNO 项目 Linear + TeamAI 协作规范

> 目的：任何 agent、开发同学或新成员进入工作区后，能够立即知道项目正在做什么、任务由谁负责、代码在哪里、如何验证，以及下一步如何继续。

## 1. 三个系统的职责

```text
Linear
  需求、任务拆分、负责人、状态、阻塞、验收、进度同步

Git
  客户端/服务端源码、提交、分支、代码审查

doc/ + TeamAI
  跨端规范、协议契约、流程、开发约束、agent 工作方式
```

Linear 不是代码仓库；Git 不是任务看板；TeamAI 不是业务需求文档。

## 2. Agent 接手任务时的固定顺序

任何 agent 开始工作前必须：

1. 阅读 `AGENTS.md`。
2. 阅读 `doc/README.md`。
3. 阅读 `doc/UNO_PROJECT_SPEC.md`。
4. 阅读 `rules/uno-cross-repo.md` 和 `doc/teamai-workflow.md`。
5. 查看 Linear 中对应的 Issue、评论、依赖和阻塞状态。
6. 检查两个代码仓库的状态：

```bash
git -C caii-server status
git -C UnoOnline-Client status
```

7. 在 Issue 评论中留下接手说明：准备修改的范围、预计验证方式和已发现风险。

如果没有对应 Issue，应先创建 Issue 或询问是否允许创建，不要直接把较大的工作作为无记录修改开始。

## 3. 任务进入 Linear 的规则

用户提出任务后，负责 agent 先判断任务类型：

```text
问题修复       → Bug
新功能         → Feature
协议/流程调整  → Protocol / Architecture
文档整理       → Documentation
测试和验证     → Test
环境/构建      → Chore / Infrastructure
```

### 3.1 Issue 标题

统一使用：

```text
[UNO][范围] 动词 + 目标
```

示例：

```text
[UNO][Server] 修复直播通知泄露私有手牌
[UNO][Protocol] 同步 UNO 礼物请求和通知协议
[UNO][Test] 增加注册登录和托管回归测试
[UNO][Docs] 建立客户端服务端共同规范
```

### 3.2 Issue 必须包含

```markdown
## 背景

## 目标

## 影响范围
- [ ] 客户端
- [ ] 服务端
- [ ] caiirobotsvr
- [ ] caiilivesvr
- [ ] caiichunksvr
- [ ] 测试
- [ ] 文档

## 协议/数据

## 实现边界

## 验收标准

## 测试计划

## 风险和依赖
```

跨客户端和服务端的任务必须明确列出两端修改点，不能只写“同步修改”。

## 4. Linear 状态流转

```text
Backlog
  → Todo
  → In Progress
  → In Review
  → Done
```

特殊状态：

```text
Blocked：等待账号、服务器、协议、配置或其他 Issue
Canceled：明确取消，不代表已完成
```

规则：

- 开始实际修改代码时进入 `In Progress`。
- 遇到外部依赖立即进入 `Blocked`，并在评论说明阻塞原因。
- 代码完成但未编译/测试不能进入 `Done`。
- 客户端、服务端、协议生成和文档均验收后才能进入 `Done`。
- `In Review` 必须附 Git commit、构建结果和测试结果。

## 5. Agent 工作方式

### 5.1 开始工作

Agent 在 Linear Issue 中记录：

```text
接手时间
当前理解
计划修改的文件/模块
验证方式
```

### 5.2 修改过程中

如果发现任务范围变化：

- 小范围变化：更新 Issue 描述或评论；
- 新的独立目标：创建子 Issue 或关联 Issue；
- 协议/架构变化：先更新 `doc/UNO_PROJECT_SPEC.md`。

不允许只在聊天中留下重要设计决定而不写入 Linear 或共同文档。

### 5.3 完成工作

Issue 评论必须包含：

```text
完成内容
客户端改动
服务端改动
协议/生成代码改动
文档改动
Git commit
构建命令和结果
测试场景和结果
未完成项/风险
```

## 6. 分支和提交规则

服务端：

```text
本地 caii-server 编辑和提交
53.48 只用于同步、编译、运行和联调
```

客户端：

```text
本地 UnoOnline-Client 编辑、Unity 编译和提交
```

跨端任务建议使用同一个 Linear Issue，并在两个仓库分别提交：

```text
server commit
client commit
```

提交信息建议：

```text
UNO: <简短动作>
```

例如：

```text
UNO: add independent live gift protocol
UNO: handle reconnect table snapshot
UNO: add registration credential test mode
```

## 7. 跨端协议变更流程

1. 在 Linear Issue 中写明协议变更。
2. 更新 `doc/UNO_PROJECT_SPEC.md`。
3. 修改服务端 proto 和 request enum。
4. 修改客户端 proto 和 request enum。
5. 重新生成两端代码。
6. 编译服务端相关项目。
7. 编译 Unity 客户端。
8. 执行跨端测试。
9. 在 Linear 附上生成文件、构建和测试结果。

必须同步验证：

```text
协议号
protobuf package/message/field number
请求方向
响应类型
通知类型
权限和隐私
错误码
重连行为
```

## 8. UNO 必须遵守的项目事实

- GameID 是 `1028`。
- `roomid` 不固定，必须使用大厅/服务端下发值，禁止硬编码历史测试房间号。
- 当前 UNO 玩法要求四人桌，但“四人桌”不是固定 roomid。
- 服务端权威维护牌堆、手牌、合法性、回合、托管和结算。
- 客户端不能裁决超时、出牌合法性或金币变化。
- 私有手牌和未公开摸牌结果不能广播给其他玩家或普通观众。
- UNO 礼物必须保留 `bout_id` 和 `to_robot`，且不能修改 Carrom 礼物逻辑。
- 服务端修改必须在本地 `caii-server` 完成，然后同步到 53.48 编译。
- 不提交编译产物、日志、`.linux-build` 和临时文件。

详细事实以 `doc/UNO_PROJECT_SPEC.md` 为准。

## 9. Agent 交接格式

交接 Issue 或评论使用：

```markdown
## 当前状态

## 已完成

## 当前分支/提交

## 正在处理

## 下一步

## 验证结果

## 阻塞

## 风险

## 相关文档
```

接手 agent 不应重新搜索整个代码库；先读该交接内容、共同规范和关联 Issue。

## 10. Done Definition

一个 UNO 任务只有同时满足以下条件才算完成：

- [ ] Linear Issue 验收标准全部完成
- [ ] 客户端/服务端边界已明确
- [ ] 协议和生成代码一致
- [ ] 相关代码已提交 Git
- [ ] 相关服务编译通过
- [ ] 客户端编译通过（如涉及客户端）
- [ ] 正常流程验证通过
- [ ] 异常/断线/超时流程已验证或明确记录未验证
- [ ] 共同规范已更新
- [ ] Linear 评论已记录 commit、构建、测试和风险

## 11. 服务端交付与测试门槛

服务端功能不能只以服务编译通过作为交付条件。服务端 agent 必须优先在
`caii-server/caii-test` 增加或更新真实协议调用；该程序通过大厅和游戏入口
运行，不直接调用服务端内部函数。

标准顺序：

```text
修改服务端
  → 更新 caii-test 调用和断言
  → 在 53.48 编译 caiisvr 与 caii-test
  → 运行 caii-test
  → 通过后才交付客户端 agent
```

测试必须区分：

- 开局前：登录、房间发现、连接、进入游戏、查询/重连、身份校验和错误码。
- 开局后：动作响应、通知、回合、托管、重连、聊天、礼物、结算和权限。
- 高风险流程：断线、超时、乱序/重复通知、真人/机器人/观众隔离、私有手牌。

如果功能适合纯逻辑验证，应同时增加服务端单元测试。单元测试优先覆盖
`UnoGame` 等无网络、无 Redis、无外部服务依赖的规则和数据转换；协议、认证、
桌子生命周期仍由 `caii-test` 做集成测试。没有现成测试框架时，先复用仓库已有
测试构建方式，不为单个功能引入新的测试依赖。

服务端 agent 在客户端 agent 开始前，必须在 Linear 评论中记录：

```markdown
## 服务端测试门槛

- caii-test 改动：
- 单元测试改动：
- 构建命令及结果：
- 运行场景及结果：
- 未覆盖项/阻塞：
```

测试未通过时，服务端 Issue 保持 `In Progress` 或 `Blocked`，不得交付客户端。

## 12. 多 Agent 跨端交接

跨端功能使用一个父 Issue 和按代码责任拆分的子 Issue。协议、字段、错误码、
通知顺序和隐私规则先写入父 Issue 或 `doc/UNO_PROJECT_SPEC.md`，客户端和服务端
再并行开发。

服务端交付客户端时必须提供：

- 服务端 commit 和 `caii-test` commit；
- 请求示例、响应 code、关键通知和状态变化；
- 客户端需要遵守的快照覆盖、乱序处理和权限规则；
- 已验证的服务地址、配置、账号要求和未覆盖风险。

重要信息不能只通过聊天传递。实时消息只用于提醒，最终内容必须回写 Linear
评论或共同规范；可复用的排障方法和项目经验保存到 agentmemory。

## 13. Luban 配置工作流

配置 Excel 的唯一输入目录是工作区根目录的 `excels/`。程序或策划 agent 不得
直接手改由 Luban 生成的 JSON；Schema、表注册和生成配置由程序 agent 维护，数据
由 Excel 维护。

配置变更顺序：

```text
excels/*.xlsx
  → Luban 校验/生成
  → caii-server/caiichunksvr/config/*.json
  → UnoOnline-Client/Assets/AssetsPackage/Config/*.json
  → 校验两份 JSON 内容、路径和版本
```

生成时必须确认：

- Excel 首行是有效的 `##` 表头，表已登记到 `__tables__`；
- 字段 `##type`、主键和 `##group` 正确；`s` 字段不得进入客户端；
- 生成失败先按 schema/data/validation/codegen 分类排查，不降低校验规则；
- 同一张表的服务端和客户端输出来自同一次生成，不能分别手改；
- 生成后的 JSON 只放到上述两个目标目录，临时输出放 `/tmp`，不提交生成日志。

当前仓库若还没有统一的“生成并复制双份 JSON”入口，首次处理配置任务时应补一个
最小可重复执行入口，并在本节记录实际命令和表到目标文件的映射；在此之前不得
凭猜测批量覆盖配置目录。

## 14. 经验沉淀

Linear 记录当前任务事实：决策、依赖、阻塞、commit、构建和测试结果。

agentmemory 只记录跨任务可复用内容，例如：

- 某个协议/服务的真实入口和认证限制；
- 某类测试的启动条件、账号和配置依赖；
- Luban 表头、group、引用或生成命令的常见坑；
- 失败原因、修复方式和适用边界。

一次性的临时状态留在 Linear，不写入长期经验。经验必须脱离具体聊天上下文也
能被另一个 agent 使用，并注明适用项目、文件或命令。
