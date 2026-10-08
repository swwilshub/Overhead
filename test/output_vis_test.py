# Finished goods are visible: a stack at a hand-unloaded machine's output, boxes on belts (even while paused), and a queue
# at the next machine's input.
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
        # A makes a component from materials and belts it to B, a product machine that uses it (and has nobody on it);
        # C has no belt at all
        ids = await pg.evaluate("""() => { const {app, G, RECIPES, ITEMS, hire} = window.__overhead, st = app.st; st.bank.checking += 900000;
          const mat = i => ITEMS[i].tier === 'material';
          let comp, prod;
          for (const p of RECIPES) { if (!p.start || ITEMS[p.out].tier !== 'product') continue; for (const [i] of p.inputs) { const c = RECIPES.find(r => r.out === i); if (!comp && c && c.start && c.family !== p.family && c.inputs.every(([m]) => mat(m))) { comp = c; prod = p; } } }
          const place = (family, recipe) => { for (let y = 8; y < st.floor.h - 4; y++) for (let x = 2; x < st.floor.w - 6; x++) { const r = G.placeEquipment(st, { kind: 'machine', family, x, y, rot: 0, recipe }); if (r.ok) return r.obj; } return null; };
          const A = place(comp.family, comp.id), B = place(prod.family, prod.id);
          const other = RECIPES.find(r => r.start && r.family !== comp.family && r.family !== prod.family && r.inputs.every(([m]) => mat(m)));
          const C = place(other.family, other.id);
          G.connectByBelt(st, A.id, B.id);
          G.assign(st, hire('operator'), A.id);
          return { A: A.id, B: B.id, C: C.id }; }""")
        # run the plant for a while so the sim moves goods, then look while paused
        await pg.evaluate("""(ids) => { const {app, G} = window.__overhead, st = app.st; G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
          while (!(st.employees.every(e => e.act === 'work'))) G.advance(st, 5);
          G.advance(st, 240); }""", ids)
        state = await pg.evaluate("(ids) => { const fl = window.__overhead.app.st.floor; const A = fl.objects.find(o => o.id === ids.A), B = fl.objects.find(o => o.id === ids.B); return { a: A.status, beltOut: A.beltOut || 0, bBuf: JSON.stringify(B.inBuf), made: A.produced }; }", ids)
        print(state)
        await pg.click('nav.rail a[href="#city"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(500)
        q = await pg.evaluate("() => Object.values(window.__overhead.app.st.lanes || {}).reduce((a, l) => a + l.boxes.filter(b => !b.moving).length, 0)"); ok(q > 0, f'boxes queued on the belt at the next machine input ({q})')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'out_paused.png')
        await pg.evaluate("() => { window.__overhead.app.speed = 1; }"); await pg.wait_for_timeout(2500)
        await pg.locator('#floor-app').screenshot(path=SHOT + 'out_running.png')
        # a machine with no belt: finished boxes stack at its output square
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        await pg.evaluate("""() => { const {app, G} = window.__overhead, st = app.st; G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
          let n = 0; while (n++ < 400) { G.advance(st, 5); const m = st.floor.objects.find(o => o.kind === 'machine'); if (m.status === 'Running' && m.produced > 20) break; } }""")
        await pg.click('nav.rail a[href="#city"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { window.__overhead.app.speed = 1; }"); await pg.wait_for_timeout(1500)
        piles = await pg.evaluate("() => window.__overhead.belt().lastPiles.map(p => [p.x, p.y, p.n])")
        ok(len(piles) > 0, f'finished boxes stacked at the output square: {piles}')
        await pg.locator('#floor-app').screenshot(path=SHOT + 'out_tray.png')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all output visibility checks pass')
asyncio.run(main())
