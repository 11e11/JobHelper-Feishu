import { describe, expect, it } from 'vitest';
import { createApplicationRecord, inferJobDirection, missingReviewFields, normalizeUrl } from '../lib/application-record.js';
import { GenericResultAdapter } from '../lib/result-detector.js';
import { toFeishuFields } from '../lib/feishu-api.js';
import { CLOSED_STATUSES, DEFAULT_FIELD_MAP } from '../lib/constants.js';

describe('stage-two application records', () => {
  it('creates stable idempotency keys and normalizes tracking URLs', () => {
    const a = createApplicationRecord({ company:'九牧', jobName:'后端开发', workLocation:'厦门', officialUrl:'https://jobs.test/a?utm_source=x' }, 1);
    const b = createApplicationRecord({ company:'九牧', jobName:'后端开发', workLocation:'厦门', officialUrl:'https://jobs.test/a' }, 2);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(normalizeUrl(a.officialUrl)).toBe('https://jobs.test/a');
  });
  it('classifies only known directions and reports missing review fields', () => {
    expect(inferJobDirection('Java后端开发工程师')).toBe('后端开发');
    expect(inferJobDirection('法务专员')).toBe('');
    expect(missingReviewFields(createApplicationRecord({company:'九牧',jobName:'产品经理'}))).toContain('workLocation');
  });
  it('serializes the optional note and uses a hyperlink object', () => {
    const record = createApplicationRecord({ company:'九牧', jobName:'产品经理', officialUrl:'https://jobs.test/a', note:'秋招官网投递' }, 1);
    const fields = toFeishuFields({ fieldMap:DEFAULT_FIELD_MAP }, record);
    expect(fields['官网链接']).toEqual({ text:'九牧 · 产品经理', link:'https://jobs.test/a' });
    expect(fields['备注']).toBe('秋招官网投递');
    expect(fields).not.toHaveProperty('是否结束');
  });
  it('does not send an empty note, so updates preserve an existing Feishu note', () => {
    const fields = toFeishuFields({ fieldMap:DEFAULT_FIELD_MAP }, createApplicationRecord({company:'九牧',jobName:'产品经理',note:''}, 1));
    expect(fields).not.toHaveProperty('备注');
  });
  it('treats resume rejection as a closed dashboard status', () => {
    expect(CLOSED_STATUSES.has('简历挂')).toBe(true);
  });
  it('skips optional columns that do not exist in the target table', () => {
    const record = createApplicationRecord({ company:'九牧', jobName:'产品经理', account:'user@example.com' }, 1);
    const available = new Set(['公司','岗位名称']);
    const fields = toFeishuFields({ fieldMap:DEFAULT_FIELD_MAP }, record, { availableFieldNames:available });
    expect(fields).toEqual({公司:'九牧',岗位名称:'产品经理'});
  });
});

describe('generic submission result detection', () => {
  const adapter = new GenericResultAdapter();
  it('detects explicit success and application IDs', () => expect(adapter.detect({text:'申请成功，申请编号 ABC123'})).toMatchObject({state:'success',applicationId:'ABC123'}));
  it('does not treat a click alone as success', () => expect(adapter.detect({text:'正在处理'}).state).toBe('waiting_result'));
  it('detects validation and captcha failures', () => expect(adapter.detect({text:'验证码错误，请填写必填项'}).state).toBe('failure'));
  it('returns uncertain when signals conflict', () => expect(adapter.detect({text:'申请成功，但提交失败'}).state).toBe('uncertain'));
});
