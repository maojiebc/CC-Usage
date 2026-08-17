const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("runs on chatgpt.com and mounts the shadow widget without Claude globals", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const elements = new Map();

  // 渲染层走 Shadow DOM 增量更新；假 DOM 提供"万能 stub"让整条渲染路径不抛错，
  // 数据正确性由 usage-parsers 单测与 chatgpt-widget-ui 源码断言覆盖。
  function createStubElement(tag = "div") {
    const attributes = new Map();
    const stub = {
      _listeners: new Map(),
      _tag: tag,
      addEventListener(type, listener) {
        stub._listeners.set(type, listener);
      },
      appendChild(child) {
        child.parentNode = stub;
        return child;
      },
      classList: {
        add() {},
        contains: () => false,
        remove() {},
        toggle() {},
      },
      dataset: {},
      getAttribute: (name) => attributes.get(name) ?? null,
      getBoundingClientRect() {
        return { left: 1000, right: 1104, top: 50 };
      },
      hidden: false,
      id: "",
      innerHTML: "",
      offsetHeight: 100,
      offsetTop: 0,
      parentNode: null,
      querySelector: () => createStubElement(),
      querySelectorAll: () => [],
      releasePointerCapture() {},
      remove() {},
      removeEventListener() {},
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      setPointerCapture() {},
      style: { setProperty() {} },
      textContent: "",
      title: "",
      toggleAttribute() {},
    };
    return stub;
  }

  const shadowRoots = [];
  function createElement(tag) {
    const element = createStubElement(tag);
    element.attachShadow = () => {
      const shadow = createStubElement("#shadow-root");
      shadowRoots.push(shadow);
      return shadow;
    };
    return element;
  }

  const body = {
    appendChild(element) {
      element.parentNode = body;
      elements.set(element.id, element);
    },
    removeChild(element) {
      elements.delete(element.id);
      element.parentNode = null;
    },
  };
  const documentElement = {
    classList: { contains: () => false },
    getAttribute: () => null,
  };
  const document = {
    addEventListener() {},
    body,
    createElement,
    documentElement,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    readyState: "complete",
  };

  async function fetch(url) {
    if (url === "https://chatgpt.com/api/auth/session") {
      return {
        json: async () => ({ accessToken: "not-a-jwt", accountId: "acct-test" }),
        ok: true,
        status: 200,
      };
    }
    if (url === "https://chatgpt.com/backend-api/codex/usage") {
      return {
        json: async () => ({
          plan_type: "prolite",
          rate_limit: {
            primary_window: {
              used_percent: 23,
              reset_at: 1_784_000_000,
              limit_window_seconds: 18_000,
            },
            secondary_window: {
              used_percent: 64,
              reset_at: 1_784_500_000,
              limit_window_seconds: 604_800,
            },
          },
          additional_rate_limits: [
            {
              limit_name: "GPT-5.3-Codex-Spark",
              rate_limit: {
                primary_window: {
                  used_percent: 0,
                  reset_at: 1_784_600_000,
                  limit_window_seconds: 604_800,
                },
              },
            },
          ],
          rate_limit_reset_credits: { available_count: 4 },
        }),
        ok: true,
        status: 200,
      };
    }
    if (
      url ===
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
    ) {
      return {
        json: async () => ({
          available_count: 4,
          credits: [
            {
              id: "reset-nearest",
              status: "available",
              expires_at: "2026-08-01T00:00:00Z",
            },
          ],
        }),
        ok: true,
        status: 200,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  }

  const window = {
    fetch,
    innerHeight: 900,
    innerWidth: 1200,
    matchMedia() {
      return { addEventListener() {}, matches: false };
    },
  };
  const storage = new Map();
  const context = {
    MutationObserver: class {
      observe() {}
    },
    Request: class {},
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    location: { hostname: "chatgpt.com", pathname: "/" },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    window,
  };

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const panel = elements.get("claude-usage-panel-bottom");
  assert.ok(panel, "usage panel should be mounted");
  assert.equal(panel.title, "ChatGPT 使用限制");
  assert.equal(panel.getAttribute("data-chatgpt-usage-widget"), "v3");
  assert.equal(panel.getAttribute("data-theme"), "light");

  // Shadow DOM 骨架：新设计语言的展开卡、收起卡、重置卡容器都应在位。
  assert.equal(shadowRoots.length, 1, "one shadow root should be attached");
  const skeleton = shadowRoots[0].innerHTML;
  assert.match(skeleton, /ChatGPT 用量/);
  assert.match(skeleton, /compact-card/);
  assert.match(skeleton, /expanded-card/);
  assert.match(skeleton, /credit-list/);
  assert.match(skeleton, /plan-badge/);
  assert.match(skeleton, /widgetSharedStyles|--cu-bg/);
  // Claude 专属控件不应泄漏进 ChatGPT 面板。
  assert.doesNotMatch(skeleton, /settings-popover|Claude 用量/);

  // hover/tap 交互经 setChatGPTWidgetState，不应抛错。
  const hover = panel._listeners.get("mouseenter");
  assert.ok(hover, "host should listen for mouseenter");
  hover();
  const leave = panel._listeners.get("mouseleave");
  assert.ok(leave, "host should listen for mouseleave");
  leave();
});

test("runs on cursor.com/agents, translates live DOM text and does not mount a usage widget", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );

  function textNode(value) {
    return { nodeType: 3, nodeValue: value, parentElement: null };
  }

  function element(tagName, children = [], attrs = {}) {
    const attributes = new Map(Object.entries(attrs));
    const node = {
      childNodes: children,
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      hasAttribute(name) {
        return attributes.has(name);
      },
      id: "",
      isContentEditable: false,
      nodeType: 1,
      parentElement: null,
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      tagName,
    };
    for (const child of children) child.parentElement = node;
    return node;
  }

  const gettingStarted = textNode("Getting started");
  const connect = textNode("Connect GitHub or GitLab");
  const plan = textNode("Ultra");
  const date = textNode("Aug 17, 2026");
  const accountName = textNode("Example Workspace");
  const button = element("BUTTON", [connect], {
    "aria-label": "Search (⌘K)",
  });
  const body = element("BODY", [gettingStarted, button, plan, date, accountName]);

  function descendants(root) {
    const values = [];
    function visit(node) {
      for (const child of node.childNodes || []) {
        values.push(child);
        visit(child);
      }
    }
    visit(root);
    return values;
  }

  const document = {
    addEventListener() {},
    body,
    createTreeWalker(root) {
      const nodes = descendants(root);
      let index = 0;
      return { nextNode: () => nodes[index++] ?? null };
    },
    getElementById() {
      return null;
    },
  };
  let cursorObserverCallback;
  const context = {
    MutationObserver: class {
      constructor(callback) {
        cursorObserverCallback = callback;
      }
      observe() {}
    },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    Request: class {},
    console,
    document,
    location: { hostname: "cursor.com", pathname: "/agents" },
    window: { fetch() {} },
  };

  vm.runInNewContext(source, context);

  assert.equal(gettingStarted.nodeValue, "入门指南");
  assert.equal(connect.nodeValue, "连接 GitHub 或 GitLab");
  assert.equal(button.getAttribute("aria-label"), "搜索（⌘K）");
  assert.equal(plan.nodeValue, "Ultra");
  assert.equal(date.nodeValue, "2026年8月17日");
  assert.equal(accountName.nodeValue, "Example Workspace");

  const createProfile = textNode("Create Profile");
  const help = textNode("Help");
  const fixed = textNode("Fixed");
  const unlimited = textNode("Unlimited");
  const popup = element("DIV", [createProfile, help, fixed, unlimited]);
  popup.parentElement = body;
  body.childNodes.push(popup);
  cursorObserverCallback([{ type: "childList", addedNodes: [popup] }]);

  assert.equal(createProfile.nodeValue, "创建个人资料");
  assert.equal(help.nodeValue, "帮助");
  assert.equal(fixed.nodeValue, "固定金额");
  assert.equal(unlimited.nodeValue, "不限额");
});
