import asyncio, sys, re
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, launch_opts
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
O = "window.__overhead"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(500)
        await pg.click('nav.rail a[href="#hire"]'); await pg.wait_for_timeout(300)
        # one tab per kind of job, Operations first
        tabs = await pg.locator('[role=tab]').all_inner_texts()
        ok(tabs == ['Operations', 'Maintenance', 'Engineering', 'Finance', 'Sales', 'Promotions', 'Purchasing', 'Plant Director'], f'eight tabs: {tabs}')
        ok(await pg.get_attribute('[data-key="hire-tab-operations"]', 'aria-selected') == 'true', 'Operations is selected first')
        # the ladder: three named rungs, with city pay and the number on staff
        rungs = await pg.locator('.ladder li').all_inner_texts()
        ok(len(rungs) == 3 and 'Junior Operator' in rungs[0] and 'Senior Operator' in rungs[1] and 'Operations Director' in rungs[2], f'a three-rung line with titles: {[r.split(chr(10))[0] for r in rungs]}')
        ok(re.search(r'\$[\d,]+', rungs[0]) is not None and 'on staff' in rungs[0], f'each rung shows city pay and the number on staff: {rungs[0]!r}')
        # keyboard: arrows move between tabs and focus follows
        await pg.focus('#hire-tab-operations'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("() => document.activeElement.id") == 'hire-tab-maintenance' and 'maintenance' in (await pg.locator('#hire-panel h2').first.inner_text()).lower(), 'ArrowRight moves to Maintenance and keeps focus')
        await pg.keyboard.press('End'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("() => document.activeElement.id") == 'hire-tab-director' and await pg.locator('.ladder').count() == 0, 'End goes to Plant Director, which has no ladder')
        await pg.keyboard.press('Home'); await pg.wait_for_timeout(200)
        # one advert: place it, see the text, no second button, pay the fee
        cash = await pg.evaluate(f"() => {O}.app.st.bank.checking")
        await pg.click('[data-key="ad-operations"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('[data-key="ad-operations"]').count() == 0 and 'Ad running until' in await pg.locator('#hire-panel').inner_text(), 'the button gives way to "Ad running until ..."')
        ok(cash - await pg.evaluate(f"() => {O}.app.st.bank.checking") == 300, 'the advert cost $300')
        await pg.click('[data-key="hire-tab-maintenance"]'); await pg.wait_for_timeout(200)
        ok(await pg.locator('[data-key="ad-maintenance"]').count() == 1, 'another kind of job can still place its own advert')
        # applicants arrive at more than one level; make an offer and the right job is hired
        WAITING = "m.kind === 'resume' && !m.data.hired && !m.data.gone"
        await pg.evaluate(f"() => {{ for (let i = 0; i < 7; i++) {O}.G.advance({O}.app.st, 1440); }}")
        n = await pg.evaluate(f"() => {O}.app.st.memos.filter(m => {WAITING}).length")
        ok(n >= 2, f'resumes arrive from the advert ({n})')
        await pg.click('[data-key="hire-tab-operations"]'); await pg.wait_for_timeout(300)
        ok(re.search(r'Resumes on file \((\d+)\)', await pg.locator('#hire-panel').inner_text(), re.I) is not None, 'the resumes on file are listed under the ladder')
        titles = await pg.evaluate(f"() => [...new Set({O}.app.st.memos.filter(m => {WAITING}).map(m => m.data.cand.job))]")
        ok(all(t.startswith('operations_') for t in titles), f'applicants for the Operations advert are Operations jobs: {titles}')
        tab = await pg.locator('[data-key="hire-tab-operations"]').inner_text()
        ok(re.search(r'\(\d+\)', tab) is not None, f'the tab counts waiting resumes: {tab!r}')
        first = pg.locator('[data-key^="offer-"]').first
        await first.click(); await pg.wait_for_timeout(300)
        seeking = await pg.locator('dialog[open]').inner_text()
        ok(re.search(r'Seeking\s+(Junior|Senior) Operator|Seeking\s+Operations Director', seeking) is not None, 'the resume dialog names the level')
        before = await pg.evaluate(f"() => {O}.app.st.employees.length")
        await pg.click('dialog[open] .chip:has-text("Ask +5%")'); await pg.click('dialog[open] button.primary'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(f"() => {O}.app.st.employees.length") == before + 1, 'Make offer hires them')
        await axe_check(pg, 'Hiring')
        ok(not errs, f'no page errors {errs[:2]}')
        # phone: the page is short
        ph = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        await ph.goto(URL); await ph.wait_for_timeout(800)
        await ph.tap('text=Quick start'); await ph.wait_for_timeout(500)
        await ph.tap('[data-key="menu"]'); await ph.wait_for_timeout(250); await ph.tap('dialog.menu-sheet [data-key="nav-hire"]'); await ph.wait_for_timeout(400)
        h = await ph.evaluate("() => { const m = document.getElementById('main'); return [m.scrollHeight, m.clientHeight, document.documentElement.scrollWidth]; }")
        ok(h[0] <= h[1] * 1.5, f'at 390 x 844 the Hiring page is {h[0] / h[1]:.1f} screens tall (limit 1.5, was 6.4)')
        ok(h[2] <= 390, f'and does not scroll sideways ({h[2]})')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all hiring UI checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
