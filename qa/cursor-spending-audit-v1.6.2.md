# Cursor Spending 真实页面验收（v1.6.2）

验收日期：2026-08-17

## 复现结果

在已登录的 `https://cursor.com/dashboard/spending` 上确认 v1.6.1 仅翻译了左侧导航，主内容仍存在 Current Plan、Weekly usage、On-Demand Spending、Monthly Limit 等英文。用户菜单及其子菜单、限额下拉菜单和“调整套餐”弹窗也存在未翻译文案。

## 本次真实页面检查范围

- Spending 主内容：当前套餐、周期重置、模型用量、按量付费、每月限额
- 用户菜单：创建个人资料、下载 Cursor macOS、外观、帮助
- 外观子菜单：浅色、深色、跟随系统、配置
- 帮助子菜单：Cursor 文档、获取帮助、联系我们
- 限额下拉菜单：固定金额、不限额、已停用
- 调整套餐弹窗：按月/按年、功能说明、降级与 Teams 操作

## 保留原文

Pro、Pro+、Ultra、Teams、Enterprise 等套餐名；Cursor、Grok、Composer、Agent、Tab、SAML/OIDC 等产品或技术名；金额、账户资料和用户内容。

## 回归要求

- 初始页面和异步插入的弹出菜单都必须经过 MutationObserver 翻译。
- 动态百分比、剩余天数、月费和用量倍数必须有独立测试。
- 发布前须在真实 Spending 页面重新加载最新版脚本并检查可见英文。
