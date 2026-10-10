import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1366, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(500)
        # run about six weeks so charts have data
        for _ in range(2):
            await pg.click('.status .run button:has-text("Run until")'); await pg.click('dialog button:has-text("Start of next month")')
            for _ in range(40):
                await pg.wait_for_timeout(500)
                if await pg.locator('.status .run button[data-key="speed-0"][aria-pressed="true"]').count(): break
            await pg.wait_for_timeout(300)
        print('clock', (await pg.locator('#st-clock').inner_text()).replace('\n', ' '))
        await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(500)
        await pg.focus('[data-key="chart-daily"]'); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(200)
        print('readout:', await pg.locator('.chart-readout').first.inner_text())
        await pg.screenshot(path=str(SHOTS) + '/c_sales.png', full_page=True)
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => window.__overhead.selectId(window.__overhead.app.st.floor.objects.find(o => !o.fixed && o.kind !== 'conveyor').id)"); await pg.wait_for_timeout(500)
        await pg.locator('#inspector').screenshot(path=str(SHOTS) + '/c_inspector.png')
        await pg.locator('#floor-app').screenshot(path=str(SHOTS) + '/c_canvas.png')
        await pg.add_script_tag(content=AXE)
        for v in ['sales', 'floor']:
            if v == 'sales': await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(300)
            else: await pg.click('nav.rail a[href="#floor"]'); await pg.evaluate("() => window.__overhead.selectId(window.__overhead.app.st.floor.objects.find(o => !o.fixed && o.kind !== 'conveyor').id)"); await pg.wait_for_timeout(300)
            res = await pg.evaluate("async () => (await axe.run(document, {resultTypes:['violations']})).violations.map(v => v.id + ' ' + v.nodes.length + ' ' + v.nodes[0].target.join(' '))")
            print('axe', v, res)
        await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(1700)
        await pg.locator('#inspector').screenshot(path=str(SHOTS) + '/c_inspector_dark.png')
        await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(400); await pg.screenshot(path=str(SHOTS) + '/c_sales_dark.png', full_page=True)
        await pg.set_viewport_size({'width': 400, 'height': 900}); await pg.wait_for_timeout(300)
        print('phone scrollWidth', await pg.evaluate('document.documentElement.scrollWidth'))
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
