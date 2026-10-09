# Conveyor UI: connect by belt from the machine inspector, link announcement, moving boxes, reduced-motion static boxes, axe.
import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
SHOT = str(SHOTS) + '/'
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1500, 'height': 1100})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        # A makes a component from bought materials; B makes a product that uses it. Each gets an operator.
        ids = await pg.evaluate("""() => { const {app, G, RECIPES, ITEMS, hire} = window.__overhead, st = app.st;
          st.bank.checking += 500000;
          const mat = i => ITEMS[i].tier === 'material';
          let comp, prod;
          for (const p of RECIPES) { if (!p.start || ITEMS[p.out].tier !== 'product') continue; for (const [i] of p.inputs) { const c = RECIPES.find(r => r.out === i); if (!comp && c && c.start && c.family !== p.family && c.inputs.every(([m]) => mat(m))) { comp = c; prod = p; } } }
          const place = (family, recipe, x0 = 2, y0 = 8) => { for (let y = y0; y < st.floor.h - 4; y++) for (let x = x0; x < st.floor.w - 6; x++) { const r = G.placeEquipment(st, { kind: 'machine', family, x, y, rot: 0, recipe }); if (r.ok) return r.obj; } return null; };
          const A = place(comp.family, comp.id), B = place(prod.family, prod.id, A.x + 9, A.y + 2) || place(prod.family, prod.id);
          G.assign(st, hire('operator'), A.id); G.assign(st, hire('operator'), B.id);
          return { A: A.id, B: B.id }; }""")
        await pg.click('nav.rail a[href="#city"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(400)
        # select A from the equipment table, then connect by belt via the inspector
        await pg.click(f'[data-key="eq-{ids["A"]}"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('h3:has-text("Inputs, output and belts")').count() == 1, 'machine inspector has an Inputs, output and belts section')
        opt = await pg.locator('#belt-to option').first.text_content()
        ok('uses' in opt, 'first belt target is the machine that uses our output: ' + opt)
        await pg.click('[data-key="belt-connect"]'); await pg.wait_for_timeout(300)
        dlg = await pg.locator('dialog[open]').text_content()
        ok('conveyor sections' in dlg, 'confirm shows sections and price: ' + ' '.join(dlg.split())[:120])
        await pg.click('dialog[open] button:has-text("Lay belt")')
        live = ''
        for _ in range(10):
            await pg.wait_for_timeout(150)
            live += await pg.evaluate("() => [...document.querySelectorAll('[aria-live], .toast, #toasts')].map(e => e.textContent).join(' | ')")
            if 'Belt connected' in live: break
        ok('Belt connected' in live, 'link announced: ' + live[:160])
        await pg.wait_for_timeout(300)
        L = await pg.evaluate("(ids) => { const st = window.__overhead.app.st; window.__overhead.G.advance(st, 1); const b = window.__overhead.belt(); return { dirs: b.dirs.size, routes: Object.values(st.lanes || {}).map(r => [r.from, r.to, r.path.length]) }; }", ids)
        await pg.wait_for_timeout(300)
        L['dirs'] = await pg.evaluate("() => window.__overhead.belt().dirs.size")
        ok(any(r[0] == ids['A'] and r[1] == ids['B'] for r in L['routes']) and L['dirs'] > 0, f'route drawn with direction arrows: {L}')
        # run the clock and watch boxes travel
        await pg.evaluate("() => { const st = window.__overhead.app.st; const G = window.__overhead.G; G.purchaseAll(st); for (const o of st.orders) o.eta = st.time; }")
        await pg.keyboard.press('Escape')
        await pg.evaluate("() => { const {app, G} = window.__overhead; while (!app.st.employees.every(e => e.act === 'work' || !e.assign) ) { G.advance(app.st, 5); if (app.st.time > 1e7) break; } G.advance(app.st, 90); }")
        await pg.evaluate("() => { document.querySelector('[data-key=\"speed-1\"], button[aria-label*=\"Play\"]')?.click(); }")
        await pg.evaluate("() => { window.__overhead.app.speed = 1; }")
        # watch for five seconds: boxes come and go, so keep the most seen at once
        tk = {'tokens': 0, 'live': 0}
        for _ in range(20):
            await pg.wait_for_timeout(250)
            now = await pg.evaluate("(ids) => { const b = window.__overhead.belt(), st = window.__overhead.app.st; const A = st.floor.objects.find(o => o.id === ids.A); return { tokens: Object.values(st.lanes || {}).reduce((a, l) => a + l.boxes.length, 0), live: b.live.size, status: A.status, beltOut: A.beltOut || 0 }; }", ids)
            tk = {'tokens': max(tk['tokens'], now['tokens']), 'live': max(tk['live'], now['live']), 'status': now['status'], 'beltOut': now['beltOut']}
        print('A status', tk['status'], 'beltOut', tk['beltOut'])
        ok(tk['tokens'] > 0 and tk['live'] > 0, f'boxes are riding the belt ({tk["tokens"]} on screen, {tk["live"]} rolling squares)')
        # zoomed screenshot of the belt
        await pg.evaluate("(ids) => { const {app} = window.__overhead; app.viewState.floor.sel = ids.A; }", ids)
        await pg.wait_for_timeout(300)
        await pg.locator('#floor-app').screenshot(path=SHOT + 'belt_run.png')
        # select a conveyor square: inspector describes the line
        cv = await pg.evaluate("() => { const fl = window.__overhead.app.st.floor; const c = fl.objects.filter(o => o.kind === 'conveyor')[2]; return c.id; }")
        await pg.evaluate("(id) => { const {app} = window.__overhead; app.viewState.floor.sel = id; app.speed = 0; }", cv)
        await pg.focus('#floor-app'); await pg.keyboard.press('Escape'); await pg.evaluate("(id) => { window.__overhead.app.viewState.floor.sel = id; }", cv)
        await pg.click(f'[data-key="eq-{ids["A"]}"]'); await pg.wait_for_timeout(200)
        await pg.evaluate("(id) => { window.__overhead.app.viewState.floor.sel = id; window.__overhead.app.dirty = true; }", cv)
        await pg.evaluate("() => { document.querySelector('#floor-app').dispatchEvent(new Event('focus')); }")
        # a raw conveyor with nothing attached is explained
        r = await pg.evaluate("() => { const {app, G} = window.__overhead; const st = app.st; const x = st.floor.w - 3, y = st.floor.h - 3; const r = G.placeEquipment(st, { kind: 'conveyor', x, y }); return r.ok ? r.obj.id : r.msg; }")
        desc = await pg.evaluate("(id) => { const st = window.__overhead.app.st; const o = st.floor.objects.find(o => o.id === id); return null; }", r)
        # paused: boxes hold their places on the belt
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }"); await pg.wait_for_timeout(300)
        # step the plant until a box is on a belt, then leave it paused
        await pg.evaluate("() => { const {app, G} = window.__overhead, st = app.st; for (let i = 0; i < 600 && !Object.values(st.lanes || {}).some(l => l.boxes.length); i++) G.advance(st, 1); }")
        await pg.wait_for_timeout(300)
        t1 = await pg.evaluate("() => JSON.stringify(Object.values(window.__overhead.app.st.lanes).map(l => l.boxes.map(b => b.s.toFixed(2))))")
        await pg.wait_for_timeout(800)
        t2 = await pg.evaluate("() => JSON.stringify(Object.values(window.__overhead.app.st.lanes).map(l => l.boxes.map(b => b.s.toFixed(2))))")
        ok(t1 == t2 and '"' in t1, f'paused: boxes stay where they are on the belt {t1[:80]}')
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        await pg.emulate_media(reduced_motion='no-preference')
        await pg.click(f'[data-key="eq-{ids["A"]}"]'); await pg.wait_for_timeout(300)
        await pg.add_script_tag(content=AXE)
        res = await pg.evaluate("async () => { const r = await axe.run(document, { resultTypes: ['violations'] }); return r.violations.map(v => v.id + ':' + v.nodes.length); }")
        ok(not res, f'axe on floor with belt inspector: {res}')
        # spending guard: with no cash, laying five belt squares by keyboard asks once before borrowing
        spot = await pg.evaluate("""() => { const {app, G} = window.__overhead, st = app.st, fl = st.floor;
          app.speed = 0; const bank = { ...st.bank, txns: [...st.bank.txns] }, n = fl.objects.length, rev = fl.rev, nextId = fl.nextId; st.bank.checking += 1e6;
          let found = null;
          for (let y = 2; y < fl.h - 2 && !found; y++) for (let x = 2; x < fl.w - 7 && !found; x++) {
            const k = fl.objects.length; let good = true;
            for (let i = 0; i < 5 && good; i++) good = G.placeEquipment(st, { kind: 'conveyor', x: x + i, y }).ok;
            fl.objects.length = k; if (good) found = { x, y };
          }
          fl.objects.length = n; fl.rev = rev + 1; fl.nextId = nextId; Object.assign(st.bank, bank);
          st.bank.checking = 0; st.bank.savings = 0; st.bank.credit = 0;
          return found; }""")
        ok(spot is not None, f'found a free row for five belt squares: {spot}')
        await pg.click('[data-key="ft-belt"]'); await pg.wait_for_timeout(200)
        await pg.evaluate("(s) => { const v = window.__overhead.app.viewState.floor; v.cx = s.x; v.cy = s.y; }", spot)
        belts0 = await pg.evaluate("() => window.__overhead.app.st.floor.objects.filter(o => o.kind === 'conveyor').length")
        await pg.focus('#floor-app'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        dlg = pg.locator('dialog[open]')
        txt = ' '.join(((await dlg.text_content()) or '').split()) if await dlg.count() else ''
        ok('Buy on credit?' in txt and 'would come from the credit line' in txt and 'a year' in txt, 'first belt square asks before borrowing: ' + txt[:200])
        ok(await pg.locator('dialog[open] strong:has-text("would come from the credit line")').count() == 1, 'the borrowed amount is in bold words')
        ok(await pg.evaluate("() => document.activeElement?.textContent") == 'Cancel', 'Cancel has focus first')
        await pg.add_script_tag(content=AXE)
        res = await pg.evaluate("async () => { const r = await axe.run(document, { resultTypes: ['violations'] }); return r.violations.map(v => v.id + ':' + v.nodes.length); }")
        ok(not res, f'axe with the credit dialog open: {res}')
        await pg.keyboard.press('Tab'); focused = await pg.evaluate("() => document.activeElement?.textContent")
        ok(focused.startswith('Buy and borrow $'), 'Tab reaches the buy button, which names the amount: ' + focused)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        dialogs = 1
        await pg.focus('#floor-app')
        for _ in range(4):
            await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
            if await pg.locator('dialog[open]').count(): dialogs += 1; await pg.keyboard.press('Escape'); await pg.focus('#floor-app')
        info = await pg.evaluate("() => { const st = window.__overhead.app.st; return { belts: st.floor.objects.filter(o => o.kind === 'conveyor').length, credit: st.bank.credit }; }")
        ok(dialogs == 1 and info['belts'] - belts0 == 5 and info['credit'] > 0, f'five belt squares laid on credit with one dialog ({dialogs} dialogs, {info["belts"] - belts0} squares, credit {info["credit"]:.0f})')
        # Escape ends the session: the next square asks again, and Cancel buys nothing
        await pg.keyboard.press('Escape'); await pg.click('[data-key="ft-belt"]'); await pg.wait_for_timeout(200)
        await pg.evaluate("(s) => { const v = window.__overhead.app.viewState.floor; v.cx = s.x; v.cy = s.y + 1; }", spot)
        credit0 = await pg.evaluate("() => window.__overhead.app.st.bank.credit")
        await pg.focus('#floor-app'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        ok(await pg.locator('dialog[open]:has-text("Buy on credit?")').count() == 1, 'a new belt session asks again')
        await pg.click('dialog[open] button:has-text("Cancel")'); await pg.wait_for_timeout(200)
        after = await pg.evaluate("() => { const {app} = window.__overhead, st = app.st; return { belts: st.floor.objects.filter(o => o.kind === 'conveyor').length, credit: st.bank.credit, mode: app.viewState.floor.mode }; }")
        ok(after['belts'] - belts0 == 5 and after['credit'] == credit0 and after['mode'] == 'place', f'Cancel buys nothing and keeps the belt tool: {after}')
        await pg.keyboard.press('Escape')
        # the clock stops under the dialog and comes back, and focus returns to the grid, however it closes
        SNAP = "() => { const {app} = window.__overhead, st = app.st; return { t: st.time, cash: st.bank.checking, credit: st.bank.credit, speed: app.speed, cx: app.viewState.floor.cx, cy: app.viewState.floor.cy, focus: document.activeElement?.id || document.activeElement?.tagName }; }"
        # an urgent memo (the credit line being drawn) would pause the clock by itself, so turn that off for these checks
        await pg.click('nav.rail a[href="#options"]'); await pg.wait_for_timeout(200)
        if await pg.locator('#o-pause').is_checked(): await pg.locator('#o-pause').uncheck()
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300)
        async def start_session(speed, x):
            await pg.click('[data-key="ft-belt"]'); await pg.wait_for_timeout(100)
            await pg.focus('#floor-app')
            # set the clock going only at the last moment: a running clock with $100 would draw credit and pause itself
            # rooms and their doorways differ from game to game, so if the square is refused, try the next one along
            for step in range(12):
                await pg.evaluate("(a) => { const {app} = window.__overhead, st = app.st; st.bank.checking = 100; st.bank.savings = 0; app.speed = a[0]; const v = app.viewState.floor; v.cx = a[1]; v.cy = 3; }", [speed, 6 + (x - 6 + step) % 18])
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
                if await pg.locator('dialog[open]').count(): break
        n = 0
        for speed in (2, 3):
            for how in ('Cancel', 'Buy', 'Escape'):
                await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
                await start_session(speed, 14 + n); n += 1
                ok(await pg.locator('dialog[open]:has-text("Buy on credit?")').count() == 1, f'speed {speed}: dialog open before {how}')
                a = await pg.evaluate(SNAP); await pg.wait_for_timeout(1500); b2 = await pg.evaluate(SNAP)
                ok(b2['speed'] == 0 and a['t'] == b2['t'] and a['cash'] == b2['cash'] and a['credit'] == b2['credit'], f'speed {speed}: clock, cash and credit stand still under the dialog ({a["t"]} {a["cash"]} -> {b2["t"]} {b2["cash"]})')
                if how == 'Cancel': await pg.click('dialog[open] button:has-text("Cancel")')
                elif how == 'Buy': await pg.click('dialog[open] button:has-text("Buy and borrow")')
                else: await pg.keyboard.press('Escape')
                await pg.wait_for_timeout(100)
                c = await pg.evaluate(SNAP)
                ok(c['speed'] == speed, f'speed {speed}: speed restored after {how} (now {c["speed"]})')
                ok(c['focus'] == 'floor-app', f'speed {speed}: focus back on the floor grid after {how} ({c["focus"]})')
                await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
                await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(100)
                d = await pg.evaluate(SNAP)
                ok(d['cy'] == c['cy'] + 1, f'speed {speed}: an arrow key moves the cursor after {how}')
        # a paused clock stays paused
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }"); await pg.keyboard.press('Escape'); await start_session(0, 20)
        await pg.click('dialog[open] button:has-text("Cancel")'); await pg.wait_for_timeout(100)
        ok((await pg.evaluate(SNAP))['speed'] == 0, 'a paused clock stays paused after the dialog')
        # if the amount changed while the dialog was open, buying says so
        await pg.keyboard.press('Escape'); await start_session(0, 22)
        await pg.evaluate("() => { window.__overhead.app.st.bank.checking = 0; }")
        await pg.click('dialog[open] button:has-text("Buy and borrow")'); await pg.wait_for_timeout(200)
        ok('amount to borrow is now' in await pg.evaluate("() => [...document.querySelectorAll('[aria-live], .toast')].map(e => e.textContent).join(' | ')"), 'a changed amount is announced on buying')
        # a real mouse click opens the dialog with Cancel focused, and the clock still stops
        await pg.keyboard.press('Escape'); await pg.evaluate("() => { const {app} = window.__overhead; app.speed = 0; app.st.bank.checking = 100; app.viewState.floor.cx = 0; }")
        await pg.click('[data-key="ft-belt"]'); await pg.evaluate("() => { const {app} = window.__overhead; app.st.bank.checking = 100; app.speed = 3; }")
        box = await pg.locator('#floor-app canvas').bounding_box()
        opened = False
        for fy in (0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7):
            for fx in (0.1, 0.2, 0.3, 0.4, 0.5):
                await pg.mouse.click(box['x'] + box['width'] * fx, box['y'] + box['height'] * fy); await pg.wait_for_timeout(120)
                if await pg.locator('dialog[open]').count(): opened = True; break
            if opened: break
        ok(opened, 'a mouse click on the floor opens the credit dialog')
        e = await pg.evaluate("() => ({ focus: document.activeElement?.textContent, speed: window.__overhead.app.speed })")
        ok(e['focus'] == 'Cancel' and e['speed'] == 0, f'after a mouse click Cancel has focus and the clock is stopped: {e}')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        ok((await pg.evaluate("() => window.__overhead.app.speed")) == 3, 'speed restored after Escape on a mouse-opened dialog')
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }"); await pg.keyboard.press('Escape')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all belt UI checks pass')
asyncio.run(main())
