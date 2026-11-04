// 카탈로그 탐색(Tool: search_catalog) — 제주데이터허브 공개 카탈로그 1,259종(제목·설명·분야·기간·제공처·갱신)에서 질문에 맞는 데이터를 고른다.
// 순수 함수 모음(브라우저·Node 공용), 외부 라이브러리 없음. LLM 없이 규칙(어절+글자쌍+동의어)으로 동작하고, 왜 골랐는지(일치한 낱말)를 함께 돌려준다.

// 질문에서 흔한 말 → 카탈로그에서 쓰는 말(제주 데이터에 맞춘 동의어)
export const SYNONYMS = {
  관광객: ['입도객', '입장객', '방문객', '관광', '여행'], 여행객: ['입도객', '관광', '방문객'], 방문객: ['입장객', '입도객', '관광'], 입장객: ['방문객', '관광'],
  쓰레기: ['폐기물', '생활폐기물', '배출'], 폐기물: ['쓰레기', '배출'],
  소음: ['환경소음', '소음측정'], 시끄럽: ['소음'],
  물가: ['소비', '가격', '소비자물가'], 가격: ['시세', '거래', '단가'], 시세: ['가격', '거래'],
  농산물: ['농축수산', '품종', '도매', '거래'], 감귤: ['귤', '과일', '농산물'], 마늘: ['농산물', '품종'],
  일자리: ['고용', '취업', '노동'], 취업: ['고용', '일자리'], 고용: ['일자리', '취업'],
  유동인구: ['생활인구', '인구', '이동'], 사람들: ['인구', '유동인구'],
  와이파이: ['wifi', '공공와이파이', 'ap'], 전기차: ['전기', '충전', '이륜차'], 충전: ['전기차'],
  병원: ['의료', '의원', '보건', '의료기관'], 약국: ['의약', '보건'], 의료: ['병원', '보건'],
  반려동물: ['유기동물', '동물'], 강아지: ['유기동물', '동물'], 유기견: ['유기동물'],
  숙박: ['호텔', '펜션', '관광숙박'], 맛집: ['음식점', '식당'], 식당: ['음식점'], 카페: ['음식점', '휴게'],
  검색: ['검색어', '트렌드'], 인기: ['트렌드', '검색어'], 트렌드: ['검색어', '인기'],
  오름: ['오름'], 해수욕장: ['해변', '관광'], 날씨: ['기상', '기온'], 기온: ['기상', '날씨'], 비: ['강수', '기상'],
  교통: ['버스', '도로', '교통량', '통행'], 버스: ['교통', '대중교통'], 사고: ['교통사고', '안전'], 범죄: ['치안', '안전'], 화재: ['소방', '안전'],
  학교: ['교육', '학생'], 학생: ['교육', '학교'], 아이: ['어린이', '영유아', '보육'], 어린이집: ['보육', '영유아'],
  소상공인: ['상권', '자영업', '경기동향'], 상권: ['소상공인', '업종', '유동인구'], 경기: ['경기동향', '소상공인'],
  수산물: ['어획', '수산', '해양수산'], 어획: ['수산물'], 건축: ['건축물', '주택'], 주택: ['건축물', '부동산'], 땅값: ['공시지가', '부동산'],
};

const JOSA = /(이랑|하고|에서|에게|으로|까지|부터|보다|처럼|만큼|이나|이며|에는|에도|으로서|이다|입니다|인가요|인지|일까|나요|은|는|이|가|을|를|의|에|와|과|도|로)$/;
const STOP = new Set(['얼마나', '얼마', '어떻게', '어때', '알려', '알려줘', '보여', '보여줘', '있어', '있나', '있는', '그리고', '그런데', '되나요', '되는지', '많았던', '해는', '달은', '높았던', '낮았던', '컸던', '작았던', '적었던', '얼마였', '몇명',  '대비', '올랐어', '올랐나요', '늘었어', '줄었어', '어땠어', '어때요', '궁금해', '궁금합니다', '알려주세요', '말해줘', '찾아줘', '있나요', '어떤', '어디', '언제', '무엇', '가장', '많은', '많이', '적은', '몇개', '얼마나요', '제주', '제주도', '제주특별자치도', '데이터', '정보', '현황', '통계']);

export const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^0-9a-z가-힣\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function words(s) {
  const out = [];
  for (const w0 of norm(s).split(' ')) {
    if (!w0) continue;
    let w = w0;
    { const m = w.match(JOSA); if (m && w.length - m[0].length >= 2) w = w.slice(0, w.length - m[0].length); }   // 조사는 한 번만(‘물가가’→‘물가’)
    if (w.length >= 2 && !/^[0-9]/.test(w) && !STOP.has(w)) out.push(w);
  }
  return out;
}
const bigrams = (w) => { const a = []; for (let i = 0; i < w.length - 1; i++) a.push(w.slice(i, i + 2)); return a; };

export function expandQuery(q) {
  const base = words(q);
  const exp = new Map();   // 낱말 → 가중치
  for (const w of base) {
    exp.set(w, Math.max(exp.get(w) || 0, 1));
    { const vs = w.replace(/(한|된|하는|했던|인)$/, ''); if (vs !== w && vs.length >= 2) exp.set(vs, Math.max(exp.get(vs) || 0, 0.9)); }   // ‘귀촌한’ → ‘귀촌’
    if (w.length >= 3 && /(인|자|들|객|량|수)$/.test(w)) exp.set(w.slice(0, -1), Math.max(exp.get(w.slice(0, -1)) || 0, 0.7));
    for (const [k, vs] of Object.entries(SYNONYMS)) if (w.includes(k) || k.includes(w)) { if (k !== w && k.length >= 2 && w.includes(k)) exp.set(k, Math.max(exp.get(k) || 0, 0.8)); for (const v of vs) exp.set(v, Math.max(exp.get(v) || 0, 0.55)); }
  }
  return { base, terms: exp };
}

export class Catalog {
  constructor(items) {
    this.items = items.map((x) => ({ ...x, _t: norm(x.title), _d: norm(x.desc), _tag: norm(x.tag), _o: norm(`${x.owner} ${x.cat}`) }));
    this.byId = new Map(this.items.map((x) => [x.id, x]));
    for (const x of this.items) x._x = '';
    // 낱말이 얼마나 흔한지(드문 낱말에 더 큰 가중치)
    this.df = new Map();
    for (const x of this.items) for (const w of new Set(`${x._t} ${x._d} ${x._tag}`.split(' '))) if (w.length >= 2) this.df.set(w, (this.df.get(w) || 0) + 1);
  }
  // 내려받은 표 안의 열 이름·대표 범주 값(예: ‘천지연폭포’ 는 카탈로그 제목에 없고 열 이름에만 있다)도 찾기에 쓴다
  setExtra(id, text) { const x = this.byId.get(id); if (x) x._x = norm(text); }
  idf(w) { const n = this.items.length; const df = this.df.get(w) || 0; return Math.log(1 + (n - df + 0.5) / (df + 0.5)); }
  // 질문 → 후보 데이터 k개. opts.onlyOpen: 로그인 없이 쓸 수 있는(authYn=false) 데이터만
  search(question, { k = 5, onlyOpen = false } = {}) {
    const { base, terms } = expandQuery(question);
    const res = [];
    for (const x of this.items) {
      if (onlyOpen && x.auth) continue;
      let score = 0; const hit = new Set();
      for (const [w, wt] of terms) {
        const idf = this.idf(w);
        const inT = x._t.includes(w), inTag = x._tag.includes(w), inD = x._d.includes(w), inO = x._o.includes(w), inX = x._x && x._x.includes(w);
        if (inT) { score += 3 * wt * idf; hit.add(w); }
        if (inTag) { score += 2 * wt * idf; hit.add(w); }
        if (inD) { score += 1 * wt * idf; hit.add(w); }
        if (inO) { score += 0.6 * wt * idf; hit.add(w); }
        if (inX && !inT) { score += 2.4 * wt * idf; hit.add(w); }
        if (!inT && !inD && !inTag && w.length >= 3) {   // 활용형·띄어쓰기 차이: 글자쌍이 대부분 겹치면 일부 인정
          const bg = bigrams(w); if (bg.length) { const ov = bg.filter((b) => x._t.includes(b)).length / bg.length; if (ov >= 0.75) { score += 1.2 * wt * idf * ov; hit.add(w); } }
        }
      }
      // 질문의 핵심 낱말(원래 어절)이 제목에 모두 나오면 가산
      const core = base.filter((w) => w.length >= 2);
      if (core.length && core.every((w) => x._t.includes(w))) score += 4;
      if (score > 0) res.push({ id: x.id, score: +score.toFixed(3), matched: [...hit], item: x });
    }
    res.sort((a, b) => b.score - a.score || b.item.views - a.item.views);
    return res.slice(0, k);
  }
}
