#!/usr/bin/env node
// Content scanner: fails if the repo contains any protected name or phrase.
// The denylist and the banned-term list hold only salted SHA-256 hashes, so the text they guard is never in this repo.
//   node tools/ip_scan.mjs            scan the repo (exit 1 on any blocking hit)
//   node tools/ip_scan.mjs --verbose  also list single-word "generic" hits
// Allow a real-world term that happens to match (e.g. a standard component name) by adding it to
// tools/ip_allowlist.json as { "normalised phrase": "why it is fine" }.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const ROOT = process.cwd(), verbose = process.argv.includes('--verbose');
const here = path.dirname(new URL(import.meta.url).pathname);
const deny = JSON.parse(fs.readFileSync(path.join(here, 'ip_denylist.json'), 'utf8')).hashes;
const bannedTerms = JSON.parse(fs.readFileSync(path.join(here, 'ip_banned.json'), 'utf8')).terms;
const allow = fs.existsSync(path.join(here, 'ip_allowlist.json')) ? JSON.parse(fs.readFileSync(path.join(here, 'ip_allowlist.json'), 'utf8')) : {};
const norm = s => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const H = s => crypto.createHash('sha256').update('fe-deny:' + s).digest('hex').slice(0, 20);
// terms that must never appear, hashed
// like the denylist: whole word runs, and single words also as a word prefix
const banned = new Map(bannedTerms.map(t => [t.h, t]));
const prefixLens = [...new Set(bannedTerms.filter(t => t.prefix).map(t => t.chars))];
const SKIP = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);
const EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.md', '.json', '.py', '.txt', '.yml', '.yaml']);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (EXT.has(path.extname(f.name)) && !/ip_(denylist|allowlist|banned)\.json$/.test(f.name) && !p.endsWith('ip_scan.mjs')) files.push(p); } })(ROOT);
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  // word stream with line numbers, then every 1..25-word run
  const words = []; lines.forEach((line, li) => { for (const w of norm(line).split(' ').filter(Boolean)) words.push([w, li + 1]); });
  for (let i = 0; i < words.length; i++) {
    let s = '';
    for (let n = 1; n <= 25 && i + n <= words.length; n++) {
      s = n === 1 ? words[i][0] : s + ' ' + words[i + n - 1][0];
      const hs = H(s), b = banned.get(hs);
      if (b && b.words === n) hits.push({ f, line: words[i][1], cat: b.level === 'block' ? 'banned' : 'warn', text: s });
      if (n === 1) for (const L of prefixLens) { if (s.length <= L) continue; const bp = banned.get(H(s.slice(0, L))); if (bp && bp.prefix && bp.chars === L) hits.push({ f, line: words[i][1], cat: bp.level === 'block' ? 'banned' : 'warn', text: s }); }
      const cat = deny[hs]; if (!cat) continue;
      if (allow[s]) continue;
      hits.push({ f, line: words[i][1], cat, text: s });
    }
  }
}
const blocking = hits.filter(h => h.cat === 'string' || h.cat === 'name' || h.cat === 'banned');
const show = verbose ? hits : hits.filter(h => h.cat !== 'generic');
const seen = new Set();
for (const h of show) { const k = `${h.f}:${h.line}:${h.text}`; if (seen.has(k)) continue; seen.add(k); console.log(`${h.cat.padEnd(8)} ${path.relative(ROOT, h.f)}:${h.line}  ${h.cat === 'banned' || h.cat === 'warn' ? h.text : '[protected ' + (h.cat === 'string' ? 'text' : 'name') + '] "' + h.text + '"'}`); }
const by = hits.reduce((a, h) => (a[h.cat] = (a[h.cat] || 0) + 1, a), {});
console.log(`\n${files.length} files scanned. ${JSON.stringify(by)}`);
if (blocking.length) { console.log(`FAIL: ${blocking.length} blocking hits. Rename or rewrite them, or allowlist a genuine real-world term with a reason.`); process.exit(1); }
console.log('PASS: no protected names or text found.');
