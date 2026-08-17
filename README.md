# CC-Usage

> Claude 中文汉化 + Claude、ChatGPT/Codex 用量显示 + Cursor Dashboard 汉化

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Userscript-black?logo=tampermonkey)](https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js)

## 功能

- **Claude.ai 完整中文汉化**：保留原项目 10,000+ 行翻译词条，覆盖 Claude Code、Artifacts、Projects、Cowork、Claude Design 等界面；主脚本内置增补词典，跟进模型选择器、工作量菜单等新 UI 词条。
- **Claude 额度显示**：显示 5 小时窗口、7 日总额度和 Fable 5 独立周额度。
- **Claude 精简浮窗**：默认用 `5h / 7d / F5` 三行胶囊显示剩余比例，鼠标移入后平滑展开完整进度、倒计时和重置时间；条目图标区分额度类型，颜色按剩余量走鲜绿 / 明蓝 / 珊瑚橙 / 红四档健康度，沿用原设计稿的清透色系。
- **定制图标资产**：Claude 展开态使用设计稿风格的闪电、时钟、日历、大脑、刷新、设置与关闭图标；ChatGPT 重置卡使用同系列紫色票券图标，全部内嵌为透明高清资源。
- **新旧接口兼容**：同时解析新版 `limits[]`、旧版 `seven_day_fable`、`fable_weekly` 等字段。
- **ChatGPT/Codex 额度显示**：与 ChatGPT 网页端一致，显示套餐共享的每周使用限额和可用重置卡摘要；浮窗与 Claude 端同一套设计语言（收起胶囊 + 展开卡 + 品牌绿徽章）。
- **重置时间跟踪**：显示额度重置日期和剩余倒计时。
- **状态与设置记忆**：Claude 浮窗支持收起、展开、设置、隐藏四种状态，并记忆自动收起、重置时间与垂直位置设置。
- **ChatGPT 面板可拖动**：支持桌面端和移动端触控拖动，位置独立保存在 ChatGPT 域名下。
- **明暗主题适配**：自动跟随页面或系统主题。
- **Cursor Dashboard 中文汉化**：覆盖 `cursor.com/dashboard` 的导航、用量、支出、账单等常用界面和动态日期；`Ultra`、`Pro`、`Pro+`、`Teams`、`Enterprise` 等套餐名，以及模型 ID、Cursor、Bugbot 等产品名保持原文。

## 安装

### Tampermonkey / Violentmonkey

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 点击安装：[claude-chatgpt-usage.user.js](https://raw.githubusercontent.com/maojiebc/CC-Usage/main/claude-chatgpt-usage.user.js)。
3. 刷新 [Claude.ai](https://claude.ai/)、[ChatGPT](https://chatgpt.com/) 或 [Cursor Dashboard](https://cursor.com/dashboard)。

目前仅通过 GitHub 发布和更新，不在 Greasy Fork 上架。

## 显示内容

### Claude.ai

- 5 小时滚动窗口
- 7 日总额度
- Fable 5 独立周额度（账号具备该额度时显示）
- 收起态仅显示 `5h / 7d / F5` 和剩余百分比；悬停可查看完整信息
- 展开态显示剩余进度、倒计时及带中文星期的重置时间
- 鼠标移入收起卡片立即展开；点击页面空白、标题栏空白或按 `Esc` 收起；`Alt + Shift + U` 可恢复隐藏的浮窗
- Claude.ai 中文界面与 Claude Design 中文翻译

### ChatGPT

- 每周使用限额、剩余百分比和重置时间
- 收起态即可见剩余重置卡次数；展开面板显示完整的可用次数及最近一张卡的过期时间
- ChatGPT 套餐类型

> 重置卡仅作只读展示，脚本不会替您消耗卡片。ChatGPT 接口中的 Spark 等内部模型计量项不会作为用户额度显示；普通 Chat 对话也不计入此处用量。

### Cursor Dashboard

- 汉化 Dashboard 导航、用量、支出、账单与常用设置文案
- 汉化日期范围、UTC 时间、用量表头和动态提示
- 保留 `Hobby`、`Pro`、`Pro+`、`Pro Plus`、`Ultra`、`Teams`、`Enterprise`、`Standard`、`Premium` 等套餐/席位名称
- 保留模型 ID、Cursor、Bugbot、GitHub、GitLab、Slack 等专有名词
- 直接展示 Cursor 官方页面的原始用量，不复制、改写或推算其计费数据

## 隐私与安全

- 脚本只在 `claude.ai`、`chatgpt.com`、`cursor.com` 页面运行，并加载声明的只读 GitHub 资源。
- 额度接口使用浏览器当前登录态，不读取本机 Claude Code 或 Codex 凭据文件。
- 不上传 Cookie、访问令牌、对话内容或使用统计。
- Cursor 兼容层只翻译当前页面 DOM，不额外请求或拦截 Cursor 的计费接口。
- 翻译资源通过固定版本标签和 SHA-256 SRI 校验加载，资源内容变化时浏览器会拒绝执行。

## 项目结构

```text
CC-Usage/
├── claude-chatgpt-usage.user.js  # 主用户脚本
├── claude-usage-icons.user.js     # Claude 浮窗内嵌图标资源
├── assets/claude-usage-icons/     # 图标 PNG 与生成源图
├── claude2cn-translations.user.js # Claude 翻译词典
├── claude2cn-design.user.js       # Claude Design 翻译词典
├── en.json                        # 原始英文词条
├── en2cn.json                     # 英中翻译映射
├── tests/                         # 用量解析与页面烟雾测试
│   └── preview/harness.html       # 本地浮窗预览环境（mock 额度接口）
└── CHANGELOG.md
```

## 开发与验证

```bash
npm test
node --check claude-chatgpt-usage.user.js
```

调试浮窗样式时，在仓库根目录起任意静态服务（如 `python3 -m http.server 8642`），
打开 `http://localhost:8642/tests/preview/harness.html` 即可脱离 claude.ai / chatgpt.com
真实渲染浮窗，并一键切换站点、明暗主题与正常 / 低额度 / 接口失败场景。

## 来源与授权

本项目基于 [jyking/claude2cn](https://github.com/jyking/claude2cn) 二次开发，保留原作者 `jyking` 的版权声明和完整 MIT 许可文本。

新增的 ChatGPT/Codex、Fable 5 额度兼容和相关测试由 `maojiebc` 维护。详见 [LICENSE](LICENSE) 与 [CHANGELOG.md](CHANGELOG.md)。
