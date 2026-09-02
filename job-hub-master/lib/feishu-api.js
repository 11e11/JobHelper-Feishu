// 飞书 Bitable Open API 封装【迁移核心】
// 约定：不感知任何 UI / 消息协议，仅依赖 fetch 与 chrome.storage.session，
//       将来合并进 auto-fill-extension 时整文件拷贝即可复用。
import { FEISHU_API_BASE, STORAGE_KEYS, WRITABLE_RECORD_KEYS } from './constants.js';

// ---------- 错误码 → 中文提示（高频排障场景） ----------
const ERROR_MESSAGES = {
  10003: 'app_id 或 app_secret 错误，请检查凭证',
  10014: 'app_secret 错误，请检查凭证',
  1254003: 'app_token 配置错误，请检查多维表格链接',
  1254040: 'app_token 不存在（注意：知识库 /wiki/ 链接中的 token 不能直接用，请把表格放在"我的空间"）',
  1254004: 'table_id 配置错误',
  1254041: 'table_id 不存在，请检查表格链接中 table= 后的参数',
  1254045: '表格中缺少对应字段（列名须与字段映射完全一致，不能有多余空格）',
  1254015: '字段类型与值不匹配（如"投递时间"列不是日期类型、"链接"列不是超链接类型）',
  91403: '应用无权访问该多维表格：请打开表格 → 右上角 ⋯ → 更多 → 添加文档应用，并设为可编辑',
  1254302: '应用对该表格权限不足，请在"添加文档应用"中设为可编辑',
  1254304: '应用对该表格权限不足，请在"添加文档应用"中设为可编辑',
  1254290: '请求过于频繁，请稍后重试',
  99991672: '应用权限不足：请在开发者后台开通 bitable:app 权限并发布版本（权限发布后才生效）'
};

// token 失效类错误码：清缓存重取后重试一次
const AUTH_ERROR_CODES = new Set([99991661, 99991663, 99991664, 99991665, 99991668]);

function errorText(code, msg) {
  return ERROR_MESSAGES[code] || `飞书接口返回错误（code ${code}）：${msg || '未知错误'}`;
}

// ---------- tenant_access_token 获取与缓存 ----------

let tokenPromise = null; // in-flight 去重，防并发重复取 token

async function fetchNewToken(config) {
  const resp = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
  });
  const data = await resp.json();
  if (data.code !== 0) {
    const err = new Error(errorText(data.code, data.msg));
    err.code = data.code;
    throw err;
  }
  const cached = {
    token: data.tenant_access_token,
    // 提前 5 分钟视为过期，避开临界续期
    expiresAt: Date.now() + (data.expire - 300) * 1000
  };
  await chrome.storage.session.set({ [STORAGE_KEYS.token]: cached });
  return cached.token;
}

export async function ensureToken(config) {
  const data = await chrome.storage.session.get(STORAGE_KEYS.token);
  const cached = data[STORAGE_KEYS.token];
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (!tokenPromise) {
    tokenPromise = fetchNewToken(config).finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

export async function clearTokenCache() {
  await chrome.storage.session.remove(STORAGE_KEYS.token);
}

// ---------- 通用请求（带 token 失效自动重试一次） ----------

async function request(config, path, { method = 'GET', body } = {}, retried = false) {
  const token = await ensureToken(config);
  const resp = await fetch(`${FEISHU_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json();
  if (data.code === 0) return data.data;
  if (!retried && (AUTH_ERROR_CODES.has(data.code) || resp.status === 401)) {
    await clearTokenCache();
    return request(config, path, { method, body }, true);
  }
  const err = new Error(errorText(data.code, data.msg));
  err.code = data.code;
  throw err;
}

// ---------- 业务接口 ----------

// 新增一条投递记录，返回 record_id
// record: {company, position, appliedAt(毫秒时间戳), url, linkText, status, note}
export function toFeishuFields(config, record, { includeEmpty = false, availableFieldNames = null } = {}) {
  const fields = {};
  for (const key of WRITABLE_RECORD_KEYS) {
    const fieldName = config.fieldMap[key];
    if (availableFieldNames && !availableFieldNames.has(fieldName)) continue;
    let value = record[key];
    if (key === 'officialUrl' && value) value = { text: [record.company, record.jobName].filter(Boolean).join(' · ') || value, link: value };
    if (!includeEmpty && (value === '' || value === null || value === undefined)) continue;
    fields[fieldName] = value;
  }
  return fields;
}

export async function createRecord(config, record, options = {}) {
  const fields = toFeishuFields(config, record, options);

  const data = await request(
    config,
    `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`,
    { method: 'POST', body: { fields } }
  );
  return data.record.record_id;
}

export async function updateRecord(config, recordId, record, options = {}) {
  const data = await request(config,
    `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${recordId}`,
    { method: 'PUT', body: { fields: toFeishuFields(config, record, options) } }
  );
  return data.record.record_id;
}

// 列出表格全部记录（看板同步用），自动翻页
// 返回 [{record_id, fields: {列名: 值, ...}}]
export async function listRecords(config) {
  const records = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pageToken) qs.set('page_token', pageToken);
    const data = await request(
      config,
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?${qs}`
    );
    records.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return records;
}

// 列出表格全部字段（测试连接用），自动翻页
// 返回 [{field_name, type, ...}]
export async function listFields(config) {
  const fields = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ page_size: '100' });
    if (pageToken) qs.set('page_token', pageToken);
    const data = await request(
      config,
      `/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?${qs}`
    );
    fields.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return fields;
}
