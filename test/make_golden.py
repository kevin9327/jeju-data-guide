# -*- coding: utf-8 -*-
"""골든 질문 정답 만들기 — 세 번째 독립 경로(파이썬 csv 모듈, 에이전트·검증기 코드와 무관)로 원본 CSV 에서 정답을 직접 계산해 golden.json 에 적는다.
사용: python make_golden.py   (정답은 사람이 이 스크립트에서 계산식을 보고 확인할 수 있다)"""
import csv, json, io
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / 'data' / 'raw'


def load(i):
    with open(RAW / f'{i}.csv', encoding='utf-8', newline='') as f:
        r = list(csv.reader(f))
    return r[0], r[1:]


def n(x):
    x = str(x).replace(',', '').strip()
    try:
        return float(x)
    except ValueError:
        return None


G = []


def add(q, kind, **kw):
    G.append({'q': q, 'kind': kind, **kw})


# --- 1343 우도 입장객(가로 월 표)
h, rows = load(1343)
mi = [i for i, c in enumerate(h) if c.endswith('월')]
vis = {int(r[0]): [n(r[i]) for i in mi] for r in rows if r[1] == '입장객'}
car = {int(r[0]): [n(r[i]) for i in mi] for r in rows if r[1] == '차량'}
add('우도 입장객이 2019년 7월에 몇 명이었어', 'value', value=vis[2019][6], data=1343)
ysum = {y: sum(v) for y, v in vis.items()}
add('우도 입장객 연도별 추이', 'series', series={f'{y}년': v for y, v in ysum.items()}, data=1343)
best = max(ysum, key=ysum.get)
add('우도 입장객이 가장 많았던 해는', 'argmax', label=f'{best}년', value=ysum[best], data=1343)
add('우도 입장객 2018년 대비 2022년 증감률', 'growth', value=(ysum[2022] - ysum[2018]) / ysum[2018] * 100, data=1343)
cm = max(((y, m + 1, v) for y, a in car.items() for m, v in enumerate(a) if v is not None), key=lambda x: x[2])
add('우도 차량이 가장 많았던 달은', 'argmax', label=f'{cm[0]}년 {cm[1]}월', value=cm[2], data=1343)
top3 = sorted(ysum.items(), key=lambda kv: -kv[1])[:3]
add('우도 입장객 상위 3개 연도', 'topk', ranked=[[f'{y}년', v] for y, v in top3], data=1343)
add('우도 입장객 2021년 여름 합계', 'value', value=sum(vis[2021][5:8]), data=1343)

# --- 1295 서귀포 직영관광지 관람객(월간)
h, rows = load(1295)
ci = {c: i for i, c in enumerate(h)}
def ym(s):
    a = s.split('-'); return int(a[0]), int(a[1])
cj = [(ym(r[0]), n(r[ci['천지연폭포']])) for r in rows if n(r[ci['천지연폭포']]) is not None]
mx = max(cj, key=lambda x: x[1])
add('서귀포 직영관광지 천지연폭포 관람객이 가장 많았던 달은', 'argmax', label=f'{mx[0][0]}년 {mx[0][1]}월', value=mx[1], data=1295)
s1 = sum(v for _, v in cj)
s2 = sum(n(r[ci['정방폭포']]) for r in rows if n(r[ci['정방폭포']]) is not None)
add('천지연폭포와 정방폭포 관람객 비교', 'compare', series={'천지연폭포': s1, '정방폭포': s2}, data=1295)
add('정방폭포 2019년 관람객 합계', 'value', value=sum(n(r[ci['정방폭포']]) for r in rows if ym(r[0])[0] == 2019 and n(r[ci['정방폭포']]) is not None), data=1295)
y19 = {ym(r[0])[1]: n(r[ci['천지연폭포']]) for r in rows if ym(r[0])[0] == 2019}
add('천지연폭포 2019년 월별 추이', 'series', series={f'2019년 {m}월': v for m, v in sorted(y19.items())}, data=1295)

# --- 1294 감귤(연도, 읍면동, 구분, 품종 열…)
h, rows = load(1294)
mcols = [i for i, c in enumerate(h) if i >= 3 and c != '데이터기준일']
def ysum_g(gubun):
    d = {}
    for r in rows:
        if r[2] != gubun: continue
        d[int(r[0])] = d.get(int(r[0]), 0) + sum(n(r[i]) or 0 for i in mcols)
    return d
prod = ysum_g('생산량'); area = ysum_g('면적')
b = max(prod, key=prod.get)
add('서귀포 감귤 생산량이 가장 많았던 해는', 'argmax', label=f'{b}년', value=prod[b], data=1294)
add('서귀포 감귤 면적 2012년 대비 2022년 증감률', 'growth', value=(area[2022] - area[2012]) / area[2012] * 100, data=1294)

# --- 1345 서귀포 생활폐기물
h, rows = load(1345)
ci = {c: i for i, c in enumerate(h)}
inc = {int(r[0]): n(r[ci['소각(톤_일)']]) for r in rows}
b = max(inc, key=inc.get)
add('서귀포 생활폐기물 소각이 가장 많았던 해는', 'argmax', label=f'{b}년', value=inc[b], data=1345)
add('서귀포 생활폐기물 음식물 2014년 대비 2023년 증감률', 'growth', value=(n([r for r in rows if r[0] == '2023'][0][ci['음식물(톤_일)']]) - n([r for r in rows if r[0] == '2014'][0][ci['음식물(톤_일)']])) / n([r for r in rows if r[0] == '2014'][0][ci['음식물(톤_일)']]) * 100, data=1345) if any(r[0] == '2023' for r in rows) else None

# --- 1332 물가
h, rows = load(1332)
ci = {c: i for i, c in enumerate(h)}
p14 = n([r for r in rows if r[0] == '2014'][0][ci['소비자물가']]); p20 = n([r for r in rows if r[0] == '2020'][0][ci['소비자물가']])
add('제주 소비자물가가 2014년 대비 2020년에 얼마나 올랐어', 'growth', value=(p20 - p14) / p14 * 100, data=1332)

# --- 1342 유기동물
h, rows = load(1342)
ci = {c: i for i, c in enumerate(h)}
t = max(((r[0], n(r[ci['고양이(TNR)']])) for r in rows), key=lambda x: x[1])
add('유기동물 고양이 TNR이 가장 많았던 달', 'argmax', label=f'{t[0][:4]}년 {int(t[0][5:])}월', value=t[1], data=1342)

# --- 1351 고용동향
h, rows = load(1351)
ci = {c: i for i, c in enumerate(h)}
u = max(((int(r[0]), n(r[ci['실업률']])) for r in rows), key=lambda x: x[1])
add('제주 고용동향에서 실업률이 가장 높았던 해는', 'argmax', label=f'{u[0]}년', value=u[1], data=1351)

# --- 1334 귀농귀촌
h, rows = load(1334)
ci = {c: i for i, c in enumerate(h)}
g = max(((int(r[0]), n(r[ci['귀촌인(명)']])) for r in rows), key=lambda x: x[1])
add('귀촌인이 가장 많았던 해는', 'argmax', label=f'{g[0]}년', value=g[1], data=1334)

# --- 1352 환경소음 (수준 값 → 지점별 최댓값)
h, rows = load(1352)
cols = [i for i, c in enumerate(h) if '소음도' in c]
pi = h.index('측정지역')
by = {}
for r in rows:
    vals = [n(r[i]) for i in cols if n(r[i]) is not None]
    if vals: by[r[pi]] = max(by.get(r[pi], -1), max(vals))
k = max(by, key=by.get)
add('환경소음 측정 중 가장 시끄러운 곳은', 'argmax', label=k, value=by[k], data=1352)

# --- 거절해야 하는 질문
add('우도 입장객이 2030년에 몇 명이었어', 'refuse-gate', data=1343)
add('화성 탐사선 궤도 알려줘', 'refuse')
G = [x for x in G if x]
(Path(__file__).resolve().parent / 'golden.json').write_text(json.dumps(G, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(G), '개 골든 질문 저장')
