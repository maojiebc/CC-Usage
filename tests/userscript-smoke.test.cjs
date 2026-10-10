const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

async function mountWidget(hostname) {
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

  const fetchCalls = [];
  const orgId = "11111111-2222-3333-4444-555555555555";
  const languageResponse = {
    ok: true,
    status: 200,
    json: async () => ({ greeting: "Morning,", effort: "Default" }),
  };
  async function fetch(url, options) {
    fetchCalls.push({ url, options });
    if (url.endsWith("/i18n/en-US.json")) return languageResponse;
    if (url === "https://claude.ai/api/bootstrap") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ organization: { uuid: orgId } }),
      };
    }
    if (url === `https://claude.ai/api/organizations/${orgId}/usage`) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          five_hour: { utilization: 23, resets_at: "2026-10-10T08:00:00Z" },
          seven_day: { utilization: 64, resets_at: "2026-10-16T00:00:00Z" },
          limits: [],
        }),
      };
    }
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
  const observations = [];
  const context = {
    XMLHttpRequest: class { open() {} },
    MutationObserver: class {
      observe(target, options) {
        observations.push({ target, options });
      }
    },
    Request: class {},
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    location: { hostname, pathname: "/" },
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

  return {
    elements, shadowRoots, window, document,
    observations, fetchCalls, languageResponse,
  };
}

test("runs on chatgpt.com and mounts the shadow widget without translation globals", async () => {
  const { elements, shadowRoots } = await mountWidget("chatgpt.com");
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

test("Claude quota discovery leaves official language responses and page text alone", async () => {
  const { elements, shadowRoots, window, document, observations, fetchCalls, languageResponse } =
    await mountWidget("claude.ai");
  const panel = elements.get("claude-usage-panel-bottom");
  assert.ok(panel, "Claude usage panel should mount without translation dictionaries");
  assert.match(shadowRoots[0].innerHTML, /Claude 用量/);
  assert.ok(
    fetchCalls.some(({ url }) => url.endsWith("/usage")),
    "quota discovery should still fetch usage",
  );

  const options = {
    credentials: "include",
    headers: { Accept: "application/json" },
  };
  const response = await window.fetch("https://claude.ai/i18n/en-US.json", options);
  assert.equal(response, languageResponse, "language response should pass through unchanged");
  assert.equal(fetchCalls.at(-1).options, options, "request options should pass through unchanged");
  assert.deepEqual(await response.json(), { greeting: "Morning,", effort: "Default" });

  assert.equal(observations.length, 1, "only the theme observer should be active");
  assert.equal(observations[0].target, document.documentElement);
  assert.equal(observations[0].options.characterData, undefined);
  assert.equal(observations[0].options.childList, undefined);
});

test("unsupported sites do not request data, translate pages or create a widget", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"), "utf8",
  );
  for (const hostname of ["cursor.com", "www.cursor.com", "example.com"]) {
    const context = { location: { hostname, pathname: "/agents" } };
    for (const name of ["document", "window", "MutationObserver"]) {
      Object.defineProperty(context, name, {
        get() {
          throw new Error(`unexpected ${name} access on ${hostname}`);
        },
      });
    }
    assert.doesNotThrow(() => vm.runInNewContext(source, context));
  }
});
