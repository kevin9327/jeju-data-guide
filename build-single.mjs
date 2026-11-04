// index.html + css + js 모듈 + 데이터(카탈로그·CSV 333개)를 한 파일(dist/jeju-guide.html)로 묶는다. file:// 더블클릭 실행용. 사용: node build-single.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const order = ['catalog', 'understand', 'table', 'agent', 'verify', 'pipeline', 'app'];
let code = 'const __m = {};\n';
for (const name of order) {
  let src = read(`js/${name}.js`);
  const ex = [];
  src = src.replace(/^export\s+(const|let|function|async function|class)\s+([A-Za-z0-9_$]+)/gm, (_, kind, id) => { ex.push(id); return `${kind} ${id}`; });
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+'\.\/([a-z]+)\.js';?\s*$/gm, (_, names, mod) => `const {${names.trim()}} = __m.${mod};`);
  code += `__m.${name} = (() => {\n${src}\nreturn { ${ex.join(', ')} };\n})();\n`;
}
const catalog = JSON.parse(read('data/catalog.json')), manifest = JSON.parse(read('data/manifest.json')), hints = JSON.parse(read('data/hints.json'));
const raw = {};
for (const m of manifest) if (m.rows != null) raw[m.id] = read(`data/raw/${m.id}.csv`);
const dataJs = `window.__JEJU_DATA__ = ${JSON.stringify({ catalog, manifest, raw, hints }).replace(/</g, '\u003c')};`;
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}\n</style>`);
html = html.replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${dataJs}\n</script>\n<script type="module">\n${code}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/jeju-guide.html'), html);
console.log('dist/jeju-guide.html', (Buffer.byteLength(html) / 1048576).toFixed(2) + 'MB');
