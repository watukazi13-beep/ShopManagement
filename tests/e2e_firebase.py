"""Tests the synced (Firebase) path with a stand-in Firebase: setup, sign-in, owner claim,
giving access, a stranger being refused, and a seller's limited view.
Run with the app served on :8765:  python3 tests/e2e_firebase.py
"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('APP_URL', 'http://localhost:8765/')
FAKE = Path(__file__).parent / 'fake-firebase'
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

OWNER = {'uid': 'u-owner', 'email': 'owner@gmail.com', 'name': 'Asha Owner'}
SELLER = {'uid': 'u-seller', 'email': 'seller@gmail.com', 'name': 'Juma Seller'}
STRANGER = {'uid': 'u-x', 'email': 'stranger@gmail.com', 'name': 'Someone'}
CONFIG_PASTE = '''const firebaseConfig = {
  apiKey: "AIzaFAKE123",
  authDomain: "my-shop-123.firebaseapp.com",
  projectId: "my-shop-123",
  storageBucket: "my-shop-123.appspot.com",
  messagingSenderId: "1234",
  appId: "1:1234:web:abcd"
};'''

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    def serve(route):
        name = route.request.url.rsplit('/', 1)[-1]
        route.fulfill(status=200, body=(FAKE / name).read_text(), headers={'content-type': 'text/javascript', 'access-control-allow-origin': '*'})
    ctx.route('https://www.gstatic.com/firebasejs/**', serve)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'permission' not in m.text.lower() else None)
    def fs(): return pg.evaluate("JSON.parse(localStorage.getItem('fake-fs')||'{}')")
    def next_user(u): pg.evaluate(f"localStorage.setItem('fake-next-user', {json.dumps(json.dumps(u))})")
    def dlg(): return pg.locator('dialog[open]').last
    def sign_in(u):
        next_user(u); pg.click('#g-signin'); pg.wait_for_timeout(600)
    def sign_out():
        pg.evaluate("location.hash='#/settings'"); pg.wait_for_timeout(300)
        pg.click('[data-act=signout]'); pg.wait_for_timeout(200)
        dlg().get_by_role('button', name='Sign out', exact=True).click(); pg.wait_for_timeout(900)

    pg.goto(URL); pg.wait_for_timeout(500)
    # Start in trial mode and add one item, to test moving trial data into the synced shop.
    pg.click('#g-local'); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#/stock?new=1'"); pg.wait_for_timeout(400)
    d = dlg(); d.locator('[name=name]').fill('Trial item'); d.locator('[name=price]').fill('500'); d.locator('[name=stock]').fill('7')
    d.get_by_role('button', name='Add item').click(); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#/settings'"); pg.wait_for_timeout(300)
    check(pg.locator('[data-act=connect]').count() == 1, 'trial mode offers Connect Firebase in Settings')
    pg.evaluate("localStorage.removeItem('local-mode'); location.hash='#/home'"); pg.reload(); pg.wait_for_timeout(600)
    check(pg.locator('#g-connect').count() == 1, 'setup screen offers Connect Firebase')
    pg.click('#g-connect'); dlg().locator('textarea').fill('nonsense'); dlg().get_by_role('button', name='Connect').click(); pg.wait_for_timeout(200)
    check(pg.locator('.toast-err').count() == 1, 'invalid config is rejected with a message')
    dlg().locator('textarea').fill(CONFIG_PASTE); dlg().get_by_role('button', name='Connect').click(); pg.wait_for_timeout(1200)
    cfg = json.loads(pg.evaluate("localStorage.getItem('firebase-config')"))
    check(cfg['projectId'] == 'my-shop-123' and cfg['appId'] == '1:1234:web:abcd', 'pasted Firebase config parsed and saved')
    check(pg.locator('#g-signin').count() == 1, 'sign-in screen shown')

    # Owner claims the shop
    sign_in(OWNER)
    check(pg.locator('#g-claim').count() == 1, 'first user is offered to become owner')
    pg.click('#g-claim'); pg.wait_for_timeout(900)
    check(fs().get('meta/access', {}).get('owner') == 'u-owner', 'owner recorded in access list')
    check(pg.locator('[data-nav=money]').count() == 1 and pg.locator('[data-nav=orders]').count() == 1, 'owner sees all sections')
    check(pg.locator('#sync').inner_text() == 'Synced', 'sync status shows Synced')
    pg.wait_for_timeout(400)
    check('Bring over your trial data' in dlg().inner_text(), 'owner is offered the trial data')
    dlg().get_by_role('button', name='Copy my data').click(); pg.wait_for_timeout(500)
    check(any(v.get('name') == 'Trial item' and v.get('stock') == 7 for k, v in fs().items() if k.startswith('items/')), 'trial item copied into the synced shop')
    pg.reload(); pg.wait_for_timeout(1200)
    check(pg.locator('dialog[open]').count() == 0, 'trial data offer not repeated')

    # Owner adds an item and gives a seller access
    pg.evaluate("location.hash='#/stock?new=1'"); pg.wait_for_timeout(400)
    d = dlg(); d.locator('[name=name]').fill('Unga 2kg'); d.locator('[name=price]').fill('4000'); d.locator('[name=cost]').fill('3200'); d.locator('[name=stock]').fill('10'); d.locator('[name=minStock]').fill('3')
    d.get_by_role('button', name='Add item').click(); pg.wait_for_timeout(500)
    items = [v for k, v in fs().items() if k.startswith('items/')]
    check(any(i['name'] == 'Unga 2kg' and i['stock'] == 10 for i in items), 'item saved to Firestore')
    pg.evaluate("location.hash='#/settings'"); pg.wait_for_timeout(400)
    pg.fill('#add-member [name=email]', 'Seller@Gmail.com'); pg.select_option('#add-member [name=role]', 'staff')
    pg.click('#add-member button'); pg.wait_for_timeout(500)
    check(fs()['meta/access']['members'] == {'seller@gmail.com': 'staff'}, 'seller added (email stored in lower case)')
    pg.evaluate("location.hash='#/settings'"); pg.wait_for_timeout(300)
    check('seller@gmail.com' in pg.locator('main').inner_text(), 'seller listed under People with access')
    sign_out()
    check(pg.locator('#g-signin').count() == 1, 'owner signed out')

    # A stranger is refused
    sign_in(STRANGER)
    check('No access yet' in pg.locator('h1').inner_text(), 'stranger sees “No access yet”')
    check(not any(k.startswith('items/') for k in []) and pg.locator('[data-nav]').count() == 0, 'stranger cannot reach any screen')
    pg.click('#g-out'); pg.wait_for_timeout(900)

    # The seller gets a limited app
    sign_in(SELLER)
    if os.environ.get('SHOTS'): pg.screenshot(path=os.environ['SHOTS'] + 'fb-seller.png')
    navs = pg.locator('[data-nav]').evaluate_all('els => els.map(e => e.dataset.nav)')
    check(navs == ['home', 'sell', 'stock', 'settings'], f'seller sees only Home, Sell, Stock (+Settings): {navs}')
    check(pg.locator('.stats').count() == 0 and 'gross profit' not in pg.locator('.hero-sub').inner_text(), 'seller does not see profit figures')
    pg.evaluate("location.hash='#/money'"); pg.wait_for_timeout(300)
    check(pg.locator('.hero').count() == 1, 'seller sent back to Home when opening Money')
    pg.evaluate("location.hash='#/stock'"); pg.wait_for_timeout(300)
    check(pg.locator('[data-act=new]').count() == 0 and 'Cost' not in pg.locator('thead').inner_text(), 'seller cannot add items or see cost')
    pg.evaluate("location.hash='#/sell'"); pg.wait_for_timeout(300)
    pg.locator('.tile', has_text='Unga').click(); pg.locator('.tile', has_text='Unga').click()
    pg.click('#cart-bar'); pg.wait_for_timeout(200)
    pg.locator('[data-price]').first.click(); pg.wait_for_timeout(200)
    check(pg.locator('dialog[open]').count() == 0, 'seller cannot change the price')
    pg.click('[data-charge]'); pg.wait_for_timeout(200)
    check(dlg().locator('[name=discount]').count() == 0, 'seller cannot give discounts')
    dlg().get_by_role('button', name='Complete sale').click(); pg.wait_for_timeout(600)
    check(dlg().locator('[data-void]').count() == 0, 'seller cannot cancel a sale')
    dlg().get_by_role('button', name='Next sale').click(); pg.wait_for_timeout(200)
    data = fs()
    sales = [v for k, v in data.items() if k.startswith('sales/')]
    item = [v for k, v in data.items() if k.startswith('items/') and v['name'] == 'Unga 2kg'][0]
    check(len(sales) == 1 and sales[0]['by'] == 'seller@gmail.com' and sales[0]['total'] == 8000, 'seller sale saved under their email')
    check(item['stock'] == 8, 'seller sale reduced stock (allowed field only)')
    denied = pg.evaluate('window.__fsDenied')
    check(denied == [], f'no writes refused by the rules during normal seller use: {denied}')
    sign_out()

    # Owner sees the seller's sale and the profit
    sign_in(OWNER)
    check('8,000' in pg.locator('.hero-figure').inner_text(), 'owner sees today’s sales including the seller’s')
    check('1,600' in pg.locator('.hero-sub').inner_text(), 'owner sees gross profit TSh 1,600')
    # Owner removes the seller
    pg.evaluate("location.hash='#/settings'"); pg.wait_for_timeout(300)
    pg.locator('[data-remove="seller@gmail.com"]').click(); pg.wait_for_timeout(200)
    dlg().get_by_role('button', name='Remove', exact=True).click(); pg.wait_for_timeout(400)
    check(fs()['meta/access']['members'] == {}, 'seller access removed')
    sign_out()
    sign_in(SELLER)
    check('No access yet' in pg.locator('h1').inner_text(), 'removed seller is locked out')

    print('\nErrors:', errs or 'none')
    if errs: fails.append('errors')
    b.close()

print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
