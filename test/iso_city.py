import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1400, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.screenshot(path=str(SHOTS) + '/iso_title.png')
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(SHOTS) + '/iso_city.png')
        await pg.emulate_media(color_scheme='dark'); await pg.click('nav.rail a[href="#nation"]'); await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(SHOTS) + '/iso_city_dark.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())
