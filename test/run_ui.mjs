// Runs every Playwright browser test (test/*_test.py) against dist/overhead.html. Build first: npm run build.
// A test fails if it exits non-zero or prints FAIL, a view error, an axe violation, a traceback or page errors.
// Set CHROMIUM_PATH to use a Chromium that Playwright did not download.
import { spawnSync } from 'child_process';
import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
const only = process.argv.slice(2);
const tests = fs.readdirSync(here).filter(f => f.endsWith('_test.py')).sort().filter(f => !only.length || only.some(o => f.includes(o)));
if (!fs.existsSync(path.join(here, '..', 'dist', 'overhead.html'))) { console.error('dist/overhead.html is missing: run npm run build first'); process.exit(1); }
const bad = l => /^(FAIL|VIEW ERROR|AXE |Traceback)/.test(l) || /^ERRORS (?!0\b|\[\])/.test(l) || /(^|\s)errors \[(?!\])/.test(l) || /^\d+ FAILED/.test(l);
const failed = [];
for (const t of tests) {
  const t0 = Date.now();
  const r = spawnSync('python3', [path.join(here, t)], { encoding: 'utf8', timeout: 300000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim(), lines = out.split('\n');
  const problems = lines.filter(bad);
  const ok = r.status === 0 && !problems.length;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${lines[lines.length - 1].slice(0, 100)}`);
  if (!ok) { failed.push(t); console.log((problems.length ? problems : lines.slice(-25)).map(l => '     ' + l.slice(0, 400)).join('\n')); }
}
console.log(failed.length ? `\n${failed.length} browser test(s) failed: ${failed.join(', ')}` : `\nall ${tests.length} browser tests pass`);
process.exit(failed.length ? 1 : 0);
