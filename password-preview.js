/* LOCAL DEMO ONLY. Browser-held hashes/OTP are not server authentication.
 * MDN: https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params
 * https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
 * https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
 * This module makes no network requests and never stores a plaintext password.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PreviewPassword=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ITERATIONS=600000;
  function validatePassword(value){
    if(typeof value!=='string'||Array.from(value).length<8||Array.from(value).length>128)throw new Error('測試密碼請設定 8 至 128 個字。');
    return value; // Preserve spaces; never silently trim or normalize a password.
  }
  function validateNickname(value){
    if(typeof value!=='string')throw new Error('請填寫暱稱。');
    const name=value.trim();
    if(!name||Array.from(name).length>60)throw new Error('請填寫 1 至 60 字的暱稱。');
    return name;
  }
  function email(value){
    if(typeof value!=='string')throw new Error('請先完成信箱驗證。');
    const result=value.trim().toLowerCase();
    if(result.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error('請先完成信箱驗證。');
    return result;
  }
  const hex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  const bytes=value=>Uint8Array.from(value.match(/../g),pair=>parseInt(pair,16));
  function checkedCredential(value){
    if(!value||value.version!==1||value.kdf!=='PBKDF2'||value.hash!=='SHA-256'||value.iterations!==ITERATIONS||typeof value.salt!=='string'||!/^[a-f0-9]{32}$/.test(value.salt)||typeof value.digest!=='string'||!/^[a-f0-9]{64}$/.test(value.digest))throw new Error('這個本機帳號的密碼資料無法讀取，請聯絡管理者保留原資料。');
    return {version:1,kdf:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:value.salt,digest:value.digest};
  }
  function webCrypto(){
    if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)throw new Error('此瀏覽器無法處理測試密碼，請使用 HTTPS 或本機 localhost 預覽。');
    return globalThis.crypto;
  }
  async function derive(password,salt){
    const api=webCrypto();
    const raw=new TextEncoder().encode(password);
    let key;
    try{key=await api.subtle.importKey('raw',raw,'PBKDF2',false,['deriveBits']);}
    finally{raw.fill(0);}
    return new Uint8Array(await api.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},key,256));
  }
  async function hashPassword(password){
    validatePassword(password);
    const salt=webCrypto().getRandomValues(new Uint8Array(16));
    const digest=await derive(password,salt);
    return {version:1,kdf:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:hex(salt),digest:hex(digest)};
  }
  async function verifyPassword(password,credential){
    validatePassword(password);
    const safe=checkedCredential(credential),actual=await derive(password,bytes(safe.salt)),expected=bytes(safe.digest);
    let different=0;
    for(let i=0;i<expected.length;i++)different|=expected[i]^actual[i];
    return different===0;
  }
  function finishAccount(existing,input){
    if(!input||email(input.email)!==email(input.verifiedEmail))throw new Error('請先完成這個信箱的驗證。');
    const verifiedEmail=email(input.email),credential=checkedCredential(input.passwordHash);
    if(existing&&existing.passwordHash)throw new Error('這個信箱已設定密碼，請切換到登入。');
    if(existing&&email(existing.email)!==verifiedEmail)throw new Error('原帳號與驗證信箱不相符，尚未修改資料。');
    if(existing&&(typeof existing.id!=='string'||!existing.id))throw new Error('原帳號識別資料不完整，尚未修改資料。');
    const id=existing?existing.id:input.id;
    if(typeof id!=='string'||!id)throw new Error('無法建立本機帳號識別碼。');
    const name=existing&&typeof existing.name==='string'&&existing.name.trim()?existing.name:validateNickname(input.name);
    return {...(existing||{}),id,name,email:verifiedEmail,passwordHash:credential};
  }
  function sessionFor(user){
    if(!user||typeof user.id!=='string'||!user.id)throw new Error('本機帳號資料不完整。');
    return {id:user.id,name:validateNickname(user.name),email:email(user.email),authMode:'email_preview'};
  }
  return {validatePassword,validateNickname,hashPassword,verifyPassword,checkedCredential,finishAccount,sessionFor};
});
