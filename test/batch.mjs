// 질문 여러 개를 한 번에: node test/batch.mjs 질문1 질문2 ...   (오늘 날짜는 2026-10-29 고정)
import fs from 'node:fs';
import { Guide } from '../js/pipeline.js';
const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const hints = JSON.parse(fs.readFileSync(new URL('hints.json', D), 'utf8'));
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'), hints, { today: new Date('2026-10-29') });
const qs = process.argv.length > 2 ? process.argv.slice(2) : fs.readFileSync(new URL('./qs.txt', import.meta.url), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
for (const q of qs) {
  const r = g.ask(q);
  const lvl = r.gate ? ` [${r.gate.level}${r.verify ? (r.verify.ok ? '·검증✓' : '·검증✗') : ''}]` : '';
  console.log(`${r.status}${lvl} | ${q}\n    → ${(r.answer || r.reason || '').slice(0, 170)}${r.chosen ? `\n    · 데이터 ${r.chosen.id} ${r.chosen.title.slice(0, 26)}` : ''}${r.gate ? '\n    · ' + r.gate.items.filter((x) => x.level !== 'ok').map((x) => x.text.slice(0, 80)).join(' / ') : ''}`);
}
