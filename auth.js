/* LOCAL DEMO: no SMTP, no production account, no server authentication.
   Only a salted WebCrypto PBKDF2 record is persisted; passwords stay in memory. */
(function(){
  'use strict';
  const D=window.PreviewAuthDomain,P=window.PreviewPassword,$=s=>document.querySelector(s);
  const ACCOUNT_KEY='leya-preview-accounts-v4',SESSION_KEY='leya-reader-v3';
  const forms=[$('#email-form'),$('#code-form'),$('#nickname-form')];
  const sentChallenges=new Map();
  let mode='register',challenge=null,pending=null,verifiedEmail=null,cooldownTimer,busy=false,epoch=0;

  function message(value){$('#auth-error').hidden=!value;$('#auth-error').textContent=value||'';}
  function show(index){forms.forEach((form,i)=>{form.hidden=i!==index;});message('');}
  function accounts(){
    let data;
    try{data=JSON.parse(localStorage.getItem(ACCOUNT_KEY)||'{}');}catch(_){throw new Error('無法讀取本機帳號，請確認瀏覽器儲存權限；原資料未更動。');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('本機帳號格式不完整，請聯絡管理者保留原資料。');
    return data;
  }
  function accountFor(email,data=accounts()){return Object.prototype.hasOwnProperty.call(data,email)?data[email]:null;}
  function current(token){if(token!==epoch)throw new Error('操作已取消，請重新開始。');}
  function tick(){
    const left=challenge?Math.max(0,Math.ceil((challenge.sentAt+60000-Date.now())/1000)):0;
    $('#resend-code').disabled=busy||left>0;
    $('#resend-status').textContent=left?left+' 秒後可重新取得':'';
    if(!left)clearInterval(cooldownTimer);
  }
  function controls(){
    document.querySelectorAll('.auth-panel input,.auth-panel button').forEach(el=>{el.disabled=busy;});
    forms.forEach(form=>{form.inert=false;});
    $('#auth-busy').textContent=busy?'處理中，請稍候…':'';
    tick();
  }
  async function run(work){
    if(busy)return;
    busy=true;const token=++epoch;message('');controls();
    try{await work(token);}catch(error){
      if(token===epoch)message(error.name==='QuotaExceededError'||error.name==='SecurityError'?'瀏覽器無法保存，請確認儲存空間與權限，再按一次繼續。':error.message||'目前無法完成，請稍後重試。');
    }finally{if(token===epoch){busy=false;controls();const form=forms.find(form=>!form.hidden);form?.querySelector('input:not([readonly])')?.focus();}}
  }
  function resetFlow(nextMode){
    if(busy)return;
    epoch++;mode=nextMode;pending=null;verifiedEmail=null;challenge=null;clearInterval(cooldownTimer);
    $('#login-password').value='';$('#login-password').type='password';$('#toggle-password').textContent='顯示密碼';$('#toggle-password').setAttribute('aria-pressed','false');
    $('#login-code').value='';$('#demo-code').textContent='';$('#login-nickname').value='';$('#legacy-upgrade').hidden=mode!=='login';
    $('#auth-mode-register').setAttribute('aria-pressed',String(mode==='register'));
    $('#auth-mode-login').setAttribute('aria-pressed',String(mode==='login'));
    $('#email-form-title').textContent=mode==='register'?'第一次來，建立測試帳號':'歡迎回來';
    $('#email-submit').textContent=mode==='register'?'取得驗證碼（預覽）':'登入本機帳號 →';
    $('#login-password').autocomplete=mode==='register'?'new-password':'current-password';
    $('#password-label').textContent=mode==='register'?'設定測試密碼':'測試密碼';
    $('#registration-help').hidden=mode!=='register';
    $('#login-help').hidden=mode!=='login';show(0);controls();
  }
  function randomCode(){
    let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);
    return String(n%1000000).padStart(6,'0');
  }
  function issueCode(){
    if(!pending)throw new Error('請先填寫信箱與測試密碼。');
    const next=D.issue(pending.email,randomCode(),Date.now(),sentChallenges.get(pending.email));
    challenge=next;sentChallenges.set(pending.email,next);verifiedEmail=null;
    $('#email-destination').textContent='測試信箱：'+pending.email;
    $('#demo-code').textContent=next.code;$('#login-code').value='';show(1);
    clearInterval(cooldownTimer);cooldownTimer=setInterval(tick,1000);tick();
  }
  function enter(user){
    // Explicit allowlist: credentials and account metadata cannot leak to the session.
    localStorage.setItem(SESSION_KEY,JSON.stringify(P.sessionFor(user)));
    $('#login-password').value='';location.href='my-challenge.html';
  }
  function accountLock(work){
    if(!navigator.locks?.request)throw new Error('此瀏覽器無法安全保存跨分頁帳號，請使用新版 Chrome、Edge、Firefox 或 Safari。');
    return navigator.locks.request(ACCOUNT_KEY,work);
  }

  $('#auth-mode-register').addEventListener('click',()=>resetFlow('register'));
  $('#auth-mode-login').addEventListener('click',()=>resetFlow('login'));
  $('#toggle-password').addEventListener('click',()=>{
    const field=$('#login-password'),showing=field.type==='password';field.type=showing?'text':'password';
    $('#toggle-password').textContent=showing?'隱藏密碼':'顯示密碼';$('#toggle-password').setAttribute('aria-pressed',String(showing));
  });
  $('#legacy-upgrade').addEventListener('click',()=>{
    resetFlow('register');$('#registration-help').textContent='先設定新的測試密碼，完成信箱驗證後，會沿用原本的帳號、暱稱與作品。';
  });
  $('#email-form').addEventListener('submit',event=>{
    event.preventDefault();run(async token=>{
      const email=D.normalizeEmail($('#login-email').value),password=P.validatePassword($('#login-password').value);
      const existing=accountFor(email);
      if(mode==='login'){
        if(!existing)throw new Error('這個瀏覽器還沒有此帳號，請先切換到註冊。');
        if(!existing.passwordHash){$('#legacy-upgrade').hidden=false;throw new Error('這是舊版驗證碼帳號。請按下方按鈕驗證信箱並設定測試密碼，原作品會保留。');}
        const checkedId=existing.id,checkedHash=JSON.stringify(existing.passwordHash);
        const ok=await P.verifyPassword(password,existing.passwordHash);current(token);
        if(!ok)throw new Error('信箱或密碼不正確，請再試一次。');
        const latest=accountFor(email);
        if(!latest||latest.id!==checkedId||JSON.stringify(latest.passwordHash)!==checkedHash)throw new Error('帳號資料剛剛已更新，請再登入一次。');
        enter(latest);return;
      }
      if(existing?.passwordHash)throw new Error('這個信箱已設定測試密碼，請切換到登入。');
      const prior=sentChallenges.get(email);
      if(prior&&Date.now()-prior.sentAt<60000)throw new Error('請等待 60 秒後再重新取得驗證碼。');
      const passwordHash=await P.hashPassword(password);current(token);
      pending={email,passwordHash,savedUser:null};
      issueCode();$('#login-password').value='';
    });
  });
  $('#resend-code').addEventListener('click',()=>run(()=>issueCode()));
  $('#change-email').addEventListener('click',()=>resetFlow('register'));
  $('#nickname-back').addEventListener('click',()=>resetFlow('register'));
  $('#code-form').addEventListener('submit',event=>{
    event.preventDefault();run(()=>{
      if(!pending)throw new Error('請先填寫信箱與測試密碼。');
      // Read storage before consuming the code, so a storage failure can be retried.
      const user=accountFor(pending.email);
      if(user?.passwordHash)throw new Error('另一個分頁已完成此帳號設定，請切換到登入。');
      verifiedEmail=D.verify(challenge,pending.email,$('#login-code').value,Date.now());
      $('#login-nickname').value=user?.name||'';$('#login-nickname').readOnly=!!user?.name;
      $('#nickname-help').textContent=user?.name?'沿用原本的暱稱與作品；按下完成後，新的測試密碼才會生效。':'取一個喜歡的稱呼。按下完成後，才會保存這個本機帳號。';
      $('#nickname-submit').textContent=user?'設定測試密碼並繼續 →':'完成註冊並開始閱讀 →';
      show(2);
    });
  });
  $('#nickname-form').addEventListener('submit',event=>{
    event.preventDefault();run(async token=>{
      if(!pending||!verifiedEmail||pending.email!==verifiedEmail)throw new Error('請先完成信箱驗證。');
      const name=P.validateNickname($('#login-nickname').value);
      const user=await accountLock(()=>{
        current(token);
        const data=accounts(),existing=accountFor(verifiedEmail,data);
        // Account write may already have succeeded while session write failed.
        if(pending.savedUser&&existing?.id===pending.savedUser.id&&JSON.stringify(existing.passwordHash)===JSON.stringify(pending.passwordHash))return existing;
        const complete=P.finishAccount(existing,{email:pending.email,verifiedEmail,name,passwordHash:pending.passwordHash,id:crypto.randomUUID()});
        const updated={...data,[verifiedEmail]:complete};
        localStorage.setItem(ACCOUNT_KEY,JSON.stringify(updated));
        pending.savedUser=complete;return complete;
      });
      current(token);enter(user);
    });
  });
  window.addEventListener('pagehide',()=>{epoch++;clearInterval(cooldownTimer);$('#login-password').value='';});
  window.addEventListener('pageshow',event=>{if(event.persisted){busy=false;resetFlow('login');}});
  if(!D||!P){message('登入元件尚未載入，請重新整理頁面。');return;}
  resetFlow('register');
})();
