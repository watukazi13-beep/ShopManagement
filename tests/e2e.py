"""End-to-end test: drives the app in a headless browser (device-only mode) and checks the numbers.
Run:  python3 -m http.server 8765  (in the repo folder), then  python3 tests/e2e.py
"""
import json, sys, os
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('APP_URL', 'http://localhost:8765/')
OUT = os.environ.get('SHOTS', '/tmp/shots/')
os.makedirs(OUT, exist_ok=True)
W, H = (int(x) for x in os.environ.get('VIEW', '390x844').split('x'))
fails = []

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def data(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('shop-local-data-v1')||'{}')")

def item(pg, name):
    return next(i for i in data(pg).get('items', {}).values() if i['name'] == name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': W, 'height': H})
    ctx.add_init_script("window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;}; window.print=()=>{};")
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
    pg.on('dialog', lambda d: (errs.append('native dialog: ' + d.message), d.dismiss()))

    def go(h):
        pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(250)

    def dlg():
        return pg.locator('dialog[open]').last

    def submit(label):
        dlg().get_by_role('button', name=label, exact=True).click(); pg.wait_for_timeout(250)

    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('#g-local'); pg.wait_for_timeout(900)
    check(pg.locator('.hero-figure').inner_text().startswith('TSh 0'), 'home loads in device mode')
    check(pg.locator('.getting-started').count() == 1, 'getting-started guide shows on an empty shop')

    # --- Settings
    go('#/settings')
    pg.fill('#shop-form [name=shopName]', 'Duka la Mama')
    pg.fill('#shop-form [name=phone]', '0755 111 222')
    pg.click('#shop-form button.primary'); pg.wait_for_timeout(300)
    check(pg.locator('#shop-name').inner_text() == 'Duka la Mama', 'shop name saved and shown in header')

    # --- Supplier
    go('#/orders?tab=suppliers')
    pg.click('[data-act=new-sup]')
    dlg().locator('[name=name]').fill('Bakhresa Wholesale')
    dlg().locator('[name=phone]').fill('0712 345 678')
    submit('Save')
    check(pg.locator('[data-sup]').count() == 1, 'supplier added')

    # --- Items
    def add_item(name, price, cost, stock, mn='', unit='pcs', sup=None):
        go('#/stock')
        pg.locator('[data-act=new]').first.click()
        d = dlg()
        d.locator('[name=name]').fill(name); d.locator('[name=price]').fill(str(price))
        d.locator('[name=cost]').fill(str(cost)); d.locator('[name=stock]').fill(str(stock))
        d.locator('[name=unit]').fill(unit)
        if mn != '': d.locator('[name=minStock]').fill(str(mn))
        if sup: d.locator('[name=supplierId]').select_option(label=sup)
        submit('Add item')
    add_item('Sugar 1kg', 3000, 2500, 20, 5, 'kg', 'Bakhresa Wholesale')
    add_item('Cooking oil 1L', 6000, 5000, 3, 4, 'bottle')
    add_item('Bar soap', 1500, 1000, 50, 5)
    check(pg.locator('#stock-list tbody tr').count() == 3, 'three items listed in stock')
    # duplicate name blocked
    pg.locator('[data-act=new]').first.click()
    dlg().locator('[name=name]').fill('sugar 1kg'); dlg().locator('[name=price]').fill('1')
    submit('Add item')
    check(pg.locator('dialog[open]').count() == 1 and pg.locator('.toast-err').count() >= 1, 'duplicate item name is refused')
    submit('Cancel') if False else dlg().locator('[data-close]').click()
    pg.wait_for_timeout(200)
    check(pg.locator('[data-nav=stock]').get_attribute('data-badge') == '1', 'low-stock badge on Stock tab (cooking oil)')

    # --- Sell
    go('#/sell')
    tiles = pg.locator('.tile')
    check(tiles.count() == 3, 'sell screen shows 3 item tiles')
    for _ in range(3): pg.locator('.tile', has_text='Sugar 1kg').click()
    pg.locator('.tile', has_text='Cooking oil').click()
    if W < 900:
        check(pg.locator('#cart-bar').is_visible(), 'cart bar visible on phone')
        pg.click('#cart-bar'); pg.wait_for_timeout(200)
    check('15,000' in pg.locator('.cart-foot .total-row').inner_text(), 'cart total TSh 15,000')
    # change qty via stepper +/- : add one soap via search+enter
    pg.click('[data-charge]'); pg.wait_for_timeout(200)
    d = dlg()
    d.locator('label.chip', has_text='M-Pesa').click()
    d.locator('[name=discount]').fill('500')
    d.locator('[name=cash]').fill('20000')
    pg.wait_for_timeout(100)
    check('5,500' in d.locator('#co-change').inner_text(), 'change due shown (TSh 5,500)')
    submit('Complete sale')
    pg.wait_for_timeout(400)
    check('Sale complete' in dlg().locator('h2').inner_text(), 'receipt shown after sale')
    dlg().locator('[data-share]').click()
    opened = pg.evaluate('window.__opened')
    check(len(opened) == 1 and 'wa.me' in opened[0] and 'TOTAL' in __import__('urllib.parse').parse.unquote(opened[0]), 'receipt shares to WhatsApp')
    submit('Next sale')
    sales = list(data(pg).get('sales', {}).values())
    check(len(sales) == 1 and sales[0]['total'] == 14500 and sales[0]['cogs'] == 12500 and sales[0]['pay'] == 'M-Pesa', 'sale saved: total 14,500, COGS 12,500, M-Pesa')
    check(item(pg, 'Sugar 1kg')['stock'] == 17 and item(pg, 'Cooking oil 1L')['stock'] == 2, 'stock reduced by the sale (17 sugar, 2 oil)')

    # barcode/search + Enter adds single match
    pg.fill('#pos-search', 'soap'); pg.press('#pos-search', 'Enter'); pg.wait_for_timeout(200)
    check(pg.locator('.tile.in', has_text='Bar soap').count() == 1, 'search + Enter adds the matching item')
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.locator('[data-clear]').click(); pg.wait_for_timeout(150)
    if W < 900: pg.mouse.click(10, 10); pg.wait_for_timeout(150)

    # --- Receive stock (weighted average cost)
    go('#/orders?tab=received')
    pg.click('[data-act=receive]'); pg.wait_for_timeout(200)
    d = dlg()
    d.locator('[name=supplierId]').select_option(label='Bakhresa Wholesale')
    d.locator('[name=ref]').fill('INV-77')
    row = d.locator('.line-row').first
    row.locator('.li-name').fill('Sugar 1kg'); row.locator('.li-name').dispatch_event('change')
    row.locator('.li-qty').fill('10'); row.locator('.li-cost').fill('2800')
    d.locator('[name=paid]').uncheck()
    pg.wait_for_timeout(100)
    check('28,000' in d.locator('#pf-total').inner_text(), 'purchase total TSh 28,000')
    submit('Add to stock')
    s = item(pg, 'Sugar 1kg')
    check(s['stock'] == 27 and abs(s['cost'] - 2611.11) < 0.01 and s['lastCost'] == 2800, f"receive stock: 27 in stock, avg cost {s['cost']:.2f}")
    check('28,000' in pg.locator('.row-btns.spread').inner_text(), 'unpaid supplier balance shown')

    # --- Expense
    go('#/money?tab=expenses')
    pg.click('[data-act=add-exp]')
    d = dlg(); d.locator('[name=amount]').fill('1000'); d.locator('[data-c=Rent]').click()
    submit('Save')
    check(pg.locator('[data-exp]').count() == 1, 'expense recorded')

    # --- Adjust (damaged)
    go('#/stock')
    pg.locator('tr', has_text='Bar soap').click(); pg.wait_for_timeout(200)
    dlg().locator('[data-adjust]').click(); pg.wait_for_timeout(200)
    d = dlg(); d.locator('label.chip', has_text='Remove').click(); d.locator('[name=qty]').fill('2'); d.locator('[name=reason]').select_option('Damaged')
    submit('Save')
    check(item(pg, 'Bar soap')['stock'] == 48, 'damaged stock removed (48 soap)')

    # --- Profit report
    go('#/money?tab=report')
    pg.wait_for_timeout(300)
    txt = pg.locator('.statement').inner_text()
    for label, val in [('Sales', '14,500'), ('Cost of goods sold', '12,500'), ('Gross profit', '2,000'), ('Total expenses', '1,000'), ('Stock losses', '2,000'), ('Net profit', '−TSh 1,000')]:
        check(val in txt, f'report shows {label} {val}')
    pg.screenshot(path=OUT + 'report.png', full_page=True)
    pg.click('[data-act=trend]'); pg.wait_for_timeout(400)
    check(pg.locator('#trend svg.chart').count() == 1, '6-month chart renders')

    # --- RFQ
    go('#/orders?tab=rfq')
    pg.click('[data-act=gen]'); pg.wait_for_timeout(500)
    rfqs = list(data(pg).get('rfqs', {}).values())
    print('   rfqs:', [(r['supplierName'], [(l['name'], l['qty']) for l in r['lines']], r.get('auto')) for r in rfqs])
    check(len(rfqs) == 1 and rfqs[0]['lines'][0]['name'] == 'Cooking oil 1L' and rfqs[0]['lines'][0]['qty'] == 6, 'RFQ drafted for cooking oil, qty 6 (fill up to 8)')
    if pg.locator('dialog[open]').count() == 0: pg.locator('[data-rfq]').first.click(); pg.wait_for_timeout(200)
    d = dlg()
    d.locator('.line-row .li-qty').first.fill('12')
    d.locator('[data-print]').click(); pg.wait_for_timeout(400)
    check(list(data(pg)['rfqs'].values())[0]['lines'][0]['qty'] == 12, 'RFQ quantity edited and saved')
    d.locator('[data-wa]').click(); pg.wait_for_timeout(200)
    check('REQUEST%20FOR%20QUOTATION' in pg.evaluate('window.__opened')[-1], 'RFQ sent via WhatsApp text')
    check(list(data(pg)['rfqs'].values())[0]['status'] == 'sent', 'RFQ marked as sent')
    d.locator('[data-receive]').click(); pg.wait_for_timeout(300)
    d = dlg()
    check(d.locator('.li-name').first.input_value() == 'Cooking oil 1L', 'goods-arrived opens receive form pre-filled from RFQ')
    d.locator('.li-cost').first.fill('5200')
    submit('Add to stock')
    check(item(pg, 'Cooking oil 1L')['stock'] == 14 and list(data(pg)['rfqs'].values())[0]['status'] == 'closed', 'RFQ goods received: oil 14, RFQ closed')
    check(pg.locator('[data-nav=stock]').get_attribute('data-badge') in ('', None), 'low-stock badge cleared')

    # --- Monthly auto RFQ runs once
    pg.evaluate("""(()=>{const d=JSON.parse(localStorage.getItem('shop-local-data-v1'));
       const i=Object.values(d.items).find(x=>x.name==='Bar soap'); i.stock=1;
       d.meta.settings.lastAutoRfq='2000-01'; localStorage.setItem('shop-local-data-v1',JSON.stringify(d));})()""")
    pg.reload(); pg.wait_for_timeout(2500)
    auto = [r for r in data(pg)['rfqs'].values() if r.get('auto')]
    check(len(auto) == 1 and auto[0]['lines'][0]['name'] == 'Bar soap', 'monthly RFQ created automatically for low items')
    pg.reload(); pg.wait_for_timeout(2500)
    check(len([r for r in data(pg)['rfqs'].values() if r.get('auto')]) == 1, 'monthly RFQ not duplicated on next open')

    # --- Void sale returns stock
    go('#/money?tab=sales')
    pg.locator('[data-sale]').first.click(); pg.wait_for_timeout(200)
    dlg().locator('[data-void]').click(); pg.wait_for_timeout(250)
    submit('Cancel sale'); pg.wait_for_timeout(300)
    check(item(pg, 'Sugar 1kg')['stock'] == 30, 'cancelled sale puts stock back (30 sugar)')
    go('#/money?tab=report'); pg.wait_for_timeout(300)
    check('TSh 0' in pg.locator('.statement .line').first.inner_text(), 'cancelled sale removed from report')

    # --- Import from Loyverse CSV
    csv = ('Handle,SKU,Name,Category,Sold by weight,Option 1 name,Option 1 value,Default price,Cost,Barcode,In stock [Main],Low stock [Main],Primary supplier\n'
           'rice,10001,Rice,Grains,N,,,2800,2200,600100,40,10,Mohamed Enterprises\n'
           'tshirt,10002,T-shirt,Clothes,N,Size,M,15000,9000,,5,2,\n'
           'tshirt,10003,,Clothes,N,Size,L,15000,9000,,4,2,\n'
           'sugar-1kg,,Sugar 1kg,Groceries,N,,,3200,2500,,,5,\n')
    go('#/stock'); pg.click('[data-act=import]'); pg.wait_for_timeout(200)
    dlg().locator('input[type=file]').set_input_files(files=[{'name': 'export_items.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}])
    pg.wait_for_timeout(300)
    check('4' in dlg().locator('#imp-preview').inner_text(), 'import preview finds 4 rows')
    submit('Import'); pg.wait_for_timeout(300)
    names = sorted(i['name'] for i in data(pg)['items'].values())
    check('T-shirt M' in names and 'T-shirt L' in names and 'Rice' in names, 'Loyverse variants imported as separate items')
    check(item(pg, 'Sugar 1kg')['price'] == 3200 and item(pg, 'Sugar 1kg')['stock'] == 30, 'existing item updated, stock kept when blank')
    check(any(s['name'] == 'Mohamed Enterprises' for s in data(pg)['suppliers'].values()), 'supplier created from import')
    check(item(pg, 'Rice')['barcode'] == '600100', 'barcode imported')
    go('#/sell'); pg.fill('#pos-search', '600100'); pg.press('#pos-search', 'Enter'); pg.wait_for_timeout(200)
    check(pg.locator('.tile.in', has_text='Rice').count() == 1, 'scanning a barcode adds the item')

    # --- Screens on this size
    for h in ['#/home', '#/sell', '#/stock', '#/orders', '#/money', '#/settings']:
        go(h); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}{W}-{h[2:]}.png", full_page=True)

    # --- Offline: app must open with no network
    go('#/home'); pg.wait_for_timeout(1500)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(1500)
    check(pg.locator('.hero-figure').count() == 1, 'app opens offline from the cache')
    go('#/sell'); pg.locator('.tile', has_text='Bar soap').click()
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.click('[data-charge]'); pg.wait_for_timeout(200); submit('Complete sale'); pg.wait_for_timeout(300)
    check(item(pg, 'Bar soap')['stock'] == 0, 'a sale works offline')
    ctx.set_offline(False)

    if os.environ.get('DUMP'): open(os.environ['DUMP'], 'w').write(json.dumps(data(pg)))
    print('\nConsole errors:', '\n'.join(errs) if errs else 'none')
    if errs: fails.append('console errors')
    b.close()

print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
