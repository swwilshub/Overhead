# The game on a phone (specs 007 to 009): a slim top bar, a bottom bar and a Menu sheet, in portrait and landscape,
# with touch emulation. Run after `npm run build`.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, launch_opts
from playwright.async_api import async_playwright
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
SECTIONS = ['floor', 'catalog', 'research', 'staff', 'hire', 'inbox', 'purchasing', 'sales', 'bank', 'reports', 'city', 'nation', 'options']
async def axe_check(pg, where):
    if not await pg.evaluate("() => !!window.axe"): await pg.add_script_tag(content=AXE)
    res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].target)")
    if res: print('AXE', where, res)
    ok(not res, f'axe on {where}')
box = lambda pg, sel: pg.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }", sel)
active = lambda pg: pg.evaluate("() => { const a = document.activeElement; return { key: a.dataset?.key || '', tag: a.tagName, inMenu: !!a.closest('dialog.menu-sheet'), text: (a.textContent || '').trim().slice(0, 20) }; }")
async def phone(b, w=390, h=844):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(700)
    await pg.tap('text=Quick start'); await pg.wait_for_timeout(800)
    return pg
async def open_menu(pg):
    await pg.tap('[data-key="menu"]'); await pg.wait_for_timeout(250)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await phone(b)
        # ---- spec 007: the slim top bar
        top = await box(pg, 'header.status')
        ok(top['h'] <= 96, f'the top bar is at most 96 px tall ({top["h"]:.0f})')
        txt = (await pg.locator('header.status').inner_text()).lower()
        ok('checking' in txt and 'net worth' not in txt and 'run until' not in txt and 'sound' not in txt, f'the top bar shows money and the clock, not the rest: {" ".join(txt.split())[:90]}')
        for k in ('speed-0', 'speed-1', 'speed-2', 'speed-3'):
            r = await box(pg, f'[data-key="{k}"]')
            ok(r['w'] >= 44 and r['h'] >= 44, f'{k} is at least 44 px square ({r["w"]:.0f} x {r["h"]:.0f})')
        names = await pg.locator('header.status .run button').evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
        ok(names == ['Pause', 'Play', 'Fast', 'Faster'], f'the speed buttons keep their names: {names}')
        # ---- the bottom bar
        bar = await box(pg, 'nav.tabbar[aria-label="Main"]')
        vh = await pg.evaluate("() => innerHeight")
        ok(bar is not None and bar['h'] >= 48 and abs(bar['b'] - vh) <= 1, f'a bottom bar at least 48 px high sits at the bottom ({bar and round(bar["h"])} px, bottom {bar and round(bar["b"])} of {vh})')
        labels = await pg.locator('nav.tabbar li > *').evaluate_all("els => els.map(e => e.textContent.trim().replace(/\\d+$/, ''))")
        ok(labels == ['Floor', 'Staff', 'In-basket', 'Menu'], f'the bottom bar has Floor, Staff, In-basket and Menu: {labels}')
        ok(await pg.locator('nav.rail').count() == 0, 'the side menu is not on the page')
        cur = await pg.locator('nav.tabbar a[aria-current="page"]').inner_text()
        ok(cur.strip() == 'Floor', f'the current section is marked: {cur.strip()}')
        await axe_check(pg, 'phone floor, menu closed')
        # ---- the Menu sheet
        await open_menu(pg)
        dlg = await box(pg, 'dialog.menu-sheet')
        ok(dlg is not None and dlg['w'] >= 389 and abs(dlg['b'] - vh) <= 1 and dlg['y'] > 60, f'the Menu is a sheet from the bottom with the screen visible above it ({dlg})')
        links = await pg.locator('dialog.menu-sheet nav[aria-label="Departments"] button').evaluate_all("els => els.map(e => e.dataset.key.slice(4))")
        ok(links == SECTIONS, f'the Menu lists every section: {links}')
        mt = (await pg.locator('dialog.menu-sheet').inner_text()).lower()
        ok('net worth' in mt and 'city' in mt and 'run until' in mt and 'sound' in mt, 'the Menu has net worth, city, Run until and Sound')
        small = await pg.evaluate("() => [...document.querySelectorAll('dialog.menu-sheet button')].filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(e => e.textContent.trim())")
        ok(not small, f'every Menu control is at least 44 px: {small}')
        a = await active(pg)
        ok(a['inMenu'], f'focus is inside the Menu when it opens ({a})')
        await axe_check(pg, 'phone Menu open')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        a = await active(pg)
        ok(await pg.locator('dialog.menu-sheet').count() == 0 and a['key'] == 'menu', f'Escape closes it and focus returns to Menu ({a})')
        await open_menu(pg); await pg.touchscreen.tap(195, 60); await pg.wait_for_timeout(250)
        ok(await pg.locator('dialog.menu-sheet').count() == 0, 'a tap on the screen above the sheet closes it')
        await open_menu(pg); await pg.tap('[data-key="menu-close"]'); await pg.wait_for_timeout(250)
        a = await active(pg)
        ok(await pg.locator('dialog.menu-sheet').count() == 0 and a['key'] == 'menu', f'Close closes it and focus returns to Menu ({a})')
        # every section in at most two taps (Menu, then the section)
        for v in SECTIONS:
            await open_menu(pg); await pg.tap(f'dialog.menu-sheet [data-key="nav-{v}"]'); await pg.wait_for_timeout(300)
            shown = await pg.evaluate("(v) => window.__overhead.app.view === v", v)
            gone = await pg.locator('dialog.menu-sheet').count() == 0
            if not (shown and gone): ok(False, f'{v} opens from the Menu in two taps and the Menu closes (view ok {shown}, closed {gone})')
        ok(True, 'all 13 sections open from the Menu in two taps')
        await pg.tap('nav.tabbar [data-key="tab-inbox"]'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("() => window.__overhead.app.view") == 'inbox', 'In-basket opens from the bottom bar in one tap')
        await open_menu(pg); await pg.tap('dialog.menu-sheet [data-key="runto"]'); await pg.wait_for_timeout(300)
        ok(await pg.locator('dialog:has-text("Run the clock until")').count() == 1 and await pg.locator('dialog.menu-sheet').count() == 0, 'Run until… from the Menu opens its question')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await open_menu(pg); await pg.tap('dialog.menu-sheet [data-key="mute"]'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("() => window.__overhead.app && document.querySelector('dialog.menu-sheet [data-key=\"mute\"]').getAttribute('aria-pressed')") == 'true', 'Sound from the Menu mutes')
        await pg.tap('dialog.menu-sheet [data-key="mute"]'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # keyboard shortcuts still work in compact mode
        await pg.evaluate("() => document.getElementById('main').focus()")
        await pg.keyboard.press('g'); await pg.keyboard.press('b'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("() => window.__overhead.app.view") == 'bank', 'g then b still opens the Bank')
        # ---- no sideways scrolling at 320, 390 and 430 px, on every section
        for w in (320, 390, 430):
            await pg.set_viewport_size({'width': w, 'height': 800}); await pg.wait_for_timeout(250)
            bad = []
            for v in SECTIONS:
                await open_menu(pg); await pg.tap(f'dialog.menu-sheet [data-key="nav-{v}"]'); await pg.wait_for_timeout(250)
                # against the device width, not innerWidth: a phone zooms out to fit a wide page and innerWidth grows with it
                sw = await pg.evaluate("(w) => Math.max(document.documentElement.scrollWidth, innerWidth, document.getElementById('main').scrollWidth) - w", w)
                if sw > 1: bad.append((v, sw))
            ok(not bad, f'no sideways scrolling on any section at {w} px wide{": " + str(bad) if bad else ""}')
        # ---- landscape
        await pg.set_viewport_size({'width': 844, 'height': 390}); await pg.wait_for_timeout(300)
        top = await box(pg, 'header.status'); bar = await box(pg, 'nav.tabbar')
        ok(top['h'] <= 60, f'in landscape the top bar is one line ({top["h"]:.0f} px)')
        ok(bar is not None and bar['b'] <= 391 and top['h'] + bar['h'] <= 130, f'in landscape both bars leave most of the screen ({top["h"]:.0f} + {bar["h"]:.0f} of 390)')
        await axe_check(pg, 'phone landscape')
        # ---- crossing the breakpoint rebuilds the page
        await pg.set_viewport_size({'width': 1280, 'height': 800}); await pg.wait_for_timeout(400)
        ok(await pg.locator('nav.rail').count() == 1 and await pg.locator('nav.tabbar').count() == 0 and await pg.locator('header.status.compact').count() == 0, 'widening the window brings back the side menu')
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(400)
        ok(await pg.locator('nav.tabbar').count() == 1 and await pg.locator('nav.rail').count() == 0, 'narrowing it brings back the bottom bar')
        ok(not pg.errs, f'no page errors {pg.errs[:2]}')
        await pg.context.close()
        # ---- the desktop layout is unchanged
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800})
        d = await ctx.new_page(); await d.goto(URL); await d.wait_for_timeout(600); await d.click('text=Quick start'); await d.wait_for_timeout(700)
        ok(await d.locator('nav.rail[aria-label="Departments"]').count() == 1 and await d.locator('nav.tabbar').count() == 0, 'desktop: the side menu and no bottom bar')
        ok('net worth' in (await d.locator('header.status').inner_text()).lower() and await d.locator('[data-key="runto"]').count() == 1, 'desktop: the full status bar')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all phone checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
