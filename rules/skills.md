# Skill机制与维护

Skill统一维护在 `.agents/skills/<name>/SKILL.md`，模板在 `templates/skill/`，不放入发现目录。具体步骤属于Skill，约束属于rules，事实属于memory；不重复维护同一正文。

## 何时固化

任务结束前主动检索已有Skill并判断 `create / update / reuse / defer / none`，无需维护者逐次提醒。同一目标优先更新或复用，日期和输入差异用参数，不按每次任务创建Skill。

- 用户明确有“以后、每天、反复使用”意图，且至少一次完整成功验证，可以创建/更新；否则一般需两个独立任务的复用证据。同任务的多次重试不算独立任务。
- 未验证或暂不明确重复价值，defer写下一次判断条件；一次性工作或规则已覆盖可none。后续事项进入可检索待办，不伪装成已实现。
- create/update需可执行步骤、输入输出、授权与停止条件，并有代表性正常和失败验证。Skill不扩大当前任务权限。

## 元数据与资源

目录名与name一致，小写字母数字连字符，小于64字符，不首尾连字符或连续连字符。description精准描述用途与触发，必要时排除误匹配。metadata必含公开author、语义version、created_at与updated_at，日期格式YYYY-MM-DD。

首次1.0.0；文案或兼容修复升PATCH，兼容新增升MINOR，输入输出、执行语义或权限边界变化升MAJOR。created_at不变，更新时改updated_at。正文写前置条件、流程、输出、失败处理与验收；长资料按需放references，脚本仅在确定性步骤需要时新增。

## 复盘字段

`skillReview`是非空数组；每项有decision、reason、recurrence及evidence字符串数组，各说明和证据至少10字符。create/update/reuse带相对项目SKILL.md的target；create/update带validation字符串数组，写实际验证。defer不带target，带nextStep；none不带target且给具体理由。

create的基线不得已有该Skill；update需基线已有并实际变更正文/资源；reuse需已存在且未改变。全部实际Skill目录变动须由create/update覆盖，不能用none掩盖资源改动。入口删除/迁移需先设计引用迁移和守卫策略，不绕过缺失target检查。

检查必填元数据与本地引用，并验证具体步骤。工具不能证明复用价值、来源真实性或语义版本选择，主代理负责审查。

## 凭据与授权

不在Skill、资源、测试或Git保存凭据，作者不填认证账号。认证通过继承环境或维护者确认的项目外专用存储；只读当前操作必要变量，不把完整配置加载给模型，不打印值、认证头或含凭据URL。

外部写入、通知、发布或合并依当前用户授权与项目策略；用户只读时不执行。缺凭据停止相关动作并只说明变量名，不猜测或从历史寻找密钥。定时Skill另读 [定时规则](automations.md)。
