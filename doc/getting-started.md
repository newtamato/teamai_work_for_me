# 新项目接入

## 环境与配置

需要Node22和Git。业务语言不限；检查命令通过 `agent.config.json` 的checks数组指定 `{ "command": "node", "args": ["path/to/check.js"] }`，不要把凭据写在参数或配置中。

默认分支固定main、任务前缀由agent.config.json的taskPrefix配置（默认codex/，可按agent改为空或其它前缀）。修改name及repository；capabilities与release默认关闭，没有相关设施也可使用规则、记忆和Skill机制。

## 初始化例外

新空仓库尚无main基线，首次bootstrap可在主目录填写配置、检查模板、建立首次main提交。这个例外只用于初始化，之后修改使用任务工作树。

```sh
git init -b main
npm run agent -- help
npm test
git add .
git commit -m "Initialize agent project governance"
```

接入真实远程后配置origin并按维护者授权推送首次基线，fetch确认origin/main。未联网的本地演示可以把首次提交设置为本地测试基线；不能把伪造的远程引用当成平台同步证据。有真实remote后必须fetch，不人工改变origin/main来绕过检查。

完整check需要已有origin/main基线：真实仓库执行`git fetch origin main`后运行`npm run check`。仅在没有远程仓库的离线演示中，可在首次提交后执行`git update-ref refs/remotes/origin/main HEAD`再check；这只是本地测试基线，merge-check仍要求真实origin并fetch，不能据此声称已完成平台合并。

## 第一次修改任务

```sh
npm run agent -- task create improve-guide
```

切到工具返回的工作树目录，读入口与适用规则，再修改指定内容。准备 `.runtime/review-input.json`，可从 [示例](../templates/delivery/review-input.json)复制；示例none理由要按本任务事实改写，readPaths填写实际读过的路径。

```sh
npm run agent -- review --input .runtime/review-input.json
npm run check
git add .
git commit -m "Improve project guide"
npm run agent -- merge-check
```

基线或内容变化后重写复盘再检查。merge-check要求工作树洁净、回执已跟踪提交且验收指纹有效；它不执行平台合并。创建MR与合并仍按维护者权限策略执行。

## 增加能力与定时任务

业务CLI存在时再启用capabilities，声明实际来源、命令关联、排除原因；运行capabilities sync/check，复盘补cliReview。例外理由必须具体，不能用排除一切来伪装全面覆盖。

sources登记单文件；sourceDirectories可填实际业务源码目录（例如src），目录内新增文件须映射到commands.sources或exclusions.path，不能只刷新指纹掩盖遗漏。未配置的目录不在该守卫覆盖内；新增路由和字段语义仍需业务测试或目标项目适配器检查。

定时流程先建立Skill、验证步骤，再给平台一句显式调用。可先验证合成配置：

```sh
npm run agent -- automation check templates/automation/scheduled-audit.json
```

示例不是已安装的定时器；创建实际任务要核实平台支持的字段和部署路径，保留暂停状态直至明确要求启用。

## 验收

检查本项目入口链接、元数据、隔离方式、能力登记与失败回执；至少尝试一次遗漏复盘或过期指纹被拒绝的场景。接入CI和分支保护后，分别核验本地与平台门禁。最终只报告实际运行证据，不把文档步骤视为实施成功。
