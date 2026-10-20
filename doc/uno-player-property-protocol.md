# UNO 玩家头像/头像框协议链路盘点

## 类型

跨端约束 / 协议经验 / 玩家资产状态

## 背景

GAM-9 第一轮协作盘点玩家选择头像和头像框后的协议、服务端落库和重连同步链路。目标是确认是否需要修改协议，以及明确客户端和服务端如何解释激活资产。

## 结论

当前客户端和服务端协议已经一致，不需要新增或修改 proto：

- `GR_PLAYER_PROPERTY_USE` 请求号两端一致；
- `ChangePlayerPropertyStatusReq` 的 `userid=1`、`id=2`、`status=3` 两端一致；
- `PlayerInfoResp.act_prop_id=20` 用于返回激活资产 ID；
- `PlayerInfoResp.avtar_url=21` 用于返回头像 URL；
- 客户端 `AssetsMgr.UseAsset` 已连接到 `GR_PLAYER_PROPERTY_USE`。

## 重要边界

`act_prop_id` 只返回资产 ID，不携带头像/头像框类型。客户端必须依据本地资产配置区分 `kAvatar` 和 `kFrame`，不能仅凭字段名或服务端返回值猜测类型。

`avtar_url` 是既有协议字段拼写，不能在一次功能修改中随意改名。头像 URL 和头像框激活状态是两条不同的数据语义：头像框应通过激活资产 ID 与配置恢复，不能把头像框 ID 当作头像 URL。

## 服务端链路

服务端已有以下持久化路径：

1. 校验配置存在、用户拥有资产以及同类型资产切换；
2. Redis `player_property_equip:<userid>` 写入并设置 TTL；
3. MySQL `tbl_player_property_equip` 使用 upsert；
4. `PlayerInfoModule` 查询激活资产并填充 `PlayerInfoResp.act_prop_id`；
5. 头像 URL 仍来自既有玩家资料字段 `avatar_url`，不是资产配置 URL。

## 客户端风险

重连或重新查询自己的 `PlayerInfoResp` 后，需要确认 `PlayerInfoMgr` 是否同步更新 `GlobalInfo.Instance.myUserInfo.HeadUrl`。只更新 `PlayerInfoMgr` 缓存而不更新全局用户信息，可能导致 UI 继续显示旧头像 URL。

客户端选择头像时还要确认弹窗使用的头像 URL 是否对应所选头像；不能把打开弹窗时的旧 URL 无条件复用到新头像。

## 生成文件规则

协议生成文件只能使用服务器环境中的协议工具生成。本机 proto 工具版本过新，禁止在本机运行 `protoc` 或提交本机生成结果。协议变更时必须：

```text
本地编辑协议源
→ 同步到服务器
→ 使用服务器工具生成
→ 将生成文件同步回客户端和服务端
→ 双端编译验证
```

## 验证方式

本轮协议盘点未修改 proto，也未运行本机 `protoc`。后续若修改协议，必须同时检查：

- 服务端 proto、请求号和生成代码；
- 客户端 proto、请求号和生成代码；
- 序列化/反序列化字段；
- 旧客户端兼容性；
- 服务端编译和 Unity 编译。

## 来源

- Linear Issue: `GAM-9`
- Git commit: 协议盘点未产生代码提交；服务端现有提交 `1700b92` 不代表本协议盘点已验证完成
- 相关文件：`caii-server/pb/common/game_busi.proto`、`caii-server/common/request_enum.h`、`UnoOnline-Client/Assets/Scripts/Proto/MessageNo.cs`、`UnoOnline-Client/Assets/Scripts/Proto/ProtoMessage/GameBusi.cs`
- 来源 Agent：protocol-developer、server-developer、client-developer

## 后续注意事项

- 不要因为请求发送成功就判断资产已经正确落库；必须确认业务响应和重新查询结果。
- 不要在没有类型字段的情况下改变 `act_prop_id` 的解释方式。
- 若未来需要让服务端直接表达资产类型，应新增兼容字段并同步两端，而不是复用现有字段编号。

