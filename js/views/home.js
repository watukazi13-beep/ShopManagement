import { store } from '../store.js';
import { daySummary, profitAndLoss, monthKey, monthLabel } from '../calc.js';
import { esc, fmt, fmtQty, fmtTime, icon, statusPill, emptyState } from '../ui.js';
import { showReceipt } from './sell.js';
import { openPurchaseForm } from './orders.js';
import { openExpenseForm } from './money.js';

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

      el.innerHTML = `
        <section class="hero">
          <p class="hello">${hello}${store.user?.name && store.mode !== 'local' ? ', ' + esc(store.user.name.split(' ')[0]) : ''}</p>
          <p class="hero-label">Sold today</p>
          <p class="hero-figure">${fmt(today.revenue)}</p>
          <p class="hero-sub">${today.count} sale${today.count === 1 ? '' : 's'}${boss ? ` · ${fmt(today.profit)} gross profit` : ''}</p>
          <div class="quick">
            <a class="btn accent big" href="#/sell">${icon('sell')}New sale</a>
            ${store.can('orders') ? `<button class="btn ghost" data-act="receive">${icon('truck')}Receive stock</button>` : ''}
            ${boss ? `<button class="btn ghost" data-act="expense">${icon('money')}Add expense</button>` : ''}
          </div>
        </section>

        ${boss && !store.data.items.length ? `
        <section class="card soft getting-started">
          <h2>Get started</h2>
          <ol class="steps-list">
            <li><a href="#/settings">Add your shop name and phone</a> (shown on receipts)</li>
            <li><a href="#/orders?tab=suppliers">Add your suppliers</a></li>
            <li><a href="#/stock?new=1">Add your items</a> or import them from Loyverse in Stock</li>
            <li>Start selling. Stock, cost of goods and profit are worked out for you.</li>
          </ol>
        </section>` : ''}

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
        </section>` : ''}

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

        <section class="card">
          <div class="card-head"><h2>Recent sales</h2>${store.can('reports') ? '<a class="link" href="#/money?tab=sales">All sales</a>' : ''}</div>
          ${recent.length ? `<ul class="rows">${recent.map((s) => `
            <li class="row tap" data-sale="${s.id}">
              <div class="grow"><b>${esc(s.lines.map((l) => l.name).slice(0, 2).join(', '))}${s.lines.length > 2 ? ` +${s.lines.length - 2}` : ''}</b><small>${fmtTime(s.ts)} · ${esc(s.pay)}${s.customer ? ' · ' + esc(s.customer) : ''}</small></div>
              <span class="num">${fmt(s.total)}</span>
            </li>`).join('')}</ul>` : emptyState('No sales yet', 'Sales you record will show here.', '<a class="btn primary" href="#/sell">Make the first sale</a>')}
        </section>`;
    };
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'receive') openPurchaseForm();
      if (a === 'expense') openExpenseForm();
      if (a === 'notify') Notification.requestPermission().then(draw);
      if (a === 'rfq') {
        const ids = store.generateRfqs();
        location.hash = ids.length === 1 ? `#/orders?rfq=${ids[0]}` : '#/orders?tab=rfq';
      }
      const sid = e.target.closest('[data-sale]')?.dataset.sale;
      if (sid) showReceipt(store.data.sales.find((s) => s.id === sid));
    });
    draw();
    return { update: draw };
  },
};
