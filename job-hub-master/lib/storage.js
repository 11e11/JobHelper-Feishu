// ================================================================
// JobHub — Storage 封装
// af_*: 多简历管理    jt_*: 投递追踪
// ================================================================
import { STORAGE_KEYS, HISTORY_LIMIT, DEFAULT_FIELD_MAP, createEmptyProfile } from './constants.js';

// ==================== 简历管理 ====================

export async function getProfiles() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.profiles);
  let profiles = data[STORAGE_KEYS.profiles];
  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    // 首次使用：创建默认空简历
    profiles = [createEmptyProfile('我的简历')];
    await chrome.storage.local.set({
      [STORAGE_KEYS.profiles]: profiles,
      [STORAGE_KEYS.activeProfileId]: profiles[0].id
    });
  } else if (migrateProfiles(profiles)) {
    await chrome.storage.local.set({ [STORAGE_KEYS.profiles]: profiles });
  }
  return profiles;
}

function migrateProfiles(profiles) {
  let changed = false;
  const ensure = (category, labels) => labels.forEach(label => {
    if (!category.fields.some(field => field.label === label)) { category.fields.push({ label, value: '' }); changed = true; }
  });
  for (const profile of profiles) {
    const basic = profile.categories?.find(category => category.id === 'basic');
    if (basic) ensure(basic, ['现居住地址','户籍地址','籍贯','邮政编码','身高','体重']);
    const skills = profile.categories?.find(category => category.id === 'skills');
    if (skills) ensure(skills, ['英语等级','CET4成绩','CET6成绩']);
    const education = profile.categories?.find(category => category.id === 'education');
    if (!education) continue;
    const legacy = education.fields.filter(field => /^时间\d+$/.test(field.label));
    for (const field of legacy) {
      const n = field.label.match(/\d+$/)[0];
      const raw = String(field.value || '').trim();
      const range = raw.match(/^(\d{4}(?:[./年-]\d{1,2})?(?:[./月-]\d{1,2})?)\s*(?:至|到|—|–|~|～|-)\s*(\d{4}(?:[./年-]\d{1,2})?(?:[./月-]\d{1,2})?)$/);
      field.label = `入学时间${n}`;
      field.value = range?.[1] || field.value;
      if (!education.fields.some(item => item.label === `毕业时间${n}`)) education.fields.push({ label:`毕业时间${n}`, value:range?.[2] || '' });
      changed = true;
    }
  }
  return changed;
}

export async function getActiveProfileId() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.activeProfileId);
  return data[STORAGE_KEYS.activeProfileId] || null;
}

export async function getActiveProfile() {
  const [profiles, activeId] = await Promise.all([getProfiles(), getActiveProfileId()]);
  return profiles.find(p => p.id === activeId) || profiles[0] || null;
}

export async function saveProfiles(profiles) {
  await chrome.storage.local.set({ [STORAGE_KEYS.profiles]: profiles });
}

export async function setActiveProfileId(id) {
  await chrome.storage.local.set({ [STORAGE_KEYS.activeProfileId]: id });
}

export async function saveActiveProfile(profile) {
  const profiles = await getProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profile.updatedAt = Date.now();
    profiles[idx] = profile;
    await saveProfiles(profiles);
  }
}

export async function addProfile(name) {
  const profiles = await getProfiles();
  const profile = createEmptyProfile(name);
  profiles.push(profile);
  await saveProfiles(profiles);
  await setActiveProfileId(profile.id);
  return profile;
}

export async function deleteProfile(id) {
  const profiles = await getProfiles();
  if (profiles.length <= 1) return false; // 至少保留一份
  const filtered = profiles.filter(p => p.id !== id);
  await saveProfiles(filtered);
  // 如果删除的是当前激活的，切换到第一份
  const activeId = await getActiveProfileId();
  if (activeId === id) {
    await setActiveProfileId(filtered[0].id);
  }
  return true;
}

export async function duplicateProfile(id) {
  const profiles = await getProfiles();
  const src = profiles.find(p => p.id === id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = crypto.randomUUID();
  copy.name = src.name + ' (副本)';
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  profiles.push(copy);
  await saveProfiles(profiles);
  await setActiveProfileId(copy.id);
  return copy;
}

export async function renameProfile(id, newName) {
  const profiles = await getProfiles();
  const p = profiles.find(p => p.id === id);
  if (p && newName.trim()) {
    p.name = newName.trim();
    p.updatedAt = Date.now();
    await saveProfiles(profiles);
    return true;
  }
  return false;
}

// ==================== 飞书配置 ====================

export async function getConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.config);
  const config = data[STORAGE_KEYS.config];
  if (!config) return null;
  return { ...config, fieldMap: { ...DEFAULT_FIELD_MAP, ...(config.fieldMap || {}) } };
}

export function isConfigComplete(config) {
  return !!(config && config.appId && config.appSecret && config.appToken && config.tableId);
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ [STORAGE_KEYS.config]: config });
}

export async function clearFeishuCredentials() {
  const config = await getConfig();
  if (!config) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.config]: { ...config, appSecret: '' } });
  await chrome.storage.session.remove(STORAGE_KEYS.token);
}

export async function getSyncQueue() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.syncQueue);
  return data[STORAGE_KEYS.syncQueue] || [];
}

export async function enqueueSync(record, error = '') {
  const queue = await getSyncQueue();
  const existing = queue.find(item => item.idempotencyKey === record.idempotencyKey);
  if (existing) Object.assign(existing, { record, error, retryCount: existing.retryCount + 1, updatedAt: Date.now() });
  else queue.push({ id: crypto.randomUUID(), idempotencyKey: record.idempotencyKey, record, error, retryCount: 0, createdAt: Date.now(), updatedAt: Date.now() });
  await chrome.storage.local.set({ [STORAGE_KEYS.syncQueue]: queue });
  return existing || queue[queue.length - 1];
}

export async function removeSyncQueueItem(id) {
  const queue = await getSyncQueue();
  await chrome.storage.local.set({ [STORAGE_KEYS.syncQueue]: queue.filter(item => item.id !== id) });
}

export async function savePendingContext(context) {
  await chrome.storage.local.set({ [STORAGE_KEYS.pendingContext]: context });
}
export async function getPendingContext() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.pendingContext);
  return data[STORAGE_KEYS.pendingContext] || null;
}
export async function clearPendingContext() { await chrome.storage.local.remove(STORAGE_KEYS.pendingContext); }
export async function saveReviewDraft(record) { await chrome.storage.local.set({ [STORAGE_KEYS.reviewDraft]: record }); }
export async function getReviewDraft() { const data = await chrome.storage.local.get(STORAGE_KEYS.reviewDraft); return data[STORAGE_KEYS.reviewDraft] || null; }
export async function clearReviewDraft() { await chrome.storage.local.remove(STORAGE_KEYS.reviewDraft); }

// ==================== 投递历史 ====================

export async function getHistory() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  return data[STORAGE_KEYS.history] || [];
}

export async function appendHistory(item) {
  const history = await getHistory();
  history.unshift(item);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
}

export async function updateHistoryItem(id, patch) {
  const history = await getHistory();
  const idx = history.findIndex(h => h.id === id);
  if (idx === -1) return false;
  history[idx] = { ...history[idx], ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  return true;
}

export async function clearHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.history);
}

// ==================== URL 规范化 ====================

export function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const toDelete = [];
    for (const key of u.searchParams.keys()) {
      if (/^utm_/i.test(key) || ['spm', 'from', 'ref'].includes(key.toLowerCase())) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => u.searchParams.delete(k));
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return rawUrl;
  }
}

export async function findDuplicate(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const history = await getHistory();
  return history.find(h => h.normalizedUrl === normalized) || null;
}

// ==================== 草稿 ====================

export async function getDraft() {
  const data = await chrome.storage.session.get(STORAGE_KEYS.draft);
  return data[STORAGE_KEYS.draft] || null;
}

export async function saveDraft(draft) {
  await chrome.storage.session.set({ [STORAGE_KEYS.draft]: draft });
}

export async function clearDraft() {
  await chrome.storage.session.remove(STORAGE_KEYS.draft);
}
