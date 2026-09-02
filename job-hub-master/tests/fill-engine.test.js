import { beforeEach, describe, expect, it, vi } from 'vitest';

let listener;
async function loadEngine() {
  vi.resetModules();
  delete globalThis.__jobHubSafeFillLoaded;
  globalThis.chrome={runtime:{onMessage:{addListener(fn){listener=fn;}}}};
  Object.defineProperty(HTMLElement.prototype,'getBoundingClientRect',{configurable:true,value(){return {width:100,height:30,top:0,left:0,right:100,bottom:30};}});
  await import('../content/fill-engine.js?test='+Math.random());
  return globalThis.__JOB_HUB_TEST__;
}
function message(body){let result,resolve;const pending=new Promise(r=>{resolve=r;});listener(body,{},value=>{result=value;resolve(value);});return result===undefined?pending:result;}

describe('JobHub safe rule engine',()=>{
  it('recognizes expanded low-risk personal and English fields',async()=>{
    document.body.innerHTML='<label>现居住地址<input></label><label>身高(cm)<input></label><label>体重(kg)<input></label><label>CET4成绩<input></label><label>英语六级成绩<input></label>';
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{currentAddress:'长沙市岳麓区',height:'175',weight:'65',cet4Score:'520',cet6Score:'480'}}).fields;
    expect(fields.map(f=>f.key)).toEqual(['currentAddress','height','weight','cet4Score','cet6Score']);
    expect(fields.every(f=>f.policy==='auto'&&f.confidence==='high')).toBe(true);
  });
  it('formats education dates for month inputs and split year/month selects',async()=>{
    document.body.innerHTML='<label>入学时间<input type="month"></label><label>毕业年份<select><option>请选择</option><option>2026</option></select></label><label>毕业月份<select><option>请选择</option><option>6月</option></select></label>';
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{enrollmentDate:'2022-09',graduationDate:'2026-06'}}).fields;
    await message({type:'SAFE_FILL',items:fields,profileValues:{enrollmentDate:'2022-09',graduationDate:'2026-06'}});
    expect(document.querySelector('input').value).toBe('2022-09');expect(document.querySelectorAll('select')[0].value).toBe('2026');expect(document.querySelectorAll('select')[1].value).toBe('6月');
  });
  it('safely adds a missing Moka education card and indexes education values',async()=>{
    const card=n=>`<div class="apply-fields-X multi-X"><div class="apply-field-X date_info-X">就读时间<input placeholder="年"><input placeholder="月"><input placeholder="年"><input placeholder="月"></div><div class="apply-field-X">学校名称<input></div><div class="apply-field-X">专业名称<input></div></div>`;
    document.body.innerHTML=`<section class="apply-block-X"><div>教育背景<button id="eduAdd">添加</button></div><div id="eduRecords">${card(1)}</div></section>`;
    document.querySelector('#eduAdd').addEventListener('click',()=>document.querySelector('#eduRecords').insertAdjacentHTML('beforeend',card(2)));
    await loadEngine();const prepared=await message({type:'SAFE_PREPARE_EDUCATION',required:2});expect(prepared).toMatchObject({ok:true,count:2,added:1});
    const fields=message({type:'SAFE_SCAN',profileValues:{school1:'江南大学',major1:'物联网工程',enrollmentDate1:'2019-09',graduationDate1:'2023-06',school2:'湖南大学',major2:'软件工程',enrollmentDate2:'2023-09',graduationDate2:'2026-06'}}).fields;
    const dates=fields.filter(field=>field.datePart);expect(dates.map(field=>field.valueKey)).toEqual(['enrollmentDate1','enrollmentDate1','graduationDate1','graduationDate1','enrollmentDate2','enrollmentDate2','graduationDate2','graduationDate2']);
    expect(fields.filter(field=>field.key==='school').map(field=>field.valueKey)).toEqual(['school1','school2']);
  });
  it('indexes duplicate education-type controls by their education record',async()=>{
    const card='<div class="apply-fields-X multi-X"><div class="apply-field-X">学校名称<input></div><div class="apply-field-X">教育类型<select><option>请选择</option><option>全日制</option></select></div></div>';
    document.body.innerHTML=`<div>${card}${card}</div>`;
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{educationType1:'全日制',educationType2:'非全日制',educationType:'全日制'}}).fields.filter(field=>field.key==='educationType');
    expect(fields.map(field=>field.valueKey)).toEqual(['educationType1','educationType2']);
  });
  beforeEach(()=>{document.body.innerHTML='';listener=undefined;});

  it('scans labels, ARIA, radio, checkbox and contenteditable with policies',async()=>{
    document.body.innerHTML='<label>姓名<input></label><span id="salary">期望薪资</span><input aria-labelledby="salary"><div role="combobox" aria-label="所在城市"></div><div contenteditable="true" aria-label="个人主页"></div>';
    await loadEngine();
    const fields=message({type:'SAFE_SCAN',profileValues:{name:'张三',expectedSalary:'20k',currentCity:'长沙',homepage:'https://x.test'}}).fields;
    expect(fields.map(f=>f.key)).toEqual(['name','expectedSalary','currentCity','homepage']);
    expect(fields.map(f=>f.policy)).toEqual(['auto','confirm','auto','auto']);
    expect(fields[0].preview).not.toContain('张三');
  });

  it('SubmitGuard detects submit, next, login, password and file controls',async()=>{
    document.body.innerHTML='<button type="submit">提交申请</button><div role="button">下一步</div><button type="button">登录</button><input type="password"><input type="file">';
    await loadEngine();
    const fields=message({type:'SAFE_SCAN',profileValues:{}}).fields;
    expect(fields).toHaveLength(5);
    expect(fields.every(f=>f.policy==='never')).toBe(true);
  });

  it('does not auto-map emergency-contact fields to the candidate',async()=>{
    document.body.innerHTML='<label>紧急联系人姓名<input></label><label>紧急联系人电话<input></label>';await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{name:'张三',phone:'13800000000'}}).fields;
    expect(fields.every(f=>f.key===null&&f.policy==='confirm'&&f.confidence==='low')).toBe(true);
  });

  it('recognizes Moka-style custom select fields from their field wrapper',async()=>{
    document.body.innerHTML='<div class="apply-field-AbCd"><span>学校名称</span><div><label class="sd-Select-container-X"><input></label></div></div><div class="apply-field-EfGh"><span>确认声明</span><label><input type="checkbox"></label></div>';await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{school:'湖南大学'}}).fields;
    expect(fields[0].key).toBe('school');expect(fields[0].policy).toBe('auto');expect(fields[0].reason).toContain('唯一匹配');expect(fields[1].policy).toBe('never');
  });

  it('fills safe empty fields, emits required events and supports undo',async()=>{
    document.body.innerHTML='<label>姓名<input></label>';
    const input=document.querySelector('input');const inputEvent=vi.fn(),change=vi.fn(),blur=vi.fn();input.addEventListener('input',inputEvent);input.addEventListener('change',change);input.addEventListener('blur',blur);
    await loadEngine();const scan=message({type:'SAFE_SCAN',profileValues:{name:'张三'}});const result=await message({type:'SAFE_FILL',items:scan.fields,profileValues:{name:'张三'}});
    expect(result.results[0].success).toBe(true);expect(input.value).toBe('张三');expect(inputEvent).toHaveBeenCalledOnce();expect(change).toHaveBeenCalledOnce();expect(blur).toHaveBeenCalledOnce();
    expect(message({type:'SAFE_UNDO'})).toMatchObject({count:1,skipped:0});expect(input.value).toBe('');
  });

  it('reports the labels and empty state of required fields',async()=>{
    document.body.innerHTML='<label>姓名 *<input required></label><label>邮箱<input aria-label="邮箱" aria-required="true" value="a@example.com"></label>';
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{name:'张三',email:'a@example.com'}}).fields;
    expect(fields[0]).toMatchObject({required:true,requiredLabel:'姓名',hasExistingValue:false});
    expect(fields[1]).toMatchObject({required:true,hasExistingValue:true});
  });

  it('does not overwrite non-empty values without per-field confirmation',async()=>{
    document.body.innerHTML='<label>姓名<input value="原值"></label>';await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{name:'新值'}}).fields[0];
    expect((await message({type:'SAFE_FILL',items:[field],profileValues:{name:'新值'}})).results[0].success).toBe(false);
    expect(document.querySelector('input').value).toBe('原值');field.confirmed=true;field.allowOverwrite=true;
    expect((await message({type:'SAFE_FILL',items:[field],profileValues:{name:'新值'}})).results[0].success).toBe(true);
  });

  it('never clicks, submits, presses Enter or assigns a file',async()=>{
    document.body.innerHTML='<form><label>姓名<input></label><input type="file"><button type="submit">确认投递</button></form>';
    const button=document.querySelector('button'),form=document.querySelector('form'),file=document.querySelector('input[type=file]');const click=vi.spyOn(button,'click'),requestSubmit=vi.spyOn(form,'requestSubmit'),submit=vi.spyOn(form,'submit'),keydown=vi.fn();document.addEventListener('keydown',keydown);
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{name:'张三'}}).fields;await message({type:'SAFE_FILL',items:fields,profileValues:{name:'张三'}});
    expect(click).not.toHaveBeenCalled();expect(requestSubmit).not.toHaveBeenCalled();expect(submit).not.toHaveBeenCalled();expect(keydown).not.toHaveBeenCalled();expect(file.files.length).toBe(0);
  });

  it('uses saved site mappings but never overrides a guarded control',async()=>{
    document.body.innerHTML='<input aria-label="候选人代号"><button type="submit">候选人代号</button>';await loadEngine();const initial=message({type:'SAFE_SCAN',profileValues:{name:'张三'}}).fields;const mappings={[initial[0].label]:{key:'name',policy:'auto'}};const fields=message({type:'SAFE_SCAN',profileValues:{name:'张三'},mappings}).fields;
    expect(fields[0].key).toBe('name');expect(fields[0].confidence).toBe('high');expect(fields[1].policy).toBe('never');
  });

  it('blocks Moka auxiliary selectors and does not pretend custom-select text is selected',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>手机号码</span><label class="sd-Select-container-X"><input placeholder="请选择"></label><input placeholder="请输入手机号"></div><div class="apply-field-B"><span>政治面貌</span><label class="sd-Select-container-X"><input placeholder="请选择"></label></div>';
    await loadEngine();const fields=message({type:'SAFE_SCAN',profileValues:{phone:'13800000000',politicalStatus:'群众'}}).fields;
    expect(fields[0]).toMatchObject({key:null,policy:'never'});expect(fields[1]).toMatchObject({key:'phone',policy:'auto'});expect(fields[2]).toMatchObject({key:'politicalStatus',policy:'auto',confidence:'high'});
    fields[2].confirmed=true;expect((await message({type:'SAFE_FILL',items:[fields[2]],profileValues:{politicalStatus:'群众'}})).results[0].success).toBe(false);expect(document.querySelectorAll('input')[2].value).toBe('');
  });

  it('selects a unique exact Moka option and reports it as non-destructively non-undoable',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>学历</span><div class="sd-Dropdown-container-X"><label class="sd-Select-container-X"><span class="sd-Input-display-value-X"></span><input placeholder="请选择"></label><div class="sd-Select-common-item-X">硕士</div><div class="sd-Select-common-item-X">本科</div></div></div>';
    const input=document.querySelector('input'),display=document.querySelector('[class*=Input-display-value]'),master=document.querySelector('[class*=Select-common-item]');master.addEventListener('click',()=>{display.textContent='硕士';input.value='';});
    await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{education:'硕士研究生'}}).fields[0];const result=await message({type:'SAFE_FILL',items:[field],profileValues:{education:'硕士研究生'}});
    expect(result.results[0].success).toBe(true);expect(display.textContent).toBe('硕士');expect(message({type:'SAFE_UNDO'})).toMatchObject({count:0,skipped:1});expect(display.textContent).toBe('硕士');
  });

  it('leaves a custom select unchanged when matching options are duplicated',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>民族</span><div class="sd-Dropdown-container-X"><label class="sd-Select-container-X"><span class="sd-Input-display-value-X"></span><input placeholder="请输入民族"></label><div class="sd-Select-common-item-X">汉族</div><div class="sd-Select-common-item-X">汉族</div></div></div>';
    await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{ethnicity:'汉族'}}).fields[0];const result=await message({type:'SAFE_FILL',items:[field],profileValues:{ethnicity:'汉族'}});expect(result.results[0]).toMatchObject({success:false,error:'候选项不唯一，已保持为空'});expect(document.querySelector('input').value).toBe('');expect(document.querySelector('[class*=Input-display-value]').textContent).toBe('');
  });

  it('does not count transient search text as a selected option',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>民族</span><div class="sd-Dropdown-container-X"><label class="sd-Select-container-X"><span class="sd-Input-display-value-X"></span><input placeholder="请输入民族"></label><div class="sd-Select-common-item-X"><div>汉族</div></div></div></div>';
    await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{ethnicity:'汉族'}}).fields[0];const result=await message({type:'SAFE_FILL',items:[field],profileValues:{ethnicity:'汉族'}});expect(result.results[0]).toMatchObject({success:false,error:'候选项未被页面稳定确认，已保持为空'});expect(document.querySelector('input').value).toBe('');
  });

  it('waits for asynchronously loaded school options before matching',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>学校名称</span><div class="sd-Dropdown-container-X"><label class="sd-Select-container-X"><span class="sd-Input-display-value-X"></span><input placeholder="请输入就读学校"></label><div class="options"></div></div></div>';
    const input=document.querySelector('input'),display=document.querySelector('[class*=Input-display-value]'),box=document.querySelector('.options');input.addEventListener('input',()=>setTimeout(()=>{box.innerHTML='<div class="sd-Select-common-item-X"><div>湖南大学</div></div>';box.querySelector('[class*=Select-common-item]').addEventListener('click',()=>{display.textContent='湖南大学';input.value='';});},350),{once:true});
    await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{school:'湖南大学'}}).fields[0];const result=await message({type:'SAFE_FILL',items:[field],profileValues:{school:'湖南大学'}});expect(result.results[0].success).toBe(true);expect(display.textContent).toBe('湖南大学');
  });

  it('never overwrites an existing custom-select choice',async()=>{
    document.body.innerHTML='<div class="apply-field-A"><span>学历</span><div class="sd-Dropdown-container-X"><label class="sd-Select-container-X"><span class="sd-Input-display-value-X">本科</span><input placeholder=""></label><div class="sd-Select-common-item-X">硕士</div></div></div>';
    await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{education:'硕士研究生'}}).fields[0];expect(field.hasExistingValue).toBe(true);field.confirmed=true;field.allowOverwrite=true;const result=await message({type:'SAFE_FILL',items:[field],profileValues:{education:'硕士研究生'}});expect(result.results[0]).toMatchObject({success:false,error:'自定义下拉已有选项，不允许覆盖'});expect(document.querySelector('[class*=Input-display-value]').textContent).toBe('本科');
  });

  it('formats birth dates from the requested field shape',async()=>{
    document.body.innerHTML='<label>生日日期（格式：**月**日）<input></label>';await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{birthDate:'2003-01-23'}}).fields[0];await message({type:'SAFE_FILL',items:[field],profileValues:{birthDate:'2003-01-23'}});expect(document.querySelector('input').value).toBe('01月23日');
  });

  it('skips undo when the user changed an extension-written value',async()=>{
    document.body.innerHTML='<label>姓名<input></label>';await loadEngine();const field=message({type:'SAFE_SCAN',profileValues:{name:'张三'}}).fields[0];await message({type:'SAFE_FILL',items:[field],profileValues:{name:'张三'}});document.querySelector('input').value='用户修改';expect(message({type:'SAFE_UNDO'})).toMatchObject({count:0,skipped:1});expect(document.querySelector('input').value).toBe('用户修改');
  });
});
