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
SECTIONS = ['floor', 'catalog', 'research', 'staff', 'hire', 'inbox', 'purchasing', 'sales', 'bank', 'reports', 'city', 'nation', 'options']
NUMBER_BOXES = "() => document.querySelectorAll('input[type=number], input[inputmode=numeric], input[inputmode=decimal]').length"
async def val(pg, sel): return (await pg.locator(sel).first.inner_text()).strip()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        # ---- new company: the scenario number is a stepper; 0 reads Random
        ok(await val(pg, '[data-key="seed"]') == 'Random', 'the scenario number starts as "Random"')
        await pg.click('[data-key="seed-plus"]'); ok(await val(pg, '[data-key="seed"]') == '1', 'plus makes it 1')
        await pg.click('[data-key="seed-roll"]'); n = await val(pg, '[data-key="seed"]')
        ok(re.fullmatch(r'\d+', n) is not None and int(n) >= 1, f'Roll picks a number ({n})')
        await pg.focus('[data-key="seed"]'); await pg.keyboard.press('Home'); ok(await val(pg, '[data-key="seed"]') == 'Random', 'Home goes back to Random')
        ok(await pg.evaluate(NUMBER_BOXES) == 0, 'no number boxes on the start page')
        await pg.click('text=Quick start'); await pg.wait_for_timeout(700)
        # ---- Purchasing: compact steppers in the table
        await pg.click('nav.rail a[href="#purchasing"]'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(NUMBER_BOXES) == 0, 'no number boxes on Purchasing')
        key = await pg.locator('[role=spinbutton][data-key^="tgt-"]').first.get_attribute('data-key'); iid = key[4:]
        t0 = int(await val(pg, f'[data-key="{key}"]'))
        await pg.click(f'[data-key="{key}-plus"]'); await pg.wait_for_timeout(100)
        ok(int(await val(pg, f'[data-key="{key}"]')) == t0 + 1 and await pg.evaluate(f"() => {O}.app.st.targets[{iid}]") == t0 + 1, f'plus raises a target by one and the game keeps it ({t0} -> {t0 + 1})')
        await pg.focus(f'[data-key="{key}"]'); await pg.keyboard.press('PageUp'); await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(100)
        ok(int(await val(pg, f'[data-key="{key}"]')) == t0 + 10, 'Page Up adds ten and the down arrow takes one off')
        await pg.keyboard.press('Home'); await pg.wait_for_timeout(100)
        ok(int(await val(pg, f'[data-key="{key}"]')) == 0 and await pg.locator(f'[data-key="{key}-minus"]').is_disabled(), 'Home goes to zero and minus is disabled there')
        # hold to repeat, and speed up
        box = await pg.locator(f'[data-key="{key}-plus"]').bounding_box()
        await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await pg.mouse.down()
        await pg.wait_for_timeout(1800); await pg.mouse.up()
        held = int(await val(pg, f'[data-key="{key}"]'))
        ok(held >= 8, f'holding plus for a second and a half repeats and speeds up ({held})')
        # a live page does not redraw under a focused stepper
        await pg.wait_for_timeout(900)   # the page redraws once, half a second after the last change
        await pg.focus(f'[data-key="{key}"]')
        await pg.evaluate(f"() => {{ document.querySelector('[data-key=\"{key}\"]').__mark = 1; {O}.app.speed = 1; }}"); await pg.wait_for_timeout(2300)
        await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}")
        ok(await pg.evaluate(f"() => document.querySelector('[data-key=\"{key}\"]')?.__mark === 1"), 'the page does not redraw while a stepper has focus')
        await pg.evaluate("() => document.activeElement.blur()")
        # a second set target survives the first: both are in the game
        k2 = await pg.locator('[role=spinbutton][data-key^="tgt-"]').count()
        if k2 > 1:
            key2 = await pg.locator('[role=spinbutton][data-key^="tgt-"]').nth(1).get_attribute('data-key')
            await pg.click(f'[data-key="{key2}-plus"]'); await pg.wait_for_timeout(100)
            tg = await pg.evaluate(f"() => {O}.app.st.targets")
            ok(tg[iid] == held and tg[key2[4:]] >= 1, f'two targets set one after the other are both kept ({tg[iid]}, {tg[key2[4:]]})')
        await axe_check(pg, 'Purchasing with steppers')
        # ---- the buy dialog
        await pg.click('[data-key^="buy-"]'); await pg.wait_for_timeout(400)
        d = pg.locator('dialog[open]')
        ok(await d.get_by_role('spinbutton', name='Boxes to order').count() == 1 and await pg.evaluate(NUMBER_BOXES) == 0, 'the buy dialog has a Boxes stepper and no number box')
        chips = await d.locator('.chip').all_inner_texts()
        ok(chips == ['2 days', 'A week', '2 weeks'] or chips == [], f'chips for 2 days, a week and 2 weeks of use: {chips}')
        if chips:
            await d.locator('.chip', has_text='A week').click(); await pg.wait_for_timeout(100)
            ok(await d.locator('.chip', has_text='A week').get_attribute('aria-pressed') == 'true', 'a chip shows it is pressed when it matches')
        b0 = int(re.search(r'\d+', await val(pg, 'dialog[open] [role=spinbutton]')).group())
        top = await d.locator('[data-key="boxes-plus"]').is_disabled()   # a vendor's monthly supply caps the order
        await d.locator('[data-key="boxes-minus"]' if top else '[data-key="boxes-plus"]').click(); await pg.wait_for_timeout(100)
        b1 = int(re.search(r'\d+', await val(pg, 'dialog[open] [role=spinbutton]')).group())
        ok(b1 == b0 + (-1 if top else 1), f'{"minus takes a box off at the top of the range" if top else "plus adds a box"} ({b0} -> {b1})')
        await axe_check(pg, 'buy dialog')
        n0 = await pg.evaluate(f"() => {O}.app.st.orders.reduce((s, o) => s + o.boxes, 0)")
        await d.locator('button:has-text("Place order")').click(); await pg.wait_for_timeout(400)
        n1 = await pg.evaluate(f"() => {O}.app.st.orders.reduce((s, o) => s + o.boxes, 0)")
        ok(n1 - n0 == b1, f'the order is for the boxes shown ({n1 - n0} of {b1})')
        # ---- Sales: price stepper
        await pg.evaluate(f"() => {{ for (let i = 0; i < 40; i++) {O}.G.advance({O}.app.st, 720); {O}.app.dirty = true; }}")
        await pg.click('nav.rail a[href="#sales"]'); await pg.wait_for_timeout(500)
        ok(await pg.evaluate(NUMBER_BOXES) == 0, 'no number boxes on Sales')
        cnt = await pg.locator('[role=spinbutton][data-key^="price-"]').count()
        ok(cnt >= 1, f'a price stepper for each product ({cnt})')
        if cnt:
            pk = await pg.locator('[role=spinbutton][data-key^="price-"]').first.get_attribute('data-key'); pid = pk[6:]
            p0 = float((await val(pg, f'[data-key="{pk}"]')).replace('$', '').replace(',', ''))
            await pg.click(f'[data-key="{pk}-plus"]'); await pg.wait_for_timeout(100)
            p1 = float((await val(pg, f'[data-key="{pk}"]')).replace('$', '').replace(',', ''))
            st_price = await pg.evaluate(f"() => {O}.app.st.prices[{pid}]")
            ok(p1 > p0 and abs(st_price - p1) < 0.005, f'plus raises the price a little and the game keeps it (${p0} -> ${p1})')
            await pg.wait_for_timeout(900)
            ok(await pg.locator(f'[data-key="match-{pid}"]').count() == 1, 'Match market is still there')
        await axe_check(pg, 'Sales with steppers')
        # ---- Bank: amount chips and a loan slider
        await pg.click('nav.rail a[href="#bank"]'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(NUMBER_BOXES) == 0, 'no number boxes on the Bank page')
        await pg.click('[data-key="move-amt-chip-50-000"]'); await pg.wait_for_timeout(100)
        ok(await val(pg, '[data-key="move-amt"]') == '$50,000', 'a chip sets the amount')
        c0 = await pg.evaluate(f"() => {O}.app.st.bank.checking"); s0 = await pg.evaluate(f"() => {O}.app.st.bank.savings")
        await pg.click('button:has-text("Checking → savings")'); await pg.wait_for_timeout(300)
        s1 = await pg.evaluate(f"() => {O}.app.st.bank.savings")
        ok(s1 - s0 == 50000, f'Checking to savings moves what is shown ({s1 - s0})')
        ok(await val(pg, '[data-key="move-amt"]') == '$50,000', 'the amount stays after the page redraws')
        await pg.focus('[data-key="loan-amt-slider"]'); await pg.keyboard.press('End'); await pg.wait_for_timeout(100)
        mx = await pg.evaluate(f"() => {O}.G.maxLoan({O}.app.st)")
        ok(await val(pg, '[data-key="loan-amt"]') == f'${mx:,}', f'the loan slider goes up to what the bank will lend (${mx:,})')
        await pg.focus('[data-key="loan-amt-slider"]'); await pg.keyboard.press('Home'); await pg.wait_for_timeout(100)
        ok(await val(pg, '[data-key="loan-amt"]') == '$5,000', 'and down to $5,000')
        await pg.click('[data-key="loan-amt-plus-big"]'); await pg.wait_for_timeout(100)
        ok(await val(pg, '[data-key="loan-amt"]') == '$15,000', 'the big step is $10,000')
        await pg.evaluate(f"() => {{ {O}.app.speed = 3; }}"); await pg.wait_for_timeout(2300); await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}")
        ok(await val(pg, '[data-key="loan-amt"]') == '$15,000', 'the loan amount survives live redraws')
        await pg.click('text=Apply for loan'); await pg.click('dialog button:has-text("Borrow")'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(f"() => {O}.app.st.bank.loans.some(l => l.principal === 15000)"), 'a $15,000 loan is taken')
        await axe_check(pg, 'Bank with steppers')
        # ---- a salary offer
        await pg.evaluate(f"() => {{ {O}.G.placeAd({O}.app.st, 'sales'); for (let i = 0; i < 6; i++) {O}.G.advance({O}.app.st, 1440); {O}.app.dirty = true; }}")
        await pg.click('nav.rail a[href="#hire"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-key="hire-tab-sales"]'); await pg.wait_for_timeout(300)
        await pg.locator('[data-key^="offer-"]').first.click(); await pg.wait_for_timeout(400)
        d = pg.locator('dialog[open]')
        ok(await pg.evaluate(NUMBER_BOXES) == 0, 'the offer dialog has no number box')
        ask = int(re.search(r'Desired salary\s+\$([\d,]+)', await d.inner_text()).group(1).replace(',', ''))
        ok(await val(pg, 'dialog[open] [data-key="offer"]') == f'${ask:,}', f'the offer starts at the ask (${ask:,})')
        ok('exactly what they ask' in await d.inner_text(), 'a line says it is exactly what they ask')
        chips = await d.locator('.chip').all_inner_texts()
        ok(chips == ['Ask −10%', 'Ask −5%', 'Ask', 'Ask +5%'], f'offer chips: {chips}')
        await d.locator('.chip', has_text='Ask −10%').click(); await pg.wait_for_timeout(100)
        t = await d.inner_text()
        ok(re.search(r'10%\s+under what they ask', t) is not None, 'choosing Ask −10% says it is 10% under')
        await d.locator('[data-key="offer-minus"]').click(); await pg.wait_for_timeout(100)
        o2 = int((await val(pg, 'dialog[open] [data-key="offer"]')).replace('$', '').replace(',', ''))
        ok(abs(o2 - (round(ask * 0.9 / 100) * 100 - 500)) <= 500, f'minus takes $500 off (${o2:,})')
        await pg.focus('dialog[open] [data-key="offer-slider"]'); await pg.keyboard.press('End'); await pg.wait_for_timeout(100)
        hi = int((await val(pg, 'dialog[open] [data-key="offer"]')).replace('$', '').replace(',', ''))
        ok(0.28 * ask < hi - ask <= 0.32 * ask, f'the slider tops out near 130% of the ask (${hi:,})')
        await axe_check(pg, 'offer dialog')
        await d.locator('.chip', has_text='Ask +5%').click(); await pg.wait_for_timeout(100)
        n0 = await pg.evaluate(f"() => {O}.app.st.employees.length")
        await d.locator('button:has-text("Make offer")').click(); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(f"() => {O}.app.st.employees.length") == n0 + 1, 'an offer above the ask is accepted')
        # ---- no number box anywhere
        bad = []
        for v in SECTIONS:
            await pg.click(f'nav.rail a[href="#{v}"]'); await pg.wait_for_timeout(250)
            if await pg.evaluate(NUMBER_BOXES): bad.append(v)
        ok(not bad, f'no number box on any section {bad}')
        ok(not errs, f'no page errors {errs[:2]}')
        # ---- phone: touch targets and no sideways scroll
        ph = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        await ph.goto(URL); await ph.wait_for_timeout(800)
        await ph.tap('text=Quick start'); await ph.wait_for_timeout(600)
        for v in ('purchasing', 'sales', 'bank'):
            await ph.tap('[data-key="menu"]'); await ph.wait_for_timeout(250); await ph.tap(f'dialog.menu-sheet [data-key="nav-{v}"]'); await ph.wait_for_timeout(400)
            small = await ph.evaluate("() => [...document.querySelectorAll('.stepper button, .stepper [role=spinbutton], .stepper input')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5) }).map(e => (e.getAttribute('data-key') || e.className) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))")
            ok(not small, f'{v}: every stepper control is at least 44 px {small[:3]}')
            w = await ph.evaluate("() => Math.max(document.documentElement.scrollWidth, document.getElementById('main').scrollWidth)")
            ok(w <= 390, f'{v}: no sideways scroll with steppers ({w})')
        t0 = await ph.evaluate("() => document.querySelectorAll('.stepper').length")
        await ph.tap('[data-key="menu"]'); await ph.wait_for_timeout(250); await ph.tap('dialog.menu-sheet [data-key="nav-purchasing"]'); await ph.wait_for_timeout(400)
        k = await ph.locator('[role=spinbutton][data-key^="tgt-"]').first.get_attribute('data-key')
        a0 = int(await val(ph, f'[data-key="{k}"]')); await ph.tap(f'[data-key="{k}-plus"]'); await ph.wait_for_timeout(100)
        ok(int(await val(ph, f'[data-key="{k}"]')) == a0 + 1, 'a tap on plus steps once (not twice)')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all stepper UI checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
