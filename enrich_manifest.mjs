// manifest.json 에 '자료 안의 실제 기간'(허브 메타데이터의 기간과 다를 수 있음)과 열 이름·종류를 보탠다. 사용: node enrich_manifest.mjs
import fs from 'node:fs';
import { Table, meltMonths } from './js/table.js';
import { describe, timeOfRow } from './js/agent.js';
const man = JSON.parse(fs.readFileSync(new URL('./data/manifest.json', import.meta.url), 'utf8'));
for (const m of man) {
  if (m.rows == null) continue;
  let t = Table.fromCSV(fs.readFileSync(new URL(`./data/raw/${m.id}.csv`, import.meta.url), 'utf8'), { id: m.id, title: m.title });
  const mt = meltMonths(t); if (mt) t = mt;
  const d = describe(t);
  let lo = null, hi = null;
  if (d.ycol >= 0 || d.ymcol >= 0) for (let r = 0; r < t.rows.length; r++) { const p = timeOfRow(t, d, r); if (!p) continue; const v = p.y * 100 + (p.m || 0); if (lo === null || v < lo) lo = v; if (hi === null || v > hi) hi = v; }
  m.period = lo === null ? '' : (lo % 100 || hi % 100 ? `${Math.floor(lo / 100)}-${String(lo % 100 || 1).padStart(2, '0')}~${Math.floor(hi / 100)}-${String(hi % 100 || 12).padStart(2, '0')}` : `${lo / 100}~${hi / 100}`);
  m.cols = t.header.length; m.header = t.header.slice(0, 12).join('|');
}
fs.writeFileSync(new URL('./data/manifest.json', import.meta.url), JSON.stringify(man, null, 1));
console.log('기간 있음', man.filter((m) => m.period).length, '/', man.filter((m) => m.rows != null).length);
