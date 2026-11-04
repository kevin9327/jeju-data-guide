// 성능 측정: 시작(표 333개 읽기·색인) 시간, 질문당 시간, 메모리. node --expose-gc test/bench.mjs
import fs from 'node:fs';
import { Guide } from '../js/pipeline.js';
const D = new URL('../data/', import.meta.url);
const cat = JSON.parse(fs.readFileSync(new URL('catalog.json', D), 'utf8'));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', D), 'utf8'));
const t0 = performance.now();
const g = new Guide(cat, man, (id) => fs.readFileSync(new URL(`raw/${id}.csv`, D), 'utf8'));
const t1 = performance.now();
const gold = JSON.parse(fs.readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const times = [];
for (const G of gold) { const a = performance.now(); g.ask(G.q); times.push(performance.now() - a); }
times.sort((a, b) => a - b);
if (global.gc) global.gc();
const m = process.memoryUsage();
console.log(JSON.stringify({ 시작_ms: Math.round(t1 - t0), 질문수: times.length, 질문당_중앙값_ms: +times[Math.floor(times.length / 2)].toFixed(1), 질문당_최대_ms: +times.at(-1).toFixed(1), 힙_MB: Math.round(m.heapUsed / 1048576), RSS_MB: Math.round(m.rss / 1048576) }));
