import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('phase-one security boundary',()=>{
 it('uses the JobHub persistent-access model requested by the user',()=>{const manifest=JSON.parse(read('manifest.json'));expect(manifest.permissions).toEqual(['sidePanel','storage','activeTab','scripting']);expect(manifest.host_permissions).toEqual(['<all_urls>']);expect(manifest.content_scripts[0].js).toEqual(['content/fill-engine.js','content/result-monitor.js']);});
 it('keeps AI matcher out of the active resume-fill path',()=>{const source=read('sidepanel/resume-fill.js');expect(source).not.toContain('matchFieldsWithAI');expect(source).not.toContain("type: 'BATCH_FILL'");});
 it('hard-disables legacy AI calls and defaults match scoring to disabled',async()=>{const ai=await import('../lib/ai-client.js');expect(ai.isAiEnabled({enabled:true,apiKey:'secret',provider:'custom'})).toBe(false);await expect(ai.callAI({})).rejects.toThrow('阶段一安全模式');const scoring=await import('../lib/match-scoring.js');expect(await scoring.defaultMatchScorer.score()).toEqual({score:0,confidence:0,matchedRequirements:[],missingRequirements:[],riskFlags:[],explanation:'',provider:'disabled'});});
 it('enables accepted stage-two messages',()=>{const source=read('service-worker.js');expect(source).toContain("case 'JT_CONFIRM_SYNC'");expect(source).not.toContain('阶段一安全模式：飞书同步');});
 it('contains no submission or keyboard automation in the fill engine',()=>{const source=read('content/fill-engine.js');expect(source).not.toMatch(/\.click\s*\(/);expect(source).not.toMatch(/requestSubmit\s*\(/);expect(source).not.toMatch(/\.submit\s*\(/);expect(source).not.toMatch(/KeyboardEvent|keyCode|Enter/);expect(source).not.toMatch(/fetch\s*\(/);});
 it('observes trusted submit clicks without triggering submission or upload',()=>{const source=read('content/result-monitor.js');expect(source).toContain('event.isTrusted');expect(source).not.toMatch(/\.click\s*\(/);expect(source).not.toMatch(/requestSubmit|\.submit\s*\(/);});
});
