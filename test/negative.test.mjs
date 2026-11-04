// 부정 시험: 답하면 안 되는 질문(자료에 없음·미래·원인·개수·모호함)에 에이전트가 숫자를 내놓지 않는지, 그리고 답하는 질문 중 ‘조건을 몰래 정한’ 경우에 노랑 불이 켜지는지 확인한다.
// 정직한 주석: 이 목록의 앞쪽 질문은 독립 평가자가 찾아낸 실패와 우리가 직접 찾은 실패를 고친 뒤의 ‘회귀 시험’이다. 새 질문에 대한 정직한 통과율은 heldout2(첫 실행 14/21 → test/heldout2_first_run.txt)를 보라.
// 사용: node test/negative.test.mjs      (오늘 날짜는 2026-10-29 로 고정)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Guide } from '../js/pipeline.js';

const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const hints = JSON.parse(fs.readFileSync(new URL('hints.json', D), 'utf8'));
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'), hints, { today: new Date('2026-10-29') });

const REFUSE = [   // 답(숫자)을 주면 안 된다 — status 가 refuse 여야 한다
  '한라산 탐방객이 가장 많은 달은', '전기차 충전소는 몇 개야', '서귀포 관광객 수는 몇 명이야', '우도 관광객은 코로나 전후로 얼마나 달라졌나', '제주 렌터카 대수',
  '제주도 맛집 추천해줘', '내년 우도 입장객 예측해줘', '감귤 생산이 줄어든 이유가 뭐야', '내일 제주 날씨는', '제주도 지하철 노선은', '서울 지하철 승차 인원',
  '우도 입장객과 날씨의 상관관계', '바다거북 개체수', '한라산 입산 통제 기간', '제주공항 항공편 지연 몇 건', '월드컵 우승국은', '삼다수 생산량은',
  '우도 입장객 대비 서귀포 관람객 비중', '제주 인구는 몇 명이야', '제주 관광객은 몇 명이야', '제주 쓰레기 배출량이 가장 많은 해는', '제주도 전기차 대수',
  '제주 택시 요금', '제주도 교통사고 건수', '제주 유기견 몇 마리', '제주 와이파이 위치', '제주 오름 높이 순위', '제주 날씨가 가장 더운 달', '제주 기온 평균', '화성 탐사선 궤도 알려줘',
  '2020년 제주 자살률은 얼마야?', '2021년 제주 의료기관 종사자수는?', '비가 제일 많이 온 달', '소비자물가가 제일 많이 오른 해는', '지난달 우도 입장객',   // 자료에 0 으로 적혀 있지만 비고가 ‘미조사’ → 값 없음
];
const GATE = ['올해 우도 입장객은', '작년 천지연폭포 관람객', '올해 감귤 생산은', '우도 입장객이 2030년에 몇 명이었어'];   // status refuse-gate (자료 기간 밖)
const CAUTION = [   // 답은 하지만 조건을 몰래 정했음을 답 안에 밝혀야 한다: [질문, 답에 들어가야 할 말]
  ['서귀포 폭포 관람객 합계', '기간을 말씀하지 않아'],
  ['제주 물가 상승률은', '16.21%'],
  ['제주 개 몇 마리', '제주시만의 자료'], ['2024년 천지연폭포 관람객', '7개월'], ['실업자 2021년', '12,000'], ['2019년과 2023년 천지연폭포 관람객 중 언제 더 많아', '가장 큰 쪽은 2019년'], ['제주 자살률 추이', '미조사'],
];
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('  ok  ', name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); } };
for (const q of REFUSE) t(`거절 · ${q}`, () => { const r = g.ask(q); assert.equal(r.status, 'refuse', `상태 ${r.status}: ${(r.answer || '').slice(0, 80)}`); assert.ok(!r.answer, '거절인데 숫자 답이 있음'); assert.ok((r.reason || '').length > 10, '이유 설명이 있어야 함'); });
for (const q of GATE) t(`자료 기간 밖 · ${q}`, () => { const r = g.ask(q); assert.equal(r.status, 'refuse-gate', `상태 ${r.status}: ${(r.answer || r.reason || '').slice(0, 80)}`); });
for (const [q, must] of CAUTION) t(`밝힘 · ${q}`, () => { const r = g.ask(q); assert.equal(r.status, 'answered'); assert.ok(r.answer.includes(must) || r.gate.items.some((x) => x.text.includes(must)), `‘${must}’ 가 답·신호등에 없음: ${r.answer}`); assert.ok(r.verify && r.verify.ok); });

// 퍼지: 데이터 333종을 제목 기반 질문으로 한 번씩 돌려 본다 — 예외가 나면 안 되고, 답이 나온 것은 계산 검증이 일치해야 한다.
const stat = {}; let thrown = 0, badVerify = 0;
for (const m of man.filter((x) => x.rows != null)) {
  const title = (cat.find((c) => c.id === m.id) || {}).title || '';
  for (const q of [`${title} 합계`, `${title} 가장 많은 해`]) {
    try { const r = g.ask(q); stat[r.status] = (stat[r.status] || 0) + 1; if (r.status === 'answered' && r.verify && !r.verify.ok) badVerify++; } catch (e) { thrown++; console.log('   예외:', q, e.message); }
  }
}
t(`퍼지 666건: 예외 0, 계산 검증 불일치 0 (결과 ${JSON.stringify(stat)})`, () => { assert.equal(thrown, 0); assert.equal(badVerify, 0); });
console.log(`\n부정 시험 ${ok}/${ok + fail} 통과${fail ? `, ${fail} 실패` : ''}`);
