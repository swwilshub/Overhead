import asyncio, sys
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1400, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        # add more stuff: conveyor, forklift zone, bin, smoking zone via UI is long; run the clock a bit
        await pg.click('.status .run button:has-text("Play")'); await pg.wait_for_timeout(2500)
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/iso_floor.png')
        await pg.click('[data-key^="eq-"] >> nth=0'); await pg.wait_for_timeout(300)
        await pg.focus('#floor-app'); 
        for k in ['ArrowRight','ArrowRight','ArrowDown']: await pg.keyboard.press(k)
        await pg.wait_for_timeout(400); print('speech:', await pg.locator('#live-polite').inner_text())
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/iso_floor_sel.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())
