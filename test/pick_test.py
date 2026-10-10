# Clicking a square picks that square: the corners and a few squares between, at several zoom levels and camera positions.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from env import URL, launch_opts
from playwright.async_api import async_playwright
O = 'window.__overhead'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(500)
        await pg.add_style_tag(content='.floor-hud { display: none !important }')   # the controls over the floor are not what is tested here
        fl = await pg.evaluate(f"() => {{ const f = {O}.app.st.floor; return [f.w, f.h]; }}")
        tests = [(0, 0), (5, 5), (fl[0] - 1, 0), (0, fl[1] - 1), (10, 3), (fl[0] - 1, fl[1] - 1)]
        good = total = 0
        for label, setup in [('Fit', 'fit'), ('1x', 1), ('3x panned', 3)]:
            if setup == 'fit': await pg.evaluate("() => document.querySelector('[data-key=\"ft-fit\"]').click()")
            else: await pg.evaluate(f"() => {{ const v = {O}.app.viewState.floor; v.zoom = {setup}; v.camX = {120 if setup == 3 else 0}; v.camY = {60 if setup == 3 else 0}; }}"); await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(250)
            for (tx, ty) in tests:
                pt = await pg.evaluate(f"([x, y]) => {O}.floorPoint(x, y)", [tx, ty])
                r = await pg.evaluate("() => { const r = document.getElementById('floor-app').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
                if not (r[0] < pt[0] < r[2] and r[1] < pt[1] < r[3]): continue   # off screen at this zoom: nothing to pick
                await pg.mouse.click(pt[0], pt[1]); await pg.wait_for_timeout(120)
                st = await pg.evaluate(f"() => {{ const v = {O}.app.viewState.floor; return [v.cx, v.cy]; }}")
                total += 1; good += st == [tx, ty]
                if st != [tx, ty]: print('MISS', label, (tx, ty), '->', st)
        print('picked correctly', good, 'of', total)
        await b.close()
        assert total >= 10 and good == total, f'{good} of {total}'
asyncio.run(main())
