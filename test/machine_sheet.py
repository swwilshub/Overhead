# Contact sheet: every production line's machine (rows, ordered by Mk) in rotations 0-3, idle then running. Saves a PNG to eyeball.
import asyncio, sys
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'machine_sheet.png'
JS = """(frame) => {
  const { drawObject, TILE: T, RECIPES, FAMILIES } = window.__overhead;
  const fams = FAMILIES.slice().sort((a, b) => a.tier - b.tier || a.price - b.price).map(f => f.id);
  const cellW = 7 * T, cellH = 7 * T, cols = 5, S = 3;
  const lo = document.createElement('canvas'); lo.width = cols * cellW; lo.height = fams.length * cellH;
  const c = lo.getContext('2d'); c.fillStyle = '#d3d8d2'; c.fillRect(0, 0, lo.width, lo.height);
  c.fillStyle = '#c1c8c1'; for (let x = 0; x < lo.width; x += T) c.fillRect(x, 0, 1, lo.height); for (let y = 0; y < lo.height; y += T) c.fillRect(0, y, lo.width, 1);
  fams.forEach((f, row) => {
    const rec = RECIPES.find(r => r.family === f && r.start).id;
    for (let col = 0; col < cols; col++) {
      const rot = col < 4 ? col : 0, running = col === 4;
      const o = { kind: 'machine', family: f, recipe: rec, rot, id: 1, mode: 'produce', status: running ? 'Running' : 'Idle', x: col * 7 + 1, y: row * 7 + 1 };
      const v = { fl: { w: cols * 7, h: fams.length * 7, objects: [o] }, ox: 0, oy: 14, W: lo.width, H: lo.height };
      drawObject(c, v, null, o, { focus: '#1b5fd6' }, frame * 140, running);
    }
  });
  const out = document.createElement('canvas'); out.width = lo.width * S; out.height = lo.height * S; out.id = 'sheet';
  const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false; oc.drawImage(lo, 0, 0, out.width, out.height);
  document.body.replaceChildren(out); document.body.style.margin = 0;
  return [out.width, out.height];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1600, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        wh = await pg.evaluate(JS, 3); await pg.set_viewport_size({'width': wh[0], 'height': min(wh[1], 8000)})
        await pg.locator('#sheet').screenshot(path=OUT); print('sheet', wh, 'errors', errs)
        await b.close()
asyncio.run(main())
