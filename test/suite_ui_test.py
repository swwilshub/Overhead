# Office suite flow: catalog -> size -> door -> furnish (standard + a computer by keyboard) -> build -> seat someone.
import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
SHOT = str(SHOTS) + '/'
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
async def axe(pg, where):
    await pg.add_script_tag(content=AXE)
    res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].target)")
    ok(not res, f'axe on {where}: {res}')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('#tab-office'); await pg.wait_for_timeout(200)
        await pg.locator('#cat-panel').screenshot(path=SHOT + 'suite_catalog.png')
        await pg.click('[data-key="build-suite"]'); await pg.wait_for_timeout(400)
        ok(await pg.locator('.cell-panel h2:has-text("Office suite")').count() == 1, 'suite designer opens')
        await pg.evaluate("() => { const v = window.__overhead.app.viewState.floor; v.cx = 14; v.cy = 8; }")
        await pg.focus('#floor-app'); await pg.keyboard.press('Enter')
        for _ in range(5): await pg.keyboard.press('ArrowRight')
        for _ in range(4): await pg.keyboard.press('ArrowDown')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        n = await pg.locator('[role=radio]').count(); ok(n == 1, f'one door to place ({n})')
        await pg.click('[data-key="cell-next"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-key="cell-std"]'); await pg.wait_for_timeout(200)
        # add a second desk and a computer, placed by keyboard where legal
        async def place(t, cands):
            await pg.click(f'[data-key="item-{t}"]')
            for (x, y) in cands:
                await pg.evaluate(f"() => {{ const v = window.__overhead.app.viewState.floor; v.cx = {x}; v.cy = {y}; }}")
                await pg.focus('#floor-app'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(80)
                c = await pg.evaluate(f"() => window.__overhead.app.viewState.floor.cell.draft.items.filter(i => i.t === '{t}').length")
                if c: return c
            return 0
        d1 = await pg.evaluate("() => window.__overhead.app.viewState.floor.cell.draft.items[0]")
        cands = [(14 + d1['x'] + dx, 8 + d1['y'] + dy) for dx in range(-1, 4) for dy in range(-1, 2)]
        await pg.click('[data-key="item-opc"]'); await pg.wait_for_timeout(100)
        placed_pc = await place('opc', cands)
        ok(placed_pc >= 1, 'computer placed by keyboard')
        perf = ' '.join((await pg.locator('.cell-metrics').inner_text()).split())
        ok('desk' in perf.lower(), 'suite performance shown: ' + perf[:120])
        await pg.locator('#floor-app').screenshot(path=SHOT + 'suite_furnish.png')
        await pg.locator('#inspector').screenshot(path=SHOT + 'suite_panel.png')
        await axe(pg, 'suite furnishing')
        await pg.click('[data-key="cell-confirm"]'); await pg.wait_for_timeout(400)
        sid = await pg.evaluate("() => window.__overhead.app.st.floor.objects.find(o => o.kind === 'suite')?.id")
        ok(sid is not None, f'suite built (#{sid})')
        ok(await pg.locator('h3:has-text("Occupants")').count() == 1, 'suite inspector lists occupants')
        # move the quick-start salesperson in
        await pg.click('[data-key="suite-add"]'); await pg.wait_for_timeout(300)
        occ = await pg.evaluate("(id) => window.__overhead.app.st.employees.filter(e => e.assign === id).length", sid)
        ok(occ == 1, 'salesperson now sits in the suite')
        await axe(pg, 'suite inspector')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'suite_built.png')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all suite UI checks pass')
asyncio.run(main())
