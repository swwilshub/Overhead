# The factory floor is the whole window (spec 015): one canvas filling the page area, a camera, and controls floating over it.
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
VS = f'{O}.app.viewState.floor'
cam = lambda pg: pg.evaluate(f'() => {O}.camera()')
async def start(b, vp, **kw):
    ctx = await b.new_context(viewport=vp, **kw); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append(str(e))); pg.on('console', lambda m: ERRS.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(700)
    await pg.click('text=Quick start'); await pg.wait_for_timeout(900)
    return ctx, pg
ERRS = []
async def zoom_in(pg, n):
    for _ in range(n):
        if await pg.locator('[data-key="ft-zi"]').is_enabled(): await pg.click('[data-key="ft-zi"]')
async def geometry(pg):
    return await pg.evaluate("""() => { const f = document.getElementById('floor-app').getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(), c = document.querySelector('#floor-app canvas'), cr = c.getBoundingClientRect(), mm = document.getElementById('main');
      return { f: [f.left, f.top, f.width, f.height], m: [m.left, m.top, m.width, m.height], c: [cr.width, cr.height, c.width, c.height], dpr: devicePixelRatio, mainScroll: [mm.scrollHeight, mm.clientHeight], doc: [document.documentElement.scrollHeight, innerHeight], ovf: getComputedStyle(mm).overflow }; }""")
def fills(g): return all(abs(a - b) <= 1 for a, b in zip(g['f'], g['m'])) and abs(g['c'][0] - g['m'][2]) <= 1 and abs(g['c'][1] - g['m'][3]) <= 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        ctx, pg = await start(b, {'width': 1280, 'height': 800})
        g = await geometry(pg)
        ok(fills(g), f'desktop: the floor and its canvas fill the whole content area {g["f"]} vs {g["m"]}')
        ok(g['c'][2] == round(g['c'][0] * g['dpr']) and g['c'][3] == round(g['c'][1] * g['dpr']), f'the canvas is sized in device pixels ({g["c"][2]}x{g["c"][3]} for {g["c"][0]:.0f}x{g["c"][1]:.0f} at {g["dpr"]}x)')
        await pg.evaluate('() => window.scrollTo(0, 200)'); sy = await pg.evaluate('() => scrollY')
        ok(g['mainScroll'][0] <= g['mainScroll'][1] and sy == 0 and g['ovf'] == 'hidden', f'no page scroll and no frame scrollbar (page scrolled {sy})')
        ok(await pg.locator('h1').first.inner_text() == 'Factory floor' or (await pg.locator('h1').first.text_content()) == 'Factory floor', 'the page keeps its heading for screen readers')
        ok(await pg.locator('#floor-app').get_attribute('role') == 'application' and await pg.locator('#floor-app canvas').get_attribute('aria-hidden') == 'true', 'the floor is one application region and the canvas is hidden from assistive technology')
        c0 = await cam(pg)
        ok(1 <= c0['zoom'] <= 2, f'the first view is between 1× and 2× ({c0["zoom"]})')
        mach = await pg.evaluate(f"() => {{ const o = {O}.app.st.floor.objects.find(o => o.kind === 'machine'); return {{ id: o.id, x: Math.round(o.x), y: Math.round(o.y) }}; }}")
        pt = lambda x, y: pg.evaluate(f'([x, y]) => {O}.floorPoint(x, y)', [x, y])
        # ---- a click selects; a drag from the same spot pans and selects nothing
        mx, my = await pt(mach['x'], mach['y'])
        await pg.mouse.click(mx, my); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(f'() => {VS}.sel') == mach['id'], 'a click on a machine selects it')
        await pg.mouse.click(mx + 300, my + 200); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(f'() => {VS}.sel') is None, 'a click on empty floor clears the selection')
        # a drag that starts on a machine selects nothing
        mx, my = await pt(mach['x'], mach['y'])
        await pg.mouse.move(mx, my); await pg.mouse.down(); await pg.mouse.move(mx + 40, my + 10, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(150)
        ok(await pg.evaluate(f'() => {VS}.sel') is None, 'a drag that starts on a machine selects nothing')
        # a drag needs room to pan: zoom in first
        await pg.click('[data-key="ft-fit"]'); await zoom_in(pg, 3); await pg.wait_for_timeout(200)
        c1 = await cam(pg); sx, sy = 640, 400
        await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx - 60, sy - 30, steps=6); await pg.mouse.move(sx - 120, sy - 50, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        c2 = await cam(pg)
        ok(abs((c2['x'] - c1['x']) - 120) < 4 and abs((c2['y'] - c1['y']) - 50) < 4, f'dragging with the mouse pans the map with the pointer ({c1["x"]:.0f},{c1["y"]:.0f} -> {c2["x"]:.0f},{c2["y"]:.0f})')
        await pg.wait_for_timeout(300); c3 = await cam(pg)
        ok(abs(c3['x'] - c2['x']) < 1, 'and a mouse drag does not glide on afterwards')
        # ---- the wheel zooms about the pointer
        await pg.click('[data-key="ft-fit"]'); await zoom_in(pg, 2); await pg.wait_for_timeout(100)
        px, py = 700, 400
        r = await pg.evaluate("() => { const r = document.getElementById('floor-app').getBoundingClientRect(); return [r.left, r.top]; }")
        before = await cam(pg); sx0 = (before['x'] + px - r[0]) / before['zoom']; sy0 = (before['y'] + py - r[1]) / before['zoom']
        await pg.mouse.move(px, py); await pg.mouse.wheel(0, -100); await pg.wait_for_timeout(200)
        after = await cam(pg)
        sx1 = (after['x'] + px - r[0]) / after['zoom']; sy1 = (after['y'] + py - r[1]) / after['zoom']
        ok(after['zoom'] > before['zoom'] and abs(sx1 - sx0) < 0.5 and abs(sy1 - sy0) < 0.5, f'the wheel zooms about the pointer ({before["zoom"]:.2f}× -> {after["zoom"]:.2f}×), the scene point under it stays put')
        await pg.mouse.wheel(0, 3000); await pg.wait_for_timeout(200)
        ok((await cam(pg))['zoom'] == 0.25, 'zoom stops at a quarter')
        await pg.mouse.wheel(0, -30000); await pg.wait_for_timeout(200)
        ok((await cam(pg))['zoom'] == 4, 'and at four')
        # ---- keys
        await pg.focus('#floor-app'); await pg.keyboard.press('0'); await pg.wait_for_timeout(100)
        cf = await cam(pg); ok(0.25 <= cf['zoom'] <= 4 and cf['zoom'] != 4, f'0 fits the whole plant ({cf["zoom"]:.2f}×)')
        await pg.keyboard.press('+'); await pg.wait_for_timeout(100); z1 = (await cam(pg))['zoom']
        await pg.keyboard.press('-'); await pg.wait_for_timeout(100); z2 = (await cam(pg))['zoom']
        ok(z1 > cf['zoom'] and z2 < z1, f'+ and - zoom in and out ({cf["zoom"]:.2f} -> {z1:.2f} -> {z2:.2f})')
        # ---- the whole plant fits: nothing of it is outside the view after Fit
        await pg.click('[data-key="ft-fit"]'); await pg.wait_for_timeout(100)
        cf = await cam(pg); ok(cf['W'] * cf['zoom'] <= cf['w'] + 1 and cf['H'] * cf['zoom'] <= cf['h'] + 1, 'Fit shows the whole plant')
        # ---- a middle-button drag pans in any mode
        await pg.click('[data-key="ft-zone"]'); await pg.wait_for_timeout(100)
        await pg.click('[data-key="ft-fit"]'); await zoom_in(pg, 3); await pg.wait_for_timeout(100)
        c1 = await cam(pg); zones = await pg.evaluate(f'() => [...{O}.app.st.floor.zones].filter(z => z).length')
        await pg.mouse.move(600, 400); await pg.evaluate("() => { window.__mid = 1; }")
        await pg.mouse.down(button='middle'); await pg.mouse.move(540, 380, steps=5); await pg.mouse.up(button='middle'); await pg.wait_for_timeout(150)
        c2 = await cam(pg); z2 = await pg.evaluate(f'() => [...{O}.app.st.floor.zones].filter(z => z).length')
        ok(abs(c2['x'] - c1['x'] - 60) < 4 and z2 == zones, f'the middle button pans while Paint zones is on, and paints nothing ({c1["x"]:.0f} -> {c2["x"]:.0f})')
        await pg.click('[data-key="ft-select"]')
        # ---- controls floating over the floor belong to themselves
        c1 = await cam(pg); await pg.click('[data-key="ft-zone"]'); await pg.wait_for_timeout(100); c2 = await cam(pg)
        ok(c1['x'] == c2['x'] and c1['y'] == c2['y'] and await pg.evaluate(f'() => {VS}.mode') == 'zone', 'pressing a floating button changes the tool and does not touch the map')
        await pg.click('[data-key="ft-select"]')
        # ---- Help, Legend, Equipment list and the panel
        await pg.click('[data-key="hud-help"]'); await pg.wait_for_timeout(250)
        ok('Arrow keys move the cursor' in await pg.locator('dialog[open]').inner_text(), 'Help opens with the keys'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="hud-legend"]'); await pg.wait_for_timeout(250)
        ok('Safety zone' in await pg.locator('dialog[open]').inner_text(), 'Legend opens'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="hud-equipment"]'); await pg.wait_for_timeout(250)
        ok(await pg.locator('dialog[open] table').count() == 1 and await pg.locator('dialog[open] [data-key^="eq-"]').count() >= 1, 'the equipment list is a table in a panel')
        await axe_check(pg, 'the equipment list')
        await pg.locator('dialog[open] [data-key^="eq-"]').first.click(); await pg.wait_for_timeout(500)
        ok(await pg.locator('dialog[open]').count() == 0 and await pg.evaluate(f'() => {VS}.sel') is not None, 'Select in the list closes it and selects the item')
        ok(await pg.evaluate("() => document.activeElement.id") == 'floor-app', 'and focus is back on the floor')
        insp = pg.locator('#inspector')
        await pg.click('[data-key="hud-panel"]'); await pg.wait_for_timeout(150)
        ok('away' in (await insp.get_attribute('class')) and await pg.get_attribute('[data-key="hud-panel"]', 'aria-expanded') == 'false', 'the Panel button hides the inspector')
        await pg.click('[data-key="hud-panel"]'); await pg.wait_for_timeout(150)
        ok('away' not in (await insp.get_attribute('class')), 'and shows it again')
        # ---- keyboard still drives the cursor and the camera follows it
        await pg.keyboard.press('Escape'); await pg.focus('#floor-app')
        for _ in range(4): await pg.keyboard.press('ArrowDown')
        await pg.evaluate(f'() => {{ const v = {VS}; v.cx = 0; v.cy = 0; }}'); await pg.click('[data-key="ft-fit"]'); await pg.keyboard.press('Escape'); await zoom_in(pg, 3)
        await pg.focus('#floor-app')
        for _ in range(30): await pg.keyboard.press('Shift+ArrowRight')
        r = await pg.evaluate(f"() => {{ const v = {VS}, c = {O}.camera(); const [x, y] = {O}.floorPoint(v.cx, v.cy); const a = document.getElementById('floor-app').getBoundingClientRect(); return [x - a.left, y - a.top, c.w, c.h]; }}")
        ok(0 <= r[0] <= r[2] and 0 <= r[1] <= r[3], f'the camera follows the keyboard cursor onto the screen ({r[0]:.0f}, {r[1]:.0f} in {r[2]}x{r[3]})')
        await pg.keyboard.press('Escape'); await pg.click('[data-key="ft-fit"]'); await pg.wait_for_timeout(200)
        await axe_check(pg, 'the floor page')
        # ---- the window changes size
        await pg.set_viewport_size({'width': 1000, 'height': 600}); await pg.wait_for_timeout(400)
        g = await geometry(pg); ok(fills(g) and g['c'][2] == round(g['c'][0] * g['dpr']), f'after the window is resized the canvas still fills the area ({g["m"][2]:.0f}x{g["m"][3]:.0f})')
        await ctx.close()
        # ---- a high-density screen is drawn at its own resolution
        ctx, pg = await start(b, {'width': 1100, 'height': 700}, device_scale_factor=2)
        g = await geometry(pg); ok(g['dpr'] == 2 and g['c'][2] == round(g['c'][0] * 2), f'at 2× the canvas has twice the pixels ({g["c"][2]} for {g["c"][0]:.0f})')
        await ctx.close()
        # ---- a phone, both ways round
        ctx, pg = await start(b, {'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=3)
        g = await geometry(pg); ok(fills(g), 'phone: the floor fills the area between the top bar and the bottom bar')
        ok(g['mainScroll'][0] <= g['mainScroll'][1], 'phone: no scrolling on the floor page')
        top = await pg.evaluate("() => [document.querySelector('.status').getBoundingClientRect().bottom, document.querySelector('.tabbar').getBoundingClientRect().top, document.getElementById('floor-app').getBoundingClientRect().top, document.getElementById('floor-app').getBoundingClientRect().bottom]")
        ok(abs(top[2] - top[0]) <= 1 and abs(top[3] - top[1]) <= 1, f'phone: it runs from the top bar to the bottom bar ({top})')
        ok((await cam(pg))['zoom'] >= 0.5 and g['c'][2] == round(g['c'][0] * 3), 'phone: drawn at 3× pixels')
        await pg.set_viewport_size({'width': 844, 'height': 390}); await pg.wait_for_timeout(500)
        g = await geometry(pg); ok(fills(g) and g['mainScroll'][0] <= g['mainScroll'][1], f'landscape: it still fills the area after turning ({g["m"][2]:.0f}x{g["m"][3]:.0f})')
        c = await cam(pg); ok(c['w'] == round(g['m'][2]) or abs(c['w'] - g['m'][2]) <= 1, 'and the camera knows the new size')
        await axe_check(pg, 'the floor page on a phone')
        await ctx.close()
        ok(not ERRS, f'no page errors {ERRS[:2]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all floor window checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
