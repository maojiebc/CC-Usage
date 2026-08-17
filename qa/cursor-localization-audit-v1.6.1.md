# Cursor 网页汉化逐页验收（v1.6.1）

验收日期：2026-08-17

## 为什么重做

v1.6.0 只覆盖了 Dashboard 导航、用量、支出和账单等少量高频词，却将其描述为完整的 Cursor Dashboard 汉化。真实页面仍存在大量英文说明、空状态和交互菜单。本次以真实登录页面逐路由审计，修正范围描述与实际覆盖不一致的问题。

## 已审计页面

- `/dashboard`
- `/dashboard/settings`
- `/dashboard/cloud-agents`
- `/dashboard/plugins`
- `/dashboard/integrations`
- `/dashboard/api`
- `/dashboard/shared-canvases`
- `/dashboard/members`
- `/dashboard/usage`
- `/dashboard/spending`
- `/dashboard/billing`
- `/agents`
- `/agents` 内的 Automations 视图

11 个 Dashboard 路由首屏共盘点 301 个带英文的候选文本或辅助属性；候选集合已排除用量表记录、模型 ID、邮箱、金额和账号字段。

## 已审计交互状态

- 用量页：分组菜单、每页行数、分页和完整 UTC 时间提示
- 云端智能体：触发方式、运行状态、PR 创建策略、网络访问策略
- Agents：新对话、自动化、Marketplace 入口、Auto 限额提示
- Automations：筛选标签、内置模板、模板说明和空状态

## 必须保留原文

- 套餐与席位：`Hobby`、`Pro`、`Pro+`、`Pro Plus`、`Ultra`、`Teams`、`Enterprise`、`Standard`、`Premium`
- 产品与技术名：Cursor、Bugbot、Auto、Marketplace、Cloud Agent API、Token、Highcharts、GitHub、GitLab、Slack、Linear、Jira、Sentry、Stripe、API、SDK、CLI、PR、UTC、MTD、Tab
- 模型 ID、代码仓库名、工作区名、用户名和用户输入内容

## 自动化验收

- 纯翻译函数覆盖 Dashboard、Agents、Automations 的代表性文案
- 动态日期、UTC 时间戳、相对时间、分页、计数和套餐上下文均有单测
- Cursor DOM 冒烟测试验证文本节点和 `aria-label` 会被翻译，同时套餐名和账号样例保持原文
- Claude 与 ChatGPT/Codex 原有测试继续通过

## 已知边界

插件或 Marketplace 从服务端动态下发的第三方内容可能随时新增。本脚本只翻译已审计的 Cursor UI 和已知说明，不把账号内容、模型名或任意第三方描述送往外部翻译服务。
