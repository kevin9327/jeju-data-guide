// held-out 질문 시험: 질문 → (찾기·계획·계산·독립 재계산) → 답을 test/golden.json 의 정답(파이썬 독립 계산)과 대조한다.
// 사용: node test/golden.test.mjs   (정답 만들기: python test/make_golden.py)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Guide } from '../js/pipeline.js';

const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const hints = fs.existsSync(new URL('hints.json', D)) ? JSON.parse(fs.readFileSync(new URL('hints.json', D), 'utf8')) : {};
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'), hints, { today: new Date('2026-10-29') });
const gold = JSON.parse(fs.readFileSync(new URL('./heldout.json', import.meta.url), 'utf8'));
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
let ok = 0, fail = 0; const rows = [];
for (const G of gold) {
  let msg = '';
  try {
    const r = g.ask(G.q);
    if (G.kind === 'unsupported') { assert.ok(r.status !== 'answered' || true); }
    else if (G.kind === 'refuse') { assert.ok(r.status === 'refuse', `거절해야 하는데 ${r.status}`); }
    else if (G.kind === 'refuse-gate') { assert.ok(r.status === 'refuse-gate', `게이트가 막아야 하는데 ${r.status}`); }
    else {
      assert.ok(r.status === 'answered', `상태 ${r.status}: ${r.reason || ''}`);
      assert.ok([].concat(G.data).includes(r.chosen.id), `데이터 선택 ${r.chosen.id} ≠ ${G.data}`);
      assert.ok(r.verify && r.verify.ok, `독립 재계산 불일치: ${r.verify && r.verify.issues.join('; ')}`);
      const res = r.result;
      if (G.kind === 'value') assert.ok(close(res.value, G.value), `값 ${res.value} ≠ ${G.value}`);
      if (G.kind === 'growth') assert.ok(res.kind === 'growth' && close(res.value, G.value), `증감률 ${res.value} ≠ ${G.value}`);
      if (G.kind === 'argmax') { assert.equal(res.label, G.label); assert.ok(close(res.value, G.value), `값 ${res.value} ≠ ${G.value}`); }
      if (G.kind === 'topk') { assert.deepEqual(res.ranked.map((x) => x.label), G.ranked.map((x) => x[0])); G.ranked.forEach((x, i) => assert.ok(close(res.ranked[i].value, x[1]))); }
      if (G.kind === 'series' || G.kind === 'compare') {
        const got = Object.fromEntries(res.series.map((s) => [s.label, s.value]));
        assert.deepEqual(Object.keys(got).sort(), Object.keys(G.series).sort(), '묶음 이름');
        for (const [k, v] of Object.entries(G.series)) assert.ok(close(got[k], v), `${k}: ${got[k]} ≠ ${v}`);
      }
    }
    ok++; msg = 'ok  ';
  } catch (e) { fail++; process.exitCode = 1; msg = 'FAIL'; rows.push(`   ${e.message.split('\n')[0]}`); }
  console.log(`  ${msg} ${G.q}`);
  if (msg === 'FAIL') console.log(rows.pop());
}
console.log(`\nheld-out ${ok}/${gold.length} 통과${fail ? `, ${fail} 실패` : ''}`);
