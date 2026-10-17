import { store } from './store.js';
import { firebaseConfig } from './config.js';
import { createLocalBackend } from './backend-local.js';
import { esc, icon, toast, modal } from './ui.js';
import { MAKER, AUTHOR, CREDIT, bookLoader } from './brand.js';
import { installApp, isInstalled } from './install.js';
import { applyTheme, shownTheme, toggleTheme } from './theme.js';
import { offerUndo } from './views/changes.js';
import { initTill, lock as lockTill, staffChip } from './views/staff.js';

applyTheme();
import home from './views/home.js';
import sell from './views/sell.js';
import stock from './views/stock.js';
import orders from './views/orders.js';
import money from './views/money.js';
import settings, { openConnect } from './views/settings.js';
import manage, { openCreateShop, openShopSwitcher } from './views/manage.js';

const VIEWS = { home, sell, stock, orders, money, settings, manage };
const NAV = [
  ['home', 'Home', 'home'],
  ['sell', 'Sell', 'sell'],
  ['stock', 'Stock', 'stock'],
  ['orders', 'Orders', 'orders', 'orders'],
  ['money', 'Money', 'money', 'reports'],
  ['manage', 'All shops', 'shops', 'manage'],
];

const root = document.getElementById('app');
let current = null;
let shell = false;

// ---------- Full-screen gates (setup, sign-in, access) ----------
function gate(title, html) {
  shell = false;
  current = null;
  document.body.classList.remove('has-shell');
  root.innerHTML = `<main class="gate">
    <aside class="gate-brand" aria-hidden="true">
      <img class="gate-symbol" src="brand/symbol-on-dark.svg" alt="">
      <div>
        <p class="gate-app">Shop Manager</p>
        <p class="gate-tag">Sales, stock and profit for your shop — on phone, tablet and computer, with or without internet.</p>
      </div>
      <img class="gate-dev" src="brand/developers-logo-on-dark.svg" alt="">
    </aside>
    <section class="gate-main"><div class="gate-card">
      <img class="gate-icon" src="brand/book-icon.svg" alt="" width="52" height="52">
      <h1>${esc(title)}</h1>${html}
      ${isInstalled() ? '' : `<button type="button" class="link install-link" id="g-install">${icon('download')}Install this app on this device</button>`}
      <div class="credit"><img src="brand/developers-logo.svg" alt="Greenlight Developers" class="credit-logo"><p>${esc(CREDIT)}</p></div>
    </div></section></main>`;
  root.querySelector('#g-install')?.addEventListener('click', installApp);
}

function showSetup() {
  gate('Shop Manager', `
    <p>Sell, track stock, and see your monthly profit. Works offline on phone, tablet and computer.</p>
    <button class="btn primary big block" id="g-connect">${icon('cloud')}Connect Firebase</button>
    <button class="btn ghost block" id="g-local">Try it on this device first</button>
    <p class="muted small">Connecting Firebase (free) lets your devices and your team share the same data. See the setup guide in the GitHub repository.</p>`);
  root.querySelector('#g-connect').onclick = openConnect;
  root.querySelector('#g-local').onclick = () => { localStorage.setItem('local-mode', '1'); location.reload(); };
}

function showSignIn(error = '') {
  gate('Shop Manager', `
    <p>Sign in with the Google account the shop owner gave access to.</p>
    <button class="btn primary big block" id="g-signin">Sign in with Google</button>
    ${error ? `<p class="banner bad">${esc(error)}</p>` : ''}
    ${navigator.onLine ? '' : '<p class="banner warn">You are offline. Sign in needs internet the first time on a device.</p>'}`);
  root.querySelector('#g-signin').onclick = async (e) => {
    e.target.disabled = true;
    try { await store.backend.signIn(); } catch (err) { showSignIn(friendly(err)); }
  };
}

function showUpgrade() {
  gate('Upgrade to multiple shops', `
    <p>This version lets you run several shops. Your current shop moves into it as <b>shop 1</b>, with all its items, sales and records. Nothing is lost.</p>
    <p>You (<b>${esc(store.user.email)}</b>) become <b>management</b>: you can create shops and choose their owners.</p>
    <button class="btn primary big block" id="g-up">Upgrade now</button>
    <p class="muted small" id="g-up-msg"></p>`);
  root.querySelector('#g-up').onclick = async (e) => {
    e.target.disabled = true;
    const msg = root.querySelector('#g-up-msg');
    try {
      const r = await store.migrateLegacy((t) => { msg.textContent = t; });
      localStorage.setItem('shop-id', r.id);
      msg.textContent = `Done — ${r.records} records moved.`;
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      msg.textContent = 'The upgrade stopped: ' + friendly(err) + ' Check your internet connection and try again.';
      e.target.disabled = false;
    }
  };
}

function showSetupManagement() {
  gate('Set up Shop Manager', `
    <p>You are the first person here. Signed in as <b>${esc(store.user.email)}</b>.</p>
    <p>Become <b>management</b>? You will create shops and choose who owns and works in each one.</p>
    <button class="btn primary big block" id="g-mgmt">Yes, set me up as management</button>
    <button class="btn ghost block" id="g-out">Use a different account</button>`);
  root.querySelector('#g-mgmt').onclick = async (e) => { e.target.disabled = true; try { await store.claimManagement(); } catch (err) { toast(friendly(err), { kind: 'err' }); e.target.disabled = false; } };
  root.querySelector('#g-out').onclick = signOut;
}

function showFirstShop() {
  gate('Create your first shop', `<p>You are management. Create a shop to start selling — you can add more shops later.</p>
    <button class="btn primary big block" id="g-new">Create a shop</button>`);
  root.querySelector('#g-new').onclick = () => openCreateShop({ onCreated: (id) => switchShop(id) });
}

function showShopPicker() {
  gate('Choose a shop', `
    <div class="pick-list">${store.shops.map((s) => `<button class="btn ghost block" data-shop="${s.id}">${icon('shops')}${esc(s.name)}<small>${esc(roleName(store.roleIn(s)))}</small></button>`).join('')}</div>
    ${store.isAdmin ? `<button class="btn primary block" id="g-new">${icon('plus')}Create a shop</button>` : ''}`);
  root.querySelectorAll('[data-shop]').forEach((b) => { b.onclick = () => switchShop(b.dataset.shop); });
  root.querySelector('#g-new')?.addEventListener('click', () => openCreateShop({ onCreated: (id) => switchShop(id) }));
}
const roleName = (r) => ({ owner: 'Owner', manager: 'Manager', staff: 'Seller' }[r] || '');

/** Open another shop: everything reloads for that shop. */
export function switchShop(id) {
  localStorage.setItem('shop-id', id);
  history.replaceState(null, '', '#/home');
  location.reload();
}

function showNoAccess() {
  gate('No access yet', `
    <p><b>${esc(store.user?.email)}</b> has not been given access to a shop.</p>
    <p>Ask the shop owner to add this email in <b>Settings → People with access</b>, then tap Check again.</p>
    <button class="btn primary block" id="g-retry">Check again</button>
    <button class="btn ghost block" id="g-out">Sign in with another account</button>`);
  root.querySelector('#g-retry').onclick = () => location.reload();
  root.querySelector('#g-out').onclick = signOut;
}

function showWaiting(text) {
  // Keep the same book running if it is already on screen; just change the words.
  const line = root.querySelector('.splash .splash-text');
  if (line) { line.textContent = text; return; }
  root.innerHTML = bookLoader(text);
}

async function signOut() {
  await store.backend.signOut();
  history.replaceState(null, '', '#/home');
  location.reload();
}

function friendly(err) {
  const c = err?.code || '';
  if (c.includes('popup-closed')) return 'Sign-in was closed before finishing.';
  if (c.includes('network')) return 'No internet connection. Connect and try again.';
  if (c.includes('unauthorized-domain')) return 'This web address is not allowed in Firebase yet. Add it under Authentication → Settings → Authorized domains.';
  if (c.includes('operation-not-allowed')) return 'Google sign-in is not turned on in Firebase (Authentication → Sign-in method).';
  return err?.message || String(err);
}

// ---------- App shell ----------
function showShell() {
  shell = true;
  document.body.classList.add('has-shell');
  const links = NAV.filter(([, , , perm]) => !perm || store.can(perm));
  root.innerHTML = `
    <header class="topbar">
      <a href="#/home" class="brand" id="brand"><img class="brand-icon" src="brand/book-icon.svg" alt="" width="32" height="32"><span class="brand-text"><span id="shop-name"></span><small class="brand-sub">Shop Manager</small></span><span id="shop-caret"></span></a>
      <span class="sync" id="sync" role="status"></span>
      <span id="staff-slot"></span>
      <button type="button" class="icon-btn theme-btn" id="theme-btn"></button>
      <a href="#/settings" class="icon-btn" aria-label="Settings">${icon('settings')}</a>
    </header>
    <nav class="nav" aria-label="Main">
      <a href="#/home" class="nav-brand" tabindex="-1" aria-hidden="true"><img src="brand/symbol-on-dark.svg" alt="" width="30" height="30"><span>Shop Manager</span></a>
      ${links.map(([id, label, ic]) => `<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${label}</span></a>`).join('')}
      <a href="#/settings" data-nav="settings" class="nav-settings">${icon('settings')}<span>Settings</span></a>
      <div class="nav-credit"><span>Developed by</span><img src="brand/developers-logo-on-dark.svg" alt="${esc(MAKER)}"><span>Author: ${esc(AUTHOR)}</span></div>
    </nav>
    <main id="view" class="view" tabindex="-1"></main>`;
  const themeBtn = document.getElementById('theme-btn');
  const paintThemeBtn = () => {
    const dark = shownTheme() === 'dark';
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = dark ? 'Light theme' : 'Dark theme';
  };
  themeBtn.addEventListener('click', toggleTheme);
  document.addEventListener('themechange', paintThemeBtn);
  paintThemeBtn();
  document.getElementById('brand').addEventListener('click', (e) => {
    if (store.mode === 'firebase' && (store.shops.length > 1 || store.isAdmin)) { e.preventDefault(); openShopSwitcher(switchShop); }
  });
  route();
  paintChrome();
}

function paintChrome() {
  if (!shell) return;
  document.getElementById('shop-name').textContent = store.settings.shopName || store.shop?.name || 'My Shop';
  document.getElementById('shop-caret').innerHTML = store.mode === 'firebase' && (store.shops.length > 1 || store.isAdmin) ? icon('down', 'caret') : '';
  document.title = store.settings.shopName || 'Shop Manager';
  const sync = document.getElementById('sync');
  const [cls, text] = store.mode === 'local' ? ['local', 'This device only']
    : !store.online ? ['off', 'Offline']
      : store.pending ? ['busy', 'Syncing…'] : ['on', 'Synced'];
  sync.className = `sync ${cls}`;
  sync.innerHTML = `<i></i><span>${text}</span>`;
  const slot = document.getElementById('staff-slot');
  if (slot) {
    const chip = staffChip();
    if (slot.innerHTML !== chip) { slot.innerHTML = chip; slot.querySelector('#staff-chip')?.addEventListener('click', lockTill); }
  }
  const lows = store.ready ? store.lowStock().length : 0;
  const stockLink = document.querySelector('[data-nav=stock]');
  if (stockLink) stockLink.dataset.badge = lows ? String(lows) : '';
}

function route() {
  if (!shell) return;
  const [path, qs] = (location.hash.slice(2) || 'home').split('?');
  const name = VIEWS[path] ? path : 'home';
  const allowed = NAV.find(([id]) => id === name)?.[3];
  const view = allowed && !store.can(allowed) ? 'home' : name;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));
  // A fresh element per screen so event listeners from the last screen are dropped.
  const old = document.getElementById('view');
  const el = document.createElement('main');
  el.id = 'view';
  el.tabIndex = -1;
  el.className = `view view-${view}`;
  old.replaceWith(el);
  current?.destroy?.();
  current = VIEWS[view].mount(el, new URLSearchParams(qs || '')) || null;
  el.scrollTop = 0;
  window.scrollTo(0, 0);
}

// A different person unlocked the shared till: rebuild the menu for their role.
window.addEventListener('staff-change', () => { if (shell) showShell(); });

// Right after an import, delivery, count or deletion, the message offers "Undo".
window.addEventListener('shop:change', (e) => { if (shell) offerUndo(e.detail); });

let frame = 0;
store.subscribe(() => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paintChrome();
    current?.update?.();
  });
});

// Tab switches inside a page use history.replaceState, which doesn't fire this.
window.addEventListener('hashchange', () => {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  route();
});
window.addEventListener('online', () => { store.online = true; store.emit(); });
window.addEventListener('offline', () => { store.online = false; store.emit(); });
window.addEventListener('app-alert', (e) => toast(`${e.detail.title}: ${e.detail.body}`, { kind: 'warn', link: e.detail.link, ms: 5000 }));

// ---------- New versions ----------
/**
 * The app checks for a new version when it opens, when you come back to it and every 30 minutes.
 * When one has been downloaded it switches over by itself — unless you are in the middle of something
 * (a form or dialog open), then the message offers "Update now".
 */
function setupUpdates() {
  const hadOld = !!navigator.serviceWorker.controller;
  let reloading = false;
  const busy = () => !!document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const reload = () => { if (reloading) return; reloading = true; location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOld) return; // first install: this page is already the newest
    if (!busy()) { toast('Updating to the new version…'); setTimeout(reload, 600); return; }
    toast('A new version of the app is ready', { ms: 60000, action: { label: 'Update now', fn: reload, ms: 60000 } });
    const later = () => { if (!busy()) reload(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') later(); });
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('online', check);
    setInterval(check, 30 * 60 * 1000);
  }).catch((e) => console.warn('SW', e));
}

// ---------- Start ----------
async function boot() {
  if ('serviceWorker' in navigator) setupUpdates();

  let cfg = firebaseConfig?.apiKey ? firebaseConfig : null;
  if (!cfg) { try { cfg = JSON.parse(localStorage.getItem('firebase-config') || 'null'); } catch { cfg = null; } }
  if (!cfg && localStorage.getItem('local-mode') !== '1') return showSetup();

  showWaiting('Opening your shop…');
  if (cfg) {
    try {
      const { createFirebaseBackend } = await import('./backend-firebase.js');
      store.backend = await createFirebaseBackend(cfg);
    } catch (e) {
      console.error(e);
      gate('Could not start', `<p>The app could not load its sync library. ${navigator.onLine ? 'Check the Firebase settings.' : 'Connect to the internet once so the app can finish installing.'}</p>
        <p class="muted small">${esc(e.message)}</p><button class="btn primary block" onclick="location.reload()">Try again</button>`);
      return;
    }
  } else {
    store.backend = createLocalBackend();
  }
  store.mode = store.backend.mode;

  store.backend.onError((e) => {
    console.error(e);
    if (e?.code === 'permission-denied') toast('You do not have permission to make that change', { kind: 'err' });
    else toast(friendly(e), { kind: 'err' });
  });

  if (store.mode === 'local') startTrialMode();
  else startSyncedMode();

  let checked = false;
  store.subscribe(() => {
    if (store.ready && shell) initTill(); // shared till: ask who is selling
    if (!checked && store.ready && shell) {
      checked = true;
      setTimeout(() => store.dailyLowStockCheck(), 2000);
      offerTrialData();
    }
  });
}

/** Trial mode: one shop on this device, the user is its owner. */
function startTrialMode() {
  store.backend.onUser((user) => {
    store.user = user;
    store.backend.watchAccess(() => {
      store.role = 'owner';
      store.startData();
      showShell();
    });
  });
}

/**
 * Synced mode: management (platform/admins) → the shops this person may open →
 * the chosen shop. Every step is live, so changes made elsewhere apply at once.
 */
function startSyncedMode() {
  let subs = [];
  let shopsUnsub = null;
  let watchingAsAdmin = null;
  const stop = () => { subs.forEach((u) => u()); subs = []; shopsUnsub?.(); shopsUnsub = null; watchingAsAdmin = null; };

  store.backend.onUser((user) => {
    stop();
    if (!user) { store.user = null; return showSignIn(); }
    store.user = user;
    showWaiting('Checking access…');
    subs.push(store.backend.watchDoc('/platform', 'admins', (adm, fromCache) => {
      if (!adm && fromCache && navigator.onLine) return; // wait for the server
      store.admins = adm;
      store.isAdmin = !!adm?.admins?.[user.email];
      if (!adm) { if (fromCache) return showWaiting('Connect to the internet to finish setting up.'); return noManagementYet(); }
      if (watchingAsAdmin !== store.isAdmin) watchShops();
      else store.emit();
    }, (e) => showSignIn(friendly(e))));
  });

  async function noManagementYet() {
    // A shop from the single-shop version may exist at the top of the database.
    let legacy = null;
    try { legacy = await store.backend.getDoc('/meta', 'access'); } catch (e) {
      if (e?.code === 'permission-denied') return showNoAccess(); // it exists, but this person is not its owner
    }
    if (legacy && !legacy.migratedTo) return legacy.owner === store.user.uid ? showUpgrade() : showNoAccess();
    return showSetupManagement();
  }

  function watchShops() {
    shopsUnsub?.();
    watchingAsAdmin = store.isAdmin;
    const cond = store.isAdmin ? null : ['memberEmails', 'array-contains', store.user.email];
    shopsUnsub = store.backend.watchQuery('/shops', cond, (shops, fromCache) => {
      store.shops = shops.sort((a, b) => a.name.localeCompare(b.name));
      if (store.migrating) return; // the upgrade reloads the app when it is done
      if (!shops.length && fromCache && navigator.onLine) return;
      if (store.shop) return refreshOpenShop();
      if (!shops.length) return store.isAdmin ? showFirstShop() : showNoAccess();
      const saved = localStorage.getItem('shop-id');
      const pick = shops.find((s) => s.id === saved) || (shops.length === 1 ? shops[0] : null);
      if (!pick) return showShopPicker();
      openShop(pick);
    }, (e) => (e?.code === 'permission-denied' ? showNoAccess() : showSignIn(friendly(e))));
  }

  function openShop(shop) {
    const role = store.roleIn(shop);
    if (!role) return showNoAccess();
    localStorage.setItem('shop-id', shop.id);
    store.shop = shop;
    store.role = role;
    store.backend.setShop(shop.id);
    store.startData();
    showShell();
  }

  /** The open shop's people changed (or management did): update the role, or lock out. */
  function refreshOpenShop() {
    const fresh = store.shops.find((s) => s.id === store.shop.id);
    const role = store.roleIn(fresh);
    if (!fresh || !role) { store.shop = null; return showNoAccess(); }
    const changed = role !== store.role;
    store.shop = fresh;
    store.role = role;
    if (changed) showShell(); else store.emit();
  }
}

/** After switching from trial mode to Firebase, offer to bring the trial data across. */
function offerTrialData() {
  if (store.mode !== 'firebase' || store.role !== 'owner') return;
  let local;
  try { local = JSON.parse(localStorage.getItem('shop-local-data-v1') || 'null'); } catch { local = null; }
  const n = Object.keys(local?.items || {}).length;
  if (!n) return;
  if (store.data.items.length) { localStorage.setItem('shop-local-data-v1-old', localStorage.getItem('shop-local-data-v1')); localStorage.removeItem('shop-local-data-v1'); return; }
  modal({
    title: 'Bring over your trial data?',
    body: `<p>You entered <b>${n} item${n > 1 ? 's' : ''}</b> and other records while trying the app on this device. Copy them into your synced shop so every device sees them?</p>`,
    actions: '<button class="btn ghost" value="cancel">Start fresh</button><button class="btn primary">Copy my data</button>',
    onSubmit: () => {
      const count = store.importTrialData(local);
      toast(`Copied ${count} records to your shop`);
    },
    onClose: () => {
      localStorage.setItem('shop-local-data-v1-old', JSON.stringify(local));
      localStorage.removeItem('shop-local-data-v1');
    },
  });
}

boot();
