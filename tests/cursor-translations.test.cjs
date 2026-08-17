const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCursorTranslations() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const block = source.match(
    /\/\/ BEGIN CURSOR_TRANSLATIONS[\s\S]*?\/\/ END CURSOR_TRANSLATIONS/,
  );
  assert.ok(block, "userscript should expose the Cursor translation block");
  const context = {};
  vm.runInNewContext(
    `${block[0]}\nglobalThis.__cursorTranslations = CursorTranslations;`,
    context,
  );
  return context.__cursorTranslations;
}

const translations = loadCursorTranslations();

test("translates Cursor dashboard navigation and usage labels", () => {
  assert.equal(translations.translate("Overview"), "概览");
  assert.equal(translations.translate("Cloud Agents"), "云端智能体");
  assert.equal(translations.translate("Billing & Invoices"), "账单与发票");
  assert.equal(translations.translate("Total tokens"), "总 Token");
  assert.equal(translations.translate("On-demand"), "按量付费");
  assert.equal(translations.translate("Manage in Stripe"), "前往 Stripe 管理");
  assert.equal(translations.translate("Cursor Dark"), "Cursor 深色");
});

test("covers the primary visible copy across every Cursor dashboard route", () => {
  const samples = new Map([
    ["Getting started", "入门指南"],
    ["Connect GitHub or GitLab", "连接 GitHub 或 GitLab"],
    ["Privacy", "隐私"],
    ["Active Sessions", "活跃会话"],
    ["Run summary", "运行摘要"],
    ["No Routing Rules Yet", "暂无路由规则"],
    ["Plugin filters", "插件筛选"],
    ["Connect external tools to extend your team's workflow.", "连接外部工具，扩展团队工作流。"],
    ["User API Keys", "用户 API 密钥"],
    ["No Shared Canvases", "暂无共享画布"],
    ["Team Management", "团队管理"],
    ["Cumulative Tokens", "累计 Token"],
    ["Included Usage", "套餐内用量"],
    ["Update your payment details", "更新付款信息"],
  ]);

  for (const [english, chinese] of samples) {
    assert.equal(translations.translate(english), chinese, english);
  }
});

test("covers the live Cursor Spending page and its plan dialog", () => {
  const samples = new Map([
    ["Current Plan", "当前套餐"],
    ["Current plan", "当前套餐"],
    ["Usage limits reset on", "用量限制重置于"],
    ["Cursor Models", "Cursor 模型"],
    ["· Includes Cursor Grok and Composer", "· 包含 Cursor Grok 和 Composer"],
    ["1% used", "已使用 1%"],
    ["Additional usage beyond limits consumes Other Models quota or on-demand spend.", "超出限制的额外用量将消耗其他模型额度或按量付费支出。"],
    ["Other Models", "其他模型"],
    ["(31 days left)", "（剩余 31 天）"],
    ["Weekly usage", "每周用量"],
    ["On-Demand Spending", "按量付费支出"],
    ["On-demand spending is currently disabled", "按量付费支出当前已停用"],
    ["Monthly Limit", "每月限额"],
    ["Set a fixed amount or make it unlimited.", "设置固定金额或设为不限额。"],
    ["$200/mo", "$200/月"],
    ["$40/user/mo.", "$40/用户/月"],
    ["Adjust your plan", "调整套餐"],
    ["Monthly", "按月"],
    ["Annual", "按年"],
    ["Save 20% when billed annually", "按年计费可节省 20%"],
    ["Entry-level plan with access to premium models, unlimited Tab completions, and more.", "入门套餐，可使用高级模型、无限 Tab 补全等功能。"],
    ["Everything in Pro+", "Pro+ 的全部功能"],
    ["20x usage limits on Agent", "Agent 用量上限提高到 20 倍"],
    ["Your current plan", "你当前的套餐"],
    ["Extended limits on Agent", "更高的 Agent 用量上限"],
    ["Unlimited Tab completions", "无限 Tab 补全"],
    ["Background Agents", "后台智能体"],
    ["Maximum context windows", "最大上下文窗口"],
    ["Downgrade", "降级"],
    ["Generous limits for Grok & Composer", "更充足的 Grok 与 Composer 用量"],
    ["Priority access to premium capacity", "优先使用高级容量"],
    ["Priority access to new features", "优先体验新功能"],
    ["Highest throughput and limits", "最高吞吐量与用量上限"],
    ["Cloud agents with shared team context", "具有团队共享上下文的云端智能体"],
    ["Team-wide rules, skills, and automations", "团队级规则、技能和自动化"],
    ["Security review agent", "安全审查智能体"],
    ["Team plugin marketplace", "团队插件市场"],
    ["Centralized team billing", "集中管理团队账单"],
    ["Get Teams", "获取 Teams"],
    ["Need more capabilities for your business? Learn more about our Enterprise plans.", "企业需要更多能力？了解 Enterprise 套餐。"],
  ]);

  for (const [english, chinese] of samples) {
    assert.equal(translations.translate(english), chinese, english);
  }
});

test("covers Cursor user, appearance, help and spending dropdown menus", () => {
  const samples = new Map([
    ["Create Profile", "创建个人资料"],
    ["Download Cursor macOS", "下载 Cursor macOS"],
    ["Help", "帮助"],
    ["Light", "浅色"],
    ["Dark", "深色"],
    ["Configure", "配置"],
    ["Cursor Docs", "Cursor 文档"],
    ["Get help", "获取帮助"],
    ["Contact Us", "联系我们"],
    ["Fixed", "固定金额"],
    ["Unlimited", "不限额"],
  ]);

  for (const [english, chinese] of samples) {
    assert.equal(translations.translate(english), chinese, english);
  }
});

test("covers the Cursor Agents and Automations web app", () => {
  const samples = new Map([
    ["New Chat", "新建对话"],
    ["Search agents (⌘K)", "搜索智能体（⌘K）"],
    ["No Agents Yet", "暂无智能体"],
    ["Wait for approval after planning", "规划后等待批准"],
    ["New Automation", "新建自动化"],
    ["Review Code with Bugbot", "使用 Bugbot 审查代码"],
    ["No Automations Yet", "暂无自动化"],
    ["Find critical bugs", "查找严重问题"],
  ]);
  for (const [english, chinese] of samples) {
    assert.equal(translations.translate(english), chinese, english);
  }
  assert.equal(
    translations.translate("Use Find critical bugs template"),
    "使用“查找严重问题”模板",
  );
});

test("keeps subscription, seat and product names unchanged", () => {
  for (const name of [
    "Hobby",
    "Pro",
    "Pro+",
    "Pro Plus",
    "Ultra",
    "Teams",
    "Enterprise",
    "Standard",
    "Premium",
    "Cursor",
    "Bugbot",
  ]) {
    assert.equal(translations.translate(name), name);
  }
});

test("keeps audited Cursor technical terms and chart attribution unchanged", () => {
  for (const term of [
    "Cloud Agent API",
    "Token",
    "API",
    "SDK",
    "CLI",
    "PR",
    "UTC",
    "Created with Highcharts 12.4.0",
  ]) {
    assert.equal(translations.translate(term), term);
  }
});

test("translates surrounding plan context without translating Ultra", () => {
  assert.equal(
    translations.translate("Included in Ultra"),
    "Ultra 套餐内包含",
  );
  assert.equal(translations.translate("Upgrade to Pro+"), "升级到 Pro+");
  assert.equal(translations.translate("Current plan: Ultra"), "当前套餐：Ultra");
  assert.equal(translations.translate("Ultra plan"), "Ultra 套餐");
});

test("translates Cursor date ranges and UTC timestamps", () => {
  assert.equal(
    translations.translate("Aug 11 - Aug 17"),
    "8月11日 – 8月17日",
  );
  assert.equal(
    translations.translate("Aug 17, 02:45 PM"),
    "8月17日 14:45",
  );
  assert.equal(translations.translate("Aug 17, 2026"), "2026年8月17日");
  assert.equal(translations.translate("August"), "8月");
  assert.equal(translations.translate("About 2 hours ago"), "2 小时前");
  assert.equal(
    translations.translate("Showing 1-5 of 12"),
    "显示第 1–5 项，共 12 项",
  );
  assert.equal(translations.translate("1d"), "1天");
  assert.equal(translations.translate("0 runs"), "0 次运行");
  assert.equal(
    translations.translate("Aug 17, 2026, 02:26:35 PM UTC"),
    "2026年8月17日 14:26:35 UTC",
  );
});

test("does not touch model ids or arbitrary account names", () => {
  assert.equal(
    translations.translate("claude-4-sonnet"),
    "claude-4-sonnet",
  );
  assert.equal(
    translations.translate("Example Workspace"),
    "Example Workspace",
  );
});
