# Cell blueprint flow: catalog -> size -> hatches -> furnish (standard layout + an extra by keyboard) -> build -> crew -> runs.
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
async def live(pg):
    await pg.wait_for_timeout(250)
    return await pg.evaluate("() => [...document.querySelectorAll('[aria-live]')].map(e => e.textContent).join(' | ')")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { window.__overhead.app.st.bank.checking += 400000; }")
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('#tab-f2'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="build-cell"]'); await pg.wait_for_timeout(400)
        ok(await pg.locator('.cell-panel').count() == 1, 'blueprint panel opens on the floor')
        # size: corner at (14,2), opposite at (20,6) -> 7x5
        await pg.evaluate("() => { const v = window.__overhead.app.viewState.floor; v.cx = 14; v.cy = 8; }")
        await pg.focus('#floor-app'); await pg.keyboard.press('Enter')
        for _ in range(6): await pg.keyboard.press('ArrowRight')
        for _ in range(4): await pg.keyboard.press('ArrowDown')
        await pg.wait_for_timeout(300); print('size says:', (await live(pg))[-160:])
        await pg.locator('#floor-app').screenshot(path=SHOT + 'cell_1size.png')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        stage = await pg.evaluate("() => window.__overhead.app.viewState.floor.cell?.stage")
        ok(stage == 'hatch', 'room set, now on hatches')
        n = await pg.locator('[role=radio]').count(); ok(n == 5, f'{n} hatches to place (door, 3 inputs, output)')
        # move the output hatch to the back wall above the right side: pick it, then Enter at (19,1)
        await pg.click('[data-key="hatch-out"]'); await pg.evaluate("() => { const v = window.__overhead.app.viewState.floor; v.cx = 19; v.cy = 7; }")
        await pg.focus('#floor-app'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('Enter')
        hz = await pg.evaluate("() => window.__overhead.app.viewState.floor.cell.draft.hatches.find(h => h.role === 'out')")
        ok(hz['ly'] == -1, f'output hatch moved to the back wall: {hz}')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'cell_2hatch.png')
        await axe(pg, 'hatch stage')
        await pg.click('[data-key="cell-next"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-key="cell-std"]'); await pg.wait_for_timeout(300)
        perf = await pg.locator('.cell-metrics').inner_text()
        ok('Speed' in perf, 'performance shown while furnishing: ' + ' '.join(perf.split())[:140])
        # keyboard: pick a spares cabinet and place it somewhere legal
        await pg.click('[data-key="item-spares"]')
        placed = False
        for (x, y) in [(20, 12), (14, 12), (20, 8), (14, 8), (17, 12), (16, 12), (15, 8), (18, 8)]:
            await pg.evaluate(f"() => {{ const v = window.__overhead.app.viewState.floor; v.cx = {x}; v.cy = {y}; }}")
            await pg.focus('#floor-app'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(120)
            cnt = await pg.evaluate("() => window.__overhead.app.viewState.floor.cell.draft.items.filter(i => i.t === 'spares').length")
            if cnt: placed = True; break
        ok(placed, 'spares cabinet placed by keyboard')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'cell_3furnish.png')
        await pg.locator('#inspector').screenshot(path=SHOT + 'cell_3panel.png')
        await axe(pg, 'furnish stage')
        cash0 = await pg.evaluate("() => window.__overhead.app.st.bank.checking")
        await pg.click('[data-key="cell-confirm"]'); await pg.wait_for_timeout(400)
        cell = await pg.evaluate("() => { const c = window.__overhead.app.st.floor.objects.find(o => o.kind === 'cell'); return c && { id: c.id, items: c.items.length, cw: c.cw, ch: c.ch }; }")
        cash1 = await pg.evaluate("() => window.__overhead.app.st.bank.checking")
        ok(cell and cell['cw'] == 7 and cell['ch'] == 5, f'cell built: {cell}, paid {cash0 - cash1:.0f}')
        # inspector: add the operator (move the quick-start operator)
        ok(await pg.locator('h3:has-text("Crew")').count() == 1, 'cell inspector shows the crew')
        await pg.click('[data-key="cell-crew"]'); await pg.wait_for_timeout(300)
        crew = await pg.evaluate("(id) => window.__overhead.app.st.employees.filter(e => e.assign === id).length", cell['id'])
        ok(crew == 1, 'operator added to the crew')
        await axe(pg, 'cell inspector')
        # run a day
        await pg.evaluate("() => { const {app, G} = window.__overhead; G.purchaseAll(app.st); for (const o of app.st.orders) o.eta = app.st.time; G.advance(app.st, 1440 * 2); }")
        made = await pg.evaluate("(id) => window.__overhead.app.st.floor.objects.find(o => o.id === id).produced", cell['id'])
        ok(made > 0, f'cell produced {made} units in two days')
        await pg.evaluate("() => { window.__overhead.app.speed = 1; }"); await pg.wait_for_timeout(1500)
        await pg.locator('#floor-app').screenshot(path=SHOT + 'cell_4running.png')
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        # edit: open editor, remove the spares cabinet, confirm, expect a refund
        await pg.click('[data-key="cell-edit"]'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("() => window.__overhead.app.viewState.floor.cell?.editingId") == cell['id'], 'edit mode opens on the built cell')
        await pg.evaluate("() => { const E = window.__overhead.app.viewState.floor.cell; E.draft.items = E.draft.items.filter(i => i.t !== 'spares'); }")
        await pg.click('[data-key="cell-std"]'); await pg.wait_for_timeout(200)
        cashA = await pg.evaluate("() => window.__overhead.app.st.bank.checking")
        await pg.click('[data-key="cell-confirm"]'); await pg.wait_for_timeout(300)
        cashB = await pg.evaluate("() => window.__overhead.app.st.bank.checking")
        ok(cashB > cashA, f'removing an extra refunds money ({cashB - cashA:.0f})')
        # research page has cell technology
        await pg.click('nav.rail a[href="#research"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('h2:has-text("Cell technology")').count() == 1, 'research page lists cell technology')
        await axe(pg, 'research page')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all cell UI checks pass')
asyncio.run(main())
