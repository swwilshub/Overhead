import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
SETUP = """() => { const {app, G, ZONE} = window.__overhead; const st = app.st, fl = st.floor;
  const P = s => G.placeEquipment(st, s);
  const m2 = P({kind:'machine', family:1, x:4, y:10, rot:0}).obj; const m3 = P({kind:'machine', family:6, x:14, y:10, rot:1}).obj;
  for (let x=9; x<=12; x++) P({kind:'conveyor', x, y:5});
  P({kind:'bin', x:10, y:6});
  for (const [x,y] of [[2,15],[2,16],[3,15],[3,16]]) fl.zones[y*fl.w+x] = ZONE.FORKLIFT;
  P({kind:'forklift', x:2, y:15, rot:0}); P({kind:'handcart', x:7, y:15});
  for (let x=20; x<24; x++) for (let y=8; y<12; y++) fl.zones[y*fl.w+x] = ZONE.CARPET;
  P({kind:'office', officeType:4, x:20, y:8}); P({kind:'office', officeType:3, x:16, y:4});
  fl.zones[17*fl.w+12] = ZONE.SMOKING; fl.zones[17*fl.w+13] = ZONE.SMOKING;
  const [ix,iy] = [3,11]; fl.zones[iy*fl.w+ix] = ZONE.SAFETY; fl.rev++;
  st.inventory[0] = 6000; st.inventory[5] = 9000; st.inventory[26] = 3000; st.inventory[22]=2000;
  return fl.w + 'x' + fl.h; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        print(await pg.evaluate(SETUP))
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(200)
        await pg.click('.status .run button:has-text("Play")'); await pg.wait_for_timeout(5000)
        await pg.click('[data-key^="eq-"] >> nth=0'); await pg.wait_for_timeout(400)
        await pg.click('[data-key="ft-zo"]'); await pg.wait_for_timeout(400)
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/iso_rich_1x.png')
        await pg.click('[data-key="ft-zi"]'); await pg.wait_for_timeout(400)
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/iso_rich_2x.png')
        await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(1800)
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/iso_rich_dark.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())
