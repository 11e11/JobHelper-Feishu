import { JOB_DIRECTION_OPTIONS } from './constants.js';

export function normalizeUrl(raw = '') {
  try {
    const url = new URL(raw);
    url.hash = '';
    [...url.searchParams.keys()].forEach(key => {
      if (/^utm_/i.test(key) || ['spm','from','ref','source'].includes(key.toLowerCase())) url.searchParams.delete(key);
    });
    return url.toString();
  } catch { return raw || ''; }
}

export function inferJobDirection(text = '') {
  const rules = [
    ['算法', /算法|机器学习|深度学习|nlp|推荐|搜索|视觉|大模型/i],
    ['数据', /数据分析|数据开发|数据工程|商业分析|bi\b/i],
    ['测试', /测试|测开|qa\b|quality assurance/i],
    ['后端开发', /后端|服务端|java|golang|go开发|python开发|c\+\+/i],
    ['前端开发', /前端|web开发|javascript|typescript|react|vue/i],
    ['客户端', /客户端|android|ios|移动端/i],
    ['产品', /产品经理|产品运营|产品策划/i]
  ];
  const found = rules.find(([, re]) => re.test(text));
  return found && JOB_DIRECTION_OPTIONS.includes(found[0]) ? found[0] : '';
}

export function createApplicationRecord(input = {}, now = Date.now()) {
  const officialUrl = normalizeUrl(input.officialUrl || input.url || '');
  const company = String(input.company || '').trim();
  const jobName = String(input.jobName || input.position || '').trim();
  const jobId = String(input.jobId || '').trim();
  const workLocation = String(input.workLocation || '').trim();
  const identity = jobId ? `${company}|id:${jobId}` : `${company}|${jobName}|${workLocation}|${officialUrl}`;
  return {
    recId: input.recId || crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey || stableHash(identity),
    company, jobName, jobId,
    jobDirection: input.jobDirection || inferJobDirection(`${jobName}\n${input.jd || ''}`),
    workLocation, officialUrl,
    applicationUrl: input.applicationUrl || officialUrl,
    jd: String(input.jd || '').trim(), account: String(input.account || '').trim(),
    resumeVersion: String(input.resumeVersion || '').trim(),
    applicationId: String(input.applicationId || '').trim(),
    stage: input.stage || '已投递', result: input.result || '待通知',
    submittedAt: Number(input.submittedAt || input.appliedAt || now), updatedAt: now,
    tabId: input.tabId ?? null
  };
}

export function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `job_${(hash >>> 0).toString(36)}`;
}

export function missingReviewFields(record) {
  return ['company','jobName','jobId','jobDirection','workLocation','officialUrl','jd','account','resumeVersion','applicationId']
    .filter(key => !record[key]);
}
