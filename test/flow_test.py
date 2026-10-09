import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        async def live(): return (await pg.locator('#live-polite').inner_text()) + ' || ' + (await pg.locator('#live-assertive').inner_text())
        await pg.goto(URL); await pg.wait_for_timeout(800)
        # new game via the form
        await pg.fill('#ng-company', 'Test Works'); await pg.check('#ng-scen-angel'); await pg.fill('#ng-seed', '42')
        await pg.click('text=Found the company'); await pg.wait_for_timeout(400)
        print('view after found:', await pg.locator('h1').first.inner_text())
        # choose Denver via keyboard on the map
        await pg.focus('[data-key="city-22"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('city info:', await pg.locator('#city-info-h').inner_text())
        await pg.click('[data-key="visit"]'); await pg.wait_for_timeout(400)
        print('view:', await pg.locator('h1').first.inner_text())
        # keyboard across the lot grid, then lease the first vacant one we land on
        await pg.focus('.city-grid button[tabindex="0"]')
        for k in ['ArrowRight','ArrowDown','ArrowRight']: await pg.keyboard.press(k)
        btn = pg.locator('[data-key="lease"]')
        tries = 0
        while await btn.count() == 0 and tries < 30:
            await pg.keyboard.press('ArrowRight'); tries += 1; await pg.wait_for_timeout(50)
            btn = pg.locator('[data-key="lease"]')
        # the lot panel is replaced on arrow; re-render by clicking the focused lot to get the lease button
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        await pg.click('[data-key="lease"]'); await pg.wait_for_timeout(200)
        await pg.click('dialog button:has-text("Sign lease")'); await pg.wait_for_timeout(500)
        print('after lease:', await pg.locator('h1').first.inner_text(), '| cash', await pg.locator('#st-cash').inner_text())
        # catalog -> place a Motor machine by clicking on the canvas
        await pg.click('nav.rail a[href="#catalog"]'); await pg.click('#tab-f2'); await pg.click('#cat-panel button.primary'); await pg.wait_for_timeout(300)
        await pg.focus('#floor-app')
        for k in ['ArrowRight']*8 + ['ArrowDown']*5: await pg.keyboard.press(k)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('placed?', await live())
        # keyboard: paint safety zone at the machine input (left of the machine at x=6..9 -> input at column 6? use describe)
        await pg.select_option('[data-key="ft-zonesel"]', '2'); await pg.wait_for_timeout(200)
        await pg.focus('#floor-app')
        await pg.keyboard.press('Home')
        # move cursor to column 6,row 7 (input tile) : machine centered at (8,6) -> x from 6..9? compute via speech
        for i in range(10): await pg.keyboard.press('ArrowLeft')
        for i in range(10): await pg.keyboard.press('ArrowUp')
        for i in range(5): await pg.keyboard.press('ArrowRight')
        for i in range(6): await pg.keyboard.press('ArrowDown')
        await pg.wait_for_timeout(300); print('cursor says:', await live())
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300); print('paint:', await live())
        print('setup issues:', await pg.locator('.notice').count() and await pg.locator('.notice').first.inner_text())
        # hiring: place an ad for operator and run to next morning
        await pg.click('nav.rail a[href="#hire"]'); await pg.click('[data-key="ad-operations"]'); await pg.wait_for_timeout(200)
        await pg.click('.status .run button:has-text("Run until")'); await pg.click('dialog button:has-text("Next morning")'); await pg.wait_for_timeout(3000)
        await pg.click('nav.rail a[href="#hire"]'); await pg.wait_for_timeout(300)
        n = await pg.locator('[data-key^="res-"]').count(); print('resumes:', n)
        if n:
            await pg.locator('[data-key^="res-"]').first.click(); await pg.wait_for_timeout(300)
            await pg.click('dialog button:has-text("Make offer")'); await pg.wait_for_timeout(300); print('offer:', await live())
        # purchase dialog
        await pg.click('nav.rail a[href="#purchasing"]'); await pg.wait_for_timeout(300)
        if await pg.locator('[data-key^="buy-"]').count():
            await pg.locator('[data-key^="buy-"]').first.click(); await pg.wait_for_timeout(200)
            await pg.click('dialog button:has-text("Place order")'); await pg.wait_for_timeout(200); print('order:', await live())
        # bank loan
        await pg.click('nav.rail a[href="#bank"]'); await pg.fill('#loan-amt', '50000'); await pg.click('text=Apply for loan'); await pg.click('dialog button:has-text("Borrow")'); await pg.wait_for_timeout(200); print('loan:', await live())
        # save to slot 1 and reload it
        await pg.click('nav.rail a[href="#options"]'); await pg.click('text=Save to slot 1'); await pg.wait_for_timeout(800); print('save:', await live())
        await pg.screenshot(path=str(SHOTS) + '/f_options.png', full_page=True)
        await pg.reload(); await pg.wait_for_timeout(1200)
        print('saves listed:', await pg.locator('text=Slot 1: Test Works').count())
        await pg.locator('tr:has-text("Slot 1") button:has-text("Load")').click(); await pg.wait_for_timeout(600)
        print('loaded:', await pg.locator('h1').first.inner_text(), await pg.locator('#st-clock').inner_text())
        # phone width + dark
        await pg.set_viewport_size({'width': 400, 'height': 860}); await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=str(SHOTS) + '/f_phone_floor.png')
        sw = await pg.evaluate('document.documentElement.scrollWidth'); print('phone scrollWidth', sw)
        await pg.click('[data-key="menu"]'); await pg.wait_for_timeout(250)   # at this width the side menu is the Menu button
        await pg.click('dialog.menu-sheet [data-key="nav-staff"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS) + '/f_phone_staff.png')
        print('phone scrollWidth staff', await pg.evaluate('document.documentElement.scrollWidth'))
        await pg.set_viewport_size({'width': 1280, 'height': 900}); await pg.click('nav.rail a[href="#city"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS) + '/f_dark_city.png')
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS) + '/f_dark_floor.png')
        print('ERRORS', errs[:10])
        await b.close()
asyncio.run(main())
