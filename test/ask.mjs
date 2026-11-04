// 질문 하나를 끝까지 돌려 본다: node test/ask.mjs "질문"
import fs from 'node:fs';
import { Guide } from '../js/pipeline.js';
const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'));
for (const q of process.argv.slice(2)) {
  const r = g.ask(q);
  console.log('Q:', q); console.log('  상태:', r.status, r.chosen ? `· 데이터 ${r.chosen.id} ${r.chosen.title.slice(0, 30)} (적합 ${r.chosen.conf.toFixed(1)})` : '');
  console.log('  답:', r.answer || r.reason);
  if (r.gate) console.log('  신호등:', r.gate.level, r.gate.items.map((x) => x.text).join(' / '));
  if (r.verify) console.log('  재계산:', r.verify.ok ? `일치(${r.verify.count}개 값)` : '불일치 ' + r.verify.issues.join('; '));
  if (r.plan) console.log('  계획:', JSON.stringify({ 열: r.plan.measures.map((i) => r.plan.table.header[i]), 조건: r.plan.filters.map((f) => `${f.name}=${f.value}`), 시간: r.plan.time, 연산: r.plan.agg }));
}
