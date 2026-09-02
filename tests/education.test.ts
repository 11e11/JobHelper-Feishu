import {beforeEach,describe,expect,it} from 'vitest';
import {DictionaryDetector} from '../src/core/detector';
import {fillSafe,profileValue} from '../src/core/filler';
import {migrateLegacyEducation} from '../src/core/profile';

const educations=[
 {school:'湖南大学',college:'信息科学与工程学院',major:'计算机科学与技术',education:'本科',enrollmentDate:'2019-09',graduationDate:'2023-06'},
 {school:'浙江大学',college:'软件学院',major:'软件工程',education:'硕士',enrollmentDate:'2023-09',graduationDate:'2026-06'}
];

describe('multiple education entries',()=>{
 beforeEach(()=>document.body.innerHTML='');
 it('为重复教育字段分配相同类型的出现序号',()=>{document.body.innerHTML='<fieldset><label>学校<input></label><label>学历<input></label></fieldset><fieldset><label>学校<input></label><label>学历<input></label></fieldset>';const matches=new DictionaryDetector().scan(document);expect(matches.filter(x=>x.key==='school').map(x=>x.educationIndex)).toEqual([0,1]);expect(matches.filter(x=>x.key==='education').map(x=>x.educationIndex)).toEqual([0,1]);});
 it('按序填写本科和硕士两段经历',()=>{document.body.innerHTML='<fieldset><label>学校<input></label><label>学历<input></label></fieldset><fieldset><label>学校<input></label><label>学历<input></label></fieldset>';const matches=new DictionaryDetector().scan(document);expect(fillSafe(matches,{educations})).toBe(4);expect([...document.querySelectorAll('input')].map(x=>x.value)).toEqual(['湖南大学','本科','浙江大学','硕士']);});
 it('单项填写会选择对应教育经历',()=>{document.body.innerHTML='<label>学校<input></label><label>学校<input></label>';const matches=new DictionaryDetector().scan(document);expect(profileValue({educations},matches[1])).toBe('浙江大学');});
});

describe('legacy education migration',()=>{it('把旧版单学历字段迁移为第一条经历',()=>{expect(migrateLegacyEducation({school:'湖南大学',education:'本科'})[0]).toMatchObject({school:'湖南大学',education:'本科'});});it('保留已有多教育经历',()=>{expect(migrateLegacyEducation({educations})).toEqual(educations);});});
