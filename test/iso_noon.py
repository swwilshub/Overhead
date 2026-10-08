import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
SETUP = """() => { const {app, G, ZONE} = window.__overhead; const st = app.st, fl = st.floor;
  const r = []; const P = s => { const x = G.placeEquipment(st, s); r.push(s.kind + ':' + (x.ok ? 'ok' : x.msg)); return x.obj; };
  for (let x=9; x<=11; x++) P({kind:'conveyor', x, y:5});
  for (let y=6; y<=8; y++) P({kind:'conveyor', x:11, y});
  P({kind:'bin', x:12, y:7});
  fl.zones[16*fl.w+12] = ZONE.SMOKING; fl.rev++;
  G.advance(st, 4*60 + 20); return r.join(' | ') + ' time ' + st.time; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        print(await pg.evaluate(SETUP))
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        await pg.click('.status .run button:has-text("Play")'); await pg.wait_for_timeout(1500)
        print((await pg.locator('#st-clock').inner_text()).replace('\n',' '))
        await pg.click('[data-key="ft-zi"]'); await pg.wait_for_timeout(400)
        fr = pg.locator('#floor-app'); await fr.screenshot(path=str(SHOTS) + '/iso_noon.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())
