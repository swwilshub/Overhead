# Renders the screenshots in docs/images for the README: a running plant, the catalog and the city map.
#   python3 test/readme_shots.py      (after npm run build)
import asyncio, os, sys; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, ROOT, launch_opts
from playwright.async_api import async_playwright
OUT = ROOT / 'docs' / 'images'
SETUP = """() => { const {app, G, RECIPES, ITEMS, hire} = window.__overhead, st = app.st; st.bank.checking += 600000;
  const mat = i => ITEMS[i].tier === 'material';
  const A = st.floor.objects.find(o => o.kind === 'machine');
  const place = (family, recipe, x0, y0) => { for (let y = y0; y < st.floor.h - 4; y++) for (let x = x0; x < st.floor.w - 6; x++) { const r = G.placeEquipment(st, { kind: 'machine', family, x, y, rot: 0, recipe }); if (r.ok) return r.obj; } return null; };
  // a product line fed by the quick-start machine if one uses its output, then a second component line
  const user = RECIPES.find(r => r.start && ITEMS[r.out].tier === 'product' && r.inputs.some(([i]) => i === RECIPES[A.recipe].out));
  const B = user ? place(user.family, user.id, A.x + 9, A.y + 1) : null;
  if (B) G.connectByBelt(st, A.id, B.id);
  const C = place(RECIPES.find(r => r.start && r.family !== A.family && r.inputs.every(([i]) => mat(i))).family, null, 3, A.y + 6);
  for (const o of [B, C]) if (o) { G.assign(st, hire('operator'), o.id); for (const { x, y } of G.unsafeInputs(st.floor, o)) st.floor.zones[y * st.floor.w + x] = 2; }
  G.placeEquipment(st, { kind: 'handcart', x: 1, y: 1 }); hire('maintenance');
  const off = st.floor.objects.find(o => o.kind === 'office'); for (let dx = 4; dx < 20; dx += 4) if (G.placeEquipment(st, { kind: 'office', officeType: 3, x: off.x + dx, y: off.y }).ok || G.placeEquipment(st, { kind: 'office', officeType: 3, x: off.x, y: off.y + dx }).ok) break;
  hire('finance');
  G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  for (let i = 0; i < 4 * 288; i++) { G.advance(st, 5); if (i % 288 === 100) G.purchaseAll(st); }
  while (!(st.employees.every(e => e.act === 'work'))) G.advance(st, 5);
  G.advance(st, 120); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.screenshot(path=str(OUT / 'title.png'))
        await pg.click('text=Quick start'); await pg.wait_for_timeout(400)
        await pg.evaluate(SETUP)
        await pg.click('nav.rail a[href="#city"]'); await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { const t = document.querySelector('#toasts'); if (t) t.innerHTML = ''; window.__overhead.app.speed = 1; }")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { document.querySelector('#toasts').innerHTML = ''; }")
        await pg.screenshot(path=str(OUT / 'floor.png'))
        await pg.evaluate("() => { window.__overhead.app.speed = 0; }")
        await pg.click('nav.rail a[href="#catalog"]'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { document.querySelector('#toasts').innerHTML = ''; }")
        await pg.screenshot(path=str(OUT / 'catalog.png'))
        await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(OUT / 'city.png'))
        await b.close()
    print('wrote', ', '.join(sorted(os.listdir(OUT))))
asyncio.run(main())
