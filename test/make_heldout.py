# -*- coding: utf-8 -*-
"""'튜닝에 쓰지 않은' 새 질문(held-out) 정답 — 골든 세트를 통과시킨 뒤에 따로 만들었고, 규칙을 이 질문에 맞춰 고치기 전의 통과율을 그대로 보고한다.
정답은 make_golden.py 와 같은 독립 경로(파이썬 csv)로 계산."""
import csv, json
from pathlib import Path
RAW = Path(__file__).resolve().parent.parent / 'data' / 'raw'
def load(i):
    with open(RAW / f'{i}.csv', encoding='utf-8', newline='') as f: r = list(csv.reader(f))
    return r[0], r[1:]
def n(x):
    x = str(x).replace(',', '').strip()
    try: return float(x)
    except ValueError: return None
G = []
def add(q, kind, **kw): G.append({'q': q, 'kind': kind, **kw})

h, rows = load(1313); ci = {c: i for i, c in enumerate(h)}; mc = [i for i, c in enumerate(h) if i >= 3 and c != '데이터기준일']
v = [sum(n(r[i]) or 0 for i in mc) for r in rows if r[0] == '2020' and r[1] == '대정읍' and r[2] == '생산량']
add('서귀포 감귤 생산 정보에서 2020년 대정읍 생산량', 'value', value=sum(v), data=[1313, 1294])   # 1294·1313 은 같은 내용의 두 데이터

h, rows = load(900); ci = {c: i for i, c in enumerate(h)}
r0 = [r for r in rows if r[0].replace(' ', '') == '2018.01' and r[1] == '전국'][0]
add('전국 출생아수 2018년 1월', 'value', value=n(r0[ci['출생아수(명)']]), data=900)

h, rows = load(1295); ci = {c: i for i, c in enumerate(h)}
add('서귀포 직영관광지 감귤박물관 관람객 2020년 합계', 'value', value=sum(n(r[ci['감귤박물관']]) for r in rows if r[0].startswith('2020') and n(r[ci['감귤박물관']]) is not None), data=1295)
vals = [(r[0], n(r[ci['정방폭포']])) for r in rows if n(r[ci['정방폭포']]) is not None]
mn = min(vals, key=lambda x: x[1]); a = mn[0].split('-')
add('정방폭포 관람객이 가장 적었던 달은', 'argmax', label=f'{a[0]}년 {int(a[1])}월', value=mn[1], data=1295)
last = [n(r[ci['천지연폭포']]) for r in rows][-12:]
add('천지연폭포 최근 12개월 합계', 'value', value=sum(x for x in last if x is not None), data=1295)

h, rows = load(1357); ci = {c: i for i, c in enumerate(h)}
add('일본 수출 중량 합계', 'value', value=sum(n(r[ci['당월수출입중량(킬로그램)']]) or 0 for r in rows if r[ci['국가명']] == '일본' and r[ci['수출입구분명']] == '수출'), data=1357)

h, rows = load(1334); ci = {c: i for i, c in enumerate(h)}
add('귀농가구 2017년', 'value', value=n([r for r in rows if r[0] == '2017'][0][ci['귀농가구']]), data=1334)
h, rows = load(1351); ci = {c: i for i, c in enumerate(h)}
add('제주 취업 인구 2020년', 'value', value=n([r for r in rows if r[0] == '2020'][0][ci['취업 인구']]), data=1351)
h, rows = load(1345); ci = {c: i for i, c in enumerate(h)}
add('서귀포 생활폐기물 재활용 2016년', 'value', value=n([r for r in rows if r[0] == '2016'][0][ci['재활용(톤_일)']]), data=1345)
h, rows = load(1342); ci = {c: i for i, c in enumerate(h)}
add('유기동물 개 보호소인계 2023년 3월', 'value', value=n([r for r in rows if r[0] == '2023-03'][0][ci['개(보호소인계)']]), data=1342)
h, rows = load(1287); ci = {c: i for i, c in enumerate(h)}
col = [n(r[ci['1수원 감시정1']]) for r in rows if n(r[ci['1수원 감시정1']]) is not None]
add('지하수 감시정 1수원 감시정1 수온 평균', 'value', value=sum(col) / len(col), data=1287)
h, rows = load(1343)
mi = [i for i, c in enumerate(h) if c.endswith('월')]
add('우도 차량 2019년 연간 합계', 'value', value=sum(n(r[i]) for r in rows if r[0] == '2019' and r[1] == '차량' for i in mi), data=1343)
add('제주 클린하우스는 읍면동별로 몇 개야', 'unsupported')
(Path(__file__).resolve().parent / 'heldout.json').write_text(json.dumps(G, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(G), '개 held-out 질문')
