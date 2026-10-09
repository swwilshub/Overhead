import asyncio, sys, json, re
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
VIEWS = ['floor','catalog','research','staff','hire','inbox','purchasing','sales','bank','reports','city','nation','options']
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
# Code leaking into the page: null, undefined and NaN as whole words (run together too, as in "nullnull"),
# or a stringified object.
JUNK = re.compile(r'(?<![A-Za-z])(?:null|undefined|NaN)+(?![A-Za-z])|\[object')
async def no_junk_text(pg, where):
    txt = await pg.evaluate("() => document.body.innerText")
    names = await pg.evaluate("() => [...document.querySelectorAll('[aria-label],[aria-valuetext],[title],[alt]')].map(e => ['aria-label','aria-valuetext','title','alt'].map(a => e.getAttribute(a) || '').join(' ')).join('\\n')")
    snap = await pg.locator('body').aria_snapshot()
    hits = []
    for src, t in (('text', txt), ('names', names), ('aria', snap)):
        for m in JUNK.finditer(t): hits.append(f'{src}: ...{t[max(0, m.start() - 40):m.end() + 20]!r}')
    ok(not hits, f'no junk text on {where}' + (f': {hits[:4]}' if hits else ''))
OLD_NAMES = ['Line Worker', 'Account Rep', 'Promotions Specialist', 'Office Assistant', 'Finance Chief', 'Commercial Lead', 'Supply Lead', 'Shift Supervisor', 'Development Engineer', 'Front office', 'Machine shop', 'Furniture shop', 'Plant manager', 'Hand cart', 'Input empty', 'cell cell', 'shop machine', 'arehouse']
async def old_names_gone(pg, where):
    txt = await pg.evaluate("() => document.body.innerText + '\\n' + [...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '')).join('\\n')")
    hits = [w for w in OLD_NAMES if w in txt]
    ok(not hits, f'no old names on {where}' + (f': {hits}' if hits else ''))
async def axe_check(pg, where):
    if not await pg.evaluate("() => !!window.axe"): await pg.add_script_tag(content=AXE)
    res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].target)")
    if res: print('AXE', where, res)
    ok(not res, f'axe on {where}')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=str(SHOTS) + '/01_start.png', full_page=True)
        # title screen: the blurb names only real items, and no code leaks anywhere
        blurb = await pg.locator('p:has-text("American cities and lease a plant")').inner_text()
        ok('magnet wire' in blurb and 'cash registers' in blurb and 'copper' not in blurb, 'title blurb: ' + blurb[:90])
        await no_junk_text(pg, 'title'); await axe_check(pg, 'title')
        # found a company: the status bar shows the company, then the city once chosen, never "null"
        await pg.click('a[href="#new-game"]'); await pg.wait_for_timeout(300)
        await no_junk_text(pg, 'new company form'); await axe_check(pg, 'new company form')
        await pg.fill('#ng-company', 'Junk Check Co'); await pg.fill('#ng-seed', '7')
        await pg.click('text=Found the company'); await pg.wait_for_timeout(500)
        status = await pg.locator('header.status').text_content()
        ok('Junk Check Co' in status and 'null' not in status, 'status bar after founding: ' + ' '.join(status.split()))
        await no_junk_text(pg, 'choose a city')
        cap = await pg.locator('caption:has-text("cities")').inner_text()
        rows = await pg.locator('table:has(caption:has-text("cities")) tbody tr').count()
        ok(cap == f'All {rows} cities' and rows == 42, f'nation table caption "{cap}" matches its {rows} rows')
        await axe_check(pg, 'choose a city')
        await pg.focus('[data-key="city-22"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await pg.click('[data-key="visit"]'); await pg.wait_for_timeout(400)
        city = (await pg.locator('h1').first.text_content()).replace('Lease a building in ', '')
        status = await pg.locator('header.status').text_content()
        ok(city in status and 'Junk Check Co' in status and 'null' not in status, 'status bar on the building screen: ' + ' '.join(status.split()))
        await no_junk_text(pg, 'lease a building'); await axe_check(pg, 'lease a building')
        await pg.goto(URL); await pg.wait_for_timeout(1200)
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
            await no_junk_text(pg, f'{v} view')
        # clearer names: Hiring and Staff tables, the checklist, the In-basket and the memo sender use the new words
        await pg.click('nav.rail a[href="#hire"]'); await pg.wait_for_timeout(300)
        jobs = await pg.locator('table:has(th:has-text("Duties")) tbody tr > :first-child').all_inner_texts()
        want = ['Plant Director', 'Finance Manager', 'Bookkeeper', 'Finance Clerk', 'Sales Manager', 'Sales Rep', 'Marketer', 'Purchasing Manager', 'Materials Buyer', 'Floor Supervisor', 'Machine Operator', 'Chief Engineer', 'Research Engineer', 'Plant Mechanic']
        ok(sorted(j.strip() for j in jobs) == sorted(want), f'Hiring lists the new job titles: {jobs}')
        depts = set(await pg.locator('table:has(th:has-text("Duties")) tbody tr td:nth-child(2)').all_inner_texts())
        ok({'Management', 'Sales', 'Purchasing', 'Finance', 'Production', 'Engineering'} <= {d.strip() for d in depts}, f'Hiring shows the new department names: {depts}')
        await old_names_gone(pg, 'Hiring'); await axe_check(pg, 'Hiring with new names')
        await pg.click('nav.rail a[href="#staff"]'); await pg.wait_for_timeout(300)
        staff = await pg.locator('#main').inner_text()
        ok('Machine Operator' in staff and 'Sales Rep' in staff and 'Purchasing' in staff, 'Staff page: ' + ' '.join(staff.split())[:140])
        await old_names_gone(pg, 'Staff'); await axe_check(pg, 'Staff with new names')
        await pg.click('nav.rail a[href="#inbox"]'); await pg.wait_for_timeout(300)
        await old_names_gone(pg, 'In-basket')
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        cl = await pg.locator('#inspector').inner_text()
        ok('Hire a Machine Operator' in cl and 'Hire a Sales Rep and give them a desk' in cl, 'checklist uses the job titles: ' + ' '.join(cl.split())[:200])
        eq = await pg.locator('table:has(th:has-text("Status / occupant"))').inner_text()
        ok(re.search(r'machine #\d+', eq) and 'Machine #' not in eq, 'equipment table uses one machine label: ' + ' '.join(eq.split())[:120])
        await old_names_gone(pg, 'Factory floor')
        # select a machine, then an empty square: the checklist and Cursor card come back, not "[object HTMLElement]"
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        box = await pg.locator('#floor-app canvas').bounding_box()
        async def click_tile(tx, ty):
            await pg.mouse.click(box['x'] + (6 + tx * 16 + 8) * 2, box['y'] + (28 + ty * 16 + 8) * 2); await pg.wait_for_timeout(200)
        sel = lambda: pg.evaluate("() => window.__overhead.app.viewState.floor.sel")
        mc = await pg.evaluate("() => { const o = window.__overhead.app.st.floor.objects.find(o => o.kind === 'machine'); return [o.id, Math.round(o.x), Math.round(o.y)]; }")
        await click_tile(mc[1], mc[2])
        ok(await sel() == mc[0], 'machine selected by click')
        panel = await pg.locator('#inspector').inner_text()
        lab = await pg.evaluate("() => { const {app} = window.__overhead; const o = app.st.floor.objects.find(o => o.kind === 'machine'); return document.querySelector('#inspector h2').textContent; }")
        ok(re.fullmatch(r'.+ line machine #\d+', lab.strip()) is not None, f'machine panel heading is the one label: {lab}')
        ok('Operator' in panel and 'Line Worker' not in panel and 'Hire an operator' not in panel, 'machine panel names the Operator')
        await old_names_gone(pg, 'machine panel'); await axe_check(pg, 'machine panel with new names')
        fw, fh = await pg.evaluate("() => { const f = window.__overhead.app.st.floor; return [f.w, f.h]; }")
        for (tx, ty) in [(fw // 2, fh - 3), (fw - 3, fh - 3), (3, fh - 3), (fw // 2, fh // 2), (fw - 3, 3)]:
            await click_tile(tx, ty)
            if await sel() is None: break
        insp = await pg.locator('#inspector').text_content()
        ok(await sel() is None and 'Getting started' in insp and 'Cursor' in insp and '[object' not in insp, 'empty square shows the checklist and Cursor card: ' + ' '.join(insp.split())[:120])
        ok(await pg.evaluate("() => document.activeElement?.id") == 'floor-app', 'focus stays on the floor grid')
        await no_junk_text(pg, 'floor after selecting an empty square'); await axe_check(pg, 'floor after selecting an empty square')
        # cell editor, furnish step with a standard layout: no "null" in the Performance block
        await pg.evaluate("() => { window.__overhead.app.st.bank.checking += 400000; }")
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('#tab-f2'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="build-cell"]'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { const v = window.__overhead.app.viewState.floor; v.cx = 14; v.cy = 8; }")
        await pg.focus('#floor-app'); await pg.keyboard.press('Enter')
        for _ in range(6): await pg.keyboard.press('ArrowRight')
        for _ in range(4): await pg.keyboard.press('ArrowDown')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await no_junk_text(pg, 'cell editor hatches')
        await pg.click('[data-key="cell-next"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-key="cell-std"]'); await pg.wait_for_timeout(300)
        ch = (await pg.locator('#cell-ed-h').text_content()).strip()
        ok(re.fullmatch(r'.+ cell', ch) and 'cell cell' not in ch.lower() and 'line cell' not in ch.lower(), f'cell editor title: {ch}')
        perf = await pg.locator('.cell-metrics').text_content()
        ok('Speed' in perf and 'null' not in perf, 'cell Performance block: ' + ' '.join(perf.split())[-120:])
        await no_junk_text(pg, 'cell editor furnish'); await axe_check(pg, 'cell editor furnish')
        await pg.click('[data-key="cell-cancel"]'); await pg.click('dialog button:has-text("Cancel blueprint")'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { window.__overhead.app.st.bank.checking -= 400000; }")
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
        for v in ['floor','catalog','research','staff','hire','inbox','purchasing','sales','bank','reports','city','nation','options']:
            await pg.click(f'nav.rail a[href="#{v}"]'); await pg.wait_for_timeout(250)
            await no_junk_text(pg, f'{v} view after a month')
            res = await pg.evaluate("async () => { const r = await axe.run(document, {resultTypes:['violations']}); return r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary||'').slice(0,160))})) }")
            for x in res:
                total.setdefault(x['id'], []).append((v, x['impact'], x['n'], x['ex']))
        for k, lst in total.items():
            print('AXE', k, [(a, b_, c) for a, b_, c, _ in lst][:6]); print('    e.g.', lst[0][3][:2])
        print('ERRORS', len(errs)); [print('  ', e[:300]) for e in errs[:15]]
        await b.close()
    print(f'{fails} FAILED' if fails else 'all ui checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
