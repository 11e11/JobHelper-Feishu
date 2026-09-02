import {beforeEach,describe,expect,it} from 'vitest';
import {DictionaryDetector} from '../src/core/detector';

describe('DictionaryDetector',()=>{
 beforeEach(()=>document.body.innerHTML='');
 it('识别中文普通字段并赋予自动策略',()=>{document.body.innerHTML='<label for="p">手机号码</label><input id="p">';const [match]=new DictionaryDetector().scan(document);expect(match.key).toBe('phone');expect(match.policy).toBe('auto');expect(match.confidence).toBeGreaterThanOrEqual(.8);});
 it('把身份证识别为可配置资料字段',()=>{document.body.innerHTML='<label>身份证号码<input></label>';const [match]=new DictionaryDetector().scan(document);expect(match.key).toBe('idNumber');expect(match.policy).toBe('auto');});
 it('始终禁止密码和文件上传',()=>{document.body.innerHTML='<label>密码<input type="password"></label><label>上传简历<input type="file"></label>';const matches=new DictionaryDetector().scan(document);expect(matches).toHaveLength(2);expect(matches.every(x=>x.policy==='forbidden')).toBe(true);});
 it('低置信度未知字段不自动填写',()=>{document.body.innerHTML='<input placeholder="请回答">';const [match]=new DictionaryDetector().scan(document);expect(match.key).toBeUndefined();expect(match.policy).toBe('confirm');expect(match.confidence).toBe(0);});
});
