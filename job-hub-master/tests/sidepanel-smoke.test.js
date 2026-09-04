import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';

const html=readFileSync('sidepanel/sidepanel.html','utf8');
function storageArea(store){return {async get(keys){if(typeof keys==='string')return {[keys]:store[keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,store[k]]));return {...store};},async set(values){Object.assign(store,values);},async remove(keys){for(const key of(Array.isArray(keys)?keys:[keys]))delete store[key];}};}

describe('sidepanel startup',()=>{
 beforeEach(()=>{vi.resetModules();document.open();document.write(html);document.close();const local={};globalThis.chrome={storage:{local:storageArea(local),session:storageArea({})},tabs:{query:vi.fn(async()=>[{id:123,url:'https://example.test/apply'}]),get:vi.fn(async()=>({id:123,url:'https://example.test/apply'})),sendMessage:vi.fn(),onActivated:{addListener:vi.fn(),removeListener:vi.fn()},onUpdated:{addListener:vi.fn(),removeListener:vi.fn()}},scripting:{executeScript:vi.fn()},permissions:{contains:vi.fn(async()=>false),request:vi.fn(async()=>true)},runtime:{openOptionsPage:vi.fn(),sendMessage:vi.fn()}};});
 it('boots the resume panel without missing-element or module errors',async()=>{const error=vi.spyOn(console,'error').mockImplementation(()=>{});await import('../sidepanel/sidepanel.js?smoke='+Math.random());document.dispatchEvent(new Event('DOMContentLoaded'));await vi.waitFor(()=>expect(document.querySelector('#rfProfileSelect option')?.textContent).toBe('我的简历'));expect(document.querySelector('#panel-resume-fill')?.classList.contains('active')).toBe(true);expect(document.querySelector('#rfScanBtn')).not.toBeNull();expect(error).not.toHaveBeenCalled();});
 it('keeps AI hidden and exposes accepted stage-two tabs',()=>{expect(document.querySelector('#rfAiBtn')?.classList.contains('hidden')).toBe(true);expect(document.querySelector('[data-tab="job-tracker"]')?.classList.contains('hidden')).toBe(false);expect(document.querySelector('[data-tab="dashboard"]')?.classList.contains('hidden')).toBe(false);});
 it('includes note review input and the resume-rejected stage',async()=>{const {STAGE_OPTIONS}=await import('../lib/constants.js?tracker='+Math.random());expect(STAGE_OPTIONS).toContain('简历挂');expect(document.querySelector('#jtrNote')).not.toBeNull();});
});
