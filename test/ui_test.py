import asyncio, sys, json
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
VIEWS = ['floor','catalog','research','staff','hire','inbox','purchasing','sales','bank','reports','city','nation','options']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=str(SHOTS) + '/01_start.png', full_page=True)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=str(SHOTS) + '/02_floor.png')
        # run the clock fast for a few seconds
        await pg.click('.status .run button:has-text("Faster")'); await pg.wait_for_timeout(6000)
        await pg.screenshot(path=str(SHOTS) + '/03_running.png')
        await pg.click('.status .run button:has-text("Pause")')
        for v in VIEWS:
            await pg.click(f'nav.rail a[href="#{v}"]'); await pg.wait_for_timeout(300)
            bad = await pg.locator('text=Something went wrong').count()
            if bad: print('VIEW ERROR', v, await pg.locator('.notice').first.inner_text())
            await pg.screenshot(path=str(SHOTS) + f'/v_{v}.png', full_page=True)
        # run to next month
        await pg.click('.status .run button:has-text("Run until")'); await pg.wait_for_timeout(300)
        await pg.click('dialog button:has-text("Start of next month")'); await pg.wait_for_timeout(9000)
        clock = await pg.locator('#st-clock').inner_text(); print('clock after run:', clock.replace('\n', ' | '))
        await pg.click('nav.rail a[href="#reports"]'); await pg.click('#rt-pl'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(SHOTS) + '/04_pl.png', full_page=True)
        # keyboard on floor
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        await pg.focus('#floor-app')
        for k in ['ArrowRight','ArrowRight','ArrowDown','ArrowDown','ArrowRight']: await pg.keyboard.press(k)
        await pg.wait_for_timeout(500)
        print('live:', await pg.locator('#live-polite').inner_text())
        # axe on each view
        await pg.add_script_tag(content=AXE)
        total = {}
        for v in ['floor','catalog','staff','hire','inbox','purchasing','sales','bank','reports','city','nation','options']:
            await pg.click(f'nav.rail a[href="#{v}"]'); await pg.wait_for_timeout(250)
            res = await pg.evaluate("async () => { const r = await axe.run(document, {resultTypes:['violations']}); return r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary||'').slice(0,160))})) }")
            for x in res:
                total.setdefault(x['id'], []).append((v, x['impact'], x['n'], x['ex']))
        for k, lst in total.items():
            print('AXE', k, [(a, b_, c) for a, b_, c, _ in lst][:6]); print('    e.g.', lst[0][3][:2])
        print('ERRORS', len(errs)); [print('  ', e[:300]) for e in errs[:15]]
        await b.close()
asyncio.run(main())
