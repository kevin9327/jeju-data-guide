// 제주 데이터 길잡이 — 질문 이해(plan) → 계산(execute) → 쉬운 말 답(compose). 규칙 기반(LLM 없이 동작), 모든 숫자에 원자료 칸(row, col) 근거를 붙인다.
// 계산은 verify.js 가 원본 CSV 글자에서 '다른 구현'으로 한 번 더 한다(독립 재계산).
import { toNumber, meltMonths } from './table.js';
import { words } from './catalog.js';
import { EQUIV } from './understand.js';

const ADJ_MEASURE = [[/(다녀|다녀간|방문했|찾았|왔어|입장)/, ['입장객', '방문객', '관람객']], [/(긴|길어|길다|길이)/, ['연장', '길이', '거리']], [/(넓|면적)/, ['면적', '규모']], [/(무거|무게|중량)/, ['중량', '무게']], [/(깊)/, ['깊이', '수심']]];

// ---------- 열 역할 판별
const META_COL = /(기준일|데이터기준|관련부서|해당기관|비고|등록일|수정일|URL|링크)/i;
const ID_COL = /(코드|번호|좌표|위도|경도|lat|lng|longitude|latitude|oid|id$|^id|순서|순위|j_50|left|top|right|bottom|xcoord|ycoord|연번|순번|일련|고유|^no$|^seq|^idx|^index|objectid|^fid$|^gid$|우편|사업자|지번|^x$|^y$|_cd$|^cd$|성별코드)/i;
const YEAR_NAME = /(년도|연도|해당연도|기준년도|구분연도|과세년도|조사연도)$/;
const MONTH_NAME = /^월$/;
const YM_NAME = /(일시|통계일|기준연월|해당연월|연월|기준년월|경락일|일자|측정시작일|집계일)/;
const LEVEL_NAME = /(기온|℃|풍속|최소가|평균가|최대가|소음|온도|수온|지수|물가|율$|률$|가격|단가|%|수위|전압|점수|평점|등급|stars?|rating|score|만족|습도|풍속|농도|비율)/i;   // 더하면 뜻이 없는 '수준' 값
const UNITS = new Set(['명', '인', '건', '대', '개', '곳', '회', '가구', '가구원', '호', 'ha', '㎡', 'm²', 'kg', '톤', '톤/일', '원', '만원', '%', 'dB', '℃', '분', 'km', 'm', '시간', '마리']);

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseYM(s) {
  const t = String(s ?? '').trim();
  let m;
  if ((m = t.match(/^(\d{4})[-./\s]+(\d{1,2})(?:[-./\s]+(\d{1,2}))?/))) return { y: +m[1], m: +m[2], d: m[3] ? +m[3] : null };
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return { y: +m[1], m: +m[2], d: +m[3] };
  if ((m = t.match(/^([A-Za-z]{3})-(\d{2})$/))) return { y: 2000 + +m[2], m: MON[m[1].toLowerCase()], d: null };
  if ((m = t.match(/^(\d{4})(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2], d: null };
  if ((m = t.match(/^(\d{4})$/))) return { y: +m[1], m: null, d: null };
  return null;
}

// 숫자 열이어도 더하면 안 되는 모양: 위·경도 범위, 1씩 늘어나는 일련번호, 정수 2~3종뿐인 코드
function idLike(t, c) {
  const vals = t.rows.map((r) => toNumber(r[c.i])).filter((v) => v !== null);
  if (vals.length < 8) return false;
  const lat = vals.every((v) => v >= 32.5 && v <= 34.5 && !Number.isInteger(v)), lon = vals.every((v) => v >= 125 && v <= 128 && !Number.isInteger(v));
  if (lat || lon) return true;
  if (vals.every(Number.isInteger)) {
    const u = new Set(vals);
    if (u.size === vals.length && vals.every((v, i) => i === 0 || v === vals[i - 1] + 1)) return true;   // 1,2,3… 일련번호
    if (u.size <= 3 && vals.length >= 30) return true;                                                      // 0/1·1/2 같은 코드
  }
  return false;
}

export function describe(t) {
  const roles = t.columns.map((c) => {
    if (META_COL.test(c.name)) return 'meta';
    if (YEAR_NAME.test(c.name) || (c.type === 'year' && /(년|연)/.test(c.name))) return 'year';
    if (MONTH_NAME.test(c.name)) return 'month';
    if (YM_NAME.test(c.name) || c.type === 'date') return 'ym';
    if (ID_COL.test(c.name)) return 'id';
    if (c.type === 'number') return idLike(t, c) ? 'id' : 'measure';
    if (c.type === 'category' || c.type === 'year') return 'dim';
    return 'text';
  });
  const first = (r) => roles.indexOf(r);
  return { roles, ycol: first('year'), mcol: first('month'), ymcol: first('ym') };
}

export function timeOfRow(t, d, r) {
  if (d.ymcol >= 0) { const p = parseYM(t.rows[r][d.ymcol]); if (p) return p; }
  if (d.ycol >= 0) { const y = toNumber(t.rows[r][d.ycol]); const m = d.mcol >= 0 ? toNumber(t.rows[r][d.mcol]) : null; if (y) return { y, m: m || null, d: null }; }
  return null;
}

// ---------- 질문 해석 도우미
const SEASON = { 봄: [3, 4, 5], 여름: [6, 7, 8], 가을: [9, 10, 11], 겨울: [12, 1, 2], 상반기: [1, 2, 3, 4, 5, 6], 하반기: [7, 8, 9, 10, 11, 12] };
const colWords = (name) => words(name.replace(/[()_·]/g, ' ').replace(/(\d+)월/g, ' '));

export function parseTime(q, tmax, today = new Date()) {
  const years = new Set(), months = new Set();
  for (const m of q.matchAll(/(\d{4})\s*년/g)) years.add(+m[1]);
  for (const m of q.matchAll(/(?<![\d])(\d{1,2})\s*월/g)) { const v = +m[1]; if (v >= 1 && v <= 12) months.add(v); }
  for (const [k, ms] of Object.entries(SEASON)) if (q.includes(k)) ms.forEach((x) => months.add(x));
  let rel = null;
  if (/재작년/.test(q)) rel = -2; else if (/작년|지난해|전년/.test(q)) rel = -1; else if (/올해|금년|이번\s*해/.test(q)) rel = 0;
  if (rel !== null) years.add(today.getFullYear() + rel);   // ‘올해’는 오늘 기준. 자료의 마지막 해로 바꿔 읽으면 없는 해의 답을 만들어 낸다
  let recentN = null; const mr = q.match(/최근\s*(\d+)\s*(년|개월)/); if (mr) recentN = { n: +mr[1], unit: mr[2] };
  if (!recentN && /(가장|제일)\s*(최근|최신)|최신\s*(값|수치|자료|통계|기준)?/.test(q)) recentN = { n: 1, unit: '년' };   // ‘가장 최근 실업률’ = 자료의 마지막 해 값(가장 큰 값이 아님)
  const rangeY = q.match(/(\d{4})\s*년?\s*(?:부터|~|-)\s*(\d{4})\s*년?/);
  if (rangeY) { years.clear(); for (let y = +rangeY[1]; y <= +rangeY[2]; y++) years.add(y); }
  return { years: [...years].sort(), months: [...months].sort((a, b) => a - b), recentN, season: Object.keys(SEASON).filter((k) => q.includes(k)) };
}

const AGG_RULES = [
  ['growth', /(증감|증가율|감소율|상승률|하락률|인상률|인하율|성장률|몇\s*%|퍼센트|얼마나\s*(늘|줄|증가|감소|변|올|내)|배\s*(가|나|이상)?)/],
  ['topk', /(상위\s*\d+|\d+\s*위|순위|TOP\s*\d+|랭킹)/i],
  ['trend', /(추이|변화|변했|변해|변하|바뀌|바뀐|달라졌|달라진|흐름|추세|그래프|해마다|연도별|월별|해별|늘었|줄었|증가했|감소했|늘고|줄고|늘어|줄어|증가하|감소하|오르|내리|올랐|내렸)/],
  ['avg', /(평균)/],
  ['sum', /(합계|총|전체|모두|누적|합쳐)/],
  ['compare', /(비교|보다|vs|대비|차이)/i],
];
export function detectAgg(q0) {
  const q = q0.replace(/(가장|제일)\s*(최근|최신)/g, ' ').replace(/(최고|최저|최대|최소)(기온|온도|가격|가$|점|수위|값|치|속도|풍속|습도)/g, '$2');   // ‘최고기온’ 은 이름이지 ‘가장 큰 것 찾기’ 가 아니다
  if (/(가장|제일|최대|최소|최고|최저|꼴찌)/.test(q)) {
    const neg = /(적|작|낮|싼|조용|짧|느린|최소|최저|꼴찌)/.test(q), pos = /(많|큰|높|시끄|붐비|비싼|오래|빠른|최대|최고)/.test(q);
    return neg && !pos ? 'argmin' : 'argmax';
  }
  const yrs = new Set((q.match(/(?<![\d])(19|20)\d{2}\s*년/g) || []).map((x) => parseInt(x, 10)));
  const twoYears = yrs.size >= 2 && !/(부터|~|\d\s*-\s*\d)/.test(q);
  for (const [k, re] of AGG_RULES) if (re.test(q)) return k === 'sum' && twoYears ? 'compare' : k;
  return twoYears ? 'compare' : 'sum';
}

// 비고·특이사항 같은 메모 열에 ‘미조사·미집계’ 가 적힌 표: 이런 표의 0 은 ‘값이 0’이 아니라 ‘조사 안 함’ 표시인 경우가 많다(예: 건강관련통계 자살률 0)
const NOTE_NAME = /(비고|특이사항|참고|주석|메모)/;
const MISSING_TEXT = /(미조사|미집계|미확인|미제공|결측|해당\s*없음|조사\s*안)/;
export function hasMissingNote(t, d) {
  const cols = t.columns.map((c, i) => i).filter((i) => NOTE_NAME.test(t.header[i]) && d.roles[i] !== 'measure');
  return cols.some((i) => t.rows.some((r) => MISSING_TEXT.test(String(r[i] ?? ''))));
}

// 같은 표에서 한 숫자 열이 나머지 숫자 열의 합과(70% 이상의 행에서) 같으면 그 열이 ‘전체(합계)’ 열이다
function totalColumn(t, cols) {
  if (cols.length < 3) return null;
  for (const a of cols) {
    const rest = cols.filter((c) => c !== a); let ok = 0, n = 0;
    for (const r of t.rows) { const va = toNumber(r[a]); const vs = rest.map((c) => toNumber(r[c])); if (va === null || vs.some((v) => v === null)) continue; n++; if (Math.abs(va - vs.reduce((s, v) => s + v, 0)) <= 1e-6 * Math.max(1, Math.abs(va))) ok++; }
    if (n >= 3 && ok / n >= 0.7) return a;
  }
  return null;
}

// ---------- 계획 세우기: 어느 열을 어떻게 볼지
export function plan(question, t0, meta = {}, opts = {}) {
  let t = t0, reshape = null;
  const melted = meltMonths(t0);
  if (melted) { t = melted; reshape = 'months'; }
  const d = describe(t);
  const q = String(question);
  const qtext = q.replace(/\s+/g, '');

  // 1) 행 조건: 질문에 나온 범주 값(예: 입장객, 대정읍)
  const filters = [];
  const consumed = new Set();
  t.columns.forEach((c, i) => {
    if (!(d.roles[i] === 'dim' || d.roles[i] === 'text')) return;
    if (c.uniq > 400) return;
    const vals = [...new Set(t.rows.map((r) => String(r[i] ?? '').trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    const skip = /^(합계|전체|계|소계|기타)$/;
    const toks = q.split(/\s+/);
    const hit = vals.find((v) => v.length >= 2 && qtext.includes(v.replace(/\s+/g, '')) && !skip.test(v))
      || vals.find((v) => { const s = v.replace(/\s+/g, '').replace(/(시|군|구|읍|면|동)$/, ''); return s !== v.replace(/\s+/g, '') && s.length >= 2 && s !== '제주' && qtext.includes(s) && !skip.test(v); })
      || vals.find((v) => v.length === 1 && toks.some((x) => x.startsWith(v) && /^(는|은|가|이|를|을|의|도|만|와|과|로)?$/.test(x.slice(1))))
      || vals.find((v) => { const s = v.replace(/\s+/g, '').replace(/[(（][^)）]*[)）]/g, '').replace(/(량|수|액|률|율)$/, ''); return s.length >= 2 && s !== v && qtext.includes(s) && !skip.test(v); });   // ‘생산’ → ‘생산량’, ‘최고기온’ → ‘최고기온(℃)’
    if (hit) { filters.push({ col: i, name: c.name, value: hit }); words(hit).forEach((w) => consumed.add(w)); consumed.add(hit); }
  });
  const topic = new Set(words(t0.title || ''));   // 데이터 제목에 있는 낱말(예: ‘감귤’)은 어느 열을 보라는 뜻이 아니라 주제어
  let qw = new Set(words(q).filter((w) => !consumed.has(w) && !topic.has(w)));
  const topicOnly = qw.size === 0 && filters.length === 0;   // 질문에 제목 낱말밖에 없으면(예: ‘감귤 생산’) 그 낱말로 열을 고른다
  if (topicOnly) qw = new Set(words(q).filter((w) => !consumed.has(w)));
  for (const w of [...qw]) for (const e of EQUIV[w] || []) if (!topic.has(e)) qw.add(e);
  for (const w of [...qw]) { const vs = w.replace(/(된|되는|했던|하는|한|인|있는|없는)$/, ''); if (vs !== w && vs.length >= 2) qw.add(vs); }   // ‘등록된’ → ‘등록’
  for (const [re, ws] of ADJ_MEASURE) if (re.test(q)) ws.forEach((w) => qw.add(w));   // ‘제일 긴 곳’ → 연장·길이   // 관광객 ↔ 입장객 처럼 같은 대상을 가리키는 말

  // 2) 측정 열: 질문 낱말과 열 이름이 겹치는 숫자 열(여러 개 가능). 가로로 펼친 표는 '값'
  let measures = [], allMeasures = false;
  if (reshape) measures = [t.header.indexOf('값')];
  else {
    const scored = [];
    t.columns.forEach((c, i) => {
      if (d.roles[i] !== 'measure') return;
      const cw = colWords(c.name); let sc = 0;
      for (const w of cw) { if (topic.has(w) && !qw.has(w) && !topicOnly) continue; if (qw.has(w) || (qtext.includes(w) && !consumed.has(w) && !topic.has(w))) sc += w.length; else for (const x of qw) if (x.length >= 2 && (w.includes(x) || x.includes(w))) sc += Math.min(w.length, x.length) * 0.6; }
      if (qtext.includes(c.name.replace(/\s+/g, ''))) sc += 5;
      if (sc > 0) scored.push([i, sc]);
    });
    scored.sort((a, b) => b[1] - a[1]);
    const top = scored[0]?.[1] ?? 0;
    const numeric = t.columns.map((c, i) => i).filter((i) => d.roles[i] === 'measure');
    measures = scored.filter(([, s]) => s >= Math.max(1.2, top * 0.6)).map(([i]) => i);
    if (measures.length > 1) {
      const isLevel = (i) => LEVEL_NAME.test(t.header[i]);
      const lv = measures.filter(isLevel), qt = measures.filter((i) => !isLevel(i));
      if (lv.length && qt.length) measures = /(률|율|비율|퍼센트|%|지수|평균|가격)/.test(q) ? lv : qt;   // ‘실업자’ 는 사람 수 열만, ‘실업률’ 은 비율 열만
    }
    // 같은 점수로 여러 열이 걸리면 질문 글자(두 글자씩)와 가장 많이 겹치는 열만
    if (measures.length > 1 && !measures.some((i) => qtext.includes(t.header[i].replace(/\s+/g, '')))) { const bg = (s) => { const a = new Set(); for (let k = 0; k < s.length - 1; k++) a.add(s.slice(k, k + 2)); return a; }; const qb = bg(qtext); const ov = (i) => [...bg(t.header[i].replace(/\s+/g, ''))].filter((x) => qb.has(x)).length; const best = Math.max(...measures.map(ov)); const keep = measures.filter((i) => ov(i) === best); if (best > 0 && keep.length < measures.length) measures = keep; }
    // ‘당월’ 열과 ‘당해누계’ 열이 함께 걸리면 누계 열은 더하면 중복이므로 뺀다(질문에 ‘누계·누적’이 있으면 그대로)
    if (measures.length > 1 && !/(누계|누적)/.test(q)) { const nonCum = measures.filter((i) => !/(누계|누적)/.test(t.header[i])); if (nonCum.length && nonCum.length < measures.length) measures = nonCum; }
    // 질문 낱말로 열 이름이 빠짐없이 설명되는 열(‘귀촌인(명)’)과, 질문에 없는 낱말이 더 붙은 열(‘귀촌인 동반가구원(명)’)이 함께 걸리면 앞의 것만 쓴다
    if (measures.length > 1) {
      const unmatched = (i) => colWords(t.header[i]).filter((w) => !(qw.has(w) || qtext.includes(w))).length;
      const full = measures.filter((i) => unmatched(i) === 0);
      if (full.length && full.length < measures.length) measures = full;
    }
    if (measures.length > 1 && !/(최소|최대|최저|최고)/.test(q)) { const avgOnly = measures.filter((i) => /^평균/.test(t.header[i])); if (avgOnly.length && avgOnly.length < measures.length && measures.every((i) => /^(최소|평균|최대|최저|최고)/.test(t.header[i]) || avgOnly.includes(i))) measures = avgOnly; }
    // 필터가 '구분: 생산량' 처럼 값을 이미 가리키는데 질문 낱말이 열 이름 하나에만 우연히 겹치면(예: ‘감귤’) 같은 종류 열 전체를 쓴다
    const unitClass = (n) => (/(가격|단가|금액|요금|비용|수입|매출|[최평]?[소대균]가$|원\)|원$)/.test(n) ? 'money' : LEVEL_NAME.test(n) ? 'level' : /(건수|횟수|번호|거래단량|규격)/.test(n) ? 'other' : 'qty');
    const homogeneous = new Set(numeric.map((i) => unitClass(t.header[i]))).size === 1;   // 가격 열과 수량 열을 한꺼번에 더하지 않는다
    if (homogeneous && filters.length && numeric.length >= 3 && measures.length < numeric.length && top === 0 && (measures.length === 0 || !measures.every((i) => qtext.includes(t.header[i].replace(/\s+/g, ''))))) { measures = numeric; allMeasures = true; const tot = totalColumn(t, numeric); if (tot !== null) { measures = [tot]; allMeasures = false; } }
    if (!measures.length) { if (numeric.length === 1) measures = numeric; else if (numeric.length >= 1 && meta.defaultMeasure) { const k = t.header.indexOf(meta.defaultMeasure); if (k >= 0) measures = [k]; } }
  }
  if (!measures.length) return { ok: false, why: '질문과 맞는 숫자 열을 찾지 못했어요', table: t };

  // 3) 시간
  let tmin = null, tmax = null;
  if (d.ycol >= 0 || d.ymcol >= 0) for (let r = 0; r < t.rows.length; r++) { const p = timeOfRow(t, d, r); if (!p) continue; if (!tmin || p.y < tmin.y || (p.y === tmin.y && (p.m || 0) < (tmin.m || 0))) tmin = p; if (!tmax || p.y > tmax.y || (p.y === tmax.y && (p.m || 0) > (tmax.m || 0))) tmax = p; }
  const time = parseTime(q, tmax, opts.today || new Date());
  let agg = detectAgg(q);
  const k = (q.match(/상위\s*(\d+)/) || q.match(/TOP\s*(\d+)/i) || [])[1];
  const byMonth = /월별|달별|매달|매월/.test(q) || (/(가장|제일|최대|최소|최고|최저)/.test(q) && /(달|몇\s*월|언제)/.test(q) && !/(해는|연도|몇\s*년)/.test(q));
  const byYear = /연도별|해마다|매년|해별|년별/.test(q) || (/연간/.test(q) && time.years.length !== 1);   // ‘2019년 연간 합계’는 추이가 아니라 그 해의 한 값
  // 묶는 열: ‘~별’ 또는 ‘곳·지점·지역·어디’ 같은 장소 질문
  let byCol = (() => { const m = q.match(/(\S+?)별/); if (!m) return null; const key = m[1]; const i = t.columns.findIndex((c, idx) => d.roles[idx] === 'dim' && (c.name.includes(key) || key.includes(c.name.replace(/명$/, '')))); return i >= 0 ? i : null; })();
  if (byCol === null && /(곳|지점|지역|장소|어디|어느)/.test(q)) {
    const i = t.columns.findIndex((c, idx) => (d.roles[idx] === 'dim' || d.roles[idx] === 'text') && /(지점|지역|장소|읍면동|시군구|명$)/.test(c.name) && c.uniq > 1 && !filters.some((f) => f.col === idx));
    if (i >= 0) byCol = i;
    else {
      const place = /(읍|면|동|리|시|군|구|역|포구|해변|공원|폭포|오름|마을|센터|학교|병원)$/;
      const j = t.columns.findIndex((c, idx) => (d.roles[idx] === 'dim' || d.roles[idx] === 'text') && c.uniq > 1 && !filters.some((f) => f.col === idx) && (() => { const vs = [...new Set(t.rows.map((r) => String(r[idx] ?? '').trim()).filter(Boolean))]; return vs.length >= 3 && vs.filter((v) => place.test(v)).length / vs.length >= 0.6; })());
      if (j >= 0) byCol = j;
    }
  }
  const level = measures.every((i) => LEVEL_NAME.test(t.header[i])) || (filters.length > 0 && filters.every((f) => LEVEL_NAME.test(f.value)));
  let levelNote = null;
  if (level && agg === 'sum') { agg = 'avg'; levelNote = '이 값은 더해서는 뜻이 없는 수준 값이라 평균으로 계산했어요'; }
  const mode = agg === 'avg' ? 'avg' : level ? (agg === 'argmin' ? 'min' : agg === 'argmax' || agg === 'topk' ? 'max' : 'avg') : 'sum';

  const measureHit = reshape ? filters.length > 0 : !allMeasures && measures.length > 0 && measures.some((i) => colWords(t.header[i]).some((w) => qw.has(w) || qtext.includes(w) || [...qw].some((x) => x.length >= 2 && w.length >= 2 && (w.includes(x) || x.includes(w)))));
  const zeroMissing = hasMissingNote(t, d);
  return { ok: true, question: q, table: t, reshape, desc: d, zeroMissing, measureHit, allMeasures, measures, filters, time, agg, k: k ? +k : 5, byMonth, byYear, byCol, tmin, tmax, level, levelNote, mode, unit: unitOf(t, measures, filters, meta) };
}

function unitOf(t, measures, filters, meta) {
  const hit = (meta.unitBy || []).find((u) => filters.some((f) => f.value === u.when));
  if (hit) return hit.unit;
  if (meta.unit) return meta.unit;
  const names = measures.map((i) => t.header[i]);
  const found = new Set();
  for (const n of names) { const m = n.match(/[(（]([^)）]+)[)）]/); if (m) { const u = m[1].replace(/_/g, '/'); if (UNITS.has(u)) found.add(u); } if (/\(명\)|명$/.test(n)) found.add('명'); }
  return found.size === 1 ? [...found][0] : '';
}

// ---------- 계산
const rowMatches = (p, r) => {
  const t = p.table;
  for (const f of p.filters) if (String(t.rows[r][f.col] ?? '').trim() !== f.value) return false;
  const tm = timeOfRow(t, p.desc, r);
  if (p.time.years.length || p.time.months.length || p.time.recentN) {
    if (!tm) return false;
    if (p.time.years.length && !p.time.years.includes(tm.y)) return false;
    if (p.time.months.length && !(tm.m && p.time.months.includes(tm.m))) return false;
    if (p.time.recentN && p.tmax) {
      if (p.time.recentN.unit === '년') { if (tm.y <= p.tmax.y - p.time.recentN.n) return false; }
      else { const idx = (tm.y * 12 + (tm.m || 1)), top = p.tmax.y * 12 + (p.tmax.m || 1); if (idx <= top - p.time.recentN.n) return false; }
    }
  }
  return true;
};

const reduceBy = (mode, vals) => (mode === 'max' ? Math.max(...vals) : mode === 'min' ? Math.min(...vals) : mode === 'avg' ? vals.reduce((s, x) => s + x, 0) / vals.length : vals.reduce((s, x) => s + x, 0));

export function execute(p) {
  const t = p.table;
  const cells = [], items = [], skipped = [];
  for (let r = 0; r < t.rows.length; r++) {
    if (!rowMatches(p, r)) continue;
    const tm = timeOfRow(t, p.desc, r);
    for (const ci of p.measures) {
      const v = toNumber(t.rows[r][ci]);
      if (v === null) continue;
      if (p.zeroMissing && v === 0) { skipped.push({ row: t.melted ? t.origin[r].row : r, col: t.melted ? t.origin[r].col : ci, tm, name: t.header[ci] }); continue; }   // 0 은 ‘조사 안 함’ 표시일 수 있어 값으로 쓰지 않는다
      const src = t.melted ? t.origin[r] : { row: r, col: ci };
      cells.push({ row: src.row, col: src.col, value: v });
      items.push({ r, ci, v, tm, key: t.header[ci], cell: src, dim: p.byCol != null ? String(t.rows[r][p.byCol]).trim() : null });
    }
  }
  const out = { plan: p, cells, count: items.length, items, skipped };
  if (!items.length) { out.kind = 'empty'; return out; }
  const group = (keyFn, labelFn = (k) => String(k)) => { const m = new Map(); for (const it of items) { const k = keyFn(it); if (k === null || k === undefined) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(it); } return [...m.entries()].map(([k, a]) => ({ key: k, label: labelFn(k), value: reduceBy(p.mode, a.map((x) => x.v)), n: a.length, items: a })); };
  const hasTime = items.some((x) => x.tm);
  const periodGroup = () => {
    if (p.byMonth || (p.time.years.length === 1 && !p.byYear && p.agg === 'trend')) return group((x) => (x.tm ? x.tm.y * 100 + (x.tm.m || 0) : null), (k) => (k % 100 ? `${Math.floor(k / 100)}년 ${k % 100}월` : `${Math.floor(k / 100)}년`)).sort((a, b) => a.key - b.key);
    return group((x) => (x.tm ? x.tm.y : null), (k) => `${k}년`).sort((a, b) => a.key - b.key);
  };
  const dimGroup = () => group((x) => x.dim ?? x.key);
  const askYear = /(해는|연도|몇\s*년|어느\s*해|언제)/.test(p.question || '');
  // 무엇으로 묶을지: 장소 질문은 열, '해·달' 질문과 항목 전체 합계는 시간, 여러 열을 비교하는 질문은 열 이름
  const axis = () => (p.byCol != null ? 'dim' : hasTime && (askYear || p.byMonth || p.byYear || p.allMeasures || p.measures.length === 1 || p.agg === 'trend') ? 'period' : p.measures.length > 1 ? 'key' : hasTime ? 'period' : 'key');
  const grouped = (ax) => (ax === 'dim' ? dimGroup() : ax === 'period' ? periodGroup() : group((x) => x.key));
  const primary = () => grouped(out.groupBy = axis());
  switch (p.agg) {
    case 'argmax': case 'argmin': case 'topk': {
      const g = primary();
      const sorted = [...g].sort((a, b) => (p.agg === 'argmin' ? a.value - b.value : b.value - a.value));
      out.series = g; out.ranked = sorted.slice(0, p.agg === 'topk' ? p.k : 1); out.kind = p.agg; out.value = sorted[0].value; out.label = sorted[0].label; break;
    }
    case 'avg': { out.kind = 'avg'; out.value = reduceBy('avg', items.map((x) => x.v)); out.n = items.length; if (hasTime && (p.byYear || p.byMonth)) { out.series = periodGroup(); out.groupBy = 'period'; } break; }
    case 'trend': out.series = periodGroup(); out.groupBy = 'period'; out.kind = 'trend'; out.value = reduceBy(p.mode, items.map((x) => x.v)); break;
    case 'growth': {
      const g = periodGroup(); out.groupBy = 'period';
      if (g.length >= 2) { const a = g[0], b = g[g.length - 1]; out.kind = 'growth'; out.series = g; out.from = a; out.to = b; out.value = a.value === 0 ? null : ((b.value - a.value) / a.value) * 100; }
      else { out.kind = 'sum'; out.value = reduceBy(p.mode, items.map((x) => x.v)); out.note = '비교할 두 시점이 없어 한 값으로 답했어요'; }
      break;
    }
    case 'compare': {
      const ax = p.measures.length > 1 && !p.allMeasures ? 'key' : (p.time.years.length > 1 ? 'period' : (p.byCol != null ? 'dim' : 'period'));
      const g = grouped(out.groupBy = ax);
      out.kind = 'compare'; out.series = g; out.value = reduceBy(p.mode, items.map((x) => x.v)); break;
    }
    default: {
      out.kind = 'sum'; out.value = reduceBy(p.mode, items.map((x) => x.v));
      if ((p.byYear || p.byMonth) && hasTime) { out.series = periodGroup(); out.groupBy = 'period'; out.kind = 'trend'; }
      else if (p.byCol != null) { out.series = dimGroup(); out.groupBy = 'dim'; }
      else if (p.measures.length > 1 && !p.allMeasures) { out.series = group((x) => x.key); out.groupBy = 'key'; }
    }
  }
  return out;
}

// ---------- 쉬운 말 답
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('ko-KR') : (Math.round(n * 100) / 100).toLocaleString('ko-KR'));
export function scopeLabel(p) {
  const bits = [];
  for (const f of p.filters) bits.push(f.value);
  const tm = p.time; if (tm.years.length) bits.push(tm.years.length > 1 ? `${tm.years[0]}~${tm.years.at(-1)}년` : `${tm.years[0]}년`);
  if (tm.months.length) bits.push(tm.months.length === 12 ? '' : tm.months.length > 3 && tm.season.length ? tm.season.join('·') : `${tm.months.join('·')}월`);
  if (p.measures.length && !p.reshape) bits.push(p.allMeasures ? '모든 항목' : p.measures.length > 2 ? `${p.table.header[p.measures[0]]} 등 ${p.measures.length}개 항목` : p.measures.map((i) => p.table.header[i]).join('·'));
  return bits.filter(Boolean).join(' ');
}
const OPS = { sum: '합계', avg: '평균', argmax: '가장 큰 것 찾기', argmin: '가장 작은 것 찾기', topk: '상위 순위', growth: '두 시점 증감률', trend: '기간별 추이', compare: '묶음별 비교' };
export const opLabel = (p) => (p.mode === 'max' ? '최댓값' : p.mode === 'min' ? '최솟값' : OPS[p.agg] || p.agg);
// 질문을 이렇게 이해했다는 한 줄(사용자가 답을 믿기 전에 눈으로 확인할 수 있게)
export function understood(p, title = '') {
  const t = p.table;
  const cols = p.reshape ? '월별 값(1~12월 칸)' : p.allMeasures ? '이 표의 모든 숫자 열' : p.measures.map((i) => t.header[i]).slice(0, 4).join('·') + (p.measures.length > 4 ? ` 외 ${p.measures.length - 4}개` : '');
  const tm = p.time; const per = [tm.years.length ? (tm.years.length > 1 ? `${tm.years[0]}~${tm.years.at(-1)}년` : `${tm.years[0]}년`) : '', tm.months.length && tm.months.length < 12 ? `${tm.months.join('·')}월` : '', tm.recentN ? `최근 ${tm.recentN.n}${tm.recentN.unit}` : ''].filter(Boolean).join(' ') || '자료 전체 기간';
  return { data: title || t.title, columns: cols, filters: p.filters.map((f) => `${f.name}=${f.value}`), period: per, op: opLabel(p) };
}
export function compose(res, notes = []) {
  const p = res.plan; const u = p.unit || ''; const sc = scopeLabel(p) || (p.table.title ? `「${String(p.table.title).slice(0, 26)}」` : '선택한 값');
  if (res.kind === 'empty' && res.skipped && res.skipped.length) return `${sc}: 자료에는 0 으로 적혀 있지만 이 표의 비고에 ‘미조사’ 표시가 있어 0 은 ‘조사하지 않음’일 가능성이 커요. 그래서 값으로 쓰지 않았습니다(해당 칸 ${res.skipped.length}개).`;
  if (res.kind === 'empty') return `조건에 맞는 값이 없어요(${sc}). 기간이나 이름을 바꿔 다시 물어봐 주세요.`;
  const V = (n) => `${fmt(n)}${u}`;
  const tail = (p.levelNote && res.count !== 1 ? ` (${p.levelNote})` : '') + notes.map((n) => ` ※ ${n}`).join('');
  switch (res.kind) {
    case 'argmax': case 'argmin': return `${sc ? sc + ' 중 ' : ''}${res.kind === 'argmax' ? (p.level ? '가장 높은(큰) 것은' : '가장 많은(큰) 것은') : (p.level ? '가장 낮은(작은) 것은' : '가장 적은(작은) 것은')} ${res.label}(${V(res.value)})입니다.${tail}`;
    case 'topk': return `${sc ? sc + ' ' : ''}상위 ${res.ranked.length}개: ${res.ranked.map((x, i) => `${i + 1}위 ${x.label} ${V(x.value)}`).join(', ')}.${tail}`;
    case 'avg': return res.n === 1 ? `${sc}: ${V(res.value)}입니다.${tail}` : `${sc}의 평균은 ${V(res.value)}입니다(값 ${res.n}개 기준).${tail}`;
    case 'growth': return res.value === null ? `${sc}: 처음 값이 0이라 증감률을 낼 수 없어요.` : `${sc}: ${res.from.label}(${V(res.from.value)})에서 ${res.to.label}(${V(res.to.value)})로 ${fmt(Math.abs(res.value))}% ${res.value >= 0 ? '늘었' : '줄었'}습니다.${tail}`;
    case 'trend': { const a = res.series[0], b = res.series.at(-1); const dir = !a || !b || a === b ? '' : b.value > a.value ? '전체적으로 늘었어요' : b.value < a.value ? '전체적으로 줄었어요' : '처음과 마지막이 같아요'; return `${sc}의 ${res.series.length}개 기간 추이입니다. ${res.series.length ? `처음 ${a.label} ${V(a.value)}, 마지막 ${b.label} ${V(b.value)}${dir ? ` — 처음과 마지막만 비교하면 ${dir}` : ''}.` : ''}${tail}`; }
    case 'compare': { const top = res.series.length >= 2 ? [...res.series].sort((a, b) => b.value - a.value)[0] : null; return `${sc} 비교: ${res.series.map((x) => `${x.label} ${V(x.value)}`).join(' / ')}.${top ? ` 가장 큰 쪽은 ${top.label}입니다.` : ''}${tail}`; }
    default: return `${sc}의 ${p.mode === 'sum' ? '합계' : '값'}는 ${V(res.value)}입니다.${res.note ? ' ' + res.note : ''}${tail}`;
  }
}
