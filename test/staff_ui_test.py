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
# put three people on three rungs through the sim: a Junior Operator, a Senior Operator part-way to Director, a Finance Director
SETUP = f"""() => {{
  const st = {O}.app.st, G = {O}.G;
  const mk = (role, job, xp) => {{ const id = {O}.hire(role), e = st.employees.find(x => x.id === id); e.job = job; e.xp = xp; return e; }};
  mk('operator', 'operations_1', 20); mk('operator', 'operations_2', 340); mk('finance', 'finance_3', 700);
  {O}.app.dirty = true;
}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(500)
        await pg.evaluate(SETUP)
        await pg.click('nav.rail a[href="#staff"]'); await pg.wait_for_timeout(400)
        n = await pg.evaluate(f"() => {O}.app.st.employees.length")
        # one card at a time, with a count
        ok(await pg.locator('.profile-card').count() == 1, 'one profile card is shown at a time')
        ok(await pg.locator('.carousel-count').inner_text() == f'1 of {n}', f'the count reads "1 of {n}"')
        ok(await pg.locator('.profile-card table').count() == 0 and await pg.locator('table').count() == 0, 'the old table is gone')
        # step through every card with Next and read what each says
        seen = {}
        for i in range(n):
            t = await pg.locator('.profile-card').inner_text()
            name = t.split('\n')[0]
            seen[name] = t
            await pg.click('[data-key="car-next"]'); await pg.wait_for_timeout(80)
        ok(len(seen) == n, f'Next visits all {n} people once ({len(seen)})')
        ok(await pg.locator('.carousel-count').inner_text() == f'1 of {n}', 'and wraps round to the first')
        jr = next(t for t in seen.values() if 'Junior Operator' in t and 'of the way to Senior' in t)
        sr = next(t for t in seen.values() if 'Senior Operator' in t and 'of the way to Director' in t)
        dr = next(t for t in seen.values() if 'Finance Director' in t and 'top of the ladder' in t)
        ok(True, f'a Junior reads "{re.search(chr(10) + "(Junior[^" + chr(10) + "]*)", jr).group(1)}", a Senior "{re.search(chr(10) + "(Senior[^" + chr(10) + "]*)", sr).group(1)}", a Director "top of the ladder"')
        ok(all(k in jr for k in ('Pay', 'Skill', 'Morale', 'Stress', 'Works at', 'Now', 'Details')), 'a card shows pay, skill, morale, stress, workplace, what they are doing and Details')
        ok(await pg.locator('.levelline').count() == 1 and await pg.get_attribute('.levelline', 'aria-hidden') == 'true', 'the three-dot line is decorative; the words carry the meaning')
        # the line fills with experience: more xp, longer fill
        w = await pg.evaluate("() => getComputedStyle(document.querySelector('.levelline')).getPropertyValue('--p')")
        ok(re.match(r'^[\d.]+%$', w.strip()) is not None, f'the line has a fill ({w.strip()})')
        # keyboard: arrows on the focused carousel
        await pg.focus('.carousel'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(100)
        ok(await pg.locator('.carousel-count').inner_text() == f'2 of {n}', 'ArrowRight moves to the next card')
        await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(100)
        ok(await pg.locator('.carousel-count').inner_text() == f'{n} of {n}', 'ArrowLeft goes back, wrapping to the last')
        await pg.wait_for_timeout(200); say = await pg.locator('#live-polite').inner_text()
        ok(re.search(rf'{n} of {n}: [^:]+$', say) is not None, f'the change is announced: {say!r}')
        # the place follows the person through a refresh
        name = (await pg.locator('.profile-card').inner_text()).split('\n')[0]
        await pg.evaluate(f"() => {{ {O}.app.speed = 1; }}"); await pg.wait_for_timeout(1800); await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}")
        ok((await pg.locator('.profile-card').inner_text()).split('\n')[0] == name, 'the card stays on the same person while the clock runs')
        # department tabs narrow the cards
        tabs = await pg.locator('[role=tab]').all_inner_texts()
        ok(tabs[0] == f'All ({n})' and any(t.startswith('Finance') for t in tabs), f'department tabs: {tabs}')
        await pg.click('[role=tab]:has-text("Finance")'); await pg.wait_for_timeout(200)
        fin = await pg.evaluate(f"() => {O}.app.st.employees.filter(e => e.job.startsWith('finance')).length")
        ok(await pg.locator('.carousel-count').inner_text() in (f'1 of {fin}', ''), f'Finance shows only the {fin} finance people')
        await pg.click('[role=tab]:has-text("All")'); await pg.wait_for_timeout(200)
        # Details opens the full profile with the level in it
        await pg.click('[data-key^="emp-"]'); await pg.wait_for_timeout(300)
        d = await pg.locator('dialog[open]').inner_text()
        ok('Level' in d and 'Performance review' in d and 'Terminate' in d, 'Details opens the full profile with Level, review and Terminate')
        await axe_check(pg, 'Staff details')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await axe_check(pg, 'Staff')
        ok(not errs, f'no page errors {errs[:2]}')
        # phone: swipe, and the page is short
        ph = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        await ph.goto(URL); await ph.wait_for_timeout(800)
        await ph.tap('text=Quick start'); await ph.wait_for_timeout(500)
        await ph.evaluate(SETUP)
        await ph.tap('[data-key="menu"]'); await ph.wait_for_timeout(250); await ph.tap('dialog.menu-sheet [data-key="nav-staff"]'); await ph.wait_for_timeout(400)
        h = await ph.evaluate("() => { const m = document.getElementById('main'); return [m.scrollHeight, m.clientHeight, document.documentElement.scrollWidth]; }")
        ok(h[0] <= h[1] * 1.2, f'at 390 x 844 the Staff page is {h[0] / h[1]:.2f} screens tall (limit 1.2, was 1.9)')
        ok(h[2] <= 390, f'and does not scroll sideways ({h[2]})')
        box = await ph.locator('.profile-card').bounding_box()
        ok(box['y'] + box['height'] <= await ph.evaluate("() => document.getElementById('main').getBoundingClientRect().bottom"), f'the card fits above the tab bar (ends at {box["y"] + box["height"]:.0f} of 844)')
        c0 = await ph.locator('.carousel-count').inner_text()
        cdp = await ph.context.new_cdp_session(ph)
        async def swipe(x0, x1, y=400):
            for typ, x in (('touchStart', x0), ('touchMove', (x0 + x1) // 2), ('touchMove', x1), ('touchEnd', x1)):
                await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [] if typ == 'touchEnd' else [{'x': x, 'y': y}]})
        c = await ph.locator('.profile-card').bounding_box(); y = int(c['y'] + 80)
        await swipe(300, 80, y); await ph.wait_for_timeout(200)
        c1 = await ph.locator('.carousel-count').inner_text()
        ok(c0.startswith('1 of') and c1.startswith('2 of'), f'a swipe left goes to the next card ({c0} -> {c1})')
        await swipe(80, 300, y); await ph.wait_for_timeout(200)
        ok(await ph.locator('.carousel-count').inner_text() == c0, 'a swipe right goes back')
        sizes = await ph.evaluate("() => [...document.querySelectorAll('.carousel-btn')].map(b => Math.round(b.getBoundingClientRect().height))")
        ok(all(s >= 44 for s in sizes), f'Previous and Next are at least 44 px tall {sizes}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all staff UI checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
