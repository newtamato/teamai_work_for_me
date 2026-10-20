# UNO 礼物道具配置校验

## 适用范围

修改或排查 UNO 礼物发送、扣费、奖励通知时，必须同时核对道具配置、商品映射和服务端校验逻辑。

## 校验规则

- `PropertyType::kUnoGift = 26`。
- `PropBuyMode`：`kByCoins = 1`、`kByGiftBag = 2`、`kByGems = 3`。
- `UnoLiveGiftModule` 当前只接受 `kByCoins` 和 `kByGems`；`get_mode = 2` 会被判为非法参数并返回 `-2`。
- 在 `prop_item_config.json` 中检查礼物的 `item_type`、`get_mode`、`get_param`。
- 在 `product_config.json` 中确认该 `PropId` 映射到正确的 `ProductId`，并核对商品名称、货币类型和价格。
- `get_param` 的含义必须与购买模式一致：金币模式和钻石模式的价值计算不同，不能只修改模式而忽略价格/价值逻辑。

## 故障排查顺序

1. 先查 `caiichunksvr.stdout.log` 中 `DealSendUnoGift` 的校验日志，确认失败阶段和实际加载的 `type/mode`。
2. 对照 `common_config.h` 与 `uno_live_gift_module.cpp`，确认配置值属于服务端允许范围。
3. 核对 `PropId -> ProductId` 映射及商品价格/货币类型。
4. 修改配置后校验 JSON，备份远程配置，同步到 `192.168.53.48`，重启 `caiichunksvr`，再用真实请求验证扣费和通知。
5. 若修改协议号或头文件相关逻辑，强制重新编译相关源文件，避免增量编译残留旧对象。
