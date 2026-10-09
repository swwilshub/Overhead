# Everything on one screen on a phone (spec 016): every section, and the common dialogs, fit without scrolling, at three phone sizes,
# with plenty of content in them; the pager's tabs, arrows and swipe move through the pages.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, launch_opts
from playwright.async_api import async_playwright
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
async def axe_check(pg, where):
    if not await pg.evaluate("() => !!window.axe"): await pg.add_script_tag(content=AXE)
    res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].target)")
    if res: print('AXE', where, res)
    ok(not res, f'axe on {where}')
O = 'window.__overhead'
SIZES = [('390x844', 390, 844, 'a phone'), ('360x740', 360, 740, 'a small phone'), ('844x390', 844, 390, 'a phone on its side')]
SECTIONS = ['floor', 'staff', 'hire', 'inbox', 'purchasing', 'sales', 'bank', 'reports', 'research', 'catalog', 'city', 'nation', 'options']
# plenty to look at: several lines, staff in every department, adverts and resumes, loans, a month of memos and sales
FILL = """() => {
  const o = window.__overhead, st = o.app.st, G = o.G; st.bank.checking += 400000;
  const lines = [...new Set(o.RECIPES.filter(r => r.start).map(r => r.family))].slice(0, 6); let x = 2, y = 3;
  for (const f of lines) { const r = o.RECIPES.find(r => r.start && r.family === f); G.placeEquipment(st, { kind: 'machine', family: f, x, y, rot: 0, recipe: r.id }); x += 9; if (x > 24) { x = 2; y += 6; } }
  for (const role of ['operator', 'operator', 'maintenance', 'finance', 'sales', 'marketing', 'purchasing', 'foreman']) o.hire(role);
  for (const fam of ['operations', 'maintenance', 'engineering', 'finance', 'sales', 'purchasing']) G.placeAd(st, fam);
  G.takeLoan(st, 20000, 3); G.takeLoan(st, 30000, 2); G.purchaseAll(st);
  for (let i = 0; i < 40; i++) G.advance(st, 1440 / 2);
  for (let i = 0; i < 10; i++) G.advance(st, 1440);
  o.app.dirty = true;
}"""
async def nav(pg, v):
    await pg.tap('[data-key="menu"]'); await pg.wait_for_timeout(200); await pg.tap(f'dialog.menu-sheet [data-key="nav-{v}"]'); await pg.wait_for_timeout(500)
async def metrics(pg):
    return await pg.evaluate("""() => { const m = document.getElementById('main'); const ps = [...document.querySelectorAll('.pager')].map(p => p.pagerState());
      return { main: [m.scrollHeight, m.clientHeight], doc: [document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth], overflow: ps.flatMap(p => p.overflow), pagers: ps.length, pages: ps.flatMap(p => Object.values(p.pages).map(x => x.length)) }; }""")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        errs = []
        # ---- the start page, before a game
        for tag, w, h, what in SIZES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(800)
            m = await metrics(pg)
            ok(m['main'][0] <= m['main'][1] + 1 and not m['overflow'] and m['pagers'] == 1, f'start page on {what} ({tag}): fits, {m["pagers"]} pager, overflow {m["overflow"]}, {m["main"]}')
            await ctx.close()
        # ---- every section
        for tag, w, h, what in SIZES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(700); await pg.tap('text=Quick start'); await pg.wait_for_timeout(700)
            await pg.evaluate(FILL); await pg.wait_for_timeout(300)
            for v in SECTIONS:
                await nav(pg, v)
                await pg.evaluate("() => document.querySelectorAll('.toast, #toasts > *').forEach(t => t.remove())")
                m = await metrics(pg)
                one = m['main'][0] <= m['main'][1] + 1 and m['doc'][0] <= 1 and m['doc'][1] <= 0 and not m['overflow']
                ok(one, f'{v} on {what} ({tag}) fits: main {m["main"]}, page {m["doc"]}, overflowing pages {m["overflow"]}, {m["pagers"]} pager')
                if v != 'floor':
                    shown = await pg.evaluate("() => [...document.querySelectorAll('.pg-group:not([hidden]) .pg-body > *:not([hidden])')].filter(e => e.getBoundingClientRect().height > 0).length")
                    ok(shown > 0, f'{v} on {what} ({tag}) shows something on its first page ({shown} blocks)')
                if v != 'floor' and tag == '390x844':
                    ok(m['pagers'] == 1 and max(m['pages'] or [1]) >= 1, f'{v} is a pager')
            # a phone: the controls
            if tag == '390x844':
                await nav(pg, 'purchasing')
                small = await pg.evaluate("() => [...document.querySelectorAll('.pager-tabs button, .pager-btn')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 43.5)).map(e => e.dataset.key + ' ' + Math.round(e.getBoundingClientRect().height))")
                ok(not small, f'tabs and arrows are at least 44 px tall {small}')
                await nav(pg, 'sales')
                g0 = await pg.evaluate("() => document.querySelector('.pager').pagerState().group")
                await pg.tap('[data-key="pg-next"]'); await pg.wait_for_timeout(250)
                g1 = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                ok(g1 != [g0, 0], f'Next moves to another page ({g0} -> {g1})')
                say = await pg.evaluate("() => document.querySelector('.pager [aria-live=polite]').textContent")
                ok(len(say) > 3, f'the page change is announced: {say!r}')
                await pg.tap('[data-key="pg-prev"]'); await pg.wait_for_timeout(250)
                g2 = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                ok(g2 == [g0, 0], 'and Previous comes back')
                # a swipe moves a page, from a finger
                cdp = await ctx.new_cdp_session(pg)
                async def swipe(x0, x1, y):
                    for typ, x in (('touchStart', x0), ('touchMove', (x0 + x1) // 2), ('touchMove', x1), ('touchEnd', x1)):
                        await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [] if typ == 'touchEnd' else [{'x': x, 'y': y}]})
                await swipe(300, 80, 400); await pg.wait_for_timeout(300)
                g3 = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                ok(g3 != [g0, 0], f'a swipe left goes to the next page ({g3})')
                await swipe(80, 300, 400); await pg.wait_for_timeout(300)
                g4 = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                ok(g4 == [g0, 0], 'and a swipe right comes back')
                # keyboard on the tabs
                await pg.focus('[role=tab][aria-selected=true]'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(200)
                ok(await pg.evaluate("() => document.activeElement.getAttribute('role') === 'tab' && document.activeElement.getAttribute('aria-selected') === 'true'"), 'ArrowRight moves along the tabs and focus follows')
                # the place is kept across the one-second redraws
                before = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                await pg.evaluate(f"() => {{ {O}.app.speed = 3; }}"); await pg.wait_for_timeout(2300); await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}")
                after = await pg.evaluate("() => { const s = document.querySelector('.pager').pagerState(); return [s.group, s.page]; }")
                ok(before == after, f'the page is kept while the clock runs ({before} -> {after})')
                for v in ('staff', 'hire', 'bank', 'options'):
                    await nav(pg, v); await axe_check(pg, f'{v} as pages on a phone')
            await ctx.close()
        # ---- the panels on the floor: an item's Details and the cell designer are pages in a sheet, never a scroll
        PANEL = """() => { const el = document.getElementById('inspector'); const p = el.querySelector('.pager'); const s = p && p.pagerState();
          return { sheet: [el.scrollHeight, el.clientHeight], doc: document.documentElement.scrollHeight - innerHeight, overflow: s ? s.overflow : null, pages: s ? Object.values(s.pages).map(x => x.length) : null, paged: !!p } }"""
        for tag, w, h, what in SIZES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(700); await pg.tap('text=Quick start'); await pg.wait_for_timeout(700)
            await pg.evaluate(FILL); await pg.wait_for_timeout(300)
            for kind in ('machine', 'office'):
                oid = await pg.evaluate(f"() => {{ const o = {O}.app.st.floor.objects.find(o => o.kind === '{kind}'); return o && o.id }}")
                if oid is None: continue
                await pg.evaluate(f"() => {O}.selectId({oid})"); await pg.wait_for_timeout(400)
                await pg.evaluate("() => document.querySelector('[data-key=sheet-more]').click()"); await pg.wait_for_timeout(500)
                m = await pg.evaluate(PANEL)
                ok(m['paged'] and m['sheet'][0] <= m['sheet'][1] + 1 and m['doc'] <= 0 and not m['overflow'], f"{kind} Details on {what} ({tag}) fits as {m['pages']} page(s): {m}")
                if kind == 'machine' and tag == '390x844':
                    n = await pg.evaluate("() => document.querySelector('#inspector .pager').pagerState().pages.details.length")
                    ok(n > 1, f'a machine has several pages of details ({n})')
                    await pg.tap('#inspector [data-key="pg-next"]'); await pg.wait_for_timeout(250)
                    ok(await pg.evaluate("() => document.querySelector('#inspector .pager').pagerState().page") == 1, 'Next in the sheet goes to its second page')
                    await axe_check(pg, 'a machine\'s details as pages')
                await pg.evaluate("() => document.querySelector('[data-key=sheet-close]').click()"); await pg.wait_for_timeout(200)
            await ctx.close()
            # the designer: size, hatches, furnish (on an empty floor, so the corners are free)
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(700); await pg.tap('text=Quick start'); await pg.wait_for_timeout(700)
            await pg.evaluate(f"() => {{ {O}.app.st.bank.checking += 400000; }}")
            await nav(pg, 'catalog'); await pg.locator('[data-key="build-cell"]:visible').first.tap(); await pg.wait_for_timeout(600)
            m = await pg.evaluate(PANEL); ok(m['paged'] and m['sheet'][0] <= m['sheet'][1] + 1 and not m['overflow'], f'the designer (size) on {what} ({tag}): {m}')
            await pg.evaluate(f"() => {{ const v = {O}.app.viewState.floor; v.cx = 14; v.cy = 8; }}")
            await pg.focus('#floor-app'); await pg.keyboard.press('Enter')
            for _ in range(6): await pg.keyboard.press('ArrowRight')
            for _ in range(4): await pg.keyboard.press('ArrowDown')
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
            m = await pg.evaluate(PANEL); ok(m['paged'] and m['sheet'][0] <= m['sheet'][1] + 1 and not m['overflow'], f'the designer (hatches) on {what} ({tag}): {m}')
            await pg.evaluate("() => [...document.querySelectorAll('#inspector button')].find(b => /furnish/i.test(b.textContent)).click()"); await pg.wait_for_timeout(500)
            m = await pg.evaluate(PANEL); ok(m['paged'] and m['sheet'][0] <= m['sheet'][1] + 1 and not m['overflow'], f'the designer (furnish) on {what} ({tag}): {m}')
            ok(await pg.evaluate("() => !!document.querySelector('#inspector [data-key=cell-confirm]') && !!document.querySelector('#inspector [data-key=cell-cancel]')"), 'Confirm and Cancel stay on screen under the pages')
            await ctx.close()
        # ---- the common dialogs
        for tag, w, h, what in SIZES[1:]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(700); await pg.tap('text=Quick start'); await pg.wait_for_timeout(700)
            await pg.evaluate(f"() => {{ {O}.G.placeAd({O}.app.st, 'sales'); for (let i = 0; i < 7; i++) {O}.G.advance({O}.app.st, 1440); {O}.app.dirty = true; }}")
            async def dlg(label):
                await pg.wait_for_timeout(400)
                r = await pg.evaluate("() => { const d = document.querySelector('dialog[open]'); if (!d) return null; const x = d.querySelector('.dlg'); const ps = [...d.querySelectorAll('.pager')].map(p => p.pagerState().overflow); return [x.scrollHeight, x.clientHeight, ps.flat()]; }")
                ok(r is not None and r[0] <= r[1] + 1 and not r[2], f'{label} fits on {what} ({tag}): {r}')
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            async def reveal(sel):
                for _ in range(12):
                    if await pg.locator(sel + ':visible').count(): return pg.locator(sel + ':visible').first
                    await pg.tap('[data-key="pg-next"]'); await pg.wait_for_timeout(150)
                raise Exception('not found ' + sel)
            for k, label in (('hud-help', 'Help'), ('hud-legend', 'Legend'), ('hud-equipment', 'the equipment list')):
                await pg.tap(f'[data-key="{k}"]'); await dlg(label)
            await nav(pg, 'hire'); await pg.tap('[data-key="pg-sales"]'); await pg.wait_for_timeout(300)
            await (await reveal('[data-key^="offer-"]')).tap(); await dlg('the resume and offer')
            await nav(pg, 'purchasing'); await (await reveal('[data-key^="buy-"]')).tap(); await dlg('the buy dialog')
            await nav(pg, 'bank'); await pg.tap('[data-key="pg-borrow"]'); await pg.wait_for_timeout(300); await pg.tap('text=Apply for loan'); await dlg('the loan confirmation')
            vac = await pg.evaluate(f"() => {O}.app.st.city.lots.find(l => l.firm == null && l.id !== {O}.app.st.lotId).id")
            await nav(pg, 'city'); await pg.evaluate(f"() => {{ {O}.app.viewState.city.sel = {vac}; }}"); await nav(pg, 'floor'); await nav(pg, 'city'); await pg.tap('[data-key="pg-lot"]'); await pg.wait_for_timeout(300)
            await pg.locator('[data-key="move-here"]').tap(); await dlg('the move plan')
            await ctx.close()
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all one-screen checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
