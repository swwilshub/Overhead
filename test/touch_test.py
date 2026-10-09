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
state = lambda pg: pg.evaluate(f"() => {{ const v = {VS}, f = document.getElementById('floor-app'), c = f.querySelector('canvas'), r = c.getBoundingClientRect(); return {{ zoom: v.zoom, pix: v.pix, mode: v.mode, sel: v.sel, cx: v.cx, cy: v.cy, sl: f.scrollLeft, st: f.scrollTop, cw: c.width, cssW: r.width, left: r.left, top: r.top, fw: f.clientWidth }}; }}")
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
        async def pt(tx, ty):   # the screen point of a tile's centre, after scrolling the floor into view
            await pg.evaluate("() => document.getElementById('floor-app').scrollIntoView({ block: 'start' })")
            s = await state(pg); return (s['left'] + (6 + tx * 16 + 8) * s['zoom'], s['top'] + (28 + ty * 16 + 8) * s['zoom'])
        s = await state(pg)
        ok(1 <= s['zoom'] <= 2, f'on a phone the plant starts between 1× and 2× ({s["zoom"]:.2f})')
        # ---- one finger pans in Select mode, and a drag selects nothing (zoomed in, so there is room to pan)
        await pg.evaluate(f"() => {{ {VS}.zoom = 2; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        s = await state(pg)
        p0 = await pt(mach['x'], mach['y'])
        await drag(cdp, p0, (p0[0] - 120, p0[1]))
        s2 = await state(pg)
        ok(s2['sl'] - s['sl'] >= 90, f'dragging left scrolls the floor right by about that much ({s["sl"]:.0f} -> {s2["sl"]:.0f})')
        ok(s2['sel'] is None, 'a drag that starts on a machine does not select it')
        # ---- a tap selects, and tapping empty floor clears
        await pg.evaluate(f"() => {{ const f = document.getElementById('floor-app'); f.scrollLeft = 0; f.scrollTop = 0; }}"); await pg.wait_for_timeout(100)
        p0 = await pt(mach['x'], mach['y']); await tap(cdp, p0); await pg.wait_for_timeout(400)
        ok((await state(pg))['sel'] == mach['id'], 'a tap on a machine selects it')
        ok(await pg.evaluate("() => document.activeElement.id") == 'floor-app', 'and focus stays on the floor grid')
        pe = await pt(1, 1); await tap(cdp, pe); await pg.wait_for_timeout(300)
        ok((await state(pg))['sel'] is None, 'a tap on empty floor clears the selection')
        await touch(cdp, 'touchStart', p0); await pg.wait_for_timeout(650); await touch(cdp, 'touchEnd'); await pg.wait_for_timeout(300)
        ok((await state(pg))['sel'] is None, 'a touch held for more than half a second is not a tap')
        # ---- pinch zooms about the point between the fingers
        await pg.evaluate("() => { const f = document.getElementById('floor-app'); f.scrollLeft = 0; f.scrollTop = 0; }")
        s = await state(pg); mid = (s['left'] + 180, s['top'] + 200)   # a point on the canvas
        frac = (mid[0] - s['left']) / s['cssW']
        await pg.evaluate("() => { document.getElementById('live-polite').textContent = ''; }")
        await pinch(cdp, mid, 80, 160); await pg.wait_for_timeout(300)
        s2 = await state(pg)
        ok(abs(s2['zoom'] / s['zoom'] - 2) < 0.15 or s2['zoom'] >= 3.9, f'spreading the fingers to twice the distance doubles the zoom ({s["zoom"]:.2f} -> {s2["zoom"]:.2f})')
        frac2 = (mid[0] - s2['left']) / s2['cssW']
        ok(abs(frac - frac2) < 0.02, f'the point between the fingers stays put ({frac:.3f} -> {frac2:.3f})')
        ok(s2['cw'] == s2['pix'] * (s2['cssW'] / s2['zoom']) and s2['pix'] == min(4, max(1, -(-s2['zoom'] // 1))), f'the canvas resolution is a whole number of pixels per tile ({s2["pix"]})')
        say = await pg.locator('#live-polite').inner_text()
        ok(say.count('Zoom') == 1 and 'percent' in say, f'the zoom is announced once, at the end: {say!r}')
        lab = await pg.locator('.floor-tools .zoom-num').inner_text()
        ok(lab.strip() == f'{round(s2["zoom"], 2):g}×', f'the zoom label follows: {lab!r}')
        # ---- pinching in is limited
        async def centre():   # the middle of the floor frame, which is always on screen and on the canvas
            await pg.evaluate("() => document.getElementById('floor-app').scrollIntoView({ block: 'start' })")
            return await pg.evaluate("() => { const r = document.getElementById('floor-app').getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(r.height, innerHeight - r.top - 80) / 2]; }")
        for _ in range(3): await pinch(cdp, await centre(), 200, 20, steps=10)
        await pg.wait_for_timeout(300)
        s3 = await state(pg)
        ok(0.25 - 1e-6 <= s3['zoom'] < 1, f'zooming out stops at the smallest zoom ({s3["zoom"]:.2f})')
        for _ in range(4): await pinch(cdp, await centre(), 30, 300, steps=12)
        await pg.wait_for_timeout(300)
        s3 = await state(pg)
        ok(s3['zoom'] <= 4 + 1e-6 and s3['zoom'] >= 3.9, f'and zooming in stops at 4× ({s3["zoom"]:.2f})')
        # ---- two fingers pan without changing the zoom
        await pg.evaluate("() => { const f = document.getElementById('floor-app'); f.scrollLeft = 300; f.scrollTop = 100; }"); await pg.wait_for_timeout(100)
        s = await state(pg)
        await pinch(cdp, await centre(), 100, 100, shift=(-60, -40)); await pg.wait_for_timeout(200)
        s2 = await state(pg)
        ok(abs(s2['zoom'] - s['zoom']) < 0.01 and s2['sl'] - s['sl'] >= 40, f'two fingers moving together pan and do not zoom (scroll {s["sl"]:.0f} -> {s2["sl"]:.0f}, zoom {s["zoom"]:.2f} -> {s2["zoom"]:.2f})')
        # ---- the buttons do the same
        await pg.tap('[data-key="ft-fit"]'); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok(s['cssW'] <= s['fw'] + 1 and s['sl'] == 0 and s['st'] == 0, f'Fit shows the whole plant width ({s["cssW"]:.0f} of {s["fw"]} px, zoom {s["zoom"]:.2f})')
        await pg.evaluate(f"() => {{ {VS}.zoom = 1; }}"); await pg.evaluate("() => document.querySelector('[data-key=\"ft-select\"]').click()"); await pg.wait_for_timeout(300)
        await pg.tap('[data-key="ft-zi"]'); await pg.wait_for_timeout(200)
        s = await state(pg)
        ok(abs(s['zoom'] - 1.5) < 0.01 and (await pg.locator('.floor-tools .zoom-num').inner_text()).strip() == '1.5×', f'the + button goes from 1× to 1.5× ({s["zoom"]})')
        await pg.tap('[data-key="ft-zo"]'); await pg.tap('[data-key="ft-zo"]'); await pg.wait_for_timeout(200)
        ok(abs((await state(pg))['zoom'] - 0.75) < 0.01, 'and the − button steps back down through 1× to 0.75×')
        for k in ('ft-zo', 'ft-zi', 'ft-fit', 'ft-select'):
            r = await pg.evaluate("(k) => { const r = document.querySelector('[data-key=\"' + k + '\"]').getBoundingClientRect(); return [r.width, r.height]; }", k)
            ok(r[0] >= 44 and r[1] >= 44, f'{k} is at least 44 px ({r[0]:.0f} x {r[1]:.0f})')
        # ---- scroll position survives a redraw of the floor
        await pg.evaluate(f"() => {{ {VS}.zoom = 2; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const f = document.getElementById('floor-app'); f.scrollLeft = 150; f.scrollTop = 40; }"); await pg.wait_for_timeout(100)
        await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok(abs(s['sl'] - 150) <= 2 and abs(s['st'] - 40) <= 2, f'the floor stays where it was scrolled when the page redraws ({s["sl"]:.0f}, {s["st"]:.0f})')
        # ---- painting: one finger paints and does not pan
        await pg.evaluate(f"() => {{ {VS}.zoom = 2; const f = document.getElementById('floor-app'); f.scrollLeft = 0; f.scrollTop = 0; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('[data-key="ft-zonesel"]').is_hidden(), 'on a phone the zone picker waits until Paint zones is chosen')
        await pg.tap('[data-key="ft-zone"]'); await pg.wait_for_timeout(300)
        await pg.select_option('[data-key="ft-zonesel"]', '2'); await pg.wait_for_timeout(200)
        before = await pg.evaluate(f"() => {O}.app.st.floor.zones.filter(z => z === 2).length")
        a = await pt(2, 12); c = await pt(8, 12)
        await drag(cdp, a, c, steps=10); await pg.wait_for_timeout(200)
        after = await pg.evaluate(f"() => {O}.app.st.floor.zones.filter(z => z === 2).length"); s = await state(pg)
        ok(after - before >= 4 and s['sl'] == 0, f'a one-finger drag with Paint zones paints squares and does not pan ({before} -> {after}, scroll {s["sl"]:.0f})')
        # ---- laying conveyor by dragging
        await pg.tap('[data-key="ft-belt"]'); await pg.wait_for_timeout(300)
        n0 = await pg.evaluate(f"() => {O}.app.st.floor.objects.filter(o => o.kind === 'conveyor').length")
        a = await pt(2, 9); c = await pt(8, 9)
        await drag(cdp, a, c, steps=10); await pg.wait_for_timeout(300)
        n1 = await pg.evaluate(f"() => {O}.app.st.floor.objects.filter(o => o.kind === 'conveyor').length")
        ok(n1 - n0 >= 4, f'dragging with Lay conveyor lays belt ({n0} -> {n1} sections)')
        await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        # ---- placing needs a confirm (zoomed out, so the empty right-hand side of the floor is on screen)
        await pg.evaluate(f"() => {{ {VS}.zoom = 1; }}"); await pg.tap('[data-key="ft-select"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('.place-bar').count() == 0, 'no placement bar when nothing is being placed')
        await pg.evaluate("() => { document.querySelector('nav.tabbar [data-key=\"menu\"]').click(); }"); await pg.wait_for_timeout(250)
        await pg.tap('dialog.menu-sheet [data-key="nav-catalog"]'); await pg.wait_for_timeout(400)
        await pg.locator('button:has-text("Place, making")').first.tap(); await pg.wait_for_timeout(700)
        bar = await pg.locator('.place-bar').inner_text() if await pg.locator('.place-bar').count() else ''
        ok('Place here' in bar and 'Rotate' in bar and 'Cancel' in bar, f'placing shows Place here, Rotate and Cancel: {" ".join(bar.split())}')
        for k in ('place-here', 'place-rotate', 'place-cancel'):
            r = await pg.evaluate("(k) => { const r = document.querySelector('[data-key=\"' + k + '\"]').getBoundingClientRect(); return [r.width, r.height]; }", k)
            ok(r[0] >= 44 and r[1] >= 44, f'{k} is at least 44 px ({r[0]:.0f} x {r[1]:.0f})')
        cash0 = await pg.evaluate(f"() => {O}.app.st.bank.checking"); objs0 = await pg.evaluate(f"() => {O}.app.st.floor.objects.length")
        s = await state(pg); t = await pt(14, 10)
        await tap(cdp, t); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok(s['mode'] == 'place' and (s['cx'], s['cy']) != (0, 0), f'a touch moves the ghost ({s["cx"]}, {s["cy"]}) and does not place it')
        ok(await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0 and await pg.evaluate(f"() => {O}.app.st.bank.checking") == cash0, 'nothing is bought by touching')
        t2 = await pt(15, 11); await drag(cdp, t, t2, steps=6); await pg.wait_for_timeout(300)
        s = await state(pg)
        ok((s['cx'], s['cy']) != (0, 0) and s['mode'] == 'place' and await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0, f'a drag carries the ghost without placing ({s["cx"]}, {s["cy"]})')
        await axe_check(pg, 'phone floor with the placement bar')
        await pg.tap('[data-key="place-rotate"]'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate(f"() => {VS}.rot") == 1, 'Rotate turns the ghost')
        await pg.tap('[data-key="place-cancel"]'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate(f"() => {VS}.mode") == 'select' and await pg.locator('.place-bar').count() == 0 and await pg.evaluate(f"() => {O}.app.st.floor.objects.length") == objs0, 'Cancel buys nothing and closes the bar')
        # place for real
        await pg.evaluate("() => { document.querySelector('nav.tabbar [data-key=\"menu\"]').click(); }"); await pg.wait_for_timeout(250)
        await pg.tap('dialog.menu-sheet [data-key="nav-catalog"]'); await pg.wait_for_timeout(400)
        await pg.locator('button:has-text("Place, making")').first.tap(); await pg.wait_for_timeout(700)
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
        ok(z == 2 and (await d.locator('.floor-tools .zoom-num').inner_text()).strip() == '2×', f'desktop: the floor still starts at 2× ({z})')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all touch checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
