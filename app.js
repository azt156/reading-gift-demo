(async function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=iso=>new Date(iso).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID();
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4200);}
$('.leya-help-close')?.addEventListener('click',()=>{$('.leya-help').hidden=true;});
const menu=$('.menu-toggle');menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'關閉選單':'開啟選單');$('#main-nav').classList.toggle('open',open);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','開啟選單');$('#main-nav').classList.remove('open');}});
$$('#main-nav a').forEach(a=>a.addEventListener('click',()=>{menu?.setAttribute('aria-expanded','false');$('#main-nav').classList.remove('open');}));
// Keep the inline semantic icon readable even if a mascot request fails.
$$('.review-art img').forEach(img=>{
 const fallback=()=>{img.hidden=true;img.closest('.review-art').classList.add('image-unavailable');};
 img.addEventListener('error',fallback,{once:true});
 if(img.complete&&!img.naturalWidth)fallback();
});
if(!$('#reading-form')&&!$('#admin-records')&&!$('#access-form')&&!$('[data-campaign]'))return;
const D=window.ReadingDomain;
function storageFailure(e){const box=$('#storage-error');const message='瀏覽器無法保存資料，請確認儲存空間或改用一般瀏覽模式；目前內容未成功保存。';if(box){box.hidden=false;box.textContent=message;}toast(message);console.warn('Local storage operation failed:',e?.name||'unknown');}
let db;
try{db=await new Promise((resolve,reject)=>{const q=indexedDB.open('ley a-reading-v3'.replace(' ',''),1);q.onupgradeneeded=()=>q.result.createObjectStore('app');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('blocked'));});}catch(e){storageFailure(e);return;}
function state(){return new Promise((resolve,reject)=>{const q=db.transaction('app').objectStore('app').get('state');q.onsuccess=()=>resolve(q.result||D.empty());q.onerror=()=>reject(q.error);});}
function mutate(fn){return new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');const st=tx.objectStore('app');const q=st.get('state');let result;let caught;q.onsuccess=()=>{try{let s=q.result||D.empty();result=fn(s);st.put(s,'state');}catch(e){caught=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(caught||tx.error||new Error('儲存中斷'));tx.onerror=()=>{};});}
let renderAdmin;
const C=window.CampaignSettings;
const updates=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('leya-campaign-settings'):null;
function notifySettings(){updates?.postMessage('changed');}
const U=window.CommunitySettings;
let communityUrls=[];
function communityImage(blob){const url=URL.createObjectURL(blob);communityUrls.push(url);return url;}
window.addEventListener('pagehide',()=>communityUrls.forEach(url=>URL.revokeObjectURL(url)));
function renderCommunity(saved){
 const value=U.merge(saved);communityUrls.forEach(url=>URL.revokeObjectURL(url));communityUrls=[];
 if($('#founder-names')){ $('#founder-names').textContent=value.founders.names;$('#founder-intro').textContent=value.founders.intro;
 const photo=$('#founder-photo');photo.hidden=!value.founders.photo;photo.closest('.founder-image').hidden=false;$('#founder-placeholder').hidden=!!value.founders.photo;
 if(value.founders.photo)photo.src=communityImage(value.founders.photo);else photo.removeAttribute('src'); }
 const visible=value.sponsors.filter(x=>x.visible);
 

 const foot=$('.footer-bottom .sponsor');if(foot){foot.hidden=!visible.length;foot.innerHTML=visible.map(x=>'<span class="footer-supporter">'+esc(x.role)+' '+(x.logo||x.builtin?`<img src="${x.logo?communityImage(x.logo):esc(x.builtin)}" alt="${esc(x.name)}">`:esc(x.name))+'</span>').join('');}
}
async function setupCommunity(){
 const s=await state();let draft=U.merge(s.community),photoBusy=0;
 const panel=document.createElement('section');panel.className='panel settings-panel';panel.innerHTML=`<h2>共同發起人與贊助單位</h2><p>合照顯示在共同發起人區，贊助單位與 Logo 顯示在頁尾。</p><form id="community-form" class="settings-form" inert onsubmit="return false">
 <fieldset><legend>共同發起人</legend><label for="founder-setting-names">姓名</label><input id="founder-setting-names" maxlength="120" required><label for="founder-setting-intro">一句話介紹</label><textarea id="founder-setting-intro" maxlength="600" rows="3"></textarea><label for="founder-setting-photo">共同發起人合照</label><input id="founder-setting-photo" type="file" accept="image/png,image/jpeg,image/webp"><p class="field-help">PNG、JPG 或 WebP，5 MB 以內。上傳後顯示於共同發起人區；未提供時保留合照框。</p><img id="founder-setting-preview" class="upload-preview" alt="已選擇的共同發起人合照" hidden></fieldset>
 <fieldset><legend>贊助單位</legend><div id="sponsor-setting-list"></div><button type="button" class="btn secondary" id="add-sponsor">＋ 新增贊助單位</button><p class="field-help">空白且未上傳 Logo 的新列不會保存。</p></fieldset>
 <div id="community-error" class="error-box" role="alert" hidden></div><div class="form-actions"><button type="submit" class="btn primary" id="save-community">儲存發起人與贊助單位</button><span id="community-status" class="settings-status" role="status"></span></div></form>`;
 $('.admin-workspace').insertBefore(panel,$('#admin-summary'));
 const form=$('#community-form');$('#founder-setting-names').value=draft.founders.names;$('#founder-setting-intro').value=draft.founders.intro;
 let previewUrls=[];
 function imagePreview(){previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];function src(blob){const url=URL.createObjectURL(blob);previewUrls.push(url);return url;}const photo=$('#founder-setting-preview');photo.hidden=!draft.founders.photo;if(draft.founders.photo)photo.src=src(draft.founders.photo);
 draft.sponsors.forEach(x=>{const img=$('#sponsor-preview-'+x.id);img.hidden=!(x.logo||x.builtin);if(x.logo||x.builtin)img.src=x.logo?src(x.logo):x.builtin;});}
 function drawSponsors(){
 $('#sponsor-setting-list').innerHTML=draft.sponsors.map(x=>`<div class="sponsor-setting" data-sponsor-id="${esc(x.id)}"><div class="settings-grid"><div><label for="sponsor-name-${x.id}">單位名稱</label><input id="sponsor-name-${x.id}" data-community-key="name" maxlength="100" value="${esc(x.name)}"></div><div><label for="sponsor-role-${x.id}">合作稱呼</label><input id="sponsor-role-${x.id}" data-community-key="role" maxlength="100" value="${esc(x.role)}" placeholder="例如：本期贊助單位"></div></div><label for="sponsor-logo-${x.id}">單位 Logo（5 MB 以內）</label><input id="sponsor-logo-${x.id}" data-logo="${esc(x.id)}" type="file" accept="image/png,image/jpeg,image/webp"><img id="sponsor-preview-${x.id}" class="upload-preview logo-preview" alt="${esc(x.name)} Logo" hidden><label class="checkbox"><input type="checkbox" data-community-key="visible" ${x.visible?'checked':''}><span>顯示在頁尾（取消勾選即可隱藏，資料保留）</span></label></div>`).join('');imagePreview();}
 drawSponsors();
 form.addEventListener('input',e=>{const el=e.target;if(el.dataset.communityKey){const x=draft.sponsors.find(x=>x.id===el.closest('[data-sponsor-id]').dataset.sponsorId);x[el.dataset.communityKey]=el.type==='checkbox'?el.checked:el.value;}$('#community-status').textContent='尚未儲存';$('#community-error').hidden=true;});
 async function chooseImage(file,assign){if(!file)return;const button=$('#save-community');photoBusy++;button.disabled=true;$$('#community-form input[type=file],#add-sponsor').forEach(el=>el.disabled=true);try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024)throw new Error('請選擇 5 MB 以內的 PNG、JPG 或 WebP 圖片。');const bitmap=await createImageBitmap(file);bitmap.close();assign(file);imagePreview();$('#community-status').textContent='圖片已選擇，請按儲存。';}catch(e){$('#community-error').hidden=false;$('#community-error').textContent=e.message||'圖片無法讀取，請換一個檔案。';}finally{photoBusy--;button.disabled=photoBusy>0;$$('#community-form input[type=file],#add-sponsor').forEach(el=>el.disabled=photoBusy>0);}}
 form.addEventListener('change',e=>{if(e.target.id==='founder-setting-photo')chooseImage(e.target.files[0],file=>draft.founders.photo=file);if(e.target.dataset.logo){const x=draft.sponsors.find(x=>x.id===e.target.dataset.logo);chooseImage(e.target.files[0],file=>x.logo=file);}});
 $('#add-sponsor').addEventListener('click',()=>{if(draft.sponsors.length>=12){toast('最多可設定 12 個贊助單位。');return;}draft.sponsors.push({id:uid(),name:'',role:'本期贊助單位',logo:null,builtin:null,visible:true});drawSponsors();$('#community-status').textContent='尚未儲存';$('#sponsor-name-'+draft.sponsors.at(-1).id).focus();});
 form.addEventListener('submit',async e=>{e.preventDefault();if(photoBusy)return;const button=$('#save-community');button.disabled=true;$('#community-error').hidden=true;try{draft.founders.names=$('#founder-setting-names').value;draft.founders.intro=$('#founder-setting-intro').value;const input={...draft,sponsors:draft.sponsors.filter(x=>x.name.trim()||x.logo||x.builtin)};const value=U.validate(input);await mutate(s=>{s.community=value;});draft=value;drawSponsors();notifySettings();$('#community-status').textContent='已儲存，首頁已更新。';toast('發起人與贊助單位已儲存。');}catch(e){$('#community-error').hidden=false;$('#community-error').textContent=e.message;}finally{button.disabled=false;}});
 form.inert=false;window.addEventListener('pagehide',()=>previewUrls.forEach(url=>URL.revokeObjectURL(url)));
}

async function renderCampaign(){
 const s=await state(),c=C.merge(s.campaign);
 renderCommunity(s.community);
 const put=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value;};
 if($('#campaign-title')){
  for(const key of ['title','slogan','intro','gift'])put('campaign-'+key,c[key]);
  $('#campaign-title').classList.toggle('custom-title',c.title!=='閱讀有禮');
  if(c.title==='閱讀有禮')$('#campaign-title').innerHTML='閱讀<span class="gold-text">有禮</span><span class="title-star" aria-hidden="true">✦</span>';
  $('#campaign-intro').innerHTML=esc(c.intro).replace('。','。<br>');
  $('#campaign-slogan').innerHTML=c.slogan.split('，').map(x=>'<span class="slogan-phrase">'+esc(x)+'</span>').join('，<wbr>');
  put('campaign-period',c.startDate?c.startDate.replaceAll('-',' / ')+' — '+c.endDate.replaceAll('-',' / '):'日期確認後公告');
  $('#campaign-steps').innerHTML=c.steps.map((x,i)=>`<li><b>0${i+1}</b><h4>${esc(x.title)}</h4><p>${esc(x.description)}</p></li>`).join('');
  if($('#campaign-important'))$('#campaign-important').innerHTML=c.important.map(x=>`<li>${esc(x)}</li>`).join('');
 }
 put('campaign-capacity',s.capacity);
 const rules=c.rules;
 put('rule-review-days',rules.reviewDays);put('review-days-summary',rules.reviewDays);
 put('rule-review-checks',rules.reviewChecks);put('rule-fairness',rules.fairness);
 put('rule-gift-summary',rules.giftSponsor?`本期提供 ${s.capacity} 本好書，由${rules.giftSponsor}贊助。`:`本期提供 ${s.capacity} 本好書，贊助單位待公告。`);
 put('gift-sponsor-title',rules.giftSponsor||'本期贊助單位待公告');
 put('gift-sponsor-description',rules.giftSponsor?`提供本期 ${s.capacity} 本好書。`:'確認後將在這裡公布。');
 const giftLogo=$('#gift-sponsor-logo');
 if(giftLogo){
  const giftPartner=U.merge(s.community).sponsors.find(x=>x.visible&&x.name===rules.giftSponsor);
  const hasGiftLogo=!!(giftPartner?.logo||giftPartner?.builtin);
  giftLogo.hidden=!hasGiftLogo;$('#gift-sponsor-placeholder').hidden=true;
  if(hasGiftLogo){giftLogo.src=giftPartner.logo?communityImage(giftPartner.logo):giftPartner.builtin;giftLogo.alt=rules.giftSponsor+'標誌';}else giftLogo.removeAttribute('src');
 }
 const remaining=D.remainingBooks(s);
 if($('#rules-stock-status'))$('#rules-stock-status').hidden=remaining>0;
 $$('[data-book-remaining]').forEach(el=>el.textContent=remaining);
 $$('[data-stock-message]').forEach(el=>el.textContent=remaining?'依通過順序保留名額，通過一位就少一本。':'本期贈書已額滿，通過後依序候補。');
}
if($('[data-campaign]')){
 await renderCampaign();window.addEventListener('focus',()=>renderCampaign().catch(storageFailure));
 if(updates)updates.onmessage=()=>renderCampaign().catch(storageFailure);
 return;
}
if($('#admin-records')){
 const container=document.createElement('section');container.className='panel settings-panel';
 container.innerHTML=`<h2>活動設定</h2><p>修改後按「儲存設定」，首頁第二區「閱讀有禮」就會同步更新。</p><form id="campaign-settings-form" class="settings-form" inert onsubmit="return false">
 <label for="setting-title">活動名稱</label><input id="setting-title" maxlength="60" required>
 <label for="setting-slogan">活動區標語</label><input id="setting-slogan" maxlength="120" required>
 <label for="setting-intro">活動區簡短介紹</label><textarea id="setting-intro" maxlength="500" rows="2" required></textarea>
 <div class="settings-grid"><div><label for="setting-startDate">活動開始日期</label><input type="date" id="setting-startDate"></div><div><label for="setting-endDate">活動結束日期</label><input type="date" id="setting-endDate"></div></div><p class="field-help">兩個日期都留空時，首頁顯示「日期確認後公告」。日期僅供活動展示，預覽練習仍可使用。</p>
 <div class="settings-grid"><div><label for="setting-gift">本期禮物</label><input id="setting-gift" maxlength="80" required></div><div><label for="gift-capacity">本期示範名額</label><input id="gift-capacity" type="number" min="1" max="100000" required></div></div>
 <fieldset><legend>如何完成</legend>${[0,1,2,3].map(i=>`<div class="step-setting"><div><label for="setting-step-title-${i}">步驟 ${i+1} 名稱</label><input id="setting-step-title-${i}" maxlength="40" required></div><div><label for="setting-step-description-${i}">步驟 ${i+1} 說明</label><input id="setting-step-description-${i}" maxlength="300" required></div></div>`).join('')}</fieldset>
 <fieldset><legend>審核、贈書與公平規則</legend><div class="settings-grid"><div><label for="setting-review-days">審核工作天數</label><input id="setting-review-days" type="number" min="1" max="60" required></div><div><label for="setting-gift-sponsor">本期贈書贊助單位</label><input id="setting-gift-sponsor" maxlength="100" placeholder="留空時顯示待公告"></div></div><label for="setting-review-checks">審核重點</label><textarea id="setting-review-checks" maxlength="500" rows="3" required></textarea><label for="setting-fairness">公平規則</label><textarea id="setting-fairness" maxlength="500" rows="4" required></textarea><p class="field-help">如需顯示贊助 Logo，請在下方「贊助單位」新增相同名稱並上傳圖片。本 Demo 不會真的寄信、自動轉寫或寄書。</p></fieldset>
 <fieldset hidden><legend>重要事項</legend><label for="setting-important">每一行顯示一項（最多六項）</label><textarea id="setting-important" rows="5" required></textarea></fieldset>
 <div id="settings-error" class="error-box" role="alert" hidden></div><div class="form-actions"><button type="submit" class="btn primary">儲存設定</button><a class="text-link" href="index.html" target="_blank" rel="noopener">查看首頁 ↗</a><span id="settings-status" class="settings-status" role="status"></span></div></form>`;
 $('.admin-workspace').insertBefore(container,$('#admin-summary'));
 const initial=await state(),c=C.merge(initial.campaign),form=$('#campaign-settings-form');
 for(const key of ['title','slogan','intro','startDate','endDate','gift'])$('#setting-'+key).value=c[key];
 c.steps.forEach((x,i)=>{for(const key of ['title','description'])$('#setting-step-'+key+'-'+i).value=x[key];});
 $('#setting-important').value=c.important.join('\n');$('#gift-capacity').value=initial.capacity;
 $('#setting-review-days').value=c.rules.reviewDays;$('#setting-gift-sponsor').value=c.rules.giftSponsor;
 $('#setting-review-checks').value=c.rules.reviewChecks;$('#setting-fairness').value=c.rules.fairness;
 form.addEventListener('input',()=>{$('#settings-status').textContent='尚未儲存';$('#settings-error').hidden=true;});
 form.addEventListener('submit',async e=>{e.preventDefault();const err=$('#settings-error'),button=$('button[type=submit]',form);err.hidden=true;button.disabled=true;try{
 const raw=Object.fromEntries(['title','slogan','intro','startDate','endDate','gift'].map(key=>[key,$('#setting-'+key).value]));
 raw.steps=[0,1,2,3].map(i=>({title:$('#setting-step-title-'+i).value,description:$('#setting-step-description-'+i).value}));raw.important=$('#setting-important').value.split('\n').filter(x=>x.trim());
 raw.rules={reviewDays:Number($('#setting-review-days').value),giftSponsor:$('#setting-gift-sponsor').value,reviewChecks:$('#setting-review-checks').value,fairness:$('#setting-fairness').value};
 const values=C.validate(raw);await mutate(s=>{D.changeCapacity(s,$('#gift-capacity').value);s.campaign=values;});
 notifySettings();await renderAdmin();$('#settings-status').textContent='已儲存，首頁已更新。';toast('活動設定已儲存。');
 }catch(e){err.hidden=false;err.textContent=e.message;$('#settings-status').textContent='尚未儲存';}finally{button.disabled=false;}});form.inert=false;
 await setupCommunity();
}

function getReader(){try{return JSON.parse(localStorage.getItem('leya-reader-v3'))||null;}catch(e){return null;}}
const af=$('#access-form');if(af){const reader=getReader();if(reader)$('#display-name').value=reader.name;af.addEventListener('submit',e=>{e.preventDefault();let name=$('#display-name').value.trim();if(!name){$('#display-name').setCustomValidity('請填寫練習用的暱稱。');$('#display-name').reportValidity();return;}$('#display-name').setCustomValidity('');try{localStorage.setItem('leya-reader-v3',JSON.stringify(reader&&reader.name===name?reader:{id:uid(),name}));location.href='my-challenge.html';}catch(e){storageFailure(e);}});$('#display-name').addEventListener('input',()=>$('#display-name').setCustomValidity(''));af.inert=false;return;}
function pipeline(r){return '<div class="pipeline" aria-label="正式串接狀態"><span>本機預覽：已保存</span><span class="pending">樂寫網站：未串接</span><span class="pending">Google Drive：未串接</span><span class="pending">逐字稿：未串接</span><span class="pending">Gem：未串接</span></div>';}
const statusText={pending:'等待資格判定',revision:'需要補充',approved:'已通過（預覽）',claimed:'已填領取資料（預覽）'};
let activeUrls=[];function mediaUrl(blob){const u=URL.createObjectURL(blob);activeUrls.push(u);return u;}
window.addEventListener('pagehide',()=>activeUrls.forEach(u=>URL.revokeObjectURL(u)));
if($('#reading-form')){
 let reader=getReader();if(!reader||reader.authMode!=='email_preview'){location.replace('access.html');return;}
 $('#reader-greeting').textContent='從一本書開始，把想法慢慢寫清楚。';
 let s=await state();let record=s.records.find(r=>r.readerId===reader.id);
 let draft=s.drafts[reader.id]||{bookTitle:'',bookAuthor:'',bookReason:'',readConfirm:false,notes:[{source:'',text:''}],reflection:'',connection:'',audio:null,attachments:[],authenticConfirm:false,step:1};
 if(record&&record.status!=='revision')draft=record.data;
 let step=Number(draft.step)||1,locked=Boolean(record&&record.status!=='revision');
 const fields={bookTitle:'#book-title',bookAuthor:'#book-author',bookReason:'#book-reason',readConfirm:'#read-confirm',reflection:'#reflection',connection:'#connection',authenticConfirm:'#authentic-confirm'};
 Object.entries(fields).forEach(([key,sel])=>{const el=$(sel);if(el.type==='checkbox')el.checked=!!draft[key];else el.value=draft[key]||'';});
 function drawNotes(){const list=$('#note-list');list.innerHTML=draft.notes.map((n,i)=>`<article class="note-item"><h3>筆記 ${i+1}</h3><label for="note-source-${i}">章節 <span class="required">必填</span></label><input id="note-source-${i}" data-note="${i}" data-key="source" maxlength="180" value="${esc(n.source)}" placeholder="例如：第一章（頁碼可不填）"><label for="note-text-${i}">重點與我的理解 <span class="required">必填</span></label><textarea id="note-text-${i}" data-note="${i}" data-key="text" rows="4" maxlength="8000" placeholder="這一段的重點是……我把它記下來，因為……">${esc(n.text)}</textarea>${i>0&&!n.source.trim()&&!n.text.trim()?`<button class="text-button" type="button" data-discard-note="${i}">取消這則空白筆記</button>`:''}</article>`).join('');}
 drawNotes();
 $('#note-list').addEventListener('click',e=>{const b=e.target.closest('[data-discard-note]');if(!b||locked)return;const i=Number(b.dataset.discardNote),n=draft.notes[i];if(i<1||!n||n.source.trim()||n.text.trim())return;draft.notes.splice(i,1);drawNotes();queueSave().catch(()=>{});progress();});
 draft.attachments=draft.attachments||[];
 function drawAttachments(){const list=$('#support-file-list');list.innerHTML=draft.attachments.map(f=>`<li><a href="${mediaUrl(f.blob)}" download="${esc(f.name)}">${esc(f.name)}</a><span>${(f.blob.size/1024/1024).toFixed(1)} MB</span></li>`).join('');}
 drawAttachments();
 $('#support-files').addEventListener('change',async e=>{const files=[...e.target.files],box=$('#attachment-error');box.hidden=true;try{if(draft.attachments.length+files.length>5)throw new Error('最多保存 5 份附件，請先確認檔案數量。');const allowed={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};for(const f of files){const ext=f.name.split('.').pop().toLowerCase();if(!allowed[ext]||(f.type&&f.type!==allowed[ext])||!f.size||f.size>10*1024*1024)throw new Error('請選擇 10 MB 以內的 PDF、DOCX、JPG 或 PNG 檔案。');}draft.attachments.push(...files.map(f=>({name:f.name,blob:f})));await queueSave();drawAttachments();toast('附件已保存於此瀏覽器。');}catch(e){box.hidden=false;box.textContent=e.message;}finally{e.target.value='';}});
 let saveQueue=Promise.resolve(),saved=true;
 function queueSave(){if(locked)return saveQueue;draft.step=step;const snapshot=structuredClone(draft);saved=false;$('#save-state').textContent='正在保存…';saveQueue=saveQueue.catch(()=>{}).then(()=>mutate(s=>{s.drafts[reader.id]=snapshot;})).then(()=>{saved=true;$('#save-state').textContent='草稿已保存 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});}).catch(e=>{storageFailure(e);throw e;});return saveQueue;}
 document.addEventListener('click',async e=>{const link=e.target.closest('a[href]');if(!link||saved||locked||link.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const href=link.getAttribute('href');if(href.startsWith('#')||href.startsWith('mailto:'))return;e.preventDefault();try{await saveQueue;if(saved)location.href=href;}catch(e){storageFailure(e);}});
 window.addEventListener('beforeunload',e=>{if(!saved&&!locked){e.preventDefault();e.returnValue='';}});
 function progress(){let count=[1,2,3,4].filter(n=>!D.validStep(draft,n)).length;$('#reading-progress').value=count;$('#progress-label').textContent=`已準備 ${count}／4 步`;$('[data-step="'+step+'"]').setAttribute('aria-current','step');$$('[data-step]').forEach(b=>b.classList.toggle('complete',!D.validStep(draft,Number(b.dataset.step))));}
 function showStep(n,focus=false){step=n;$$('[data-panel]').forEach(el=>el.hidden=Number(el.dataset.panel)!==n);$$('[data-step]').forEach(el=>el.removeAttribute('aria-current'));progress();if(focus)$(`[data-panel="${n}"] h2`).focus();}
 function error(message){const b=$('#form-error');b.hidden=!message;b.textContent=message||'';if(message)b.scrollIntoView({behavior:'smooth',block:'center'});}
 $('#reading-form').addEventListener('input',e=>{const t=e.target;if(t.dataset.note!==undefined)draft.notes[Number(t.dataset.note)][t.dataset.key]=t.value;else Object.entries(fields).forEach(([key,sel])=>{if(t===$(sel))draft[key]=t.type==='checkbox'?t.checked:t.value;});if(t.dataset.note!==undefined){const n=draft.notes[Number(t.dataset.note)],b=t.closest('.note-item').querySelector('[data-discard-note]');if(b)b.hidden=!!(n.source.trim()||n.text.trim());}if(t.matches('input:not([type=file]),textarea')){error('');progress();queueSave().catch(()=>{});}});
 $('#add-note').addEventListener('click',()=>{if(draft.notes.length>=60){toast('此預覽最多支援 60 則筆記。');return;}draft.notes.push({source:'',text:''});drawNotes();queueSave().catch(()=>{});$(`#note-source-${draft.notes.length-1}`).focus();progress();});
 $$('[data-next]').forEach(b=>b.addEventListener('click',()=>{const msg=D.validStep(draft,step);if(msg){error(msg);return;}error('');showStep(Number(b.dataset.next),true);queueSave().catch(()=>{});}));
 $$('[data-prev],[data-step]').forEach(b=>b.addEventListener('click',()=>{error('');showStep(Number(b.dataset.prev||b.dataset.step),true);queueSave().catch(()=>{});}));
 let mediaBusy=false;
 function setMediaBusy(busy){mediaBusy=busy;$('#record-start').disabled=busy||locked;$('#record-stop').disabled=true;$('#audio-upload').disabled=busy||locked;$('#submit-reading').disabled=busy||locked;}
 let audioObjectUrl=null;function drawAudio(){if(audioObjectUrl)URL.revokeObjectURL(audioObjectUrl);$('#audio-preview').hidden=!draft.audio;if(draft.audio){audioObjectUrl=URL.createObjectURL(draft.audio.blob);$('#audio-player').src=audioObjectUrl;$('#audio-filename').textContent=draft.audio.name+' · '+Math.round(draft.audio.duration)+' 秒 · 已保存在此瀏覽器';}}
 drawAudio();
 async function acceptAudio(blob,name){const err=$('#audio-error');err.hidden=true;if(!blob.size||blob.size>20*1024*1024)throw new Error('請選擇非空白、20 MB 以內的音檔。');const mime=blob.type.split(';')[0];if(!['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/wave','audio/webm','audio/ogg'].includes(mime))throw new Error('請選擇 MP3、M4A、WAV、WebM 或 OGG 音檔。');
 const duration=await new Promise((resolve,reject)=>{const a=new Audio(),u=URL.createObjectURL(blob);const timer=setTimeout(()=>{done();reject(new Error('無法讀取音檔長度，請改用 WAV 或 MP3。'));},6000);function done(){clearTimeout(timer);URL.revokeObjectURL(u);a.removeAttribute('src');}a.onloadedmetadata=()=>{if(Number.isFinite(a.duration)){const d=a.duration;done();resolve(d);}else{a.currentTime=1e10;}};a.ontimeupdate=()=>{if(Number.isFinite(a.duration)){const d=a.duration;done();resolve(d);}};a.onerror=()=>{done();reject(new Error('音檔無法播放，請換一個檔案。'));};a.src=u;});
 if(duration<1||duration>301)throw new Error('預覽音檔需介於 1 秒與 5 分鐘之間，請調整後再選擇。');draft.audio={blob,name,duration};draft.authenticConfirm=false;$('#authentic-confirm').checked=false;await queueSave();drawAudio();progress();toast('音檔已保存，可以先試聽。');}
 function audioError(e){$('#audio-error').hidden=false;$('#audio-error').textContent=e.message;}
 $('#audio-upload').addEventListener('change',async e=>{const f=e.target.files[0];if(!f||mediaBusy)return;setMediaBusy(true);try{await acceptAudio(f,f.name);}catch(e){audioError(e);}finally{setMediaBusy(false);e.target.value='';}});
 let recorder,stream,timer,startTime;function stopTracks(){stream?.getTracks().forEach(t=>t.stop());clearInterval(timer);}
 $('#record-start').addEventListener('click',async()=>{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){audioError(new Error('目前環境不支援錄音，請使用「選擇已錄好的音檔」。'));return;}if(mediaBusy)return;setMediaBusy(true);try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{stopTracks();$('#record-stop').disabled=true;$('#record-status').textContent='錄音完成，處理音檔中…';try{await acceptAudio(new Blob(chunks,{type:recorder.mimeType}),'我的說書錄音.'+(recorder.mimeType.includes('mp4')?'m4a':'webm'));$('#record-status').textContent='錄音已保存，請先試聽。';}catch(e){audioError(e);$('#record-status').textContent='請重新錄音或選擇音檔。';}finally{setMediaBusy(false);}};recorder.onerror=()=>{stopTracks();audioError(new Error('錄音中斷，請重試或改用音檔。'));setMediaBusy(false);};recorder.start();startTime=Date.now();$('#record-stop').disabled=false;$('#audio-upload').disabled=true;$('#submit-reading').disabled=true;$('#record-status').textContent='正在錄音…';timer=setInterval(()=>{const sec=Math.floor((Date.now()-startTime)/1000);$('#record-clock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')+' / 05:00';if(sec>=300&&recorder.state==='recording')recorder.stop();},250);}catch(e){stopTracks();setMediaBusy(false);audioError(new Error('未取得麥克風權限，或裝置無法錄音。也可以選擇已錄好的音檔。'));}});
 $('#record-stop').addEventListener('click',()=>{if(recorder?.state==='recording')recorder.stop();});window.addEventListener('pagehide',()=>{if(recorder?.state==='recording')recorder.stop();stopTracks();});
 function lockForm(){locked=Boolean(record&&record.status!=='revision');$$('#reading-form input,#reading-form textarea,#reading-form button').forEach(el=>el.disabled=locked);$('#record-stop').disabled=true;if(mediaBusy){$('#record-start').disabled=true;$('#audio-upload').disabled=true;$('#submit-reading').disabled=true;$('#record-stop').disabled=recorder?.state!=='recording';}else if(!locked)$('#record-start').disabled=false;}
 async function renderStatus(){s=await state();record=s.records.find(r=>r.readerId===reader.id);lockForm();$('#claim-section').hidden=true;const box=$('#status-content');$('#submission-status').hidden=!record;$('#reading-form').hidden=locked;$('.workspace-sidebar').hidden=locked;if(locked)$('#reader-greeting').textContent='作品已送出，處理進度都在這裡。';if(!record){box.innerHTML='<span class="tag">尚在草稿</span><p>完成四個步驟再送出，之後可以在這裡查看判定結果與回饋。</p>';return;}
 let desc={pending:'作品已保存在此瀏覽器。正式流程會先確認網站與雲端硬碟雙份保存，再交由 Gem 協助判讀，最後由人工審核。此預覽尚未連接外部服務，可在管理者預覽中測試人工覆核。',revision:'請依下方回饋補充內容，完成後可再次送出。',approved:record.award==='reserved'?'已保留一份預覽名額，可以填寫測試用領取資料。':'本期預覽名額已滿，依通過順序列為候補；目前尚未取得領書資格。',claimed:'領取資料已保存在此瀏覽器。此操作只供流程確認，尚未安排寄送。'}[record.status];
 box.innerHTML=`<div class="status-line"><span class="tag ${record.status==='revision'?'warn':['approved','claimed'].includes(record.status)?'good':''}">${statusText[record.status]}</span><span class="field-help">作品編號 ${esc(record.id.slice(0,8))} · ${fmt(record.submittedAt)}</span></div><p>${desc}</p>${pipeline(record)}${record.passOrder?`<p class="rank-label">通過序號 ${record.passOrder} <span class="tag ${record.award==='reserved'?'good':'warn'}">${record.award==='reserved'?'已保留名額':'候補 '+Math.max(1,record.passOrder-s.capacity)}</span></p><p class="field-help">依首次通過時間排序；示範總名額 ${s.capacity} 份。</p>`:''}${record.feedback?`<div class="feedback"><strong>管理者回饋</strong><br>${esc(record.feedback)}</div>`:''}<details><summary class="field-help">查看處理紀錄</summary><ol class="history">${record.history.map(h=>`<li>${fmt(h.at)} · ${esc(h.text)}</li>`).join('')}</ol></details>`;
 if(record.status==='revision'){const b=document.createElement('button');b.type='button';b.className='btn secondary';b.textContent='回到作品補充';b.addEventListener('click',()=>{showStep(1,true);});box.appendChild(b);}
 if(record.status==='approved'&&record.award==='reserved')$('#claim-section').hidden=false;
 }
 $('#reading-form').addEventListener('submit',async e=>{e.preventDefault();error('');if(mediaBusy){error('請先停止錄音，並等候音檔保存完成。');return;}for(let n=1;n<=4;n++){const msg=D.validStep(draft,n);if(msg){showStep(n,true);error(msg);return;}}const button=$('#submit-reading');button.disabled=true;try{await queueSave();if(!saved)throw new Error('草稿尚未成功保存，請稍後重試。');await mutate(s=>D.submit(s,structuredClone(draft),reader,now(),uid()));await renderStatus();toast('作品已送出預覽。');$('#submission-status').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){error(e.message);button.disabled=false;}});
 $('#claim-form').addEventListener('submit',async e=>{e.preventDefault();const vals={recipient:$('#recipient').value,phone:$('#phone').value,address:$('#address').value,consent:$('#claim-consent').checked};try{await mutate(s=>D.claim(s,record.id,vals,now()));await renderStatus();toast('領取資料已保存（預覽）。');$('#submission-status').scrollIntoView({behavior:'smooth'});}catch(e){toast(e.message);}});
 showStep(step);await renderStatus();$('#reading-form').inert=false;$('#claim-form').inert=false;window.addEventListener('focus',()=>renderStatus().catch(storageFailure));
}
if($('#admin-records')){
 renderAdmin=async function(refreshOnly=false){const s=await state();activeUrls.forEach(u=>URL.revokeObjectURL(u));activeUrls=[];$('#admin-summary').innerHTML=[['待判定',s.records.filter(r=>r.status==='pending').length],['需補充',s.records.filter(r=>r.status==='revision').length],['已保留名額',s.records.filter(r=>r.award==='reserved').length+' / '+s.capacity],['候補',s.records.filter(r=>r.award==='waitlist').length]].map(([label,n])=>`<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');if(refreshOnly===true)return;const filter=$('#review-filter').value,reviewer=$('#reviewer-filter').value;const rows=s.records.filter(r=>(filter==='all'||r.status===filter)&&(reviewer==='all'||r.reviewer===reviewer)).sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));const list=$('#admin-records');if(!rows.length){list.innerHTML='<div class="empty-state"><img src="img/leya-front.png" alt=""><h2>這裡還沒有符合條件的作品。</h2><p>先完成一份閱讀練習，再回來測試審核流程。</p><a class="btn primary" href="my-challenge.html">前往我的閱讀 →</a></div>';return;}
 list.innerHTML=rows.map(r=>{const d=r.data;return `<article class="panel review-record" data-record="${esc(r.id)}"><header><div><h2>${esc(d.bookTitle)}</h2><p class="record-meta">${esc(r.readerName)} · ${esc(d.bookAuthor)} · ${fmt(r.submittedAt)} · 第 ${r.revision} 次送件</p></div><span class="tag">${statusText[r.status]}</span></header>${pipeline(r)}<div class="record-body"><div><h3>章節筆記</h3>${d.notes.map(n=>`<div class="feedback"><strong>${esc(n.source)}</strong><p class="content-text">${esc(n.text)}</p></div>`).join('')}<h3>想法與理由</h3><p class="content-text">${esc(d.reflection)}</p><h3>生活連結</h3><p class="content-text">${esc(d.connection)}</p>${d.attachments?.length?`<h3>補充附件</h3><ul class="attachment-list">${d.attachments.map(f=>`<li><a href="${mediaUrl(f.blob)}" download="${esc(f.name)}">${esc(f.name)}</a></li>`).join('')}</ul>`:''}<h3>口述音檔</h3><audio controls src="${mediaUrl(d.audio.blob)}"></audio><p class="field-help">${esc(d.audio.name)}</p><details><summary>逐字稿／AI 判定</summary><p class="field-help">本 Demo 已保留原音檔，尚未啟用自動轉寫。正式版會將逐字稿與這份作品一起保存至樂寫資料庫，再提供後續審核。</p></details></div><div><div class="review-controls"><label for="assignee-${r.id}">分派審核者<select data-assignee="${r.id}" id="assignee-${r.id}"><option value="A" ${r.reviewer==='A'?'selected':''}>管理者 A</option><option value="B" ${r.reviewer==='B'?'selected':''}>管理者 B</option></select></label>${r.status==='pending'?`<p class="field-help">人工覆核預覽：請實際查看作品與音檔。</p><label class="checkbox"><input type="checkbox" data-check="notes"><span>筆記有出處，能呈現閱讀理解。</span></label><label class="checkbox"><input type="checkbox" data-check="reflection"><span>反思有自己的觀點與理由。</span></label><label class="checkbox"><input type="checkbox" data-check="audio"><span>已聆聽口述，內容與作品相符。</span></label><label for="feedback-${r.id}">具體回饋（必填）</label><textarea id="feedback-${r.id}" data-feedback rows="4" maxlength="4000" placeholder="請指出理解到位的地方，或需要補充的內容。"></textarea><div class="actions"><button class="btn primary" type="button" data-action="approve">覆核通過（預覽）</button><button class="btn secondary" type="button" data-action="revision">退回補充</button></div>`:`<h3>審核結果</h3><div class="feedback">${esc(r.feedback)}</div>${r.passOrder?`<p class="rank-label">通過序號 ${r.passOrder}</p><p class="field-help">${r.award==='reserved'?'已保留一份名額':'名額已滿，列為候補'}</p>`:''}${r.status==='claimed'?'<p class="tag good">領取資料已填妥（不代表已寄送）</p>':''}`}<div class="record-error error-box" role="alert" hidden></div></div><details><summary class="field-help">處理紀錄</summary><ol class="history">${r.history.map(h=>`<li>${fmt(h.at)} · ${esc(h.text)}</li>`).join('')}</ol></details></div></div></article>`;}).join('');
 }
 $('#admin-records').addEventListener('change',async e=>{const id=e.target.dataset.assignee;if(!id)return;try{await mutate(s=>{const r=s.records.find(r=>r.id===id);if(!r)throw new Error('找不到作品');r.reviewer=e.target.value;r.history.push({at:now(),text:'改由管理者 '+r.reviewer+' 負責'});});toast('分派已保存。');}catch(e){toast(e.message);}});
 $('#admin-records').addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const box=b.closest('[data-record]'),err=$('.record-error',box);err.hidden=true;const checks=Object.fromEntries($$('[data-check]',box).map(c=>[c.dataset.check,c.checked]));const feedback=$('[data-feedback]',box).value;b.disabled=true;try{await mutate(s=>D.review(s,box.dataset.record,b.dataset.action,feedback,checks,now()));notifySettings();await renderAdmin();toast(b.dataset.action==='approve'?'已確認通過並計算名額（預覽）。':'已退回補充。');}catch(e){err.hidden=false;err.textContent=e.message;b.disabled=false;}});
 $('#review-filter').addEventListener('change',renderAdmin);$('#reviewer-filter').addEventListener('change',renderAdmin);await renderAdmin();
}
})().catch(e=>{console.error('Preview initialization failed:',e?.message||e);const toast=document.querySelector('#toast');if(toast){toast.textContent='頁面無法載入已儲存資料，請重新整理或確認瀏覽器儲存權限。';toast.classList.add('show');}});
