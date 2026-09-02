import { FORBIDDEN_TERMS, TERMS, policyFor } from './dictionary';
import { EDUCATION_KEYS, type FieldDetector, type FieldMatch, type ProfileKey } from './types';

const SELECTOR='input:not([type=hidden]),textarea,select,[role=combobox],[role=listbox],[contenteditable=true]';
export function elementText(el:HTMLElement):string {
 const input=el as HTMLInputElement; const labels=input.labels ? [...input.labels].map(x=>x.textContent) : [];
 const wrapping=el.closest('label')?.textContent; const nearby=el.parentElement?.textContent?.slice(0,160); const needsGroup=input instanceof HTMLInputElement&&['radio','checkbox'].includes(input.type); const group=needsGroup?el.closest('fieldset,[role=radiogroup],[role=group]')?.textContent?.slice(0,200):undefined;
 return [labels.join(' '),wrapping,input.name,el.id,input.placeholder,input.autocomplete,el.getAttribute('aria-label'),el.getAttribute('data-label'),nearby,group].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
export function stableId(el:HTMLElement,index:number):string { if(!el.dataset.jobHelperId) el.dataset.jobHelperId=`jh-${index}-${Math.random().toString(36).slice(2,7)}`; return el.dataset.jobHelperId; }
export class DictionaryDetector implements FieldDetector {
 scan(root:Document):FieldMatch[] { const matches=[...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(el=>!(el instanceof HTMLInputElement && ['submit','button','hidden'].includes(el.type))).map((el,i)=>this.detect(el,i)); const counts=new Map<ProfileKey,number>(); for(const match of matches){if(!match.key||!EDUCATION_KEYS.includes(match.key as typeof EDUCATION_KEYS[number]))continue;const index=counts.get(match.key)??0;match.educationIndex=index;match.reasons.push(`第 ${index+1} 段教育经历`);counts.set(match.key,index+1);}return matches; }
 detect(el:HTMLElement,index=0):FieldMatch { const text=elementText(el); const lower=text.toLowerCase(); let best:ProfileKey|undefined; let score=0; const reasons:string[]=[];
   for(const [key,terms] of Object.entries(TERMS) as [ProfileKey,string[]][]) for(const term of terms) if(lower.includes(term.toLowerCase())) { const s=term.length>=4?.92:.82; if(s>score){best=key;score=s;reasons.splice(0,reasons.length,`匹配“${term}”`);} }
   const forbiddenType=el instanceof HTMLInputElement&&['file','password'].includes(el.type); const forbidden=FORBIDDEN_TERMS.find(x=>lower.includes(x.toLowerCase())); if(forbiddenType||forbidden){score=1;reasons.splice(0,reasons.length,forbiddenType?`禁止控件类型“${(el as HTMLInputElement).type}”`:`禁止字段“${forbidden}”`);best=undefined;}
   const type=el instanceof HTMLInputElement?el.type:el.tagName.toLowerCase(); return {elementId:stableId(el,index),key:best,label:text.slice(0,100)||'(无标签)',confidence:score,policy:forbiddenType||forbidden?'forbidden':policyFor(best,text),reasons,kind:type}; }
 }
