// 작은 단위 시험: 올린 파일 글자 해석(UTF-8/CP949), 중복 열 이름, 핵심어 뽑기, 상대 연도
import assert from 'node:assert/strict';
import { decodeText, Table, dedupeNames } from '../js/table.js';
import { keyTerms, coverage, precheck } from '../js/understand.js';
import { parseTime } from '../js/agent.js';
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('  ok  ', name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); } };
t('UTF-8 파일은 그대로', () => assert.equal(decodeText(new TextEncoder().encode('지역,값\n제주,1')), '지역,값\n제주,1'));
t('CP949(엑셀 한글 CSV)도 읽는다', () => { const b = new Uint8Array([0xC1, 0xF6, 0xBF, 0xAA, 0x2C, 0xB0, 0xAA, 0x0A, 0xC1, 0xA6, 0xC1, 0xD6, 0x2C, 0x31]); assert.equal(decodeText(b), '지역,값\n제주,1'); });
t('같은 열 이름은 (2) 로 구별', () => assert.deepEqual(dedupeNames(['a', 'b', 'a', 'a']), ['a', 'b', 'a(2)', 'a(3)']));
t('표가 중복 열 이름을 구별한다', () => assert.deepEqual(Table.fromCSV('x,x,y\n1,2,3').header, ['x', 'x(2)', 'y']));
t('핵심어: 틀 말은 빼고 대상만', () => { assert.deepEqual(keyTerms('한라산 탐방객이 가장 많은 달은'), ['한라산', '탐방객']); assert.deepEqual(keyTerms('전기차 충전소는 몇 개야'), ['전기차', '충전소']); assert.deepEqual(keyTerms('올해 감귤 생산은'), ['감귤', '생산']); });
t('핵심어: 삼다수 같은 세 글자 명사는 살린다', () => assert.ok(keyTerms('삼다수 생산량은').includes('삼다수')));
t('상대 연도는 오늘 기준', () => { const T = parseTime('올해 매출', { y: 2022, m: 12 }, new Date('2026-10-29')); assert.deepEqual(T.years, [2026]); assert.deepEqual(parseTime('작년 매출', null, new Date('2026-10-29')).years, [2025]); });
t('앞질러 거절: 원인·예측·개수·코로나 전후·추천', () => { for (const q of ['왜 줄었어', '내년 예측', '충전소 몇 개', '코로나 전후 비교', '맛집 추천']) assert.ok(precheck(q), q); });
t('앞질러 거절하지 않음: 몇 개월·고령인구비율이·비중이 가장 큰', () => { for (const q of ['최근 몇 개월 합계', '고령인구비율이 늘었어', '비중이 가장 큰 곳']) assert.equal(precheck(q), null, q); });
t('coverage: 표 제목·열·짧은 값에 있으면 찾음, 리뷰 같은 긴 글은 제외', () => { const tb = Table.fromCSV('지점,내용,건수\n성산,날씨가 아주 좋았고 바다가 맑아서 매우 만족스러운 하루였습니다 정말,3\n고산,보통,2', { title: '해변 방문' }); const c = coverage(['성산', '날씨', '방문'], tb, '해변 방문'); assert.deepEqual(c.covered.sort(), ['방문', '성산']); assert.deepEqual(c.missing, ['날씨']); });
console.log(`\n단위 시험 ${ok}/${ok + fail} 통과`);
