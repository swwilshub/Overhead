# Relocation UI: city map -> Move here dialog with a layout preview -> construction site animation -> moved plant.
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
        # a second machine and a belt, so there is a layout to carry over
        await pg.evaluate("""() => { const {app, G} = window.__overhead, st = app.st; st.bank.checking += 500000;
          const A = st.floor.objects.find(o => o.kind === 'machine'), R = window.__overhead.RECIPES.find(r => r.start && r.family !== A.family);
          const B = G.placeEquipment(st, { kind: 'machine', family: R.family, x: 12, y: 9, recipe: R.id }); }""")
        big = await pg.evaluate("() => { const st = window.__overhead.app.st; return st.city.lots.filter(l => l.firm == null && l.id !== st.lotId).sort((a, b) => b.sqft - a.sqft)[0].id; }")
        await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(300)
        await pg.click(f'[data-key="lot-{big}"]'); await pg.wait_for_timeout(200)
        ok(await pg.locator('[data-key="move-here"]').count() == 1, 'vacant lot offers "Move the factory here"')
        await pg.click('[data-key="move-here"]'); await pg.wait_for_timeout(400)
        dlg = ' '.join((await pg.locator('dialog[open]').inner_text()).split())
        ok('Due today' in dlg and 'days' in dlg, 'dialog shows cost and duration: ' + dlg[:200])
        w = await pg.evaluate("() => document.querySelector('dialog[open] canvas.move-preview').width")
        ok(w > 100, f'layout preview drawn ({w}px wide)')
        await pg.locator('dialog[open]').screenshot(path=SHOT + 'move_dialog.png')
        await axe(pg, 'move dialog')
        await pg.click('dialog[open] button.primary'); await pg.wait_for_timeout(500)
        mv = await pg.evaluate("() => { const st = window.__overhead.app.st; return st.move && { lot: st.move.lotId, days: st.move.days, n: st.move.order.length }; }")
        ok(mv and mv['lot'] == big, f'move started: {mv}')
        ok(await pg.locator('[data-key="site-new"][aria-selected=true]').count() == 1, 'floor opens on the new site tab')
        # half way: blueprint + scaffolding + crane
        await pg.evaluate("() => { const {app, G} = window.__overhead; const st = app.st; G.advance(st, Math.round((st.move.end - st.time) * 0.5)); }")
        await pg.click('[data-key="site-old"]'); await pg.click('[data-key="site-new"]'); await pg.wait_for_timeout(200)
        await pg.evaluate("() => { window.__overhead.app.speed = 1; }"); await pg.wait_for_timeout(1500)
        await pg.locator('#floor-app').screenshot(path=SHOT + 'move_build.png')
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        panel = ' '.join((await pg.locator('#inspector').inner_text()).split())
        ok('% built' in panel, 'construction panel: ' + panel[:160])
        await axe(pg, 'construction site')
        # city map shows the site
        await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(300)
        lbl = await pg.get_attribute(f'[data-key="lot-{big}"]', 'aria-label')
        ok('under construction' in lbl, 'city map marks the construction: ' + lbl)
        await pg.locator('.city-grid').screenshot(path=SHOT + 'move_city.png')
        # finish
        await pg.evaluate("() => { const {app, G} = window.__overhead; const st = app.st; G.advance(st, st.move.end - st.time + 60); }")
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(400)
        lot = await pg.evaluate("() => window.__overhead.app.st.lotId")
        ok(lot == big and await pg.locator('[data-key="site-new"]').count() == 0, 'move complete: the plant is at the new building')
        n = await pg.evaluate("() => window.__overhead.app.st.floor.objects.filter(o => o.kind === 'machine').length")
        ok(n == 2, f'both machines came along ({n})')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'move_done.png')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all move UI checks pass')
asyncio.run(main())
