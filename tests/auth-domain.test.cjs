'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../auth-domain.js');
const NOW=1790208000000;
const challenge=()=>A.issue('student@example.com','012345',NOW);

test('email trim、轉小寫，保留加號與點號',()=>{
  assert.equal(A.normalizeEmail(' Student+Book@Example.COM '),'student+book@example.com');
  assert.equal(A.normalizeEmail('a.b@example.com'),'a.b@example.com');
});
test('email 基本格式與 254 字元界線',()=>{
  for(const input of ['',null,1,{},'abc','a@@example.com','a b@example.com','a@localhost','a@example.com\nx'])assert.throws(()=>A.normalizeEmail(input));
  assert.equal(A.normalizeEmail('a'.repeat(242)+'@example.com').length,254);
  assert.throws(()=>A.normalizeEmail('a'.repeat(243)+'@example.com'));
});
test('issue 回完整 demo challenge，六位碼開頭 0 保留，效期 10 分鐘',()=>{
  assert.deepEqual(challenge(),{email:'student@example.com',code:'012345',sentAt:NOW,expiresAt:NOW+600000,attempts:0,used:false});
});
test('issue 拒絕非六位數字字串與錯誤時間',()=>{
  for(const code of ['12345','1234567','12a456',123456,null,' 123456'])assert.throws(()=>A.issue('a@example.com',code,NOW));
  for(const now of [undefined,NaN,Infinity,-1,1.5,'1',Number.MAX_SAFE_INTEGER])assert.throws(()=>A.issue('a@example.com','123456',now));
});
test('同信箱重發冷卻 60 秒，剛好到期才允許',()=>{
  const previous=challenge(),before=structuredClone(previous);
  assert.throws(()=>A.issue(' STUDENT@EXAMPLE.COM ','111111',NOW+59999,previous),/60/);
  assert.equal(A.issue('student@example.com','111111',NOW+60000,previous).code,'111111');
  assert.deepEqual(previous,before);
});
test('不同信箱不沿用前一信箱冷卻，新 challenge 次數歸零',()=>{
  const previous=challenge();previous.attempts=4;
  const next=A.issue('other@example.com','222222',NOW+1,previous);
  assert.equal(next.email,'other@example.com');assert.equal(next.attempts,0);assert.equal(next.used,false);
});
test('verify 成功回正規化 email，單次使用，不增加錯誤次數',()=>{
  const c=challenge();assert.equal(A.verify(c,' STUDENT@EXAMPLE.COM ','012345',NOW+1),'student@example.com');
  assert.equal(c.used,true);assert.equal(c.attempts,0);
  assert.throws(()=>A.verify(c,'student@example.com','012345',NOW+2),/已使用/);
  assert.equal(c.attempts,0);
});
test('錯碼、錯信箱與格式錯誤均計入五次限制',()=>{
  const c=challenge();
  for(const [email,code] of [['student@example.com','999999'],['other@example.com','012345'],['bad-email','012345'],['student@example.com',123456],['student@example.com','']]){
    assert.throws(()=>A.verify(c,email,code,NOW+1));
  }
  assert.equal(c.attempts,5);assert.equal(c.used,false);
  assert.throws(()=>A.verify(c,'student@example.com','012345',NOW+2),/5 次/);
  assert.equal(c.attempts,5);
});
test('輸錯四次後，第五次正確仍可通過',()=>{
  const c=challenge();for(let i=0;i<4;i++)assert.throws(()=>A.verify(c,'student@example.com','999999',NOW+1));
  assert.equal(A.verify(c,'student@example.com','012345',NOW+2),'student@example.com');assert.equal(c.used,true);
});
test('10 分鐘前有效，剛好到期與之後都拒絕',()=>{
  assert.equal(A.verify(challenge(),'student@example.com','012345',NOW+599999),'student@example.com');
  for(const now of [NOW+600000,NOW+600001]){
    const c=challenge();assert.throws(()=>A.verify(c,'student@example.com','012345',now),/10 分鐘/);assert.equal(c.used,false);assert.equal(c.attempts,0);
  }
});
test('缺少或損壞的 challenge 以中文 Error 拒絕',()=>{
  for(const c of [null,undefined,{},'code',{...challenge(),attempts:-1},{...challenge(),expiresAt:'tomorrow'}]){
    assert.throws(()=>A.verify(c,'student@example.com','012345',NOW),/請先取得/);
  }
});
test('UMD 瀏覽器名稱是 PreviewAuthDomain，無需網路功能',()=>{
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../auth-domain.js'),'utf8'),sandbox);
  const A=sandbox.PreviewAuthDomain,c=A.issue('student@example.com','123456',NOW);
  assert.equal(A.verify(c,'student@example.com','123456',NOW+1),'student@example.com');
});
