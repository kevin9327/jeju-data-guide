// 질문 이해 점검 — 고른 데이터가 정말 이 질문의 대상인지 확인한다(답 수용 게이트).
// 1) keyTerms: 질문의 핵심 명사(한라산·탐방객·렌터카 …)만 뽑는다. 2) coverage: 그 말이 고른 표의 제목·열 이름·칸 값에 있는지 본다.
// 하나라도 없으면 ‘다른 데이터를 억지로 계산’하지 않고 거절·되묻기로 돌린다. 순수 함수, 외부 라이브러리 없음.
import { words } from './catalog.js';

// 질문의 틀을 만드는 말(무엇을 계산할지·시간·수량 표현) — 핵심 명사가 아니다
const FUNC_PART = /(몇|얼마|증감|연도|년도|연간|월간|월별|연별|상승|하락|올랐|내렸|올라|내려|시끄|붐비|비싼|싼|조용|많|적|높|낮|크|작|가장|제일|최대|최소|최고|최저|증가|감소|늘|줄|변화|변동|추이|합계|합쳐|평균|전체|총|최근|비교|순위|상위|하위|랭킹|알려|보여|궁금|있|없|달라|달라졌|차이|대비|비율|비중|전후|이후|이전|비해|비하여|수치|사람|분들|오른|내린|늘어난|줄어든|증가한|감소한|이래|동안|사이|때문|정도|대략|약|쯤|퍼센트|갔|왔|나온|나왔|나오|어느|어떤|무슨|어디|언제|누구|뭐|무엇|왜|지금|현재|요즘|계속|아직|벌써|다시|또|더|덜|너무|매우|아주|꽤|거의|전부|모두|각각|하나|둘|셋|이상|이하|초과|미만|넘|개수|갯수|대수|건수|횟수|수량|규모|크기|수준|상황|추세|흐름|동향|현황|통계|자료|정보|데이터|관련|대한|대해|관해|해당|같은|비슷|그|이|저|것|거|게|분|번|곳|군데|군데|가지|종류|항목)/g;
const VERBISH = /(야|나|니|까|요|죠|냐|네|어|아|지|다|고|서|며|면|데|던|든|라|래|자|해|줘|봐)$/;
const TIMEWORD = /^(올해|금년|작년|지난해|전년|재작년|내년|이번|지난|지난달|이번달|올|작|내|오늘|어제|내일|예전|옛날|과거|미래|앞으로|언젠가|코로나|팬데믹|이후|이전|최근|요새|연초|연말|상반기|하반기|봄|여름|가을|겨울|분기|월별|연도별|년도별|해마다|매년|매월|매달|연간|월간|일별|주별)$/;

// 같은 뜻으로 보아도 되는 말(질문어 → 자료에서 쓰는 말). 카탈로그 검색용 동의어보다 좁다 — 같은 대상을 가리킬 때만.
export const EQUIV = {
  관광객: ['입도객', '입장객', '방문객', '관람객', '탐방객'], 입도객: ['관광객'], 입장객: ['관람객', '방문객', '관광객'], 관람객: ['입장객', '방문객'], 방문객: ['입장객', '관람객', '관광객'],
  쓰레기: ['폐기물', '생활폐기물'], 폐기물: ['쓰레기'], 소음: ['환경소음'], 물가: ['소비자물가', '물가지수'], 감귤: ['귤', '노지감귤', '하우스감귤'],
  전기차: ['전기자동차', '전기차량'], 자동차: ['차량', '승용차'], 차량: ['자동차'], 취업자: ['취업', '고용'], 실업자: ['실업'], 인구: ['주민', '거주'], 출생: ['출생아'],
  병원: ['의료기관', '의원'], 승용차: ['승용'], 승합차: ['승합'], 화물차: ['화물'], 사망자: ['사망', '사망자수'], 귀촌한: ['귀촌인', '귀촌'], 귀농한: ['귀농인', '귀농'], 날씨: ['기상', '기후'], 기후: ['기상', '날씨'], 배출량: ['발생량', '배출'], 발생량: ['배출량'], 가격: ['단가', '평균가', '시세', '경락가'], 비싼: ['가격'], 와이파이: ['wifi', '무선인터넷'], 버스: ['시내버스', '노선버스'], 유기견: ['유기동물'], 강아지: ['개', '유기동물'], 고양이: ['묘', '유기동물'],
};

const SUFFIX = /(량|수|액|율|률|객|인|자)$/;
const strip = (w) => (w.length >= 3 && SUFFIX.test(w) ? w.slice(0, -1) : w);
const nrm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

// 질문에서 핵심 명사 후보를 뽑는다(조사 제거 후 틀 말·시간 말·동사형 제외). knownVocab(w) 가 참이면 카탈로그에 있는 말이므로 동사형 추정에서 보호한다.
export function keyTerms(q, knownVocab = () => false) {
  const out = [];
  for (let w of words(q)) {
    if (/^(수|명|개|대|해|년|달|월|곳|것|분|때|중|동안|사이|거|게|도|호|건|번|살|세|위|마리|톤|원)(은|는|이|가|을|를|도|만|의|에|에서|부터|까지|로|야|나|요|이야|인가|인가요|이에요|예요|이었어|였어)?$/.test(w)) continue;   // ‘수는’ ‘해가’ ‘년에’ ‘중에’ 처럼 조사가 붙어 남은 틀 말
    if (TIMEWORD.test(w)) continue;
    if (/^\d/.test(w)) continue;
    const m1 = !knownVocab(w) && w.match(/^([비눈꽃불])(은|는|이|가|을|를)$/);   // ‘비가’ ‘눈이’ = 한 글자 명사 + 조사
    if (m1) { out.push(m1[1]); continue; }
    const rest = w.replace(FUNC_PART, '');
    if (rest.length < 2) continue;                                      // 틀 말만으로 이루어진 어절(‘달라졌나’ ‘몇개야’)
    if (VERBISH.test(w) && w.length >= 3 && !knownVocab(w)) continue;   // ‘달라졌나’ ‘늘고’ 같은 서술어
    if (w.length - rest.length >= 2 && rest.length < 3 && !knownVocab(w)) continue;   // 틀 말이 두 글자 이상 붙어 남는 낱말이 짧으면 서술 표현
    out.push(w);
  }
  return [...new Set(out)];
}

const textCache = new WeakMap();
const tokCache = new WeakMap();
const tokensOf = (parts) => new Set(parts.join(' ').normalize('NFKC').toLowerCase().split(/[^0-9a-z가-힣]+/).filter(Boolean));
// 표가 ‘무엇에 대한 자료인지’ 말해 주는 글자: 제목 + 열 이름 + 글자 열의 값(최대 4000개)
export function tableText(t, title = '') {
  if (textCache.has(t)) return textCache.get(t);
  const src = t.melted ? t.source : t;
  const parts = [title || t.title || '', ...src.header];
  let budget = 4000;
  src.columns.forEach((c) => {
    if (c.type === 'number' || c.type === 'empty' || c.type === 'date' || budget <= 0) return;
    {   // 열 값이 길면(리뷰·설명 같은 자유 글) 그 안의 낱말로 ‘이 표가 그것에 대한 자료’라고 보지 않는다
      if (/(내용|contents?|comment|review|리뷰|후기|설명|비고|memo|text|desc)/i.test(c.name)) return;
      const sample = src.rows.slice(0, 300).map((r) => String(r[c.i] ?? '').trim()).filter(Boolean); const avg = sample.reduce((s, x) => s + x.length, 0) / Math.max(1, sample.length);
      if (c.uniq > 400 || avg > 20) return;
    }
    const seen = new Set();
    for (const r of src.rows) { const v = String(r[c.i] ?? '').trim(); if (v && !seen.has(v)) { seen.add(v); parts.push(v); if (--budget <= 0 || seen.size >= 1500) break; } }
  });
  const s = nrm(parts.join(' '));
  textCache.set(t, s); tokCache.set(t, tokensOf(parts));
  return s;
}

// 핵심 명사별로 표 안에서 찾았는지 확인
export function coverage(terms, t, title = '') {
  const text = tableText(t, title);
  const covered = [], missing = [];
  for (const w of terms) {
    const vs = w.replace(/(된|되는|했던|하는|한|인|있는|없는|되어|된다|하고|해서)$/, '');   // ‘등록된’ → ‘등록’
    const bare = w.replace(/(지수|지표)$/, '');   // ‘소비자물가지수’ → ‘소비자물가’
    const forms = nrm(w).length < 2 ? [] : [nrm(w), nrm(strip(w)), nrm(vs), nrm(strip(vs)), nrm(bare), ...(EQUIV[w] || EQUIV[strip(w)] || []).map(nrm)].filter((x) => x.length >= 2);
    const toks = tokCache.get(t);
    const one = nrm(w).length === 1;   // 한 글자 명사(비·눈·불)는 낱말로 따로 있어야 인정(‘비가림’ 속의 ‘비’ 는 아님)
    const hit = one ? toks.has(nrm(w)) : forms.some((f) => text.includes(f));
    (hit ? covered : missing).push(w);
  }
  return { covered, missing };
}

// 세는 단위 말(마리·대)이 가리키는 분야 — 이 표 글자에 그 분야 낱말이 하나도 없으면 ‘다른 것을 센 표’라서 거절한다
const UNIT_DOMAIN = [
  { re: /마리|두수/, name: '마리(동물)', dom: /(동물|가축|두수|마리|개체|유기|사육|반려|어획|가금|돼지|조류|어류|곤충)/, boost: '동물 두수' },
  { re: /몇\s*대|대수/, name: '대(차량·기계)', dom: /(차량|자동차|버스|택시|대수|주차|렌터카|선박|항공기|전기차|전기자동차|이륜차|기계|장비)/, boost: '' },
];
export function unitCheck(q, t, title = '') {
  const text = tableText(t, title);
  for (const u of UNIT_DOMAIN) if (u.re.test(q) && !u.dom.test(text)) return u.name;
  return null;
}
export const queryBoost = (q) => UNIT_DOMAIN.filter((u) => u.re.test(q) && u.boost).map((u) => u.boost).join(' ');

// 카탈로그 제목이 핵심어를 모두 담는지(로그인이 필요해 파일은 없지만 허브에는 있는 자료 안내용)
export function titleCovers(terms, title) {
  const text = nrm(title);
  return terms.length > 0 && terms.every((w) => [nrm(w), nrm(strip(w)), ...(EQUIV[w] || []).map(nrm)].filter((x) => x.length >= 2).some((f) => text.includes(f)));
}

// ---------- 질문 자체가 지금 지원하지 않거나 되물어야 하는 경우(데이터를 보기 전에 가려낸다)
const RULES = [
  { id: 'recommend', re: /(추천|가볼\s*만|좋은\s*곳|어디가\s*좋|뭐가\s*좋|맛있는)/, msg: '추천은 사람마다 기준이 달라 숫자로 답할 수 없어요. “방문객이 가장 많은 곳은?”처럼 기준을 숫자로 정해서 물어봐 주세요.' },
  { id: 'delta', re: /(제일|가장)\s*(많이\s*)?(오른|올랐|늘어난|늘었|증가한|줄어든|줄었|감소한|내린|내렸|떨어진|상승한|하락한)/, msg: '‘가장 많이 오른(늘어난) 해’는 해마다의 변화량을 서로 비교해야 해서 아직 지원하지 않아요. 두 해를 정해 “2014년 대비 2020년 증감률”처럼 물어봐 주세요.' },
  { id: 'relmonth', re: /(지난\s*달|이번\s*달|저번\s*달|지난\s*주|이번\s*주|어제|오늘|요즘|최근에)/, msg: '‘지난달·이번 주·어제’처럼 오늘 기준의 시점은 이 자료(수집일 기준)로 알 수 없어요. “2022년 7월”처럼 연·월을 알려 주세요.' },
  { id: 'why', re: /(왜|이유|원인|때문에|영향|상관|관계가|탓)/, msg: '원인·이유·상관관계는 숫자로만 알 수 있는 일이 아니라서 답하지 않아요. 대신 “몇 년에 얼마였나”처럼 숫자를 묻는 질문은 계산해 드려요.' },
  { id: 'predict', re: /(예측|전망|앞으로|내년|향후|미래에|내일|모레|다음\s*주|다음\s*달|다음\s*해)/, msg: '미래 예측은 하지 않아요. 지금까지의 실제 자료로 추이를 계산해 드릴 수는 있어요.' },
  { id: 'share', re: /(비중|점유율|몇\s*퍼센트를|(?<![가-힣])비율이|몇\s*%를)/, unless: /(가장|제일|최대|최고|상위|1위)/, msg: '비중·점유율은 “전체 대비 부분”을 나눠야 해서 지금은 지원하지 않아요. 부분과 전체를 각각 물어보시면 숫자는 알려 드려요.' },
  { id: 'count', re: /(몇\s*(개(?!월)|곳|군데)|개수|갯수)/, msg: '“몇 개 있나(개수 세기)”는 아직 지원하지 않아요. 표의 값을 더하거나 비교하는 질문(합계·평균·최댓값·증감률·추이)을 해 주세요.' },
  { id: 'covid', re: /(코로나|팬데믹|메르스|태풍\s*전후|전후로)/, msg: '“코로나 전후”처럼 기준 시점이 말로만 있으면 어느 해와 어느 해를 비교할지 정할 수 없어요. 예: “2019년 대비 2021년 증감률”처럼 연도를 알려 주세요.' },
];
export function precheck(q) {
  for (const r of RULES) if (r.re.test(q) && !(r.unless && r.unless.test(q))) return { id: r.id, msg: r.msg };
  return null;
}


// ---------- 계산이 끝난 뒤 ‘이 답이 질문에 정말 맞는가’ 점검(계산이 맞아도 질문과 다른 것을 센 답을 막는다)
const ASK_WHEN = /(가장|제일|최대|최소|최고|최저)[^?？]{0,14}(해|연도|년도|시기|달|월)(은|는|이|가)?\s*(언제|어느|[?？]|$)/;
const PERIOD_LABEL = /^(\d{4}|\d{1,2}월|\d{4}[-./]\d)/;
export function fitCheck(q, p, res) {
  const names = p.measures.map((i) => p.table.header[i]);
  const rank = p.agg === 'argmax' || p.agg === 'argmin' || p.agg === 'topk';
  // 1) 순위 질문인데 고른 숫자 열 이름이 질문의 말과 하나도 안 맞으면(예: ‘사람이 제일 많이 온 해’ → 거리(km)) 엉뚱한 열이다
  if (rank && !p.allMeasures && !p.measureHit && !p.reshape) return `질문이 묻는 항목과 이름이 맞는 숫자 열을 이 표에서 찾지 못했어요(가장 가까운 열은 ‘${names.slice(0, 2).join('·')}’뿐). 엉뚱한 열로 순위를 매기지 않으려고 답하지 않습니다. 항목 이름을 넣어 다시 물어봐 주세요.`;
  if (res.kind === 'argmax' || res.kind === 'argmin') {
    // 2) ‘어느 해(달)’를 묻는데 이 표의 결과가 해(달)별이 아닌 경우
    if (ASK_WHEN.test(q) && !PERIOD_LABEL.test(String(res.label))) return `‘어느 해(달)’인지 묻는 질문인데, 이 표로 찾은 결과는 해(달)별 값이 아니라 ‘${res.label}’ 같은 항목별 값이에요. 해마다 값을 비교하려면 연도 열이 있는 자료가 필요해서 답하지 않습니다.`;
    // 3) 가장 큰 것을 찾았는데 무엇이 큰지 알려 줄 이름 열이 없는 경우(답이 열 이름뿐)
    if (p.measures.length === 1 && String(res.label) === names[0]) return `가장 큰(작은) 값은 찾았지만, 그것이 어느 품목·지역·해의 값인지 구분해 줄 이름 열이 이 표에 없어요. 무엇을 기준으로 비교할지 알 수 없어 답하지 않습니다.`;
  }
  // 4) ‘A가 B보다’ 비교인데 두 대상이 모두 조건으로 잡히지 않은 경우(예: ‘제주가 서울보다’ → 서울 자료 없음)
  if (/보다/.test(q) && p.filters.length < 2 && p.time.years.length < 2) return `‘A가 B보다’처럼 두 대상을 비교하는 질문이에요. 그런데 이 표에서 두 대상을 모두 찾지 못했어요(찾은 조건 ${p.filters.length}개). 한쪽만으로 계산하면 비교가 되지 않아 답하지 않습니다. 각각 따로 물어봐 주세요.`;
  return null;
}
