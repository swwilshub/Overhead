// Saves and preferences live in this browser (localStorage). Each save is gzip-compressed JSON (base64) when the
// browser supports CompressionStream, so long games stay small. Export and import move a save between browsers.
const PREFIX = 'overhead-';
const SAVE = PREFIX + 'save-', SCORES = PREFIX + 'scores', PREFS = PREFIX + 'prefs';

async function gz(str) {
  if (typeof CompressionStream === 'undefined') return { enc: 'raw', data: str };
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { enc: 'gz64', data: btoa(bin) };
}
async function gunz(rec) {
  if (rec.enc !== 'gz64') return rec.data;
  const bin = atob(rec.data); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).text();
}
const readJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

export function serialize(st) {
  return JSON.stringify(st, (k, v) => (k === 'schedule' || k === 'act' || k === 'px' || k === 'py' ? undefined : v));
}

export async function saveGame(slot, st, label) {
  const packed = await gz(serialize(st));
  const meta = { slot, label: label || st.setup.company, company: st.setup.company, city: st.city?.name || '', gameTime: st.time, savedAt: Date.now(), netWorth: st._nw ?? null, ...packed };
  try { localStorage.setItem(SAVE + slot, JSON.stringify(meta)); return { ok: true, where: 'browser' }; }
  catch (e) { return { ok: false, msg: e?.name === 'QuotaExceededError' ? 'Browser storage is full. Delete an old save, or export this game to a file.' : 'This browser blocked saving. Export the game to a file instead.' }; }
}

export async function listSaves() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k?.startsWith(SAVE)) continue;
      const m = readJSON(k, null); if (m) out[m.slot] = { ...m, where: 'browser', data: undefined };
    }
  } catch { /* storage blocked */ }
  return out;
}

export async function loadGame(slot) {
  const rec = readJSON(SAVE + slot, null);
  return rec ? JSON.parse(await gunz(rec)) : null;
}

export async function deleteSave(slot) {
  try { localStorage.removeItem(SAVE + slot); } catch { /* ignore */ }
}

// Offer the game as a .json file download; import is the file picker on the title screen.
export async function exportFile(st) {
  const name = `overhead-${(st.setup.company || 'game').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  try {
    const url = URL.createObjectURL(new Blob([serialize(st)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, msg: `Saved ${name} to your downloads.` };
  } catch { return { ok: false, msg: 'This browser could not start the download.' }; }
}

// ---- best companies, kept in this browser
export async function submitScore(entry) {
  const list = readJSON(SCORES, []);
  list.push({ ...entry, at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(SCORES, JSON.stringify(list.slice(0, 20))); return true; } catch { return false; }
}
export async function topScores() { return readJSON(SCORES, []); }

export function localPrefsGet() { return readJSON(PREFS, {}); }
export function localPrefsSet(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* ignore */ } }
