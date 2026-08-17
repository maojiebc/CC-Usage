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
