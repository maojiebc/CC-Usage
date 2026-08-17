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
