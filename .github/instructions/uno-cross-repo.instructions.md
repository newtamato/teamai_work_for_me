---
applyTo: '**'
---

# UNO 前后端共同规则

## 代码与协议

- GameID 固定为 `1028`；UNO 的 `roomid` 不固定，必须使用大厅/服务端下发的房间配置。桌子人数由服务端房间配置决定，当前 UNO 玩法要求四人桌。
- 服务端协议源：`caii-server/pb/game/uno.proto`、`caii-server/common/request_enum.h`。
- 客户端协议源：`UnoOnline-Client/Proto/uno.proto`、`Assets/Scripts/Proto/MessageNo.cs`、`UnoNetworkClient.UnoProtocol`。
- 修改 protobuf 或请求号必须同步两端并重新生成代码。
- 当前进入匹配是 `GR_C_ENTER_GAME=10185001`；查询/重连是 `GR_C_UNO_TABLE_QUERY=10185600`。
- 客户端不得自行裁决回合超时、出牌合法性、牌堆、结算或经济结果。
- 服务端必须按 `context token + userid` 校验玩家身份。

## UNO 状态与隐私

- 服务端权威维护牌堆、手牌、当前玩家、颜色、方向、惩罚、turn sequence 和 deadline。
- 普通 online 玩家只收到公共状态和自己的私有手牌。
- 其他玩家的具体手牌、牌堆顺序、未公开摸牌结果不得广播。
- UNO 观战房有明确特例：被观战的指定真人玩家的手牌可以作为观战公开信息下发给该观战房全部观众；其他玩家私有手牌、牌堆顺序和未公开摸牌结果仍不得广播。
- 直播通知中的公开手牌必须明确属于指定被观战真人，不能误把普通玩家私有状态广播给观众。

## 服务职责

- `UnoGame`：规则状态机。
- `UnoGameTable`：桌子生命周期、请求转换、广播、结算。
- `UnoGameRoom`：匹配、机器人补位、桌子回收。
- `caiirobotsvr`：机器人账号和机器人动作链路；不要把服务端真人托管自动执行误写成机器人服已接管。
- UNO 礼物使用独立 `UnoLiveGiftModule` 和 `DealUnoGiftSend`，保留 `bout_id`、`to_robot`，不得修改 Carrom 礼物行为。

## 测试与交付

每个跨端功能至少验证：

- 正常请求和响应 code；
- 通知顺序和重复/乱序；
- 断线、重连、超时、取消托管；
- 真人、机器人、观众三类身份；
- protobuf 生成代码和四个服务编译；
- UNO 文档 `doc/UNO_PROJECT_SPEC.md` 同步更新。

服务端必须先完成 `caii-server/caii-test` 的真实协议验证，再交付客户端开发。
适合脱离网络验证的规则状态机、校验器和数据转换，应增加单元测试；网络、认证、
服务间调用和桌子生命周期继续使用 `caii-test` 集成验证。测试失败时不得将服务端
Issue 标记为 Done，也不得开始客户端验收。

Luban 配置的 Excel 输入统一放在工作区根目录 `excels/`。生成 JSON 后必须同时
输出到：

```text
caii-server/caiichunksvr/config/
UnoOnline-Client/Assets/AssetsPackage/Config/
```

不得直接编辑生成 JSON。必须校验表注册、`##type`、主键、`##group` 和两端输出
是否来自同一次生成；服务端专有字段不能出现在客户端配置中。
