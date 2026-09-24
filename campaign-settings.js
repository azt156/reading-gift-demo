/* Text-only campaign copy. Render values using textContent or HTML escaping. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CampaignSettings=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const limits={title:60,slogan:120,intro:500,gift:80,stepTitle:40,stepDescription:300,important:300};
  const labels={title:'活動名稱',slogan:'活動標語',intro:'活動介紹',gift:'獎勵說明'};
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

  function defaults(){
    return {
      title:'閱讀有禮',
      slogan:'讀一本好書，說一段自己的想法。',
      intro:'讀懂・寫下・說出來。完成閱讀挑戰，讓好書接力陪伴你。',
      startDate:'',endDate:'',gift:'好書一本',
      rules:{
        reviewDays:5,
        giftSponsor:'台灣閱讀文化基金會',
        reviewChecks:'筆記是否足量、想法是否出自本人、說書能否聽出確實讀過本書。',
        fairness:'筆記、反思與說書內容須出自本人閱讀；如有抄襲、由 AI 代寫，或錄音並非本人所讀所講等情事，經查證屬實，取消本期參加資格。'
      },
      steps:[
        {title:'讀一本書',description:'選一本想讀的好書，讀完後留下書名與作者。'},
        {title:'留下筆記',description:'依章節整理重點，標示出處，再用自己的話寫下理解。'},
        {title:'寫出想法',description:'從筆記挑出有感的觀點，寫下理由，連結自己的生活經驗。'},
        {title:'用自己的話說',description:'用五分鐘內分享：書在說什麼？哪裡最有感？和生活有什麼關係？'}
      ],
      important:[
        '免費參加，比讀得精，不比讀得多，也不需要每天打卡。',
        '依通過時間排序，名額內可領取好書，超額則依序候補。',
        '符合領取資格後，才需要填寫收件資料。'
      ]
    };
  }

  function text(value,label,max,allowEmpty=false){
    if(typeof value!=='string')throw new Error(label+'請填寫文字。');
    const result=value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim();
    if(!result&&!allowEmpty)throw new Error(label+'不可空白。');
    if(Array.from(result).length>max)throw new Error(label+'最多 '+max+' 個字。');
    return result;
  }

  function date(value,label){
    if(typeof value!=='string')throw new Error(label+'請使用 YYYY-MM-DD 格式。');
    const result=value.trim();
    if(!result)return '';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(result))throw new Error(label+'請使用 YYYY-MM-DD 格式。');
    const [year,month,day]=result.split('-').map(Number);
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(year<1||month<1||month>12||day<1||day>days[month-1])throw new Error(label+'不是有效日期。');
    return result;
  }

  function dates(start,end){
    const startDate=date(start,'開始日期'),endDate=date(end,'結束日期');
    if(Boolean(startDate)!==Boolean(endDate))throw new Error('開始日期與結束日期請一起填寫，或一起留空。');
    if(startDate&&startDate>endDate)throw new Error('結束日期不可早於開始日期。');
    return {startDate,endDate};
  }

  function important(values){
    if(!Array.isArray(values)||values.length<1||values.length>6)throw new Error('重要事項請填寫 1 至 6 條。');
    return Array.from(values,(value,index)=>text(value,'第 '+(index+1)+' 條重要事項',limits.important));
  }

  const ruleValidators={
    reviewDays(value){
      if(!Number.isInteger(value)||value<1||value>60)throw new Error('審核天數請填寫 1 至 60 的整數。');
      return value;
    },
    giftSponsor:value=>text(value,'本期贊助單位',100,true),
    reviewChecks:value=>text(value,'審核檢查項目',500),
    fairness:value=>text(value,'公平規則',500)
  };

  function rules(input){
    if(!record(input))throw new Error('挑戰辦法格式不正確。');
    const result={};
    for(const key of Object.keys(ruleValidators))result[key]=ruleValidators[key](own(input,key)?input[key]:undefined);
    return result;
  }

  function validate(input){
    if(!record(input))throw new Error('活動設定格式不正確。');
    const result={};
    for(const key of Object.keys(labels))result[key]=text(own(input,key)?input[key]:undefined,labels[key],limits[key]);
    Object.assign(result,dates(own(input,'startDate')?input.startDate:'',own(input,'endDate')?input.endDate:''));
    if(!Array.isArray(input.steps)||input.steps.length!==4)throw new Error('參加流程必須包含四個步驟。');
    result.steps=Array.from(input.steps,(step,index)=>{
      if(!record(step))throw new Error('第 '+(index+1)+' 步的內容格式不正確。');
      return {
        title:text(own(step,'title')?step.title:undefined,'第 '+(index+1)+' 步標題',limits.stepTitle),
        description:text(own(step,'description')?step.description:undefined,'第 '+(index+1)+' 步說明',limits.stepDescription)
      };
    });
    result.important=important(input.important);
    result.rules=own(input,'rules')?rules(input.rules):defaults().rules;
    return result;
  }

  // Old/incomplete JSON can be loaded safely without losing valid sibling fields.
  function merge(saved){
    const result=defaults();
    if(!record(saved))return result;
    for(const key of Object.keys(labels)){
      if(!own(saved,key))continue;
      try{result[key]=text(saved[key],labels[key],limits[key]);}catch(_){}
    }
    try{Object.assign(result,dates(own(saved,'startDate')?saved.startDate:'',own(saved,'endDate')?saved.endDate:''));}catch(_){}
    if(own(saved,'steps')&&Array.isArray(saved.steps)&&saved.steps.length<=4){
      for(let index=0;index<4;index++){
        const step=saved.steps[index];if(!record(step))continue;
        if(own(step,'title'))try{result.steps[index].title=text(step.title,'步驟標題',limits.stepTitle);}catch(_){}
        if(own(step,'description'))try{result.steps[index].description=text(step.description,'步驟說明',limits.stepDescription);}catch(_){}
      }
    }
    if(own(saved,'important'))try{result.important=important(saved.important);}catch(_){}
    if(own(saved,'rules')&&record(saved.rules)){
      for(const key of Object.keys(ruleValidators)){
        if(own(saved.rules,key))try{result.rules[key]=ruleValidators[key](saved.rules[key]);}catch(_){}
      }
    }
    return result;
  }

  return {defaults,validate,merge};
});
