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
    navs = pg.locator('[data-nav]').evaluate_all('els => els.map(e => e.dataset.nav)')
    check(navs == ['home', 'sell', 'stock', 'settings'], f'seller sees only Home, Sell, Stock (+Settings): {navs}')
    check(pg.locator('.stats').count() == 0 and 'gross profit' not in pg.locator('.hero-sub').inner_text(), 'seller does not see profit figures')
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
    denied = pg.evaluate('window.__fsDenied')
    check(denied == [], f'no writes refused by the rules during normal seller use: {denied}')
    sign_out()

    # ---------- Management sees the sale; lets sellers receive; seller receives ----------
    sign_in(BOSS)
    if pg.locator('#shop-name').inner_text() != 'Greenlight Main':
        pg.click('#brand'); pg.wait_for_timeout(250); dlg().locator('[data-pick]', has_text='Main').click(); pg.wait_for_timeout(1500)
    check('8,000' in pg.locator('.hero-figure').inner_text(), 'management sees today’s sales including the seller’s')
    check('1,600' in pg.locator('.hero-sub').inner_text(), 'and the gross profit TSh 1,600')
    go('#/settings')
    pg.check('#shop-form [name=staffCanReceive]'); pg.click('#shop-form button.primary'); pg.wait_for_timeout(400)
    check(fs()[f'shops/{main}/meta/settings'].get('staffCanReceive') is True, 'sellers allowed to receive deliveries')
    sign_out(); sign_in(SELLER)
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
