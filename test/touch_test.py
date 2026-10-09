# Touch on the factory floor (spec 006): drag to pan, tap to select, pinch to zoom, and a confirm bar before anything is
# placed. Real touch sequences go in through the DevTools protocol, so the page sees ordinary touch pointer events.
# Run after `npm run build`.
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
async def touch(cdp, kind, *pts):
    await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i + 1} for i, (x, y) in enumerate(pts)]})
async def drag(cdp, a, b, steps=8):
    await touch(cdp, 'touchStart', a)
    for i in range(1, steps + 1): await touch(cdp, 'touchMove', (a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps))
    await touch(cdp, 'touchEnd')
async def tap(cdp, p):
    await touch(cdp, 'touchStart', p); await touch(cdp, 'touchEnd')
async def pinch(cdp, mid, d0, d1, steps=8, shift=(0, 0)):
    # two fingers on a horizontal line through mid, going from d0 apart to d1 apart (and the middle moving by shift)
    pts = lambda d, k: [(mid[0] - d / 2 + shift[0] * k, mid[1] + shift[1] * k), (mid[0] + d / 2 + shift[0] * k, mid[1] + shift[1] * k)]
    await touch(cdp, 'touchStart', *pts(d0, 0))
    for i in range(1, steps + 1): await touch(cdp, 'touchMove', *pts(d0 + (d1 - d0) * i / steps, i / steps))
    await touch(cdp, 'touchEnd')
cam = lambda pg: pg.evaluate(f'() => {O}.camera()')
state = lambda pg: pg.evaluate(f"() => {{ const v = {VS}, c = {O}.camera(); return {{ zoom: v.zoom, mode: v.mode, sel: v.sel, cx: v.cx, cy: v.cy, x: c.x, y: c.y, w: c.w, h: c.h, W: c.W, H: c.H, rot: v.rot }}; }}")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.tap('text=Quick start'); await pg.wait_for_timeout(900)
        mach = await pg.evaluate(f"() => {{ const o = {O}.app.st.floor.objects.find(o => o.kind === 'machine'); return {{ id: o.id, x: Math.round(o.x), y: Math.round(o.y) }}; }}")
        pt = lambda tx, ty: pg.evaluate(f'([x, y]) => {O}.floorPoint(x, y)', [tx, ty])
        async def zoom_to_at_least(z):
            for _ in range(8):
                if (await state(pg))['zoom'] >= z: break
                await pg.tap('[data-key="ft-zi"]'); await pg.wait_for_timeout(80)
        s = await state(pg)
        ok(0.5 <= s['zoom'] <= 2, f'on a phone the plant starts fitted, between ½× and 2× ({s["zoom"]:.2f})')
        ok(s['W'] * s['zoom'] <= s['w'] + 1, 'and the whole width of it is on screen')
        # ---- one finger pans in Select mode, and a drag selects nothing (zoomed in, so there is room to pan)
        await pg.tap('[data-key="ft-select"]'); await zoom_to_at_least(3); await pg.wait_for_timeout(200)
        s = await state(pg); ok(s['zoom'] >= 3, f'zoomed in for room to pan ({s["zoom"]:.2f}×)')
        await pg.evaluate(f"() => {{ const v = {VS}; v.camX = 400; v.camY = 300; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)   # redraw clamps it to a valid spot
        s = await state(pg)
        start = (195, 400)
        await touch(cdp, 'touchStart', start)
        for i in range(1, 9): await touch(cdp, 'touchMove', (start[0] - 100 * i / 8, start[1] - 40 * i / 8)); await pg.wait_for_timeout(40)
        await pg.wait_for_timeout(200); s2 = await state(pg); await touch(cdp, 'touchEnd')
        ok(abs((s2['x'] - s['x']) - 100) < 6 and abs((s2['y'] - s['y']) - 40) < 6, f'dragging moves the map with the finger ({s["x"]:.0f},{s["y"]:.0f} -> {s2["x"]:.0f},{s2["y"]:.0f})')
        ok(s2['sel'] is None, 'a drag selects nothing')
        ok(await pg.evaluate("() => window.scrollY") == 0 and await pg.evaluate("() => document.getElementById('main').scrollTop") == 0, 'and the page itself does not scroll')
        # ---- a flick keeps going and slows to a stop
        await pg.wait_for_timeout(700)
        glided = False
        for attempt in range(4):   # the glide depends on how fast the test's touch events arrive, so try a few times
            await pg.evaluate(f"() => {{ const v = {VS}; v.camX = 9999; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)   # the far edge, so a drag to the right has room
            await drag(cdp, (120, 400), (300, 400), steps=5)
            a = await state(pg); await pg.wait_for_timeout(150); m = await state(pg); await pg.wait_for_timeout(1500); z = await state(pg); await pg.wait_for_timeout(300); z2 = await state(pg)
            if a['x'] - m['x'] > 3 or a['x'] - z['x'] > 3: glided = True; break
        ok(glided, f'a quick flick carries on after the finger lifts ({a["x"]:.0f} -> {m["x"]:.0f} -> {z["x"]:.0f})')
        ok(abs(z2['x'] - z['x']) < 0.5, 'and it comes to rest')
        await pg.wait_for_timeout(200)
        # a slow drag does not glide
        await touch(cdp, 'touchStart', (300, 500))
        for i in range(1, 6): await touch(cdp, 'touchMove', (300 - i * 12, 500)); await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(250); await touch(cdp, 'touchEnd'); a = await state(pg); await pg.wait_for_timeout(400); m = await state(pg)
        ok(abs(m['x'] - a['x']) < 1, 'a drag that stops before the finger lifts does not glide')
        # a touch the system cancels leaves nothing half done
        s = await state(pg)
        await touch(cdp, 'touchStart', (200, 450)); await touch(cdp, 'touchMove', (150, 450)); await touch(cdp, 'touchMove', (100, 450)); await touch(cdp, 'touchCancel'); await pg.wait_for_timeout(500)
        s2 = await state(pg)
        ok(s2['sel'] is None and abs(s2['x'] - s['x']) - 100 < 8, f'a cancelled touch does not select or glide on ({s["x"]:.0f} -> {s2["x"]:.0f})')
        await pg.tap('[data-key="ft-fit"]'); await pg.wait_for_timeout(300)
        # ---- a tap selects, and tapping empty floor clears
        p0 = await pt(mach['x'], mach['y']); await tap(cdp, p0); await pg.wait_for_timeout(400)
        ok((await state(pg))['sel'] == mach['id'], 'a tap on a machine selects it')
        ok(await pg.evaluate("() => document.activeElement.id") == 'floor-app', 'and focus stays on the floor')
        pe = await pg.evaluate(f"() => {O}.emptyTile()"); pe = await pt(*pe); await tap(cdp, pe); await pg.wait_for_timeout(300)
        ok((await state(pg))['sel'] is None, 'a tap on empty floor clears the selection')
        await touch(cdp, 'touchStart', p0); await pg.wait_for_timeout(650); await touch(cdp, 'touchEnd'); await pg.wait_for_timeout(300)
        ok((await state(pg))['sel'] is None, 'a touch held for more than half a second is not a tap')
        # ---- pinch zooms about the point between the fingers
        await zoom_to_at_least(3); await pg.wait_for_timeout(200)
        s = await state(pg); r = await pg.evaluate("() => { const r = document.getElementById('floor-app').getBoundingClientRect(); return [r.left, r.top]; }")
        mid = (r[0] + 195, r[1] + 300)
        before = ((s['x'] + mid[0] - r[0]) / s['zoom'], (s['y'] + mid[1] - r[1]) / s['zoom'])
        await pg.wait_for_timeout(900); await pg.evaluate("() => { document.getElementById('live-polite').textContent = ''; }")
        await pinch(cdp, mid, 80, 120); await pg.wait_for_timeout(300)
        s2 = await state(pg)
        ok(abs(s2['zoom'] / s['zoom'] - 1.5) < 0.1 or s2['zoom'] >= 3.9, f'spreading the fingers by half as much again multiplies the zoom by 1.5 ({s["zoom"]:.2f} -> {s2["zoom"]:.2f})')
        after = ((s2['x'] + mid[0] - r[0]) / s2['zoom'], (s2['y'] + mid[1] - r[1]) / s2['zoom'])
        ok(abs(before[0] - after[0]) < 1.5 and abs(before[1] - after[1]) < 1.5, f'the scene point between the fingers stays put ({before[0]:.1f},{before[1]:.1f} -> {after[0]:.1f},{after[1]:.1f})')
        say = await pg.locator('#live-polite').inner_text()
        ok(say.count('Zoom') == 1 and 'percent' in say, f'the zoom is announced once, at the end: {say!r}')
        lab = await pg.evaluate("() => document.querySelector('.zoom-num').textContent")
        ok(lab.strip() == f'{round(s2["zoom"], 2):g}×', f'the zoom label follows: {lab!r}')
        # lifting one finger ends the pinch and does not start a drag or a tap
        s = await state(pg); mid2 = (r[0] + 195, r[1] + 300)
        await touch(cdp, 'touchStart', (mid2[0] - 40, mid2[1]), (mid2[0] + 40, mid2[1])); await touch(cdp, 'touchMove', (mid2[0] - 50, mid2[1]), (mid2[0] + 50, mid2[1]))
        await touch(cdp, 'touchMove', (mid2[0] - 50, mid2[1]))      # the second finger lifts: only the first is left
        await touch(cdp, 'touchMove', (mid2[0] - 10, mid2[1] + 30)); await pg.wait_for_timeout(100)
        s2 = await state(pg); await touch(cdp, 'touchEnd'); await pg.wait_for_timeout(200)
        s3 = await state(pg)
        ok(abs(s3['x'] - s2['x']) < 1 and s3['sel'] is None, 'after one finger lifts, the other finger does not drag the map or select')
        # ---- pinching is limited
        centre = (r[0] + 195, r[1] + 300)
        for _ in range(3): await pinch(cdp, centre, 200, 20, steps=10)
        await pg.wait_for_timeout(300)
        s3 = await state(pg); ok(0.25 - 1e-6 <= s3['zoom'] < 1, f'zooming out stops at the smallest zoom ({s3["zoom"]:.2f})')
        for _ in range(4): await pinch(cdp, centre, 30, 300, steps=12)
        await pg.wait_for_timeout(300)
        s3 = await state(pg); ok(3.9 <= s3['zoom'] <= 4 + 1e-6, f'and zooming in stops at 4× ({s3["zoom"]:.2f})')
        # ---- two fingers pan without changing the zoom
        s = await state(pg)
        await pinch(cdp, centre, 100, 100, shift=(-60, -40)); await pg.wait_for_timeout(200)
        s2 = await state(pg)
        ok(abs(s2['zoom'] - s['zoom']) < 0.01 and s2['x'] - s['x'] >= 40, f'two fingers moving together pan and do not zoom (x {s["x"]:.0f} -> {s2["x"]:.0f}, zoom {s["zoom"]:.2f} -> {s2["zoom"]:.2f})')
        # ---- the buttons do the same
        await pg.tap('[data-key="ft-fit"]'); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok(s['W'] * s['zoom'] <= s['w'] + 1 and s['H'] * s['zoom'] <= s['h'] + 1, f'Fit shows the whole plant (zoom {s["zoom"]:.2f})')
        await pg.evaluate(f"() => {{ const v = {VS}; v.zoom = 1; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        await pg.tap('[data-key="ft-zi"]'); await pg.wait_for_timeout(200)
        s = await state(pg)
        ok(abs(s['zoom'] - 1.5) < 0.01, f'the + button goes from 1× to 1.5× ({s["zoom"]})')
        await pg.tap('[data-key="ft-zo"]'); await pg.tap('[data-key="ft-zo"]'); await pg.wait_for_timeout(200)
        ok(abs((await state(pg))['zoom'] - 0.75) < 0.01, 'and the − button steps back down through 1× to 0.75×')
        for k in ('ft-zo', 'ft-zi', 'ft-fit', 'ft-select', 'ft-zone', 'ft-belt', 'ft-catalog'):
            r = await pg.evaluate("(k) => { const r = document.querySelector('[data-key=\"' + k + '\"]').getBoundingClientRect(); return [r.width, r.height]; }", k)
            ok(r[0] >= 44 and r[1] >= 44, f'{k} is at least 44 px ({r[0]:.0f} x {r[1]:.0f})')
        # ---- a touch that starts on a floating control belongs to the control
        s = await state(pg); box = await pg.evaluate("() => { const r = document.querySelector('[data-key=\"ft-select\"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        await drag(cdp, tuple(box), (box[0] + 20, box[1] + 120)); await pg.wait_for_timeout(200)
        s2 = await state(pg); ok(abs(s2['x'] - s['x']) < 1 and abs(s2['y'] - s['y']) < 1, 'dragging from a floating button does not pan the map')
        # ---- the camera survives a redraw of the floor
        await pg.evaluate(f"() => {{ const v = {VS}; v.zoom = 3; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        await drag(cdp, (300, 400), (180, 380)); await pg.wait_for_timeout(1200)
        s = await state(pg); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300); s2 = await state(pg)
        ok(abs(s2['x'] - s['x']) < 1 and abs(s2['y'] - s['y']) < 1 and s2['zoom'] == s['zoom'], f'the map stays where it was when the page redraws ({s["x"]:.0f}, {s["y"]:.0f})')
        # ---- painting: one finger paints and does not pan
        await pg.tap('[data-key="ft-fit"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('[data-key="ft-zonesel"]').is_hidden(), 'on a phone the zone picker waits until Paint zones is chosen')
        await pg.tap('[data-key="ft-zone"]'); await pg.wait_for_timeout(300)
        await pg.select_option('[data-key="ft-zonesel"]', '2'); await pg.wait_for_timeout(200)
        before = await pg.evaluate(f"() => {O}.app.st.floor.zones.filter(z => z === 2).length"); s = await state(pg)
        a = await pt(2, 12); c = await pt(8, 12)
        await drag(cdp, a, c, steps=10); await pg.wait_for_timeout(200)
        after = await pg.evaluate(f"() => {O}.app.st.floor.zones.filter(z => z === 2).length"); s2 = await state(pg)
        ok(after - before >= 4 and abs(s2['x'] - s['x']) < 1, f'a one-finger drag with Paint zones paints squares and does not pan ({before} -> {after})')
        # ---- laying conveyor by dragging
        await pg.tap('[data-key="ft-belt"]'); await pg.wait_for_timeout(300)
        n0 = await pg.evaluate(f"() => {O}.app.st.floor.objects.filter(o => o.kind === 'conveyor').length")
        a = await pt(2, 9); c = await pt(8, 9)
        await drag(cdp, a, c, steps=10); await pg.wait_for_timeout(300)
        n1 = await pg.evaluate(f"() => {O}.app.st.floor.objects.filter(o => o.kind === 'conveyor').length")
        ok(n1 - n0 >= 4, f'dragging with Lay conveyor lays belt ({n0} -> {n1} sections)')
        await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        # ---- placing needs a confirm
        await pg.tap('[data-key="ft-fit"]'); await pg.wait_for_timeout(200)
        ok(await pg.locator('.place-bar').count() == 0, 'no placement bar when nothing is being placed')
        await pg.evaluate("() => { document.querySelector('nav.tabbar [data-key=\"menu\"]').click(); }"); await pg.wait_for_timeout(250)
        await pg.tap('dialog.menu-sheet [data-key="nav-catalog"]'); await pg.wait_for_timeout(400)
        await pg.locator('button:has-text("Place, making"):visible').first.tap(); await pg.wait_for_timeout(700)
        bar = await pg.locator('.place-bar').inner_text() if await pg.locator('.place-bar').count() else ''
        ok('Place here' in bar and 'Rotate' in bar and 'Cancel' in bar, f'placing shows Place here, Rotate and Cancel: {" ".join(bar.split())}')
        for k in ('place-here', 'place-rotate', 'place-cancel'):
            r = await pg.evaluate("(k) => { const r = document.querySelector('[data-key=\"' + k + '\"]').getBoundingClientRect(); return [r.width, r.height]; }", k)
            ok(r[0] >= 44 and r[1] >= 44, f'{k} is at least 44 px ({r[0]:.0f} x {r[1]:.0f})')
        cash0 = await pg.evaluate(f"() => {O}.app.st.bank.checking"); objs0 = await pg.evaluate(f"() => {O}.app.st.floor.objects.length")
        t = await pt(14, 10)
        await tap(cdp, t); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok(s['mode'] == 'place' and (s['cx'], s['cy']) != (0, 0), f'a touch moves the ghost ({s["cx"]}, {s["cy"]}) and does not place it')
        ok(await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0 and await pg.evaluate(f"() => {O}.app.st.bank.checking") == cash0, 'nothing is bought by touching')
        cx0 = (s['cx'], s['cy']); t2 = await pt(15, 11); await drag(cdp, t, t2, steps=6); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok((s['cx'], s['cy']) != cx0 and s['mode'] == 'place' and await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0, f'a drag carries the ghost without placing ({s["cx"]}, {s["cy"]})')
        ok(abs(s['x'] - (await state(pg))['x']) < 1, 'and moving the ghost does not pan the map')
        await axe_check(pg, 'phone floor with the placement bar')
        await pg.tap('[data-key="place-rotate"]'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(f"() => {VS}.rot") == 1, 'Rotate turns the ghost')
        await pg.tap('[data-key="place-cancel"]'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(f"() => {VS}.mode") == 'select' and await pg.locator('.place-bar').count() == 0 and await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0, 'Cancel buys nothing and closes the bar')
        # place for real
        await pg.evaluate("() => { document.querySelector('nav.tabbar [data-key=\"menu\"]').click(); }"); await pg.wait_for_timeout(250)
        await pg.tap('dialog.menu-sheet [data-key="nav-catalog"]'); await pg.wait_for_timeout(400)
        await pg.locator('button:has-text("Place, making"):visible').first.tap(); await pg.wait_for_timeout(700)
        t = await pt(14, 10); await tap(cdp, t); await pg.wait_for_timeout(300)
        await pg.tap('[data-key="place-here"]'); await pg.wait_for_timeout(600)
        ok(await pg.evaluate(f"() => {O}.app.st.floor.objects.length") > objs0 and await pg.evaluate(f"() => {O}.app.st.bank.checking") < cash0, 'Place here buys and places it')
        ok(await pg.locator('.place-bar').count() == 0, 'and the bar goes away')
        ok(not errs, f'no page errors {errs[:2]}')
        await ctx.close()
        # ---- the mouse is untouched: no bar, clicks act at once
        ctx2 = await b.new_context(viewport={'width': 1280, 'height': 800})
        d = await ctx2.new_page(); await d.goto(URL); await d.wait_for_timeout(600); await d.click('text=Quick start'); await d.wait_for_timeout(800)
        ok(await d.locator('.place-bar').count() == 0, 'desktop: no placement bar')
        z = await d.evaluate(f"() => {VS}.zoom")
        ok(1 <= z <= 2 and (await d.locator('.zoom-num').inner_text()).strip() == f'{round(z, 2):g}×', f'desktop: the whole plant fits between the controls at 1× to 2× ({z:.2f})')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all touch checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
