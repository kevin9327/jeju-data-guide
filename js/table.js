// 표(CSV) 읽기·열 종류 추정·가로로 펼쳐진 표(1월~12월 열)를 세로로 바꾸기. 순수 함수, 외부 라이브러리 없음(브라우저·Node 공용).

// 올린 파일의 글자 해석: UTF-8 로 깨끗이 읽히면 그대로, 아니면 CP949(엑셀이 저장하는 한글 CSV)로 읽는다
export function decodeText(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* UTF-8 아님 */ }
  try { return new TextDecoder('euc-kr').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

// 같은 열 이름이 여러 번 나오면 두 번째부터 ‘이름(2)’ ‘이름(3)’ 으로 구별한다(verify.js 도 같은 규칙을 따로 구현)
export function dedupeNames(names) {
  const seen = new Map();
  return names.map((n) => { const k = (seen.get(n) || 0) + 1; seen.set(n, k); return k === 1 ? n : `${n}(${k})`; });
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}

const NUM = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$|^[-+]?\d+(\.\d+)?$/;
export const toNumber = (v) => { const t = String(v ?? '').trim(); if (!NUM.test(t)) return null; return Number(t.replace(/,/g, '')); };
const DATE_FULL = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/;
const DATE_COMPACT = /^(\d{4})(\d{2})(\d{2})$/;
const YEAR = /^(19|20)\d{2}$/;

export function inferType(values) {
  const vs = values.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
  if (!vs.length) return 'empty';
  const n = vs.length;
  const frac = (re) => vs.filter((v) => re.test(v)).length / n;
  if (frac(DATE_FULL) >= 0.9 || frac(DATE_COMPACT) >= 0.9) return 'date';
  if (frac(YEAR) >= 0.9) return 'year';
  if (vs.filter((v) => toNumber(v) !== null).length / n >= 0.9) return 'number';
  const uniq = new Set(vs).size;
  return uniq <= Math.max(60, n * 0.3) ? 'category' : 'text';
}

// 표 하나: columns[{name,type,uniq}], rows(문자열 원본), 필요할 때 typed 값을 꺼낸다.
export class Table {
  constructor({ id, title = '', header, rows }) {
    this.id = id; this.title = title;
    this.header = dedupeNames(header.map((h, i) => (String(h).trim() || `열${i + 1}`)));   // 같은 이름의 열이 둘이면 뒤의 것에 (2) 를 붙인다
    this.rows = rows;
    this.columns = this.header.map((name, i) => {
      const vals = rows.map((r) => r[i]);
      const type = inferType(vals);
      const set = new Set(vals.map((v) => String(v ?? '').trim()).filter((v) => v !== ''));
      return { name, i, type, uniq: set.size, values: type === 'category' || type === 'year' ? [...set] : [] };
    });
  }
  static fromCSV(text, meta = {}) {
    const all = parseCSV(text);
    const header = all[0] || [];
    const rows = all.slice(1).map((r) => { const a = r.slice(0, header.length); while (a.length < header.length) a.push(''); return a; });
    return new Table({ ...meta, header, rows });
  }
  col(name) { return this.columns.find((c) => c.name === name); }
  num(r, ci) { return toNumber(this.rows[r][ci]); }
}

// 가로로 펼쳐진 월별 표(예: 년도, 구분, 1월, 2월, … 12월)를 세로(년도, 구분, 월, 값)로 바꾼다. 월 열이 6개 이상일 때만.
export function meltMonths(t) {
  const monthCols = t.columns.filter((c) => /^(\d{1,2})월$/.test(c.name));
  if (monthCols.length < 6) return null;
  const idCols = t.columns.filter((c) => !monthCols.includes(c));
  const header = [...idCols.map((c) => c.name), '월', '값'];
  const rows = [], origin = [];
  t.rows.forEach((r, ri) => {
    for (const mc of monthCols) {
      const raw = r[mc.i];
      rows.push([...idCols.map((c) => r[c.i]), mc.name.replace('월', ''), raw]);
      origin.push({ row: ri, col: mc.i });
    }
  });
  const m = new Table({ id: t.id, title: t.title, header, rows });
  m.origin = origin; m.source = t; m.melted = true;
  return m;
}
