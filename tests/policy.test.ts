import {describe,expect,it} from 'vitest';
import {applyPolicyOverrides,effectivePolicy} from '../src/core/policy';
import type {FieldMatch} from '../src/core/types';

const match=(partial:Partial<FieldMatch>):FieldMatch=>({elementId:'x',key:'gender',label:'性别',confidence:.82,policy:'auto',reasons:[],kind:'text',...partial});
describe('policy overrides',()=>{it('允许把普通字段改为确认或禁止',()=>{expect(effectivePolicy(match({key:'gender'}),{gender:'confirm'})).toBe('confirm');expect(effectivePolicy(match({key:'idNumber'}),{idNumber:'forbidden'})).toBe('forbidden');});it('硬禁止字段不能通过设置解除',()=>{expect(effectivePolicy(match({key:undefined,kind:'password',policy:'forbidden'}),{})).toBe('forbidden');expect(effectivePolicy(match({key:undefined,kind:'file',policy:'forbidden'}),{})).toBe('forbidden');});it('批量应用保存的策略',()=>{expect(applyPolicyOverrides([match({key:'gender'})],{gender:'forbidden'})[0].policy).toBe('forbidden');});});
