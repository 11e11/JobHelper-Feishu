# 求职表单助手（阶段一）

个人使用的 Chrome/Edge Manifest V3 扩展。它在当前页面本地识别招聘表单并填写明确、安全且高置信度的个人资料字段。它不会自动登录、读取 Cookie、调用外部 AI、上传文件或点击/触发最终提交。

## 开发与构建

要求 Node.js 20+。运行 `npm install`，然后使用 `npm test`、`npm run typecheck` 和 `npm run build`。开发测试页可用 `npm run dev` 后访问终端给出的 `test-page.html` 地址。生产文件输出到 `dist/`。

## 加载扩展

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 开启“开发者模式”，选择“加载已解压的扩展程序”。
3. 选择本项目的 `dist` 文件夹。
4. 在招聘表单页面打开扩展，先“扫描字段”并核对结果，再选择“填写安全字段”或单项填写。
5. 最终提交始终由用户人工完成。

## 安全策略

- `auto`：仅允许词典内安全字段且置信度至少 0.8。
- `confirm`：期望薪资/城市、调剂、其他岗位、亲属任职、竞业协议及未知/歧义字段；绝不批量填写。已识别且资料中有值的确认类字段，只有在用户点击“确认填写”并再次确认后才单项填写。
- `forbidden`：身份证、密码、验证码、银行信息、签名、诚信声明、文件/简历上传和提交控件。

资料及站点映射仅存于 `chrome.storage.local`。教育经历支持添加任意多条（如本科、硕士），重复教育字段按页面出现顺序匹配对应经历；旧版单条教育资料会自动迁移。权限仅为 `storage`、`activeTab`、`scripting`；没有 Cookie、下载、网络请求或主机外发逻辑。日志不得输出完整个人资料。

## 架构与阶段边界

核心代码在 `src/core`，界面在 `src/ui`，内容脚本在 `src/content`。已预留 `SiteAdapter`、`FieldDetector`、`FieldMapper`、`FillPolicy`、`JobExtractor`、`JobMatchScorer`、`SyncProvider`、`LocalServiceClient` 接口。阶段一没有实现或调用 LLM、本地 Python 服务、飞书同步或投递同步。

## 本地验收页

`test-page.html` 覆盖文本、日期、原生下拉、单选、复选、受控输入、未知字段、身份证、文件上传和提交按钮。自动化测试覆盖识别、策略、事件触发、撤销和禁止提交。
