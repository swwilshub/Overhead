import asyncio
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, SHOTS, launch_opts
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts(args=['--autoplay-policy=no-user-gesture-required']))
        pg = await b.new_page(viewport={'width': 1366, 'height': 950})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        # floor: cursor ticks on, paint a zone, lay a belt
        await pg.click('nav.rail a[href="#options"]'); await pg.check('#o-ticks'); await pg.check('#o-amb')
        await pg.click('nav.rail a[href="#floor"]'); await pg.wait_for_timeout(200)
        await pg.focus('#floor-app'); [await pg.keyboard.press('ArrowLeft') for _ in range(4)]
        await pg.select_option('[data-key="ft-zonesel"]', '3'); await pg.focus('#floor-app'); await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter')
        await pg.click('[data-key="ft-belt"]'); await pg.focus('#floor-app'); [await pg.keyboard.press('ArrowRight') for _ in range(6)]; await pg.keyboard.press('Enter'); await pg.keyboard.press('Escape')
        await pg.click('.status .run button:has-text("Play")'); await pg.wait_for_timeout(2500)
        amb = await pg.evaluate("() => window.__overhead.app.speed")
        await pg.click('.status .run button:has-text("Run until")'); await pg.click('dialog button:has-text("Start of next month")')
        for _ in range(80):
            await pg.wait_for_timeout(300)
            if await pg.locator('.status .run button[data-key="speed-0"][aria-pressed="true"]').count():
                t = await pg.locator('#st-clock').inner_text()
                if 'Feb' in t: break
                await pg.click('.status .run button:has-text("Run until")'); await pg.click('dialog button:has-text("Start of next month")')
        log = await pg.evaluate("() => window.__overhead.sfxLog.slice()")
        print('clock', (await pg.locator('#st-clock').inner_text()).replace('\n', ' '))
        print('sounds played:', sorted(set(log)))
        print('sequence tail:', log[-20:])
        # mute toggle
        await pg.click('[data-key="mute"]'); n = len(await pg.evaluate("() => window.__overhead.sfxLog.slice()"))
        await pg.click('.status .run button:has-text("Play")'); await pg.wait_for_timeout(300); await pg.click('.status .run button:has-text("Pause")')
        print('muted plays nothing:', n == len(await pg.evaluate("() => window.__overhead.sfxLog.slice()")), '| mute pressed:', await pg.get_attribute('[data-key="mute"]', 'aria-pressed'))
        await pg.click('nav.rail a[href="#options"]'); await pg.wait_for_timeout(200)
        await pg.click('text=Preview the sounds'); await pg.wait_for_timeout(100)
        await pg.locator('#main').screenshot(path=str(SHOTS) + '/sound_options.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())
