// JobHub 阶段一规则式安全填表引擎。
// 常驻监听扩展消息，但仅在用户点击侧边栏后扫描/填写；无网络、无提交、无文件操作。
(function () {
  'use strict';
  if (globalThis.__jobHubSafeFillLoaded) return;
  globalThis.__jobHubSafeFillLoaded = true;

  var FIELD_RULES = [
    ['name', 'auto', ['姓名', '真实姓名', 'name', 'full name']],
    ['phone', 'auto', ['手机号', '手机号码', '联系电话', 'phone', 'mobile']],
    ['email', 'auto', ['邮箱', '电子邮箱', 'email']],
    ['currentCity', 'auto', ['所在城市', '当前城市', '现居地', '居住城市']],
    ['currentAddress', 'auto', ['现居住地址', '现住址', '当前住址', '通讯地址', '联系地址', '居住地址']],
    ['householdAddress', 'auto', ['户籍地址', '户口地址', '户籍所在地']],
    ['nativePlace', 'auto', ['籍贯']],
    ['postalCode', 'auto', ['邮政编码', '邮编', 'postal code', 'zip code']],
    ['height', 'auto', ['身高', 'height']],
    ['weight', 'auto', ['体重', 'weight']],
    ['school', 'auto', ['学校', '院校', '毕业院校', 'school', 'university']],
    ['college', 'auto', ['学院', '院系', 'college', 'faculty']],
    ['major', 'auto', ['专业', 'major']],
    ['education', 'auto', ['学历', '最高学历', '学位', 'education', 'degree']],
    ['educationType', 'auto', ['教育类型', '学习形式', '培养方式', '就读类型']],
    ['enrollmentDate', 'auto', ['入学时间', '入学日期', '入学年份', '入学月份', '开始时间', '开始年份', '开始月份']],
    ['graduationDate', 'auto', ['毕业时间', '毕业日期', '毕业年份', '毕业月份', '预计毕业', '结束时间', '结束年份', '结束月份']],
    ['github', 'auto', ['github']],
    ['homepage', 'auto', ['个人主页', '个人网站', 'homepage', 'website']],
    ['portfolio', 'auto', ['作品集', 'portfolio']],
    ['gender', 'auto', ['性别', 'gender']],
    ['birthDate', 'auto', ['出生日期', '出生年月', '生日', 'birthday']],
    ['politicalStatus', 'auto', ['政治面貌']],
    ['ethnicity', 'auto', ['民族']],
    ['cet4Score', 'auto', ['cet4成绩', 'cet-4成绩', '英语四级成绩', '四级成绩', '大学英语四级']],
    ['cet6Score', 'auto', ['cet6成绩', 'cet-6成绩', '英语六级成绩', '六级成绩', '大学英语六级']],
    ['englishLevel', 'auto', ['英语等级', '英语水平', '外语水平', '英语能力', 'english level']],
    ['gpa', 'auto', ['gpa', '平均绩点', '绩点']],
    ['classRank', 'auto', ['专业排名', '班级排名', '成绩排名', 'rank']],
    ['languageAbility', 'auto', ['语言能力', '外语能力']],
    ['certificates', 'auto', ['证书', '资格证书', '所获证书']],
    ['skills', 'auto', ['技能', '专业技能', '编程语言', '工具框架']],
    ['hobbies', 'auto', ['兴趣爱好', '爱好']],
    ['relativeEmployed', 'auto', ['亲属任职', '亲属在职']],
    ['nonCompete', 'auto', ['竞业协议', '竞业限制']],
    ['idNumber', 'auto', ['身份证号码', '身份证号', '证件号码', '公民身份号码', 'id card']],
    ['jobDirection', 'confirm', ['求职方向', '应聘方向', '岗位方向', '求职意向']],
    ['source', 'confirm', ['信息来源', '招聘渠道', '获知渠道']],
    ['expectedCity', 'confirm', ['期望城市', '意向城市', '期望工作地点']],
    ['acceptTransfer', 'confirm', ['接受调剂', '服从调剂']],
    ['acceptOtherRole', 'confirm', ['接受其他岗位', '其他职位']],
    ['expectedSalary', 'confirm', ['期望薪资', '薪资要求']],
    ['openQuestion', 'confirm', ['自我介绍', '开放题', '请描述', '为什么', '个人评价']]
  ];
  var NEVER_TERMS = ['密码','password','短信验证码','验证码','captcha','银行','银行卡','账户号码','电子签名','签名','诚信声明','确认声明','承诺内容','隐私协议','授权文本','上传简历','文件上传','resume upload','登录','login'];
  var AMBIGUOUS_TERMS = ['紧急联系人','联系人姓名','联系人电话','担保人','推荐人姓名'];
  var SUBMIT_TERMS = ['提交','投递','申请','确认投递','下一步','完成','submit','apply','next','continue','finish'];
  var CONTROL_SELECTOR = 'input:not([type="hidden"]),textarea,select,button,[contenteditable="true"],[role="combobox"],[role="listbox"],[role="radio"],[role="checkbox"],[role="button"]';
  var elements = new Map();
  var scanSnapshots = new Map();
  var transactions = [];

  function normalized(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function visible(el) { var r = el.getBoundingClientRect(); var style = getComputedStyle(el); return r.width >= 8 && r.height >= 8 && style.display !== 'none' && style.visibility !== 'hidden'; }
  function labelledBy(el) { return normalized((el.getAttribute('aria-labelledby') || '').split(/\s+/).map(function(id){ return document.getElementById(id)?.textContent || ''; }).join(' ')); }
  function context(el) {
    var labels = el.labels ? Array.from(el.labels).map(function(x){return x.textContent;}).join(' ') : '';
    var wrapping = el.closest('label')?.textContent || '';
    var group = el.closest('fieldset,[role="radiogroup"],[role="group"]')?.textContent || '';
    var siteField = el.closest('[class*="apply-field-"],[class*="apply-filed-"]')?.textContent || '';
    return normalized([labels, wrapping, el.name, el.id, el.placeholder, el.autocomplete, el.getAttribute('aria-label'), labelledBy(el), el.getAttribute('data-label'), siteField.slice(0,180), group.slice(0,180), el.parentElement?.textContent?.slice(0,140)].filter(Boolean).join(' '));
  }
  function requiredInfo(el) {
    var wrapper=siteField(el)||el.closest('label,[class*="form-item"],[class*="field"]');
    var candidates=[].concat(el.labels?Array.from(el.labels):[]);
    if(wrapper)candidates=candidates.concat(Array.from(wrapper.querySelectorAll('label,[class*="label"],[class*="title"]')).slice(0,4));
    var label=normalized(candidates.map(function(node){return node.textContent;}).find(Boolean)||el.getAttribute('aria-label')||el.placeholder||el.name||el.id||'未命名字段').replace(/[＊*]\s*/g,'').trim().slice(0,50);
    var marked=el.required||el.getAttribute('aria-required')==='true'||candidates.some(function(node){return /[＊*]/.test(node.textContent||'')||node.classList?.contains('required');});
    return {required:Boolean(marked),label:label};
  }
  function kind(el) { return el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : el.tagName.toLowerCase(); }
  function siteField(el) { return el.closest('[class*="apply-field-"],[class*="apply-filed-"]'); }
  function isCustomSelect(el) {
    return !!el.closest('[class*="Select"],[class*="select"],[role="combobox"]') ||
      el.getAttribute('role') === 'combobox' ||
      (siteField(el) && ['请选择','请输入民族','请输入籍贯','请输入就读学校','请输入专业名称'].includes(normalized(el.placeholder)));
  }
  function selectContainer(el){return el.closest('[class*="Dropdown-container"],[class*="Select-container"]')||siteField(el);}
  function selectedDisplay(el){
    var root=selectContainer(el);if(!root)return '';
    var display=root.querySelector('[class*="Input-display-value"]');
    return normalized(display?.textContent||'');
  }
  function isAuxiliarySelector(el, text) {
    if (!isCustomSelect(el)) return false;
    var placeholder = normalized(el.placeholder);
    if (placeholder && placeholder !== '请选择') return false;
    return /生日类型|手机号码|手机号|证件号码|身份证号/.test(text);
  }
  function isSubmitControl(el, text) {
    var k = kind(el);
    if (k === 'file' || k === 'submit' || k === 'button' || k === 'image' || k === 'reset') return true;
    if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') return SUBMIT_TERMS.some(function(t){return text.toLowerCase().includes(t.toLowerCase());});
    return false;
  }
  function classify(el) {
    var text = context(el), lower = text.toLowerCase(), k = kind(el);
    if (k === 'password' || k === 'file' || isSubmitControl(el, text) || NEVER_TERMS.some(function(t){return lower.includes(t.toLowerCase());})) {
      return { key: null, policy: 'never', confidence: 'high', score: 1, reason: k === 'file' ? '文件输入隔离' : 'SubmitGuard/敏感字段禁止' };
    }
    if (isAuxiliarySelector(el, text)) return {key:null,policy:'never',confidence:'high',score:1,reason:'类型/区号辅助选择框禁止自动填写'};
    if (AMBIGUOUS_TERMS.some(function(t){return lower.includes(t.toLowerCase());})) return {key:null,policy:'confirm',confidence:'low',score:0,reason:'可能属于他人资料，禁止自动匹配'};
    var best = null, score = 0;
    FIELD_RULES.forEach(function(rule){ rule[2].forEach(function(term){ if (lower.includes(term.toLowerCase())) { var s = term.length >= 4 ? .95 : .84; if (s > score) { best = rule; score = s; } } }); });
    if (!best) return { key: null, policy: 'confirm', confidence: 'low', score: 0, reason: '未识别字段' };
    if (isCustomSelect(el)) return {key:best[0],policy:best[1],confidence:'high',score:score,reason:'自定义下拉仅在候选项唯一匹配时填写'};
    return { key: best[0], policy: best[1], confidence: score >= .8 ? 'high' : score >= .5 ? 'medium' : 'low', score: score, reason: '本地关键词规则' };
  }
  function educationRecord(el){var record=el.closest('[class*="apply-fields"][class*="multi"]');if(!record||!/学校名称|学历|就读时间/.test(record.textContent||''))return null;return record;}
  function educationOrdinal(el){var record=educationRecord(el);if(!record)return 0;var siblings=Array.from(record.parentElement?.children||[]).filter(function(node){return node.matches?.('[class*="apply-fields"][class*="multi"]')&&/学校名称|学历|就读时间/.test(node.textContent||'');});return siblings.indexOf(record)+1;}
  function educationDatePart(el){var field=el.closest('[class*="date_info"],[class*="apply-field"]');if(!field||!/就读时间/.test(field.textContent||''))return '';var inputs=Array.from(field.querySelectorAll('input')).filter(function(input){return /^(年|月)$/.test(input.placeholder||'');});return ['startYear','startMonth','endYear','endMonth'][inputs.indexOf(el)]||'';}
  function stableId(el, index) { if (!el.dataset.jobHubFieldId) el.dataset.jobHubFieldId = 'jh-' + index + '-' + Math.random().toString(36).slice(2,7); return el.dataset.jobHubFieldId; }
  function currentValue(el) { if (el instanceof HTMLInputElement && ['checkbox','radio'].includes(el.type)) return el.checked; if(isCustomSelect(el))return selectedDisplay(el)||el.value||''; if(el instanceof HTMLSelectElement){var value=normalized(el.value||el.options[el.selectedIndex]?.textContent||'');return /^(请选择|请选择一项|--请选择--|-)$/.test(value)?'':value;} return el.value ?? el.textContent ?? ''; }
  function formatDate(value, text) {
    var m=String(value||'').match(/^(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})日?$/); if(!m)return String(value);
    var y=m[1],mo=m[2].padStart(2,'0'),d=m[3].padStart(2,'0');
    if (/\*\*月\*\*日|月.*日/.test(text) && !/年月日/.test(text)) return mo+'月'+d+'日';
    if (/年月(?!日)|year.?month/i.test(text)) return y+'-'+mo;
    if (/\d{4}\.\d{2}\.\d{2}|格式.*\./.test(text)) return y+'.'+mo+'.'+d;
    return y+'-'+mo+'-'+d;
  }
  function formatEducationDate(value, text, el, part) {
    var m=String(value||'').match(/^(\d{4})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?/);if(!m)return String(value);
    var y=m[1],mo=(m[2]||'').padStart(2,'0'),d=(m[3]||'').padStart(2,'0');
    if(part==='startYear'||part==='endYear')return y;
    if(part==='startMonth'||part==='endMonth')return mo?String(Number(mo))+'月':'';
    if(/月份|month/i.test(text)&&!/年月|year.?month/i.test(text))return mo?String(Number(mo))+'月':'';
    if(/年份|year/i.test(text)&&!/年月|year.?month/i.test(text))return y;
    if(el instanceof HTMLInputElement&&el.type==='month')return mo?y+'-'+mo:y;
    if(el instanceof HTMLInputElement&&el.type==='date')return y+'-'+(mo||'01')+'-'+(d||'01');
    if(/年月|year.?month|入学时间|毕业时间|开始时间|结束时间/i.test(text))return mo?y+'-'+mo:y;
    return String(value);
  }
  function fieldValue(item,el,value){if(item.key==='birthDate')return formatDate(value,context(el));if(item.key==='enrollmentDate'||item.key==='graduationDate')return formatEducationDate(value,context(el),el,item.datePart);return String(value);}
  function mask(key, value) {
    if (value === undefined || value === null || value === '') return '未配置';
    var s = String(value);
    if (key === 'phone') return s.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2');
    if (key === 'email') { var p=s.split('@'); return p[1] ? p[0].slice(0,2)+'***@'+p[1] : '***'; }
    if (key === 'idNumber') return s.length > 8 ? s.slice(0,4)+'**********'+s.slice(-4) : '****';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return s.length <= 2 ? '*'.repeat(s.length) : s.slice(0,1)+'***'+s.slice(-1);
  }
  function scan(profileValues, mappings) {
    elements.clear();
    scanSnapshots.clear();
    var siteMap = mappings || {};
    return Array.from(document.querySelectorAll(CONTROL_SELECTOR)).filter(visible).map(function(el,index){
      var id=stableId(el,index), text=context(el), result=classify(el), saved=siteMap[text];
      var datePart=educationDatePart(el);
      if(datePart)result={key:datePart.startsWith('end')?'graduationDate':'enrollmentDate',policy:'auto',confidence:'high',score:1,reason:'教育就读时间四段式适配'};
      if (saved && result.policy !== 'never') result={key:saved.key,policy:saved.policy || 'confirm',confidence:'high',score:1,reason:'已保存的网站映射'};
      elements.set(id,el);
      scanSnapshots.set(id,currentValue(el));
      var ordinal=result.key&&['school','college','major','education','educationType','enrollmentDate','graduationDate','gpa','classRank'].includes(result.key)?educationOrdinal(el):0;
      var valueKey=ordinal&&profileValues?.[result.key+ordinal]!==undefined?result.key+ordinal:result.key;
      var value=result.key ? profileValues?.[valueKey] : undefined;
      var req=requiredInfo(el);
      return { id:id, tag:el.tagName.toLowerCase(), kind:kind(el), label:text.slice(0,120)||'(无标签)', required:req.required, requiredLabel:req.label, key:result.key, valueKey:valueKey, datePart:datePart, policy:result.policy, confidence:result.confidence, score:result.score, reason:result.reason, preview:mask(result.key,value), hasExistingValue:currentValue(el)!=='' && currentValue(el)!==false };
    });
  }
  function nativeSet(el,value) { var proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; var setter=Object.getOwnPropertyDescriptor(proto,'value')?.set; if(setter)setter.call(el,value); else el.value=value; }
  function fire(el) { el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new FocusEvent('blur',{bubbles:true})); }
  function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  function optionTarget(value,key){
    var v=normalized(value);var aliases={education:{'硕士研究生':'硕士','本科生':'本科','博士研究生':'博士'},gender:{'女性':'女','男性':'男'}};
    if(aliases[key]?.[v])return aliases[key][v];
    if(key==='major'&&v.endsWith('专业'))return v.slice(0,-2);
    return v;
  }
  function emitMouse(el,type){el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true}));}
  async function waitForExactOptions(root,target,timeout){
    var end=Date.now()+timeout,options=[];
    do{
      options=Array.from(root.querySelectorAll('[class*="sd-Select-common-item"]')).filter(visible).filter(function(o){return normalized(o.textContent)===target;});
      if(options.length)return options;
      await delay(100);
    }while(Date.now()<end);
    return options;
  }
  async function waitForSelected(el,target,timeout){var end=Date.now()+timeout;do{var selected=selectedDisplay(el);if(normalized(selected)===target)return selected;await delay(100);}while(Date.now()<end);return '';}
  async function fillCustomSelect(item,el,value){
    if(currentValue(el)!=='')return {success:false,error:'自定义下拉已有选项，不允许覆盖'};
    var target=optionTarget(fieldValue(item,el,value),item.key),root=siteField(el)||selectContainer(el);if(!root)return {success:false,error:'无法定位自定义下拉容器'};
    emitMouse(el,'mousedown');emitMouse(el,'mouseup');emitMouse(el,'click');
    nativeSet(el,target);el.dispatchEvent(new Event('input',{bubbles:true}));
    var options=await waitForExactOptions(root,target,2000);
    if(options.length!==1){nativeSet(el,'');fire(el);return {success:false,error:options.length?'候选项不唯一，已保持为空':'下拉框没有对应选项，已保持为空'};}
    var option=options[0];var exactLeaf=Array.from(option.querySelectorAll('*')).find(function(n){return !n.children.length&&normalized(n.textContent)===target;});var clickTarget=exactLeaf||option;
    if(isSubmitControl(clickTarget,context(clickTarget))||clickTarget.closest('button,input[type="submit"]')){nativeSet(el,'');fire(el);return {success:false,error:'SubmitGuard 已阻止异常候选项'};}
    emitMouse(clickTarget,'mousedown');emitMouse(clickTarget,'mouseup');emitMouse(clickTarget,'click');
    var selected=await waitForSelected(el,target,1500);if(!selected){nativeSet(el,'');fire(el);return {success:false,error:'候选项未被页面稳定确认，已保持为空'};}
    return {success:true,change:{id:item.id,element:el,before:'',written:selected,custom:true}};
  }
  async function fillOne(item, value, allowOverwrite) {
    var el=elements.get(item.id); if(!el)return {success:false,error:'页面字段已变化，请重新扫描'};
    var fresh=classify(el); if(fresh.policy==='never'||isSubmitControl(el,context(el)))return {success:false,error:'SubmitGuard 已阻止该控件'};
    if(isCustomSelect(el))return fillCustomSelect(item,el,value);
    var before=currentValue(el); if(before!==''&&before!==false&&!allowOverwrite)return {success:false,error:'已有非空值，需逐项确认覆盖'};
    var scannedBefore=scanSnapshots.get(item.id);if(scannedBefore!==before)return {success:false,error:'页面字段在扫描后已变化，请重新扫描'};
    if(item.policy!=='auto'&&!item.confirmed)return {success:false,error:'该字段需要用户逐项确认'};
    if(item.confidence!=='high'&&!item.confirmed)return {success:false,error:'非高置信度字段需要用户确认'};
    var writeValue=fieldValue(item,el,value);
    if(el instanceof HTMLSelectElement){var candidates=[String(writeValue),String(writeValue).replace(/^0/,'') ,String(writeValue).replace('月',''),String(writeValue).replace(/^0/,'')+'月'];var option=Array.from(el.options).find(function(o){return candidates.includes(String(o.value))||candidates.includes(normalized(o.textContent));});if(!option)return {success:false,error:'未找到匹配选项'};el.value=option.value;}
    else if(el instanceof HTMLInputElement&&['checkbox','radio'].includes(el.type)){if(el.type==='radio'&&![el.value,normalized(el.labels?.[0]?.textContent)].includes(String(value)))return {success:false,error:'单选项不匹配'};el.checked=typeof value==='boolean'?value:[el.value,normalized(el.labels?.[0]?.textContent),'是','true'].includes(String(value));}
    else if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)nativeSet(el,writeValue);
    else if(el.isContentEditable)el.textContent=String(value);
    else return {success:false,error:'自定义控件需要站点适配器'};
    fire(el); return {success:true,change:{id:item.id,element:el,before:before,written:currentValue(el)}};
  }
  async function fill(items, values) { var changes=[],results=[];for(var item of (items||[])){var value=values?.[item.valueKey||item.key];if(value===undefined||value===''){results.push({success:false,error:'资料未配置'});continue;}var r=await fillOne(item,value,item.allowOverwrite===true);if(r.success)changes.push(r.change);results.push({success:r.success,error:r.error||''});}if(changes.length)transactions.push(changes);return results; }
  async function prepareEducationEntries(required){
    required=Math.max(1,Math.min(Number(required)||1,5));
    var blocks=Array.from(document.querySelectorAll('[class*="apply-block-"]')).filter(function(block){return /教育背景/.test(block.textContent||'')&&block.querySelector('[class*="date_info"]');});
    if(blocks.length!==1)return {ok:false,error:'无法唯一定位教育背景区域'};
    var block=blocks[0];
    function records(){return Array.from(block.querySelectorAll('[class*="apply-fields"][class*="multi"]')).filter(function(node){return /学校名称|学历|就读时间/.test(node.textContent||'');});}
    var buttons=Array.from(block.querySelectorAll('button')).filter(function(button){return normalized(button.textContent)==='添加';});
    if(required>records().length&&buttons.length!==1)return {ok:false,error:'无法唯一定位教育背景添加按钮'};
    var added=0;
    while(records().length<required){var before=records().length;emitMouse(buttons[0],'mousedown');emitMouse(buttons[0],'mouseup');emitMouse(buttons[0],'click');var end=Date.now()+2000;while(Date.now()<end&&records().length===before)await delay(100);if(records().length!==before+1)return {ok:false,error:'添加教育经历后页面未稳定新增一条'};added++;}
    return {ok:true,count:records().length,added:added};
  }
  function undo(){var changes=transactions.pop()||[],count=0,skipped=0;changes.reverse().forEach(function(c){if(c.custom||!c.element.isConnected||currentValue(c.element)!==c.written){skipped++;return;}if(c.element instanceof HTMLInputElement&&['checkbox','radio'].includes(c.element.type))c.element.checked=Boolean(c.before);else if(c.element instanceof HTMLInputElement||c.element instanceof HTMLTextAreaElement)nativeSet(c.element,String(c.before));else c.element.textContent=String(c.before);fire(c.element);count++;});return {count:count,skipped:skipped};}
  chrome.runtime.onMessage.addListener(function(request,_sender,sendResponse){
    if(request.type==='SAFE_SCAN'){sendResponse({ok:true,fields:scan(request.profileValues||{},request.mappings||{})});return true;}
    if(request.type==='SAFE_FILL'){fill(request.items||[],request.profileValues||{}).then(function(results){sendResponse({ok:true,results:results});}).catch(function(error){sendResponse({ok:false,error:error.message});});return true;}
    if(request.type==='SAFE_UNDO'){var result=undo();sendResponse({ok:true,count:result.count,skipped:result.skipped});return true;}
    if(request.type==='SAFE_PREPARE_EDUCATION'){prepareEducationEntries(request.required).then(sendResponse).catch(function(error){sendResponse({ok:false,error:error.message});});return true;}
    return false;
  });
  globalThis.__JOB_HUB_TEST__={classify:classify,isSubmitControl:isSubmitControl,scan:scan,fill:fill,undo:undo};
})();
