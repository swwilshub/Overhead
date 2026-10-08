# Catalog: tabs ordered by model tier, machine preview with callouts and leader lines, equipment and office previews, axe, phone width.
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
        b = await p.chromium.launch(**launch_opts()); pg = await b.new_page(viewport={'width': 1440, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text and 'fonts' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(600)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(300)
        # expected tab order: lines by model tier (cheapest first within a tier), then Equipment and Offices
        lines = await pg.evaluate("() => window.__overhead.FAMILIES.map(f => ({ id: f.id, tab: f.tab, tier: f.tier, price: f.price, inputs: f.inputs }))")
        order = sorted(lines, key=lambda f: (f['tier'], f['price']))
        expect = [f['tab'] for f in order] + ['Equipment', 'Offices']
        # open the catalog on the first line with two or more inputs
        start = next(i for i, f in enumerate(order) if f['inputs'] >= 2)
        await pg.evaluate(f"() => {{ window.__overhead.app.viewState.catalog = {{ cat: 'f{order[start]['id']}', product: {{}} }}; }}")
        await pg.evaluate("() => { const b = [...document.querySelectorAll('nav button, nav a')].find(x => /Catalog/.test(x.textContent)); b && b.click(); }"); await pg.wait_for_timeout(500)
        tabs = await pg.eval_on_selector_all('[role=tab]', 'els => els.map(e => e.textContent)')
        ok(tabs == expect, f'{len(expect)} tabs ordered by model tier: {tabs}')
        allc = await pg.eval_on_selector_all('.cat-callouts li', 'els => els.map(e => e.textContent)')
        ins = [t for t in allc if t.lstrip('0123456789').startswith('Input')]; outs = [t for t in allc if t not in ins]
        ok(len(ins) == order[start]['inputs'] and all(t.lstrip('0123456789').startswith('Input') for t in ins), f'{order[start]["tab"]} preview inputs: {ins}')
        ok(any('Output' in t for t in outs) and any("Operator's post" in t for t in outs) and any('Service hatch' in t for t in outs), f'other callouts: {outs}')
        lns = await pg.eval_on_selector_all('.cat-lines polyline', 'els => els.length')
        ok(lns == len(allc), f'{lns} leader lines for {len(allc)} callouts')
        await pg.locator('#cat-panel').screenshot(path=SHOT + 'cat_first.png')
        # product picker updates the callouts
        opts = await pg.eval_on_selector_all('#cat-product option', 'els => els.map(e => e.value)')
        await pg.select_option('#cat-product', opts[-1]); await pg.wait_for_timeout(300)
        ins2 = await pg.eval_on_selector_all('.cat-callouts li', 'els => els.map(e => e.textContent).filter(t => /^\\d?Input/.test(t))')
        ok(ins2 != ins or len(opts) == 1, f'changing product updates inputs: {ins2}')
        # keyboard: arrow through the tabs to the next four-input line
        four = next(i for i, f in enumerate(order) if f['inputs'] == 4 and i > start)
        await pg.focus('[role=tab][aria-selected=true]')
        for _ in range(four - start): await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(120)
        sel = await pg.eval_on_selector('[role=tab][aria-selected=true]', 'e => e.textContent')
        ok(sel == order[four]['tab'], f'arrow keys move between tabs (now {sel})')
        n4 = await pg.eval_on_selector_all('.cat-callouts li', 'els => els.filter(e => /^\\d?Input/.test(e.textContent)).length')
        ok(n4 == 4, f'{sel} machine has 4 inputs ({n4})')
        await pg.locator('#cat-panel').screenshot(path=SHOT + 'cat_four.png')
        await pg.add_script_tag(content=AXE)
        res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length)")
        ok(not res, f'axe on machine tab: {res}')
        for tab in ['Equipment', 'Offices']:
            await pg.click(f'[role=tab]:text-is("{tab}")'); await pg.wait_for_timeout(300)
            n = await pg.eval_on_selector_all('.cat-sprite', 'els => els.length')
            ok(n >= 4, f'{tab} tab has {n} sprite previews')
            await pg.locator('#cat-panel').screenshot(path=SHOT + f'cat_{tab.lower()}.png')
            res = await pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length)")
            ok(not res, f'axe on {tab}: {res}')
        # place from the catalog uses the shown product
        await pg.click(f'[role=tab]:text-is("{expect[0]}")'); await pg.wait_for_timeout(300)
        btn = await pg.locator('#cat-panel button.primary').first.text_content()
        ok('making' in btn, 'place button names the product: ' + btn)
        # phone width
        await pg.set_viewport_size({'width': 390, 'height': 900}); await pg.wait_for_timeout(400)
        sw = await pg.evaluate("() => document.documentElement.scrollWidth")
        ok(sw <= 390, f'no horizontal scroll at phone width ({sw})')
        await pg.locator('#cat-panel').screenshot(path=SHOT + 'cat_phone.png')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all catalog checks pass')
asyncio.run(main())
