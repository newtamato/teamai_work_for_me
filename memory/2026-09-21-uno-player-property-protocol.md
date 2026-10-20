# UNO 玩家头像/头像框协议链路

- 类型：工程经验
- 状态：active
- 创建日期：2026-09-21（北京时间）
- 更新日期：2026-09-21（北京时间）
- 适用范围：UNO 玩家资产（头像/头像框）的协议、服务端落库与客户端重连同步
- 关键词：UNO、头像、头像框、act_prop_id、avtar_url、GR_PLAYER_PROPERTY_USE、PlayerInfoResp、协议
- 来源：Linear GAM-9 协议盘点；客户端与服务端 proto/生成代码核对
- 验证方式：code-verified
- 最近核实日期：2026-09-21
- 替代关系：无

## 内容

当前客户端与服务端协议已一致，无需新增或修改 proto：`GR_PLAYER_PROPERTY_USE` 请求号两端一致；`ChangePlayerPropertyStatusReq` 的 `userid=1`、`id=2`、`status=3` 两端一致；`PlayerInfoResp.act_prop_id=20` 返回激活资产 ID，`PlayerInfoResp.avtar_url=21` 返回头像 URL；客户端 `AssetsMgr.UseAsset` 已连接到 `GR_PLAYER_PROPERTY_USE`。

关键边界：`act_prop_id` 只返回资产 ID，不携带头像/头像框类型，客户端必须依据本地资产配置区分 `kAvatar` 与 `kFrame`，不能凭字段名或返回值猜测。`avtar_url` 是既有字段拼写，不能在一次功能修改中随意改名；头像 URL 与头像框激活状态是两条不同语义，头像框应通过激活资产 ID 与配置恢复。

服务端落库：`player_property_equip:<userid>` Redis 写入并设 TTL；MySQL `tbl_player_property_equip` upsert；`PlayerInfoModule` 查询激活资产填 `act_prop_id`；头像 URL 来自既有玩家资料字段 `avatar_url`，不是资产配置 URL。

## 证据与定位

- `caii-server/pb/common/game_busi.proto`
- `caii-server/common/request_enum.h`
- `UnoOnline-Client/Assets/Scripts/Proto/MessageNo.cs`
- `UnoOnline-Client/Assets/Scripts/Proto/ProtoMessage/GameBusi.cs`

## 下次行动

修改协议时必须：本地编辑协议源 → 同步到服务器 → 用服务器工具生成 → 同步回客户端和服务端 → 双端编译验证；禁止在本机运行 protoc 或提交本机生成结果。同时检查服务端/客户端 proto、请求号、生成代码、序列化字段与旧客户端兼容性。

## 失效条件

- 协议或字段编号改变、`act_prop_id`/`avtar_url` 语义改变时重新核实。
- 未来若让服务端直接表达资产类型，应新增兼容字段并同步两端，而不是复用现有字段编号。

## 变更记录

- 2026-09-21：由 TeamAI 知识迁移；GAM-9 协议盘点确认双端一致，无 proto 修改。
