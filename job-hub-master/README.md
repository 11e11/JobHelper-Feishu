# JobHub — 个人安全求职表单与投递助手

本目录基于 Zheyi-D 的 MIT 开源 JobHub 改造。扩展提供规则式安全填写，并在用户亲自提交后检测结果、补全投递信息、幂等同步飞书；不会自动登录、处理验证码、上传文件、点击下一步或提交申请，也不会调用 LLM。

## 功能

| Tab | 功能 | 说明 |
|-----|------|------|
| 📝 简历填充 | 阶段一启用 | 规则扫描、脱敏预检、高置信度安全填写、逐项确认、撤销、网站字段映射。 |
| 📋 投递追踪 | 阶段二启用 | 监听用户真实提交、结果检测、信息补全、查重 upsert 与失败队列。 |
| 📊 数据看板 | 阶段二启用 | 从飞书读取投递记录。 |

## AI 功能

阶段一和阶段二均不调用任何 LLM。原项目 AI 模块保留作来源参考，但不在当前 UI 或执行路径中启用。

## 安装

1. 下载本仓库 ZIP 或 `git clone`
2. 打开 Chrome → `chrome://extensions` → 开启「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择本目录 `job-hub-master`
4. 点击工具栏 JobHub 图标打开侧边栏

## 飞书配置

设置页不预置任何个人飞书配置；使用者需要自行填写 App ID、App Secret、Base App Token 和投递记录 Table ID。目标表需包含设置页列出的字段，其中 `官网链接`为超链接、`工作地点`为文本。飞书 API 自带的 `record_id` 用作记录与关联标识，不需要自建 `rec_id` 文本列。同步只更新白名单字段，不修改流程记录和人工维护字段。

## 技术栈

- **Chrome Extension Manifest V3**
- **纯原生 JS/CSS/HTML** — 零 npm 依赖，零构建工具
- **ES Modules** — service worker 和 side panel
- **Neo-Brutalist 设计风格** — 粗黑边框、硬边缘阴影、零圆角、纯色配色
- **阶段一无外部 API** — 飞书与 LLM 均由安全闸门禁用
- **chrome.storage** — local 持久化 + session 缓存

## 项目结构

```
job-hub/
├── manifest.json
├── service-worker.js          # 消息路由 + 飞书 API + 更新检查
├── lib/
│   ├── design-system.css      # Neo-Brutalist 设计系统
│   ├── feishu-api.js          # 飞书 Bitable API 封装
│   ├── storage.js             # Storage 抽象层
│   └── constants.js           # 全局常量
├── content/
│   ├── fill-engine.js         # 常驻安全消息监听；扫描/填写仅由用户点击触发
│   └── scraper.js             # 页面信息抓取（按需注入）
├── sidepanel/
│   ├── sidepanel.html         # 3 Tab 外壳
│   ├── sidepanel.js           # Tab 路由器
│   ├── sidepanel.css
│   ├── resume-fill.js/css     # 简历填充面板
│   ├── job-tracker.js/css     # 投递追踪面板
│   └── dashboard.js/css       # 数据看板面板
├── options/
│   ├── options.html           # 设置页
│   ├── options.js
│   └── options.css
└── icons/
```

## 合并来源

本项目合并了以下两个独立扩展：
- [auto-fill-extension](https://github.com/Zheyi-D/auto-fill-extension) — 简历自动填充
- [job-tracker-extension](https://github.com/Zheyi-D/job-tracker-extension) — 求职投递追踪

## 测试

在本目录运行 `npm install`（首次）和 `npm test`。`npm run check` 做 JavaScript 语法检查。详见 `docs/AUDIT-PHASE1.md` 和 `PRIVACY-AND-SECURITY.md`。

## 许可与致谢

MIT © 2026 Zheyi-D。改造版保留原作者署名；原项目：https://github.com/Zheyi-D/job-hub 。
