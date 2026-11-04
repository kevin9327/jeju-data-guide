// 카탈로그 탐색 시험: 사람이 먼저 적은 '이 질문이면 이 데이터가 상위 5위 안에 있어야 한다' 기대값(카탈로그 제목을 보고 정함).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Catalog, words, expandQuery } from '../js/catalog.js';

const items = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const cat = new Catalog(items);
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('  ok  ', name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); } };

// [질문, 상위 5위 안에 들어야 하는 데이터 id 중 하나 이상, 설명]
const CASES = [
  ['우도 입장객이 얼마나 되나요', [1343], '우도해양도립공원 입장객'],
  ['서귀포 생활폐기물 발생량', [1345], '서귀포 생활폐기물'],
  ['감귤 말고 농산물 품종별 가격 추이', [1361, 1362, 1360], '농산물 품종별 거래'],
  ['제주 고용동향 실업률', [1351], '고용동향'],
  ['유기동물 구조 현황', [1342], '제주시 유기동물구조현황'],
  ['환경 소음이 큰 곳', [1352], '환경소음측정결과'],
  ['관광 검색어 트렌드', [1350], 'VISIT JEJU 검색어트렌드'],
  ['소상공인 경기동향', [1358], '소상공인 경기동향(BSI)'],
  ['수산물 수출입 순위', [1357, 1356], '수산물 수출입'],
  ['전기차 충전 배터리', [1359, 1365], '전기차/이륜차 BMS'],
];
for (const [q, want, label] of CASES) {
  t(`검색 "${q}" → ${label}`, () => {
    const r = cat.search(q, { k: 5 });
    const ids = r.map((x) => x.id);
    assert.ok(want.some((w) => ids.includes(w)), `상위 5: ${r.map((x) => `${x.id}:${x.item.title.slice(0, 18)}`).join(' | ')}`);
    assert.ok(r[0].matched.length >= 1, '일치한 낱말을 돌려준다');
  });
}
t('어절 정리: 조사를 떼고 불용어를 뺀다', () => {
  assert.deepEqual(words('우도에서 입장객이 얼마나 되나요'), ['우도', '입장객']);
});
t('동의어 확장: 관광객 → 입도객·입장객', () => {
  const { terms } = expandQuery('관광객 수');
  assert.ok(terms.has('입도객') && terms.has('입장객'));
});
t('onlyOpen: 로그인이 필요한 데이터는 빠진다', () => {
  const r = cat.search('관광', { k: 20, onlyOpen: true });
  assert.ok(r.length > 0 && r.every((x) => !x.item.auth));
});
t('없는 주제는 점수가 낮거나 비어 있다(거절 근거)', () => {
  const r = cat.search('화성 탐사선 궤도', { k: 3 });
  assert.ok(r.length === 0 || r[0].score < 4, `점수 ${r[0]?.score}`);
});
console.log(`\n${ok} passed${fail ? `, ${fail} failed` : ''}`);
