"""Tests the synced (Firebase) path with a stand-in Firebase that applies the same access rules:
management setup, creating shops and owners, sellers' limited view, a stranger being refused,
shops kept apart, and the one-time upgrade of a single-shop database.
Run with the app served on :8765:  python3 tests/e2e_firebase.py
"""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('APP_URL', 'http://localhost:8765/')
FAKE = Path(__file__).parent / 'fake-firebase'
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

BOSS = {'uid': 'u-boss', 'email': 'boss@gmail.com', 'name': 'Michael Boss'}
SELLER = {'uid': 'u-seller', 'email': 'seller@gmail.com', 'name': 'Juma Seller'}
OWNER2 = {'uid': 'u-owner2', 'email': 'owner2@gmail.com', 'name': 'Neema Owner'}
STRANGER = {'uid': 'u-x', 'email': 'stranger@gmail.com', 'name': 'Someone'}
MANAGER = {'uid': 'u-mgr', 'email': 'manager@gmail.com', 'name': 'Asha Manager'}
CONFIG_PASTE = '''const firebaseConfig = {
  apiKey: "AIzaFAKE123",
  authDomain: "my-shop-123.firebaseapp.com",
  projectId: "my-shop-123",
  storageBucket: "my-shop-123.appspot.com",
  messagingSenderId: "1234",
  appId: "1:1234:web:abcd"
};'''


def new_context(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    # Tests never touch the real Firebase project: serve a blank config and a stand-in Firebase.
    ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, body="export const firebaseConfig = { apiKey: '' };", headers={'content-type': 'text/javascript'}))
    # The web font comes from Google; tests run without internet, so serve an empty stylesheet.
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', headers={'content-type': 'text/css'}))
    def serve(route):
        name = route.request.url.rsplit('/', 1)[-1]
        route.fulfill(status=200, body=(FAKE / name).read_text(), headers={'content-type': 'text/javascript', 'access-control-allow-origin': '*'})
    ctx.route('https://www.gstatic.com/firebasejs/**', serve)
    return ctx


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = new_context(b)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'permission' not in m.text.lower() else None)

    def fs(): return pg.evaluate("JSON.parse(localStorage.getItem('fake-fs')||'{}')")
    def shop_ids(): return [k.split('/')[1] for k in fs() if re.fullmatch(r'shops/[^/]+', k)]
    def shop_by_name(n): return next((k.split('/')[1] for k, v in fs().items() if re.fullmatch(r'shops/[^/]+', k) and v['name'] == n), None)
    def docs(shop, col): return [v for k, v in fs().items() if k.startswith(f'shops/{shop}/{col}/')]
    def next_user(u): pg.evaluate(f"localStorage.setItem('fake-next-user', {json.dumps(json.dumps(u))})")
    def dlg(): return pg.locator('dialog[open]').last
    def go(h): pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(350)
    def sign_in(u):
        next_user(u); pg.click('#g-signin'); pg.wait_for_timeout(700)
    def sign_out():
        go('#/settings'); pg.click('[data-act=signout]'); pg.wait_for_timeout(200)
        dlg().get_by_role('button', name='Sign out', exact=True).click(); pg.wait_for_timeout(900)
    def h1(): return pg.locator('h1').first.inner_text()

    # ---------- Trial mode, then connect Firebase ----------
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('#g-local'); pg.wait_for_timeout(800)
    go('#/stock?new=1')
    d = dlg(); d.locator('[name=name]').fill('Trial item'); d.locator('[name=price]').fill('500'); d.locator('[name=stock]').fill('7')
    d.get_by_role('button', name='Add item').click(); pg.wait_for_timeout(300)
    go('#/settings')
    check(pg.locator('[data-act=connect]').count() == 1, 'trial mode offers Connect Firebase in Settings')
    pg.evaluate("localStorage.removeItem('local-mode'); location.hash='#/home'"); pg.reload(); pg.wait_for_timeout(600)
    pg.click('#g-connect'); dlg().locator('textarea').fill('nonsense'); dlg().get_by_role('button', name='Connect').click(); pg.wait_for_timeout(200)
    check(pg.locator('.toast-err').count() == 1, 'invalid config is rejected with a message')
    dlg().locator('textarea').fill(CONFIG_PASTE); dlg().get_by_role('button', name='Connect').click(); pg.wait_for_timeout(1200)
    cfg = json.loads(pg.evaluate("localStorage.getItem('firebase-config')"))
    check(cfg['projectId'] == 'my-shop-123', 'pasted Firebase config parsed and saved')
    check(pg.locator('#g-signin').count() == 1, 'sign-in screen shown')

    # ---------- First person becomes management and creates the first shop ----------
    sign_in(BOSS)
    check(pg.locator('#g-mgmt').count() == 1, 'first person is offered to become management')
    pg.click('#g-mgmt'); pg.wait_for_timeout(700)
    check(fs().get('platform/admins', {}).get('admins') == {'boss@gmail.com': True}, 'management recorded')
    check(pg.locator('#g-new').count() == 1, 'management is asked to create the first shop')
    pg.click('#g-new'); pg.wait_for_timeout(250)
    dlg().locator('[name=name]').fill('Greenlight Main')
    check(dlg().locator('[name=owner]').input_value() == 'boss@gmail.com', 'owner defaults to management themselves')
    dlg().get_by_role('button', name='Create shop').click(); pg.wait_for_timeout(1500)
    main = shop_by_name('Greenlight Main')
    check(main is not None and fs()[f'shops/{main}']['owners'] == ['boss@gmail.com'], 'shop created with its owner')
    check(pg.locator('#shop-name').inner_text() == 'Greenlight Main', 'the new shop opens')
    check(pg.locator('[data-nav=manage]').count() == 1, 'management sees All shops')
    pg.wait_for_timeout(300)
    if pg.locator('dialog[open]').count() and 'trial' in dlg().inner_text().lower():
        dlg().get_by_role('button', name='Copy my data').click(); pg.wait_for_timeout(500)
    check(any(i['name'] == 'Trial item' for i in docs(main, 'items')), 'trial data copied into the shop')

    # Item, purchase order and a seller in shop 1
    go('#/stock?new=1')
    d = dlg(); d.locator('[name=name]').fill('Unga 2kg'); d.locator('[name=price]').fill('4000'); d.locator('[name=cost]').fill('3200'); d.locator('[name=stock]').fill('10'); d.locator('[name=minStock]').fill('3')
    d.get_by_role('button', name='Add item').click(); pg.wait_for_timeout(500)
    check(any(i['name'] == 'Unga 2kg' and i['stock'] == 10 for i in docs(main, 'items')), "item saved inside the shop's own records")
    check(not any(k.startswith('items/') for k in fs()), 'nothing written to the old single-shop place')
    go('#/orders?tab=pos'); pg.click('[data-act=new-po]'); pg.wait_for_timeout(300)
    r0 = dlg().locator('.line-row').first
    r0.locator('.li-name').fill('Unga 2kg'); r0.locator('.li-name').dispatch_event('change'); r0.locator('.li-qty').fill('5'); r0.locator('.li-cost').fill('3200')
    dlg().locator('[data-order]').click(); pg.wait_for_timeout(500)
    check(len(docs(main, 'pos')) == 1 and docs(main, 'pos')[0]['status'] == 'ordered', 'purchase order saved as ordered')
    go('#/settings')
    pg.fill('#add-member [name=email]', 'Seller@Gmail.com'); pg.select_option('#add-member [name=role]', 'staff')
    pg.click('#add-member button'); pg.wait_for_timeout(500)
    shop1 = fs()[f'shops/{main}']
    check(shop1['members'] == {'seller@gmail.com': 'staff'} and 'seller@gmail.com' in shop1['memberEmails'], 'seller added to the shop (email in lower case)')

    # ---------- A second shop with its own owner, items copied ----------
    go('#/manage')
    check('Greenlight Main' in pg.locator('main').inner_text(), 'All shops lists the shop')
    pg.click('[data-act=new-shop]'); pg.wait_for_timeout(250)
    dlg().locator('[name=name]').fill('Greenlight Kisesa')
    dlg().locator('[name=owner]').fill('owner2@gmail.com')
    dlg().locator('[name=copyFrom]').select_option(main)
    dlg().get_by_role('button', name='Create shop').click(); pg.wait_for_timeout(1500)
    branch = shop_by_name('Greenlight Kisesa')
    check(branch is not None and fs()[f'shops/{branch}']['owners'] == ['owner2@gmail.com'], 'second shop created with owner2 as owner')
    copied = docs(branch, 'items')
    check(any(i['name'] == 'Unga 2kg' and i['stock'] == 0 and i['price'] == 4000 for i in copied), 'item list copied with prices, stock starting at 0')
    check(len(docs(branch, 'pos')) == 0 and len(docs(branch, 'sales')) == 0, 'nothing else copied — the shops are separate')
    pg.wait_for_timeout(500)
    body = pg.locator('main').inner_text()
    check('Greenlight Kisesa' in body and 'Shops' in body, 'All shops shows both shops with combined figures')
    if os.environ.get('SHOTS'): pg.screenshot(path=os.environ['SHOTS'] + 'fb-manage.png', full_page=True)
    pg.click('#brand'); pg.wait_for_timeout(250)
    check(dlg().locator('[data-pick]').count() == 2, 'shop switcher lists both shops')
    dlg().locator('[data-pick]', has_text='Kisesa').click(); pg.wait_for_timeout(1500)
    check(pg.locator('#shop-name').inner_text() == 'Greenlight Kisesa', 'switching opens the other shop')
    go('#/stock')
    check('Unga 2kg' in pg.locator('#stock-list').inner_text() and 'Trial item' in pg.locator('#stock-list').inner_text(), "Kisesa shows its own copied items")
    sign_out()

    # ---------- The second shop's owner ----------
    sign_in(OWNER2)
    check(pg.locator('#shop-name').inner_text() == 'Greenlight Kisesa', 'owner2 goes straight into their shop')
    check(pg.locator('[data-nav=manage]').count() == 0, 'an owner does not see All shops')
    go('#/settings')
    opts = pg.locator('#add-member [name=role] option').evaluate_all('o => o.map(x => x.value)')
    check(opts == ['staff', 'manager'], f'an owner can add sellers and managers, not owners: {opts}')
    pg.fill('#add-member [name=email]', 'kisesa.seller@gmail.com'); pg.select_option('#add-member [name=role]', 'staff')
    pg.click('#add-member button'); pg.wait_for_timeout(500)
    check(fs()[f'shops/{branch}']['members'].get('kisesa.seller@gmail.com') == 'staff', 'owner2 added a seller to their own shop')
    denied_before = len(pg.evaluate('window.__fsDenied'))
    can_read_main = pg.evaluate(f"""(async () => {{
      const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
      try {{ await F.getDocs(F.collection({{}}, 'shops/{main}/items')); return true; }} catch (e) {{ return false; }}
    }})()""")
    check(can_read_main is False, "owner2 cannot read the other shop's records")
    sign_out()

    # ---------- A stranger is refused ----------
    sign_in(STRANGER)
    check('No access yet' in h1(), 'stranger sees “No access yet”')
    check(pg.locator('[data-nav]').count() == 0, 'stranger cannot reach any screen')
    pg.click('#g-out'); pg.wait_for_timeout(900)

    # ---------- The seller of shop 1 gets a limited app ----------
    sign_in(SELLER)
    check(pg.locator('#shop-name').inner_text() == 'Greenlight Main', 'seller goes straight into their shop')
    pg.wait_for_timeout(500)
    check(pg.locator('#shift-gate').is_visible() and 'Open shift' in pg.locator('#shift-gate').inner_text(), 'seller must open a shift first')
    pg.locator('#shift-gate [name=cash]').fill('10000'); pg.locator('#shift-gate button', has_text='Open shift').click(); pg.wait_for_timeout(900)
    shifts = [v for k, v in fs().items() if '/shifts/' in k]
    check(pg.locator('#shift-gate').count() == 0 and len(shifts) == 1 and shifts[0]['openingCash'] == 10000 and shifts[0]['by'] == 'seller@gmail.com', 'seller opened the shift (saved online, allowed by the rules)')
    navs = pg.locator('[data-nav]').evaluate_all('els => els.map(e => e.dataset.nav)')
    check(navs == ['home', 'sell', 'stock', 'settings'], f'seller sees only Home, Sell, Stock (+Settings): {navs}')
    check(pg.locator('section:not(.day-card) .stats').count() == 0 and 'gross profit' not in pg.locator('.hero-sub').inner_text() and 'profit' not in pg.locator('.day-card').inner_text().lower(), "seller does not see profit figures (only today's money to count)")
    go('#/money')
    check(pg.locator('.hero').count() == 1, 'seller sent back to Home when opening Money')
    go('#/manage')
    check(pg.locator('.hero').count() == 1, 'seller cannot open All shops')
    go('#/stock')
    check(pg.locator('[data-act=new]').count() == 0 and 'Cost' not in pg.locator('thead').inner_text(), 'seller cannot add items or see cost')
    pg.click('[data-f=incoming]'); pg.wait_for_timeout(300)
    check(pg.locator('[data-incoming]').count() == 1 and pg.locator('[data-recv]').count() == 0, 'seller sees the incoming order but cannot receive it by default')
    go('#/sell')
    pg.locator('.tile', has_text='Unga').click(); pg.locator('.tile', has_text='Unga').click()
    pg.click('#cart-bar'); pg.wait_for_timeout(200)
    pg.locator('[data-price]').first.click(); pg.wait_for_timeout(200)
    check(pg.locator('dialog[open]').count() == 0, 'seller cannot change the price')
    pg.click('[data-charge]'); pg.wait_for_timeout(200)
    check(dlg().locator('[name=discount]').count() == 0, 'seller cannot give discounts')
    dlg().get_by_role('button', name='Complete sale').click(); pg.wait_for_timeout(600)
    check(dlg().locator('[data-void]').count() == 0, 'seller cannot cancel a sale')
    dlg().get_by_role('button', name='Next sale').click(); pg.wait_for_timeout(200)
    sales = docs(main, 'sales')
    unga = next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')
    check(len(sales) == 1 and sales[0]['by'] == 'seller@gmail.com' and sales[0]['total'] == 8000, 'seller sale saved under their email')
    check(unga['stock'] == 8, 'seller sale reduced stock (allowed field only)')
    go('#/home'); pg.locator('.day-card [data-act=payout]').click(); pg.wait_for_timeout(250)
    dlg().locator('[name=amount]').fill('2000'); dlg().locator('label.chip', has_text='Transport').click()
    dlg().get_by_role('button', name='Save pay-out').click(); pg.wait_for_timeout(500)
    check(any(x.get('payout') and x['by'] == 'seller@gmail.com' and x['amount'] == 2000 for x in docs(main, 'expenses')), 'seller paid out 2,000 for transport')
    go('#/sell'); pg.locator('#pos-tools [data-shift]').click(); pg.wait_for_timeout(300)
    dlg().locator('[data-close-shift]').click(); pg.wait_for_timeout(400)
    dlg().locator('tr[data-m="Cash"] .dc-count').fill('16000'); dlg().locator('tr[data-m="Cash"] .dc-count').dispatch_event('input')
    dlg().get_by_role('button', name='Close shift').click(); pg.wait_for_timeout(700)
    dc = docs(main, 'dayclose')
    check(len(dc) == 1 and dc[0]['by'] == 'seller@gmail.com' and dc[0]['totalDiff'] == 0, f"seller closed the shift and the day: 10,000 opening + 8,000 sales − 2,000 pay-out = 16,000 cash, matches ({dc[0]['totalDiff'] if dc else 'none'})")
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    denied = pg.evaluate('window.__fsDenied')
    check(denied == [], f'no writes refused by the rules during normal seller use: {denied}')
    pg.locator('#shift-gate [data-signout]').click(); pg.wait_for_timeout(900)

    # ---------- Management sees the sale; lets sellers receive; seller receives ----------
    sign_in(BOSS)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    check('8,000' in pg.locator('.hero-figure').inner_text(), 'management sees today’s sales including the seller’s')
    check('1,600' in pg.locator('.hero-sub').inner_text(), 'and the gross profit TSh 1,600')
    pg.wait_for_timeout(7000)
    snaps = [k for k in fs() if k.startswith(f'shops/{main}/snapshots/')]
    check(len(snaps) == 1, f'daily snapshot of items, customers and suppliers saved ({snaps})')
    unga_price = next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')['price']
    pg.evaluate("import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js').then(() => import('/js/store.js')).then(({ store }) => { const u = store.data.items.find((i) => i.name === 'Unga 2kg'); store.saveItem({ ...u, price: 1 }); })"); pg.wait_for_timeout(500)
    go('#/settings'); pg.click('[data-act=restore]'); pg.wait_for_timeout(800)
    dlg().locator('[data-snap]').first.click(); pg.wait_for_timeout(500)
    dlg().get_by_role('button', name='Restore', exact=True).click(); pg.wait_for_timeout(300)
    dlg().get_by_role('button', name='Restore', exact=True).click(); pg.wait_for_timeout(800)
    check(next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')['price'] == unga_price, f'restore from the daily snapshot puts the price back ({unga_price})')
    if dlg().count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    go('#/settings')
    pg.evaluate("document.querySelectorAll('#shop-form details').forEach((d) => d.open = true)"); pg.check('#shop-form [name=staffCanReceive]'); pg.click('#shop-form button.primary'); pg.wait_for_timeout(400)
    check(fs()[f'shops/{main}/meta/settings'].get('staffCanReceive') is True, 'sellers allowed to receive deliveries')
    sign_out(); sign_in(SELLER); pg.wait_for_timeout(500)
    check('Shift closed for today' in pg.locator('#shift-gate').inner_text(), 'seller signing in again after closing sees "Shift closed for today"')
    pg.locator('#shift-gate [data-again]').click(); pg.wait_for_timeout(300)
    pg.locator('#shift-gate [name=cash]').fill('16000'); pg.locator('#shift-gate button', has_text='Open shift').click(); pg.wait_for_timeout(700)
    go('#/stock'); pg.click('[data-f=incoming]'); pg.wait_for_timeout(300)
    pg.locator('[data-recv]').first.click(); pg.wait_for_timeout(300)
    dlg().get_by_role('button', name='Receive into stock').click(); pg.wait_for_timeout(600)
    unga = next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')
    po_doc = docs(main, 'pos')[0]
    check(unga['stock'] == 13 and po_doc['status'] == 'received', f"seller received the delivery: Unga 8 + 5 = {unga['stock']}, PO {po_doc['status']}")
    denied = pg.evaluate('window.__fsDenied')
    check(denied == [], f'no writes refused while the seller received: {denied}')
    sign_out(); sign_in(BOSS)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    go('#/settings')
    pg.locator('[data-remove="seller@gmail.com"]').click(); pg.wait_for_timeout(200)
    dlg().get_by_role('button', name='Remove', exact=True).click(); pg.wait_for_timeout(400)
    check(fs()[f'shops/{main}']['members'] == {} and 'seller@gmail.com' not in fs()[f'shops/{main}']['memberEmails'], 'seller access removed')

    # ---------- Deleting orders and clearing figures: owner, or a manager the owner allows ----------
    pg.fill('#add-member [name=email]', MANAGER['email']); pg.select_option('#add-member [name=role]', 'manager')
    pg.click('#add-member button'); pg.wait_for_timeout(500)
    check(pg.locator(f'[data-can-clear="{MANAGER["email"]}"]').count() == 1 and not pg.locator(f'[data-can-clear="{MANAGER["email"]}"]').is_checked(), 'manager added; "can delete received orders" is off by default')
    sign_out(); sign_in(MANAGER)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    received_po = docs(main, 'pos')[0]
    go('#/orders?tab=pos'); pg.locator('[data-po]', has_text=received_po['no']).click(); pg.wait_for_timeout(300)
    check(dlg().locator('[data-del]').count() == 0 and 'only be deleted by the owner' in dlg().inner_text(), 'manager without permission cannot delete a received order')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # rules refuse it even if tried directly
    pid = next(k.split('/')[-1] for k in fs() if k.startswith(f'shops/{main}/purchases/'))
    refused = pg.evaluate(f"""(async () => {{
      const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
      const b = F.writeBatch({{}}); b.delete(F.doc({{}}, 'shops/{main}/purchases/{pid}'));
      try {{ await b.commit(); return false; }} catch (e) {{ return true; }}
    }})()""")
    check(refused, 'the rules refuse a manager deleting a delivery record without permission')
    pg.evaluate('window.__fsDenied.length = 0')
    # a manager can delete an order that has not arrived
    pg.click('[data-act=new-po]'); pg.wait_for_timeout(300)
    r0 = dlg().locator('.line-row').first
    r0.locator('.li-name').fill('Unga 2kg'); r0.locator('.li-name').dispatch_event('change'); r0.locator('.li-qty').fill('3'); r0.locator('.li-cost').fill('3200')
    dlg().locator('[data-order]').click(); pg.wait_for_timeout(500)
    open_po = next(p for p in docs(main, 'pos') if p['status'] == 'ordered')
    go('#/stock'); check('on order' in pg.locator('#stock-list tr', has_text='Unga').inner_text(), 'Stock shows Unga on order')
    go('#/orders?tab=pos'); pg.locator('[data-po]', has_text=open_po['no']).click(); pg.wait_for_timeout(300)
    dlg().locator('[data-del]').click(); pg.wait_for_timeout(250)
    dlg().get_by_role('button', name='Delete order').click(); pg.wait_for_timeout(500)
    check(not any(p['no'] == open_po['no'] for p in docs(main, 'pos')), 'manager deleted the order that had not arrived')
    go('#/stock'); check('on order' not in pg.locator('#stock-list tr', has_text='Unga').inner_text(), 'and it no longer shows as on order in Stock')
    # a loss the manager cannot clear yet
    pg.locator('#stock-list tr', has_text='Unga').click(); pg.wait_for_timeout(250)
    dlg().locator('[data-adjust]').click(); pg.wait_for_timeout(250)
    dlg().locator('label.chip', has_text='Remove').click(); dlg().locator('[name=qty]').fill('1'); dlg().locator('[name=reason]').select_option('Damaged')
    dlg().get_by_role('button', name='Save').click(); pg.wait_for_timeout(400)
    go('#/money?tab=losses')
    check('Damaged' in pg.locator('#money-body').inner_text() and pg.locator('[data-clear]').count() == 0, 'manager sees the loss but cannot clear it without permission')
    sign_out()
    # the owner gives permission
    sign_in(BOSS)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    go('#/settings'); pg.locator(f'[data-can-clear="{MANAGER["email"]}"]').check(); pg.wait_for_timeout(500)
    check(fs()[f'shops/{main}'].get('canClear', {}).get(MANAGER['email']) is True, 'owner allowed the manager to delete received orders and clear figures')
    sign_out(); sign_in(MANAGER)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    unga0 = next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')['stock']
    go('#/orders?tab=pos'); pg.locator('[data-po]', has_text=received_po['no']).click(); pg.wait_for_timeout(300)
    dlg().locator('[data-del]').click(); pg.wait_for_timeout(500)
    check('Unga 2kg' in dlg().inner_text() and '5 pcs' in dlg().inner_text(), 'warning lists what comes back out of stock (Unga 5 pcs)')
    dlg().get_by_role('button', name='Delete and take out of stock').click(); pg.wait_for_timeout(600)
    unga = next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')
    check(not any(p['no'] == received_po['no'] for p in docs(main, 'pos')) and unga['stock'] == unga0 - 5, f"received order deleted and stock taken back out: {unga0} − 5 = {unga['stock']}")
    check(not any(p.get('poNo') == received_po['no'] for p in docs(main, 'purchases')), 'its delivery record is removed too')
    adj_before = len(docs(main, 'adjustments'))
    go('#/money?tab=losses'); pg.locator('[data-clear]').first.click(); pg.wait_for_timeout(250)
    dlg().get_by_role('button', name='Clear figure').click(); pg.wait_for_timeout(500)
    check(len(docs(main, 'adjustments')) == adj_before - 1 and next(i for i in docs(main, 'items') if i['name'] == 'Unga 2kg')['stock'] == unga['stock'], 'loss figure cleared; stock unchanged')
    denied = pg.evaluate('window.__fsDenied')
    check(denied == [], f'no writes refused for the allowed manager: {denied}')
    sign_out(); sign_in(BOSS)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    sign_out()
    sign_in(SELLER)
    check('No access yet' in h1(), 'removed seller is locked out')
    ctx.close()

    # ---------- Upgrading a database from the single-shop version ----------
    ctx = new_context(b)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(300)
    legacy = {
        'meta/access': {'owner': 'u-boss', 'ownerEmail': 'boss@gmail.com', 'members': {'seller@gmail.com': 'staff'}},
        'meta/settings': {'shopName': 'Greenlight stationery', 'leadDays': 7},
        'items/a1': {'name': 'Bahasha A4', 'price': 200, 'cost': 80, 'stock': -143, 'minStock': 10, 'active': True},
        'items/a2': {'name': 'Chalk', 'price': 25, 'cost': 10, 'stock': 162, 'minStock': 50, 'active': True},
        'sales/s1': {'ts': 1, 'total': 400, 'lines': []},
    }
    pg.evaluate(f"""localStorage.setItem('fake-fs', {json.dumps(json.dumps(legacy))});
      localStorage.setItem('firebase-config', {json.dumps(json.dumps({'apiKey': 'x', 'projectId': 'p', 'appId': 'a', 'authDomain': 'p.firebaseapp.com'}))})""")
    pg.reload(); pg.wait_for_timeout(700)
    sign_in(SELLER)
    check('No access yet' in h1(), 'before the upgrade, a seller waits for the owner')
    pg.click('#g-out'); pg.wait_for_timeout(900)
    sign_in(BOSS)
    check(pg.locator('#g-up').count() == 1, 'the old owner is offered the upgrade')
    pg.click('#g-up'); pg.wait_for_timeout(2500)
    data = fs()
    moved = next((k.split('/')[1] for k, v in data.items() if re.fullmatch(r'shops/[^/]+', k)), None)
    check(moved and data[f'shops/{moved}']['name'] == 'Greenlight stationery', 'shop 1 created with the existing shop name')
    check(data.get('platform/admins', {}).get('admins') == {'boss@gmail.com': True}, 'the old owner became management')
    names = sorted(v['name'] for k, v in data.items() if k.startswith(f'shops/{moved}/items/'))
    check(names == ['Bahasha A4', 'Chalk'] and data.get(f'shops/{moved}/sales/s1', {}).get('total') == 400, 'items and sales moved into shop 1')
    check(data[f'shops/{moved}']['members'] == {'seller@gmail.com': 'staff'}, 'existing sellers keep their access')
    check(data['meta/access'].get('migratedTo') == moved and 'items/a1' in data, 'the old copy is kept and marked as moved')
    check(pg.locator('#shop-name').inner_text() == 'Greenlight stationery', 'the upgraded shop opens')
    go('#/stock')
    check('Chalk' in pg.locator('#stock-list').inner_text(), 'its items show in Stock')
    sign_out()
    sign_in(SELLER)
    check(pg.locator('#shop-name').inner_text() == 'Greenlight stationery', 'after the upgrade the seller gets straight in')

    print('\nErrors:', errs or 'none')
    if errs: fails.append('errors')
    b.close()

print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
