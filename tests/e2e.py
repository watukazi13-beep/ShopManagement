"""End-to-end test: drives the app in a headless browser (device-only mode) and checks the numbers.
Run:  python3 -m http.server 8765  (in the repo folder), then  python3 tests/e2e.py
"""
import json, sys, os
# Let the test intercept requests made by the offline service worker too.
os.environ.setdefault('PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS', '1')
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
    # Tests never touch the real Firebase project: serve a blank config.
    ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, body="export const firebaseConfig = { apiKey: '' };", headers={'content-type': 'text/javascript'}))
    # The web font comes from Google; tests run without internet, so serve an empty stylesheet.
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', headers={'content-type': 'text/css'}))
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
    credit = 'Developed by Greenlight Developers · Author: Michael Kepha'
    check(pg.locator('.gate-card .credit p').inner_text() == credit and pg.locator('.gate-card .credit img').count() == 1, 'developer logo and credit on the start screen')
    pg.click('#g-local'); pg.wait_for_timeout(900)
    check(pg.locator('.hero-figure').inner_text().startswith('TSh 0'), 'home loads in device mode')
    check(pg.locator('.getting-started').count() == 1, 'Home offers the shop setup')
    import base64
    PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNk+M+AFTCNSmAAAKMvAQ9XWIhtAAAAAElFTkSuQmCC')
    pg.click('[data-act=setup]'); pg.wait_for_timeout(250)
    check('1 of' in dlg().locator('h2').inner_text(), 'setup guide opens at step 1')
    dlg().locator('[name=shopName]').fill('Greenlight Test Shop'); dlg().locator('[name=phone]').fill('0700 000 000')
    dlg().locator('#logo-file').set_input_files(files=[{'name': 'logo.png', 'mimeType': 'image/png', 'buffer': PNG}]); pg.wait_for_timeout(400)
    submit('Save and continue')
    dlg().locator('#pay-new').fill('Lipa Namba'); dlg().locator('#pay-add').click()
    submit('Save and continue'); submit('Save and continue'); submit('Save and continue'); submit('Save and continue')
    check('Your items' in dlg().inner_text(), 'setup reaches the last step (people skipped on a single device)')
    submit('Finish'); pg.wait_for_timeout(300)
    st = data(pg)['meta']['settings']
    check(st.get('shopName') == 'Greenlight Test Shop' and st.get('setupDone') is True and str(st.get('logo', '')).startswith('data:image'), 'setup saved the shop details and logo')
    check('Lipa Namba' in st.get('payMethods', []), 'a new payment method was added in setup')
    check(pg.locator('.getting-started').count() == 0, 'setup card goes away when done')
    check(pg.locator('.install-card').count() == 1, 'Home offers to install the app')
    pg.click('.install-card [data-act=install]'); pg.wait_for_timeout(200)
    check('Install the app' in dlg().inner_text() and 'Add to Home screen' in dlg().inner_text(), 'Install explains how on this device when the browser cannot prompt')
    dlg().get_by_role('button', name='OK').click(); pg.wait_for_timeout(150)
    pg.click('.install-card [data-act=install-later]'); pg.wait_for_timeout(200)
    check(pg.locator('.install-card').count() == 0, 'the install banner can be dismissed')

    # --- Settings
    go('#/settings')
    pg.fill('#shop-form [name=shopName]', 'Duka la Mama')
    pg.fill('#shop-form [name=phone]', '0755 111 222')
    pg.click('#shop-form button.primary'); pg.wait_for_timeout(300)
    check(pg.locator('#shop-name').inner_text() == 'Duka la Mama', 'shop name saved and shown in header')
    about = pg.locator('.about').inner_text()
    check('Greenlight Developers' in about and 'Michael Kepha' in about and pg.locator('.about-dev img').count() == 1, 'developer shown in Settings → About')
    check(pg.locator('.nav-credit').is_visible() == (W >= 900), 'credit in the side menu on computers only')

    # --- Light / dark theme
    bg = lambda: pg.evaluate("getComputedStyle(document.body).backgroundColor")
    check(bg() == 'rgb(239, 241, 236)', 'light theme by default (device is light)')
    pg.click('[data-theme-pick=dark]'); pg.wait_for_timeout(150)
    check(pg.evaluate("document.documentElement.dataset.theme") == 'dark' and bg() == 'rgb(11, 18, 14)', 'choosing Dark turns the app dark')
    pg.screenshot(path=OUT + 'dark-settings.png')
    pg.reload(); pg.wait_for_timeout(800)
    check(bg() == 'rgb(11, 18, 14)' and pg.locator('[data-theme-pick=dark].on').count() == 1, 'Dark is remembered after reopening')
    go('#/home'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + 'dark-home.png', full_page=True)
    pg.click('#theme-btn'); pg.wait_for_timeout(150)
    check(bg() == 'rgb(239, 241, 236)', 'the top-bar button switches back to light')
    go('#/settings'); pg.click('[data-theme-pick=auto]'); pg.wait_for_timeout(150)
    check(pg.evaluate("document.documentElement.dataset.theme") is None and pg.evaluate("localStorage.getItem('theme')") is None, 'Automatic follows the device again')
    pg.emulate_media(color_scheme='dark'); pg.wait_for_timeout(150)
    check(bg() == 'rgb(11, 18, 14)', 'Automatic turns dark when the device is dark')
    pg.click('[data-theme-pick=light]'); pg.wait_for_timeout(150)
    check(bg() == 'rgb(239, 241, 236)', 'Light stays light even when the device is dark')
    pg.click('[data-theme-pick=auto]'); pg.emulate_media(color_scheme='light'); pg.wait_for_timeout(150)

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
    doc = pg.locator('#print-root .doc')
    check(doc.is_visible() and 'Request for quotation' in doc.inner_text() and 'Cooking oil 1L' in doc.inner_text(), 'RFQ document preview opens with the items')
    pg.emulate_media(media='print')
    check(doc.is_visible() and not pg.locator('.topbar').is_visible() and not pg.locator('#print-root .doc-bar').is_visible(), 'printing / Save as PDF shows only the document')
    pdf = pg.pdf() if True else b''
    check(len(pdf) > 3000, f'Save as PDF produces a PDF file ({len(pdf)} bytes)')
    pg.emulate_media(media='screen')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(200)
    check(pg.locator('#print-root').count() == 0 and dlg().locator('[data-wa]').count() == 1, 'Back returns to the request')
    d.locator('[data-wa]').click(); pg.wait_for_timeout(200)
    check('REQUEST%20FOR%20QUOTATION' in pg.evaluate('window.__opened')[-1], 'RFQ sent via WhatsApp text')
    check(list(data(pg)['rfqs'].values())[0]['status'] == 'sent', 'RFQ marked as sent')
    d.locator('[data-make-po]').click(); pg.wait_for_timeout(400)
    d = dlg()
    check(d.locator('.li-name').first.input_value() == 'Cooking oil 1L' and d.locator('.li-qty').first.input_value() == '12', 'Make purchase order fills the PO from the RFQ')
    d.locator('.li-cost').first.fill('5200')
    d.locator('[data-order]').click(); pg.wait_for_timeout(300)
    oil_po = next(p for p in data(pg)['pos'].values() if p.get('rfqId'))
    check(list(data(pg)['rfqs'].values())[0]['status'] == 'ordered' and oil_po['status'] == 'ordered' and oil_po['lines'][0]['cost'] == 5200, 'RFQ turned into an ordered PO at the quoted price')
    go('#/stock'); pg.click('[data-f=incoming]'); pg.wait_for_timeout(200)
    pg.locator('[data-recv]').first.click(); pg.wait_for_timeout(250)
    submit('Receive into stock'); pg.wait_for_timeout(300)
    check(item(pg, 'Cooking oil 1L')['stock'] == 14, 'PO goods received: oil 14')
    pg.click('[data-f=all]')
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

    # --- Loyverse services (Track stock = N) and variable-price items (blank price)
    csv2 = ('Handle,SKU,Name,Category,Track stock,Default price,Cost,In stock [Main],Low stock [Main],Optimal stock [Main]\n'
            'photocopy,10050,Photocopy,Offline Serives,N,100,0,,,\n'
            'online-app,10051,online Application,Goods,N,,0,,,\n'
            'chalk,10024,Chalk,Goods,Y,25,10,162,50,300\n')
    pg.evaluate("sessionStorage.removeItem('cart')"); go('#/home'); go('#/stock'); pg.click('[data-act=import]'); pg.wait_for_timeout(200)
    dlg().locator('input[type=file]').set_input_files(files=[{'name': 'export_items.csv', 'mimeType': 'text/csv', 'buffer': csv2.encode()}])
    pg.wait_for_timeout(300); submit('Import'); pg.wait_for_timeout(300)
    check(item(pg, 'Photocopy')['service'] is True and item(pg, 'Photocopy')['stock'] == 0, 'Track stock = N imported as a service')
    check(item(pg, 'online Application')['variablePrice'] is True, 'blank price imported as variable price')
    ch = item(pg, 'Chalk')
    check(ch['minStock'] == 50 and ch['maxStock'] == 300 and ch['sku'] == '10024' and ch['service'] is False, 'low stock and optimal stock levels imported')
    check(pg.locator('#stock-list tr', has_text='online Application').locator('text=Variable').count() == 1, 'variable price shown in the stock list')
    go('#/sell')
    if pg.locator('[data-clear]').count(): pg.locator('[data-clear]').first.dispatch_event('click'); pg.wait_for_timeout(150)
    check('Enter price' in pg.locator('.tile', has_text='online Application').inner_text(), 'variable-price tile says Enter price')
    pg.locator('.tile', has_text='online Application').click(); pg.wait_for_timeout(200)
    check(dlg().locator('[name=price]').count() == 1, 'variable-price item asks for the price')
    dlg().locator('[name=price]').fill('5000'); submit('Add to sale')
    pg.locator('.tile', has_text='Photocopy').click(); pg.locator('.tile', has_text='Photocopy').click(); pg.wait_for_timeout(150)
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.click('[data-charge]'); pg.wait_for_timeout(200); submit('Complete sale'); pg.wait_for_timeout(300)
    last = max(data(pg)['sales'].values(), key=lambda x: x['ts'])
    check(last['total'] == 5200, f"sale with typed price 5,000 + 2 photocopies = 5,200 (got {last['total']})")
    check(item(pg, 'Photocopy')['stock'] == 0, 'service stock not reduced by a sale')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # --- Minimum / maximum stock levels
    go('#/stock'); pg.click('[data-act=levels]'); pg.wait_for_timeout(250)
    row = dlg().locator('tr', has_text='Chalk')
    row.locator('.lv-min').fill('200'); row.locator('.lv-max').fill('150')
    submit('Save levels')
    check(dlg().count() == 1 and item(pg, 'Chalk')['maxStock'] == 300, 'maximum below minimum is refused')
    row.locator('.lv-max').fill('400')
    dlg().locator('[data-fill]').click() if dlg().locator('[data-fill]').count() else None
    submit('Save levels'); pg.wait_for_timeout(300)
    ch = item(pg, 'Chalk')
    check(ch['minStock'] == 200 and ch['maxStock'] == 400, 'min / max saved from the levels table')
    check(all(i['maxStock'] > 0 for i in data(pg)['items'].values() if not i.get('service') and i.get('active', True) and i.get('minStock', 0) > 0), 'suggested maximums filled for items with a minimum')
    check(pg.locator('#stock-list tr', has_text='Chalk').inner_text().count('400') >= 1, 'maximum shown in the stock list')
    go('#/orders?tab=rfq'); pg.click('[data-act=gen]'); pg.wait_for_timeout(400)
    rf = [r for r in data(pg)['rfqs'].values() if any(l['name'] == 'Chalk' for l in r['lines'])]
    chalk_line = next(l for l in rf[-1]['lines'] if l['name'] == 'Chalk') if rf else {}
    check(chalk_line.get('qty') == 238, f"order fills Chalk up to its maximum: 400 − 162 = 238 (got {chalk_line.get('qty')})")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # --- Purchase orders: order → on order in Stock → receive part → receive the rest
    def pos_(): return list(data(pg).get('pos', {}).values())
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    go('#/orders?tab=pos'); pg.click('[data-act=po-low]'); pg.wait_for_timeout(400)
    chalk_po = next((p for p in pos_() if any(l['name'] == 'Chalk' for l in p['lines'])), None)
    check(chalk_po is not None and chalk_po['status'] == 'draft', 'Fill from low stock drafts a purchase order')
    cl = next(l for l in chalk_po['lines'] if l['name'] == 'Chalk')
    check(cl['qty'] == 238 and cl['cost'] == 10, f"PO line fills Chalk to its maximum at the last cost (got {cl['qty']} @ {cl['cost']})")
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pg.locator('[data-po]', has_text=chalk_po['no']).click(); pg.wait_for_timeout(250)
    dlg().locator('[data-print]').click(); pg.wait_for_timeout(300)
    check(len(pos_()) == len([p for p in pos_()]) and sum(1 for p in pos_() if p['no'] == chalk_po['no']) == 1, 'printing a PO does not duplicate it')
    check('Purchase order' in pg.locator('#print-root .doc').inner_text() and 'Chalk' in pg.locator('#print-root .doc').inner_text(), 'PO document preview shows the order')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(200)
    dlg().locator('[data-order]').click(); pg.wait_for_timeout(300)
    chalk_po = next(p for p in pos_() if p['no'] == chalk_po['no'])
    check(chalk_po['status'] == 'ordered', 'PO marked as ordered')
    go('#/stock'); row = pg.locator('#stock-list tr', has_text='Chalk').inner_text()
    check('On order' in row and '+238 on order' in row, 'Stock shows Chalk as On order (+238)')
    go('#/orders?tab=pos')
    if pg.locator('[data-act=po-low]').is_enabled(): pg.click('[data-act=po-low]'); pg.wait_for_timeout(300)
    check(not any(any(l['name'] == 'Chalk' for l in p['lines']) for p in pos_() if p['status'] == 'draft'), 'Chalk is not ordered twice')
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # receive part
    go('#/stock'); pg.click('[data-f=incoming]'); pg.wait_for_timeout(200)
    check(pg.locator('[data-incoming]').count() >= 1, 'Incoming tab lists the ordered PO')
    pg.locator('[data-incoming]', has_text=chalk_po['no']).locator('[data-recv]').click(); pg.wait_for_timeout(250)
    r = dlg().locator('tr[data-item]', has_text='Chalk')
    check(r.locator('.rv-qty').input_value() == '238', 'receive form is filled with the quantity to come')
    r.locator('.rv-qty').fill('200'); r.locator('.rv-cost').fill('12')
    check(dlg().locator('#rv-short-wrap').is_visible(), 'short delivery offers to close the order')
    submit('Receive into stock'); pg.wait_for_timeout(400)
    ch = item(pg, 'Chalk'); chalk_po = next(p for p in pos_() if p['no'] == chalk_po['no'])
    check(ch['stock'] == 362, f"stock goes up automatically: 162 + 200 = 362 (got {ch['stock']})")
    check(abs(ch['cost'] - (162 * 10 + 200 * 12) / 362) < 0.01, f"average cost updated to {ch['cost']:.2f}")
    check(chalk_po['status'] == 'partial', 'PO is partly received')
    pg.click('[data-f=all]'); pg.wait_for_timeout(200); row = pg.locator('#stock-list tr', has_text='Chalk').inner_text()
    check('+38 on order' in row, 'the 38 still to come stay on order')
    # receive the rest
    pg.click('[data-f=incoming]'); pg.wait_for_timeout(200)
    pg.locator('[data-incoming]', has_text=chalk_po['no']).locator('[data-recv]').click(); pg.wait_for_timeout(250)
    submit('Receive into stock'); pg.wait_for_timeout(400)
    chalk_po = next(p for p in pos_() if p['no'] == chalk_po['no'])
    check(item(pg, 'Chalk')['stock'] == 400 and chalk_po['status'] == 'received', 'second delivery completes the PO: Chalk 400')
    rec = [p for p in data(pg)['purchases'].values() if p.get('poNo') == chalk_po['no']]
    check(len(rec) == 2, 'each delivery is saved against the PO')
    # a new PO by hand, then cancel it
    go('#/orders?tab=pos'); pg.click('[data-act=new-po]'); pg.wait_for_timeout(250)
    first = dlg().locator('.line-row').first
    first.locator('.li-name').fill('Rice'); first.locator('.li-name').dispatch_event('change'); first.locator('.li-qty').fill('10'); first.locator('.li-cost').fill('2000')
    n0 = len(pos_()); submit('Save draft'); pg.wait_for_timeout(300)
    rice_po = next(p for p in pos_() if any(l['name'] == 'Rice' for l in p['lines']))
    check(len(pos_()) == n0 + 1 and rice_po['total'] == 20000, 'new PO saved with total TSh 20,000')
    pg.locator('[data-po]', has_text=rice_po['no']).click(); pg.wait_for_timeout(250); dlg().locator('[data-order]').click(); pg.wait_for_timeout(300)
    go('#/stock'); check('on order' in pg.locator('#stock-list tr', has=pg.locator('b:text-is("Rice")')).inner_text().lower(), 'ordered rice shows as on order in Stock')
    go('#/orders?tab=pos')
    pg.locator('[data-po]', has_text=rice_po['no']).click(); pg.wait_for_timeout(250); dlg().locator('[data-del]').click(); pg.wait_for_timeout(250)
    dlg().get_by_role('button', name='Delete order', exact=True).click(); pg.wait_for_timeout(300)
    check(not any(p['no'] == rice_po['no'] for p in pos_()), 'an ordered PO that has not arrived can be deleted')
    go('#/stock'); check('on order' not in pg.locator('#stock-list tr', has=pg.locator('b:text-is("Rice")')).inner_text().lower(), 'deleted order no longer shows as on order in Stock')
    go('#/orders?tab=pos')
    # quotation request → purchase order
    go('#/orders?tab=rfq')
    open_rfq = next(({**r, 'id': k} for k, r in data(pg)['rfqs'].items() if r['status'] in ('draft', 'sent')), None)
    if open_rfq:
        pg.locator('[data-rfq]', has_text=open_rfq['no']).first.click(); pg.wait_for_timeout(250)
        dlg().locator('[data-make-po]').click(); pg.wait_for_timeout(500)
        made = [p for p in pos_() if p.get('rfqId') == open_rfq['id']]
        check(len(made) == 1 and data(pg)['rfqs'][open_rfq['id']]['status'] == 'ordered', 'a quotation request becomes a purchase order')
        if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    go('#/home')
    check(pg.locator('text=Expected deliveries').count() == (1 if any(p['status'] in ('ordered', 'partial') for p in pos_()) else 0), 'Home shows expected deliveries when orders are open')

    # --- Customers, credit, % discount, VAT, refunds and sales reports
    go('#/settings')
    pg.fill('#shop-form [name=taxRate]', '18'); pg.fill('#shop-form [name=receiptFooter]', 'Asante sana!')
    pg.click('#shop-form button.primary'); pg.wait_for_timeout(300)
    def sell(names, pay='Cash', discount='', customer=''):
        go('#/sell')
        if pg.locator('[data-clear]').count(): pg.locator('[data-clear]').first.dispatch_event('click'); pg.wait_for_timeout(100)
        for n in names: pg.locator('.tile', has_text=n).first.click()
        if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
        pg.click('[data-charge]'); pg.wait_for_timeout(200)
        d = dlg()
        d.locator(f'label.chip:has-text("{pay}")').click()
        if discount: d.locator('[name=discount]').fill(discount)
        if customer: d.locator('[name=customer]').fill(customer)
        d.locator('[name=cash]').dispatch_event('input'); pg.wait_for_timeout(100)
        return d
    sugar0 = item(pg, 'Sugar 1kg')['stock']
    d = sell(['Sugar 1kg', 'Sugar 1kg'], 'Credit')
    check('needs a customer' in d.locator('#co-cust').inner_text(), 'credit sale asks for a customer')
    submit('Complete sale')
    check(dlg().count() == 1 and pg.locator('.toast-err').count() >= 1, 'credit sale without a customer is refused')
    d.locator('[name=customer]').fill('Mama Asha — 0712000111'); d.locator('[name=discount]').fill('10%'); d.locator('[name=cash]').dispatch_event('input'); pg.wait_for_timeout(100)
    check('5,760' in d.locator('#co-total').inner_text() and 'VAT 18%' in d.locator('#co-sub').inner_text(), '10% discount and VAT shown at checkout: 6,400 → 5,760')
    check('New customer' in d.locator('#co-cust').inner_text(), 'a new customer is added from the till')
    submit('Complete sale'); pg.wait_for_timeout(400)
    cust = next(c for c in data(pg)['customers'].values() if c['name'] == 'Mama Asha')
    credit_sale = max(data(pg)['sales'].values(), key=lambda x: x['ts'])
    check(cust['phone'] == '0712000111' and cust['balance'] == 5760, f"Mama Asha owes 5,760 (got {cust['balance']})")
    check(credit_sale['credit'] and credit_sale['discount'] == 640 and credit_sale['tax'] == 879, f"sale saved as credit with 640 discount and VAT 879 (got {credit_sale['discount']}, {credit_sale.get('tax')})")
    rtxt = dlg().inner_text()
    check('now owes' in rtxt and 'Includes VAT 18%' in rtxt, 'receipt shows the balance owed and the VAT')
    dlg().locator('[data-print]').click(); pg.wait_for_timeout(250)
    check('Asante sana!' in pg.locator('#print-root .doc').inner_text(), 'receipt PDF uses the receipt footer')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(150)
    # refund one sugar
    dlg().locator('[data-refund]').click(); pg.wait_for_timeout(300)
    dlg().locator('.rf-qty').first.fill('1'); dlg().locator('.rf-qty').first.dispatch_event('input')
    check('2,880' in dlg().locator('#rf-total').inner_text(), 'refund of 1 of 2 gives back half the discounted total: 2,880')
    dlg().locator('[name=reason]').fill('Torn bag'); submit('Refund'); pg.wait_for_timeout(400)
    cust = next(c for c in data(pg)['customers'].values() if c['name'] == 'Mama Asha')
    check(item(pg, 'Sugar 1kg')['stock'] == sugar0 - 1 and cust['balance'] == 2880, f"refund returns stock and takes 2,880 off the account (owes {cust['balance']})")
    orig = data(pg)['sales'][credit_sale['id']] if credit_sale.get('id') in data(pg)['sales'] else next(v for k, v in data(pg)['sales'].items() if v.get('no') == credit_sale['no'])
    check(orig.get('refunded') == 2880, 'original receipt shows what was refunded')
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # customer pays part
    go('#/money?tab=customers')
    check('2,880' in pg.locator('main').inner_text() and 'Mama Asha' in pg.locator('main').inner_text(), 'Customers tab shows who owes what')
    pg.locator('[data-cust]', has_text='Mama Asha').click(); pg.wait_for_timeout(250)
    dlg().locator('[data-pay]').click(); pg.wait_for_timeout(250)
    dlg().locator('[name=amount]').fill('2000'); submit('Save payment'); pg.wait_for_timeout(300)
    cust = next(c for c in data(pg)['customers'].values() if c['name'] == 'Mama Asha')
    check(cust['balance'] == 880 and len(data(pg).get('payments', {})) == 1, f"payment of 2,000 recorded: owes 880 (got {cust['balance']})")
    pg.locator('[data-cust]', has_text='Mama Asha').click(); pg.wait_for_timeout(250)
    dlg().locator('[data-remind]').click(); pg.wait_for_timeout(150)
    check('255712000111' in pg.evaluate('window.__opened')[-1], 'WhatsApp reminder goes to the customer\'s number')
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # reports
    go('#/money?tab=breakdown')
    txt = pg.locator('main').inner_text()
    check('Gross sales' in txt and 'Refunds' in txt and 'Net sales' in txt, 'Sales by… shows the Loyverse-style summary')
    check('Sugar 1kg' in pg.locator('table').inner_text(), 'sales by item lists the items')
    pg.click('[data-by=pay]'); pg.wait_for_timeout(200)
    check('Credit' in pg.locator('table').inner_text(), 'sales by payment type includes Credit')
    pg.click('[data-by=category]'); pg.wait_for_timeout(200)
    check('Groceries' in pg.locator('table').inner_text(), 'sales by category works')
    go('#/money?tab=sales'); pg.fill('#rc-q', 'Refund'); pg.wait_for_timeout(300)
    pg.fill('#rc-q', 'Sugar'); pg.wait_for_timeout(300)
    check('Refund' in pg.locator('main').inner_text(), 'receipts list shows refunds and can be searched')
    go('#/settings'); pg.fill('#shop-form [name=taxRate]', '0'); pg.click('#shop-form button.primary'); pg.wait_for_timeout(200)

    # --- Stock count of many items
    chalk0 = item(pg, 'Chalk')['stock']; rice0 = item(pg, 'Rice')['stock']
    go('#/stock'); pg.click('[data-act=count]'); pg.wait_for_timeout(300)
    dlg().locator('tr', has_text='Chalk').locator('.ct-n').fill(str(chalk0 - 5))
    dlg().locator('tr', has_text='Rice').locator('.ct-n').fill(str(rice0))
    check('2 counted · 1 different' in dlg().locator('#ct-sum').inner_text(), 'count screen shows what differs')
    submit('Save count'); pg.wait_for_timeout(300)
    adj = [a for a in data(pg)['adjustments'].values() if a['reason'] == 'Stock count' and a['name'] == 'Chalk']
    check(item(pg, 'Chalk')['stock'] == chalk0 - 5 and adj and adj[-1]['qty'] == -5 and item(pg, 'Rice')['stock'] == rice0, 'only the item that differed was corrected (Chalk −5)')

    # --- Hold a sale and pick it up again
    go('#/sell')
    if pg.locator('[data-clear]').count(): pg.locator('[data-clear]').first.dispatch_event('click'); pg.wait_for_timeout(100)
    rice_tile = pg.locator('.tile:has(.tile-name:text-is("Rice"))')
    rice_tile.click(); rice_tile.click()
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.locator('[data-hold]').first.click(); pg.wait_for_timeout(200)
    dlg().locator('[name=name]').fill('School order'); submit('Hold sale'); pg.wait_for_timeout(200)
    check(pg.locator('[data-held]').count() == 1 and pg.locator('.cart-line').count() == 0, 'sale held and the till is free')
    pg.click('[data-held]'); pg.wait_for_timeout(200)
    check('School order' in dlg().inner_text(), 'held sales list shows it')
    dlg().locator('[data-resume]').first.click(); pg.wait_for_timeout(200)
    check(pg.locator('.cart-line').count() == 1 and pg.locator('[data-held]').count() == 0, 'held sale opened back into the till')
    pg.locator('[data-clear]').first.dispatch_event('click'); pg.wait_for_timeout(100)

    # --- Shifts: open with a float, sell for cash, take cash out, close with a count
    go('#/settings'); pg.check('#shop-form [name=useShifts]'); pg.click('#shop-form button.primary'); pg.wait_for_timeout(300)
    go('#/sell')
    check('No shift open' in pg.locator('#pos-tools').inner_text(), 'Sell asks to open a shift')
    pg.locator('#pos-tools [data-shift]').click(); pg.wait_for_timeout(200)
    dlg().locator('[name=cash]').fill('20000'); submit('Open shift'); pg.wait_for_timeout(300)
    check(pg.locator('#pos-tools').inner_text().startswith('Shift'), 'shift opened')
    pg.locator('.tile:has(.tile-name:text-is("Rice"))').click()
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.click('[data-charge]'); pg.wait_for_timeout(200); dlg().locator('label.chip:has-text("Cash")').first.click(); submit('Complete sale'); pg.wait_for_timeout(300)
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    rice_price = item(pg, 'Rice')['price']
    pg.locator('#pos-tools [data-shift]').click(); pg.wait_for_timeout(250)
    dlg().locator('[data-move=out]').click(); pg.wait_for_timeout(200)
    dlg().locator('[name=amount]').fill('1000'); dlg().locator('[name=note]').fill('Transport'); submit('Save'); pg.wait_for_timeout(400)
    expected = 20000 + rice_price - 1000
    check(f'{expected:,}' in dlg().inner_text(), f'shift expects {expected:,} in the drawer')
    dlg().locator('[data-close-shift]').click(); pg.wait_for_timeout(200)
    dlg().locator('[name=counted]').fill(str(expected - 500)); dlg().locator('[name=counted]').dispatch_event('input')
    check('500 short' in dlg().inner_text(), 'closing shows the drawer is short by 500')
    submit('Close shift'); pg.wait_for_timeout(300)
    sh = list(data(pg)['shifts'].values())[-1]
    check(sh.get('closedAt') and sh['difference'] == -500 and sh['expectedCash'] == expected, 'shift closed and saved with the difference')
    go('#/settings'); pg.uncheck('#shop-form [name=useShifts]'); pg.click('#shop-form button.primary'); pg.wait_for_timeout(200)

    # --- Weekly purchase orders (run on the first open of the week)
    pg.evaluate("""(()=>{const d=JSON.parse(localStorage.getItem('shop-local-data-v1')); d.meta.settings.lastAutoPo='2000-01-03';
       d.pos=d.pos||{}; d.pos['auto-2000-01-03-any']={no:'PO-OLD',status:'draft',auto:true,lines:[],ts:1,supplierName:'Any supplier',total:0};
       localStorage.setItem('shop-local-data-v1',JSON.stringify(d));})()""")
    pg.reload(); pg.wait_for_timeout(2500)
    autos = [k for k, p in data(pg)['pos'].items() if p.get('auto')]
    week = data(pg)['meta']['settings']['lastAutoPo']
    check(any(k.startswith(f'auto-{week}-') for k in autos), f'weekly purchase orders drafted for the week of {week}')
    check('auto-2000-01-03-any' not in data(pg)['pos'], "last week's untouched automatic draft was replaced")
    n_auto = len(autos); pg.reload(); pg.wait_for_timeout(2500)
    check(len([1 for p in data(pg)['pos'].values() if p.get('auto')]) == n_auto, 'weekly orders are not repeated in the same week')

    # --- Month-end closing
    go('#/money?tab=report')
    pg.click('[data-act=close-month]'); pg.wait_for_timeout(300)
    d = dlg()
    d.locator('.sal-name').first.fill('Juma'); d.locator('.sal-amt').first.fill('100000')
    d.locator('[name=maintenancePct]').fill('10'); d.locator('[name=otherSavings]').fill('5000'); d.locator('[name=otherLabel]').fill('Emergencies')
    d.locator('.sal-amt').first.dispatch_event('input'); pg.wait_for_timeout(100)
    res = d.locator('#cl-result').inner_text()
    check('Salaries' in res and 'Profit you can take' in res and 'Keep for restocking' in res, 'closing shows salaries, savings and profit you can take')
    submit('Close the month'); pg.wait_for_timeout(500)
    cl = data(pg).get('closings', {})
    c0 = next(iter(cl.values())) if cl else {}
    check(c0.get('salaries') == 100000 and c0.get('otherSavings') == 5000 and c0.get('takeHome') == c0.get('netProfit') - c0.get('maintenance') - 5000, f"month closed: take home {c0.get('takeHome')}")
    check(any(e['category'] == 'Salaries' and e['amount'] == 100000 for e in data(pg)['expenses'].values()), 'salaries saved as an expense for the month')
    check('Month-end closing' in pg.locator('#print-root .doc').inner_text(), 'closing report opens for PDF')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(200)
    check('is closed' in pg.locator('.closing-card').inner_text(), 'Profit tab shows the month is closed')
    check(data(pg)['meta']['settings']['salaryList'][0]['name'] == 'Juma', 'salary list remembered for next month')

    # --- Quotation for a customer → invoice on account
    go('#/sell')
    if pg.locator('[data-clear]').count(): pg.locator('[data-clear]').first.dispatch_event('click'); pg.wait_for_timeout(100)
    rt = pg.locator('.tile:has(.tile-name:text-is("Rice"))'); rt.click(); rt.click(); rt.click()
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.locator('[data-quote]').first.click(); pg.wait_for_timeout(250)
    mama = next(c for c in data(pg)['customers'].values() if c['name'] == 'Mama Asha')
    mama_id = next(k for k, c in data(pg)['customers'].items() if c['name'] == 'Mama Asha')
    dlg().locator('[name=customerId]').select_option(mama_id); submit('Save quotation'); pg.wait_for_timeout(400)
    q = next(iter(data(pg).get('quotes', {}).values()), {})
    rice_p = item(pg, 'Rice')['price']; rice_s = item(pg, 'Rice')['stock']
    check(q.get('total') == 3 * rice_p and q.get('customer') == 'Mama Asha', f"quotation saved for Mama Asha: {q.get('total')}")
    check(pg.locator('.cart-line').count() == 0, 'the till is cleared after quoting')
    dlg().locator('[data-print]').click(); pg.wait_for_timeout(250)
    check('Quotation' in pg.locator('#print-root .doc').inner_text() and 'Accepted by' in pg.locator('#print-root .doc').inner_text(), 'quotation PDF ready')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(150)
    dlg().locator('[data-invoice]').click(); pg.wait_for_timeout(250)
    dlg().get_by_role('button', name='Invoice on account').click(); pg.wait_for_timeout(500)
    mama2 = next(c for c in data(pg)['customers'].values() if c['name'] == 'Mama Asha')
    check(mama2['balance'] == mama['balance'] + 3 * rice_p and item(pg, 'Rice')['stock'] == rice_s - 3, 'invoicing puts it on her account and takes the stock out')
    check('Bill to' in pg.locator('#print-root .doc').inner_text(), 'invoice PDF opens')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(150)
    go('#/money?tab=quotes')
    check('Invoiced' in pg.locator('main').inner_text(), 'Quotations tab shows it as invoiced')

    # --- Bought in boxes, sold in pieces
    go('#/stock'); pg.locator('#stock-list tr', has_text='Bar soap').click(); pg.wait_for_timeout(250)
    dlg().locator('[data-edit]').click(); pg.wait_for_timeout(250)
    dlg().locator('[name=buyKind]').select_option('box'); dlg().locator('[name=packSize]').fill('24'); dlg().locator('[name=packCost]').fill('24000')
    check(dlg().locator('[name=cost]').input_value() == '1000', 'price per box fills the cost per piece (24,000 / 24 = 1,000)')
    check('1 box = 24 pcs' in dlg().locator('[data-rule]').inner_text(), 'form explains 1 box = 24 pcs')
    pg.screenshot(path=OUT + 'item-buying.png')
    submit('Save changes'); pg.wait_for_timeout(300)
    check(item(pg, 'Bar soap')['buyUnit'] == 'box' and item(pg, 'Bar soap')['packSize'] == 24, 'item bought in boxes of 24')
    # a dozen is always 12
    go('#/stock?new=1'); pg.wait_for_timeout(250)
    dlg().locator('[name=name]').fill('Pens blue'); dlg().locator('[name=price]').fill('300')
    dlg().locator('[name=buyKind]').select_option('dozen')
    check(dlg().locator('[name=packSize]').input_value() == '12', 'choosing Dozen sets 12 pieces')
    dlg().locator('[name=packCost]').fill('2400'); submit('Add item'); pg.wait_for_timeout(300)
    pens = item(pg, 'Pens blue')
    check(pens['buyUnit'] == 'dozen' and pens['packSize'] == 12 and abs(pens['cost'] - 200) < 0.01, 'new item: pens bought by the dozen at 200 each')
    soap0 = item(pg, 'Bar soap')['stock']
    go('#/orders?tab=pos'); pg.click('[data-act=new-po]'); pg.wait_for_timeout(250)
    r0 = dlg().locator('.line-row').first
    r0.locator('.li-name').fill('Bar soap'); r0.locator('.li-name').dispatch_event('change')
    check(r0.locator('.li-unit').input_value() == '24' and r0.locator('.li-cost').input_value() == '24000', 'order line offers boxes first, at the price per box')
    r0.locator('.li-qty').fill('2'); r0.locator('.li-qty').dispatch_event('input')
    check('48 pcs' in r0.locator('.li-pack').inner_text(), 'order line shows 2 boxes = 48 pcs')
    r1 = dlg().locator('.line-row').nth(1)
    r1.locator('.li-name').fill('Pens blue'); r1.locator('.li-name').dispatch_event('change'); r1.locator('.li-qty').fill('5'); r1.locator('.li-qty').dispatch_event('input')
    check(dlg().locator('#po-total').inner_text().replace('\u00a0', ' ').endswith('60,000'), 'PO total: 2 boxes x 24,000 + 5 dozen x 2,400 = 60,000')
    pg.screenshot(path=OUT + 'po-units.png')
    dlg().locator('[data-print]').click(); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT + 'po-doc.png', full_page=True)
    doc = pg.locator('#print-root .doc').inner_text()
    check('Box of 24 pcs' in doc and '48 pcs' in doc and 'Dozen of 12 pcs' in doc and '60 pcs' in doc, 'purchase order PDF shows boxes, dozens and total pieces')
    pg.locator('[data-doc-close]').click(); pg.wait_for_timeout(150)
    soap_po = next(p for p in pos_() if any(l['name'] == 'Pens blue' for l in p['lines']))
    sl = next(l for l in soap_po['lines'] if l['name'] == 'Bar soap')
    check(sl['qty'] == 48 and sl['inPacks'] and sl['buyUnit'] == 'box', 'PO stores 48 pcs, ordered as boxes')
    dlg().locator('[data-order]').click(); pg.wait_for_timeout(300)
    go('#/stock'); pg.click('[data-f=incoming]'); pg.wait_for_timeout(200)
    check('2 boxes' in pg.locator('[data-incoming]', has_text=soap_po['no']).inner_text(), 'Incoming shows Bar soap 2 boxes')
    pg.locator('[data-incoming]', has_text=soap_po['no']).locator('[data-recv]').click(); pg.wait_for_timeout(250)
    tr = dlg().locator('tr[data-item]', has_text='Bar soap')
    check(tr.locator('.rv-qty').input_value() == '2' and tr.locator('.rv-unit').input_value() == '24', 'receive form counts 2 boxes')
    pg.screenshot(path=OUT + 'receive-units.png')
    tr.locator('.rv-unit').select_option('1'); pg.wait_for_timeout(100)
    check(tr.locator('.rv-qty').input_value() == '48', 'switching to pieces shows 48')
    tr.locator('.rv-unit').select_option('24'); pg.wait_for_timeout(100)
    submit('Receive into stock'); pg.wait_for_timeout(400)
    check(item(pg, 'Bar soap')['stock'] == soap0 + 48, f"receiving 2 boxes adds 48 pieces to stock ({soap0} + 48)")
    check(item(pg, 'Pens blue')['stock'] == 60, 'receiving 5 dozen pens adds 60 pens')
    pg.click('[data-f=all]')
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    # the owner deletes the received order: stock comes back out, delivery record goes
    n_purch = len([p for p in data(pg)['purchases'].values() if p.get('poNo') == soap_po['no']])
    go('#/orders?tab=pos'); pg.locator('[data-po]', has_text=soap_po['no']).click(); pg.wait_for_timeout(250)
    dlg().locator('[data-del]').click(); pg.wait_for_timeout(300)
    warn = dlg().inner_text()
    check('2 boxes' in warn and '48 pcs' in warn and '60,000' in warn, 'delete warning lists boxes coming out of stock and the TSh 60,000 purchase')
    pg.screenshot(path=OUT + 'delete-received.png')
    dlg().get_by_role('button', name='Delete and take out of stock').click(); pg.wait_for_timeout(400)
    check(n_purch == 1 and not any(p.get('poNo') == soap_po['no'] for p in data(pg)['purchases'].values()), 'its delivery record is removed')
    check(not any(p['no'] == soap_po['no'] for p in pos_()) and item(pg, 'Bar soap')['stock'] == soap0 and item(pg, 'Pens blue')['stock'] == 0, f'received order deleted: soap back to {soap0}, pens back to 0')
    # losses: the owner clears the month
    adj = [a for a in data(pg).get('adjustments', {}).values()]
    stock_before = {i['name']: i['stock'] for i in data(pg)['items'].values()}
    go('#/money?tab=losses')
    check(pg.locator('[data-adj]').count() == len(adj) and len(adj) > 0, f'Losses tab lists the {len(adj)} stock adjustments this month')
    pg.screenshot(path=OUT + 'losses.png', full_page=True)
    pg.click('[data-act=clear-all]'); pg.wait_for_timeout(200)
    dlg().get_by_role('button', name='Clear all').click(); pg.wait_for_timeout(400)
    check(len(data(pg).get('adjustments', {})) == 0 and 'No stock losses' in pg.locator('#money-body').inner_text(), 'Clear all removes every loss figure for the month')
    check({i['name']: i['stock'] for i in data(pg)['items'].values()} == stock_before, 'clearing losses leaves stock as it is')
    go('#/money?tab=report')
    check('Stock losses' in pg.locator('#money-body').inner_text(), 'profit report still opens after clearing')

    # --- Dashboard: money position on Home
    go('#/home')
    owed = sum(max(0, c.get('balance', 0)) for c in data(pg)['customers'].values())
    mp = pg.locator('.card', has_text='Money position').inner_text()
    check(f'{owed:,}' in mp and 'You owe suppliers' in mp and 'Stock value' in mp, f'Home shows the money position (customers owe {owed:,})')

    # --- Rename a category from the setup guide in Settings
    go('#/settings'); pg.click('[data-act=setup]'); pg.wait_for_timeout(250)
    for _ in range(3): submit('Save and continue')
    check('Categories' in dlg().inner_text(), 'setup reopens from Settings')
    dlg().locator('[name="cat:Grains"]').fill('Cereals'); submit('Save and continue'); pg.wait_for_timeout(300)
    check(item(pg, 'Rice')['category'] == 'Cereals', 'renaming a category moves its items (Grains → Cereals)')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # --- Screens on this size
    for h in ['#/home', '#/sell', '#/stock', '#/orders', '#/money', '#/settings']:
        go(h); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}{W}-{h[2:]}.png", full_page=True)
        sw = pg.evaluate("document.documentElement.scrollWidth")
        check(sw <= W, f'{h} fits the screen width ({sw}px of {W}px)')

    # --- Offline: app must open with no network
    go('#/home'); pg.wait_for_timeout(1500)
    soap_before = item(pg, 'Bar soap')['stock']
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(1500)
    check(pg.locator('.hero-figure').count() == 1, 'app opens offline from the cache')
    go('#/sell'); pg.locator('.tile', has_text='Bar soap').click()
    if W < 900: pg.click('#cart-bar'); pg.wait_for_timeout(150)
    pg.click('[data-charge]'); pg.wait_for_timeout(200); submit('Complete sale'); pg.wait_for_timeout(300)
    check(item(pg, 'Bar soap')['stock'] == soap_before - 1, f"a sale works offline (Bar soap {soap_before} → {item(pg, 'Bar soap')['stock']})")
    ctx.set_offline(False)

    if os.environ.get('DUMP'): open(os.environ['DUMP'], 'w').write(json.dumps(data(pg)))
    print('\nConsole errors:', '\n'.join(errs) if errs else 'none')
    if errs: fails.append('console errors')
    b.close()

print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
