# Renders a few cells (standard layouts plus one with every extra) to a PNG to eyeball.
import asyncio, sys
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'cell_sheet.png'
JS = """() => {
  const { drawObject, TILE: T, cells } = window.__overhead;
  const S = 3, list = [0, 4, 5, 7, 13];
  const lo = document.createElement('canvas'); lo.width = 3 * 10 * T; lo.height = 2 * 9 * T;
  const c = lo.getContext('2d'); c.fillStyle = '#d3d8d2'; c.fillRect(0, 0, lo.width, lo.height);
  c.fillStyle = '#c1c8c1'; for (let x = 0; x < lo.width; x += T) c.fillRect(x, 0, 1, lo.height); for (let y = 0; y < lo.height; y += T) c.fillRect(0, y, lo.width, 1);
  const draw = (o, i) => { const v = { fl: { w: 30, h: 18, objects: [o] }, ox: (i % 3) * 10 * T + T, oy: Math.floor(i / 3) * 9 * T + 2 * T, W: lo.width, H: lo.height }; drawObject(c, v, null, { ...o, x: 0, y: 0 }, {}, 3 * 140, true); };
  list.forEach((fam, i) => { const o = { kind: 'cell', family: fam, cw: 7, ch: 5, items: [], status: 'Running' }; o.hatches = cells.defaultHatches(o); o.items = cells.standardLayout(o); draw(o, i); });
  // the last one: a fully loaded case cell
  const o = { kind: 'cell', family: 0, cw: 8, ch: 6, items: [], status: 'Running' }; o.hatches = cells.defaultHatches(o); o.items = cells.standardLayout(o);
  for (const t of ['f0x0', 'f0x1', 'spares', 'fan', 'inspect', 'board', 'mat', 'curtain', 'plc', 'robot', 'spcterm']) {
    let done = false; for (let y = 0; y < o.ch && !done; y++) for (let x = 0; x < o.cw && !done; x++) for (let r = 0; r < 2 && !done; r++) { const it = { t, x, y, rot: r }; if (!cells.itemProblem(o, it) && cells.analyse({ ...o, items: [...o.items, it] }).ok) { o.items.push(it); done = true; } }
  }
  draw(o, 5);
  const out = document.createElement('canvas'); out.width = lo.width * S; out.height = lo.height * S; out.id = 'sheet';
  const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false; oc.drawImage(lo, 0, 0, out.width, out.height);
  document.body.replaceChildren(out); document.body.style.margin = 0; return [out.width, out.height];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1600, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        wh = await pg.evaluate(JS); await pg.set_viewport_size({'width': wh[0], 'height': wh[1]})
        await pg.locator('#sheet').screenshot(path=OUT); print('sheet', wh, 'errors', errs)
        await b.close()
asyncio.run(main())
