# JobHub 阶段一审计结论

审计对象：`manifest.json`、`content/fill-engine.js`、`content/scraper.js`、`service-worker.js`、`lib/feishu-api.js`、`lib/storage.js`、`lib/ai-client.js`、`lib/field-matcher.js`、`options/`、`sidepanel/`。

## 可复用部分

- Manifest V3、原生 JavaScript/HTML/CSS、ES Modules、侧边栏路由和资料卡片编辑界面可复用。
- `chrome.storage.local/session` 封装、多份资料管理、React/Vue 原生 value setter、岗位信息抓取器可复用。
- 飞书 token 缓存、记录新增和查询可作为阶段二参考，但阶段一不调用。

## 原实现风险与差距

- Manifest 权限按用户最新要求沿用 JobHub 的 `<all_urls>` 和常驻 content script，避免侧边栏跨标签页后丢失权限。常驻脚本不主动执行扫描、填写、上传、提交或网络请求，只响应侧边栏的用户操作。
- 原 `FILL` 在未聚焦时会选择页面第一个输入框，存在误填风险；原扫描排除按钮但未建立显式 SubmitGuard。
- 原批量匹配依赖可选 AI API，会把资料发送到用户配置的模型服务；设置页还提供外部 AI 跳转。阶段一 UI 入口已隔离，规则扫描不导入或调用 AI matcher。
- 原投递追踪按钮可在未验证真实投递成功时直接新增飞书记录。阶段一 Service Worker 对全部 `JT_*` 消息设置硬闸门。
- App Secret、AI API Key 和个人资料均保存在 `chrome.storage.local`；飞书 tenant token 位于 `chrome.storage.session`。阶段二需增加清除飞书凭证与日志/队列脱敏。
- 飞书原实现支持新增和查询，不支持更新；重复检测仅比较规范化 URL，不符合阶段二的多级查重/upsert 要求。
- 未发现遥测。外部网络代码包括飞书 Open API、AI endpoint，以及 UI 中 GitHub/邮件/外部 AI 链接；阶段一填表路径不发起网络请求。
- 原仓库目录缺少独立 `LICENSE` 文件，需补齐 MIT 文本并保留作者署名。

## 真实页面审计补充

九牧集团的 Moka 申请页包含普通输入、自定义下拉、文件上传、声明复选框、隐私授权以及“预览并提交”按钮。页面另有“紧急联系人姓名/电话”，若只做关键词包含匹配会误用候选人本人资料；规则引擎已为此加入歧义降级。Moka 自定义字段的标签位于 `apply-field-*` 包装层，已加入受限邻近文本提取。

## 阶段边界

当前只实现阶段一。飞书同步、投递结果检测、状态机、upsert 和待同步队列在用户明确回复“阶段一验收通过”前不得启用或实现。
