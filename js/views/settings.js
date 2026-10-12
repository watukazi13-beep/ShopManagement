import { store } from '../store.js';
import { num } from '../calc.js';
import { esc, icon, toast, field, confirmBox, downloadFile, modal } from '../ui.js';

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

export default {
  title: 'Settings',
  mount(el) {
    const draw = () => {
      const s = store.settings;
      const boss = store.can('settings');
      const owner = store.can('users');
      const members = Object.entries(store.access?.members || {}).sort();
      const notif = 'Notification' in window ? Notification.permission : 'unsupported';
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      el.innerHTML = `
        <div class="page-head"><h1>Settings</h1></div>

        <section class="card">
          <div class="card-head"><h2>Account</h2></div>
          <p>${store.mode === 'local'
            ? '<b>Trial mode.</b> Data is saved on this device only and does not sync. Connect Firebase to sync between devices and share with your team.'
            : `Signed in as <b>${esc(store.user?.email)}</b> · ${esc(roleName(store.role))}`}</p>
          <p class="muted small">${store.online ? (store.pending ? 'Online · uploading changes…' : 'Online · all changes synced') : 'Offline · changes are saved on this device and will sync when you reconnect'}</p>
          <div class="row-btns">
            ${standalone ? '' : `<button class="btn ghost" data-act="install">${icon('download')}Install app</button>`}
            ${notif === 'default' ? `<button class="btn ghost" data-act="notify">Turn on alerts</button>` : ''}
            ${store.mode === 'local' ? `<button class="btn primary" data-act="connect">${icon('cloud')}Connect Firebase</button>` : `<button class="btn ghost" data-act="signout">Sign out</button>`}
          </div>
          ${notif === 'denied' ? '<p class="muted small">Alerts are blocked for this site in your browser settings.</p>' : ''}
        </section>

        ${owner && store.mode !== 'local' ? `
        <section class="card">
          <div class="card-head"><h2>People with access</h2></div>
          <p class="muted small">Only these Google accounts can open your shop. Managers can do everything except manage people. Sellers can only sell and view stock.</p>
          <ul class="rows">
            <li class="row"><div class="grow"><b>${esc(store.access?.ownerEmail || store.user?.email)}</b><small>Owner</small></div></li>
            ${members.map(([email, role]) => `<li class="row"><div class="grow"><b>${esc(email)}</b><small>${esc(roleName(role))}</small></div><button class="icon-btn" data-remove="${esc(email)}" aria-label="Remove ${esc(email)}">${icon('trash')}</button></li>`).join('')}
          </ul>
          <form class="inline-form" id="add-member">
            <input name="email" type="email" required placeholder="their.email@gmail.com" aria-label="Email">
            <select name="role" aria-label="Role"><option value="staff">Seller</option><option value="manager">Manager</option></select>
            <button class="btn primary">Give access</button>
          </form>
        </section>` : ''}

        ${boss ? `
        <form class="card" id="shop-form">
          <div class="card-head"><h2>Shop details</h2></div>
          <p class="muted small">Printed on receipts and quotation requests.</p>
          ${field('Shop name', `<input name="shopName" required value="${esc(s.shopName)}">`)}
          <div class="grid2">
            ${field('Phone', `<input name="phone" type="tel" value="${esc(s.phone)}">`)}
            ${field('Email', `<input name="email" type="email" value="${esc(s.email)}">`)}
          </div>
          <div class="grid2">
            ${field('Address', `<input name="address" value="${esc(s.address)}">`)}
            ${field('TIN', `<input name="tin" value="${esc(s.tin)}">`)}
          </div>
          <h3>Restocking</h3>
          <div class="grid3">
            ${field('Supplier delivery time (days)', `<input name="leadDays" type="number" min="1" value="${s.leadDays}">`, 'Alert early enough to cover this')}
            ${field('Order enough for (days)', `<input name="coverDays" type="number" min="1" value="${s.coverDays}">`, 'After the delivery arrives')}
            ${field('Base sales speed on last (days)', `<input name="windowDays" type="number" min="7" value="${s.windowDays}">`)}
          </div>
          <label class="check"><input type="checkbox" name="autoMonthlyRfq" ${s.autoMonthlyRfq !== false ? 'checked' : ''}> Create quotation requests automatically at the start of each month</label>
          ${field('Message on quotation requests', `<textarea name="rfqNote" rows="2">${esc(s.rfqNote)}</textarea>`)}
          <h3>Lists</h3>
          ${field('Payment methods', `<input name="payMethods" value="${esc((s.payMethods || []).join(', '))}">`, 'Separate with commas')}
          ${field('Expense categories', `<input name="expenseCategories" value="${esc((s.expenseCategories || []).join(', '))}">`, 'Separate with commas')}
          <div class="row-btns"><button class="btn primary">Save settings</button></div>
        </form>

        <section class="card">
          <div class="card-head"><h2>Backup</h2></div>
          <p class="muted small">Download everything loaded on this device (items, suppliers and the last two months of records) as a file.</p>
          <button class="btn ghost" data-act="backup">${icon('download')}Download backup</button>
        </section>` : ''}

        <p class="muted small center">Shop Manager · ${store.mode === 'local' ? 'trial mode' : 'synced with Firebase'}</p>`;

      el.querySelector('#shop-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries());
        const list = (x) => x.split(',').map((t) => t.trim()).filter(Boolean);
        store.saveSettings({
          shopName: v.shopName.trim(), phone: v.phone, email: v.email, address: v.address, tin: v.tin,
          leadDays: num(v.leadDays) || 7, coverDays: num(v.coverDays) || 30, windowDays: num(v.windowDays) || 30,
          autoMonthlyRfq: v.autoMonthlyRfq === 'on', rfqNote: v.rfqNote,
          payMethods: list(v.payMethods).length ? list(v.payMethods) : ['Cash'],
          expenseCategories: list(v.expenseCategories),
        });
        toast('Settings saved');
      });
      el.querySelector('#add-member')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries());
        store.setMember(v.email, v.role);
        toast(`${v.email} can now sign in`);
      });
    };

    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'signout') { if (await confirmBox('Sign out of this device?', { ok: 'Sign out' })) { await store.backend.signOut(); history.replaceState(null, '', '#/home'); location.reload(); } }
      if (a === 'notify') { await Notification.requestPermission(); draw(); }
      if (a === 'backup') downloadFile(`shop-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson(), 'application/json');
      if (a === 'connect') openConnect();
      if (a === 'install') {
        if (installPrompt) { installPrompt.prompt(); installPrompt = null; }
        else modal({
          title: 'Install the app',
          body: `<p><b>Android (Chrome):</b> tap the ⋮ menu, then <b>Add to Home screen</b> or <b>Install app</b>.</p>
                 <p><b>iPhone / iPad (Safari):</b> tap the Share button, then <b>Add to Home Screen</b>.</p>
                 <p><b>Computer (Chrome or Edge):</b> click the install icon at the right end of the address bar.</p>`,
          actions: '<button class="btn primary">OK</button>',
        });
      }
      const rm = e.target.closest('[data-remove]')?.dataset.remove;
      if (rm && await confirmBox(`Remove access for ${rm}?`, { ok: 'Remove', danger: true })) { store.setMember(rm, null); toast('Access removed'); }
    });

    // Don't redraw (and lose typing) while a form has unsaved edits.
    let dirty = false;
    el.addEventListener('input', (e) => { if (e.target.closest('#shop-form')) dirty = true; });
    el.addEventListener('submit', (e) => { if (e.target.id === 'shop-form') dirty = false; });
    draw();
    return { update: () => { if (!dirty) draw(); } };
  },
};

const roleName = (r) => ({ owner: 'Owner', manager: 'Manager', staff: 'Seller' }[r] || r);

export function openConnect() {
  modal({
    title: 'Connect Firebase',
    body: `<p>Paste the <b>firebaseConfig</b> from your Firebase project settings (the part between the curly brackets is enough). The setup guide in the GitHub repository shows where to find it.</p>
      <textarea name="cfg" rows="8" required placeholder='apiKey: "…", authDomain: "…", projectId: "…", …'></textarea>
      <p class="muted small">This saves the connection on this device only. To connect every device at once, put the same values in <code>js/config.js</code> in the repository.</p>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Connect</button>',
    onSubmit: ({ cfg }) => {
      const cfgObj = parseConfig(cfg);
      localStorage.setItem('firebase-config', JSON.stringify(cfgObj));
      localStorage.removeItem('local-mode');
      location.reload();
    },
  });
}

/** Accepts JSON or the JavaScript object Firebase shows ("const firebaseConfig = {...}"). */
export function parseConfig(text) {
  const out = {};
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId']) {
    const m = text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) out[k] = m[1];
  }
  if (!out.apiKey || !out.projectId || !out.appId) throw new Error('That does not look like a Firebase config. It needs apiKey, projectId and appId.');
  if (!out.authDomain) out.authDomain = `${out.projectId}.firebaseapp.com`;
  return out;
}
