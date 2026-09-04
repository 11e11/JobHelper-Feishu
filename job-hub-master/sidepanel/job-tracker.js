// ================================================================
// JobHub — Job Tracker Panel (投递追踪面板)
// 从 job-tracker-extension/sidepanel/sidepanel.js 适配
// 变更：export init/destroy、DOM 作用域限定、Neo-Brutalist 样式类名
// ================================================================
import { getConfig, isConfigComplete, findDuplicate, getDraft, saveDraft, clearDraft } from '../lib/storage.js';
import { STATUS_OPTIONS, JOB_DIRECTION_OPTIONS, RESULT_OPTIONS } from '../lib/constants.js';

// ============ Module State ============
let container, pageTitle, dirty, scrapedData = {};
let tabActivatedListener, tabUpdatedListener;
let runtimeListener;

const FORM_IDS = ['jtCompany', 'jtPosition', 'jtTime', 'jtUrl', 'jtStatus', 'jtNote'];

// Scoped querySelector
function $(id) {
  return container ? container.querySelector('#' + id) : null;
}

// ============ Init / Destroy ============
export async function init(containerEl) {
  container = containerEl;

  // Fill status select
  const statusSelect = $('jtStatus');
  if (statusSelect && statusSelect.options.length === 0) {
    STATUS_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === '已投递') o.selected = true;
      statusSelect.appendChild(o);
    });
  }
  fillSelect($('jtrJobDirection'), ['', ...JOB_DIRECTION_OPTIONS]);
  fillSelect($('jtrStage'), STATUS_OPTIONS, '已投递');
  fillSelect($('jtrResult'), RESULT_OPTIONS, '待通知');
  $('jtrStage')?.addEventListener('change', () => {
    if ($('jtrStage').value === '简历挂' && $('jtrResult')?.value === '待通知') $('jtrResult').value = '未通过';
  });

  const config = await getConfig();
  if (!isConfigComplete(config)) {
    showView('jtViewForm');
    const setupButton = $('jtBtnOpenOptions');
    if (setupButton) setupButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
    const msg = $('jtMsg');
    if (msg) { msg.textContent = '尚未配置 App Secret；可以先测试检测与补全，同步前再配置。'; msg.className = 'msg warn'; }
  } else {
    showView('jtViewForm');
  }
  bindForm();
  runtimeListener = message => { if (message?.type === 'JT_RESULT') setTimeout(refreshPendingState, 200); };
  chrome.runtime.onMessage.addListener(runtimeListener);

  // Draft recovery
  const tab = await activeTab();
  const draft = await getDraft();
  if (draft && tab && draft.tabUrl === tab.url) {
    restoreDraft(draft);
    dirty = true;
    const hint = $('jtScrapeHint');
    if (hint) hint.textContent = '已恢复未保存的草稿';
  } else {
    await refreshFromTab();
  }
  await refreshPendingState();

  // Watch tab switches
  tabActivatedListener = () => onTabChanged();
  tabUpdatedListener = (_tabId, changeInfo, t) => {
    if (changeInfo.status === 'complete' && t.active) onTabChanged();
  };
  chrome.tabs.onActivated.addListener(tabActivatedListener);
  chrome.tabs.onUpdated.addListener(tabUpdatedListener);
}

export function destroy() {
  if (tabActivatedListener) chrome.tabs.onActivated.removeListener(tabActivatedListener);
  if (tabUpdatedListener) chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
  if (runtimeListener) chrome.runtime.onMessage.removeListener(runtimeListener);
  tabActivatedListener = null;
  tabUpdatedListener = null;
  container = null;
}

function fillSelect(select, values, selected = '') {
  if (!select || select.options.length) return;
  values.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value || '留空'; option.selected = value === selected; select.appendChild(option); });
}

// ============ Tab Change ============
async function onTabChanged() {
  if (dirty) {
    const hint = $('jtScrapeHint');
    if (hint) hint.textContent = '页面已变化，可点「↻ 重新抓取」带入当前页信息';
    return;
  }
  await refreshFromTab();
}

// ============ Scrape ============
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function refreshFromTab() {
  resetForm();
  const tab = await activeTab();
  const tabUrl = (tab && tab.url) || '';
  if (!/^https?:\/\//.test(tabUrl)) {
    const hint = $('jtScrapeHint');
    if (hint) hint.textContent = '当前页面无法抓取，请手动填写';
    return;
  }
  const urlEl = $('jtUrl');
  if (urlEl) urlEl.value = tabUrl;
  await scrapePage(tab.id);
  await checkDuplicate();
  dirty = false;
}

async function scrapePage(tabId) {
  let result = null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/scraper.js']
    });
    result = injection && injection.result;
  } catch { /* restricted page */ }

  const hint = $('jtScrapeHint');
  if (!result) {
    if (hint) hint.textContent = '未能抓取页面信息，请手动填写';
    return;
  }
  pageTitle = result.pageTitle || '';
  scrapedData = result;
  if (result.company) { const el = $('jtCompany'); if (el) el.value = result.company; }
  if (result.position) { const el = $('jtPosition'); if (el) el.value = result.position; }
  if (result.url) { const el = $('jtUrl'); if (el) el.value = result.url; }

  const LOW = new Set(['hostname', 'fallback']);
  const compEl = $('jtCompany');
  const posEl = $('jtPosition');
  if (compEl) compEl.classList.toggle('jt-low-confidence', LOW.has(result.confidence.company));
  if (posEl) posEl.classList.toggle('jt-low-confidence', LOW.has(result.confidence.position));
  if (hint) {
    hint.textContent = LOW.has(result.confidence.company) || LOW.has(result.confidence.position)
      ? '橙色字段为推测值，请核对' : '已抓取当前页面信息';
  }
}

async function checkDuplicate() {
  const banner = $('jtDupBanner');
  banner.classList.add('hidden');
  const urlEl = $('jtUrl');
  const url = urlEl ? urlEl.value.trim() : '';
  if (!url) return;
  const dup = await findDuplicate(url);
  if (dup) {
    const days = Math.floor((Date.now() - dup.appliedAt) / 86400000);
    const when = days <= 0 ? '今天' : `${days} 天前`;
    banner.textContent = `⚠ ${when}已投递过此链接（${dup.company} · ${dup.position}）`;
    banner.classList.remove('hidden');
  }
}

// ============ Form ============
function bindForm() {
  $('jtBtnSave').addEventListener('click', onSave);
  $('jtBtnSaveLocal').addEventListener('click', onSaveLocal);
  $('jtBtnRescrape').addEventListener('click', async () => {
    await clearDraft();
    dirty = false;
    await refreshFromTab();
  });
  $('jtLinkOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  $('jtrSync')?.addEventListener('click', syncReview);
  $('jtrLater')?.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type:'JT_SAVE_REVIEW', record:collectReviewRecord() }); $('jtReview').classList.add('hidden'); });

  FORM_IDS.forEach(id => {
    const el = document.getElementById(id); // these are unique IDs, document.getElementById is fine
    if (el) {
      el.addEventListener('input', onUserEdit);
      el.addEventListener('change', onUserEdit);
    }
  });
}

async function refreshPendingState() {
  const response = await chrome.runtime.sendMessage({ type: 'JT_GET_PENDING' });
  if (!response?.ok) return;
  renderQueue(response.queue || []);
  const pending = response.context;
  const banner = $('jtResultBanner');
  $('jtReview')?.classList.add('hidden');
  banner.classList.add('hidden');
  banner.replaceChildren();
  if (pending?.state === 'reviewing' || response.reviewDraft) {
    showReview(response.reviewDraft || pending.record); return;
  }
  if (pending?.state === 'uncertain') {
    banner.textContent = '无法确认是否投递成功。请在确认后选择：确认已投递 / 投递失败 / 暂不处理';
    banner.innerHTML += '<div style="margin-top:8px"><button class="btn btn-sm" id="jtConfirmSuccess">确认已投递</button> <button class="btn btn-sm" id="jtConfirmFailure">投递失败</button></div>';
    banner.classList.remove('hidden');
    banner.querySelector('#jtConfirmSuccess').onclick = () => showReview(pending.record);
    banner.querySelector('#jtConfirmFailure').onclick = async () => { await chrome.runtime.sendMessage({ type:'JT_DISMISS_RESULT' }); banner.classList.add('hidden'); };
  } else if (pending?.state === 'failure') {
    banner.textContent = '检测到投递失败，未同步飞书。'; banner.classList.remove('hidden');
  }
}

function renderQueue(queue) {
  const banner = $('jtQueueBanner');
  if (!banner) return;
  if (!queue.length) { banner.classList.add('hidden'); return; }
  banner.innerHTML = `<strong>待同步 ${queue.length} 项</strong>` + queue.map(item => `<div class="jt-queue-row"><span>${escapeHtml(item.record?.company || '')} · ${escapeHtml(item.record?.jobName || '')}<br><small>${escapeHtml(item.error || '')}</small></span><button class="btn btn-sm" data-retry="${item.id}">重试</button><button class="btn btn-sm" data-clear="${item.id}">清除</button></div>`).join('');
  banner.classList.remove('hidden');
  banner.querySelectorAll('[data-retry]').forEach(btn => btn.onclick = async () => { btn.disabled = true; await chrome.runtime.sendMessage({type:'JT_RETRY_QUEUE',id:btn.dataset.retry}); await refreshPendingState(); });
  banner.querySelectorAll('[data-clear]').forEach(btn => btn.onclick = async () => { await chrome.runtime.sendMessage({type:'JT_CLEAR_QUEUE',id:btn.dataset.clear}); await refreshPendingState(); });
}

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }

function showReview(record = {}) {
  const ids = { company:'Company', jobName:'JobName', jobId:'JobId', jobDirection:'JobDirection', workLocation:'WorkLocation', officialUrl:'OfficialUrl', jd:'Jd', account:'Account', resumeVersion:'ResumeVersion', applicationId:'ApplicationId', stage:'Stage', result:'Result', note:'Note' };
  for (const [key, suffix] of Object.entries(ids)) { const el = $('jtr' + suffix); if (el) el.value = record[key] || (key === 'stage' ? '已投递' : key === 'result' ? '待通知' : ''); }
  $('jtrSubmittedAt').value = toLocalInputValue(new Date(record.submittedAt || Date.now()));
  $('jtReview').classList.remove('hidden');
}

async function syncReview() {
  const record = collectReviewRecord();
  if (!record.company && !record.jobName) { const msg = $('jtrMsg'); msg.textContent = '公司和岗位名称至少填写一项'; msg.className = 'msg error'; return; }
  const button = $('jtrSync'); button.disabled = true; button.textContent = '同步中…';
  const response = await chrome.runtime.sendMessage({ type:'JT_CONFIRM_SYNC', record });
  button.disabled = false; button.textContent = '确认并同步飞书';
  if (response?.ok) { $('jtReview').classList.add('hidden'); await refreshPendingState(); showMsg(`✓ 已${response.action === 'updated' ? '更新' : '新增'}飞书记录`, 'success'); }
  else if (response?.conflict) { showConflictChoices(response.matches, record); }
  else { const msg = $('jtrMsg'); msg.textContent = response?.error || '同步失败'; msg.className = 'msg error'; }
}

function collectReviewRecord() {
  const keys = { company:'Company', jobName:'JobName', jobId:'JobId', jobDirection:'JobDirection', workLocation:'WorkLocation', officialUrl:'OfficialUrl', jd:'Jd', account:'Account', resumeVersion:'ResumeVersion', applicationId:'ApplicationId', stage:'Stage', result:'Result', note:'Note' };
  const record = {};
  for (const [key, suffix] of Object.entries(keys)) record[key] = $('jtr' + suffix)?.value.trim() || '';
  record.submittedAt = new Date($('jtrSubmittedAt').value).getTime();
  return record;
}

function showConflictChoices(matches = [], record) {
  const msg = $('jtrMsg');
  msg.innerHTML = '<strong>发现多条可能重复记录，请选择更新目标：</strong>' + matches.map(match => `<button class="btn btn-sm jt-conflict" data-record-id="${match.recordId}">${escapeHtml(match.company)} · ${escapeHtml(match.jobName)} · ${escapeHtml(match.workLocation)}</button>`).join('');
  msg.className = 'msg warn';
  msg.querySelectorAll('.jt-conflict').forEach(button => button.onclick = async () => {
    button.disabled = true;
    const response = await chrome.runtime.sendMessage({ type:'JT_FORCE_SYNC', record, recordId:button.dataset.recordId });
    if (response?.ok) { $('jtReview').classList.add('hidden'); await refreshPendingState(); showMsg('✓ 已更新所选飞书记录', 'success'); }
    else { msg.textContent = response?.error || '同步失败'; msg.className = 'msg error'; }
  });
}

async function onUserEdit() {
  dirty = true;
  const tab = await activeTab();
  const values = {};
  FORM_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) values[id] = el.value;
  });
  await saveDraft({ tabUrl: (tab && tab.url) || '', pageTitle, values });
}

function restoreDraft(draft) {
  pageTitle = draft.pageTitle || '';
  FORM_IDS.forEach(id => {
    if (draft.values && draft.values[id] !== undefined) {
      const el = document.getElementById(id);
      if (el) el.value = draft.values[id];
    }
  });
}

function resetForm() {
  ['jtCompany','jtPosition','jtUrl','jtNote'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const timeEl = document.getElementById('jtTime');
  if (timeEl) timeEl.value = toLocalInputValue(new Date());
  const statusEl = document.getElementById('jtStatus');
  if (statusEl) statusEl.value = '已投递';
  ['jtCompany','jtPosition'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('jt-low-confidence');
  });
  const dupBanner = $('jtDupBanner');
  if (dupBanner) dupBanner.classList.add('hidden');
  const msgEl = $('jtMsg');
  if (msgEl) { msgEl.className = 'msg hidden'; }
  const saveBtn = $('jtBtnSave');
  if (saveBtn) saveBtn.textContent = '保存到飞书';
  const saveLocalBtn = $('jtBtnSaveLocal');
  if (saveLocalBtn) saveLocalBtn.classList.add('hidden');
  const hint = $('jtScrapeHint');
  if (hint) hint.textContent = '';
  pageTitle = '';
}

function collectRecord() {
  const getVal = (suffix) => {
    const el = document.getElementById('jt' + suffix);
    return el ? el.value.trim() : '';
  };
  const company = getVal('Company');
  const position = getVal('Position');
  return {
    company,
    position, jobName: position,
    jobId: scrapedData.jobId || '', jobDirection: scrapedData.jobDirection || '',
    workLocation: scrapedData.workLocation || '', jd: scrapedData.jd || '',
    appliedAt: (() => {
      const el = document.getElementById('jtTime');
      return el && el.value ? new Date(el.value).getTime() : Date.now();
    })(),
    url: getVal('Url'), officialUrl: getVal('Url'),
    linkText: pageTitle || [company, position].filter(Boolean).join(' · '),
    status: (() => { const el = document.getElementById('jtStatus'); return el ? el.value : '已投递'; })(),
    note: getVal('Note'), stage: (() => { const el = document.getElementById('jtStatus'); return el ? el.value : '已投递'; })(), result: (() => { const el = document.getElementById('jtStatus'); return el?.value === '简历挂' ? '未通过' : '待通知'; })()
  };
}

// ============ Save ============
async function onSave() {
  const record = collectRecord();
  if (!record.company && !record.position) {
    showMsg('公司和岗位至少填一项', 'error');
    return;
  }
  showReview(record);
}

async function onSaveLocal() {
  const record = collectRecord();
  const resp = await chrome.runtime.sendMessage({ type: 'JT_SAVE_LOCAL', record });
  if (resp && resp.ok) {
    await clearDraft();
    dirty = false;
    showMsg('✓ 已保存到本地，可稍后在设置页重试同步', 'success');
  } else {
    showMsg('本地保存失败', 'error');
  }
}

// ============ Utils ============
function showView(viewId) {
  container.querySelectorAll('.jt-view').forEach(v => v.classList.add('hidden'));
  const el = container.querySelector('#' + viewId);
  if (el) el.classList.remove('hidden');
}

function showMsg(text, kind) {
  const msg = $('jtMsg');
  msg.textContent = text;
  msg.className = 'msg ' + kind;
}

function setBusy(busy, label) {
  const btn = $('jtBtnSave');
  btn.disabled = busy;
  btn.textContent = busy ? label : '保存到飞书';
}

function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
