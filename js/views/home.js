import { store } from '../store.js';
import { daySummary, profitAndLoss, monthKey, monthLabel, stockValue, num, dayKey } from '../calc.js';
import { todayCard, openPayout, showDayClose } from './dayclose.js';
import { backupReminder, downloadFullBackup } from './backup.js';
import { shiftsTodayCard, openReopenShift } from './shiftgate.js';
import { esc, fmt, fmtQty, fmtTime, fmtDate, icon, statusPill, emptyState } from '../ui.js';
import { showReceipt } from './sell.js';
import { openPurchaseForm, isLate } from './orders.js';
import { openExpenseForm } from './money.js';
import { installApp, isInstalled, onInstallChange } from '../install.js';
import { openSetup } from './setup.js';

export default {
  title: 'Home',
  mount(el) {
    const draw = () => {
      if (!store.ready) { el.innerHTML = '<div class="loading">Loading your shop…</div>'; return; }
      const boss = store.can('reports');
      const today = daySummary(store.data.sales);
      const mk = monthKey();
      const pl = profitAndLoss(store.data, mk);
      const lows = store.lowStock();
      const recent = store.data.sales.filter((s) => !s.voided).sort((a, b) => b.ts - a.ts).slice(0, 6);
      const hour = new Date().getHours();
      const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

      let hideInstall = isInstalled();
      try { hideInstall ||= localStorage.getItem('install-dismissed') === '1'; } catch { /* ignore */ }
      el.innerHTML = `
        ${hideInstall ? '' : `<section class="card install-card">
          <div class="grow"><b>Install the app</b><small>Opens from your home screen and works offline.</small></div>
          <button class="btn primary" data-act="install">${icon('download')}Install</button>
          <button class="icon-btn" data-act="install-later" aria-label="Not now">${icon('x')}</button>
        </section>`}
        <section class="hero">
          <p class="hello">${hello}${store.user?.name && store.mode !== 'local' ? ', ' + esc(store.user.name.split(' ')[0]) : ''}</p>
          <p class="hero-label">Sold today</p>
          <p class="hero-figure">${fmt(today.revenue)}</p>
          <p class="hero-sub">${today.count} sale${today.count === 1 ? '' : 's'}${boss ? ` · ${fmt(today.profit)} gross profit` : ''}</p>
          <div class="quick">
            <a class="btn accent big" href="#/sell">${icon('sell')}New sale</a>
            ${store.can('orders') ? `<button class="btn ghost" data-act="receive">${icon('truck')}Receive stock</button>` : ''}
            ${boss ? `<button class="btn ghost" data-act="expense">${icon('receipt')}Add expense</button>` : ''}
          </div>
        </section>

        ${store.can('settings') && !store.settings.setupDone ? `
        <section class="card soft getting-started compact-banner">
          <div class="grow"><b>Set up your shop</b><small>A few quick steps: shop details and logo, how customers pay, receipts, categories, restocking${store.mode === 'local' ? '' : ', your staff'} and your items.</small></div>
          <div class="row-btns"><button class="btn primary" data-act="setup">Start setup</button><button class="btn ghost" data-act="setup-later">Not now</button></div>
        </section>` : ''}

        ${backupReminder()}
        <div class="home-cols">
        <div class="home-col">
        <section class="card">
          <div class="card-head">
            <h2>Stock alerts ${lows.length ? `<span class="count bad">${lows.length}</span>` : ''}</h2>
            ${lows.length ? `<a class="link" href="#/stock?filter=low">See all</a>` : ''}
          </div>
          ${lows.length ? `
            <ul class="rows">
              ${lows.slice(0, 6).map((p) => `
                <li class="row">
                  <div class="grow"><b>${esc(p.item.name)}</b><small>${fmtQty(p.stock)} ${esc(p.item.unit || '')} left${p.daysLeft !== null ? ` · about ${Math.floor(p.daysLeft)} days` : ''}</small></div>
                  ${statusPill(p.status)}
                </li>`).join('')}
            </ul>
            ${store.can('orders') ? `<button class="btn primary block" data-act="rfq">${icon('orders')}Create requests for quotation</button>` : ''}
          ` : `<p class="muted">${store.data.items.length ? 'All items are above their reorder level.' : 'Alerts appear here when items run low.'}</p>`}
          ${'Notification' in window && Notification.permission === 'default' ? `<p class="small notify-hint"><button class="link" data-act="notify">Turn on phone alerts</button> to be told when stock runs low.</p>` : ''}
        </section>

        ${todayCard()}
        ${shiftsTodayCard()}
        ${(() => {
          const incoming = store.openPos().sort((a, b) => (a.expectedTs || 0) - (b.expectedTs || 0));
          if (!incoming.length) return '';
          const late = incoming.filter(isLate).length;
          return `<section class="card">
            <div class="card-head"><h2>Expected deliveries ${late ? `<span class="count bad">${late} late</span>` : ''}</h2><a class="link" href="#/stock?filter=incoming">Receive</a></div>
            <ul class="rows">${incoming.slice(0, 4).map((po) => `
              <li class="row"><div class="grow"><b>${esc(po.supplierName)}</b><small>${esc(po.no)} · ${po.lines.length} item${po.lines.length === 1 ? '' : 's'}</small></div>
              <span class="${isLate(po) ? 'warn-text' : 'muted'} small">${isLate(po) ? 'was due ' : 'due '}${fmtDate(po.expectedTs)}</span></li>`).join('')}</ul>
          </section>`;
        })()}

        </div>
        <div class="home-col">
        ${boss ? `
        <section class="card">
          <div class="card-head"><h2>${esc(monthLabel(mk))}</h2><a href="#/money" class="link">Full report</a></div>
          <div class="stats">
            <div><span>Sales</span><strong>${fmt(pl.revenue)}</strong></div>
            <div><span>Cost of goods sold</span><strong>${fmt(pl.cogs)}</strong></div>
            <div><span>Gross profit</span><strong>${fmt(pl.grossProfit)}</strong></div>
            <div><span>Expenses &amp; losses</span><strong>${fmt(pl.expenseTotal + pl.losses)}</strong></div>
            <div class="stat-main ${pl.netProfit < 0 ? 'neg' : ''}"><span>Net profit</span><strong>${fmt(pl.netProfit)}</strong></div>
          </div>
        </section>
        ${(() => {
          const sv = stockValue(store.activeItems());
          const owedIn = store.owedByCustomers();
          const owedOut = store.data.purchases.filter((p) => !p.paid).reduce((t, p) => t + num(p.total), 0);
          const openPo = store.openPos();
          const onOrderValue = openPo.reduce((t, po) => t + po.lines.reduce((x, l) => x + Math.max(0, num(l.qty) - num(l.received)) * num(l.cost), 0), 0);
          return `<section class="card">
            <div class="card-head"><h2>Money position</h2></div>
            <div class="stats compact">
              <a href="#/stock"><span>Stock value (cost)</span><strong>${fmt(sv.cost)}</strong></a>
              <a href="#/money?tab=customers" class="${owedIn ? 'warn' : ''}"><span>Customers owe you</span><strong>${fmt(owedIn)}</strong></a>
              <a href="#/orders?tab=received" class="${owedOut ? 'warn' : ''}"><span>You owe suppliers</span><strong>${fmt(owedOut)}</strong></a>
              <a href="#/stock?filter=incoming"><span>On order (${openPo.length})</span><strong>${fmt(onOrderValue)}</strong></a>
            </div>
          </section>`;
        })()}` : ''}

        <section class="card">
          <div class="card-head"><h2>Recent sales</h2>${store.can('reports') ? '<a class="link" href="#/money?tab=sales">All sales</a>' : ''}</div>
          ${recent.length ? `<ul class="rows">${recent.map((s) => `
            <li class="row tap" data-sale="${s.id}">
              <div class="grow"><b>${esc(s.lines.map((l) => l.name).slice(0, 2).join(', '))}${s.lines.length > 2 ? ` +${s.lines.length - 2}` : ''}</b><small>${fmtTime(s.ts)} · ${esc(s.pay)}${s.customer ? ' · ' + esc(s.customer) : ''}</small></div>
              <span class="num">${fmt(s.total)}</span>
            </li>`).join('')}</ul>` : emptyState('No sales yet', 'Sales you record will show here.', '<a class="btn primary" href="#/sell">Make the first sale</a>')}
        </section>        </div>
        </div>`;
    };
    el.addEventListener('click', (e) => {
      const ro = e.target.closest('[data-reopen]')?.dataset.reopen;
      if (ro) { openReopenShift(ro); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'install') installApp();
      if (a === 'setup') openSetup();
      if (a === 'setup-later') store.saveSettings({ setupDone: true });
      if (a === 'install-later') { try { localStorage.setItem('install-dismissed', '1'); } catch { /* ignore */ } draw(); }
      if (a === 'receive') openPurchaseForm();
      if (a === 'expense') openExpenseForm();
      if (a === 'payout') openPayout();
      if (a === 'backup-full') downloadFullBackup().then(() => draw());
      if (a === 'backup-later') { try { localStorage.setItem('backup-snooze', new Date().toISOString().slice(0, 10)); } catch { /* ignore */ } draw(); }
      if (a === 'dayclose-view') showDayClose(store.lastClosing());
      if (a === 'notify') Notification.requestPermission().then(draw);
      if (a === 'rfq') {
        const ids = store.generateRfqs();
        location.hash = ids.length === 1 ? `#/orders?rfq=${ids[0]}` : '#/orders?tab=rfq';
      }
      const sid = e.target.closest('[data-sale]')?.dataset.sale;
      if (sid) showReceipt(store.data.sales.find((s) => s.id === sid));
    });
    draw();
    const off = onInstallChange(draw);
    return { update: draw, destroy: off };
  },
};
