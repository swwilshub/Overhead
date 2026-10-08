// Runs every Node test (the files that assert; play.mjs is a printout for eyeballing and is skipped).
import { spawnSync } from 'child_process';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
const TESTS = ['belt', 'flow', 'cells', 'suites', 'move', 'paths', 'long'];
let failed = [];
for (const t of TESTS) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, t + '.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  const ok = r.status === 0 && !fails.length;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.padEnd(7)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${out.trim().split('\n').pop()}`);
  if (!ok) { failed.push(t); console.log(fails.length ? fails.join('\n') : out.slice(-2000)); }
}
console.log(failed.length ? `\n${failed.length} test file(s) failed: ${failed.join(', ')}` : '\nall Node tests pass');
process.exit(failed.length ? 1 : 0);
