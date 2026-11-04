// 독립 재계산(검증기): agent.js·table.js 를 가져다 쓰지 않고, '원본 CSV 글자'에서 처음부터 다시 읽어 같은 계산을 한다.
// (CSV 나누기·숫자 읽기·시간 읽기·집계 모두 별도 구현 — 한쪽의 읽기 오류가 다른 쪽에서 드러나게 한다.) 입력은 계획을 단순 객체로 풀어 쓴 spec 뿐이다.

const splitLine = (line) => { const out = []; const re = /("(?:[^"]|"")*"|[^,]*)(,|$)/y; let m; re.lastIndex = 0; while (re.lastIndex <= line.length && (m = re.exec(line))) { let f = m[1]; if (f.startsWith('"')) f = f.slice(1, -1).replace(/""/g, '"'); out.push(f); if (m[2] === '') break; } return out; };
const num = (s) => { const t = String(s ?? '').trim().replace(/,/g, ''); return /^[-+]?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null; };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ymOf = (s) => {
  const t = String(s ?? '').trim();
  const a = t.split(/[-./\s]+/).filter(Boolean);
  if (/^\d{8}$/.test(t)) return { y: +t.slice(0, 4), m: +t.slice(4, 6) };
  if (a.length >= 2 && /^\d{4}$/.test(a[0]) && /^\d{1,2}$/.test(a[1])) return { y: +a[0], m: +a[1] };
  if (a.length === 2 && MONTHS.includes(a[0].toLowerCase()) && /^\d{2}$/.test(a[1])) return { y: 2000 + +a[1], m: MONTHS.indexOf(a[0].toLowerCase()) + 1 };
  if (a.length === 1 && /^\d{4}$/.test(a[0])) return { y: +a[0], m: null };
  if (/^\d{6}$/.test(t) && +t.slice(4) >= 1 && +t.slice(4) <= 12) return { y: +t.slice(0, 4), m: +t.slice(4) };
  return null;
};

// 글자 전체를 한 번에 훑는 분해기: 따옴표로 묶인 칸 안의 쉼표·줄바꿈을 그대로 두고, 빈 줄은 버린다
function records(raw) {
  const text = String(raw).replace(/^﻿/, '');
  const re = /("(?:[^"]|"")*"|[^,\r\n]*)(,|\r\n|\n|\r|$)/y;
  const out = []; let cur = []; let m;
  while (re.lastIndex <= text.length && (m = re.exec(text))) {
    let f = m[1]; if (f.startsWith('"')) f = f.slice(1, -1).replace(/""/g, '"');
    cur.push(f);
    if (m[2] !== ',') { if (cur.some((x) => x.trim() !== '')) out.push(cur); cur = []; if (m[2] === '') break; }
  }
  return out.length ? out : [[]];
}

export function recompute(rawCsv, spec) {
  const recs = records(rawCsv);   // 따옴표 안의 줄바꿈까지 처리하는 별도 분해기
  const seenNames = {};   // 같은 이름 열 구별 규칙(table.js 와 같은 약속): 빈 이름은 ‘열N’, 중복은 두 번째부터 ‘이름(2)’
  const head = recs[0].map((h, i) => { const n = h.trim() || '열' + (i + 1); seenNames[n] = (seenNames[n] || 0) + 1; return seenNames[n] === 1 ? n : n + '(' + seenNames[n] + ')'; });
  const idx = (n) => head.findIndex((h) => h === n);
  const body = recs.slice(1);
  const yi = spec.ycolName ? idx(spec.ycolName) : -1, mi = spec.mcolName ? idx(spec.mcolName) : -1, ti = spec.ymcolName ? idx(spec.ymcolName) : -1;
  const monthCols = head.map((h, i) => (/^\d{1,2}월$/.test(h) ? { i, m: parseInt(h, 10) } : null)).filter(Boolean);
  const fil = spec.filters.map((f) => ({ i: idx(f.name), v: f.value }));
  // 비고 열에 ‘미조사’ 류가 적힌 표의 0 은 값으로 세지 않는다(app 의 agent.js 와 같은 약속을 따로 구현)
  const noteIdx = head.map((h, i) => (/(비고|특이사항|참고|주석|메모)/.test(h) ? i : -1)).filter((i) => i >= 0);
  const zeroMissing = noteIdx.some((i) => body.some((cells) => /(미조사|미집계|미확인|미제공|결측|해당\s*없음|조사\s*안)/.test(cells[i] || '')));
  const picks = [];   // {v, y, m, key, dim, row, col}
  body.forEach((cells, r) => {
    for (const f of fil) if ((cells[f.i] ?? '').trim() !== f.v) return;
    let base = null;
    if (ti >= 0) base = ymOf(cells[ti]);
    if (!base && yi >= 0 && num(cells[yi]) !== null) base = { y: num(cells[yi]), m: mi >= 0 ? num(cells[mi]) : null };
    const cols = spec.reshape === 'months' ? monthCols.map((c) => ({ i: c.i, m: c.m, name: '값' })) : spec.measures.map((n) => ({ i: idx(n), m: null, name: n }));
    for (const c of cols) {
      const tm = base ? { y: base.y, m: c.m ?? base.m } : (c.m ? { y: null, m: c.m } : null);
      const T = spec.time;
      if (T.years.length || T.months.length || T.recentN) {
        if (!tm) return;
        if (T.years.length && !T.years.includes(tm.y)) continue;
        if (T.months.length && !T.months.includes(tm.m)) continue;
        if (T.recentN && spec.tmax) {
          const tail = T.recentN.unit === '년' ? (tm.y > spec.tmax.y - T.recentN.n) : ((tm.y * 12 + (tm.m || 1)) > (spec.tmax.y * 12 + (spec.tmax.m || 1) - T.recentN.n));
          if (!tail) continue;
        }
      }
      const v = num(cells[c.i]); if (v === null) continue;
      if (zeroMissing && v === 0) continue;
      picks.push({ v, y: tm ? tm.y : null, m: tm ? tm.m : null, key: c.name, dim: spec.byColName ? (cells[idx(spec.byColName)] ?? '').trim() : null, row: r, col: c.i });
    }
  });
  const total = picks.reduce((s, x) => s + x.v, 0);
  const mode = spec.mode || 'sum';   // 합계 sum · 평균 avg · 최대 max · 최소 min (수준 값은 더하지 않는다)
  const bucket = (fn) => {
    const g = {};
    for (const x of picks) { const k = fn(x); if (k === null || k === undefined) continue; (g[k] = g[k] || []).push(x.v); }
    const o = {};
    for (const k of Object.keys(g)) { const a = g[k]; o[k] = mode === 'max' ? a.reduce((m, v) => (v > m ? v : m), -Infinity) : mode === 'min' ? a.reduce((m, v) => (v < m ? v : m), Infinity) : mode === 'avg' ? a.reduce((s2, v) => s2 + v, 0) / a.length : a.reduce((s2, v) => s2 + v, 0); }
    return o;
  };
  const out = { count: picks.length, total, cells: picks.map((x) => `${x.row}:${x.col}`).sort() };
  const per = (spec.byMonth || (spec.time.years.length === 1 && !spec.byYear && spec.agg === 'trend')) ? bucket((x) => (x.y === null ? null : x.y * 100 + (x.m || 0))) : bucket((x) => x.y);
  const hasTime = picks.some((x) => x.y !== null);
  out.series = Object.entries(hasTime ? per : (spec.byColName ? bucket((x) => x.dim) : bucket((x) => x.key))).map(([k, v]) => [Number.isNaN(+k) ? k : +k, v]);
  out.seriesByKey = Object.entries(bucket((x) => x.key));
  out.seriesByDim = spec.byColName ? Object.entries(bucket((x) => x.dim)) : null;
  out.avg = picks.length ? total / picks.length : null;
  out.max = picks.length ? Math.max(...picks.map((x) => x.v)) : null;
  return out;
}

// 두 경로 결과 비교: 종류별로 기대하는 값이 같은지(상대오차 1e-9)
const close = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
export function compareResults(res, b) {
  const issues = [];
  if (res.count !== b.count) issues.push(`값 개수가 다릅니다(${res.count} ↔ ${b.count})`);
  const cellsA = res.cells.map((c) => `${c.row}:${c.col}`).sort();
  if (cellsA.join('|') !== b.cells.join('|')) issues.push('근거 칸 목록이 다릅니다');
  const totalA = res.items ? res.items.reduce((s, x) => s + x.v, 0) : null;
  if (!close(totalA, b.total)) issues.push(`합계가 다릅니다(${totalA} ↔ ${b.total})`);
  const kind = res.kind;
  if (kind === 'avg' && !close(res.value, b.avg)) issues.push(`평균이 다릅니다(${res.value} ↔ ${b.avg})`);
  if (kind === 'sum' && res.plan.mode === 'sum' && !close(res.value, b.total)) issues.push(`합계가 다릅니다(${res.value} ↔ ${b.total})`);
  if (res.series && ['trend', 'growth', 'compare', 'argmax', 'argmin', 'topk', 'sum'].includes(kind)) {
    const pick = res.groupBy === 'dim' ? (b.seriesByDim || []) : res.groupBy === 'key' ? b.seriesByKey : b.series;
    const A = new Map(res.series.map((g) => [String(g.key), g.value]));
    const B = new Map(pick.map(([k, v]) => [String(k), v]));
    if (A.size !== B.size) issues.push(`묶음 개수가 다릅니다(${A.size} ↔ ${B.size})`);
    for (const [k, v] of A) if (!B.has(k) || !close(v, B.get(k))) issues.push(`‘${k}’ 값이 다릅니다(${v} ↔ ${B.get(k)})`);
  }
  if (kind === 'growth' && res.from && res.to && res.from.value !== 0) { const pct = ((res.to.value - res.from.value) / res.from.value) * 100; if (!close(pct, res.value)) issues.push('증감률 계산이 다릅니다'); }
  return issues;
}

export function serializePlan(p) {
  const t = p.table;
  return {
    reshape: p.reshape, measures: p.measures.map((i) => t.header[i]), filters: p.filters.map((f) => ({ name: f.name, value: f.value })),
    time: p.time, agg: p.agg, mode: p.mode, k: p.k, byMonth: p.byMonth, byYear: p.byYear, byColName: p.byCol != null ? t.header[p.byCol] : null,
    ycolName: p.desc.ycol >= 0 ? t.header[p.desc.ycol] : null, mcolName: p.desc.mcol >= 0 ? t.header[p.desc.mcol] : null, ymcolName: p.desc.ymcol >= 0 ? t.header[p.desc.ymcol] : null, tmax: p.tmax,
  };
}
