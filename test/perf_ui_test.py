# Performance budget for drawing: one factory-floor frame must average under 16 ms on the largest building with 40
# staffed machines and the clock running (boxes, workers and belts animating).
import asyncio, os, sys; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, launch_opts
from playwright.async_api import async_playwright
BUDGET_MS = 16
SETUP = """() => { const {app, G, RECIPES, hire} = window.__overhead;
  const st = G.newGame({ seed: 'perf', sandbox: true }); G.visitCity(st, 0);
  G.rentBuilding(st, st.city.lots.filter(l => l.firm == null).sort((a, b) => b.sqft - a.sqft)[0].id);
  st.bank.checking += 2e7; app.st = st;
  const fl = st.floor, starters = RECIPES.filter(r => r.start), ms = [];
  for (let y = 2; y + 5 < fl.h - 6 && ms.length < 40; y += 5) for (let x = 2; x + 7 < fl.w && ms.length < 40; x += 7) {
    const r = starters[ms.length % starters.length], res = G.placeEquipment(st, { kind: 'machine', family: r.family, x, y, rot: 0, recipe: r.id });
    if (res.ok) ms.push(res.obj); }
  for (const a of ms) for (const b of ms) if (a !== b && G.inputFor(a, b) != null && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 14) G.connectByBelt(st, a.id, b.id);
  for (const m of ms) { const id = hire('operator'); if (id) G.assign(st, id, m.id); }
  G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  G.advance(st, 2 * 1440); while (!(st.employees.every(e => e.act === 'work'))) G.advance(st, 5); G.advance(st, 60);
  return { machines: ms.length, w: fl.w, h: fl.h }; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1440, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        # open the game shell with Quick start, then swap in the big plant and redraw the floor
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        info = await pg.evaluate(SETUP)
        await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(300)
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { window.__overhead.app.speed = 1; window.__overhead.belt().drawMs.length = 0; }")
        await pg.wait_for_timeout(4000)
        ms = await pg.evaluate("() => window.__overhead.belt().drawMs.slice()")
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        fails = 0
        def ok(c, m):
            nonlocal fails
            print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
        ok(info['machines'] == 40, f"{info['machines']} machines on a {info['w']} × {info['h']} floor")
        ok(len(ms) >= 30, f'{len(ms)} frames drawn in four seconds')
        if ms:
            s = sorted(ms); mean = sum(s) / len(s); p95 = s[int(len(s) * 0.95)]
            ok(mean < BUDGET_MS, f'floor frame averages {mean:.1f} ms (p95 {p95:.1f} ms, budget {BUDGET_MS} ms)')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all render performance checks pass')
asyncio.run(main())
