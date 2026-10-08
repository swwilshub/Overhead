import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def runto(pg, label):
    await pg.click('.status .run button:has-text("Run until")'); await pg.click(f'dialog button:has-text("{label}")')
    for _ in range(60):
        await pg.wait_for_timeout(300)
        if await pg.locator('.status .run button[data-key="speed-0"][aria-pressed="true"]').count(): break
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1366, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(400)
        # second line: an Electronics machine making circuit boards, sold too
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('#tab-f1'); await pg.click('text=Place ($55,000)'); await pg.wait_for_timeout(200)
        box = await pg.locator('#floor-app canvas').bounding_box()
        await pg.mouse.click(box["x"] + 22*17.5, box["y"] + 22*8.5); await pg.wait_for_timeout(300); print("place:", await pg.locator("#live-polite").inner_text(), "|", await pg.locator("#live-assertive").inner_text())
        await pg.click('nav.rail a[href="#hire"]'); await pg.click('[data-key="ad-line_worker"]')
        print("eq rows", await pg.locator("[data-key^=\"eq-\"]").count())
        for wk in range(7):
            await pg.click('nav.rail a[href="#purchasing"]'); await pg.click('text=Suggest targets'); await pg.click('text=Purchase all to target'); await pg.wait_for_timeout(150)
            await runto(pg, 'Friday evening')
            if wk == 0:
                await pg.click('nav.rail a[href="#hire"]'); await pg.wait_for_timeout(200)
                if await pg.locator('[data-key^="res-"]').count():
                    await pg.locator('[data-key^="res-"]').first.click(); await pg.click('dialog button:has-text("Make offer")'); await pg.wait_for_timeout(200)
                    if await pg.locator('dialog[open]').count(): await pg.keyboard.press('Escape')
                await pg.click('nav.rail a[href="#floor"]'); await pg.click('[data-key^="eq-"] >> nth=2'); await pg.wait_for_timeout(200)
                opts = await pg.locator('#mach-op option').all_inner_texts(); print('op options', opts)
                await pg.select_option('#mach-op', index=len(opts)-1); await pg.click('#inspector button:has-text("Assign")')
        print('clock', (await pg.locator('#st-clock').inner_text()).replace('\n', ' '))
        await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(500)
        await pg.focus('[data-key="chart-monthly"]'); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(200)
        print('monthly readout:', await pg.locator('.chart-readout').nth(1).inner_text())
        await pg.screenshot(path=str(SHOTS) + '/r_sales.png', full_page=True)
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/r_canvas.png')
        await pg.click('[data-key^="eq-"] >> nth=0'); await pg.wait_for_timeout(300)
        await pg.locator('#inspector').screenshot(path=str(SHOTS) + '/r_inspector.png')
        await pg.set_viewport_size({'width': 400, 'height': 900}); await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(SHOTS) + '/r_phone_sales.png', full_page=True)
        print('phone scrollWidth', await pg.evaluate('document.documentElement.scrollWidth'), 'ERRORS', errs)
        await b.close()
asyncio.run(main())
