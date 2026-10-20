// Builds one self-contained practice page (bots only, no Firebase) from docs/.
// Usage: node tools/build-practice.mjs [out.html] [--fragment]
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../docs/', import.meta.url);
const engineSrc = readFileSync(new URL('engine.js', root), 'utf8');
const names = [...engineSrc.matchAll(/^export (?:const|function|let) (\w+)/gm)].map((m) => m[1]);
const engine = `const E = (() => {\n${engineSrc.replace(/^export /gm, '')}\nreturn { ${names.join(', ')} };\n})();`;
const app = readFileSync(new URL('app.js', root), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^/, 'const firebaseConfig = null;\n');
const html = readFileSync(new URL('index.html', root), 'utf8');
const head = html.slice(html.indexOf('<!--STYLE-->') + 12, html.indexOf('<!--/STYLE-->'));
const out = process.argv[2] || 'practice.html';
const fragment = process.argv.includes('--fragment');
const body = `<div id="app"></div>\n<div id="toast" hidden></div>\n<script>\n(() => {\n${engine}\n${app}\n})();\n</script>`;
const page = fragment
  ? `<title>Teen Patti</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Teen Patti</title>${head}</head><body>${body}</body></html>\n`;
writeFileSync(out, page);
console.log('wrote', out, page.length, 'bytes');
