// Management: every shop side by side, creating shops, and who is management.
import { store } from '../store.js';
import { esc, fmt, icon, modal, toast, field, confirmBox, emptyState } from '../ui.js';

const summaries = new Map(); // shopId → figures, kept for this visit

export function switchShop(id) {
  localStorage.setItem('shop-id', id);
  history.replaceState(null, '', '#/home');
  location.reload();
}

export default {
  title: 'All shops',
  mount(el) {
    let loading = false;
    el.innerHTML = `
      <div class="page-head"><h1>All shops</h1>
        <div class="head-actions">
          <button class="btn ghost" data-act="refresh">Refresh figures</button>
          <button class="btn primary" data-act="new-shop">${icon('plus')}Create shop</button>
        </div>
      </div>
      <div id="mg-totals"></div>
      <div id="mg-shops"></div>
      <section class="card" id="mg-admins"></section>`;
    const totalsEl = el.querySelector('#mg-totals');
    const shopsEl = el.querySelector('#mg-shops');
    const adminsEl = el.querySelector('#mg-admins');

    const load = async (force = false) => {
      if (loading) return;
      loading = true;
      await Promise.all(store.shops.map(async (s) => {
        if (summaries.has(s.id) && !force) return;
        try { summaries.set(s.id, await store.shopSummary(s.id)); } catch (e) { summaries.set(s.id, { error: e.message }); }
        draw();
      }));
      loading = false;
      draw();
    };

    const draw = () => {
      const shops = store.shops;
      const ready = shops.map((s) => summaries.get(s.id)).filter((x) => x && !x.error);
      const sum = (f) => ready.reduce((t, x) => t + f(x), 0);
      totalsEl.innerHTML = shops.length ? `<div class="stats compact">
        <div><span>Shops</span><strong>${shops.length}</strong></div>
        <div><span>Sold today (all)</span><strong>${fmt(sum((x) => x.today.revenue))}</strong></div>
        <div><span>Sales this month</span><strong>${fmt(sum((x) => x.month.revenue))}</strong></div>
        <div><span>Net profit this month</span><strong>${fmt(sum((x) => x.month.netProfit))}</strong></div>
        <div><span>Stock value (cost)</span><strong>${fmt(sum((x) => x.stock.cost))}</strong></div>
        <div class="${sum((x) => x.lows) ? 'warn' : ''}"><span>Items needing restock</span><strong>${sum((x) => x.lows)}</strong></div>
      </div>` : '';
      shopsEl.innerHTML = shops.length ? `<table class="table mg-table">
        <thead><tr><th>Shop</th><th class="r">Today</th><th class="r hide-sm">This month</th><th class="r hide-sm">Net profit</th><th class="r hide-sm">Stock value</th><th class="r hide-sm">Restock</th><th></th></tr></thead>
        <tbody>${shops.map((s) => {
          const x = summaries.get(s.id);
          const cell = (f) => (!x ? '<span class="muted">…</span>' : x.error ? '<span class="muted">—</span>' : f(x));
          return `<tr>
            <td><b>${esc(s.name)}</b><small>${esc((s.owners || []).join(', ') || 'No owner')}${s.id === store.shop?.id ? ' · open now' : ''}</small></td>
            <td class="r num">${cell((v) => fmt(v.today.revenue))}</td>
            <td class="r num hide-sm">${cell((v) => fmt(v.month.revenue))}</td>
            <td class="r num hide-sm">${cell((v) => `<span class="${v.month.netProfit < 0 ? 'neg' : ''}">${fmt(v.month.netProfit)}</span>`)}</td>
            <td class="r num hide-sm">${cell((v) => fmt(v.stock.cost))}</td>
            <td class="r num hide-sm">${cell((v) => (v.lows ? `<span class="warn-text">${v.lows}</span>` : '0'))}</td>
            <td class="r">${s.id === store.shop?.id ? '' : `<button class="btn ghost small" data-open="${s.id}">Open</button>`}</td>
          </tr>`;
        }).join('')}</tbody></table>` : emptyState('No shops yet', 'Create your first shop and choose its owner.');
      const admins = Object.keys(store.admins?.admins || {}).sort();
      adminsEl.innerHTML = `
        <div class="card-head"><h2>Management</h2></div>
        <p class="muted small">Management can create shops, choose owners and open every shop.</p>
        <ul class="rows">${admins.map((a) => `<li class="row"><div class="grow"><b>${esc(a)}</b>${a === store.user.email ? '<small>you</small>' : ''}</div>${a === store.user.email ? '' : `<button class="icon-btn" data-rm-admin="${esc(a)}" aria-label="Remove ${esc(a)}">${icon('trash')}</button>`}</li>`).join('')}</ul>
        <form class="inline-form" id="add-admin">
          <input name="email" type="email" required placeholder="name@gmail.com" aria-label="Email">
          <button class="btn primary">Add to management</button>
        </form>`;
    };

    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'refresh') { summaries.clear(); draw(); load(true); }
      if (a === 'new-shop') openCreateShop({ onCreated: () => { toast('Shop created'); load(); } });
      const open = e.target.closest('[data-open]')?.dataset.open;
      if (open) switchShop(open);
      const rm = e.target.closest('[data-rm-admin]')?.dataset.rmAdmin;
      if (rm && await confirmBox(`Remove ${rm} from management?`, { ok: 'Remove', danger: true })) {
        try { await store.setAdmin(rm, false); toast('Removed from management'); } catch (err) { toast(err.message, { kind: 'err' }); }
      }
    });
    el.addEventListener('submit', async (e) => {
      if (e.target.id !== 'add-admin') return;
      e.preventDefault();
      const email = new FormData(e.target).get('email');
      try { await store.setAdmin(String(email), true); toast(`${email} added to management`); e.target.reset(); } catch (err) { toast(err.message, { kind: 'err' }); }
    });

    draw();
    load();
    return { update: () => { draw(); if (store.shops.some((s) => !summaries.has(s.id))) load(); } };
  },
};

/** Management: create a shop, choose its owner, optionally copy an item list. */
export function openCreateShop({ onCreated } = {}) {
  const others = store.shops;
  modal({
    title: 'Create a shop',
    body: `
      ${field('Shop name', '<input name="name" required autofocus placeholder="e.g. Greenlight Stationeries — Kisesa">')}
      ${field('Owner’s email', `<input name="owner" type="email" required value="${esc(store.user?.email || '')}">`, 'They sign in with this Google account. The owner adds the shop’s managers and sellers.')}
      ${others.length ? field('Start with the items of', `<select name="copyFrom"><option value="">— Start empty —</option>${others.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`, 'Names, prices, costs and min/max levels are copied. Stock starts at 0.') : ''}
      <p class="muted small" id="cs-msg"></p>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Create shop</button>',
    onSubmit: (v, { form, close }) => {
      const btn = form.querySelector('.sheet-foot .btn.primary');
      btn.disabled = true;
      form.querySelector('#cs-msg').textContent = 'Creating…';
      store.createShop({ name: v.name, ownerEmail: v.owner, copyFrom: v.copyFrom || '' })
        .then((id) => { close(); onCreated?.(id); })
        .catch((err) => { btn.disabled = false; form.querySelector('#cs-msg').textContent = err.message; });
      return false;
    },
  });
}

/** Shop switcher (top bar): open another shop, or go to management. */
export function openShopSwitcher(onPick = switchShop) {
  const roleName = (r) => ({ owner: 'Owner', manager: 'Manager', staff: 'Seller' }[r] || '');
  modal({
    title: 'Your shops',
    body: `
      <ul class="rows">${store.shops.map((s) => `
        <li class="row tap" data-pick="${s.id}"><div class="grow"><b>${esc(s.name)}</b><small>${esc(roleName(store.roleIn(s)))}</small></div>${s.id === store.shop?.id ? '<span class="pill good">Open</span>' : ''}</li>`).join('')}</ul>
      ${store.isAdmin ? `<div class="row-btns"><a class="btn ghost" href="#/manage" data-close>${icon('shops')}All shops</a><button type="button" class="btn ghost" data-new>${icon('plus')}Create shop</button></div>` : ''}`,
    actions: '<button class="btn primary">Close</button>',
    onMount: (dlg, close) => {
      dlg.querySelectorAll('[data-pick]').forEach((r) => r.addEventListener('click', () => { if (r.dataset.pick !== store.shop?.id) onPick(r.dataset.pick); else close(); }));
      dlg.querySelector('[data-new]')?.addEventListener('click', () => { close(); openCreateShop({ onCreated: (id) => onPick(id) }); });
    },
  });
}
