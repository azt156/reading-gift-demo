'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../community-settings.js');
const blob=(type='image/png',size=1)=>new Blob([new Uint8Array(size)],{type});
const partner=(id='test-partner')=>({id,name:'測試贊助單位',role:'',logo:null,builtin:null,visible:true});

test('預設只有指定共同發起人與已知贊助單位',()=>{
  const d=C.defaults();
  assert.equal(d.founders.names,'吳孟霖 × 簡子惠');
  assert.equal(d.founders.intro,'一位老師與一位工程師，希望每個孩子的想法，都有機會被看見。');
  assert.equal(d.founders.photo,null);assert.equal(d.sponsors.length,1);
  assert.deepEqual(d.sponsors[0],{id:'mediatek',name:'聯發科技志工社',role:'核心支持夥伴',logo:null,builtin:'img/sponsor-mediatek.png',visible:true});
  assert.deepEqual(C.validate(d),d);
});

test('defaults、validate 不共用可變欄位，也不改輸入',()=>{
  const a=C.defaults(),b=C.defaults();a.founders.names='甲';a.sponsors[0].name='乙';
  assert.equal(b.founders.names,'吳孟霖 × 簡子惠');assert.equal(b.sponsors[0].name,'聯發科技志工社');
  const output=C.validate(a);output.sponsors[0].name='丙';assert.equal(a.sponsors[0].name,'乙');
});

test('姓名必填最多 120 字，介紹可留空最多 600 字',()=>{
  for(const names of ['', '  ',null,42,'字'.repeat(121)])assert.throws(()=>C.validate({...C.defaults(),founders:{names,intro:'',photo:null}}));
  const d=C.defaults();d.founders.names='字'.repeat(120);d.founders.intro='字'.repeat(600);
  assert.equal(C.validate(d).founders.intro.length,600);
  d.founders.intro='字'.repeat(601);assert.throws(()=>C.validate(d));
  d.founders.intro=' ';assert.equal(C.validate(d).founders.intro,'');
});

test('文字 trim、控制字元清理、Unicode 長度及 HTML 保留文字',()=>{
  const d=C.defaults();d.founders.names=' \u0000甲 ';d.founders.intro='<script>alert(1)</script>\r\n文字';
  d.sponsors[0].name='📖'.repeat(100);d.extra='不要存';
  const result=C.validate(d);assert.equal(result.founders.names,'甲');
  assert.equal(result.founders.intro,'<script>alert(1)</script>\n文字');assert.equal(result.extra,undefined);
});

test('PNG、JPEG、WebP 真實 Blob 與 File 可保留',()=>{
  for(const type of ['image/png','image/jpeg','image/webp']){
    const image=blob(type);const d=C.defaults();d.founders.photo=image;d.sponsors[0].logo=image;
    const validated=C.validate(d);assert.equal(validated.founders.photo,image);assert.equal(validated.sponsors[0].logo,image);
  }
  if(typeof File!=='undefined'){
    const file=new File(['bytes'],'photo.png',{type:'image/png'});const d=C.defaults();d.founders.photo=file;
    assert.equal(C.validate(d).founders.photo,file);
  }
});

test('圖片必須非空、最多 5 MiB；拒絕偽 Blob 與 URL',()=>{
  const d=C.defaults();d.founders.photo=blob('image/png',5*1024*1024);assert.equal(C.validate(d).founders.photo.size,5*1024*1024);
  const bad=[blob('image/png',0),blob('image/png',5*1024*1024+1),blob('image/svg+xml'),blob('text/html'),blob('image/gif'),{},
    {size:1,type:'image/png',arrayBuffer:()=>Promise.resolve(new ArrayBuffer(1))},'https://example.com/a.png','data:image/png;base64,AA=='];
  for(const image of bad){
    const f=C.defaults();f.founders.photo=image;assert.throws(()=>C.validate(f));
    const s=C.defaults();s.sponsors[0].logo=image;assert.throws(()=>C.validate(s));
  }
});

test('贊助列表允許空白但不能超過 12 個或有稀疏空位',()=>{
  assert.deepEqual(C.validate({...C.defaults(),sponsors:[]}).sponsors,[]);
  assert.equal(C.validate({...C.defaults(),sponsors:Array.from({length:12},(_,i)=>partner('id-'+i))}).sponsors.length,12);
  for(const sponsors of [null,{},'列表',new Array(2),Array.from({length:13},(_,i)=>partner('id-'+i))])assert.throws(()=>C.validate({...C.defaults(),sponsors}));
});

test('贊助 ID 驗證字元、長度與重複',()=>{
  for(const id of ['', 'a_b','空白',' a','../x','a'.repeat(81),1])assert.throws(()=>C.validate({...C.defaults(),sponsors:[partner(id)]}));
  for(const id of ['a','a'.repeat(80),'AbC-123'])assert.equal(C.validate({...C.defaults(),sponsors:[partner(id)]}).sponsors[0].id,id);
  assert.throws(()=>C.validate({...C.defaults(),sponsors:[partner('same'),partner('same')]}));
});

test('贊助名稱必填、說明可空，長度都最多 100 字',()=>{
  for(const name of ['', ' ',null,'字'.repeat(101)])assert.throws(()=>C.validate({...C.defaults(),sponsors:[{...partner(),name}]}));
  for(const role of [null,5,'字'.repeat(101)])assert.throws(()=>C.validate({...C.defaults(),sponsors:[{...partner(),role}]}));
  const s={...partner(),name:'字'.repeat(100),role:'字'.repeat(100)};assert.equal(C.validate({...C.defaults(),sponsors:[s]}).sponsors[0].role.length,100);
});

test('顯示必須布林，內建路徑只允許指定標誌或 null',()=>{
  for(const visible of ['false',0,1,null])assert.throws(()=>C.validate({...C.defaults(),sponsors:[{...partner(),visible}]}));
  assert.equal(C.validate({...C.defaults(),sponsors:[{...partner(),visible:false}]}).sponsors[0].visible,false);
  for(const builtin of ['https://example.com/a.png','//example.com/a','javascript:alert(1)','../img/a.png','img/not-known.png','']){
    assert.throws(()=>C.validate({...C.defaults(),sponsors:[{...partner(),builtin}]}));
  }
});

test('merge 對缺省與壞欄位回預設，合法 Blob 不遺失',()=>{
  const photo=blob('image/jpeg'),logo=blob('image/webp');
  const saved={founders:{names:'',intro:'新的介紹',photo},sponsors:[{id:'mediatek',name:'新名稱',logo,visible:false}]};
  const result=C.merge(saved);
  assert.equal(result.founders.names,C.defaults().founders.names);assert.equal(result.founders.intro,'新的介紹');assert.equal(result.founders.photo,photo);
  assert.equal(result.sponsors[0].logo,logo);assert.equal(result.sponsors[0].name,'新名稱');assert.equal(result.sponsors[0].visible,false);
  assert.equal(result.sponsors[0].builtin,'img/sponsor-mediatek.png');assert.deepEqual(C.validate(result),result);
});

test('merge 正確處理清空列表、隱藏、移除圖片與未知合作單位',()=>{
  assert.deepEqual(C.merge({sponsors:[]}).sponsors,[]);
  const result=C.merge({founders:{photo:null,intro:''},sponsors:[{...partner('custom'),logo:blob(),visible:false}]});
  assert.equal(result.founders.photo,null);assert.equal(result.founders.intro,'');
  assert.equal(result.sponsors.length,1);assert.equal(result.sponsors[0].id,'custom');assert.equal(result.sponsors[0].visible,false);
  assert.equal(result.sponsors[0].builtin,null);
});

test('merge 隔離非法 URL、無效圖片及重複 ID，不丟棄其他合法列',()=>{
  const logo=blob();
  const result=C.merge({founders:{photo:'https://example.com/photo.png'},sponsors:[
    {id:'bad/name',name:'錯誤'}, {...partner('good'),logo,builtin:'https://example.com/logo.png'},
    {...partner('good'),name:'重複'}, {id:'missing-name'}, {...partner('other'),logo:{size:1,type:'image/png'}}
  ]});
  assert.equal(result.founders.photo,null);assert.deepEqual(result.sponsors.map(s=>s.id),['good','other']);
  assert.equal(result.sponsors[0].logo,logo);assert.equal(result.sponsors[0].builtin,null);assert.equal(result.sponsors[1].logo,null);
  assert.deepEqual(C.validate(result),result);
});

test('merge 非物件與完全損壞列表安全回預設',()=>{
  for(const value of [null,undefined,1,'{}',[]])assert.deepEqual(C.merge(value),C.defaults());
  for(const sponsors of [null,[null],Array(13).fill(partner()),[{id:'wrong/id'}]])assert.deepEqual(C.merge({sponsors}),C.defaults());
});

test('merge 不採原型欄位、不污染 prototype、不改來源物件',()=>{
  const inherited=Object.create({founders:{names:'不採用'}});assert.deepEqual(C.merge(inherited),C.defaults());
  const input=JSON.parse('{"__proto__":{"polluted":true},"founders":{"names":"自訂姓名"},"sponsors":[{"id":"mediatek"}]}');
  const original=structuredClone(input);const result=C.merge(input);
  assert.equal({}.polluted,undefined);assert.deepEqual(input,original);
  result.sponsors[0].name='改了';assert.equal(input.sponsors[0].name,undefined);
});

test('UMD 在瀏覽器環境公開 CommunitySettings 且能驗證 Blob',()=>{
  const sandbox={Blob};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../community-settings.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.CommunitySettings.merge,'function');
  const input=sandbox.CommunitySettings.defaults();input.founders.photo=blob();
  assert.equal(sandbox.CommunitySettings.validate(input).founders.photo,input.founders.photo);
});
