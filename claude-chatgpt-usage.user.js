// ==UserScript==
// @name         CC-Usage
// @namespace    https://github.com/maojiebc/CC-Usage/
// @homepageURL  https://github.com/maojiebc/CC-Usage/
// @supportURL   https://github.com/maojiebc/CC-Usage/issues
// @source       https://github.com/maojiebc/CC-Usage/
// @updateURL    https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js
// @downloadURL  https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js
// @author       jyking (original), maojiebc (maintainer)
// @copyright    2026, jyking and maojiebc
// @version      1.6.2
// @description  Claude 中文汉化 + Claude、ChatGPT/Codex 用量显示 + Cursor 网页汉化
// @icon         https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cd02a42d9-Vq_H3mgS.svg
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://cursor.com/*
// @match        https://www.cursor.com/*
// @require      https://raw.githubusercontent.com/maojiebc/CC-Usage/v1.0.0/claude2cn-design.user.js#sha256=19fefdebcb71584886bfa494aed0e54c4922860f01d9db367e838489ab8afb48
// @require      https://raw.githubusercontent.com/maojiebc/CC-Usage/v1.0.0/claude2cn-translations.user.js#sha256=587a5de6adf25d5aa19f1e6f58b5bb6181f31e5d89e49669a3c75a85df8ff61a
// @require      https://raw.githubusercontent.com/maojiebc/CC-Usage/v1.5.2/claude-usage-icons.user.js#sha256=9050bccec82b4413ce99420766796c0d6af2dd34aeafa9e49b38c3e169bbe6f5
// @grant        none
// @license      MIT
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const isClaudeSite = location.hostname === "claude.ai";
  const isChatGPTSite = location.hostname === "chatgpt.com";
  const isCursorSite =
    (location.hostname === "cursor.com" ||
      location.hostname === "www.cursor.com") &&
    (location.pathname.startsWith("/dashboard") ||
      location.pathname.startsWith("/agents"));

  // 添加 CSS 变量
  if (isClaudeSite) {
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --font-anthropic-serif: "Anthropic Serif", Georgia, "Times New Roman", Times, "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", "Source Hans Serif CN", "Songti SC", SimSun, serif;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : "";

      if (
        !url.includes("/i18n/en-US.json") &&
        !url.includes("/i18n/statsig/en-US.json")
      ) {
        return originalFetch(...args);
      }

      const response = await originalFetch(...args);
      const json = await response.json();

      for (const key of Object.keys(json)) {
        const val = json[key];
        if (typeof val === "string" && TRANSLATIONS[val]) {
          json[key] = TRANSLATIONS[val];
        }
      }

      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  // BEGIN USAGE_PARSERS — 保持为纯函数，便于离线测试未公开接口的响应兼容性。
  const UsageParsers = (() => {
    function asNumber(value) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }

    function firstNumber(...values) {
      for (const value of values) {
        const parsed = asNumber(value);
        if (parsed !== null) return parsed;
      }
      return null;
    }

    function toTimestampMs(value) {
      const numeric = asNumber(value);
      if (numeric !== null) {
        return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
      }
      if (typeof value !== "string" || !value.trim()) return null;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeWindow(raw, defaultWindowMinutes = null) {
      if (!raw || typeof raw !== "object") return null;
      const utilization = firstNumber(
        raw.utilization,
        raw.used_percentage,
        raw.used_percent,
        raw.percent,
      );
      if (utilization === null) return null;
      const seconds = firstNumber(
        raw.limit_window_seconds,
        raw.window_seconds,
      );
      const minutes = firstNumber(raw.window_minutes, raw.window_duration_minutes);
      return {
        utilization: Math.min(100, Math.max(0, utilization)),
        resets_at:
          raw.resets_at ?? raw.reset_at ?? raw.resetAt ?? raw.resetsAt ?? null,
        window_minutes:
          minutes ?? (seconds !== null ? seconds / 60 : defaultWindowMinutes),
      };
    }

    function stringValue(value) {
      return typeof value === "string" ? value.trim() : "";
    }

    function displayModelName(value) {
      const name = stringValue(value);
      return /^(?:claude[-_ ]?)?fable(?:[-_ ]?5)?$/i.test(name)
        ? "Fable 5"
        : name;
    }

    function parseClaude(data) {
      const empty = {
        fiveHour: null,
        sevenDay: null,
        modelLimits: [],
        resetCredits: null,
        planName: "",
        hit: false,
        hasScopedSurface: false,
      };
      if (!data || typeof data !== "object") return empty;

      let fiveHour = normalizeWindow(data.five_hour, 300);
      let sevenDay = normalizeWindow(data.seven_day, 10_080);
      const modelLimits = new Map();

      function setModelLimit(name, raw, defaultWindowMinutes = 10_080) {
        const modelName = displayModelName(name);
        const window = normalizeWindow(raw, defaultWindowMinutes);
        if (!modelName || !window) return;
        modelLimits.set(modelName.toLowerCase(), { name: modelName, ...window });
      }

      setModelLimit(
        "Fable 5",
        data.seven_day_fable ?? data.fable_seven_day ?? data.fable_weekly,
      );

      if (Array.isArray(data.limits)) {
        for (const limit of data.limits) {
          if (!limit || typeof limit !== "object") continue;
          const kind = stringValue(limit.kind).toLowerCase();
          const group = stringValue(limit.group).toLowerCase();
          const scopedModel =
            limit.scope?.model?.display_name ??
            limit.scope?.model?.name ??
            limit.scope?.model?.id ??
            (typeof limit.scope?.model === "string" ? limit.scope.model : "");
          const windowMinutes =
            group === "session" || kind === "session" ? 300 : 10_080;

          if (stringValue(scopedModel)) {
            setModelLimit(scopedModel, limit, windowMinutes);
          } else if (!fiveHour && (kind === "session" || group === "session")) {
            fiveHour = normalizeWindow(limit, 300);
          } else if (
            !sevenDay &&
            (kind === "weekly_all" || group === "weekly")
          ) {
            sevenDay = normalizeWindow(limit, 10_080);
          }
        }
      }

      if (Array.isArray(data.rate_limits)) {
        for (const item of data.rate_limits) {
          if (!item || typeof item !== "object") continue;
          const windowName = stringValue(
            item.window_duration ?? item.type ?? item.kind,
          ).toLowerCase();
          const modelName =
            item.scope?.model?.display_name ?? item.model?.display_name ?? "";
          if (stringValue(modelName)) {
            setModelLimit(modelName, item);
          } else if (!fiveHour && /5h|five.?hour|session/.test(windowName)) {
            fiveHour = normalizeWindow(item, 300);
          } else if (!sevenDay && /7d|seven.?day|week/.test(windowName)) {
            sevenDay = normalizeWindow(item, 10_080);
          }
        }
      }

      const result = {
        fiveHour,
        sevenDay,
        modelLimits: [...modelLimits.values()],
        resetCredits: null,
        planName: stringValue(
          data.subscription_type ?? data.plan_name ?? data.plan,
        ),
        hasScopedSurface:
          Array.isArray(data.limits) || modelLimits.size > 0,
      };
      return {
        ...result,
        hit: Boolean(
          result.fiveHour || result.sevenDay || result.modelLimits.length,
        ),
      };
    }

    function parseChatGPT(data) {
      const empty = {
        fiveHour: null,
        sevenDay: null,
        modelLimits: [],
        resetCredits: null,
        planName: "",
        hit: false,
      };
      if (!data || typeof data !== "object") return empty;

      const rateLimit = data.rate_limit ?? data.rateLimit ?? {};
      const primaryWindow = normalizeWindow(
        rateLimit.primary_window ?? rateLimit.primaryWindow ?? data.primary,
        300,
      );
      const secondaryWindow = normalizeWindow(
        rateLimit.secondary_window ?? rateLimit.secondaryWindow ?? data.secondary,
        10_080,
      );
      const weeklyWindow = [primaryWindow, secondaryWindow].find((window) => {
        const minutes = Number(window?.window_minutes);
        return Number.isFinite(minutes) && minutes >= 9_360 && minutes <= 10_800;
      });

      const result = {
        // ChatGPT 网页端只把套餐共享的每周用量作为用户额度展示。
        // additional_rate_limits 是内部模型计量项，不属于网页端额度维度。
        fiveHour: null,
        sevenDay: weeklyWindow ?? null,
        modelLimits: [],
        resetCredits: parseChatGPTResetCredits(data),
        planName: stringValue(data.plan_type ?? data.planType ?? data.plan),
      };
      return {
        ...result,
        hit: Boolean(
          result.fiveHour || result.sevenDay || result.modelLimits.length,
        ),
      };
    }

    function parseChatGPTResetCredits(data) {
      if (!data || typeof data !== "object") return null;
      const summary =
        data.rate_limit_reset_credits ?? data.rateLimitResetCredits ?? data;
      if (!summary || typeof summary !== "object") return null;

      const credits = Array.isArray(summary.credits) ? summary.credits : null;
      const availableCredits = (credits ?? []).filter((credit) => {
        if (!credit || typeof credit !== "object") return false;
        const status = stringValue(credit.status).toLowerCase();
        return !status || status === "available";
      });
      const availableCountValue = firstNumber(
        summary.available_count,
        summary.availableCount,
      );
      if (availableCountValue === null && credits === null) return null;

      const expirations = availableCredits
        .map((credit) =>
          toTimestampMs(credit.expires_at ?? credit.expiresAt ?? null),
        )
        .filter((timestamp) => timestamp !== null)
        .sort((a, b) => a - b);

      return {
        availableCount: Math.max(
          0,
          Math.floor(availableCountValue ?? availableCredits.length),
        ),
        nearestExpiresAt: expirations[0] ?? null,
        detailsAvailable: credits !== null,
      };
    }

    function merge(base, incoming) {
      if (!base) return incoming;
      const modelLimits = new Map();
      for (const item of [...base.modelLimits, ...incoming.modelLimits]) {
        modelLimits.set(item.name.toLowerCase(), item);
      }
      const merged = {
        fiveHour: incoming.fiveHour ?? base.fiveHour,
        sevenDay: incoming.sevenDay ?? base.sevenDay,
        modelLimits: [...modelLimits.values()],
        resetCredits: incoming.resetCredits ?? base.resetCredits ?? null,
        planName: incoming.planName || base.planName,
        hasScopedSurface: Boolean(
          base.hasScopedSurface || incoming.hasScopedSurface,
        ),
      };
      return {
        ...merged,
        hit: Boolean(
          merged.fiveHour || merged.sevenDay || merged.modelLimits.length,
        ),
      };
    }

    return Object.freeze({
      parseClaude,
      parseChatGPT,
      parseChatGPTResetCredits,
      merge,
      toTimestampMs,
    });
  })();
  // END USAGE_PARSERS

  // BEGIN DYNAMIC_TRANSLATIONS — 处理包含姓名、百分比和日期的运行时文案。
  const DynamicTranslations = (() => {
    const greetings = {
      morning: "早上好",
      afternoon: "下午好",
      evening: "晚上好",
    };
    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };
    const relativeDays = {
      today: "今天",
      tomorrow: "明天",
      monday: "周一",
      tuesday: "周二",
      wednesday: "周三",
      thursday: "周四",
      friday: "周五",
      saturday: "周六",
      sunday: "周日",
    };

    function formatClock(hourValue, minuteValue, meridiemValue) {
      let hour = Number(hourValue);
      const minute = Number(minuteValue || 0);
      const meridiem = String(meridiemValue || "").toUpperCase();
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
      if (meridiem === "AM" && hour === 12) hour = 0;
      if (meridiem === "PM" && hour < 12) hour += 12;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function formatResetTime(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";

      const dateMatch = raw.match(
        /^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?$/i,
      );
      if (dateMatch) {
        const month = months[dateMatch[1].toLowerCase()];
        if (month) {
          const year = dateMatch[3] ? `${dateMatch[3]}年` : "";
          const clock = dateMatch[4]
            ? ` ${formatClock(dateMatch[4], dateMatch[5], dateMatch[6])}`
            : "";
          return `${year}${month}月${Number(dateMatch[2])}日${clock}`;
        }
      }

      const relativeMatch = raw.match(
        /^(Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i,
      );
      if (relativeMatch) {
        return `${relativeDays[relativeMatch[1].toLowerCase()]} ${formatClock(
          relativeMatch[2],
          relativeMatch[3],
          relativeMatch[4],
        )}`;
      }

      return raw
        .replace(/\bat\b/gi, "")
        .replace(/\bAM\b/gi, "上午")
        .replace(/\bPM\b/gi, "下午")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function formatLimitName(value) {
      const raw = String(value || "").trim();
      const known = {
        usage: "通用",
        weekly: "每周",
        session: "会话",
        "extra usage": "额外用量",
      };
      return known[raw.toLowerCase()] || raw;
    }

    // 模型选择器与工作量（effort）菜单的英文词条：主翻译词库锁在 v1.0.0 tag，
    // 新 UI 词条在这里增补。整节点精确匹配后替换，浮窗自身在 Shadow DOM 内不受影响。
    const staticPhrases = {
      "For your toughest challenges": "应对最棘手的挑战",
      "For complex tasks": "适合复杂任务",
      "Most efficient for everyday tasks": "日常任务最高效",
      "Fastest for quick answers": "快速问答最迅捷",
      "Higher effort means more thorough responses, but takes longer and uses your limits faster.":
        "工作量越高，回答越详尽，但耗时更长、额度消耗也更快。",
      "More models": "更多模型",
      Effort: "工作量",
      // 工作量档位（Low/Medium/High/Extra/Max）保留英文：产品语境下的
      // 强度词，中文直译反而生硬（2026-07-14 用户反馈）。
      Default: "默认",
    };

    function translate(value) {
      const original = String(value || "").trim();
      const text = original
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]{2,}/g, " ");
      if (!text) return text;

      if (Object.prototype.hasOwnProperty.call(staticPhrases, text)) {
        return staticPhrases[text];
      }

      const includedMatch = text.match(
        /^Included until\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?)$/i,
      );
      if (includedMatch) {
        return `${formatResetTime(includedMatch[1])}前可用`;
      }

      const greetingMatch = text.match(
        /^(?:Good\s+)?(Morning|Afternoon|Evening),\s*(.*)$/i,
      );
      if (greetingMatch) {
        const greeting = greetings[greetingMatch[1].toLowerCase()];
        return `${greeting}，${greetingMatch[2]}`;
      }

      const usageMatch = text.match(
        /^You(?:'|’)ve used\s*(\d+(?:\.\d+)?\s*%)\s*of\s+your\s*(.+?)\s+limit(?:\s*[·∙•]\s*Resets\s+(.+))?$/i,
      );
      if (usageMatch) {
        const percent = usageMatch[1].replace(/\s+/g, "");
        const limitName = formatLimitName(usageMatch[2]);
        const reset = usageMatch[3]
          ? ` · 将于 ${formatResetTime(usageMatch[3])} 重置`
          : "";
        const usagePrefix = /[\u3400-\u9fff]/u.test(limitName)
          ? `您已使用${limitName}额度的`
          : `您已使用 ${limitName} 额度的`;
        return `${usagePrefix} ${percent}${reset}`;
      }

      return original;
    }

    function translateSegments(values) {
      const original = values.map((value) => String(value || "")).join("");
      const translated = translate(original);
      return translated !== original.trim() ? translated : null;
    }

    return Object.freeze({ formatResetTime, translate, translateSegments });
  })();
  // END DYNAMIC_TRANSLATIONS

  // BEGIN CURSOR_TRANSLATIONS — Cursor Dashboard 精确词典与动态日期翻译。
  // 套餐、席位和模型专有名词只作为变量保留，不做中文直译。
  const CursorTranslations = (() => {
    const protectedNames = new Set([
      "Hobby",
      "Pro",
      "Pro+",
      "Pro Plus",
      "Ultra",
      "Teams",
      "Enterprise",
      "Standard",
      "Premium",
      "Business",
      "Cursor",
      "Bugbot",
      "Auto",
      "Marketplace",
      "Cloud Agent API",
      "Token",
      "Highcharts",
      "GitHub",
      "GitLab",
      "Slack",
      "Linear",
      "Jira",
      "Sentry",
      "Stripe",
      "API",
      "SDK",
      "CLI",
      "PR",
      "UTC",
      "MTD",
      "Tab",
    ]);

    const phrases = Object.freeze({
      "Back to Agents": "返回智能体",
      Overview: "概览",
      Settings: "设置",
      "Cloud Agents": "云端智能体",
      Plugins: "插件",
      Integrations: "集成",
      "API Keys": "API 密钥",
      "Shared Canvases": "共享画布",
      Members: "成员",
      Usage: "用量",
      Spending: "支出",
      "Billing & Invoices": "账单与发票",
      "User menu": "用户菜单",
      Search: "搜索",
      "Getting Started": "入门指南",
      Skip: "跳过",
      Setup: "设置",
      Connect: "连接",
      "Source Control": "源代码管理",
      "Total tokens": "总 Token",
      Total: "总计",
      Included: "套餐内",
      "On-demand": "按量付费",
      Free: "免费",
      "Your Usage": "你的用量",
      "Your usage per day across this billing period":
        "本计费周期内的每日用量",
      "Group By: Model": "分组：模型",
      "Group By: User": "分组：用户",
      "Group By: Type": "分组：类型",
      Today: "今天",
      "Export CSV": "导出 CSV",
      "Date (UTC)": "日期（UTC）",
      Type: "类型",
      Model: "模型",
      Tokens: "Token",
      Cost: "费用",
      "Last 1 day": "最近 1 天",
      "Last 7 days": "最近 7 天",
      "Last 30 days": "最近 30 天",
      "Month-to-date": "本月至今",
      "Last month": "上个月",
      "Loading...": "加载中…",
      Refresh: "刷新",
      "No results": "暂无结果",
      "No usage data": "暂无用量数据",
      "Manage subscription": "管理订阅",
      "Usage-based pricing": "按量计费",
      "Enable on-demand spend": "启用按量付费",
      "Disable on-demand spend": "停用按量付费",
      "Spend limit": "支出上限",
      "Current billing period": "当前计费周期",
      "Billing period": "计费周期",
      "Plan & Usage": "套餐与用量",
      "Current Plan": "当前套餐",
      "Current plan": "当前套餐",
      "Usage limits reset on": "用量限制重置于",
      "Cursor Models": "Cursor 模型",
      "Includes Cursor Grok and Composer": "包含 Cursor Grok 和 Composer",
      "· Includes Cursor Grok and Composer": "· 包含 Cursor Grok 和 Composer",
      "Additional usage beyond limits consumes Other Models quota or on-demand spend.":
        "超出限制的额外用量将消耗其他模型额度或按量付费支出。",
      "Other Models": "其他模型",
      "Additional usage beyond limits consumes on-demand spend. Your plan includes at least $400 of Other Models usage.":
        "超出限制的额外用量将按量计费。你的套餐至少包含 $400 的其他模型用量。",
      "Weekly usage": "每周用量",
      Resets: "重置于",
      "On-Demand Spending": "按量付费支出",
      "On-demand spending is currently disabled": "按量付费支出当前已停用",
      "Monthly Limit": "每月限额",
      "Set a fixed amount or make it unlimited.": "设置固定金额或设为不限额。",
      Fixed: "固定金额",
      Unlimited: "不限额",
      "Create Profile": "创建个人资料",
      "Download Cursor macOS": "下载 Cursor macOS",
      Help: "帮助",
      Light: "浅色",
      Dark: "深色",
      Configure: "配置",
      "Cursor Docs": "Cursor 文档",
      "Get help": "获取帮助",
      "Contact Us": "联系我们",
      "Adjust your plan": "调整套餐",
      Monthly: "按月",
      Annual: "按年",
      "Entry-level plan with access to premium models, unlimited Tab completions, and more.":
        "入门套餐，可使用高级模型、无限 Tab 补全等功能。",
      "Extended limits on Agent": "更高的 Agent 用量上限",
      "Unlimited Tab completions": "无限 Tab 补全",
      "Background Agents": "后台智能体",
      "Maximum context windows": "最大上下文窗口",
      Downgrade: "降级",
      "Get 3x more usage than Pro and unlock higher limits on Agent and premium models.":
        "获得 Pro 3 倍用量，并解锁更高的 Agent 和高级模型上限。",
      "Generous limits for Grok & Composer": "更充足的 Grok 与 Composer 用量",
      "Priority access to premium capacity": "优先使用高级容量",
      "Priority access to new features": "优先体验新功能",
      "Highest throughput and limits": "最高吞吐量与用量上限",
      "Your current plan": "你当前的套餐",
      "Everything on Individual, plus:": "包含 Individual 的全部功能，另加：",
      "Cloud agents with shared team context": "具有团队共享上下文的云端智能体",
      "Team-wide rules, skills, and automations": "团队级规则、技能和自动化",
      "Security review agent": "安全审查智能体",
      "SAML/OIDC SSO + enforced team-level privacy mode":
        "SAML/OIDC SSO + 强制团队级隐私模式",
      "Team plugin marketplace": "团队插件市场",
      "Usage analytics": "用量分析",
      "Centralized team billing": "集中管理团队账单",
      "Get Teams": "获取 Teams",
      "Need more capabilities for your business? Learn more about our Enterprise plans.":
        "企业需要更多能力？了解 Enterprise 套餐。",
      "Notifications alt+T": "通知 alt+T",
      "Search (⌘K)": "搜索（⌘K）",
      "Getting started": "入门指南",
      Completed: "已完成",
      "Setup progress": "设置进度",
      "Connect GitHub or GitLab": "连接 GitHub 或 GitLab",
      "Extend Cursor with plugins": "用插件扩展 Cursor",
      "Connect Slack": "连接 Slack",
      "Set up cloud for faster, parallelized agents that verify their work":
        "配置云端环境，让智能体更快并行运行并验证工作结果",
      "Set up": "开始设置",
      "Cloud agents test and send demos of their code and let you ship from your phone, Slack, GitHub, and more.":
        "云端智能体会测试代码并发送演示，让你可以从手机、Slack、GitHub 等渠道直接交付。",
      "Loading contribution data...": "正在加载贡献数据…",
      "Copy section link": "复制区域链接",
      "AI Line Edits": "AI 行级编辑",
      All: "全部",
      Agent: "智能体",
      "Most Active Month": "最活跃月份",
      "Most Active Day": "最活跃日期",
      "Longest Streak": "最长连续记录",
      "Current Streak": "当前连续记录",
      Fewer: "较少",
      "Connect GitHub for Cloud Agents, Bugbot and enhanced codebase context":
        "连接 GitHub，以使用云端智能体、Bugbot 和增强的代码库上下文",
      "Connect GitLab for Cloud Agents, Bugbot and enhanced codebase context":
        "连接 GitLab，以使用云端智能体、Bugbot 和增强的代码库上下文",
      "Connect Azure DevOps for Cloud Agents, Bugbot and enhanced codebase context":
        "连接 Azure DevOps，以使用云端智能体、Bugbot 和增强的代码库上下文",
      "Connect Bitbucket Cloud for Cloud Agents, Bugbot and enhanced codebase context":
        "连接 Bitbucket Cloud，以使用云端智能体、Bugbot 和增强的代码库上下文",
      "Ask a team admin to connect an instance": "请团队管理员连接实例",
      "Team Admin Required": "需要团队管理员权限",
      "Work with Cloud Agents from Slack": "通过 Slack 使用云端智能体",
      "Work with Cloud Agents from Microsoft Teams":
        "通过 Microsoft Teams 使用云端智能体",
      "Connect a Linear workspace to delegate issues to Cloud Agents":
        "连接 Linear 工作区，将事项委派给云端智能体",
      "Connect a Jira site to delegate issues to Cloud Agents":
        "连接 Jira 站点，将事项委派给云端智能体",
      "The Jira integration is only available on Teams and Enterprise plans.":
        "Jira 集成仅适用于 Teams 和 Enterprise 套餐。",
      "Use Sentry issue events in Automations":
        "在自动化中使用 Sentry 事项事件",
      Privacy: "隐私",
      "Share Data": "共享数据",
      Active: "已启用",
      "Your codebase, prompts, edits and other usage data will be stored and trained on by Cursor to improve the product.":
        "你的代码库、提示词、编辑内容和其他使用数据将由 Cursor 存储并用于训练，以改进产品。",
      Profile: "个人资料",
      Email: "电子邮箱",
      "Profile Image": "头像",
      "Upload profile image": "上传头像",
      "PNG, JPEG, or WebP up to 2 MB": "PNG、JPEG 或 WebP，最大 2 MB",
      "First Name": "名",
      "First name": "名",
      "Last Name": "姓",
      "Last name": "姓",
      Handle: "用户名",
      "Profile page links": "个人主页链接",
      "Link 1": "链接 1",
      "Public profile": "公开个人主页",
      "When enabled, your cursor.com profile page is visible to anyone with the link.":
        "启用后，任何获得链接的人都能查看你的 cursor.com 个人主页。",
      Appearance: "外观",
      Theme: "主题",
      "Light Theme": "浅色主题",
      "Choose the theme used when your system is in light mode":
        "选择系统处于浅色模式时使用的主题",
      "Dark Theme": "深色主题",
      "Choose the theme used when your system is in dark mode":
        "选择系统处于深色模式时使用的主题",
      "Pull Requests": "拉取请求",
      "Review Provider": "审查服务",
      "Choose GitHub or Graphite for pull request links on web and desktop":
        "选择在网页端和桌面端打开拉取请求链接时使用 GitHub 或 Graphite",
      "Active Sessions": "活跃会话",
      "Active sessions": "活跃会话",
      Device: "设备",
      Created: "创建时间",
      "Desktop App": "桌面应用",
      "Mobile App": "移动应用",
      "Previous page": "上一页",
      "Next page": "下一页",
      "Session revocation may take up to 10 minutes to complete.":
        "撤销会话最多可能需要 10 分钟才能完成。",
      More: "更多",
      "Delete Account": "删除账户",
      "Create Agents to edit and run code, asynchronously":
        "创建智能体，异步编辑并运行代码",
      "Run summary": "运行摘要",
      "All triggers": "全部触发方式",
      "All statuses": "全部状态",
      New: "新建",
      Runs: "运行记录",
      "Cloud agent runs": "云端智能体运行记录",
      "No cloud agent runs match these filters.":
        "没有符合这些筛选条件的云端智能体运行记录。",
      Environments: "环境",
      "Loading table data": "正在加载表格数据",
      Name: "名称",
      Repositories: "代码仓库",
      Scope: "范围",
      Updated: "更新时间",
      Actions: "操作",
      "Self-Hosted": "自托管",
      "Monitor and manage your self-hosted cloud machines":
        "监控并管理你的自托管云端机器",
      "Enable Self-Hosted Pool": "启用自托管资源池",
      "Enable self-hosted pool to create a personal pool of workers.":
        "启用自托管资源池，创建个人工作节点池。",
      "Enable Remote Control": "启用远程控制",
      "Control your local agents remotely from mobile and web.":
        "通过移动端和网页端远程控制本地智能体。",
      "My Machines": "我的机器",
      "View personal self-hosted workers and CLI commands to connect machines.":
        "查看个人自托管工作节点，以及连接机器所需的 CLI 命令。",
      Defaults: "默认设置",
      "Default Model": "默认模型",
      "Used when no model is specified": "未指定模型时使用",
      "Select Model": "选择模型",
      "Default Repository": "默认代码仓库",
      "Used when no repository is specified": "未指定代码仓库时使用",
      "Base Branch": "基础分支",
      "When empty, Cloud Agent will use a repository's default branch (recommended)":
        "留空时，云端智能体将使用代码仓库的默认分支（推荐）",
      "Branch name...": "分支名称…",
      "Branch Prefix": "分支前缀",
      "Prefix for branch names created by Cloud Agent":
        "云端智能体创建分支时使用的名称前缀",
      "Create PRs": "创建 PR",
      "Automatically create a pull request when Cloud Agent completes.":
        "云端智能体完成任务后自动创建拉取请求。",
      "For Single Model Runs": "适用于单模型运行",
      Notifications: "通知",
      "Slack Notifications": "Slack 通知",
      "Get notified in Slack when a Cloud Agent completes a task":
        "云端智能体完成任务时在 Slack 中接收通知",
      "Routing Rules": "路由规则",
      "Routing rules to help Cloud Agents pick the right repository or environment.":
        "通过路由规则帮助云端智能体选择正确的代码仓库或环境。",
      "Add Rule": "添加规则",
      "No Routing Rules Yet": "暂无路由规则",
      Security: "安全",
      "Network Access Settings": "网络访问设置",
      "Control which network destinations your cloud agents can access":
        "控制云端智能体可以访问哪些网络目标",
      "Allow All Network Access": "允许访问所有网络",
      "My Secrets": "我的密钥",
      "Securely set environment variables for your Cloud Agents.":
        "为云端智能体安全地设置环境变量。",
      "Search secrets": "搜索密钥",
      "Add Secrets": "添加密钥",
      "No Secrets Yet": "暂无密钥",
      "Extend Cursor with skills, rules, subagents, MCP tools, and hooks":
        "使用技能、规则、子智能体、MCP 工具和 Hooks 扩展 Cursor",
      "Plugin filters": "插件筛选",
      Required: "必需",
      Optional: "可选",
      "Search plugins": "搜索插件",
      "Search skills, rules, subagents, MCPs, and hooks":
        "搜索技能、规则、子智能体、MCP 和 Hooks",
      Add: "添加",
      "Connect to GitHub — repositories, issues, pull requests, code search, and Actions — via GitHub's official remote MCP server.":
        "通过 GitHub 官方远程 MCP 服务器连接代码仓库、事项、拉取请求、代码搜索和 Actions。",
      "Connect external tools to extend your team's workflow.":
        "连接外部工具，扩展团队工作流。",
      "Manage API keys and service accounts for programmatic access to Cursor.":
        "管理 API 密钥和服务账户，以编程方式访问 Cursor。",
      "SDK docs": "SDK 文档",
      "TypeScript and Python SDKs for building with Cursor agents.":
        "用于构建 Cursor 智能体的 TypeScript 和 Python SDK。",
      "API docs": "API 文档",
      "Cloud Agent API reference for programmatic access.":
        "用于程序化访问的 Cloud Agent API 参考文档。",
      "User API Keys": "用户 API 密钥",
      "No API Keys Yet": "暂无 API 密钥",
      "No API Keys have been created yet": "尚未创建 API 密钥",
      "New API Key": "新建 API 密钥",
      "User API Keys provide secure, programmatic access to your Cursor account, including the headless version of the Cursor Agent CLI":
        "用户 API 密钥可为你的 Cursor 账户提供安全的程序化访问，包括无界面的 Cursor Agent CLI",
      ". Treat them like passwords: keep them secure and never share them publicly.":
        "。请像对待密码一样妥善保管，切勿公开分享。",
      "Note: The": "注意：",
      "is in beta.": "目前处于测试阶段。",
      "All the Canvases you've shared from Cursor, in one place.":
        "集中查看你从 Cursor 分享的所有画布。",
      "No Shared Canvases": "暂无共享画布",
      "Canvases you share from Cursor will appear here.":
        "你从 Cursor 分享的画布会显示在这里。",
      "Work with your team and unlock collaborative features":
        "与团队协作并解锁协同功能",
      "Team Management": "团队管理",
      "Invite members, manage roles, and control access":
        "邀请成员、管理角色并控制访问权限",
      "Usage Analytics": "用量分析",
      "Track team usage and optimize your subscription":
        "跟踪团队用量并优化订阅",
      "Admin Controls": "管理员控制",
      "Centralized billing and privacy mode controls":
        "集中管理账单和隐私模式",
      "Rules & Commands": "规则与命令",
      "Share rules and commands across your team":
        "在团队内共享规则和命令",
      "Create team": "创建团队",
      "Need enterprise features?": "需要企业级功能？",
      "Get pooled usage, SCIM seat management, and granular admin controls":
        "获得共享用量池、SCIM 席位管理和精细化管理员控制",
      "Contact sales": "联系销售",
      "UTC time range info. Time range is start of day UTC on start date to end of day UTC on end date.":
        "UTC 时间范围说明：从开始日期的 UTC 当日零点，到结束日期的 UTC 当日结束。",
      "Time range is start of day UTC on start date to end of day UTC on end date.":
        "时间范围从开始日期的 UTC 当日零点，到结束日期的 UTC 当日结束。",
      "Cumulative Tokens": "累计 Token",
      "Usage Type": "用量类型",
      default: "默认",
      "Usage events for all users": "所有用户的用量事件",
      "Rows: 100": "每页：100 行",
      "Get maximum value with 20x usage limits and early access to advanced features.":
        "获得 20 倍用量上限，并优先体验高级功能。",
      Payment: "付款方式",
      "Update your payment details": "更新付款信息",
      "Included Usage": "套餐内用量",
      "On-Demand Usage": "按量付费用量",
      Invoices: "发票",
      "UTC. Invoice dates and the months you can filter and download are in UTC.":
        "UTC。发票日期以及可筛选、下载的月份均以 UTC 为准。",
      "Invoice dates and the months you can filter and download are in UTC.":
        "发票日期以及可筛选、下载的月份均以 UTC 为准。",
      "We'll be sad to see you go.": "我们会舍不得你离开。",
      Automations: "自动化",
      Desktop: "桌面端",
      "Frontend QA": "前端 QA",
      Local: "本地",
      Mobile: "移动端",
      Subagent: "子智能体",
      Web: "网页端",
      Success: "成功",
      Warning: "警告",
      Failure: "失败",
      Running: "运行中",
      Finished: "已完成",
      "Install failed": "安装失败",
      Error: "错误",
      "Select model": "选择模型",
      Always: "始终",
      Never: "从不",
      "Defaults + My Allowlist": "默认规则 + 我的允许列表",
      "My Allowlist Only": "仅使用我的允许列表",
      and: "和",
      "Cursor home": "Cursor 主页",
      "Toggle left sidebar": "切换左侧边栏",
      "Search agents (⌘K)": "搜索智能体（⌘K）",
      "New Chat": "新建对话",
      Dashboard: "控制台",
      Agents: "智能体",
      "Customize thread list": "自定义对话列表",
      "No Agents Yet": "暂无智能体",
      "Loading…": "加载中…",
      "Ask Cursor to build, fix bugs, explore":
        "让 Cursor 构建功能、修复问题或探索代码",
      "Add context and tools": "添加上下文和工具",
      "Start voice input": "开始语音输入",
      "Create an Automation": "创建自动化",
      "Explore Marketplace": "浏览 Marketplace",
      "Wait for approval after planning": "规划后等待批准",
      "Running on Auto": "正在使用 Auto 运行",
      "Usage limits reached. This Agent is running on Auto for free.":
        "已达到用量上限。此智能体正在免费使用 Auto 运行。",
      "Edit limits": "编辑上限",
      "Continue with Auto": "继续使用 Auto",
      "New Automation": "新建自动化",
      "Automate repetitive tasks with always-on agents and configure Cursor's built-in agents for your team.":
        "使用常驻智能体自动处理重复任务，并为团队配置 Cursor 内置智能体。",
      "From Cursor": "来自 Cursor",
      "Ship better code, faster": "更快交付更好的代码",
      "Review Code with Bugbot": "使用 Bugbot 审查代码",
      "Catch bugs and auto-fix before they ship.":
        "在发布前发现问题并自动修复。",
      "Scan and Triage Security Vulnerabilities": "扫描并分级安全漏洞",
      "Security checks on every change.": "检查每一次变更的安全性。",
      "Route PR Reviews and Auto-Approve": "分配 PR 审查并自动批准",
      "Assign reviewers and approve PRs.": "分配审查者并批准 PR。",
      "Get Started": "开始使用",
      Dismiss: "关闭",
      "Automation filters": "自动化筛选",
      Mine: "我的",
      Team: "团队",
      "All Runs": "全部运行记录",
      "Search...": "搜索…",
      "No Automations Yet": "暂无自动化",
      "Automation template filters": "自动化模板筛选",
      Popular: "热门",
      "Code Review": "代码审查",
      "Incidents & Triage": "事件与分级处理",
      "Data & Research": "数据与研究",
      Environment: "环境",
      "Find critical bugs": "查找严重问题",
      "Analyze recent commits for high-severity correctness bugs and submit safe fixes":
        "分析近期提交中的高严重性正确性问题，并提交安全修复",
      Scheduled: "定时运行",
      "Send Slack": "发送到 Slack",
      "Scan codebase for vulnerabilities": "扫描代码库漏洞",
      "Review the full repository on a schedule and alert on validated high-impact security issues":
        "定期审查整个代码仓库，并针对已确认的高影响安全问题发出提醒",
      "Generate docs": "生成文档",
      "Create and update developer documentation for recently changed or under-documented code":
        "为近期变更或文档不足的代码创建并更新开发者文档",
      "Add test coverage": "补充测试覆盖",
      "Review recent changes and add tests for high-risk logic that lacks adequate coverage":
        "审查近期变更，并为覆盖不足的高风险逻辑补充测试",
      Edit: "编辑",
      "Learn More": "了解更多",
      "Upload image": "上传图片",
      Remove: "移除",
      "Claim handle": "认领用户名",
      "Add link": "添加链接",
      Save: "保存",
      System: "跟随系统",
      "Cursor Light": "Cursor 浅色",
      "Cursor Dark": "Cursor 深色",
      Revoke: "撤销授权",
      Prev: "上一页",
      Next: "下一页",
      "Log Out": "退出登录",
      Delete: "删除",
      "Adjust Plan": "调整套餐",
      Disabled: "已停用",
      "Manage in Stripe": "前往 Stripe 管理",
      Item: "项目",
      Qty: "数量",
      Download: "下载",
      Description: "说明",
      Status: "状态",
      Amount: "金额",
      Invoice: "发票",
      View: "查看",
      Cancel: "取消",
    });

    const monthNumbers = Object.freeze({
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    });

    function clock24(hourValue, minuteValue, meridiemValue) {
      let hour = Number(hourValue);
      const minute = Number(minuteValue);
      const meridiem = String(meridiemValue || "").toUpperCase();
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
      if (meridiem === "AM" && hour === 12) hour = 0;
      if (meridiem === "PM" && hour < 12) hour += 12;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function translate(value) {
      const original = String(value || "");
      const text = original
        .trim()
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]{2,}/g, " ");
      if (!text || protectedNames.has(text)) return original;

      if (/^Created with Highcharts\b/i.test(text)) return original;

      if (Object.prototype.hasOwnProperty.call(phrases, text)) {
        return phrases[text];
      }

      const includedPlan = text.match(/^Included in (.+)$/i);
      if (includedPlan) return `${includedPlan[1].trim()} 套餐内包含`;

      const monthlyPrice = text.match(/^\$([\d,.]+)\/(mo\.?|user\/mo\.?)$/i);
      if (monthlyPrice) {
        return monthlyPrice[2].toLowerCase().startsWith("user")
          ? `$${monthlyPrice[1]}/用户/月`
          : `$${monthlyPrice[1]}/月`;
      }

      const percentUsed = text.match(/^(\d+(?:\.\d+)?)%\s+used$/i);
      if (percentUsed) return `已使用 ${percentUsed[1]}%`;

      const daysLeft = text.match(/^\(?(\d+)\s+days?\s+left\)?$/i);
      if (daysLeft) return `（剩余 ${daysLeft[1]} 天）`;

      const annualSaving = text.match(/^Save\s+(\d+(?:\.\d+)?)%\s+when billed annually$/i);
      if (annualSaving) return `按年计费可节省 ${annualSaving[1]}%`;

      const everythingInPlan = text.match(/^Everything in (.+)$/i);
      if (everythingInPlan) return `${everythingInPlan[1].trim()} 的全部功能`;

      const usageMultiplier = text.match(/^(\d+)x usage limits on Agent$/i);
      if (usageMultiplier) return `Agent 用量上限提高到 ${usageMultiplier[1]} 倍`;

      const upgradePlan = text.match(/^Upgrade to (.+)$/i);
      if (upgradePlan) return `升级到 ${upgradePlan[1].trim()}`;

      const currentPlan = text.match(/^(?:Your|Current) plan:\s*(.+)$/i);
      if (currentPlan) return `当前套餐：${currentPlan[1].trim()}`;

      const namedPlan = text.match(/^(.+?) plan$/i);
      if (namedPlan && protectedNames.has(namedPlan[1].trim())) {
        return `${namedPlan[1].trim()} 套餐`;
      }

      const dateRange = text.match(
        /^([A-Za-z]+)\s+(\d{1,2})\s*[-–—]\s*([A-Za-z]+)\s+(\d{1,2})$/,
      );
      if (dateRange) {
        const startMonth = monthNumbers[dateRange[1].toLowerCase()];
        const endMonth = monthNumbers[dateRange[3].toLowerCase()];
        if (startMonth && endMonth) {
          return `${startMonth}月${Number(dateRange[2])}日 – ${endMonth}月${Number(dateRange[4])}日`;
        }
      }

      const monthDayYear = text.match(
        /^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/,
      );
      if (monthDayYear) {
        const month = monthNumbers[monthDayYear[1].toLowerCase()];
        if (month) {
          const year = monthDayYear[3] ? `${monthDayYear[3]}年` : "";
          return `${year}${month}月${Number(monthDayYear[2])}日`;
        }
      }

      const monthOnly = monthNumbers[text.toLowerCase()];
      if (monthOnly) return `${monthOnly}月`;

      const timestamp = text.match(
        /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i,
      );
      if (timestamp) {
        const month = monthNumbers[timestamp[1].toLowerCase()];
        if (month) {
          return `${month}月${Number(timestamp[2])}日 ${clock24(timestamp[3], timestamp[4], timestamp[5])}`;
        }
      }

      const fullUtcTimestamp = text.match(
        /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)\s+UTC$/i,
      );
      if (fullUtcTimestamp) {
        const month = monthNumbers[fullUtcTimestamp[1].toLowerCase()];
        if (month) {
          const clock = clock24(
            fullUtcTimestamp[4],
            fullUtcTimestamp[5],
            fullUtcTimestamp[7],
          );
          const seconds = fullUtcTimestamp[6]
            ? `:${fullUtcTimestamp[6]}`
            : "";
          return `${fullUtcTimestamp[3]}年${month}月${Number(fullUtcTimestamp[2])}日 ${clock}${seconds} UTC`;
        }
      }

      const showingUsage = text.match(
        /^Showing token usage and costs from (.+?) to (.+?)\. Use filters to narrow results by date range\.$/i,
      );
      if (showingUsage) {
        return `显示 ${showingUsage[1]} 至 ${showingUsage[2]} 的 Token 用量与费用。可使用筛选器缩小日期范围。`;
      }

      const groupBy = text.match(/^Group By:\s*(.+)$/i);
      if (groupBy) {
        const labels = { Model: "模型", User: "用户", Type: "类型", Date: "日期" };
        return `分组：${labels[groupBy[1]] || groupBy[1]}`;
      }

      const copySection = text.match(
        /^Copy link to (.+?) and scroll to section$/i,
      );
      if (copySection) {
        return `复制“${translate(copySection[1])}”区域链接`;
      }

      const relativeTime = text.match(
        /^(?:About\s+)?(\d+)\s+(minute|hour|day|week|month)s?\s+ago$/i,
      );
      if (relativeTime) {
        const units = {
          minute: "分钟",
          hour: "小时",
          day: "天",
          week: "周",
          month: "个月",
        };
        return `${relativeTime[1]} ${units[relativeTime[2].toLowerCase()]}前`;
      }

      const pageRange = text.match(/^Showing\s+(\d+)-(\d+)\s+of\s+(\d+)$/i);
      if (pageRange) {
        return `显示第 ${pageRange[1]}–${pageRange[2]} 项，共 ${pageRange[3]} 项`;
      }

      const completedCount = text.match(/^(\d+)\/(\d+)\s+Completed$/i);
      if (completedCount) {
        return `已完成 ${completedCount[1]}/${completedCount[2]}`;
      }

      const dayCount = text.match(/^(\d+)d$/i);
      if (dayCount) return `${dayCount[1]}天`;

      const runCount = text.match(/^(\d+)\s+runs?$/i);
      if (runCount) return `${runCount[1]} 次运行`;

      const rows = text.match(/^Rows:\s*(\d+)$/i);
      if (rows) return `每页：${rows[1]} 行`;

      const cycleStart = text.match(/^Cycle Starting\s+(.+)$/i);
      if (cycleStart) return `周期开始于 ${translate(cycleStart[1])}`;

      const useTemplate = text.match(/^Use\s+(.+?)\s+template$/i);
      if (useTemplate) return `使用“${translate(useTemplate[1])}”模板`;

      const recentDays = text.match(/^Last\s+(\d+)\s+days?$/i);
      if (recentDays) return `最近 ${recentDays[1]} 天`;

      return original;
    }

    return Object.freeze({ translate });
  })();
  // END CURSOR_TRANSLATIONS

  const ClaudeUsageWidget = (() => {
    "use strict";

    const provider = isChatGPTSite ? "chatgpt" : "claude";
    const panelTitle =
      provider === "chatgpt" ? "ChatGPT 使用限制" : "Claude 用量监控";
    const positionStorageKey =
      provider === "chatgpt"
        ? "claude2cn-chatgpt-usage-position"
        : "claude-usage-position";

    let orgId = null;
    let autoRefreshTimer = null;
    let refreshInterval = null;
    let countdownTimer = null;
    let isHovered = false;
    let panel = null;
    let claudeShadow = null;
    let chatgptShadow = null;
    let claudeWidgetState = "collapsed";
    let claudeAutoCollapseTimer = null;
    let claudeDocumentClickHandler = null;
    let claudeKeyHandler = null;
    let isDragging = false;
    // ChatGPT 浮窗定位：水平永远吸附左/右边缘（与 Claude 的贴边一致），
    // 拖动只保留垂直位置与停靠边，不再记忆任意悬空坐标。
    let savedPosition = { top: 50, isRight: true };

    const claudeSettingsStorageKey = "claude-usage-monitor:settings:v1";
    const defaultClaudeSettings = Object.freeze({
      autoCollapse: true,
      autoCollapseDelay: 4000,
      showResetTime: true,
      verticalPosition: "top",
      lastVisibleState: "collapsed",
    });
    let claudeSettings = { ...defaultClaudeSettings };

    let usageData = {
      provider,
      fiveHour: null,
      sevenDay: null,
      modelLimits: [],
      resetCredits: null,
      planName: "",
      lastFetch: null,
      fetchError: null,
    };

    const _origFetch = window.fetch.bind(window);

    function hookFetch() {
      window.fetch = function (...args) {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "";
        captureOrgId(url);
        return _origFetch(...args);
      };

      const _origXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === "string") captureOrgId(url);
        return _origXHROpen.call(this, method, url, ...rest);
      };
    }

    function captureOrgId(url) {
      if (!url) return;
      const m = url.match(
        /\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      if (!m) return;
      const newId = m[1];
      if (orgId !== newId) {
        orgId = newId;
        console.log("[Claude用量] orgId 已获取:", orgId);
      }
      if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
      autoRefreshTimer = setTimeout(fetchUsage, 600);
    }

    async function discoverOrgId() {
      if (provider !== "claude") return true;
      if (orgId) return true;
      const candidates = [
        "https://claude.ai/api/bootstrap",
        // "https://claude.ai/api/organizations",
      ];
      for (const url of candidates) {
        try {
          const res = await _origFetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const str = JSON.stringify(data);
          const m = str.match(
            /"(?:uuid|id|organization_id)"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i,
          );
          if (m && !orgId) {
            orgId = m[1];
            console.log(`[Claude用量] 从 ${url} 获取 orgId`, orgId);
            return true;
          }
        } catch {}
      }
      return false;
    }

    function createPanel() {
      if (provider === "claude") return createClaudePanel();
      return createChatGPTPanel();
    }

    function createChatGPTPanel() {
      const host = document.createElement("div");
      host.id = "claude-usage-panel-bottom";
      host.setAttribute("data-chatgpt-usage-widget", "v3");
      host.title = panelTitle;
      chatgptShadow = host.attachShadow({ mode: "open" });
      chatgptShadow.innerHTML = `
        <style>
          ${widgetSharedStyles()}
          /* ChatGPT 面板：水平吸边 + 垂直拖动，浮窗整体可拖拽 */
          :host { touch-action: none; cursor: move; }
          .compact-card { cursor: move; }
          /* 收起态重置行：票券小图标与 7d 缩写同列同宽，保持两列网格 */
          .compact-label svg { width: 13px; height: 13px; }
          /* 左侧停靠时卡片从左缘生长，离场卡也贴左对齐 */
          :host([data-dock="left"]) .usage-widget { justify-content: flex-start; }
          :host([data-dock="left"]) .compact-card, :host([data-dock="left"]) .expanded-card { transform-origin: top left; }
          :host([data-dock="left"]) .compact-card.is-off, :host([data-dock="left"]) .expanded-card.is-off { right: auto; left: 0; }
          .title-badge { background: linear-gradient(135deg, #1fc39a, #0d8a6a); }
          .plan-badge { max-width: 96px; overflow: hidden; text-overflow: ellipsis; }
          .credit-list { flex: 0 0 auto; border-top: 1px solid var(--cu-divider); }
          .credit-item .quota-meta { margin-bottom: 0; }
          .credit-note {
            margin: 8px 0 0 33px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            color: var(--cu-text-tertiary);
            font-size: 12px;
            font-variant-numeric: tabular-nums;
          }
        </style>
        <div class="usage-widget" data-state="collapsed">
          <button class="compact-card" type="button" data-action="expand" aria-label="展开 ChatGPT 用量详情">
            <span class="compact-list"></span>
            <span class="compact-status">正在获取额度…</span>
          </button>
          <section class="expanded-card is-off" aria-label="ChatGPT 用量详情">
            <header class="widget-header">
              <div class="widget-title"><span class="title-badge">${claudeIcon("boltFilled")}</span><span>ChatGPT 用量</span></div>
              <span class="quota-badge plan-badge" hidden></span>
            </header>
            <div class="quota-list"></div>
            <div class="expanded-status">正在获取额度…</div>
            <div class="credit-list" hidden></div>
            <footer class="widget-footer">
              <span class="reset-time">${claudeIcon("refresh")}<span>重置时间：</span><time>--/-- -- --:--</time></span>
            </footer>
          </section>
        </div>`;
      panel = host;
      const compact = chatgptShadow.querySelector('[data-action="expand"]');
      compact.addEventListener("click", () => setChatGPTWidgetState(true));
      applyChatGPTPosition();
      return host;
    }

    // 水平永远贴边（左或右 8px），只有垂直位置与停靠边可调，与 Claude 的贴边一致。
    function applyChatGPTPosition(host = panel) {
      if (!host) return;
      const margin = getPanelMetrics().defaultRight;
      const maxTop = Math.max(
        margin,
        window.innerHeight - (host.offsetHeight || 120) - margin,
      );
      const top = Math.min(
        Math.max(margin, Number(savedPosition.top) || 50),
        maxTop,
      );
      host.style.top = top + "px";
      host.style.bottom = "auto";
      host.setAttribute("data-dock", savedPosition.isRight ? "right" : "left");
      if (savedPosition.isRight) {
        host.style.right = margin + "px";
        host.style.left = "auto";
      } else {
        host.style.left = margin + "px";
        host.style.right = "auto";
      }
    }

    function setChatGPTWidgetState(expanded) {
      if (!chatgptShadow || !panel) return;
      if (Boolean(expanded) === isHovered) return;
      isHovered = Boolean(expanded);
      const widget = chatgptShadow.querySelector(".usage-widget");
      widget.dataset.state = isHovered ? "expanded" : "collapsed";
      chatgptShadow
        .querySelector(".compact-card")
        .classList.toggle("is-off", isHovered);
      chatgptShadow
        .querySelector(".expanded-card")
        .classList.toggle("is-off", !isHovered);
    }

    function loadClaudeSettings() {
      try {
        const saved = JSON.parse(
          localStorage.getItem(claudeSettingsStorageKey) || "{}",
        );
        const delay = [2000, 4000, 8000].includes(saved.autoCollapseDelay)
          ? saved.autoCollapseDelay
          : defaultClaudeSettings.autoCollapseDelay;
        const verticalPosition = ["top", "center", "bottom"].includes(
          saved.verticalPosition,
        )
          ? saved.verticalPosition
          : defaultClaudeSettings.verticalPosition;
        const lastVisibleState = ["collapsed", "expanded"].includes(
          saved.lastVisibleState,
        )
          ? saved.lastVisibleState
          : defaultClaudeSettings.lastVisibleState;
        return {
          autoCollapse:
            typeof saved.autoCollapse === "boolean"
              ? saved.autoCollapse
              : defaultClaudeSettings.autoCollapse,
          autoCollapseDelay: delay,
          showResetTime:
            typeof saved.showResetTime === "boolean"
              ? saved.showResetTime
              : defaultClaudeSettings.showResetTime,
          verticalPosition,
          lastVisibleState,
        };
      } catch {
        return { ...defaultClaudeSettings };
      }
    }

    function saveClaudeSettings() {
      try {
        localStorage.setItem(
          claudeSettingsStorageKey,
          JSON.stringify(claudeSettings),
        );
      } catch {}
    }

    function claudeIcon(name) {
      // Tabler Icons 风格的内嵌线性图标；不依赖外部 CDN。
      const paths = {
        bolt: '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
        boltFilled:
          '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" fill="currentColor" stroke="none"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
        calendar:
          '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
        sparkles:
          '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"/><path d="M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"/><path d="M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
        ticket:
          '<path d="M15 5l0 2"/><path d="M15 11l0 2"/><path d="M15 17l0 2"/><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"/>',
        close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
        refresh:
          '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
        settings:
          '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
      };
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
    }

    function generatedClaudeIcon(name, className = "generated-icon") {
      const source = globalThis.CLAUDE_USAGE_ICON_ASSETS?.[name];
      return typeof source === "string"
        ? `<img class="${className}" src="${source}" alt="" aria-hidden="true" decoding="async">`
        : "";
    }

    const claudeQuotaIcons = {
      fiveHour: "clock",
      sevenDay: "calendar",
      fableFive: "sparkles",
      model: "sparkles",
    };

    // Claude 与 ChatGPT 浮窗共用的设计语言：变量、明暗主题、收起/展开卡片、
    // 额度条目、过渡动画。各自的定位与专属控件在 create*Panel 里追加。
    function widgetSharedStyles() {
      return `
          :host {
            --cu-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            --cu-bg: rgba(255, 255, 255, 0.96);
            --cu-bg-soft: rgba(32, 33, 36, 0.05);
            --cu-text: #1f2124;
            --cu-text-secondary: #6d7176;
            --cu-text-tertiary: #989ba1;
            --cu-border: rgba(32, 33, 36, 0.08);
            --cu-divider: rgba(32, 33, 36, 0.06);
            --cu-shadow: 0 10px 28px rgba(31, 35, 41, 0.10), 0 1px 3px rgba(31, 35, 41, 0.05);
            --cu-danger: #ef493d;
            --cu-transition: 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
            position: fixed;
            z-index: 2147483000;
            color: var(--cu-text);
            font-family: var(--cu-font);
            font-size: 13px;
            line-height: 1.4;
            color-scheme: light;
            user-select: none;
          }
          :host([data-theme="dark"]) {
            --cu-bg: rgba(38, 39, 42, 0.96);
            --cu-bg-soft: rgba(255, 255, 255, 0.065);
            --cu-text: #f2f3f5;
            --cu-text-secondary: #b5b8bd;
            --cu-text-tertiary: #8f9399;
            --cu-border: rgba(255, 255, 255, 0.10);
            --cu-divider: rgba(255, 255, 255, 0.07);
            --cu-shadow: 0 10px 30px rgba(0, 0, 0, 0.38), 0 1px 3px rgba(0, 0, 0, 0.25);
            color-scheme: dark;
          }
          *, *::before, *::after { box-sizing: border-box; }
          button, select, input { font: inherit; }
          button { color: inherit; }
          [hidden] { display: none !important; }
          svg { width: 18px; height: 18px; display: block; }
          img { display: block; }
          .generated-icon { width: 18px; height: 18px; object-fit: contain; }
          .usage-widget { position: relative; display: flex; justify-content: flex-end; }
          /* 收起/展开互斥卡片：离场卡绝对定位叠在原地做淡出，在场卡撑起浮窗尺寸 */
          .compact-card, .expanded-card {
            transform-origin: top right;
            transition: opacity var(--cu-transition), transform var(--cu-transition), box-shadow var(--cu-transition), visibility 0s linear 0s;
          }
          .compact-card.is-off, .expanded-card.is-off {
            position: absolute;
            top: 0;
            right: 0;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: scale(0.96) translateY(-6px);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 200ms;
          }
          .compact-card {
            width: 96px;
            padding: 7px;
            display: grid;
            gap: 5px;
            border: 1px solid var(--cu-border);
            border-radius: 13px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(12px) saturate(1.05);
            -webkit-backdrop-filter: blur(12px) saturate(1.05);
            cursor: pointer;
          }
          .compact-card:hover { transform: translateY(-1px); }
          .compact-card:focus-visible, .icon-button:focus-visible, .setting-control:focus-visible, .reset-settings:focus-visible {
            outline: 2px solid #4285f4;
            outline-offset: 2px;
          }
          .compact-list { display: grid; gap: 5px; }
          .compact-row {
            min-height: 30px;
            padding: 0 9px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 40px;
            align-items: center;
            gap: 5px;
            border-radius: 9px;
            background: var(--cu-bg-soft);
          }
          .compact-row[data-danger] { background: var(--quota-soft, var(--cu-bg-soft)); }
          .compact-label { min-width: 0; justify-self: end; color: var(--cu-text-secondary); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
          .compact-percent { width: 40px; justify-self: end; color: var(--quota-color); font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
          .compact-status { min-height: 30px; display: grid; place-items: center; color: var(--cu-text-secondary); font-size: 12px; }
          .expanded-card {
            width: min(304px, calc(100vw - 24px));
            max-height: calc(100vh - 32px);
            display: flex;
            overflow: hidden;
            flex-direction: column;
            border: 1px solid var(--cu-border);
            border-radius: 16px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(12px) saturate(1.05);
            -webkit-backdrop-filter: blur(12px) saturate(1.05);
          }
          .widget-header {
            flex: 0 0 auto;
            min-height: 48px;
            padding: 0 11px 0 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--cu-divider);
          }
          .widget-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
          .title-badge {
            width: 20px;
            height: 20px;
            display: grid;
            place-items: center;
            border-radius: 6px;
            color: #fff;
          }
          .title-badge svg { width: 12px; height: 12px; }
          .title-badge.generated { background: transparent !important; }
          .title-badge .generated-title-icon { width: 20px; height: 20px; object-fit: contain; }
          .icon-button {
            width: 32px;
            height: 32px;
            padding: 7px;
            display: grid;
            place-items: center;
            border: 0;
            border-radius: 9px;
            background: transparent;
            color: var(--cu-text-secondary);
            cursor: pointer;
          }
          .icon-button:hover { background: var(--cu-bg-soft); color: var(--cu-text); }
          .quota-badge {
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 11px;
            color: var(--cu-text-secondary);
            background: var(--cu-bg-soft);
            white-space: nowrap;
          }
          .quota-list { flex: 1 1 auto; overflow-y: auto; padding: 3px 0 4px; }
          .quota-item { padding: 11px 14px 12px; }
          .quota-meta {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            column-gap: 9px;
            margin-bottom: 9px;
          }
          .quota-icon {
            width: 24px;
            height: 24px;
            display: grid;
            place-items: center;
            border-radius: 7px;
            background: var(--quota-soft);
            background: color-mix(in srgb, var(--quota-color) 13%, transparent);
            color: var(--quota-color);
          }
          :host([data-theme="dark"]) .quota-icon { background: var(--quota-soft); background: color-mix(in srgb, var(--quota-color) 22%, transparent); }
          .quota-icon svg { width: 14px; height: 14px; stroke-width: 2; }
          .quota-icon.generated { background: transparent !important; }
          .quota-icon .generated-quota-icon { width: 24px; height: 24px; object-fit: contain; }
          .quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cu-text); font-size: 13px; font-weight: 550; }
          .quota-remaining { color: var(--cu-text-tertiary); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .quota-value-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 14px; }
          .quota-track {
            height: 6px;
            overflow: hidden;
            border-radius: 999px;
            background: var(--quota-soft);
            background: color-mix(in srgb, var(--quota-color) 15%, transparent);
          }
          :host([data-theme="dark"]) .quota-track { background: var(--quota-soft); background: color-mix(in srgb, var(--quota-color) 24%, transparent); }
          .quota-fill { width: var(--remaining-percent); height: 100%; border-radius: inherit; background: var(--quota-color); transition: width 300ms ease; }
          .quota-percent { min-width: 52px; text-align: right; color: var(--quota-color); font-size: 22px; line-height: 1; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
          .expanded-status { min-height: 132px; display: grid; place-items: center; padding: 24px; color: var(--cu-text-secondary); text-align: center; }
          .widget-footer {
            flex: 0 0 auto;
            min-height: 44px;
            padding: 0 10px 0 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-top: 1px solid var(--cu-divider);
            color: var(--cu-text-secondary);
          }
          .reset-time { min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
          .reset-time svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--cu-text-tertiary); }
          .reset-time .generated-icon { width: 18px; height: 18px; flex: 0 0 auto; }
          .reset-time time { font-variant-numeric: tabular-nums; color: var(--cu-text-secondary); }
          .usage-tooltip {
            position: absolute;
            right: calc(100% + 8px);
            z-index: 3;
            width: max-content;
            max-width: 250px;
            padding: 8px 10px;
            border: 1px solid var(--cu-border);
            border-radius: 9px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            color: var(--cu-text-secondary);
            font-size: 11px;
            line-height: 1.55;
            pointer-events: none;
            white-space: normal;
          }
          @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; } }
      `;
    }

    function createClaudePanel() {
      claudeSettings = loadClaudeSettings();
      // 窄视口（<900px）一律从收起态开始，避免展开卡遮挡正文。
      claudeWidgetState =
        window.innerWidth < 900 ? "collapsed" : claudeSettings.lastVisibleState;
      const host = document.createElement("div");
      host.id = "claude-usage-panel-bottom";
      host.setAttribute("data-claude-usage-widget", "v2");
      claudeShadow = host.attachShadow({ mode: "open" });
      claudeShadow.innerHTML = `
        <style>
          ${widgetSharedStyles()}
          :host { top: 96px; right: 12px; }
          :host([data-anchor="bottom"]) .compact-card, :host([data-anchor="bottom"]) .expanded-card { transform-origin: bottom right; }
          :host([data-anchor="bottom"]) .compact-card.is-off, :host([data-anchor="bottom"]) .expanded-card.is-off {
            top: auto;
            bottom: 0;
            transform: scale(0.96) translateY(6px);
          }
          .widget-header { cursor: pointer; }
          .title-badge { background: linear-gradient(135deg, #ff8a5c, #ff5f2e); }
          .settings-popover {
            position: absolute;
            top: 56px;
            right: 12px;
            z-index: 2;
            width: 256px;
            padding: 14px;
            border: 1px solid var(--cu-border);
            border-radius: 14px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(14px) saturate(1.05);
            -webkit-backdrop-filter: blur(14px) saturate(1.05);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 0s;
          }
          .settings-popover.is-off {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-4px) scale(0.98);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 200ms;
          }
          .settings-title { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
          .setting-row { min-height: 38px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; color: var(--cu-text-secondary); font-size: 12px; }
          .setting-control { min-width: 76px; accent-color: #4285f4; }
          .setting-row select { padding: 4px 7px; border: 1px solid var(--cu-border); border-radius: 7px; background: var(--cu-bg-soft); color: var(--cu-text); }
          .reset-settings { width: 100%; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--cu-border); border-radius: 9px; background: var(--cu-bg-soft); color: var(--cu-text-secondary); cursor: pointer; }
          @media (max-width: 640px) { :host { display: none; } }
        </style>
        <div class="usage-widget" data-state="collapsed">
          <button class="compact-card" type="button" data-action="expand" aria-label="展开 Claude 用量详情">
            <span class="compact-list"></span>
            <span class="compact-status">正在获取额度…</span>
          </button>
          <section class="expanded-card is-off" aria-label="Claude 用量详情">
            <header class="widget-header" data-action="collapse" title="点击空白区域收起">
              <div class="widget-title"><span class="title-badge generated">${generatedClaudeIcon("bolt", "generated-title-icon")}</span><span>Claude 用量</span></div>
              <button class="icon-button" type="button" data-action="hide" aria-label="关闭用量浮窗">${generatedClaudeIcon("close")}</button>
            </header>
            <div class="quota-list"></div>
            <div class="expanded-status">正在获取额度…</div>
            <footer class="widget-footer">
              <span class="reset-time">${generatedClaudeIcon("refresh")}<span>重置时间：</span><time>--/-- -- --:--</time></span>
              <button class="icon-button" type="button" data-action="settings" aria-label="用量浮窗设置">${generatedClaudeIcon("settings")}</button>
            </footer>
            <div class="settings-popover is-off">
              <h3 class="settings-title">浮窗设置</h3>
              <label class="setting-row"><span>自动收起</span><input class="setting-control" data-setting="autoCollapse" type="checkbox"></label>
              <label class="setting-row"><span>收起延迟</span><select class="setting-control" data-setting="autoCollapseDelay"><option value="2000">2 秒</option><option value="4000">4 秒</option><option value="8000">8 秒</option></select></label>
              <label class="setting-row"><span>显示重置时间</span><input class="setting-control" data-setting="showResetTime" type="checkbox"></label>
              <label class="setting-row"><span>垂直位置</span><select class="setting-control" data-setting="verticalPosition"><option value="top">顶部</option><option value="center">居中</option><option value="bottom">底部</option></select></label>
              <button class="reset-settings" type="button" data-action="reset-settings">恢复默认设置</button>
            </div>
          </section>
          <div class="usage-tooltip" role="tooltip" hidden></div>
        </div>`;
      panel = host;
      bindClaudePanelEvents(host);
      applyClaudePosition(host);
      setClaudeWidgetState(claudeWidgetState, false);
      return host;
    }

    function applyClaudePosition(host = panel) {
      if (!host) return;
      host.style.left = "auto";
      host.style.right = "12px";
      host.style.top = "auto";
      host.style.bottom = "auto";
      host.style.transform = "none";
      // data-anchor 决定离场卡片的对齐边与缩放方向（底部锚定时向上展开）。
      host.setAttribute("data-anchor", claudeSettings.verticalPosition === "bottom" ? "bottom" : "top");
      if (claudeSettings.verticalPosition === "center") {
        host.style.top = "50%";
        host.style.transform = "translateY(-50%)";
      } else if (claudeSettings.verticalPosition === "bottom") {
        host.style.bottom = "24px";
      } else {
        host.style.top = "96px";
      }
    }

    function clearClaudeAutoCollapse() {
      if (claudeAutoCollapseTimer) clearTimeout(claudeAutoCollapseTimer);
      claudeAutoCollapseTimer = null;
    }

    function scheduleClaudeAutoCollapse() {
      clearClaudeAutoCollapse();
      if (
        !claudeSettings.autoCollapse ||
        claudeWidgetState !== "expanded"
      )
        return;
      claudeAutoCollapseTimer = setTimeout(
        () => setClaudeWidgetState("collapsed"),
        claudeSettings.autoCollapseDelay,
      );
    }

    function setClaudeWidgetState(nextState, persist = true) {
      if (!claudeShadow || !panel) return;
      const allowed = ["collapsed", "expanded", "settings", "hidden"];
      const next = allowed.includes(nextState) ? nextState : "collapsed";
      claudeWidgetState = next;
      clearClaudeAutoCollapse();

      const widget = claudeShadow.querySelector(".usage-widget");
      const compact = claudeShadow.querySelector(".compact-card");
      const expanded = claudeShadow.querySelector(".expanded-card");
      const settings = claudeShadow.querySelector(".settings-popover");
      widget.dataset.state = next;
      panel.style.display = next === "hidden" ? "none" : "";
      // is-off 通过 opacity/transform/visibility 过渡离场，替代 hidden 的瞬间切换。
      compact.classList.toggle("is-off", next !== "collapsed");
      expanded.classList.toggle("is-off", !["expanded", "settings"].includes(next));
      settings.classList.toggle("is-off", next !== "settings");

      if (["collapsed", "expanded"].includes(next)) {
        claudeSettings.lastVisibleState = next;
      } else if (next === "settings") {
        claudeSettings.lastVisibleState = "expanded";
      }
      if (persist) saveClaudeSettings();
    }

    function updateClaudeSettingsControls() {
      if (!claudeShadow) return;
      claudeShadow.querySelector('[data-setting="autoCollapse"]').checked =
        claudeSettings.autoCollapse;
      claudeShadow.querySelector(
        '[data-setting="autoCollapseDelay"]',
      ).value = String(claudeSettings.autoCollapseDelay);
      claudeShadow.querySelector('[data-setting="showResetTime"]').checked =
        claudeSettings.showResetTime;
      claudeShadow.querySelector(
        '[data-setting="verticalPosition"]',
      ).value = claudeSettings.verticalPosition;
    }

    function registerClaudeMenuCommands() {
      const register =
        typeof globalThis.GM_registerMenuCommand === "function"
          ? globalThis.GM_registerMenuCommand
          : typeof globalThis.GM?.registerMenuCommand === "function"
            ? globalThis.GM.registerMenuCommand.bind(globalThis.GM)
            : null;
      if (!register) return;
      register("显示 Claude 用量监控", () =>
        setClaudeWidgetState("collapsed"),
      );
      register("隐藏 Claude 用量监控", () =>
        setClaudeWidgetState("hidden"),
      );
      register("恢复用量浮窗默认设置", () => {
        claudeSettings = { ...defaultClaudeSettings };
        saveClaudeSettings();
        applyClaudePosition();
        updateClaudeSettingsControls();
        setClaudeWidgetState("collapsed");
        renderClaudePanel();
      });
    }

    function bindClaudePanelEvents(host) {
      const compact = claudeShadow.querySelector('[data-action="expand"]');
      const header = claudeShadow.querySelector(".widget-header");
      compact.addEventListener("mouseenter", () =>
        setClaudeWidgetState("expanded"),
      );
      compact.addEventListener("click", () =>
        setClaudeWidgetState("expanded"),
      );
      header.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        setClaudeWidgetState("collapsed");
      });
      claudeShadow
        .querySelector('[data-action="hide"]')
        .addEventListener("click", () => setClaudeWidgetState("hidden"));
      claudeShadow
        .querySelector('[data-action="settings"]')
        .addEventListener("click", () => setClaudeWidgetState("settings"));
      claudeShadow
        .querySelector('[data-action="reset-settings"]')
        .addEventListener("click", () => {
          claudeSettings = { ...defaultClaudeSettings };
          saveClaudeSettings();
          applyClaudePosition(host);
          updateClaudeSettingsControls();
          setClaudeWidgetState("expanded");
          renderClaudePanel();
        });

      claudeShadow
        .querySelector('[data-setting="autoCollapse"]')
        .addEventListener("change", (event) => {
          claudeSettings.autoCollapse = event.target.checked;
          saveClaudeSettings();
        });
      claudeShadow
        .querySelector('[data-setting="autoCollapseDelay"]')
        .addEventListener("change", (event) => {
          claudeSettings.autoCollapseDelay = Number(event.target.value);
          saveClaudeSettings();
        });
      claudeShadow
        .querySelector('[data-setting="showResetTime"]')
        .addEventListener("change", (event) => {
          claudeSettings.showResetTime = event.target.checked;
          saveClaudeSettings();
          renderClaudePanel();
        });
      claudeShadow
        .querySelector('[data-setting="verticalPosition"]')
        .addEventListener("change", (event) => {
          claudeSettings.verticalPosition = event.target.value;
          saveClaudeSettings();
          applyClaudePosition(host);
        });

      host.addEventListener("mouseenter", clearClaudeAutoCollapse);
      host.addEventListener("mouseleave", scheduleClaudeAutoCollapse);
      claudeDocumentClickHandler = (event) => {
        if (claudeWidgetState === "hidden" || host.contains(event.target)) return;
        if (claudeWidgetState === "settings") {
          setClaudeWidgetState("expanded");
        } else if (claudeWidgetState === "expanded") {
          setClaudeWidgetState("collapsed");
        }
      };
      claudeKeyHandler = (event) => {
        if (event.altKey && event.shiftKey && event.key.toLowerCase() === "u") {
          setClaudeWidgetState("collapsed");
          return;
        }
        if (event.key !== "Escape") return;
        if (claudeWidgetState === "settings") {
          setClaudeWidgetState("expanded");
        } else if (claudeWidgetState === "expanded") {
          setClaudeWidgetState("collapsed");
        }
      };
      document.addEventListener("click", claudeDocumentClickHandler);
      document.addEventListener("keydown", claudeKeyHandler);
      updateClaudeSettingsControls();
      registerClaudeMenuCommands();
    }

    // 剩余额度四档配色：直接以 remaining 判断，避免 46% 等中低额度
    // 因“已用量 < 60%”而仍显示绿色。额度类型继续由条目图标区分。
    function quotaHealthColors(remaining) {
      const value = Math.max(0, Math.min(100, Number(remaining) || 0));
      if (value >= 80) return ["#18b96b", "rgba(24, 185, 107, 0.14)"];
      if (value >= 60) return ["#4285f4", "rgba(66, 133, 244, 0.14)"];
      if (value >= 40) return ["#ff6b3d", "rgba(255, 107, 61, 0.14)"];
      return ["#ef493d", "rgba(239, 73, 61, 0.14)"];
    }

    function getClaudeViewRows() {
      return getUsageRows()
        .filter(
          (row) =>
            row.key === "primary" ||
            row.key === "secondary" ||
            /^Fable 5$/i.test(row.title || ""),
        )
        .map((row) => {
          const used = pct(row.utilization);
          const remaining = 100 - used;
          const isFable = /^Fable 5$/i.test(row.title || "");
          const type =
            row.key === "primary"
              ? "fiveHour"
              : row.key === "secondary"
                ? "sevenDay"
                : isFable
                  ? "fableFive"
                  : "model";
          const shortLabel =
            type === "fiveHour"
              ? "5h"
              : type === "sevenDay"
                ? "7d"
                : type === "fableFive"
                  ? "F5"
                  : row.short;
          const fullLabel =
            type === "fiveHour"
              ? "5 小时窗口"
              : type === "sevenDay"
                ? "7 天配额"
                : type === "fableFive"
                  ? "Fable 5 · 7 天配额"
                  : row.label;
          const [color, softColor] = quotaHealthColors(remaining);
          const assetIconName = {
            fiveHour: "clock",
            sevenDay: "calendar",
            fableFive: "brain",
            model: "brain",
          }[type];
          const countdown = cdText(row.resets_at);
          return {
            ...row,
            type,
            shortLabel,
            fullLabel,
            assetIconName,
            remaining,
            critical: remaining <= 10,
            remainingText: countdown ? `${countdown} 剩余` : "剩余时间待定",
            resetText: fmtExpiryTime(row.resets_at),
            color,
            softColor,
          };
        });
    }

    function showWidgetTooltip(shadow, element) {
      const tooltip = shadow?.querySelector(".usage-tooltip");
      if (!tooltip || !element?.dataset.tooltip) return;
      tooltip.textContent = element.dataset.tooltip;
      tooltip.style.top = `${element.offsetTop}px`;
      tooltip.hidden = false;
    }

    function hideWidgetTooltip(shadow) {
      const tooltip = shadow?.querySelector(".usage-tooltip");
      if (tooltip) tooltip.hidden = true;
    }

    // Claude / ChatGPT 浮窗共用的额度节点增量更新：只改既有 DOM，不重建根。
    function updateQuotaNodes(shadow, rows, { withTooltip = false } = {}) {
      const compactList = shadow.querySelector(".compact-list");
      const quotaList = shadow.querySelector(".quota-list");
      const activeKeys = new Set(rows.map((row) => row.key));
      for (const element of [
        ...compactList.querySelectorAll("[data-quota-key]"),
        ...quotaList.querySelectorAll("[data-quota-key]"),
      ]) {
        if (!activeKeys.has(element.dataset.quotaKey)) element.remove();
      }

      for (const row of rows) {
        let compactRow = compactList.querySelector(
          `[data-quota-key="${row.key}"]`,
        );
        if (!compactRow) {
          compactRow = document.createElement("span");
          compactRow.className = "compact-row";
          compactRow.dataset.quotaKey = row.key;
          compactRow.innerHTML =
            '<span class="compact-label"></span><strong class="compact-percent"></strong>';
          if (withTooltip) {
            compactRow.addEventListener("mouseenter", () =>
              showWidgetTooltip(shadow, compactRow),
            );
            compactRow.addEventListener("mouseleave", () =>
              hideWidgetTooltip(shadow),
            );
          }
          compactList.appendChild(compactRow);
        }
        compactRow.style.setProperty("--quota-color", row.color);
        compactRow.style.setProperty("--quota-soft", row.softColor);
        compactRow.toggleAttribute("data-danger", row.critical);
        compactRow.querySelector(".compact-label").textContent = row.shortLabel;
        compactRow.querySelector(".compact-percent").textContent =
          `${row.remaining}%`;
        compactRow.dataset.tooltip = `${row.fullLabel} · ${row.remainingText} · ${row.resetText} 重置`;
        compactRow.title = compactRow.dataset.tooltip;
        compactList.appendChild(compactRow);

        let quotaItem = quotaList.querySelector(
          `[data-quota-key="${row.key}"]`,
        );
        if (!quotaItem) {
          quotaItem = document.createElement("article");
          quotaItem.className = "quota-item";
          quotaItem.dataset.quotaKey = row.key;
          const usesGeneratedIcon = Boolean(row.assetIconName);
          const quotaIcon = usesGeneratedIcon
            ? generatedClaudeIcon(row.assetIconName, "generated-quota-icon")
            : claudeIcon(row.iconName || claudeQuotaIcons[row.type] || "sparkles");
          quotaItem.innerHTML = `
            <div class="quota-meta"><span class="quota-icon${usesGeneratedIcon ? " generated" : ""}" aria-hidden="true">${quotaIcon}</span><span class="quota-name"></span><span class="quota-remaining"></span></div>
            <div class="quota-value-row"><div class="quota-track" aria-hidden="true"><div class="quota-fill"></div></div><strong class="quota-percent"></strong></div>`;
          quotaList.appendChild(quotaItem);
        }
        quotaItem.style.setProperty("--quota-color", row.color);
        quotaItem.style.setProperty("--quota-soft", row.softColor);
        quotaItem.style.setProperty(
          "--remaining-percent",
          `${row.remaining}%`,
        );
        quotaItem.setAttribute(
          "aria-label",
          `${row.fullLabel}剩余 ${row.remaining}%`,
        );
        quotaItem.querySelector(".quota-name").textContent = row.fullLabel;
        quotaItem.querySelector(".quota-remaining").textContent =
          row.remainingText;
        quotaItem.querySelector(".quota-percent").textContent =
          `${row.remaining}%`;
        quotaList.appendChild(quotaItem);
      }
    }

    function renderClaudePanel() {
      if (!claudeShadow || !panel) return;
      const rows = getClaudeViewRows();
      const compactList = claudeShadow.querySelector(".compact-list");
      const compactStatus = claudeShadow.querySelector(".compact-status");
      const quotaList = claudeShadow.querySelector(".quota-list");
      const expandedStatus = claudeShadow.querySelector(".expanded-status");
      const statusText = usageData.fetchError
        ? usageData.fetchError
        : "正在获取额度…";

      if (rows.length) {
        updateQuotaNodes(claudeShadow, rows, { withTooltip: true });
        compactList.hidden = false;
        compactStatus.hidden = true;
        quotaList.hidden = false;
        expandedStatus.hidden = true;
      } else {
        compactList.hidden = true;
        compactStatus.hidden = false;
        compactStatus.textContent = usageData.fetchError ? "获取失败" : "正在获取…";
        compactStatus.title = statusText;
        quotaList.hidden = true;
        expandedStatus.hidden = false;
        expandedStatus.textContent = statusText;
      }

      const resetAt =
        usageData.sevenDay?.resets_at ??
        usageData.fiveHour?.resets_at ??
        rows[0]?.resets_at ??
        null;
      const resetTime = claudeShadow.querySelector(".reset-time");
      resetTime.hidden = !claudeSettings.showResetTime;
      resetTime.querySelector("time").textContent = fmtExpiryTime(resetAt);
      updateClaudeSettingsControls();
      applyClaudePosition();
    }

    function getChatGPTViewRows() {
      return getUsageRows().map((row) => {
        const used = pct(row.utilization);
        const remaining = 100 - used;
        const isWeekly = row.key === "primary" || row.key === "secondary";
        const type = isWeekly ? "weekly" : "model";
        const [color, softColor] = quotaHealthColors(remaining);
        const countdown = cdText(row.resets_at);
        return {
          ...row,
          type,
          iconName: isWeekly ? "calendar" : "sparkles",
          shortLabel: isWeekly ? row.short || "7d" : row.short,
          fullLabel: isWeekly ? "每周使用限额" : row.title || row.label,
          remaining,
          critical: remaining <= 10,
          remainingText: countdown ? `${countdown} 剩余` : "剩余时间待定",
          resetText: fmtExpiryTime(row.resets_at),
          color,
          softColor,
        };
      });
    }

    // 收起态的重置卡行：额度行之下追加「重置 N」，次数与展开态票券同紫。
    function renderChatGPTCompactCredits() {
      const compactList = chatgptShadow.querySelector(".compact-list");
      const credits = usageData.resetCredits;
      let row = compactList.querySelector("[data-credit-row]");
      if (!credits) {
        row?.remove();
        return;
      }
      if (!row) {
        row = document.createElement("span");
        row.className = "compact-row";
        row.setAttribute("data-credit-row", "");
        // label 用票券小图标而非「重置」文字：与 5h/7d 缩写列同宽，
        // 保持收起卡两列网格的秩序感（2026-07-14 用户反馈）。
        row.innerHTML = `<span class="compact-label" aria-hidden="true">${generatedClaudeIcon("resetCard")}</span><strong class="compact-percent"></strong>`;
      }
      row.style.setProperty(
        "--quota-color",
        credits.availableCount > 0 ? "#8b5cf6" : "var(--cu-text-tertiary)",
      );
      row.querySelector(".compact-percent").textContent =
        `×${credits.availableCount}`;
      row.title = `重置卡 ${credits.availableCount} 次可用 · 最近到期 ${fmtExpiryTime(
        credits.nearestExpiresAt,
      )}`;
      // 额度行每次刷新会重新 append，这里同样移到末尾保持行序稳定。
      compactList.appendChild(row);
    }

    function renderChatGPTCredits() {
      const creditList = chatgptShadow.querySelector(".credit-list");
      const credits = usageData.resetCredits;
      if (!credits) {
        creditList.hidden = true;
        creditList.innerHTML = "";
        return;
      }
      let item = creditList.querySelector(".credit-item");
      if (!item) {
        creditList.innerHTML = `
          <article class="quota-item credit-item" aria-label="重置卡余量">
            <div class="quota-meta"><span class="quota-icon generated" aria-hidden="true">${generatedClaudeIcon("resetCard", "generated-quota-icon")}</span><span class="quota-name">重置卡</span><span class="quota-badge credit-count"></span></div>
            <div class="credit-note"><span>最近到期</span><span class="credit-expiry"></span></div>
          </article>`;
        item = creditList.querySelector(".credit-item");
        item.style.setProperty("--quota-color", "#8b5cf6");
        item.style.setProperty("--quota-soft", "rgba(139, 92, 246, 0.12)");
      }
      item.querySelector(".credit-count").textContent =
        `${credits.availableCount} 次可用`;
      item.querySelector(".credit-expiry").textContent = fmtExpiryTime(
        credits.nearestExpiresAt,
      );
      creditList.hidden = false;
    }

    function renderChatGPTPanel() {
      if (!chatgptShadow || !panel) return;
      const rows = getChatGPTViewRows();
      const compactList = chatgptShadow.querySelector(".compact-list");
      const compactStatus = chatgptShadow.querySelector(".compact-status");
      const quotaList = chatgptShadow.querySelector(".quota-list");
      const expandedStatus = chatgptShadow.querySelector(".expanded-status");
      const statusText = usageData.fetchError
        ? usageData.fetchError
        : "正在获取额度…";

      if (rows.length) {
        updateQuotaNodes(chatgptShadow, rows);
        renderChatGPTCompactCredits();
        compactList.hidden = false;
        compactStatus.hidden = true;
        quotaList.hidden = false;
        expandedStatus.hidden = true;
      } else {
        compactList.hidden = true;
        compactStatus.hidden = false;
        compactStatus.textContent = usageData.fetchError
          ? "获取失败"
          : "正在获取…";
        compactStatus.title = statusText;
        quotaList.hidden = true;
        expandedStatus.hidden = false;
        expandedStatus.textContent = statusText;
      }

      renderChatGPTCredits();

      const planBadge = chatgptShadow.querySelector(".plan-badge");
      const planName = formatPlanName(usageData.planName);
      planBadge.hidden = !planName;
      planBadge.textContent = planName;
      planBadge.title = planName;

      const resetAt =
        usageData.sevenDay?.resets_at ??
        usageData.fiveHour?.resets_at ??
        rows[0]?.resets_at ??
        null;
      chatgptShadow.querySelector(".reset-time time").textContent =
        fmtExpiryTime(resetAt);
    }

    function applyTheme() {
      if (!panel) return;
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      panel.setAttribute("data-theme", isDark ? "dark" : "light");
    }

    function pct(v) {
      return Math.min(100, Math.max(0, Math.round(v || 0)));
    }

    function cdText(ts) {
      const target = UsageParsers.toTimestampMs(ts);
      if (target === null) return "";
      const diff = target - Date.now();
      if (diff <= 0) return "已重置";
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function fmtExpiryTime(ts) {
      const timestamp = UsageParsers.toTimestampMs(ts);
      if (timestamp === null) return "暂无到期时间";
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "暂无到期时间";
      const pad = (value) => String(value).padStart(2, "0");
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function durationLabels(window, fallbackLabel, fallbackShort) {
      const minutes = Number(window?.window_minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { label: fallbackLabel, short: fallbackShort };
      }
      if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return { label: `${days}天配额`, short: `${days}d` };
      }
      if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return { label: `${hours}小时窗口`, short: `${hours}h` };
      }
      return { label: `${Math.round(minutes)}分钟窗口`, short: `${Math.round(minutes)}m` };
    }

    function compactDurationLabel(label) {
      return String(label || "").replace(/(?:配额|窗口)$/u, "");
    }

    function formatPlanName(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
      const knownPlans = {
        free: "Free",
        plus: "Plus",
        pro: "Pro",
        prolite: "Pro Lite",
        team: "Team",
        business: "Business",
        enterprise: "Enterprise",
        edu: "Edu",
      };
      if (knownPlans[normalized]) return knownPlans[normalized];
      return raw
        .replace(/[_-]+/g, " ")
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }

    function splitLegacyModelName(item) {
      const explicitName = String(item?.modelName || "").trim();
      const explicitWindow = String(item?.windowLabel || "").trim();
      if (explicitName) {
        return { modelName: explicitName, windowLabel: explicitWindow };
      }
      const legacyName = String(item?.name || "模型").trim();
      const match = legacyName.match(/^(.*?)\s*·\s*(主窗口|次窗口)$/u);
      return match
        ? { modelName: match[1] || "模型", windowLabel: match[2] }
        : { modelName: legacyName || "模型", windowLabel: explicitWindow };
    }

    function getUsageRows() {
      const rows = [];
      if (usageData.fiveHour) {
        const labels = durationLabels(
          usageData.fiveHour,
          "5小时窗口",
          "5h",
        );
        const chatGPTTitle = "每周使用限额";
        rows.push({
          key: "primary",
          icon: "⚡",
          ...labels,
          title: provider === "chatgpt" ? chatGPTTitle : labels.label,
          meta:
            provider === "chatgpt" ? compactDurationLabel(labels.label) : "",
          label:
            provider === "chatgpt"
              ? `${chatGPTTitle} · ${compactDurationLabel(labels.label)}`
              : labels.label,
          short: labels.short,
          ...usageData.fiveHour,
        });
      }
      if (usageData.sevenDay) {
        const labels = durationLabels(
          usageData.sevenDay,
          "7天配额",
          "7d",
        );
        const chatGPTTitle = "每周使用限额";
        rows.push({
          key: "secondary",
          icon: "📅",
          ...labels,
          title: provider === "chatgpt" ? chatGPTTitle : labels.label,
          meta:
            provider === "chatgpt" ? compactDurationLabel(labels.label) : "",
          label:
            provider === "chatgpt"
              ? `${chatGPTTitle} · ${compactDurationLabel(labels.label)}`
              : labels.label,
          short: labels.short,
          ...usageData.sevenDay,
        });
      }
      usageData.modelLimits.forEach((item, index) => {
        const labels = durationLabels(item, "模型配额", "模型");
        const { modelName, windowLabel } = splitLegacyModelName(item);
        const rowTitle = modelName;
        const meta = [windowLabel, compactDurationLabel(labels.label)]
          .filter(Boolean)
          .join(" · ");
        rows.push({
          key: `model-${index}`,
          icon: "🧠",
          kind: "model",
          title: rowTitle,
          meta,
          label: [rowTitle, meta].filter(Boolean).join(" · "),
          short: /^Fable 5$/i.test(modelName)
            ? "Fable"
            : modelName.slice(0, 8),
          ...item,
        });
      });
      return rows;
    }

    function getPanelMetrics() {
      // 与共享设计语言一致：收起卡 96px、展开卡 304px（CSS 内已按视口收窄）。
      return {
        defaultRight: 8,
        collapsedWidth: 96,
        expandedWidth: Math.min(304, window.innerWidth - 24),
      };
    }

    function renderPanel() {
      if (
        !document.body ||
        !panel ||
        !document.getElementById("claude-usage-panel-bottom")
      )
        return;
      applyTheme();
      if (provider === "claude") {
        renderClaudePanel();
      } else {
        renderChatGPTPanel();
      }
      startCountdown();
    }

    function startCountdown() {
      if (countdownTimer) clearInterval(countdownTimer);
      // 两端都走增量渲染：只更新既有节点文本，不重建 DOM。
      countdownTimer = setInterval(() => {
        if (provider === "claude") {
          renderClaudePanel();
        } else {
          renderChatGPTPanel();
        }
      }, 30000);
    }

    async function fetchUsage() {
      usageData.fetchError = null;
      renderPanel();
      try {
        const snapshot =
          provider === "chatgpt"
            ? await fetchChatGPTUsage()
            : await fetchClaudeUsage();
        if (!snapshot?.hit) throw new Error("接口未返回可识别的额度窗口");
        usageData.fiveHour = snapshot.fiveHour;
        usageData.sevenDay = snapshot.sevenDay;
        usageData.modelLimits = snapshot.modelLimits;
        usageData.resetCredits = snapshot.resetCredits ?? null;
        usageData.planName = snapshot.planName;
        usageData.lastFetch = Date.now();
        usageData.fetchError = null;
      } catch (error) {
        const prefix = provider === "chatgpt" ? "ChatGPT/Codex" : "Claude";
        const message = error instanceof Error ? error.message : String(error);
        usageData.fetchError = `${prefix} 用量获取失败：${message}`;
        console.warn(`[${prefix}用量]`, error);
      }
      renderPanel();
    }

    async function fetchClaudeUsage() {
      if (!orgId) {
        await discoverOrgId();
        if (!orgId) throw new Error("未找到组织 ID，请刷新 Claude 页面");
      }
      const endpoints = [
        `https://claude.ai/api/organizations/${orgId}/usage`,
        `https://claude.ai/api/organizations/${orgId}/rate_limit_status`,
        `https://claude.ai/api/organizations/${orgId}/limits`,
      ];
      let merged = null;
      let lastError = null;
      for (const url of endpoints) {
        try {
          const res = await _origFetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (res.status === 404) continue;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const parsed = UsageParsers.parseClaude(data);
          if (parsed.hit) merged = UsageParsers.merge(merged, parsed);
          // 新版 /usage 已携带 limits[]，无需再重复请求旧的回退接口。
          if (url.endsWith("/usage") && parsed.hasScopedSurface) break;
        } catch (error) {
          lastError = error;
          console.warn("[Claude用量] 接口失败:", url, error.message);
        }
      }
      if (merged?.hit) return merged;
      throw lastError ?? new Error("所有用量接口均不可用");
    }

    function decodeJwtPayload(token) {
      try {
        const encoded = token.split(".")[1];
        if (!encoded) return {};
        const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(
          normalized.length + ((4 - (normalized.length % 4)) % 4),
          "=",
        );
        return JSON.parse(atob(padded));
      } catch {
        return {};
      }
    }

    function findChatGPTAccountId(session, accessToken) {
      const claims = decodeJwtPayload(accessToken);
      const authClaims = claims["https://api.openai.com/auth"] ?? {};
      return (
        session.account?.id ??
        session.accountId ??
        session.account_id ??
        session.user?.accountId ??
        session.user?.account_id ??
        authClaims.chatgpt_account_id ??
        claims.chatgpt_account_id ??
        ""
      );
    }

    async function fetchChatGPTSession() {
      const response = await _origFetch("https://chatgpt.com/api/auth/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`登录状态接口 HTTP ${response.status}`);
      const session = await response.json();
      const accessToken = session.accessToken ?? session.access_token;
      if (!accessToken) throw new Error("请先登录 chatgpt.com");
      return {
        accessToken,
        accountId: findChatGPTAccountId(session, accessToken),
      };
    }

    async function fetchChatGPTUsage() {
      const { accessToken, accountId } = await fetchChatGPTSession();
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      };
      if (accountId) headers["ChatGPT-Account-Id"] = accountId;

      const endpoints = [
        "https://chatgpt.com/backend-api/codex/usage",
        "https://chatgpt.com/backend-api/wham/usage",
        "https://chatgpt.com/api/codex/usage",
      ];
      let lastError = null;
      for (const url of endpoints) {
        try {
          const response = await _origFetch(url, {
            credentials: "include",
            headers,
          });
          if (response.status === 404) continue;
          if (response.status === 401 || response.status === 403) {
            throw new Error(`HTTP ${response.status}，当前账号可能没有 Codex 权限`);
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const parsed = UsageParsers.parseChatGPT(data);
          if (parsed.hit) {
            parsed.resetCredits = await fetchChatGPTResetCredits(
              headers,
              parsed.resetCredits,
            );
            return parsed;
          }
          lastError = new Error("接口响应中没有额度窗口");
        } catch (error) {
          lastError = error;
          console.warn("[ChatGPT/Codex用量] 接口失败:", url, error.message);
        }
      }
      throw lastError ?? new Error("所有用量接口均不可用");
    }

    async function fetchChatGPTResetCredits(headers, fallbackSummary) {
      const endpoints = [
        "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
        "https://chatgpt.com/api/codex/rate-limit-reset-credits",
      ];
      for (const url of endpoints) {
        try {
          const response = await _origFetch(url, {
            credentials: "include",
            headers,
          });
          if (response.status === 404) continue;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = UsageParsers.parseChatGPTResetCredits(
            await response.json(),
          );
          if (parsed) return parsed;
        } catch (error) {
          console.warn("[ChatGPT重置卡] 接口失败:", url, error.message);
        }
      }
      return fallbackSummary ?? null;
    }

    function enableDrag() {
      if (!panel) return;

      let startX, startY, startLeft, startTop, pointerMoved;

      panel.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        pointerMoved = false;
        startX = e.clientX;
        startY = e.clientY;

        // 获取当前位置
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        panel.style.transition = "none";
        panel.style.cursor = "grabbing";
        panel.setPointerCapture?.(e.pointerId);
      });

      document.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
          pointerMoved = true;
          setChatGPTWidgetState(false);
        }

        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;

        // 边界限制 - 使用当前布局的收起宽度作为基准
        const collapsedWidth = getPanelMetrics().collapsedWidth;
        const maxLeft = window.innerWidth - collapsedWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      });

      document.addEventListener("pointerup", (e) => {
        if (isDragging) {
          isDragging = false;
          panel.style.transition = "all 0.2s ease";
          panel.style.cursor = "move";
          panel.releasePointerCapture?.(e.pointerId);

          if (pointerMoved) {
            // 垂直位置自由，水平吸附到卡片中心更近的一侧（transition 提供吸边动画）。
            const rect = panel.getBoundingClientRect();
            savedPosition.top = rect.top;
            savedPosition.isRight =
              rect.left + rect.width / 2 > window.innerWidth / 2;
            localStorage.setItem(
              positionStorageKey,
              JSON.stringify({
                top: savedPosition.top,
                isRight: savedPosition.isRight,
              }),
            );
            applyChatGPTPosition();
          } else if (e.pointerType !== "mouse") {
            // 触屏 tap 切换展开/收起
            setChatGPTWidgetState(!isHovered);
          }

          renderPanel();
        }
      });

      document.addEventListener("pointercancel", (e) => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = "all 0.2s ease";
        panel.style.cursor = "move";
        panel.releasePointerCapture?.(e.pointerId);
        // 拖动被系统打断：回弹到上次保存的停靠位，避免浮窗悬在半空。
        applyChatGPTPosition();
        renderPanel();
      });
    }

    function init(options = {}) {
      if (document.getElementById("claude-usage-panel-bottom")) {
        console.warn(`[${panelTitle}] 小部件已存在`);
        return;
      }

      if (provider === "claude") hookFetch();
      panel = createPanel();

      // 支持自定义位置覆盖
      if (options.position) {
        const position = options.position;
        if (position.bottom) panel.style.bottom = position.bottom;
        if (position.left) panel.style.left = position.left;
        if (position.top) panel.style.top = position.top;
        if (position.right) panel.style.right = position.right;
      }

      const initWhenReady = () => {
        if (!document.body) {
          setTimeout(initWhenReady, 100);
          return;
        }

        document.body.appendChild(panel);

        // 恢复保存的停靠位置：只取垂直位置与停靠边，水平永远吸边。
        // 旧版本存过的任意悬空坐标（left/right 偏移）在这里自动归位贴边。
        const savedPos = localStorage.getItem(positionStorageKey);
        if (provider === "chatgpt" && savedPos && !options.position) {
          try {
            const pos = JSON.parse(savedPos);
            const top = parseFloat(pos.top);
            if (Number.isFinite(top)) savedPosition.top = top;
            savedPosition.isRight = pos.isRight !== false;
            applyChatGPTPosition();
          } catch (e) {
            console.warn(`[${panelTitle}] 恢复位置失败`, e);
          }
        }

        renderPanel();
        if (provider === "chatgpt") {
          enableDrag();

          panel.addEventListener("mouseenter", () => {
            if (!isDragging) setChatGPTWidgetState(true);
          });

          panel.addEventListener("mouseleave", () => {
            if (!isDragging) setChatGPTWidgetState(false);
          });
        } else {
          applyClaudePosition();
        }

        if (provider === "claude") {
          discoverOrgId().then(() => fetchUsage());
        } else {
          fetchUsage();
        }

        refreshInterval = setInterval(() => {
          if (provider === "chatgpt" || orgId) fetchUsage();
        }, 65000);

        const themeObserver = new MutationObserver(applyTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "data-theme"],
        });
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", applyTheme);

        console.log(
          `%c✅ ${panelTitle}小部件已启动`,
          "color:#10b981;font-weight:600;font-size:13px",
        );
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWhenReady);
      } else {
        initWhenReady();
      }
    }

    function destroy() {
      if (panel && panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      if (countdownTimer) clearInterval(countdownTimer);
      if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
      if (claudeAutoCollapseTimer) clearTimeout(claudeAutoCollapseTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      if (claudeDocumentClickHandler) {
        document.removeEventListener("click", claudeDocumentClickHandler);
      }
      if (claudeKeyHandler) {
        document.removeEventListener("keydown", claudeKeyHandler);
      }
      panel = null;
      claudeShadow = null;
      orgId = null;
      console.log(`[${panelTitle}] 小部件已销毁`);
    }

    return {
      init,
      destroy,
      getUsageData: () => usageData,
    };
  })();

  if (isClaudeSite || isChatGPTSite) ClaudeUsageWidget.init();

  if (isClaudeSite) {
    // 动态首页文案通过 DOM 处理；Design 页面继续兼容打包在 JS bundle 中的静态字符串。
    function isDesignPage() {
      return location.pathname.startsWith("/design");
    }

    function shouldSkipTranslation(node) {
      let element =
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (element) {
        const tagName = String(element.tagName || "").toUpperCase();
        if (
          ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(tagName) ||
          element.isContentEditable ||
          element.getAttribute?.("contenteditable") === "true"
        ) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    }

    function translateAttrs(el) {
      if (!isDesignPage()) return;
      for (const attr of ["title", "placeholder", "aria-label"]) {
        const val = el.getAttribute(attr);
        if (val && DESIGN_TRANSLATIONS[val]) {
          el.setAttribute(attr, DESIGN_TRANSLATIONS[val]);
        }
      }
    }

    function translateTextNode(node) {
      if (shouldSkipTranslation(node)) return;
      const raw = node.nodeValue;
      const text = raw && raw.trim();
      if (!text) return;

      const dynamicTranslation = DynamicTranslations.translate(text);
      if (dynamicTranslation !== text) {
        node.nodeValue = raw.replace(text, dynamicTranslation);
        return;
      }

      if (isDesignPage() && DESIGN_TRANSLATIONS[text]) {
        node.nodeValue = raw.replace(text, DESIGN_TRANSLATIONS[text]);
      }
    }

    function translateDynamicContainers(root) {
      if (!root) return;
      const seedNodes = [];
      if (root.nodeType === Node.TEXT_NODE) {
        seedNodes.push(root);
      } else if (root.nodeType === Node.ELEMENT_NODE) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) seedNodes.push(textNode);
      }

      const candidates = new Set();
      for (const textNode of seedNodes) {
        if (!/(?:you|used|fable|resets)/i.test(textNode.nodeValue || "")) {
          continue;
        }
        let element = textNode.parentElement;
        for (let depth = 0; element && depth < 5; depth += 1) {
          candidates.add(element);
          if (element === root) break;
          element = element.parentElement;
        }
      }

      const orderedCandidates = [...candidates].sort((a, b) => {
        const depth = (element) => {
          let value = 0;
          while (element?.parentElement) {
            value += 1;
            element = element.parentElement;
          }
          return value;
        };
        return depth(b) - depth(a);
      });

      for (const element of orderedCandidates) {
        if (shouldSkipTranslation(element)) continue;
        const combined = String(element.textContent || "").trim();
        if (!combined || combined.length > 240) continue;
        const translated = DynamicTranslations.translate(combined);
        if (translated === combined) continue;

        const textNodes = [];
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
        );
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode.nodeValue?.trim() && !shouldSkipTranslation(textNode)) {
            textNodes.push(textNode);
          }
        }
        if (!textNodes.length) continue;

        const first = textNodes[0];
        const raw = first.nodeValue || "";
        const leading = raw.match(/^\s*/)?.[0] || "";
        const trailing = raw.match(/\s*$/)?.[0] || "";
        first.nodeValue = `${leading}${translated}${trailing}`;
        for (const extraNode of textNodes.slice(1)) extraNode.nodeValue = "";
      }
    }

    function translateNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node);
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !shouldSkipTranslation(node)
      ) {
        translateDynamicContainers(node);
        translateAttrs(node);
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
          translateTextNode(textNode);
        }
        if (isDesignPage()) {
          node
            .querySelectorAll("[title],[placeholder],[aria-label]")
            .forEach(translateAttrs);
        }
      }
    }

    const claudeDomObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          translateDynamicContainers(mutation.target);
        } else if (
          mutation.type === "attributes" &&
          mutation.target.nodeType === Node.ELEMENT_NODE
        ) {
          translateAttrs(mutation.target);
        } else {
          for (const node of mutation.addedNodes) {
            translateNode(node);
          }
        }
      }
    });

    function initClaudeDomTranslator() {
      translateNode(document.body);
      claudeDomObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "placeholder", "aria-label"],
      });
    }

    if (document.body) {
      initClaudeDomTranslator();
    } else {
      document.addEventListener("DOMContentLoaded", initClaudeDomTranslator);
    }
  }

  if (isCursorSite) {
    function shouldSkipCursorTranslation(node) {
      let element =
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (element) {
        const tagName = String(element.tagName || "").toUpperCase();
        if (
          ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"].includes(
            tagName,
          ) ||
          element.isContentEditable ||
          element.getAttribute?.("contenteditable") === "true" ||
          element.id === "claude-usage-panel-bottom" ||
          element.hasAttribute?.("data-cc-usage-no-translate")
        ) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    }

    function translateCursorTextNode(node) {
      if (shouldSkipCursorTranslation(node)) return;
      const raw = node.nodeValue || "";
      const text = raw.trim();
      if (!text) return;
      const translated = CursorTranslations.translate(text);
      if (translated !== text && translated !== raw) {
        node.nodeValue = raw.replace(text, translated);
      }
    }

    function translateCursorAttrs(element) {
      if (shouldSkipCursorTranslation(element)) return;
      for (const attr of [
        "title",
        "placeholder",
        "aria-label",
        "data-tooltip-content",
      ]) {
        const value = element.getAttribute?.(attr);
        if (!value) continue;
        const translated = CursorTranslations.translate(value);
        if (translated !== value) element.setAttribute(attr, translated);
      }
    }

    function translateCursorTree(root) {
      if (!root || shouldSkipCursorTranslation(root)) return;
      if (root.nodeType === Node.TEXT_NODE) {
        translateCursorTextNode(root);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;

      translateCursorAttrs(root);
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      let current;
      while ((current = walker.nextNode())) {
        if (current.nodeType === Node.TEXT_NODE) {
          translateCursorTextNode(current);
        } else {
          translateCursorAttrs(current);
        }
      }
    }

    const cursorDomObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateCursorTextNode(mutation.target);
        } else if (mutation.type === "attributes") {
          translateCursorAttrs(mutation.target);
        } else {
          for (const node of mutation.addedNodes) translateCursorTree(node);
        }
      }
    });

    function initCursorDomTranslator() {
      if (!document.body) return;
      translateCursorTree(document.body);
      cursorDomObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "title",
          "placeholder",
          "aria-label",
          "data-tooltip-content",
        ],
      });
    }

    if (document.body) {
      initCursorDomTranslator();
    } else {
      document.addEventListener("DOMContentLoaded", initCursorDomTranslator, {
        once: true,
      });
    }
  }

})();
