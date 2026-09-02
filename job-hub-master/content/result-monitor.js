// Observes only real user submission and result signals. It never invokes click/submit.
(() => {
  if (globalThis.__jobHubResultMonitor) return;
  globalThis.__jobHubResultMonitor = true;
  const successText = /投递成功|申请成功|申请已提交|提交申请成功|已成功申请|application submitted|thank you for applying/i;
  const failureText = /投递失败|申请失败|提交失败|验证码错误|登录失效|网络错误|服务异常|required field|必填项|校验失败/i;
  const successUrl = /(?:success|complete|submitted|application-status)(?:[/?#_-]|$)/i;
  const appIdRe = /(?:申请编号|投递编号|application\s*(?:id|number|no\.?))\s*[：:#]?\s*([A-Za-z0-9_-]{4,})/i;
  let active = false;
  let timer = 0;

  function isSubmit(el) {
    const target = el?.closest?.('button,input,[role="button"]');
    if (!target || target.matches('input[type="file"]')) return false;
    const label = `${target.textContent || ''} ${target.value || ''} ${target.getAttribute('aria-label') || ''}`;
    return target.matches('button[type="submit"],input[type="submit"]') || /提交申请|确认投递|立即申请|投递简历|apply now|submit application/i.test(label);
  }
  function text(selectors, max = 5000) {
    for (const selector of selectors.split(',')) {
      const el = document.querySelector(selector.trim());
      const value = el?.textContent?.trim().replace(/\s+/g, ' ');
      if (value) return value.slice(0, max);
    }
    return '';
  }
  function context() {
    const title = text('h1,[class*="job-title"],[class*="jobName"],[class*="position"]', 120);
    const body = document.body?.innerText?.slice(0, 12000) || '';
    const jobId = (body.match(/(?:岗位编号|职位编号|Job\s*ID)\s*[：:#]?\s*([\w-]+)/i) || [,''])[1];
    const location = (body.match(/(?:工作地点|工作地址|地点)\s*[：:]?\s*([^\n]{2,30})/i) || [,''])[1];
    const company = document.querySelector('meta[property="og:site_name"]')?.content || document.title.split(/[|｜-]/).pop()?.trim() || '';
    return { company, jobName: title, jobId, workLocation: location, officialUrl: locationHref(), applicationUrl: locationHref(), jd: text('[class*="job-description"],[class*="jobDetail"],[class*="description"],[class*="requirement"]', 10000) };
  }
  function locationHref() { return globalThis.location.href; }
  async function inspect() {
    if (!active) return;
    const body = document.body?.innerText?.slice(0, 20000) || '';
    const success = successUrl.test(locationHref()) || successText.test(body) || appIdRe.test(body);
    const failure = failureText.test(body);
    const state = success && failure ? 'uncertain' : success ? 'success' : failure ? 'failure' : 'waiting_result';
    if (state !== 'waiting_result') {
      active = false; clearTimeout(timer);
      chrome.runtime.sendMessage({ type: 'JT_RESULT', result: { state, applicationId: (body.match(appIdRe) || [,''])[1], evidence: state === 'success' ? '页面出现明确成功信号' : state === 'failure' ? '页面出现明确失败信号' : '页面信号冲突' } }).catch(() => {});
    }
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || !isSubmit(event.target)) return;
    active = false;
    chrome.runtime.sendMessage({ type: 'JT_CAPTURE_CONTEXT', record: context() }).then(response => {
      if (!response?.ok) return;
      active = true;
      timer = setTimeout(() => {
        if (!active) return; active = false;
        chrome.runtime.sendMessage({ type: 'JT_RESULT', result: { state: 'uncertain', evidence: '等待投递结果超时' } }).catch(() => {});
      }, 20000);
      inspect();
    }).catch(() => {});
  }, true);
  new MutationObserver(() => { if (active) inspect(); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', () => chrome.runtime.sendMessage({ type: 'JT_GET_PENDING' }).then(r => { if (r?.context?.state === 'waiting_result') { active = true; inspect(); } }).catch(() => {}));
})();
