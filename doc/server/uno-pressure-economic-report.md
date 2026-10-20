# 测试记录：UNO 100 人压力与经济对账

> 目的：记录内部服务压力测试、UNO 业务结算和大厅资产对账结果。公共财富 HTTP 接口不作为压力目标，仅作为登录后的资产校验依赖。

## 测试环境

- 执行/编译机：`192.168.53.48`
- 游戏入口：`caiisvr`，端口 `4500`
- Hall：本机 `4511`
- 游戏：UNO / GameID `1028`
- 投放方式：100 个账号，wave size 10，间隔 5 秒
- 资产查询：每个玩家登录 Hall 后调用 `HR_HTTP_GET_MONEY_OWN_V2`，记录开局前、开局后、结算后的余额
- 监控脚本：`caii-server/scripts/run-uno-pressure-monitored.sh`

## 产物

远程测试机：

```text
/tmp/uno-economic-100-final2.jsonl
/tmp/uno-economic-100-final2/resource_samples.csv
/tmp/uno-economic-100-final2/system_samples.csv
/tmp/uno-economic-100-final2/resource_summary.tsv
```

## 业务结果

| 指标 | 结果 |
|---|---:|
| 投放账号 | 100 |
| Hall 登录成功 | 99 |
| 匹配成功 | 97 |
| 开局成功 | 97 |
| 结算成功 | 97 |
| 未进入牌局 | 3（1 登录失败、2 匹配失败） |
| 结算失败/未完成 | 0 |
| 成功牌局四人桌 | 97 |
| 成功牌局 `coin_delta` 总和为 0 | 97 |

## 服务资源指标

采样间隔为 1 秒。CPU 为进程采样值，内存为 RSS。

| 服务 | CPU 平均 | CPU 峰值 | RSS 平均/峰值 | FD 峰值 | TCP established 峰值 |
|---|---:|---:|---:|---:|---:|
| caiisvr | 1.21% | 1.50% | 28,133/28,240 KB | 83 | 33 |
| caiichunksvr | 0.20% | 0.20% | 34,872/34,872 KB | 65 | 29 |
| caiihall | 0.00% | 0.00% | 5,988/5,988 KB | 71 | 24 |
| caiihallmp | 0.00% | 0.00% | 2,504/2,504 KB | 24 | 0 |
| caiiassistsvr | 0.00% | 0.00% | 12,652/12,652 KB | 44 | 14 |
| caiilivesvr | 0.00% | 0.00% | 4,899/4,920 KB | 42 | 6 |
| caiirobotsvr | 0.00% | 0.00% | 82,360/82,360 KB | 59 | 9 |

本轮未观察到进程级 CPU 或 RSS 明显增长；当前压力规模下，资源指标不是主要瓶颈。

## 经济对账

预期规则：

```text
mid = start - entry_fee(30)
end = mid + human_coin_delta
```

本轮在并发 wave 下出现明显异常：`deposit_mid` 通常仍等于 `deposit_start`，没有观察到预期的 30 入场费扣除。结算后的 Hall 余额多数表现为：

```text
end = start + human_coin_delta
```

97 个成功结算玩家中：

- 按要求的 `end = start - 30 + coin_delta`：0 个完全匹配；
- 忽略入场费时：95 个匹配，2 个仍存在最终余额未及时刷新或同步差异。

因此，**100 人压力下业务结算结果和 Hall 资产账面尚未对齐**。这不是 CPU/RSS 瓶颈，而是入场费/结算资产同步的一致性问题。探针已改为只记录开局前余额、结算通知中的真人 `coin_delta`，再重新查询 Hall 余额并直接计算公式；不再使用 `deposit_mid` 作为通过依据。

## 结论

1. 内部服务在 100 人、10 人并发 wave 下未出现明显资源耗尽；
2. 97 局开局、97 局结算，功能链路基本运行；
3. `coin_delta` 桌内守恒正常；
4. Hall 资产账面没有稳定体现 30 入场费，经济对账失败；
5. 下一步应先定位入场费和结算异步同步问题，再重复 100 人测试；不能通过继续增加人数掩盖该一致性问题。

## caiisvr 崩溃记忆与排查结论

> 测试记录 / 故障排查手册

2026-09-29 在 53.48 进行 17 个合格账号并发探针时，`caiisvr` 发生崩溃。故障证据：

- 内核记录为 `caiisvr` 在 `libc-2.17.so` 的 `_int_malloc` 附近触发 SIGSEGV；
- core：`/root/projects/caii-server/bin/x64/Debug/svr/core.6625`；GDB 调用栈指向 `operator new` → `UnoGameRoom::CreateTables()` 第 40 行；
- 崩溃前 VSZ 约 2.13GB，随后客户端出现 connection reset/broken pipe；
- 当时曾怀疑 UNO `tablecount=2000` 的批量建桌会放大内存/堆损坏风险，但这不是已最终证明的唯一根因；
- 进一步检查确认当时运行二进制 BuildID 为 `d786732082c598402878540d5f452e8dd2ec8b41`，与本地最新源码完整重编译结果不同；
- 按用户授权覆盖 53.48 tracked 源码并执行 `rm -rf caiisvr/.linux-build && ./scripts/build-caiisvr-linux.sh Debug x64` 后，BuildID 变为 `b6feee1e9b9fe7d68a4a0c5b46103e0398a52f8f`；新进程监听 4500，后续 169 局复测未生成新 core。

后续发现 caiisvr 崩溃时，必须先记录：运行 PID、exe SHA256/BuildID、core 时间、`dmesg`/journal 调用栈、当前源码 HEAD 与 dirty 状态，并确认是否使用了本地最新完整构建。不得仅凭 libc allocator 崩溃就断言业务配置是唯一根因。验证顺序：先备份 core/日志 → 对齐源码并完整重编译 → 小并发（≤4）验证 → 阶梯提升并发；不得直接重跑 20/100 人压力测试。
