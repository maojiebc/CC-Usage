# CC-Usage

> 在浏览器里查看 Claude、ChatGPT/Codex 的剩余额度和重置时间。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Userscript-black?logo=tampermonkey)](https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js)

## [一键安装 CC-Usage](https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js)

先在浏览器中安装 [Tampermonkey（油猴）](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)，再点击上方「一键安装 CC-Usage」，在脚本安装页点击「安装」。

**v2.0 起专注额度显示。** Claude 页面语言由官方设置管理，脚本不再汉化 Claude 或 Cursor。沿用原来的脚本名称、安装和自动更新地址，已有用户更新后刷新页面即可；浮窗位置与设置继续保留。

## 功能

- **Claude 额度**：显示 5 小时窗口、7 日总额度和账号实际返回的模型独立额度，兼容新版 `limits[]` 与旧版字段。
- **ChatGPT/Codex 额度**：显示套餐共享的每周使用限额、剩余比例、套餐类型，以及可用重置卡次数和最近到期时间。
- **重置时间与倒计时**：查看何时恢复额度，自动刷新用量，也可手动刷新。
- **贴边浮窗**：收起时显示简洁的额度摘要，悬停展开完整卡片；ChatGPT 浮窗支持鼠标与触控拖动。
- **设置记忆**：Claude 支持自动收起、重置时间显示、垂直位置设置和临时隐藏；继续使用原有保存设置。
- **明暗主题与额度配色**：跟随页面或系统主题，用颜色区分剩余额度状态。

额度以当前登录账号的接口响应为准；接口不可用时显示获取失败，不推算剩余额度。ChatGPT 面板展示的是 Codex 相关的套餐共享用量，普通 Chat 对话不计入此处。重置卡仅作只读展示，脚本不会替你消耗卡片。

## 安装与更新

1. 安装 Tampermonkey 或 Violentmonkey。
2. 点击 [一键安装 CC-Usage](https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js)，在脚本安装页点击「安装」或「更新」。
3. 刷新已登录的 [Claude.ai](https://claude.ai/) 或 [ChatGPT](https://chatgpt.com/)。

Chrome 使用 Tampermonkey 时，在地址栏打开 `chrome://extensions`，进入 Tampermonkey 的「详情」并开启「允许用户脚本」。如果没有这个开关，可开启扩展页面右上角的「开发者模式」。详见 [Tampermonkey 官方说明](https://www.tampermonkey.net/faq.php?q=Q209)。

CC-Usage 以浏览器用户脚本形式发布，仅通过 GitHub 安装和更新，不在 Greasy Fork 上架。

## 浮窗操作

### Claude.ai

收起态显示 `5h / 7d / F5` 和剩余百分比，账号没有对应额度时不显示该项。鼠标移入展开完整进度、倒计时与重置时间；点击页面空白、标题栏空白或按 `Esc` 收起。设置按钮可调整显示，关闭后可用 `Alt + Shift + U` 恢复浮窗。

### ChatGPT

收起态显示每周剩余比例和可用重置卡摘要，悬停展开完整信息。可拖动到左右边缘，位置保存在 ChatGPT 域名下；触屏轻点切换展开状态。

## 隐私与安全

- 脚本仅匹配 `claude.ai` 与 `chatgpt.com`；Cursor 不再属于支持站点。
- 额度接口使用浏览器当前登录态，不读取本机 Claude Code 或 Codex 凭据文件。
- 不上传 Cookie、访问令牌、对话内容或使用统计，不改写官方语言资源或页面文案。
- Claude 请求观察只用于识别组织 ID，原始请求与响应原样传递。
- 唯一的 `@require` 是固定版本的图标资源，使用 SHA-256 SRI 校验；不再加载翻译词库。

## 项目结构

```text
CC-Usage/
├── claude-chatgpt-usage.user.js  # 额度显示主用户脚本
├── claude-usage-icons.user.js   # 浮窗图标资源
├── assets/claude-usage-icons/   # 图标 PNG 与生成源图
├── tests/                      # 用量解析、浮窗与运行测试
│   └── preview/harness.html    # 本地浮窗预览（模拟额度接口）
├── qa/                         # 历史版本验收记录
└── CHANGELOG.md
```

## 开发与验证

仅需 Node.js，无需安装额外依赖。

```bash
npm test
node --check claude-chatgpt-usage.user.js
git diff --check
```

调试浮窗时，在仓库根目录启动静态服务（如 `python3 -m http.server 8642 --bind 127.0.0.1`），打开 `http://127.0.0.1:8642/tests/preview/harness.html`。预览使用主脚本的渲染逻辑，仅替换额度接口，可切换 Claude / ChatGPT、明暗主题、正常 / 低额度 / 接口失败场景。

## 来源与授权

本项目基于 [jyking/claude2cn](https://github.com/jyking/claude2cn) 的 MIT 授权代码演进，继续保留原作者 `jyking` 的版权声明与完整许可。现由 `maojiebc` 维护浏览器端额度显示功能。详见 [LICENSE](LICENSE) 与 [CHANGELOG.md](CHANGELOG.md)。
