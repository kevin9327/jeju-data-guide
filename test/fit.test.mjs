// 답 적합성(fit_check) 시험: 독립 평가자 3명이 11/3 에 찾아낸 ‘계산은 맞는데 질문과 다른 답’ 사례의 회귀 시험.
// 사용: node test/fit.test.mjs      (오늘 날짜는 2026-10-29 로 고정)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Guide } from '../js/pipeline.js';

const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const hints = JSON.parse(fs.readFileSync(new URL('hints.json', D), 'utf8'));
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'), hints, { today: new Date('2026-10-29') });

const REFUSE = [   // 숫자 답을 주면 안 된다(엉뚱한 열·축·비교 대상)
  '평균기온이 가장 높은 해는?', '제주가 서울보다 출생아가 많아?', '제일 시끄러운 동네는 어디야?', '사람이 제일 많이 온 해는?', '가장 비싼 농산물은 뭐야?',
];
const ANSWER = [   // 거절하면 안 된다: [질문, 답에 들어가야 할 말]
  ['소비자물가지수는 어떻게 변했어?', '추이'], ['가장 최근 실업률은?', '1.9'], ['의료기관 수는 어떻게 변했어?', '추이'],
];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, extra); } };
for (const q of REFUSE) { const r = g.ask(q); ok(`거절: ${q}`, r.status === 'refuse' && !/\d{2,}/.test(String(r.reason || '').replace(/\d+개/g, '')), `status=${r.status} ${r.answer || r.reason}`); }
for (const [q, must] of ANSWER) { const r = g.ask(q); ok(`답함: ${q}`, r.status === 'answered' && String(r.answer).includes(must), `status=${r.status} ${r.answer || r.reason}`); }
console.log(`\n적합성 시험 ${pass}/${pass + fail} 통과`);
assert.equal(fail, 0);
