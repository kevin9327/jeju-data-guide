// 한 번의 질문 처리: 찾기(카탈로그) → 읽기(표) → 적합성 점검(신호등) → 계획 → 계산(근거 칸) → 독립 재계산 → 쉬운 말 답.
import { Catalog } from './catalog.js';
import { Table } from './table.js';
import { plan, execute, compose, parseTime, timeOfRow, describe, understood } from './agent.js';
import { keyTerms, coverage, precheck, unitCheck, queryBoost, titleCovers, fitCheck } from './understand.js';
import { recompute, compareResults, serializePlan } from './verify.js';

// ---- 적합성 게이트(C): 이 질문에 이 데이터로 어디까지 답할 수 있는지 한 줄 신호등
export function gate(p, res, meta = {}) {
  const items = []; const add = (level, text, inAnswer = false) => items.push({ level, text, inAnswer });
  const t = p.table;
  if (/(미리보기|sample)/i.test(meta.file || '')) add('caution', '이 파일은 허브의 ‘미리보기’ 파일이라 전체 자료의 일부일 수 있어요. 합계·순위는 이 파일 안에서만 맞습니다.');
  const years = p.time.years;
  if (years.length && p.tmin && p.tmax) {
    const out = years.filter((y) => y < p.tmin.y || y > p.tmax.y);
    if (out.length) add('no', `이 데이터에는 ${out.join('·')}년 자료가 없어요(자료 기간 ${p.tmin.y}~${p.tmax.y}년).`);
  }
  if (p.tmax && !years.length) { const nowY = 2026; if (nowY - p.tmax.y >= 3) add('caution', `가장 최근 자료가 ${p.tmax.y}년이라 최신 상황과 다를 수 있어요.`); }
  if (res && res.kind !== 'empty') {
    let blanks = 0, total = 0;
    for (let r = 0; r < t.rows.length; r++) { if (!res.items.some((x) => x.r === r)) continue; for (const ci of p.measures) { total++; if (String(t.rows[r][ci] ?? '').trim() === '') blanks++; } }
    if (blanks) add('caution', `선택한 값 중 ${blanks}칸이 비어 있어 계산에서 빠졌어요.`);
    if (res.count < 3 && (['trend', 'growth'].includes(res.kind) || (res.kind === 'avg' && res.count > 1))) add('caution', `계산에 쓴 값이 ${res.count}개뿐이라 추이·평균의 의미가 약해요.`);
  }
  if (meta.updated && /20(1\d|20)/.test(String(meta.updated)) && p.tmax && p.tmax.y <= 2020) add('caution', '오래된 자료입니다.');
  if (res && res.kind !== 'empty') extraChecks(p, res, add);
  const level = items.some((x) => x.level === 'no') ? 'no' : items.length ? 'caution' : 'ok';
  if (!items.length) add('ok', '질문에 쓴 기간·항목이 자료 범위 안에 있고 비어 있는 칸이 없어요.');
  return { level, items };
}

// 숫자는 맞아도 뜻이 달라질 수 있는 경우: 질문에 없는 ‘구분’ 값을 한꺼번에 합침 · 해마다 달 수가 다름 · 쌓여 있는 양(인구 등)을 여러 시점 합산
const QUANT = /(대수|몇\s*대|건수|몇\s*건|횟수|몇\s*번|명수|몇\s*명|가구수|세대수|수량)/;
const MIX_COL = /(구분|항목|분류|종류|유형|지표|품목|업종|대상|부문|용도)/;
const STOCK = /(인구|가구|세대|등록|보유|재고|잔액|시설|면적|인원|종사자|사업체|취업자|실업자|대수$)/;
// 질문이 고르지 않은 ‘구분’ 열 값들이 서로 다른 단위(℃·%·mm …)면 합치거나 견줄 수 없다 → 계산하지 않고 되묻는다
export function ambiguity(p, res) {
  const t = p.table, d = p.desc;
  if (!res || res.kind === 'empty') return null;
  const rows = [...new Set(res.items.map((x) => x.r))];
  for (let i = 0; i < t.columns.length; i++) {
    if (!(d.roles[i] === 'dim' || d.roles[i] === 'text') || !MIX_COL.test(t.columns[i].name) || p.filters.some((f) => f.col === i) || i === p.byCol) continue;
    const vals = [...new Set(rows.map((r) => String(t.rows[r][i] ?? '').trim()).filter(Boolean))];
    if (vals.length < 2 || vals.length > 60) continue;
    const units = new Set(vals.map((v) => (v.match(/[(（]([^)）]+)[)）]/) || [])[1] || ''));
    if (units.size >= 2 && [...units].some((u) => u)) return { col: t.columns[i].name, vals, units: [...units].filter(Boolean) };
  }
  return null;
}

function extraChecks(p, res, add) {
  const t = p.table, d = p.desc;
  const combining = ['sum', 'avg', 'trend', 'growth', 'compare'].includes(res.kind) && res.groupBy !== 'dim';
  const rows = [...new Set(res.items.map((x) => x.r))];
  if (res.skipped && res.skipped.length && res.kind !== 'empty') {
    const labs = [...new Set(res.skipped.map((x) => `${x.tm && x.tm.y ? x.tm.y + '년 ' : ''}${x.name}`))];
    add('caution', `이 표의 비고에 ‘미조사’ 표시가 있어, 0 으로 적힌 ${res.skipped.length}칸(${labs.slice(0, 3).join(', ')}${labs.length > 3 ? ' 등' : ''})은 값이 없는 것으로 보고 계산에서 뺐어요.`, true);
  }
  if (combining) {
    t.columns.forEach((c, i) => {
      if (!(d.roles[i] === 'dim' || d.roles[i] === 'text') || !MIX_COL.test(c.name) || p.filters.some((f) => f.col === i) || i === p.byCol) return;
      const vals = [...new Set(rows.map((r) => String(t.rows[r][i] ?? '').trim()).filter(Boolean))];
      const placeRe = /(읍|면|동|리|시|군|구|역|포구|해변|공원|폭포|오름|마을|센터|학교|병원|지역)$/;
      if (vals.length >= 3 && vals.filter((v) => placeRe.test(v)).length / vals.length >= 0.6) return;   // 지역 이름들을 모두 더하는 것은 ‘전체’ 합계라 알릴 필요 없음
      if (vals.length > 1 && vals.length <= 40) add('caution', `‘${c.name}’ 열의 값 ${vals.length}가지(${vals.slice(0, 4).join('·')}${vals.length > 4 ? ' 등' : ''})를 가리지 않고 ${p.mode === 'sum' ? '모두 더했어요' : '섞어 계산했어요'}. 한 가지만 보려면 그 이름을 질문에 넣어 주세요.`, true);
    });
  }
  if ((res.kind === 'sum' || res.kind === 'avg') && !p.time.years.length && !p.time.months.length && !p.time.recentN) {
    const ys = res.items.filter((x) => x.tm).map((x) => x.tm.y); const periods = new Set(res.items.filter((x) => x.tm).map((x) => (x.tm.y ?? 0) * 100 + (x.tm.m || 0)));
    if (periods.size > 1) add('caution', `기간을 말씀하지 않아 자료 전체 기간(${Math.min(...ys)}~${Math.max(...ys)}년, ${periods.size}개 시점)을 ${p.mode === 'sum' ? '모두 더했어요' : '모두 평균했어요'}. 특정 해·달이 궁금하면 질문에 넣어 주세요.`, true);
  }
  if (p.level && p.measures.length > 1 && !p.allMeasures) add('caution', `서로 다른 열 ${p.measures.length}개(${p.measures.slice(0, 3).map((i) => t.header[i]).join('·')}${p.measures.length > 3 ? ' 등' : ''})를 섞어 ${p.mode === 'avg' ? '평균' : p.mode === 'max' ? '최댓값' : '최솟값'}을 냈어요. 한 열만 보려면 그 이름을 질문에 넣어 주세요.`, true);
  if (['sum', 'avg', 'growth', 'compare', 'trend'].includes(res.kind) && p.time.years.length && !p.time.months.length && !p.time.recentN) {   // 질문한 해가 일부 달뿐인 자료인지
    const bad = [];
    for (const y of p.time.years) { const its = res.items.filter((x) => x.tm && x.tm.y === y && x.tm.m); const ms = new Set(its.map((x) => x.tm.m)); if (ms.size > 0 && ms.size < 12) bad.push(`${y}년은 ${ms.size}개월(${Math.min(...ms)}~${Math.max(...ms)}월)`); }
    if (bad.length) add('caution', `${bad.slice(0, 3).join(', ')}치 자료뿐이라, 이 값은 그 해 전체가 아니에요.`, true);
  }
  {   // ‘제주 …’ 라고 물었는데 자료가 제주시 또는 서귀포시 한쪽 것이면 범위를 밝힌다
    const rg = (String(t.title || '').match(/(제주시|서귀포시)/) || [])[1];
    if (rg && /제주/.test(p.question || '') && !String(p.question).includes(rg === '제주시' ? '제주시' : '서귀포')) add('caution', `이 자료는 ${rg}만의 자료라서, 제주도 전체 숫자가 아니에요.`, true);
  }
  const monthsOf = (s) => new Set(s.items.filter((x) => x.tm && x.tm.m).map((x) => x.tm.m)).size;
  if (res.series && res.groupBy === 'period' && !p.byMonth && res.series.length >= 2 && /년$/.test(String(res.series[0].label)) && p.mode === 'sum') {
    const ms = res.series.map((s) => [s.label, monthsOf(s)]);
    if (ms.some(([, n]) => n > 0) && new Set(ms.map(([, n]) => n)).size > 1) add('caution', `해마다 자료가 있는 달 수가 달라요(${ms.filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}개월`).slice(0, 4).join(', ')}). 합계를 해끼리 비교하면 실제보다 늘거나 줄어 보일 수 있어요.`, true);
  }
  if (p.allMeasures && p.measures.length > 1) add('caution', `질문에 항목 이름이 없어서 이 표의 숫자 열 ${p.measures.length}개(${p.measures.slice(0, 4).map((i) => t.header[i]).join('·')}${p.measures.length > 4 ? ' 등' : ''})를 모두 더했어요. 한 항목만 보려면 이름을 넣어 주세요.`, true);
  const names = p.measures.map((i) => t.header[i]);
  if (p.mode === 'sum' && names.length && names.every((n) => STOCK.test(n))) {
    const key = (x) => (x.tm.y ?? 0) * 100 + (x.tm.m || 0);
    const periods = new Set(res.items.filter((x) => x.tm).map(key));
    const perGroup = res.series && res.groupBy === 'period' ? Math.max(...res.series.map((s) => new Set(s.items.filter((x) => x.tm).map(key)).size)) : periods.size;
    if (perGroup > 1) add('caution', `‘${names[0]}’ 같은 값은 시점마다 쌓여 있는 양이라, 여러 시점(${perGroup}개)을 더한 합계는 뜻이 약해요. 한 시점의 값이나 평균이 더 알맞을 수 있어요.`, true);
  }
}

export class Guide {
  // catalogItems: data/catalog.json, manifest: data/manifest.json, readRaw(id) → CSV 글자
  constructor(catalogItems, manifest, readRaw, hints = {}, opts = {}) {
    this.today = opts.today || new Date();   // ‘올해·작년’ 의 기준(시험에서는 고정)
    this.catalog = new Catalog(catalogItems);
    this.manifest = new Map(manifest.filter((m) => m.rows != null).map((m) => [m.id, m]));
    this.userRaw = new Map(); this.userIds = [];
    this.readRaw = (id) => (this.userRaw.has(id) ? this.userRaw.get(id) : readRaw(id)); this.hints = hints; this.cache = new Map();
    // 표 안의 열 이름·범주 값을 카탈로그 색인에 보탠다(데이터 내용까지 보고 찾기)
    for (const id of this.manifest.keys()) { try { const t = this.table(id); const vals = []; t.columns.forEach((c) => { if (c.type === 'category' && c.uniq <= 80) vals.push(...c.values); }); this.catalog.setExtra(id, `${t.header.join(' ')} ${vals.slice(0, 200).join(' ')}`); } catch { /* 읽기 실패한 표는 건너뜀 */ } }
  }
  // 사용자가 올린 CSV(이 PC 안에서만 읽음): 같은 방식으로 계산·재계산한다
  addUserTable(id, name, text) {
    this.userRaw.set(id, text); this.cache.delete(id);
    const t = this.table(id);
    this.manifest.set(id, { id, title: name, file: name, rows: t.rows.length, bytes: text.length, sha256: '(올린 파일)', fetched: '' });
    this.catalog.items.push({ id, title: name, cat: '내 파일', desc: '', auth: false, views: 0, start: '', end: '', _t: '', _d: '', _tag: '', _o: '', _x: '' });
    this.catalog.byId.set(id, this.catalog.items.at(-1));
    this.userIds = [id];
    return t;
  }
  table(id) { if (!this.cache.has(id)) this.cache.set(id, Table.fromCSV(this.readRaw(id), { id, title: this.manifest.get(id)?.title || '' })); return this.cache.get(id); }
  ask(question, { dataId = null } = {}) {
    const pin = dataId ? [dataId] : this.userIds;
    const searchQ = question.replace(/(올해|금년|작년|지난해|재작년|전년|이번\s*해|최근|요즘)/g, ' ');   // 시간 말은 어느 데이터인지와 무관
    const found = pin.length ? pin.map((id) => ({ id, score: 99, matched: [], item: this.catalog.byId.get(id) })) : this.catalog.search(`${searchQ} ${queryBoost(question)}`, { k: 10 });
    const have = found.filter((f) => this.manifest.has(f.id));
    const out = { question, found: found.slice(0, 5), attempts: [], trace: [] };
    const T0 = Date.now(); const step = (tool, input, output) => out.trace.push({ tool, input, output, ms: Date.now() - T0 });
    step('search_catalog', question, found.slice(0, 5).map((f) => `${f.id} ${f.item.title.slice(0, 28)} (${f.score})`).join(' | ') || '후보 없음');
    const terms = keyTerms(question, (w) => this.catalog.df.has(w));
    out.terms = terms;
    step('understand_question', question, `핵심어: ${terms.join('·') || '없음'}`);
    const pre = precheck(question);
    if (pre) { out.status = 'refuse'; out.kind = pre.id; out.reason = pre.msg; step('precheck', pre.id, '지원하지 않는 질문 유형 → 거절·되묻기'); return out; }
    let best = null, askBack = null;
    for (const f of have) {
      const t = this.table(f.id);
      const p = plan(question, t, this.hints[f.id] || {}, { today: this.today });
      const base = p.ok ? scoreFit(p, f) : -1;
      if (p.ok && QUANT.test(question) && !p.measureHit) { p.ok = false; p.why = `질문이 묻는 수량(${(question.match(QUANT) || [''])[0].replace(/\s+/g, '')})을 나타내는 숫자 열이 이 표에 없어요`; }
      const cov = p.table ? coverage(terms, p.table, f.item.title) : { covered: [], missing: terms };
      if (p.table) { const um = unitCheck(question, p.table, f.item.title); if (um) cov.missing.push(`${um} 단위로 셀 수 있는 대상`); }
      const conf = p.ok ? base + (terms.length ? 4 * (cov.covered.length / terms.length) - 3 * cov.missing.length : 0) : -1;
      out.attempts.push({ id: f.id, title: f.item.title, conf, base, missing: cov.missing, why: p.ok ? null : p.why });
      if (!p.ok && p.table && terms.length && !cov.missing.length) { const nm = describe(p.table).roles.filter((r) => r === 'measure').length; if (!askBack || (nm > 0 && !askBack.nm)) askBack = { f, t: p.table, why: p.why, nm }; }
      step('inspect_and_plan', `데이터 ${f.id}`, p.ok ? `열 ${p.measures.length}개·조건 ${p.filters.length}개·연산 ${p.agg} → 적합도 ${base.toFixed(1)}${terms.length ? ` · 핵심어 ${cov.covered.length}/${terms.length}${cov.missing.length ? ` (없음: ${cov.missing.join('·')})` : ''}` : ''}` : `계획 실패: ${p.why}`);
      if (p.ok && (!best || conf > best.conf)) best = { f, p, conf, base, cov };
    }
    if (!best || best.base < 4) {
      out.status = 'refuse';
      out.reason = askBack ? askBackText(askBack)  : !found.length ? '허브 카탈로그에서 질문과 맞는 데이터를 찾지 못했어요.' : !have.length ? '맞는 데이터는 찾았지만 로그인 없이 받을 수 있는 파일이 이 PC에 없어요(허브에서 받은 CSV를 올리면 같은 방식으로 분석합니다).' : '찾은 데이터에서 질문에 쓸 숫자 열을 확실히 고르지 못했어요. 항목 이름을 더 구체적으로 말씀해 주세요.';
      return out;
    }
    if (best.cov.missing.length) {
      out.status = 'refuse'; out.kind = 'no-cover'; out.missing = best.cov.missing;
      const hubHave = found.filter((x) => !this.manifest.has(x.id) && titleCovers(terms, x.item.title)).slice(0, 2);   // 허브에는 있으나 로그인이 필요해 이 PC에 파일이 없는 자료
      const items = best.cov.covered.length ? best.p.table.header.filter((h, i) => best.p.desc.roles[i] === 'measure').slice(0, 6) : [];   // 핵심어가 하나도 안 맞는 표의 항목은 보여 주지 않는다
      out.reason = `질문의 ${best.cov.missing.map((w) => `‘${w}’`).join('·')}에 해당하는 내용이 ${best.cov.covered.length ? `가장 가까운 자료(「${best.f.item.title.slice(0, 30)}」)에` : '이 PC에 있는 자료에'} 없어요. 엉뚱한 자료로 계산한 숫자를 드리지 않으려고 답하지 않습니다.${items.length ? ` 그 표에 있는 숫자 항목: ${items.join(', ')}.` : ''} ${hubHave.length ? `허브 카탈로그에는 ${hubHave.map((x) => `「${x.item.title.slice(0, 28)}」`).join('·')}이(가) 있지만 로그인이 필요해 이 PC에 파일이 없어요 — 허브에서 받은 CSV를 올리면 분석합니다.` : '허브에 해당 자료가 있는지 확인하거나, 자료에 있는 항목 이름으로 다시 물어봐 주세요.'}`;
      step('acceptance_check', best.cov.missing.join('·'), '질문의 핵심어가 데이터에 없음 → 거절');
      return out;
    }
    const { f, p } = best;
    const res = execute(p);
    step('execute', `데이터 ${f.id}`, res.kind === 'empty' ? '조건에 맞는 값 없음' : `값 ${res.count}개 계산(${res.kind})`);
    const fit = fitCheck(question, p, res);
    if (fit) {
      out.status = 'refuse'; out.kind = 'misfit'; out.plan = p; out.chosen = { id: f.id, title: f.item.title, conf: best.base, meta: this.manifest.get(f.id) };
      out.reason = fit; step('fit_check', '', '계산은 가능하지만 질문과 맞지 않는 답 → 거절');
      return out;
    }
    const amb = ambiguity(p, res);
    if (amb) {
      out.status = 'refuse'; out.kind = 'ambiguous'; out.plan = p; out.chosen = { id: f.id, title: f.item.title, conf: best.base, meta: this.manifest.get(f.id) };
      out.reason = `「${f.item.title.slice(0, 30)}」 표의 ‘${amb.col}’ 열에는 단위가 서로 다른 항목이 섞여 있어요(${amb.vals.slice(0, 8).join(', ')}${amb.vals.length > 8 ? ' 등' : ''}). 어느 항목인지 정하지 않으면 더하거나 견줄 수 없어서 답하지 않아요. 항목 이름을 질문에 넣어 다시 물어봐 주세요.`;
      step('ambiguity_check', amb.col, `단위가 다른 ${amb.vals.length}가지 항목(${amb.units.join('·')}) → 되묻기`);
      return out;
    }
    const g = gate(p, res, this.manifest.get(f.id));
    step('suitability_gate', '', `${g.level}: ${g.items.map((x) => x.text).join(' / ').slice(0, 120)}`);
    out.status = g.level === 'no' ? 'refuse-gate' : (res.kind === 'empty' ? 'refuse' : 'answered');
    if (out.status === 'refuse') { out.kind = res.skipped && res.skipped.length ? 'not-surveyed' : 'empty'; out.reason = compose(res); }
    out.chosen = { id: f.id, title: f.item.title, matched: f.matched, conf: best.base, meta: this.manifest.get(f.id) };
    out.plan = p; out.result = res; out.gate = g; out.understood = understood(p, f.item.title);
    if (res.kind !== 'empty') {
      const b = recompute(this.readRaw(f.id), serializePlan(p));
      out.verify = { issues: compareResults(res, b), count: b.count };
      out.verify.ok = out.verify.issues.length === 0;
      step('verify_calculation', '원본 CSV 글자에서 다른 방식으로 다시 계산', out.verify.ok ? `숫자 일치(${b.count}개 값) — 계산이 맞는지만 확인, 질문 이해는 별도` : `불일치: ${out.verify.issues[0]}`);
    }
    if (out.status === 'refuse') return out;   // 조사 안 함(미조사) 표시 → 숫자 답 없이 이유만
    out.answer = out.status === 'refuse-gate' ? `이 데이터로는 답할 수 없어요. ${g.items.filter((x) => x.level === 'no').map((x) => x.text).join(' ')}` : compose(res, g.items.filter((x) => x.inAnswer).map((x) => x.text));
    return out;
  }
}

function askBackText(a) {
  const d = describe(a.t); const names = a.t.header.filter((h, i) => d.roles[i] === 'measure').slice(0, 8);
  const head = `「${a.f.item.title.slice(0, 30)}」 표를 찾았지만 `;
  return names.length ? `${head}어느 항목을 볼지 정하지 못했어요(${a.why}). 이 표의 항목 예: ${names.join(', ')} — 이름을 질문에 넣어 다시 물어봐 주세요.` : `${head}더하거나 비교할 수 있는 수량 열이 없어요(있는 숫자는 좌표·코드뿐). 이 표로는 합계·평균을 낼 수 없어서 답하지 않아요.`;
}

function scoreFit(p, f) {
  let s = Math.min(6, f.score / 4);   // 카탈로그 일치도
  s += p.filters.length * 3;
  if (p.time.years.length && p.tmin && p.time.years.every((y) => y >= p.tmin.y && y <= p.tmax.y)) s += 2;
  s += p.measureHit ? 3 : 0;
  return s;
}
