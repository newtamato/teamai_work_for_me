# UNO 手牌动画与回合提示隔离

> 实现说明 / 待人工视觉验收；跟踪 GAM-24。协议不变，StateStore 仍是权威牌桌数据源。

## 所有权

| 输入 | 数据 | 表现职责 |
|---|---|---|
| 本人点击出牌 | 发请求，不修改 Store | 立即将本人的视觉牌移至临时弃牌位置；记录 cardId 预测 |
| 本人成功出牌通知 | Store 移除本人手牌、更新公共牌数 | 确认已有预测并纳入正式弃牌堆，不重复飞牌/特效；托管等无预测动作正常播放 |
| 对手出牌通知 | 更新公共状态 | 在该座位手牌队列播放；隐式摸后出牌不应误删一张原手牌 |
| 任意抓牌/漏喊惩罚通知 | 先更新 Store | 按通知逐张抓入，不从按钮点击预测牌面 |
| 回合通知 | 更新当前玩家、deadline、匹配身份的私有手牌 | 立即更新箭头/倒计时；撤销旧点击权限；不因牌数差异重建手牌 |
| 重连/完整恢复快照 | 替换 Store | 取消旧手牌操作/预测/开场流程，再按权威快照恢复 |
| 本地失败响应 | 不从视觉推导数据 | 如有本地出牌预测，只恢复本人手牌，不中断其他座位动画 |

## 执行边界

- `UnoGameWindow` 收到动作先更新玩家信息，再投递到对应座位；不在动画完成后调用 `TurnChange`。
- `UnoGamePlayerItem` 为每个座位维护独立手牌队列；回合提示不进入队列。
- 动画进行中缓存最新回合，立即撤销旧点击，但不重排、移动或回收正在抓入的牌。
- 队列空闲后只刷新该座位最新手牌布局/输入，不重启回合倒计时。
- 临时出牌仅改变视觉；成功通知依据 cardId 确认，失败/重连取消并回收临时弃牌。
- 弃牌转移按网络通知顺序衔接，避免不同座位队列完成顺序把旧牌盖在新牌上；其他座位抓牌及回合提示不等待特效。
- 对手视觉数量的补齐只在手牌动作边界使用该动作的 `hand_count_after`，不能用已经包含后续动作的 Store 最新牌数。
- 开场屏障保护逐张发牌，快照/退出取消旧屏障及其 continuation。

## 关键诊断日志

- `[UNO][LocalPlayPredicted]`：本人立即预测飞牌。
- `[UNO][LocalPlayConfirmed]`：服务端确认同一张预测牌。

### Wild 选色界面

`UnoCardEffect_Wild` / `UnoCardEffect_WildDrawFour` 共用 `WildEffectPage`，但必须分为两种表现模式，以是否提供选色回调区分，不能只用 userid 或颜色是否已知判断：

- 本人手动选色：提供回调，启用选择按钮；点击后立即关闭界面、禁用按钮并清理回调，再更新 DeskArrow 预览和发送请求。出牌失败恢复 Store 权威颜色。
- 对手或本人托管：不提供回调，颜色由服务端通知给定。按钮禁用，播放约 0.8 秒非交互特效（0.35 秒展示、0.15 秒显色、0.3 秒停留）后关闭，不能同帧隐藏。DeskArrow 已由通知更新；特效不阻塞手牌队列或回合。
- 界面关闭结束等待，复用时以 PlayVersion 隔离前一轮 waiter；取消旧序列，并防止旧完成回调关闭新一轮选择。

桌面特效展示采用 latest-wins：普通效果新到先隐藏旧效果，只保留最新一个、不排队；本人交互选色打开时先清除装饰，期间抑制新装饰和重复选色请求，不能遮挡或关闭已有选择。已抑制效果不补播。隐藏/退出牌桌或切换 EffectRoot 时停止全部特效，清理展示所有权；同类特效可复用已隐藏实例。

latest-wins 增量验证：Unity 6000.0.59f2 隔离项目运行全部 UNO Editor 测试，退出码 0，21/21 passed、0 failed/skipped，无编译错误；结果 `/tmp/uno-effect-channel-editmode.xml`，日志 `/tmp/uno-effect-channel-unity.log`。8 个运行时文件、3 个测试及 asmdef 与验证副本逐字节一致。新增 8 例覆盖跨类型替换、同类复用、交互保护、重复交互抑制、选择关闭后恢复展示、停止/换根节点清理及销毁池项清理。真实预制体视觉、自动隐藏计时和 OnDisable 运行时派发仍需人工/PlayMode 验收。

真实特效预制体的视觉验收仍需人工进行。

两种模式最终验证：Unity 6000.0.59f2 隔离副本执行整个 `Uno.AnimationIsolation.Editor.Tests` 程序集，退出码 0，13/13 用例通过，无编译错误；XML `/tmp/uno-wild-split-editmode-final.xml`，日志 `/tmp/uno-wild-split-unity-final.log`。已核对 8 个运行时源码、2 个测试及 asmdef 与验证副本逐字节一致。旧的“服务端颜色已知立即关窗”测试已按本轮契约替换为“展示后关闭”。复用测试主动注入旧完成回调，验证不会关闭新一轮选择；EditMode 不覆盖 DOTween runtime Kill 或 OnDisable 自动派发，禁用处理函数以显式调用验证。本结果不覆盖真实 PlayMode 生命周期派发或 DeskArrow 资源加载，仍需人工验证两类表现、箭头换色及拒绝回滚。

### 其余诊断日志
- `[UNO][DrawAniBegin/DrawAniEnd]`：抓牌通知和该座位动画数量。
- `[UNO][TurnPresentation]`：回合到达时数据牌数、视觉牌数、队列长度；差异不自动触发重建。
- `[UNO][HandActionReconcile]`：对手动作边界纠正牌背数量。
- `[UNO][HandleReconnectBegin/End]`：显式恢复，不应由普通回合刷新触发。

注意日志中的 `privateCardCount` 是被观看/本人的私有状态数量，不能与任意对手牌数直接比较。

## 自动验证

Unity 版本：6000.0.59f2。测试：`Assets/Tests/Editor/UnoAnimationIsolationTests.cs`。

为了不关闭用户正在使用的 Editor，使用独立项目副本：

```bash
/Applications/Unity/Unity.app/Contents/MacOS/Unity \
  -batchmode -nographics -projectPath /tmp/uno-gam24-validation \
  -runTests -testPlatform editmode -testFilter UnoAnimationIsolationTests \
  -testResults /tmp/uno-gam24-editmode-final-v2.xml \
  -logFile /tmp/uno-gam24-unity-final-v2.log
```

2026-10-19 已用该命令实测：Editor 退出码 0，无编译错误；XML 记录 4 passed、0 failed、0 skipped。主 Agent 已复读 XML 并核对六个运行时文件及测试脚本与隔离副本 SHA256 一致（完整清单 `/tmp/uno-gam24-final-v2-source-hashes.txt`）。证据同步 GAM-24。该结果仅覆盖编译及孤立 EditMode 测试，不覆盖真实网络延迟、成功/拒绝响应联调和完整资源特效；下面的人工验收尚未执行。

## 人工验收清单

1. 本人点击普通牌立即飞出；延迟网络响应时不等响应才飞；成功通知不再飞第二次。
2. 本人 Wild/+4 选色后即时出牌；服务端拒绝/恢复快照后手牌还原，无临时弃牌残留。
3. A 出 +2/+4 导致 B 抓 N 张，同时回合跳至 C：B 逐张动画不中断，C 箭头/倒计时即时变化。
4. 大额叠加惩罚仍在抓牌时收到后续动作：同座位按序；不同座位互不回收卡牌；最新弃牌不被旧动作盖回。
5. 普通摸到可出牌：弹出摸牌面板；保留或出牌只转移一次；回合结束/超时后不能提交旧面板回调。
6. 开场过程中恢复快照或退出再进入：不出现旧流程继续补牌；首回合可点击。
7. 观战只有指定真人可见手牌；无操作按钮/旧点击；抓牌显示正确牌面，其余座位仅显示牌背。

## 已知边界

本轮不重写通用 CardItemPool 或整套特效池；其历史复用/延迟隐藏问题需要单独跟踪。客户端通过编译/孤立测试也不等于上述人工视觉验收通过。
