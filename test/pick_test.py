import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        fl = await pg.evaluate("() => { const f = window.__overhead.app.st.floor; return [f.w, f.h]; }")
        box = await pg.locator('#floor-app canvas').bounding_box()
        ok = 0; tests = [(0,0),(5,5),(fl[0]-1,0),(0,fl[1]-1),(10,3),(fl[0]-1,fl[1]-1)]
        for (tx, ty) in tests:
            sx, sy = (6 + tx * 16 + 8) * 2, (28 + ty * 16 + 8) * 2   # centre of tile
            await pg.mouse.click(box['x'] + sx, box['y'] + sy); await pg.wait_for_timeout(250)
            st = await pg.evaluate("() => { const v = window.__overhead.app.viewState.floor; return [v.cx, v.cy]; }")
            ok += st == [tx, ty]; print((tx, ty), '->', st)
        print('picked correctly', ok, 'of', len(tests)); await b.close()
asyncio.run(main())
