# Keyboard and focus (spec 004): global keys from the floor grid, focus that stays put after an action and across live
# redraws, distinct accessible names for repeated buttons, and the "Purchase all to target" announcement.
import asyncio, re
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, launch_opts
from playwright.async_api import async_playwright
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1

ACTIVE = """() => { const a = document.activeElement; return { tag: a.tagName, key: a.dataset?.key || null, id: a.id || null,
  text: (a.textContent || '').trim().slice(0, 60), body: a === document.body, skip: a.classList.contains('skip'),
  row: a.closest('tr') ? a.closest('tr').cells[0].textContent.trim() : null,
  section: a.closest('section,aside,header,nav,main')?.tagName || null } }"""
H1 = "() => document.querySelector('main h1')?.textContent"
async def active(pg): return await pg.evaluate(ACTIVE)
async def polite(pg, ms=750):
    await pg.wait_for_timeout(ms); return await pg.locator('#live-polite').text_content()
async def st(pg, expr): return await pg.evaluate(f"() => {{ const O = window.__overhead, app = O.app, st = app.st, v = app.viewState.floor; return {expr}; }}")
async def nav(pg, view):
    await pg.click(f'nav.rail a[href="#{view}"]'); await pg.wait_for_timeout(250)
async def axe(pg, where):
    await pg.add_script_tag(content=AXE)
    res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].target)")
    ok(not res, f'axe on {where}: {res}')
async def button_names(pg):
    snap = await pg.locator('body').aria_snapshot()
    return [re.sub(r'\\(.)', r'\1', m) for m in re.findall(r'- \'?button "((?:[^"\\]|\\.)*)"', snap)]  # YAML quotes some lines
def dupes(names): return sorted({n for n in names if names.count(n) > 1})
async def grid_at_machine(pg):
    # put the floor cursor on the first production machine and focus the grid
    await st(pg, "(() => { const o = st.floor.objects.find(o => o.kind === 'machine'); v.cx = o.x + 1; v.cy = o.y + 1; v.sel = null; v.mode = 'select'; return o.id; })()")
    await pg.focus('#floor-app')
async def enter_keeps(pg, sel, what, same=True):
    await pg.focus(sel); before = await active(pg)
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(350)
    a = await active(pg)
    good = not a['body'] and not a['skip'] and (a['key'] == before['key'] if same else True)
    ok(good, f'Enter on {what}: focus on {a["tag"]} {a["key"] or a["id"] or a["text"]!r} (was {before["key"]!r})')
    return a

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { window.__overhead.app.st.bank.checking += 500000; }")

        # ---- criterion 1: global keys from the floor grid
        await nav(pg, 'floor'); await pg.focus('#floor-app')
        await pg.keyboard.press(' ')
        ok(await st(pg, 'app.speed') == 1, 'Space on the grid starts the clock')
        ok('Clock running' in (await polite(pg)), 'polite region says the clock is running')
        await pg.keyboard.press(' ')
        ok(await st(pg, 'app.speed') == 0, 'Space on the grid pauses the clock')
        ok('Clock paused' in (await polite(pg)), 'polite region says the clock is paused')
        await pg.keyboard.press(']'); ok(await st(pg, 'app.speed') == 1, '] on the grid speeds up')
        await pg.keyboard.press(']'); ok(await st(pg, 'app.speed') == 2, '] again: fast')
        await pg.keyboard.press('['); await pg.keyboard.press('['); ok(await st(pg, 'app.speed') == 0, '[ twice: paused')
        await pg.keyboard.press('g'); await pg.keyboard.press('h'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(H1) == 'Hiring', 'g h from the grid opens Hiring')
        await pg.keyboard.press('g'); await pg.keyboard.press('f'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(H1) == 'Factory floor', 'g f goes back to the floor')
        await pg.focus('#floor-app'); await pg.keyboard.press('?'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(H1) == 'Options and help', '? from the grid opens Options')
        # g m: City map, and no move starts even with a machine selected
        await nav(pg, 'floor'); await grid_at_machine(pg); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
        sel = await st(pg, 'v.sel'); ok(sel is not None, f'Enter on the grid selects the machine ({sel})')
        await pg.focus('#floor-app'); await pg.keyboard.press('g'); await pg.keyboard.press('m'); await pg.wait_for_timeout(250)
        ok(await st(pg, 'app.view') == 'city', 'g m from the grid opens the City map')
        ok(await st(pg, '[v.mode, v.moving]') == ['select', None], 'g m started no move')
        await nav(pg, 'floor'); await pg.focus('#floor-app'); rot = await st(pg, 'v.rot')
        await pg.keyboard.press('g'); await pg.keyboard.press('r'); await pg.wait_for_timeout(250)
        ok(await st(pg, 'app.view') == 'reports' and await st(pg, 'v.rot') == rot, 'g r opens Reports and does not rotate')
        await nav(pg, 'floor'); await pg.focus('#floor-app')
        await pg.keyboard.press('g'); await pg.keyboard.press('i'); await pg.wait_for_timeout(250)
        ok(await st(pg, 'app.view') == 'inbox', 'g i opens the In-basket, not the inspector')
        # an unrelated key after g is swallowed on the grid; after 1.5 s the grid has its keys back
        await nav(pg, 'floor'); await grid_at_machine(pg); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        await pg.keyboard.press('g'); await pg.wait_for_timeout(1600); await pg.keyboard.press('m'); await pg.wait_for_timeout(200)
        ok(await st(pg, 'v.mode') == 'move', 'M after the g window has passed starts a move as usual')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        help_on = await pg.locator('#floor-help').text_content()
        ok('Space starts or pauses the clock' in help_on and 'g then a letter' in help_on, 'floor help line explains the global keys: ' + help_on[-90:])

        # in the cell editor too
        await nav(pg, 'catalog'); await pg.click('#tab-f2'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="build-cell"]'); await pg.wait_for_timeout(400)
        await st(pg, "(() => { v.cx = 14; v.cy = 8; })()")
        await pg.focus('#floor-app'); await pg.keyboard.press(' ')
        ok(await st(pg, 'app.speed') == 1 and await st(pg, 'v.cell.corner') is None, 'cell editor: Space runs the clock and sets no corner')
        await pg.keyboard.press(' '); await pg.keyboard.press(']'); await pg.keyboard.press('[')
        ok(await st(pg, 'app.speed') == 0, 'cell editor: Space, ] and [ work')
        await pg.keyboard.press('Enter')
        for _ in range(6): await pg.keyboard.press('ArrowRight')
        for _ in range(4): await pg.keyboard.press('ArrowDown')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        ok(await st(pg, 'v.cell.stage') == 'hatch', 'cell editor: Enter sets both corners')
        await pg.click('[data-key="cell-next"]'); await pg.wait_for_timeout(300)

        # ---- criterion 2 in the cell editor: Standard layout and Clear all keep focus
        await enter_keeps(pg, '[data-key="cell-clear"]', 'Clear all')
        await enter_keeps(pg, '[data-key="cell-std"]', 'Standard layout')
        n = await st(pg, 'v.cell.draft.items.length'); ok(n > 0, f'standard layout placed {n} items')
        await axe(pg, 'cell editor, furnish')
        await pg.focus('#floor-app'); await pg.keyboard.press('g'); await pg.keyboard.press('r'); await pg.wait_for_timeout(250)
        ok(await st(pg, 'app.view') == 'reports' and await st(pg, 'v.cell.stage') == 'furnish', 'cell editor: g r opens Reports and leaves the blueprint alone')
        await nav(pg, 'floor')
        await pg.click('[data-key="cell-confirm"]'); await pg.wait_for_timeout(400)
        cell = await st(pg, "st.floor.objects.find(o => o.kind === 'cell')?.id ?? null"); ok(cell is not None, f'cell #{cell} built')
        await pg.evaluate("() => { const O = window.__overhead; O.hire('operator'); O.hire('operator'); }")
        await st(pg, f"(() => {{ v.sel = {cell}; }})()"); await nav(pg, 'staff'); await nav(pg, 'floor')
        a = await enter_keeps(pg, '[data-key="cell-crew"]', 'Add operator', same=False)
        ok(a['section'] in ('SECTION', 'ASIDE'), f'focus stays in the cell panel ({a["section"]})')
        ok(await st(pg, f"st.employees.filter(e => e.assign === {cell}).length") >= 1, 'operator added to the cell')

        # ---- floor inspector: Assign and Retool
        mid = await st(pg, "st.floor.objects.find(o => o.kind === 'machine').id")
        await pg.click(f'[data-key="eq-{mid}"]'); await pg.wait_for_timeout(300)
        await enter_keeps(pg, '[data-key="mach-assign"]', 'Assign')
        await enter_keeps(pg, '[data-key="mach-retool"]', 'Retool')
        names = await button_names(pg)
        ok(not dupes(names), f'floor: no duplicate button names {dupes(names)}')
        sel_names = [x for x in names if x.startswith('Select, ')]
        ok(len(sel_names) >= 2 and any('#' + str(mid) in x for x in sel_names), f'equipment buttons named by row: {sel_names[:3]}')
        await axe(pg, 'floor with a machine selected')

        # ---- shortcuts off: the grid keeps its keys and Space acts like Enter
        await nav(pg, 'options'); await pg.click('#o-keys'); await pg.wait_for_timeout(150)
        await nav(pg, 'floor'); await grid_at_machine(pg)
        await pg.keyboard.press(' '); await pg.wait_for_timeout(150)
        ok(await st(pg, 'app.speed') == 0 and await st(pg, 'v.sel') is not None, 'shortcuts off: Space selects and the clock stays paused')
        await pg.keyboard.press('g'); await pg.keyboard.press('h'); await pg.wait_for_timeout(150)
        ok(await st(pg, 'app.view') == 'floor', 'shortcuts off: g h does nothing')
        ok('Space also selects or places' in await pg.locator('#floor-help').text_content(), 'floor help line says Space selects when shortcuts are off')
        await nav(pg, 'options')
        kb = await pg.locator('section:has(h2:text-is("Keyboard")) table').inner_text()
        ok('on the factory floor too' in kb and 'g then m opens the City map' in kb, 'Options keyboard table explains the floor keys')
        await pg.click('#o-keys'); await pg.wait_for_timeout(150)

        # ---- criterion 2: Hiring, three ads in a row without leaving the table
        await nav(pg, 'hire')
        ads0 = await st(pg, 'st.ads.length')
        await pg.focus('[data-key^="ad-"]')
        for i in range(3):
            before = await active(pg)
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(350)
            a = await active(pg)
            ok(not a['body'] and (a['key'] or '').startswith('ad-') and a['key'] != before['key'], f'ad {i + 1}: focus moves to the next row\'s ad ({before["row"]} -> {a["row"]})')
        ok(await st(pg, 'st.ads.length') == ads0 + 3, 'three ads placed')
        names = await button_names(pg)
        ok(not dupes(names), f'Hiring: no duplicate button names {dupes(names)}')
        title = await st(pg, "O.jobFor('maintenance').title")
        ok(any(re.fullmatch(r'Place ad \(\$\d+\), ' + re.escape(title), x) for x in names), f'ad button named "Place ad ($…), {title}"')
        await axe(pg, 'Hiring')

        # ---- Purchasing: Suggest targets, Purchase all (and its announcement), then live redraws (criterion 3)
        await nav(pg, 'purchasing')
        await enter_keeps(pg, '[data-key="pur-suggest"]', 'Suggest targets')
        await pg.wait_for_timeout(700)
        await enter_keeps(pg, '[data-key="pur-all"]', 'Purchase all to target')
        said = await polite(pg)
        ok(bool(re.search(r'Placed \d+ orders?\.|Stock is already at target levels\.', said or '')), f'Purchase all is announced politely: {said!r}')
        await pg.wait_for_timeout(700)
        await pg.focus('[data-key="pur-all"]'); await pg.keyboard.press('Enter')
        said = await polite(pg)
        ok('Stock is already at target levels.' in (said or ''), f'a second Purchase all says stock is at target: {said!r}')
        await pg.focus('[data-key="pur-suggest"]')
        await pg.evaluate("() => { document.querySelector('main h1').dataset.old = '1'; }")
        await pg.keyboard.press(']'); await pg.keyboard.press(']'); await pg.keyboard.press(']')
        await pg.wait_for_timeout(5000)
        redrawn = await pg.evaluate("() => !document.querySelector('main h1').dataset.old")
        a = await active(pg)
        await pg.keyboard.press('['); await pg.keyboard.press('['); await pg.keyboard.press('[')
        ok(redrawn and a['key'] == 'pur-suggest', f'clock ran 5 s, the page redrew and focus stayed on Suggest targets ({a["key"]})')
        # a control with no data-key of its own keeps focus too
        await pg.focus('button:has-text("See vendors")'); await pg.keyboard.press(']'); await pg.wait_for_timeout(2500); await pg.keyboard.press('[')
        a = await active(pg); ok(a['text'] == 'See vendors', f'focus stays on See vendors across redraws ({a["text"]!r})')
        await axe(pg, 'Purchasing')

        # a real failure stays assertive: every vendor of one item is sold out for the month
        await pg.evaluate("() => { const O = window.__overhead, st = O.app.st, id = [...O.G.ownInputs(st)][0]; st.targets = { [id]: 100000 }; for (const f of st.city.firms) st.vendorBought[f.id + ':' + id] = 1e9; }")
        await pg.focus('[data-key="pur-all"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(700)
        bad = await pg.locator('#live-assertive').text_content(); calm = await pg.locator('#live-polite').text_content()
        ok('left this month' in (bad or ''), f'a failed Purchase all is announced assertively: {bad!r} (polite: {calm!r})')

        # ---- status bar: the "N setup issues" button, reached with real Tab, keeps focus (see the QA finding on spec 004)
        await nav(pg, 'floor')
        await pg.evaluate("() => { const st = window.__overhead.app.st; st.employees.forEach(e => { e.assign = null; }); }")
        await pg.keyboard.press(']'); await pg.wait_for_timeout(1300)
        async def tab_to_alert():
            await pg.evaluate("() => { document.activeElement.blur(); document.body.focus(); }")
            for _ in range(30):
                await pg.keyboard.press('Tab')
                if (await active(pg))['key'] == 'st-alert': return True
            return False
        ok(await tab_to_alert(), 'Tab reaches the setup issues button in the status bar')
        n0 = (await pg.locator('[data-key="st-alert"]').text_content())
        await pg.evaluate("() => { window.__overhead.app.st.strike = true; }")   # one more issue while the clock runs
        await pg.wait_for_timeout(400)
        n1 = (await pg.locator('[data-key="st-alert"]').text_content()); a = await active(pg)
        ok(n1 != n0 and a['key'] == 'st-alert', f'count changed ({n0!r} -> {n1!r}) and focus stayed on the button ({a["key"]!r})')
        await nav(pg, 'floor'); await pg.keyboard.press('g'); await pg.keyboard.press('p'); await pg.wait_for_timeout(300)
        ok(await tab_to_alert(), 'Tab reaches the button on Purchasing with the clock running')
        await pg.wait_for_timeout(3500)   # several full redraws of a live view
        a = await active(pg); ok(a['key'] == 'st-alert', f'focus stayed on the button across full redraws ({a["key"] or a["tag"]!r})')
        await pg.evaluate("() => { const st = window.__overhead.app.st; st.strike = false; st.employees.forEach(e => { e.assign = e.assign ?? st.floor.objects.find(o => o.kind === 'office' || o.kind === 'machine')?.id ?? null; }); }")
        await pg.keyboard.press('['); await pg.wait_for_timeout(300)

        # ---- In-basket: Mark all read
        await nav(pg, 'inbox')
        await enter_keeps(pg, '[data-key="memo-readall"]', 'Mark all read')

        # ---- criterion 4 on Research and Nation
        await nav(pg, 'research')
        names = await button_names(pg)
        ok(not dupes(names), f'Research: no duplicate button names {dupes(names)}')
        tech = await pg.evaluate("() => [...document.querySelectorAll('[data-key^=\"tech-\"]')].map(b => b.closest('tr').querySelector('strong').textContent)")
        ok(tech and all(f'Start, {t}' in names for t in tech), f'cell technology buttons named by technology: {[n for n in names if n.startswith("Start")][:3]}')
        await axe(pg, 'Research')
        await nav(pg, 'nation')
        names = await button_names(pg)
        ok(not dupes(names), f'Nation: no duplicate button names {dupes(names)}')
        first = await pg.evaluate("() => document.querySelector('[data-key^=\"see-\"]').closest('tr').cells[0].textContent")
        ok(f'Details, {first}' in names, f'Details buttons named by city: "Details, {first}"')
        await enter_keeps(pg, '[data-key^="see-"]', 'Details', same=False)
        await axe(pg, 'Nation')

        ok(not errs, f'page errors: {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all keyboard checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
