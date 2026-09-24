/* Local preview domain rules. Production must enforce these in server transactions. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ReadingDomain=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const empty=()=>({version:3,capacity:100,passSequence:0,drafts:{},records:[]});
const clean=v=>String(v||'').trim();
function validStep(d,step){
 if(step===1)return clean(d.bookTitle)&&clean(d.bookAuthor)&&d.readConfirm?'':'請填寫書名、作者，並確認已閱讀。';
 if(step===2)return d.notes&&d.notes.length&&d.notes.every(n=>clean(n.source)&&clean(n.text))?'':'請完成每則筆記的章節和重點內容。';
 if(step===3)return clean(d.reflection)&&clean(d.connection)?'':'請寫下想法與理由，以及和生活的連結。';
 if(step===4)return d.audio&&d.audio.blob&&d.audio.blob.size>0&&d.authenticConfirm?'':'請先錄音或選擇有效音檔，試聽後勾選確認。';
 return '';
}
function submit(s,d,reader,now,id){
 for(let step=1;step<=4;step++){const error=validStep(d,step);if(error)throw new Error(error);}
 let r=s.records.find(r=>r.readerId===reader.id);
 if(r&&!['revision'].includes(r.status))throw new Error('此作品已送出，請在下方查看進度。');
 if(r){r.data=d;r.status='pending';r.submittedAt=now;r.revision+=1;r.history.push({at:now,text:'補充內容後再次送出'});}
 else{const count=a=>s.records.filter(r=>r.reviewer===a&&r.status==='pending').length; r={id,readerId:reader.id,readerName:reader.name,data:d,status:'pending',reviewer:count('A')<=count('B')?'A':'B',submittedAt:now,revision:1,history:[{at:now,text:'作品已送出（本機预览）'}],storage:{site:'not_connected',drive:'not_connected'},assessment:{status:'not_connected',provider:'Gem 規則待串接'}};s.records.push(r);}
 return r;
}
function review(s,id,action,feedback,checks,now){
 const r=s.records.find(r=>r.id===id);if(!r||r.status!=='pending')throw new Error('這份作品狀態已變更，請重新整理後查看。');
 if(!clean(feedback))throw new Error('請留下具體回饋，再確認結果。');
 if(action==='approve'){
  if(!checks||!checks.notes||!checks.reflection||!checks.audio)throw new Error('請先確認筆記、反思及口述三項內容。');
  if(!r.passOrder){r.passOrder=++s.passSequence;r.approvedAt=now;}
  r.status='approved';r.award=r.passOrder<=s.capacity?'reserved':'waitlist';
  r.history.push({at:now,text:'人工覆核通過（預覽），通過序號 '+r.passOrder});
 }else if(action==='revision'){r.status='revision';r.history.push({at:now,text:'請依回饋補充內容'});}
 else throw new Error('不支援的審核動作');
 r.feedback=clean(feedback);r.reviewMode='manual_preview';return r;
}
function changeCapacity(s,capacity){
 const n=Number(capacity);if(!Number.isInteger(n)||n<1||n>100000)throw new Error('名額請填 1 至 100000 的整數。');
 const reserved=s.records.filter(r=>r.award==='reserved');const protectedRank=Math.max(0,...reserved.map(r=>r.passOrder));
 if(n<protectedRank)throw new Error('不可減少已保留的名額；請保留既有領取資格。');
 s.capacity=n;s.records.forEach(r=>{if(r.status==='approved'&&r.passOrder<=n)r.award='reserved';});
}
function claim(s,id,values,now){
 const r=s.records.find(r=>r.id===id);if(!r||r.status!=='approved'||r.award!=='reserved')throw new Error('尚未取得領取資格，或已填寫領取資料。');
 if(!clean(values.recipient)||!clean(values.address)||!/^[-+() 0-9]{8,20}$/.test(values.phone)||(String(values.phone).match(/\d/g)||[]).length<8||!values.consent)throw new Error('請完成姓名、電話、地址與預覽確認。');
 r.claim={recipient:clean(values.recipient),phone:clean(values.phone),address:clean(values.address),at:now};r.status='claimed';r.history.push({at:now,text:'已儲存領取資料（預覽，尚未寄送）'});return r;
}
function remainingBooks(s){return Math.max(0,s.capacity-s.records.filter(r=>r.award==='reserved').length);}
return {empty,validStep,submit,review,changeCapacity,claim,remainingBooks};
});
