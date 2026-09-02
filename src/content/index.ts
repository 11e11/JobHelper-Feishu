import { DictionaryDetector } from '../core/detector';
import { fillSafe, profileValue, undoLastFill } from '../core/filler';
import type { FieldMatch, Profile, SiteMapping } from '../core/types';
const detector=new DictionaryDetector(); let matches:FieldMatch[]=[];
chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{ void (async()=>{
 if(msg.type==='SCAN'){matches=detector.scan(document); const saved=(await chrome.storage.local.get('siteMappings')).siteMappings as Record<string,SiteMapping[]>|undefined; for(const m of saved?.[location.hostname]??[]){const hit=matches.find(x=>x.label===m.signature);if(hit){hit.key=m.key;hit.confidence=1;hit.policy='auto';hit.reasons=['已保存的网站映射'];}} respond({ok:true,matches});}
 else if(msg.type==='FILL'){if(!matches.length)matches=detector.scan(document);const p=(await chrome.storage.local.get('profile')).profile as Profile??{};const candidates=matches.filter(m=>m.key&&(msg.elementId?m.elementId===msg.elementId:m.policy==='auto'&&m.confidence>=.8));const valuesAvailable=candidates.filter(m=>profileValue(p,m)!==undefined&&profileValue(p,m)!=='').length;respond({ok:true,count:fillSafe(matches,p,msg.elementId,msg.confirmed===true),matchesFound:matches.length,candidates:candidates.length,valuesAvailable});}
 else if(msg.type==='UNDO')respond({ok:true,count:undoLastFill()});
 else if(msg.type==='SAVE_MAPPING'){const data=await chrome.storage.local.get('siteMappings');const all=data.siteMappings??{};all[location.hostname]=matches.filter(x=>x.key).map(x=>({signature:x.label,key:x.key}));await chrome.storage.local.set({siteMappings:all});respond({ok:true});}
 })().catch(e=>respond({ok:false,error:String(e)})); return true;});
