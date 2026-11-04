// 화면: 질문 → 에이전트 단계 → 답·신호등·근거 표·그래프. DOM 은 innerHTML 없이 만든다(올린 파일 속 글이 화면을 깨지 못하게).
import { Guide } from './pipeline.js';
import { Table, decodeText } from './table.js';

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const EXAMPLES = [
  '우도 입장객이 가장 많았던 해는?', '우도 입장객 2018년 대비 2022년 증감률', '서귀포 감귤 생산량 연도별 추이', '천지연폭포 관람객이 가장 많았던 달은?',
  '제주 소비자물가가 2014년 대비 2020년에 얼마나 올랐어?', '환경소음 측정 중 가장 시끄러운 곳은?', '유기동물 고양이 TNR이 가장 많았던 달', '귀촌인이 가장 많았던 해는?',
  '우도 입장객이 2030년에 몇 명이었어?', '화성 탐사선 궤도 알려줘',
];

let guide = null;
async function boot() {
  const res = $('#result');
  res.replaceChildren(h('div', { class: 'card' }, '데이터를 불러오는 중…'));
  let catalog, manifest, raw, hints = {};
  if (window.__JEJU_DATA__) ({ catalog, manifest, raw, hints } = window.__JEJU_DATA__);
  else {
    catalog = await (await fetch('data/catalog.json')).json();
    manifest = await (await fetch('data/manifest.json')).json();
    try { hints = await (await fetch('data/hints.json')).json(); } catch { hints = {}; }
    raw = {};
    await Promise.all(manifest.filter((m) => m.rows != null).map(async (m) => { raw[m.id] = await (await fetch(`data/raw/${m.id}.csv`)).text(); }));
  }
  guide = new Guide(catalog, manifest, (id) => raw[id], hints);
  $('#stat').textContent = `카탈로그 ${catalog.length.toLocaleString('ko-KR')}종 · 이 PC에 있는 데이터 ${manifest.filter((m) => m.rows != null).length}종(공개 파일)`;
  res.replaceChildren(emptyCard());
}
const emptyCard = () => $('#result').dataset.empty ? '' : h('div', { class: 'empty card' }, h('h2', {}, '이렇게 쓰세요'), h('ol', {}, h('li', {}, '위 칸에 궁금한 것을 우리말로 적고 물어보기를 누르세요.'), h('li', {}, '에이전트가 맞는 데이터를 찾고, 이 질문에 쓸 수 있는지 점검하고, 계산하고, 다른 방법으로 다시 계산해 맞춰 봅니다.'), h('li', {}, '답의 숫자는 어느 칸에서 왔는지 표에서 색으로 보여 드립니다. 쓸 수 없는 질문은 이유를 대고 거절해요.')));

for (const q of EXAMPLES) $('#examples').append(h('button', { class: 'chip', type: 'button', on: { click: () => { $('#q').value = q; run(); } } }, q));
$('#go').onclick = () => run();
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f || !guide) return;
  const text = decodeText(await f.arrayBuffer());   // UTF-8 이 아니면(엑셀 한글 CSV) CP949 로 읽는다
  const id = 9000000 + (guide.manifest.size % 1000);
  guide.addUserTable(id, f.name, text);
  $('#file-note').textContent = `‘${f.name}’ 를 읽었어요(${guide.manifest.get(id).rows}행). 이제 이 파일에 대해 물어보세요 — 질문에 파일 안의 항목 이름을 넣어 주세요.`;
});

function run(opts = {}) {
  const q = $('#q').value.trim();
  if (!q || !guide) return;
  $('#go').disabled = true;
  setTimeout(() => { try { render(guide.ask(q, opts), q); } catch (e) { $('#result').replaceChildren(h('div', { class: 'card' }, h('div', { class: 'badge bad' }, '문제가 생겼어요'), ` ${e.message}`)); } $('#go').disabled = false; }, 30);
}

const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('ko-KR') : (Math.round(n * 100) / 100).toLocaleString('ko-KR'));

function stepsRow(r) {
  const s = [['① 찾기', true], ['② 점검', !!r.gate], ['③ 계산', r.status === 'answered'], ['④ 계산 검증', !!(r.verify && r.verify.ok)]];
  return h('div', { class: 'steps' }, s.map(([n, ok], i) => h('span', { class: ok ? 'done' : (r.status.startsWith('refuse') ? 'fail' : '') }, `${n}${ok ? ' ✓' : ''}`)));
}

function understoodLine(r) {
  const u = r.understood; if (!u) return null;
  const bits = [['데이터', u.data], ['열', u.columns], u.filters.length ? ['조건', u.filters.join(', ')] : null, ['기간', u.period], ['계산', u.op]].filter(Boolean);
  return h('div', { class: 'understood' }, h('b', {}, '이렇게 이해했어요 · '), bits.map(([k, v], i) => [i ? ' · ' : '', h('b', {}, k + ' '), String(v)]));
}

function lights(gate) { return h('div', { class: 'lights' }, gate.items.map((x) => h('div', { class: `light ${x.level}` }, h('span', { class: 'dot' }), h('span', {}, x.text)))); }

function chart(series, unit) {
  const data = series.filter((s) => Number.isFinite(s.value)).slice(0, 48);
  if (data.length < 2) return null;
  const W = Math.max(520, data.length * 38), H = 200, TOP = 26, pad = 26, max = Math.max(...data.map((d) => d.value), 0), min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1, bw = (W - pad * 2) / data.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + TOP + 40}`); svg.setAttribute('width', W); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '값 막대그래프');
  data.forEach((d, i) => {
    const bh = ((d.value - Math.min(min, 0)) / (Math.max(max, 0) - Math.min(min, 0) || 1)) * H, x = pad + i * bw + 3, y = TOP + H - bh;
    const rect = document.createElementNS(NS, 'rect'); rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', Math.max(4, bw - 6)); rect.setAttribute('height', Math.max(1, bh)); rect.setAttribute('fill', '#1a56db'); rect.setAttribute('rx', 3);
    const t = document.createElementNS(NS, 'title'); t.textContent = `${d.label}: ${fmt(d.value)}${unit || ''}`; rect.append(t); svg.append(rect);
    const lab = document.createElementNS(NS, 'text'); lab.setAttribute('x', x + (bw - 6) / 2); lab.setAttribute('y', TOP + H + 16); lab.setAttribute('text-anchor', 'middle'); lab.textContent = String(d.label).slice(0, 8); svg.append(lab);
    if (data.length <= 14) { const v = document.createElementNS(NS, 'text'); v.setAttribute('x', x + (bw - 6) / 2); v.setAttribute('y', y - 3); v.setAttribute('text-anchor', 'middle'); v.textContent = fmt(d.value); svg.append(v); }
  });
  return h('div', { class: 'chart' }, svg);
}

function evidence(r) {
  const p = r.plan, t = p.table, src = t.melted ? t.source : t;
  const hit = new Set(r.result.cells.map((c) => `${c.row}:${c.col}`));
  const rowsHit = [...new Set(r.result.cells.map((c) => c.row))].sort((a, b) => a - b);
  const show = rowsHit.slice(0, 60);
  const cols = src.header.map((_, i) => i).filter((i) => src.columns[i].type !== 'empty').slice(0, 24);
  const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '행'), cols.map((i) => h('th', {}, src.header[i])))),
    h('tbody', {}, show.map((ri) => h('tr', {}, h('td', {}, ri + 2), cols.map((ci) => h('td', { class: hit.has(`${ri}:${ci}`) ? 'hit' : '' }, src.rows[ri][ci]))))));
  return h('div', {}, h('h3', {}, `근거 — 계산에 쓴 칸 ${hit.size}개(노란색), 원자료 ${show.length}${rowsHit.length > show.length ? `/${rowsHit.length}` : ''}행`), h('div', { class: 'tablewrap' }, tbl),
    h('p', { class: 'note small' }, `파일: ${r.chosen.meta?.file || r.chosen.title} · 행 번호는 파일 줄 번호(머리글이 1행) · 수집일 ${r.chosen.meta?.fetched || ''} · 해시 ${r.chosen.meta?.sha256 || ''}`));
}

function render(r, q) {
  const res = $('#result');
  const cards = [];
  const found = h('div', { class: 'cand' }, r.found.map((f) => h('div', { class: 'c' }, h('span', {}, `${f.item.cat} · ${f.item.title}`), h('small', {}, `일치한 말: ${f.matched.slice(0, 5).join(', ') || '-'}${guide.manifest.has(f.id) ? ' · 이 PC에 파일 있음' : ' · 로그인 필요(파일 없음)'}`))));
  if (r.status === 'refuse') {
    cards.push(h('div', { class: 'card' }, stepsRow(r), h('div', { class: 'light no' }, h('span', { class: 'dot' }), h('span', {}, h('b', {}, r.kind === 'ambiguous' || r.kind === 'no-cover' || r.kind === 'covid' ? '더 알려 주시거나 질문을 바꿔 주세요. ' : '이 질문에는 답하지 않을게요. '), r.reason)), h('h3', {}, '찾아본 데이터'), r.found.length ? found : h('p', { class: 'note' }, '맞는 데이터가 없습니다.')));
  } else {
    const badge = r.verify ? (r.verify.ok ? h('span', { class: 'badge ok', title: '원본 CSV 글자에서 다른 방식으로 다시 계산해 숫자가 같은지만 확인합니다. 질문을 맞게 이해했는지는 위 ‘이렇게 이해했어요’ 줄로 확인하세요.' }, `계산 검증 ✓ 숫자 일치 (값 ${r.verify.count}개)`) : h('span', { class: 'badge bad' }, '계산 검증 실패 — 이 숫자를 쓰지 마세요')) : null;
    cards.push(h('div', { class: 'card' }, stepsRow(r), understoodLine(r), h('div', { class: 'answer' }, r.answer), h('div', { style: 'margin-top:8px' }, badge, h('span', { class: 'badge gray' }, `데이터 ${r.chosen.id} · ${r.chosen.title}`)), h('h3', {}, '이 질문에 이 데이터를 써도 될까요? (적합성 점검)'), lights(r.gate)));
    if (r.status === 'answered' && r.result.series && r.result.series.length > 1) { const c = chart(r.result.series, r.plan.unit); if (c) cards.push(h('div', { class: 'card' }, h('h2', {}, '그래프'), c)); }
    if (r.status === 'answered' && r.result.cells.length) cards.push(h('div', { class: 'card' }, evidence(r)));
    cards.push(h('details', { class: 'card' }, h('summary', {}, '에이전트가 한 일 (도구 호출 기록)'), h('ol', { class: 'trace' }, r.trace.map((x) => h('li', {}, h('b', {}, x.tool), x.input ? ` ← ${String(x.input).slice(0, 60)}` : '', h('br'), h('span', { class: 'note small' }, `→ ${x.output}`))))));
    cards.push(h('div', { class: 'card' }, h('h3', {}, '이렇게 읽었어요'), h('p', { class: 'note small' }, `찾은 데이터 후보: ${r.found.map((f) => f.item.title).slice(0, 3).join(' / ')}. 계산에 쓴 열: ${r.plan.measures.map((i) => r.plan.table.header[i]).slice(0, 6).join(', ')}${r.plan.measures.length > 6 ? ' 외' : ''} · 조건: ${r.plan.filters.map((f) => `${f.name}=${f.value}`).join(', ') || '없음'} · 연산: ${r.plan.agg}`)));
  }
  res.dataset.empty = '1';
  res.replaceChildren(...cards);
}

boot().catch((e) => $('#result').replaceChildren(h('div', { class: 'card' }, `데이터를 불러오지 못했어요: ${e.message}`)));
