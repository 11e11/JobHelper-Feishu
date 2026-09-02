const SUCCESS_TEXT = /投递成功|申请成功|申请已提交|提交申请成功|已成功申请|application submitted|thank you for applying/i;
const FAILURE_TEXT = /投递失败|申请失败|提交失败|验证码错误|登录失效|网络错误|服务异常|required field|必填项|请填写|校验失败/i;
const SUCCESS_URL = /(?:success|complete|submitted|application-status)(?:[/?#_-]|$)/i;
const APPLICATION_ID = /(?:申请编号|投递编号|application\s*(?:id|number|no\.?))\s*[：:#]?\s*([A-Za-z0-9_-]{4,})/i;

export class GenericResultAdapter {
  constructor(timeout = 15000) { this.timeout = timeout; }
  isSubmitControl(el) {
    if (!el || el.matches?.('input[type="file"]')) return false;
    const text = `${el.textContent || ''} ${el.value || ''} ${el.getAttribute?.('aria-label') || ''}`;
    return el.matches?.('button[type="submit"],input[type="submit"]') || /提交申请|确认投递|立即申请|投递简历|apply now|submit application/i.test(text);
  }
  detect({ url = '', text = '', formVisible = true } = {}) {
    const success = SUCCESS_URL.test(url) || SUCCESS_TEXT.test(text) || APPLICATION_ID.test(text) || (!formVisible && SUCCESS_TEXT.test(text));
    const failure = FAILURE_TEXT.test(text);
    return { state: success && failure ? 'uncertain' : success ? 'success' : failure ? 'failure' : 'waiting_result', applicationId: this.extractApplicationId(text) };
  }
  extractApplicationId(text = '') { return (text.match(APPLICATION_ID) || [,''])[1]; }
}

export class JomooResultAdapter extends GenericResultAdapter {
  matches(hostname = '') { return /jomoo|jiusheng|hotjob|beisen/i.test(hostname); }
}

export function selectResultAdapter(hostname = '') {
  const jomoo = new JomooResultAdapter(20000);
  return jomoo.matches(hostname) ? jomoo : new GenericResultAdapter();
}
