# -*- coding: utf-8 -*-
"""held-out 2: 앱을 한 번도 돌려 보기 전에 새로 쓴 '평범한 말투' 질문. 정답은 원본 CSV 에서 파이썬으로 독립 계산.
(평가자가 지적한 '말투가 자연스러울 때 틀린다'를 재는 용도 — 첫 실행 결과를 고치기 전에 test/heldout2_first_run.txt 에 그대로 기록한다.)"""
import csv, json
from pathlib import Path
RAW = Path(__file__).resolve().parent.parent / 'data' / 'raw'
def load(i):
    with open(RAW / f'{i}.csv', encoding='utf-8', newline='') as f: r = list(csv.reader(f))
    return [h.strip() for h in r[0]], r[1:]
def n(x):
    x = str(x).replace(',', '').strip()
    try: return float(x)
    except ValueError: return None
G = []
def add(q, kind, **kw): G.append({'q': q, 'kind': kind, **kw})

h, rows = load(1325); ci = {c: i for i, c in enumerate(h)}
yr = lambda r: int(r[0])
mxr = max(rows, key=lambda r: n(r[ci['흡연율']])); add('제주 흡연율이 가장 높았던 해는?', 'argmax', label='%d년' % yr(mxr), value=n(mxr[ci['흡연율']]), data=1325)
a = n([r for r in rows if r[0] == '2010'][0][ci['고령인구비율(65세이상)']]); b = n([r for r in rows if r[0] == '2022'][0][ci['고령인구비율(65세이상)']])
add('제주 고령인구비율이 2010년부터 2022년까지 얼마나 늘었어?', 'growth', value=(b - a) / a * 100, data=1325)
add('제주 음주율 추이 알려줘', 'series', series={'%d년' % yr(r): n(r[ci['음주율']]) for r in rows}, data=1325)
add('2020년 제주 자살률은 얼마야?', 'refuse')   # [정정] 자료에는 0 이지만 비고 ‘미조사’ → 값 없음이 정답
# [정정] 처음에는 0 을 값으로 보고 2019년을 정답으로 썼다. 이 표의 비고에 ‘미조사’ 가 있어 0 은 ‘조사 안 함’이다 → 0 제외(heldout2_corrections.txt)
mn = min([r for r in rows if n(r[ci['비만율']]) not in (0, None)], key=lambda r: n(r[ci['비만율']])); add('제주 비만율이 가장 낮았던 해는 언제야?', 'argmax', label='%d년' % yr(mn), value=n(mn[ci['비만율']]), data=1325)
add('2021년 제주 의료기관 종사자수는?', 'refuse')   # [정정] 위와 같은 이유

h, rows = load(1309); ci = {c: i for i, c in enumerate(h)}
add('애월읍에 등록된 개는 몇 마리야?', 'value', value=n([r for r in rows if r[0] == '애월읍' and r[1] == '개'][0][ci['등록두수']]), data=1309)

h, rows = load(1331); ci = {c: i for i, c in enumerate(h)}
add('제주시 용천수 개소 합계', 'value', value=sum(n(r[ci['개소']]) for r in rows if r[0] == '제주시'), data=1331)

h, rows = load(1321); ci = {c: i for i, c in enumerate(h)}
add('한림읍 노인급식 대상인원은 모두 몇 명이야?', 'value', value=sum(n(r[ci['대상인원']]) or 0 for r in rows if r[1] == '한림읍'), data=1321)

h, rows = load(1316); ci = {c: i for i, c in enumerate(h)}
mx = max(rows, key=lambda r: n(r[ci['안치실수']])); add('장례식장 중에 안치실이 제일 많은 곳은 어디야?', 'argmax', label=mx[ci['시설명']], value=n(mx[ci['안치실수']]), data=1316)

h, rows = load(1295); ci = {c: i for i, c in enumerate(h)}
add('2023년 정방폭포 관람객은 모두 몇 명이야?', 'value', value=sum(n(r[ci['정방폭포']]) for r in rows if r[0].startswith('2023') and n(r[ci['정방폭포']]) is not None), data=1295)

h, rows = load(1332); ci = {c: i for i, c in enumerate(h)}
mx = max(rows, key=lambda r: n(r[ci['신선식품']])); add('신선식품 물가는 어느 해가 제일 높았어?', 'argmax', label='%d년' % int(mx[0]), value=n(mx[ci['신선식품']]), data=1332)
add('제주 생활물가 2016년 수치 알려줘', 'value', value=n([r for r in rows if r[0] == '2016'][0][ci['생활물가']]), data=1332)

h, rows = load(1345); ci = {c: i for i, c in enumerate(h)}
mx = max(rows, key=lambda r: n(r[ci['음식물(톤_일)']])); add('음식물 쓰레기는 몇 년에 제일 많이 나왔어?', 'argmax', label='%d년' % int(mx[0]), value=n(mx[ci['음식물(톤_일)']]), data=1345)

h, rows = load(1344); ci = {c: i for i, c in enumerate(h)}
add('제주시 지방세 과세금액 합계는?', 'value', value=sum(n(r[ci['과세금액']]) or 0 for r in rows), data=1344)

h, rows = load(1336); ci = {c: i for i, c in enumerate(h)}
mx = max(rows, key=lambda r: n(r[ci['하천연장']]) or 0); add('지방하천 중에 제일 긴 곳은?', 'argmax', label=mx[ci['하천명']], value=n(mx[ci['하천연장']]), data=1336)

# 말이 되지 않거나 자료에 없는 것 — 답하면 틀린 것
add('제주도 장례식장은 몇 군데 있어?', 'refuse')
add('우도에서 제일 맛있는 식당 추천해줘', 'refuse')
add('2019년 제주 암 환자 수는?', 'refuse')
add('작년 제주 흡연율은?', 'refuse-gate')
add('한라산 정상 기온은 몇 도야', 'refuse')

(Path(__file__).resolve().parent / 'heldout2.json').write_text(json.dumps(G, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(G), '개 held-out 2 질문')
