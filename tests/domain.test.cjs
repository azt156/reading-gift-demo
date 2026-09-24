'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../domain.js');

const T0 = '2026-09-24T00:00:00.000Z';
const T1 = '2026-09-24T00:01:00.000Z';
const T2 = '2026-09-24T00:02:00.000Z';
const checks = {notes: true, reflection: true, audio: true};
const claimValues = () => ({recipient: '測試收件者', phone: '0912345678', address: '測試地址，不寄送', consent: true});
const draft = () => ({
  bookTitle: '測試書', bookAuthor: '測試作者', readConfirm: true,
  notes: [{source: '第一章，第 12 頁', text: '我用自己的話整理章節重點。'}],
  reflection: '我同意書中的觀點，因為有具體證據。',
  connection: '這讓我想到自己的生活經驗。',
  audio: {blob: new Blob(['test audio'], {type: 'audio/wav'}), name: '測試.wav', duration: 1},
  authenticConfirm: true
});
function submit(s, n, at = T0) {
  return D.submit(s, draft(), {id: `reader-${n}`, name: `讀者 ${n}`}, at, `record-${n}`);
}
function approve(s, r, at = T1) { return D.review(s, r.id, 'approve', '內容具體，口述與書寫相符。', checks, at); }
function approved(s, n) { return approve(s, submit(s, n)); }
function assertUnchangedOnError(s, f) {
  const before = structuredClone(s);
  assert.throws(f);
  assert.deepEqual(s, before);
}

test('完整四步可送件，外部服務仍標為未串接且不提前發名額', () => {
  const s = D.empty(), d = draft();
  for (const n of [1, 2, 3, 4]) assert.equal(D.validStep(d, n), '');
  const r = D.submit(s, d, {id: 'a', name: '甲'}, T0, 'r-a');
  assert.equal(r.status, 'pending');
  assert.deepEqual(r.storage, {site: 'not_connected', drive: 'not_connected'});
  assert.equal(r.assessment.status, 'not_connected');
  assert.equal(r.passOrder, undefined);
  assert.equal(r.award, undefined);
  assert.equal(s.passSequence, 0);
});

const missingInputs = [
  ['書名空白', 1, d => {d.bookTitle = '  ';}],
  ['作者空白', 1, d => {d.bookAuthor = ''; }],
  ['未確認閱讀', 1, d => {d.readConfirm = false;}],
  ['沒有筆記', 2, d => {d.notes = [];}],
  ['筆記缺出處', 2, d => {d.notes[0].source = ' ';}],
  ['筆記缺內容', 2, d => {d.notes[0].text = ''; }],
  ['第二則筆記未完成', 2, d => {d.notes.push({source: '二', text: ''});}],
  ['沒有反思', 3, d => {d.reflection = ''; }],
  ['沒有生活連結', 3, d => {d.connection = ' ';}],
  ['沒有音檔', 4, d => {d.audio = null;}],
  ['音檔為空', 4, d => {d.audio.blob = new Blob([]);}],
  ['未確認口述', 4, d => {d.authenticConfirm = false;}]
];
for (const [label, step, invalidate] of missingInputs) {
  test(`四步必填：${label}時不可送件`, () => {
    const s = D.empty(), d = draft(); invalidate(d);
    assert.notEqual(D.validStep(d, step), '');
    assertUnchangedOnError(s, () => D.submit(s, d, {id: 'a', name: '甲'}, T0, 'r-a'));
  });
}

test('同一讀者重複送件不建立第二筆作品', () => {
  const s = D.empty(); submit(s, 1);
  assertUnchangedOnError(s, () => D.submit(s, draft(), {id: 'reader-1', name: '改暱稱'}, T1, 'other-id'));
  assert.equal(s.records.length, 1);
});

test('退回補件再送沿用原作品、累加版本，不提前取得通過序', () => {
  const s = D.empty(), r = submit(s, 1);
  D.review(s, r.id, 'revision', '請補上書中的具體例子。', {}, T1);
  const updated = draft(); updated.reflection = '新增了第 3 章的例子與理由。';
  const next = D.submit(s, updated, {id: 'reader-1', name: '讀者 1'}, T2, 'ignored-new-id');
  assert.equal(next.id, r.id);
  assert.equal(next.revision, 2);
  assert.equal(next.status, 'pending');
  assert.equal(next.data.reflection, updated.reflection);
  assert.equal(next.submittedAt, T2);
  assert.equal(s.records.length, 1);
  assert.equal(s.passSequence, 0);
  assert.equal(next.history.length, 3);
  approve(s, next, '2026-09-24T00:03:00.000Z');
  assert.equal(next.passOrder, 1);
});

test('補件仍有必填遺漏時維持原稿與補件狀態', () => {
  const s = D.empty(), r = submit(s, 1);
  D.review(s, r.id, 'revision', '請補充。', {}, T1);
  const invalid = draft(); invalid.notes = [];
  assertUnchangedOnError(s, () => D.submit(s, invalid, {id: 'reader-1', name: '甲'}, T2, 'new'));
});

test('覆核需要具體回饋及全部三項確認', () => {
  for (const missing of ['notes', 'reflection', 'audio']) {
    const s = D.empty(), r = submit(s, missing);
    assertUnchangedOnError(s, () => D.review(s, r.id, 'approve', '已讀', {...checks, [missing]: false}, T1));
  }
  const s = D.empty(), r = submit(s, 1);
  assertUnchangedOnError(s, () => D.review(s, r.id, 'approve', '  ', checks, T1));
});

test('未知作品或未知審核動作不改變狀態', () => {
  const s = D.empty(), r = submit(s, 1);
  assertUnchangedOnError(s, () => D.review(s, 'missing', 'approve', '已读', checks, T1));
  assertUnchangedOnError(s, () => D.review(s, r.id, 'unknown', '已读', checks, T1));
});

test('100 份名額：第 100 位保留，第 101 位候補', () => {
  const s = D.empty();
  for (let n = 1; n <= 101; n++) approved(s, n);
  assert.equal(s.records.filter(r => r.award === 'reserved').length, 100);
  assert.equal(s.records.filter(r => r.award === 'waitlist').length, 1);
  assert.equal(s.records[99].passOrder, 100);
  assert.equal(s.records[99].award, 'reserved');
  assert.equal(s.records[100].passOrder, 101);
  assert.equal(s.records[100].award, 'waitlist');
});

test('排序依通過先後，同秒也有唯一順序，與送件順序無關', () => {
  const s = D.empty(), firstSubmitted = submit(s, 1, T0), secondSubmitted = submit(s, 2, T1);
  approve(s, secondSubmitted, T2); approve(s, firstSubmitted, T2);
  assert.equal(secondSubmitted.passOrder, 1);
  assert.equal(firstSubmitted.passOrder, 2);
  assert.equal(firstSubmitted.approvedAt, T2);
  assert.equal(secondSubmitted.approvedAt, T2);
});

test('重複核准不能再加通過序、改首次通過時間或增名額', () => {
  const s = D.empty(), r = approved(s, 1);
  assertUnchangedOnError(s, () => approve(s, r, T2));
  assert.equal(s.passSequence, 1);
  assert.equal(r.approvedAt, T1);
});

test('同人已通過或已領取後都不能另投取得第二份', () => {
  for (const claimed of [false, true]) {
    const s = D.empty(), r = approved(s, 1);
    if (claimed) D.claim(s, r.id, claimValues(), T2);
    assertUnchangedOnError(s, () => submit(s, 1, T2));
    assert.equal(s.records.filter(x => x.readerId === 'reader-1').length, 1);
  }
});

test('增加名額按原通過序升補候補，保留原通過時間', () => {
  const s = D.empty(); D.changeCapacity(s, 1);
  const a = approved(s, 1), b = approved(s, 2), c = approved(s, 3);
  D.changeCapacity(s, 2);
  assert.equal(a.award, 'reserved');
  assert.equal(b.award, 'reserved');
  assert.equal(c.award, 'waitlist');
  assert.equal(b.passOrder, 2);
  assert.equal(b.approvedAt, T1);
  const after = structuredClone(s);
  D.changeCapacity(s, 2);
  assert.deepEqual(s, after);
});

test('縮減名額不得回收已保留或已填領取資料的資格', () => {
  for (const claimed of [false, true]) {
    const s = D.empty(); approved(s, 1); const second = approved(s, 2);
    if (claimed) D.claim(s, second.id, claimValues(), T2);
    assertUnchangedOnError(s, () => D.changeCapacity(s, 1));
    assert.equal(second.award, 'reserved');
  }
});

test('只縮減未使用名額是允許的', () => {
  const s = D.empty(); approved(s, 1); approved(s, 2);
  D.changeCapacity(s, 2);
  assert.equal(s.capacity, 2);
  assert.equal(approved(s, 3).award, 'waitlist');
});

test('非法名額不寫入 state', () => {
  for (const capacity of [0, -1, 1.5, 100001, NaN, Infinity, '', 'x']) {
    const s = D.empty();
    assertUnchangedOnError(s, () => D.changeCapacity(s, capacity));
  }
});

test('不存在、未通過、補件中、候補者皆不可填領取資料', () => {
  const s = D.empty(); D.changeCapacity(s, 1);
  const pending = submit(s, 1), revision = submit(s, 2);
  D.review(s, revision.id, 'revision', '請補充', {}, T1);
  approved(s, 3); const waitlist = approved(s, 4);
  for (const id of ['missing', pending.id, revision.id, waitlist.id]) {
    assertUnchangedOnError(s, () => D.claim(s, id, claimValues(), T2));
  }
});

test('領取必填欄位與同意確認缺失不得消耗資格', () => {
  for (const [key, value] of [['recipient', ' '], ['address', ''], ['phone', 'abc'], ['consent', false]]) {
    const s = D.empty(), r = approved(s, 1);
    assertUnchangedOnError(s, () => D.claim(s, r.id, {...claimValues(), [key]: value}, T2));
  }
});

test('電話不能全部為空白或符號，至少需要可聯絡的數字', () => {
  for (const phone of ['        ', '--------', '()()()()', '++++++++']) {
    const s = D.empty(), r = approved(s, 1);
    assertUnchangedOnError(s, () => D.claim(s, r.id, {...claimValues(), phone}, T2));
  }
});

test('成功領取保留排名與名額，重複 claim 不覆寫原資料', () => {
  const s = D.empty(), r = approved(s, 1);
  D.claim(s, r.id, {...claimValues(), recipient: '  測試甲  '}, T2);
  assert.equal(r.status, 'claimed');
  assert.equal(r.claim.recipient, '測試甲');
  assert.equal(r.claim.at, T2);
  assert.equal(r.passOrder, 1);
  assert.equal(r.award, 'reserved');
  assertUnchangedOnError(s, () => D.claim(s, r.id, {...claimValues(), recipient: '測試乙'}, T2));
});


test('贈書剩餘數僅在通過取得名額後減少，填寫領取資料不再扣一次', () => {
  const s=D.empty(), r=submit(s,1);
  assert.equal(D.remainingBooks(s),100);
  approve(s,r,'2026-09-29T00:00:00.000Z');
  assert.equal(D.remainingBooks(s),99);
  D.claim(s,r.id,claimValues(),'2026-09-30T00:00:00.000Z');
  assert.equal(D.remainingBooks(s),99);
});
test('贈書用罄後保持零本，候補不扣負數，增加庫存依序遞補', () => {
  const s=D.empty();D.changeCapacity(s,1);
  approved(s,1);approved(s,2);
  assert.equal(D.remainingBooks(s),0);
  D.changeCapacity(s,3);
  assert.equal(s.records[1].award,'reserved');
  assert.equal(D.remainingBooks(s),1);
});
test('補件中的作品不扣除贈書數量', () => {
  const s=D.empty(),r=submit(s,1);
  D.review(s,r.id,'revision','請補充',{},T1);
  assert.equal(D.remainingBooks(s),100);
});
