import { store } from './store.js';
import { firebaseConfig } from './config.js';
import { createLocalBackend } from './backend-local.js';
import { esc, icon, toast, modal } from './ui.js';
import home from './views/home.js';
import sell from './views/sell.js';
import stock from './views/stock.js';
import orders from './views/orders.js';
import money from './views/money.js';
import settings, { openConnect } from './views/settings.js';

const VIEWS = { home, sell, stock, orders, money, settings };
const NAV = [
  ['home', 'Home', 'home'],
  ['sell', 'Sell', 'sell'],
  ['stock', 'Stock', 'stock'],
  ['orders', 'Orders', 'orders', 'orders'],
  ['money', 'Money', 'money', 'reports'],
];

const root = document.getElementById('app');
let current = null;
let shell = false;

// ---------- Full-screen gates (setup, sign-in, access) ----------
function gate(title, html) {
  shell = false;
  current = null;
  document.body.classList.remove('has-shell');
  root.innerHTML = `<main class="gate"><div class="gate-card">
    <div class="logo">${icon('stock')}</div>
    <h1>${esc(title)}</h1>${html}</div></main>`;
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

function showClaim() {
  gate('Set up your shop', `
    <p>No one owns this shop yet. Signed in as <b>${esc(store.user.email)}</b>.</p>
    <p>Make this account the owner? You can then give access to other people from Settings.</p>
    <button class="btn primary big block" id="g-claim">Yes, I am the owner</button>
    <button class="btn ghost block" id="g-out">Use a different account</button>`);
  root.querySelector('#g-claim').onclick = () => { store.claimShop(); };
  root.querySelector('#g-out').onclick = signOut;
}

function showNoAccess() {
  gate('No access yet', `
    <p><b>${esc(store.user?.email)}</b> is not allowed into this shop.</p>
    <p>Ask the owner to add this email in <b>Settings → People with access</b>, then open the app again.</p>
    <button class="btn primary block" id="g-retry">Check again</button>
    <button class="btn ghost block" id="g-out">Sign in with another account</button>`);
  root.querySelector('#g-retry').onclick = () => location.reload();
  root.querySelector('#g-out').onclick = signOut;
}

function showWaiting(text) {
  gate('Shop Manager', `<p class="loading">${esc(text)}</p>`);
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
      <a href="#/home" class="brand"><span class="logo sm">${icon('stock')}</span><span id="shop-name"></span></a>
      <span class="sync" id="sync" role="status"></span>
      <a href="#/settings" class="icon-btn" aria-label="Settings">${icon('settings')}</a>
    </header>
    <nav class="nav" aria-label="Main">
      ${links.map(([id, label, ic]) => `<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${label}</span></a>`).join('')}
      <a href="#/settings" data-nav="settings" class="nav-settings">${icon('settings')}<span>Settings</span></a>
    </nav>
    <main id="view" class="view" tabindex="-1"></main>`;
  route();
  paintChrome();
}

function paintChrome() {
  if (!shell) return;
  document.getElementById('shop-name').textContent = store.settings.shopName || 'My Shop';
  document.title = store.settings.shopName || 'Shop Manager';
  const sync = document.getElementById('sync');
  const [cls, text] = store.mode === 'local' ? ['local', 'This device only']
    : !store.online ? ['off', 'Offline']
      : store.pending ? ['busy', 'Syncing…'] : ['on', 'Synced'];
  sync.className = `sync ${cls}`;
  sync.innerHTML = `<i></i><span>${text}</span>`;
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
  current = VIEWS[view].mount(el, new URLSearchParams(qs || '')) || null;
  el.scrollTop = 0;
  window.scrollTo(0, 0);
}

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

// ---------- Start ----------
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));

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

  let started = false;
  let accessUnsub = null;
  store.backend.onUser((user) => {
    accessUnsub?.();
    if (!user) { store.user = null; return showSignIn(); }
    store.user = user;
    showWaiting('Checking access…');
    accessUnsub = store.backend.watchAccess(
      (acc, fromCache) => {
        store.access = acc;
        if (!acc) {
          if (fromCache && navigator.onLine) return; // wait for the server answer
          if (fromCache) return showWaiting('Connect to the internet to finish setting up.');
          return showClaim();
        }
        const role = acc.owner === user.uid ? 'owner' : acc.members?.[user.email];
        if (!role) return showNoAccess();
        const changed = store.role && store.role !== role;
        store.role = role;
        if (changed) { showShell(); return; }
        if (!started) { started = true; store.startData(); }
        if (!shell) showShell();
        store.emit();
      },
      (e) => {
        if (e?.code === 'permission-denied') showNoAccess();
        else showSignIn(friendly(e));
      },
    );
  });

  let checked = false;
  store.subscribe(() => {
    if (!checked && store.ready && shell) {
      checked = true;
      setTimeout(() => store.dailyLowStockCheck(), 2000);
      offerTrialData();
    }
  });
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
