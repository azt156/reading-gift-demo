/* Store text and local image Blobs only. Render strings with textContent/escaping. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CommunitySettings=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BUILTIN='img/sponsor-mediatek.png';
  const MAX_IMAGE_BYTES=5*1024*1024;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const field=(value,key,fallback)=>own(value,key)?value[key]:fallback;

  function defaults(){
    return {
      founders:{names:'吳孟霖 × 簡子惠',intro:'一位工程師 × 一位自然科老師。',photo:null},
      sponsors:[{id:'mediatek',name:'聯發科技志工社',role:'核心支持夥伴',logo:null,builtin:BUILTIN,visible:true}]
    };
  }

  function text(value,label,max,required){
    if(typeof value!=='string')throw new Error(label+'請填寫文字。');
    const cleaned=value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim();
    if(required&&!cleaned)throw new Error(label+'不可空白。');
    if(Array.from(cleaned).length>max)throw new Error(label+'最多 '+max+' 個字。');
    return cleaned;
  }

  function image(value,label){
    if(value===null)return null;
    let size,type;
    try{
      if(typeof Blob==='undefined')throw new Error('Blob unavailable');
      // Native getters reject look-alike objects, URLs and JSON-serialized Blobs.
      size=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get.call(value);
      type=Object.getOwnPropertyDescriptor(Blob.prototype,'type').get.call(value);
    }catch(_){throw new Error(label+'請選擇 PNG、JPG 或 WebP 圖片檔案。');}
    if(!['image/png','image/jpeg','image/webp'].includes(type))throw new Error(label+'只支援 PNG、JPG 或 WebP 圖片。');
    if(size<=0||size>MAX_IMAGE_BYTES)throw new Error(label+'必須大於 0 且不超過 5 MiB。');
    return value;
  }

  function identifier(value){
    if(typeof value!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(value))throw new Error('贊助單位識別碼限 1 至 80 個英文字母、數字或連字號。');
    return value;
  }

  function builtin(value){
    if(value!==null&&value!==BUILTIN)throw new Error('內建標誌路徑不正確，請上傳圖片檔案。');
    return value;
  }

  function sponsor(value){
    if(!record(value))throw new Error('贊助單位內容格式不正確。');
    const id=identifier(field(value,'id',undefined));
    const name=text(field(value,'name',undefined),'贊助單位名稱',100,true);
    const role=text(field(value,'role',''),'贊助單位說明',100,false);
    const visible=field(value,'visible',true);
    if(typeof visible!=='boolean')throw new Error('贊助單位顯示設定必須為是或否。');
    return {id,name,role,logo:image(field(value,'logo',null),'贊助單位標誌'),builtin:builtin(field(value,'builtin',null)),visible};
  }

  function validate(input){
    if(!record(input)||!own(input,'founders')||!record(input.founders))throw new Error('共同發起人設定格式不正確。');
    const founders=input.founders;
    const result={founders:{
      names:text(field(founders,'names',undefined),'共同發起人姓名',120,true),
      intro:text(field(founders,'intro',''),'共同發起人介紹',600,false),
      photo:image(field(founders,'photo',null),'共同發起人照片')
    },sponsors:[]};
    if(!own(input,'sponsors')||!Array.isArray(input.sponsors)||input.sponsors.length>12)throw new Error('贊助單位請設定 0 至 12 個。');
    const seen=new Set();
    result.sponsors=Array.from(input.sponsors,value=>{
      const cleaned=sponsor(value);
      if(seen.has(cleaned.id))throw new Error('贊助單位識別碼不可重複。');
      seen.add(cleaned.id);return cleaned;
    });
    return result;
  }

  function attempt(fn,fallback){try{return fn();}catch(_){return fallback;}}

  function merge(saved){
    const result=defaults();
    if(!record(saved))return result;
    if(own(saved,'founders')&&record(saved.founders)){
      const f=saved.founders;
      if(own(f,'names'))result.founders.names=attempt(()=>text(f.names,'共同發起人姓名',120,true),result.founders.names);
      if(own(f,'intro'))result.founders.intro=attempt(()=>text(f.intro,'共同發起人介紹',600,false),result.founders.intro);
      if(own(f,'photo'))result.founders.photo=attempt(()=>image(f.photo,'共同發起人照片'),null);
      // Upgrade only the exact previous built-in copy; keep customized text and images.
      if((f.names==='吳孟霖 × 簡子惠'&&f.intro==='一位老師與一位工程師，希望每個孩子的想法，都有機會被看見。')||(f.names==='樂寫公益學習網・吳孟霖 × 自然科老師・簡子惠'&&f.intro==='一位工程師 × 一位自然科老師，\n希望每個孩子的想法，都有機會被看見。')){
        const updated=defaults().founders;result.founders.names=updated.names;result.founders.intro=updated.intro;
      }
    }
    if(own(saved,'sponsors')&&Array.isArray(saved.sponsors)&&saved.sponsors.length<=12){
      const list=[],seen=new Set(),known=result.sponsors[0];
      for(const item of saved.sponsors){
        if(!record(item))continue;
        const id=attempt(()=>identifier(field(item,'id',undefined)),null);
        if(!id||seen.has(id))continue;
        const fallback=id===known.id?known:{name:'',role:'',logo:null,builtin:null,visible:true};
        const name=attempt(()=>text(field(item,'name',fallback.name),'贊助單位名稱',100,true),fallback.name);
        if(!name)continue;
        const role=attempt(()=>text(field(item,'role',fallback.role),'贊助單位說明',100,false),fallback.role);
        const logo=attempt(()=>image(field(item,'logo',null),'贊助單位標誌'),null);
        const path=attempt(()=>builtin(field(item,'builtin',fallback.builtin)),null);
        const visible=own(item,'visible')&&typeof item.visible==='boolean'?item.visible:fallback.visible;
        list.push({id,name,role,logo,builtin:path,visible});seen.add(id);
      }
      // An explicit empty list represents the user's choice; do not re-add partners.
      // An entirely corrupt non-empty list falls back to the known default instead.
      if(list.length||saved.sponsors.length===0)result.sponsors=list;
    }
    return result;
  }

  return {defaults,validate,merge};
});
