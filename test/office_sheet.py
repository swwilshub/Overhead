# Renders the eight ready-made offices and a furnished office suite to a PNG to eyeball.
import asyncio, sys
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'office_sheet.png'
JS = """() => {
  const { drawObject, TILE: T, cells, suites } = window.__overhead;
  const S = 3, lo = document.createElement('canvas'); lo.width = 26 * T; lo.height = 15 * T;
  const c = lo.getContext('2d'); c.fillStyle = '#d3d8d2'; c.fillRect(0, 0, lo.width, lo.height);
  c.fillStyle = '#c1c8c1'; for (let x = 0; x < lo.width; x += T) c.fillRect(x, 0, 1, lo.height); for (let y = 0; y < lo.height; y += T) c.fillRect(0, y, lo.width, 1);
  const st = { employees: [{ id: 1, job: 'sales_1', assign: 100 }, { id: 2, job: 'purchasing_1', assign: 103 }, { id: 3, job: 'promotions_1', assign: 104 }] };
  const v = { fl: { w: 26, h: 15, objects: [] }, ox: 0, oy: 12, W: lo.width, H: lo.height };
  for (let i = 0; i < 5; i++) drawObject(c, v, st, { kind: 'office', officeType: i, id: 100 + i, x: 1 + (i % 4) * 4, y: 0 + Math.floor(i / 4) * 4, rot: 0 }, {}, 0, false);
  const d = { kind: 'suite', cw: 8, ch: 6, items: [], x: 17, y: 1 }; d.hatches = suites.defaultSuiteHatches(d);
  d.items = [{ t: 'odesk', x: 1, y: 1, rot: 0 }, { t: 'opc', x: 3, y: 1, rot: 0 }, { t: 'ostore', x: 0, y: 1, rot: 0 }, { t: 'ofile', x: 0, y: 0, rot: 0 },
    { t: 'odesk', x: 5, y: 1, rot: 0 }, { t: 'opc', x: 7, y: 1, rot: 0 }, { t: 'olamp', x: 4, y: 1, rot: 0 }, { t: 'opart', x: 4, y: 0, rot: 0 },
    { t: 'oshelf', x: 7, y: 4, rot: 0 }, { t: 'oplant', x: 0, y: 5, rot: 0 }, { t: 'orad', x: 2, y: 0, rot: 0 }, { t: 'ocool', x: 0, y: 4, rot: 0 }, { t: 'ocoffee', x: 7, y: 5, rot: 0 }, { t: 'orug', x: 2, y: 4, rot: 0 }, { t: 'ofax', x: 6, y: 0, rot: 0 }, { t: 'oserver', x: 7, y: 0, rot: 0 }];
  drawObject(c, v, st, { ...d, status: '' }, {}, 0, false);
  const out = document.createElement('canvas'); out.width = lo.width * S; out.height = lo.height * S; out.id = 'sheet';
  const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false; oc.drawImage(lo, 0, 0, out.width, out.height);
  document.body.replaceChildren(out); document.body.style.margin = 0;
  return [out.width, out.height, JSON.stringify(suites.analyseSuite(d))];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1600, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        r = await pg.evaluate(JS); await pg.set_viewport_size({'width': r[0], 'height': r[1]})
        await pg.locator('#sheet').screenshot(path=OUT); print('sheet', r[:2], r[2][:200], 'errors', errs)
        await b.close()
asyncio.run(main())
