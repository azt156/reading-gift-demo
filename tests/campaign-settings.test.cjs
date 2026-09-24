'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const C=require('../campaign-settings.js');

test('預設值採 v3 文案並通過驗證',()=>{
  const d=C.defaults();
  assert.equal(d.title,'閱讀有禮');
  assert.equal(d.slogan,'讀一本好書，說一段自己的想法。');
  assert.equal(d.intro,'讀懂・寫下・說出來。完成閱讀挑戰，讓好書接力陪伴你。');
  assert.deepEqual(d.steps.map(s=>s.title),['讀一本書','留下筆記','寫出想法','用自己的話說']);
  assert.equal(d.important.length,3);
  assert.equal(d.startDate,'');assert.equal(d.endDate,'');
  assert.deepEqual(C.validate(d),d);
});

test('defaults 每次回傳獨立物件，巢狀內容不共用',()=>{
  const a=C.defaults(),b=C.defaults();
  a.steps[0].title='改過';a.important.push('新事項');
  assert.equal(b.steps[0].title,'讀一本書');assert.equal(b.important.length,3);
});

test('validate 清理空白與控制字元，保留換行且不改原物件',()=>{
  const input=C.defaults();input.title='  閱讀\u0000有禮  ';input.intro=' 第一行\r\n第二行\r第三行 ';
  const original=structuredClone(input),result=C.validate(input);
  assert.equal(result.title,'閱讀有禮');assert.equal(result.intro,'第一行\n第二行\n第三行');
  assert.deepEqual(input,original);assert.notEqual(input.steps,result.steps);
});

for(const [field,max] of [['title',60],['slogan',120],['intro',500],['gift',80]]){
  test(field+' 必填、型別及長度邊界',()=>{
    for(const value of ['', ' \n\t ',null,123,{},[],'字'.repeat(max+1)]){
      assert.throws(()=>C.validate({...C.defaults(),[field]:value}),Error);
    }
    const missing=C.defaults();delete missing[field];assert.throws(()=>C.validate(missing));
    assert.equal(C.validate({...C.defaults(),[field]:'字'.repeat(max)})[field].length,max);
    assert.equal(Array.from(C.validate({...C.defaults(),[field]:'📖'.repeat(max)})[field]).length,max);
  });
}

test('有效日期、同日起迄與閏日可以保存',()=>{
  for(const [startDate,endDate] of [['2026-09-24','2026-10-24'],['2026-09-24','2026-09-24'],['2024-02-29','2024-03-01'],['2000-02-29','2000-02-29']]){
    const result=C.validate({...C.defaults(),startDate,endDate});
    assert.equal(result.startDate,startDate);assert.equal(result.endDate,endDate);
  }
});

test('無效日期、部分日期、顛倒日期皆拒絕',()=>{
  for(const value of ['2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-00','0000-01-01','2026-9-24','2026-09-24T00:00:00Z',123,null]){
    assert.throws(()=>C.validate({...C.defaults(),startDate:value,endDate:'2026-12-31'}));
  }
  assert.throws(()=>C.validate({...C.defaults(),startDate:'2026-09-24'}));
  assert.throws(()=>C.validate({...C.defaults(),endDate:'2026-09-24'}));
  assert.throws(()=>C.validate({...C.defaults(),startDate:'2026-10-01',endDate:'2026-09-24'}));
});

test('流程只接受四個完整步驟，稀疏陣列也不通過',()=>{
  for(const steps of [[],C.defaults().steps.slice(0,3),[...C.defaults().steps,{}],new Array(4),null,'四步']){
    assert.throws(()=>C.validate({...C.defaults(),steps}));
  }
  for(const [field,max] of [['title',40],['description',300]]){
    for(const value of ['',null,'字'.repeat(max+1)]){
      const input=C.defaults();input.steps[2][field]=value;assert.throws(()=>C.validate(input));
    }
    const input=C.defaults();input.steps[2][field]='字'.repeat(max);
    assert.equal(C.validate(input).steps[2][field].length,max);
  }
});

test('重要事項限 1–6 條，每條必填且不超長',()=>{
  for(const count of [1,6])assert.equal(C.validate({...C.defaults(),important:Array(count).fill('提醒')}).important.length,count);
  for(const important of [[],Array(7).fill('提醒'),[''],['有效',' '],[null],['字'.repeat(301)],new Array(3),'字串']){
    assert.throws(()=>C.validate({...C.defaults(),important}));
  }
  assert.equal(C.validate({...C.defaults(),important:['字'.repeat(300)]}).important[0].length,300);
});

test('只保留已知欄位，HTML 與腳本以文字原樣保存而不執行',()=>{
  const input=C.defaults();input.title='<img src=x onerror=alert(1)>';input.extra='不保存';input.steps[0].html='<b>x</b>';
  const result=C.validate(input);
  assert.equal(result.title,input.title);assert.equal(result.extra,undefined);assert.equal(result.steps[0].html,undefined);
});

test('merge 能載入缺省／舊版資料，合法兄弟欄位不會被壞欄位連帶清掉',()=>{
  const input={title:' 自訂活動 ',gift:null,slogan:'',steps:[{title:' 自訂第一步 '},{description:' 自訂第二步說明 '}],important:[' 自訂提醒 ']};
  const result=C.merge(input),d=C.defaults();
  assert.equal(result.title,'自訂活動');assert.equal(result.gift,d.gift);assert.equal(result.slogan,d.slogan);
  assert.equal(result.steps[0].title,'自訂第一步');assert.equal(result.steps[0].description,d.steps[0].description);
  assert.equal(result.steps[1].description,'自訂第二步說明');assert.equal(result.steps.length,4);
  assert.deepEqual(result.important,['自訂提醒']);assert.deepEqual(C.validate(result),result);
});

test('merge 不合法日期成對回預設，不保留半套期間',()=>{
  for(const saved of [{startDate:'2026-09-24'},{startDate:'2026-02-29',endDate:'2026-03-01'},{startDate:'2026-10-01',endDate:'2026-09-01'}]){
    const result=C.merge({...saved,title:'保留標題'});
    assert.equal(result.title,'保留標題');assert.equal(result.startDate,'');assert.equal(result.endDate,'');
  }
  const result=C.merge({startDate:'2026-09-24',endDate:'2026-10-24'});
  assert.equal(result.startDate,'2026-09-24');assert.equal(result.endDate,'2026-10-24');
});

test('merge 過長／錯誤陣列及非物件資料安全回預設',()=>{
  for(const input of [null,undefined,[],1,'{}'])assert.deepEqual(C.merge(input),C.defaults());
  const result=C.merge({steps:Array(5).fill({title:'x',description:'y'}),important:[''],intro:'字'.repeat(501)});
  assert.deepEqual(result,C.defaults());
});

test('merge 不接受原型繼承欄位，不改輸入，不污染 prototype',()=>{
  const inherited=Object.create({title:'不採用'});inherited.gift='新書';
  assert.equal(C.merge(inherited).title,C.defaults().title);
  const saved=JSON.parse('{"__proto__":{"polluted":true},"title":"新活動","steps":[{"title":"新步驟"}]}');
  const before=structuredClone(saved),result=C.merge(saved);
  assert.equal(result.title,'新活動');assert.equal({}.polluted,undefined);assert.deepEqual(saved,before);
  result.steps[0].title='再改';assert.equal(saved.steps[0].title,'新步驟');
});

test('UMD 在瀏覽器環境公開 CampaignSettings',()=>{
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../campaign-settings.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.CampaignSettings.defaults,'function');
  assert.equal(sandbox.CampaignSettings.validate(sandbox.CampaignSettings.defaults()).title,'閱讀有禮');
});
