'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pbkdf2Sync,webcrypto}=require('node:crypto');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../password-preview.js');
const sample={version:1,kdf:'PBKDF2',hash:'SHA-256',iterations:600000,salt:'00'.repeat(16),digest:'01'.repeat(32)};
const input=()=>({id:'new-reader',name:'小芽',email:'student@example.com',verifiedEmail:'student@example.com',passwordHash:sample});

test('密碼至少八字，可貼上長密語，不 trim 空白',()=>{
  for(const value of ['',null,123,'1234567','字'.repeat(129)])assert.throws(()=>P.validatePassword(value));
  assert.equal(P.validatePassword(' 密碼保留空白  '),' 密碼保留空白  ');
  assert.equal(P.validatePassword('📖'.repeat(8)),'📖'.repeat(8));
});
test('PBKDF2 與獨立 Node crypto 結果一致，正確/錯誤密碼可分辨',async()=>{
  const password='Test Password 123!',credential=await P.hashPassword(password);
  assert.equal(credential.salt.length,32);assert.equal(credential.digest.length,64);
  assert.equal(credential.digest,pbkdf2Sync(password,Buffer.from(credential.salt,'hex'),600000,32,'sha256').toString('hex'));
  assert.equal(await P.verifyPassword(password,credential),true);
  assert.equal(await P.verifyPassword('Incorrect Password',credential),false);
  assert.equal(JSON.stringify(credential).includes(password),false);
});
test('相同密碼每次產生獨立隨機 salt/hash',async()=>{
  const [a,b]=await Promise.all([P.hashPassword('same-password'),P.hashPassword('same-password')]);
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.digest,b.digest);
});
test('拒絕損壞 hash 或任意工作係數，避免不受限計算',async()=>{
  for(const c of [null,{}, {...sample,iterations:1},{...sample,iterations:1e12},{...sample,hash:'SHA-1'},{...sample,salt:'gg'.repeat(16)},{...sample,digest:'01'}]){
    await assert.rejects(P.verifyPassword('test-password',c));
  }
});
test('新帳號必須已驗證相同信箱且有暱稱',()=>{
  for(const value of [{...input(),verifiedEmail:null},{...input(),verifiedEmail:'other@example.com'},{...input(),name:''}])assert.throws(()=>P.finishAccount(null,value));
  const user=P.finishAccount(null,{...input(),name:' 小芽 '});
  assert.equal(user.name,'小芽');assert.equal(user.id,'new-reader');assert.equal(user.password,undefined);
});
test('舊版無密碼帳號升級保留 reader ID、原暱稱和其他資料',()=>{
  const old={id:'original-reader',name:'原稱呼',email:'student@example.com',createdAt:'old-time'};
  const before=structuredClone(old),user=P.finishAccount(old,{...input(),name:'不可覆蓋'});
  assert.equal(user.id,old.id);assert.equal(user.name,old.name);assert.equal(user.createdAt,old.createdAt);
  assert.deepEqual(old,before);assert.equal(old.passwordHash,undefined);assert.deepEqual(user.passwordHash,sample);
});
test('不可用註冊流程覆寫已設定密碼帳號，跨信箱或損壞 ID 不重建',()=>{
  for(const old of [{id:'a',name:'甲',email:'student@example.com',passwordHash:sample},{id:'a',name:'甲',email:'other@example.com'},{name:'甲',email:'student@example.com'}])assert.throws(()=>P.finishAccount(old,input()));
});
test('session 採白名單，絕不夾帶 password/hash 或其他帳號內部資料',()=>{
  const session=P.sessionFor({...P.finishAccount(null,input()),password:'never-copy-this',role:'admin',nested:{passwordHash:sample}});
  assert.deepEqual(Object.keys(session),['id','name','email','authMode']);
  assert.equal(session.id,'new-reader');assert.equal(session.authMode,'email_preview');
  assert.equal(JSON.stringify(session).includes('digest'),false);assert.equal(session.password,undefined);
});
test('暱稱 1–60 字，缺資料不可建立 session',()=>{
  assert.equal(P.validateNickname('  小芽  '),'小芽');
  for(const name of ['',null,'字'.repeat(61)])assert.throws(()=>P.validateNickname(name));
  assert.throws(()=>P.sessionFor({id:'x',name:'小芽',email:'wrong'}));
});
test('瀏覽器 UMD 可用，沒有 WebCrypto 時明確拒絕，不退回明文',async()=>{
  const code=fs.readFileSync(path.join(__dirname,'../password-preview.js'),'utf8');
  const sandbox={TextEncoder};vm.createContext(sandbox);vm.runInContext(code,sandbox);
  await assert.rejects(sandbox.PreviewPassword.hashPassword('test-password'),/HTTPS/);
  sandbox.crypto=webcrypto;
  assert.equal((await sandbox.PreviewPassword.hashPassword('test-password')).kdf,'PBKDF2');
});

// DOM/event harness exercises the auth controller without network or real browser data.
const OTP=require('../auth-domain.js');
const ACCOUNT_KEY='leya-preview-accounts-v4',SESSION_KEY='leya-reader-v3';
function authHarness(initial={},overrides={}){
  class Element{
    constructor(id,tag){this.id=id;this.tagName=tag;this.value='';this.hidden=false;this.disabled=false;this.readOnly=false;this.inert=true;this.textContent='';this.listeners={};this.attrs={};this.type=id==='login-password'?'password':'text';}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    setAttribute(name,value){this.attrs[name]=value;}
    focus(){}
    querySelector(){const ids={'email-form':['login-email','login-password'],'code-form':['login-code'],'nickname-form':['login-nickname']};return (ids[this.id]||[]).map(id=>elements[id]).find(el=>!el.readOnly)||null;}
    fire(name){for(const fn of this.listeners[name]||[])fn({preventDefault(){},target:this});}
  }
  const html=fs.readFileSync(path.join(__dirname,'../access.html'),'utf8'),elements={};
  for(const match of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g))elements[match[2]]=new Element(match[2],match[1]);
  const storage=new Map(Object.entries(initial)),failures=new Map();
  const localStorage={getItem:key=>storage.get(key)||null,setItem(key,value){if((failures.get(key)||0)>0){failures.set(key,failures.get(key)-1);const e=new Error('storage failed');e.name='QuotaExceededError';throw e;}storage.set(key,value);}};
  let hashCalls=0,verifyCalls=0;
  const sandbox={document:{querySelector:selector=>elements[selector.slice(1)]||null,querySelectorAll:()=>Object.values(elements).filter(el=>['input','button'].includes(el.tagName))},localStorage,
    navigator:{locks:{request:async(_name,fn)=>fn()}},location:{href:''},crypto:webcrypto,Date,Map,Promise,
    setInterval:()=>1,clearInterval(){},addEventListener(){},PreviewAuthDomain:OTP,
    PreviewPassword:{...P,hashPassword:async(password)=>{hashCalls++;return overrides.hashPassword?overrides.hashPassword(password):{...sample};},verifyPassword:async(password,hash)=>{verifyCalls++;return overrides.verifyPassword?overrides.verifyPassword(password,hash):password==='correct-password';}}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../auth.js'),'utf8'),sandbox);
  const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  return {elements,storage,failures,sandbox,settle,counts:()=>({hashCalls,verifyCalls}),async fire(id,event='click'){elements[id].fire(event);await settle();}};
}
async function beginRegistration(h){h.elements['login-email'].value='student@example.com';h.elements['login-password'].value='correct-password';await h.fire('email-form','submit');}
async function verifyRegistration(h){h.elements['login-code'].value=h.elements['demo-code'].textContent;await h.fire('code-form','submit');}

test('UI：新註冊在驗碼及暱稱完成前不寫帳號，成功後 session 無 hash',async()=>{
  const h=authHarness();await beginRegistration(h);
  assert.equal(h.storage.has(ACCOUNT_KEY),false);assert.equal(h.elements['code-form'].hidden,false);
  assert.equal(h.elements['login-password'].value,'');
  h.elements['login-code'].value='invalid';await h.fire('code-form','submit');
  assert.equal(h.storage.has(ACCOUNT_KEY),false);assert.equal(h.elements['auth-error'].hidden,false);
  await verifyRegistration(h);assert.equal(h.storage.has(ACCOUNT_KEY),false);
  h.elements['login-nickname'].value='小芽';await h.fire('nickname-form','submit');
  const account=JSON.parse(h.storage.get(ACCOUNT_KEY))['student@example.com'],session=JSON.parse(h.storage.get(SESSION_KEY));
  assert.equal(account.name,'小芽');assert.equal(account.passwordHash.kdf,'PBKDF2');
  assert.deepEqual(Object.keys(session),['id','name','email','authMode']);assert.equal(session.id,account.id);
  assert.equal(h.sandbox.location.href,'my-challenge.html');assert.equal(h.storage.get(ACCOUNT_KEY).includes('correct-password'),false);
});

test('UI：回訪錯密碼不登入，正確密碼登入且不改帳號',async()=>{
  const user={id:'old-reader',name:'原暱稱',email:'student@example.com',passwordHash:sample};
  const original=JSON.stringify({'student@example.com':user}),h=authHarness({[ACCOUNT_KEY]:original});
  await h.fire('auth-mode-login');h.elements['login-email'].value=user.email;h.elements['login-password'].value='wrong-password';
  await h.fire('email-form','submit');assert.equal(h.storage.has(SESSION_KEY),false);
  h.elements['login-password'].value='correct-password';await h.fire('email-form','submit');
  assert.equal(JSON.parse(h.storage.get(SESSION_KEY)).id,'old-reader');assert.equal(h.storage.get(ACCOUNT_KEY),original);
});

test('UI：舊 OTP 帳號升級只加密碼，保留 reader ID、暱稱及其他帳號',async()=>{
  const old={id:'legacy-reader',name:'原暱稱',email:'student@example.com'},other={id:'other',name:'另一位',email:'other@example.com'};
  const h=authHarness({[ACCOUNT_KEY]:JSON.stringify({'student@example.com':old,'other@example.com':other})});
  await beginRegistration(h);await verifyRegistration(h);
  assert.equal(h.elements['login-nickname'].readOnly,true);assert.equal(h.elements['login-nickname'].value,'原暱稱');
  await h.fire('nickname-form','submit');
  const data=JSON.parse(h.storage.get(ACCOUNT_KEY));assert.equal(data['student@example.com'].id,'legacy-reader');assert.equal(data['student@example.com'].name,'原暱稱');assert.deepEqual(data['other@example.com'],other);
});

test('UI：帳號已存但 session 寫入失敗可重試，不重建或鎖死 OTP',async()=>{
  const h=authHarness();await beginRegistration(h);await verifyRegistration(h);h.elements['login-nickname'].value='小芽';h.failures.set(SESSION_KEY,1);
  await h.fire('nickname-form','submit');const first=JSON.parse(h.storage.get(ACCOUNT_KEY))['student@example.com'];
  assert.equal(h.storage.has(SESSION_KEY),false);assert.equal(h.elements['nickname-form'].hidden,false);
  await h.fire('nickname-form','submit');assert.equal(JSON.parse(h.storage.get(SESSION_KEY)).id,first.id);
  assert.equal(Object.keys(JSON.parse(h.storage.get(ACCOUNT_KEY))).length,1);
});

test('UI：帳號保存失敗可在暱稱階段重試，驗證碼不用再次消耗',async()=>{
  const h=authHarness();await beginRegistration(h);await verifyRegistration(h);h.elements['login-nickname'].value='小芽';h.failures.set(ACCOUNT_KEY,1);
  await h.fire('nickname-form','submit');assert.equal(h.storage.has(ACCOUNT_KEY),false);
  await h.fire('nickname-form','submit');assert.equal(JSON.parse(h.storage.get(SESSION_KEY)).name,'小芽');
});

test('UI：PBKDF2 等待中阻止重複送件及模式切換',async()=>{
  let resolve;const waiting=new Promise(r=>{resolve=r;});
  const h=authHarness({}, {hashPassword:()=>waiting});h.elements['login-email'].value='student@example.com';h.elements['login-password'].value='correct-password';
  h.elements['email-form'].fire('submit');h.elements['email-form'].fire('submit');h.elements['auth-mode-login'].fire('click');
  await h.settle();assert.equal(h.counts().hashCalls,1);assert.equal(h.elements['auth-mode-login'].disabled,true);assert.equal(h.storage.has(ACCOUNT_KEY),false);
  resolve({...sample});await h.settle();assert.equal(h.elements['code-form'].hidden,false);assert.equal(h.elements['auth-mode-register'].attrs['aria-pressed'],'true');
});

test('UI：驗證期間其他分頁已註冊，不覆寫已建立的密碼或 ID',async()=>{
  const h=authHarness();await beginRegistration(h);await verifyRegistration(h);h.elements['login-nickname'].value='小芽';
  const concurrent={id:'concurrent-reader',name:'另一頁',email:'student@example.com',passwordHash:{...sample,salt:'11'.repeat(16)}};
  const original=JSON.stringify({'student@example.com':concurrent});h.storage.set(ACCOUNT_KEY,original);
  await h.fire('nickname-form','submit');assert.equal(h.storage.get(ACCOUNT_KEY),original);assert.equal(h.storage.has(SESSION_KEY),false);
});

test('UI：session 寫入採白名單，已完成的登入驗證不使用過時帳號',async()=>{
  let resolve;const waiting=new Promise(r=>{resolve=r;});
  const user={id:'old-reader',name:'小芽',email:'student@example.com',passwordHash:sample};
  const h=authHarness({[ACCOUNT_KEY]:JSON.stringify({'student@example.com':user})},{verifyPassword:()=>waiting});
  await h.fire('auth-mode-login');h.elements['login-email'].value=user.email;h.elements['login-password'].value='correct-password';h.elements['email-form'].fire('submit');
  h.storage.set(ACCOUNT_KEY,JSON.stringify({'student@example.com':{...user,id:'changed-reader'}}));resolve(true);await h.settle();
  assert.equal(h.storage.has(SESSION_KEY),false);assert.match(h.elements['auth-error'].textContent,/更新/);
});
