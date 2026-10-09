import asyncio, sys, re
import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from env import URL, AXE, launch_opts
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
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_opts())
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1000)
        await pg.click('text=Quick start'); await pg.wait_for_timeout(800)
        O = "window.__overhead"
        # Quick start: no "building is bare" memo, a true memo, and a machine that already shows its operator
        memos = await pg.evaluate(f"() => {O}.app.st.memos.map(m => [m.subject || '', m.body || ''])")
        ok(not any('Getting started' in s or 'The building is bare' in bd for s, bd in memos), 'Quick start sends no "Getting started" memo')
        qs = next((bd for s, bd in memos if s.startswith('Quick start')), '')
        ok(qs.endswith('Then add a second machine that uses what this one makes.'), f'the Quick start memo ends with the second-machine tip: ...{qs[-80:]!r}')
        m0 = await pg.evaluate(f"() => {{ const o = {O}.app.st.floor.objects.find(o => o.kind === 'machine'); return {{ id: o.id, x: Math.round(o.x), y: Math.round(o.y), status: o.status, op: o.operator }}; }}")
        ok(m0['op'] is not None and m0['status'] == 'Plant closed', f'before Play the machine shows its operator and "Plant closed": {m0}')
        # the checklist: materials are on order, so the step is done
        cl = await pg.locator('#inspector').inner_text()
        ok(re.search(r'✓\s*Order materials', cl) is not None, 'checklist ticks "Order materials" while materials are on order')
        # take the materials away and run the clock until the machine is out of them
        await pg.evaluate(f"() => {{ const st = {O}.app.st; st.orders.length = 0; st.inventory = {{}}; for (const o of st.floor.objects) if (o.inBuf) o.inBuf = {{}}; {O}.app.speed = 3; }}")
        found = False
        for _ in range(40):
            await pg.wait_for_timeout(500)
            txt = await pg.locator('#needs-wrap').inner_text()
            if 'out of' in txt: found = True; break
        await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}"); await pg.wait_for_timeout(300)
        ok(found, 'Needs attention lists the machine without leaving the floor')
        items = await pg.locator('#needs-wrap li').all_inner_texts()
        stalled = [t for t in items if 'out of' in t]
        ok(len(stalled) == 1 and re.match(r'.+ machine #\d+: out of .+\.', stalled[0]) is not None and 'Show me' in stalled[0], f'the entry gives label, reason and a Show me button: {stalled}')
        alert = (await pg.locator('#st-alert').inner_text()).strip()
        ok(alert == f'{len(items)} issue' + ('s' if len(items) > 1 else ''), f'the status bar counts it: "{alert}" for {len(items)} entries')
        cl = await pg.locator('#inspector').inner_text()
        ok(re.search(r'✓\s*Order materials', cl) is None and 'Order materials' in cl, 'checklist unticks "Order materials" while the machine is out of materials')
        # the cursor reads the state
        await pg.evaluate(f"() => {{ const v = {O}.app.viewState.floor; v.sel = null; v.cx = {m0['x']} - 1; v.cy = {m0['y']} + 1; }}")
        await pg.focus('#floor-app'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(1500)   # the card follows the cursor on the next refresh
        card = await pg.locator('#inspector').inner_text()
        ok(re.search(r'out of materials: \w', card) is not None, f'the Cursor card reads the state: {" ".join(card.split())[-120:]}')
        say = await pg.locator('#live-polite').inner_text()
        ok('out of materials' in say, f'and so does the announcement: {say!r}')
        # the inspector shows one status, never a second "Stopped:"
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        panel = await pg.locator('#inspector').inner_text()
        # one status pill; if the machine is doing something else (an operator away, say) the lack reads "Also: out of ..."
        ok('Stopped:' not in panel and ('Out of materials' in panel or 'Also: out of' in panel), f'the machine panel has one status and no "Stopped:": {" ".join(panel.split())[:130]}')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # the list follows changes within a second while the clock runs, and focus stays on the grid
        await pg.evaluate(f"() => {{ {O}.app.speed = 1; }}")
        before = await pg.locator('#needs-wrap li').count()
        await pg.evaluate(f"() => {{ const st = {O}.app.st, f = st.floor, o = f.objects.find(o => o.kind === 'machine'); const ports = {O}.ZONE; for (let i = 0; i < f.zones.length; i++) if (f.zones[i] === ports.SAFETY) f.zones[i] = ports.NONE; }}")
        await pg.focus('#floor-app'); await pg.wait_for_timeout(1600)
        after = await pg.locator('#needs-wrap li').count()
        txt = await pg.locator('#needs-wrap').inner_text()
        ok(after > before and 'safety zone' in txt, f'an unsafe input appears in the list within two seconds ({before} -> {after})')
        ok(await pg.evaluate("() => document.activeElement?.id") == 'floor-app', 'focus stayed on the floor grid')
        await axe_check(pg, 'floor with Needs attention')
        # a refresh never takes focus from a button inside the list
        await pg.focus('#needs-wrap button'); await pg.wait_for_timeout(1500)
        ok(await pg.evaluate("() => !!document.activeElement.closest('#needs-wrap')"), 'focus on a Show me button survives a refresh')
        await pg.evaluate(f"() => {{ {O}.app.speed = 0; }}")
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    print(f'{fails} FAILED' if fails else 'all stalled machine UI checks pass')
    sys.exit(1 if fails else 0)
asyncio.run(main())
