/* LOCAL DEMO ONLY. Plaintext OTP and client clocks are not production authentication.
   This module sends no network requests and creates no registered server account. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PreviewAuthDomain=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function normalizeEmail(value){
    if(typeof value!=='string')throw new Error('請填寫有效的電子信箱。');
    const email=value.trim().toLowerCase();
    if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('請填寫有效的電子信箱（最多 254 個字元）。');
    return email;
  }
  function time(value){
    if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-600000)throw new Error('系統時間不正確，請重新整理後再試。');
    return value;
  }
  function validCode(value){return typeof value==='string'&&/^\d{6}$/.test(value);}
  function issue(email,code,now,previous){
    email=normalizeEmail(email);time(now);
    if(!validCode(code))throw new Error('驗證碼必須是六位數字。');
    if(previous&&typeof previous==='object'){
      let priorEmail;try{priorEmail=normalizeEmail(previous.email);}catch(_){}
      if(priorEmail===email&&Number.isSafeInteger(previous.sentAt)&&now-previous.sentAt<60000){
        throw new Error('請等待 60 秒後再重新取得驗證碼。');
      }
    }
    return {email,code,sentAt:now,expiresAt:now+600000,attempts:0,used:false};
  }
  function verify(challenge,email,code,now){
    time(now);
    if(!challenge||typeof challenge!=='object'||!validCode(challenge.code)||!Number.isSafeInteger(challenge.expiresAt)||!Number.isInteger(challenge.attempts)||challenge.attempts<0||typeof challenge.used!=='boolean')throw new Error('請先取得新的驗證碼。');
    if(challenge.used)throw new Error('這組驗證碼已使用，請重新取得。');
    if(now>=challenge.expiresAt)throw new Error('驗證碼已超過 10 分鐘，請重新取得。');
    if(challenge.attempts>=5)throw new Error('已輸錯 5 次，請重新取得驗證碼。');
    let normalized;try{normalized=normalizeEmail(email);}catch(_){challenge.attempts++;throw new Error('電子信箱或驗證碼不正確。');}
    if(normalized!==challenge.email||!validCode(code)||code!==challenge.code){
      challenge.attempts++;
      throw new Error(challenge.attempts>=5?'已輸錯 5 次，請重新取得驗證碼。':'電子信箱或驗證碼不正確。');
    }
    challenge.used=true;return normalized;
  }
  return {normalizeEmail,issue,verify};
});
