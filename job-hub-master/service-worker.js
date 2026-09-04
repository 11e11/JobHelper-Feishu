// ================================================================
// JobHub — Service Worker
// 职责：Side Panel 生命周期、JT_* 消息路由、飞书 API 调用
// ================================================================
import { createRecord, updateRecord, listFields, listRecords, clearTokenCache } from './lib/feishu-api.js';
import {
  getConfig, isConfigComplete, appendHistory, updateHistoryItem,
  getHistory, normalizeUrl, enqueueSync, getSyncQueue, removeSyncQueueItem,
  savePendingContext, getPendingContext, clearPendingContext, saveReviewDraft,
  getReviewDraft, clearReviewDraft, clearFeishuCredentials
} from './lib/storage.js';
import {
  DEFAULT_FIELD_MAP, REQUIRED_FIELDS, EXPECTED_FIELD_TYPES, FIELD_TYPE_NAMES, STORAGE_KEYS
} from './lib/constants.js';
import { createApplicationRecord, missingReviewFields } from './lib/application-record.js';

// 点击工具栏图标打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- 消息路由 ----------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message.type || !message.type.startsWith('JT_')) return false;

  handle(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: (err && err.message) || String(err) }));
  return true;
});

async function handle(message) {
  switch (message.type) {
    case 'JT_SAVE_RECORD':    return saveRecord(message.record);
    case 'JT_SAVE_LOCAL':     return saveLocal(message.record);
    case 'JT_TEST_CONNECTION': return testConnection(message.config);
    case 'JT_RETRY_SYNC':     return retrySync(message.historyId);
    case 'JT_FETCH_REMOTE':   return fetchRemoteRecords();
    case 'JT_CAPTURE_CONTEXT': return captureContext(message.record);
    case 'JT_GET_PENDING': return { ok: true, context: await getPendingContext(), reviewDraft: await getReviewDraft(), queue: await getSyncQueue() };
    case 'JT_RESULT': return handleResult(message.result);
    case 'JT_CONFIRM_SYNC': return confirmSync(message.record);
    case 'JT_FORCE_SYNC': return syncApplication(createApplicationRecord(message.record), message.recordId);
    case 'JT_SAVE_REVIEW': await saveReviewDraft(createApplicationRecord(message.record)); return { ok: true };
    case 'JT_DISMISS_RESULT': await clearPendingContext(); await clearReviewDraft(); return { ok: true };
    case 'JT_RETRY_QUEUE': return retryQueue(message.id);
    case 'JT_CLEAR_QUEUE': await removeSyncQueueItem(message.id); return { ok: true };
    case 'JT_CLEAR_CREDENTIALS': await clearFeishuCredentials(); await clearTokenCache(); return { ok: true };
    default: return { ok: false, error: `未知消息类型：${message.type}` };
  }
}

async function captureContext(input) {
  const record = createApplicationRecord(input);
  await clearReviewDraft();
  await savePendingContext({ state: 'waiting_result', record, capturedAt: Date.now() });
  return { ok: true, record };
}

async function handleResult(result = {}) {
  const pending = await getPendingContext();
  if (!pending) return { ok: false, error: '未找到待检测的投递上下文' };
  if (result.state === 'failure') { await clearReviewDraft(); await savePendingContext({ ...pending, state: 'failure', evidence: result.evidence || '' }); return { ok: true, state: 'failure' }; }
  if (result.state === 'uncertain') { await clearReviewDraft(); await savePendingContext({ ...pending, state: 'uncertain', evidence: result.evidence || '' }); return { ok: true, state: 'uncertain' }; }
  if (result.state !== 'success') return { ok: true, state: 'waiting_result' };
  const record = createApplicationRecord({ ...pending.record, applicationId: result.applicationId || pending.record.applicationId, submittedAt: Date.now() });
  const missing = missingReviewFields(record);
  if (missing.length) {
    await saveReviewDraft(record);
    await savePendingContext({ ...pending, state: 'reviewing', record, evidence: result.evidence || '' });
    return { ok: true, state: 'reviewing', record, missing };
  }
  return syncApplication(record);
}

async function confirmSync(input) {
  const pending = await getPendingContext();
  const draft = await getReviewDraft();
  const record = createApplicationRecord({ ...(pending?.record || {}), ...(draft || {}), ...(input || {}), submittedAt: pending?.record?.submittedAt || Date.now() });
  if (!record.company && !record.jobName) return { ok: false, error: '公司和岗位名称至少填写一项' };
  return syncApplication(record);
}

// ---------- 记录构造 ----------
function toHistoryItem(record, extra) {
  return {
    id: crypto.randomUUID(),
    company: record.company || '',
    position: record.position || '',
    url: record.url || '',
    normalizedUrl: normalizeUrl(record.url || ''),
    linkText: record.linkText || '',
    appliedAt: record.appliedAt,
    statusValue: record.status || '已投递',
    note: record.note || '',
    ...extra
  };
}

// ---------- 保存 ----------
async function saveRecord(record) {
  const config = await getConfig();
  if (!isConfigComplete(config)) {
    return { ok: false, error: '尚未完成飞书配置，请先在设置页填写凭证' };
  }
  return syncApplication(createApplicationRecord(record));
}

function fieldText(value) {
  if (value && typeof value === 'object') return String(value.link || value.text || '');
  return String(value ?? '');
}

function findMatches(records, record, map) {
  const url = normalizeUrl(record.officialUrl);
  return records.filter(item => {
    const f = item.fields || {};
    const company = fieldText(f[map.company]);
    const jobName = fieldText(f[map.jobName]);
    const jobId = fieldText(f[map.jobId]);
    const location = fieldText(f[map.workLocation]);
    const key = fieldText(f[map.idempotencyKey]);
    const remoteUrl = normalizeUrl(fieldText(f[map.officialUrl]));
    return (record.company && record.jobId && company === record.company && jobId === record.jobId) ||
      (record.company && record.jobName && company === record.company && jobName === record.jobName && (!record.workLocation || location === record.workLocation)) ||
      (url && remoteUrl === url) || (key && key === record.idempotencyKey);
  });
}

async function syncApplication(record, forceRecordId = '') {
  const config = await getConfig();
  if (!isConfigComplete(config)) return { ok: false, error: '尚未完成飞书配置，请先在设置页填写凭证' };
  try {
    const [records, schemaFields] = await Promise.all([listRecords(config), listFields(config)]);
    const schemaByName = new Map(schemaFields.map(field => [field.field_name, field]));
    const availableFieldNames = new Set(Object.keys(DEFAULT_FIELD_MAP)
      .filter(key => schemaByName.get(config.fieldMap[key])?.type === EXPECTED_FIELD_TYPES[key])
      .map(key => config.fieldMap[key]));
    const missingRequired = REQUIRED_FIELDS.filter(key => !availableFieldNames.has(config.fieldMap[key]));
    if (missingRequired.length) return { ok: false, error: `表格缺少必要字段：${missingRequired.map(key => config.fieldMap[key]).join('、')}` };
    const matches = findMatches(records, record, config.fieldMap);
    if (!forceRecordId && matches.length > 1) return { ok: false, conflict: true, error: '发现多条可能重复的投递记录，请选择要更新的记录', matches: matches.map(x => ({ recordId:x.record_id, company:fieldText(x.fields?.[config.fieldMap.company]), jobName:fieldText(x.fields?.[config.fieldMap.jobName]), workLocation:fieldText(x.fields?.[config.fieldMap.workLocation]) })) };
    let recordId, action;
    const selected = forceRecordId ? records.find(x => x.record_id === forceRecordId) : matches[0];
    if (selected) {
      recordId = await updateRecord(config, selected.record_id, record, { availableFieldNames }); action = 'updated';
    } else { recordId = await createRecord(config, record, { availableFieldNames }); action = 'created'; }
    await appendHistory(toHistoryItem({ company: record.company, position: record.jobName, url: record.officialUrl, appliedAt: record.submittedAt, status: record.stage, note: record.note }, { syncState: 'synced', recordId, idempotencyKey: record.idempotencyKey }));
    await clearPendingContext(); await clearReviewDraft();
    return { ok: true, state: 'synced', action, recordId };
  } catch (error) {
    await enqueueSync(record, error.message);
    return { ok: false, state: 'pending_sync', queued: true, error: `同步失败，已加入待同步队列：${error.message}` };
  }
}

async function retryQueue(id) {
  const queue = await getSyncQueue();
  const item = queue.find(x => x.id === id);
  if (!item) return { ok: false, error: '未找到待同步任务' };
  const result = await syncApplication(item.record);
  if (result.ok) await removeSyncQueueItem(id);
  return result;
}

async function saveLocal(record) {
  await appendHistory(toHistoryItem(record, { syncState: 'local-only', recordId: '' }));
  return { ok: true };
}

async function retrySync(historyId) {
  const config = await getConfig();
  if (!isConfigComplete(config)) return { ok: false, error: '尚未完成飞书配置' };
  const history = await getHistory();
  const item = history.find(h => h.id === historyId);
  if (!item) return { ok: false, error: '未找到该条历史记录' };
  const result = await syncApplication(createApplicationRecord(item));
  if (result.ok) await updateHistoryItem(historyId, { syncState: 'synced', recordId: result.recordId });
  return result;
}

// ---------- 连接测试 ----------
async function testConnection(rawConfig) {
  let config;
  if (rawConfig) {
    config = { ...rawConfig, fieldMap: { ...DEFAULT_FIELD_MAP, ...(rawConfig.fieldMap || {}) } };
  } else {
    config = await getConfig();
  }
  if (!isConfigComplete(config)) {
    return { ok: false, error: '请先填写完整的四项凭证（App ID / App Secret / app_token / table_id）' };
  }

  await clearTokenCache();
  const fields = await listFields(config);
  const byName = new Map(fields.map(f => [f.field_name, f]));

  const missing = [];
  const optionalMissing = [];
  const typeWarnings = [];
  for (const key of REQUIRED_FIELDS) {
    const name = config.fieldMap[key];
    const field = byName.get(name);
    if (!field) {
      missing.push(name);
    } else if (field.type !== EXPECTED_FIELD_TYPES[key]) {
      typeWarnings.push(
        `「${name}」应为${FIELD_TYPE_NAMES[EXPECTED_FIELD_TYPES[key]]}类型，` +
        `当前是${FIELD_TYPE_NAMES[field.type] || `类型${field.type}`}`
      );
    }
  }
  for (const key of Object.keys(DEFAULT_FIELD_MAP)) {
    if (!REQUIRED_FIELDS.includes(key) && !byName.has(config.fieldMap[key])) optionalMissing.push(config.fieldMap[key]);
  }
  const optionRequirements = { jobDirection: ['数据','算法','测试','后端开发','产品','其他','客户端','前端开发'], stage: ['已投递','简历挂'], result: ['待通知','未通过'] };
  for (const [key, requiredOptions] of Object.entries(optionRequirements)) {
    const field = byName.get(config.fieldMap[key]);
    if (!field || field.type !== 3) continue;
    const actual = new Set((field.property?.options || []).map(option => option.name));
    const absent = requiredOptions.filter(option => !actual.has(option));
    if (absent.length) typeWarnings.push(`「${config.fieldMap[key]}」缺少选项：${absent.join('、')}`);
  }

  return {
    ok: missing.length === 0 && typeWarnings.length === 0,
    fields: fields.map(f => ({ name: f.field_name, type: FIELD_TYPE_NAMES[f.type] || `类型${f.type}` })),
    missing,
    optionalMissing,
    typeWarnings,
    error: missing.length ? `连接成功，但表格缺少字段：${missing.join('、')}` : typeWarnings.join('；')
  };
}

// ---------- 从飞书拉取全量记录（看板同步用） ----------
async function fetchRemoteRecords() {
  const config = await getConfig();
  if (!isConfigComplete(config)) return { ok: false, error: '尚未完成飞书配置' };

  const rawRecords = await listRecords(config);
  const m = config.fieldMap;

  // 反向映射：飞书列名 → 内部字段名
  const reverseMap = {};
  for (const key of Object.keys(m)) {
    reverseMap[m[key]] = key;
  }

  // 解析飞书记录 → 本地 history 格式
  const historyItems = rawRecords.map(r => {
    const f = r.fields || {};
    const urlField = f[m.officialUrl] || {};
    const linkObj = typeof urlField === 'object' && urlField !== null ? urlField : {};

    return {
      id: crypto.randomUUID(),
      company: String(f[m.company] || ''),
      position: String(f[m.jobName] || ''),
      appliedAt: (() => {
        const v = f[m.submittedAt];
        return typeof v === 'number' ? v : Date.now();
      })(),
      url: typeof linkObj.link === 'string' ? linkObj.link : '',
      normalizedUrl: normalizeUrl(typeof linkObj.link === 'string' ? linkObj.link : ''),
      linkText: typeof linkObj.text === 'string' ? linkObj.text : '',
      statusValue: String(f[m.stage] || '已投递'),
      note: '',
      syncState: 'synced',
      recordId: r.record_id,
      fromRemote: true
    };
  });

  return { ok: true, history: historyItems, fetchedAt: Date.now() };
}
