import { store } from '../store.js';
import { profitAndLoss, monthKey, monthLabel, addMonths, monthRange, num, dayKey, salesBreakdown } from '../calc.js';
import { esc, fmt, fmtQty, fmtDate, fmtTime, pct, icon, modal, toast, field, emptyState, confirmBox, downloadFile, toCsv, printHtml, toInputDate, fromInputDate } from '../ui.js';
import { showReceipt } from './sell.js';
import { drawCustomers } from './customers.js';
import { drawQuotes } from './quotes.js';

const minus = (v) => (Math.round(v) > 0 ? '−' : '') + fmt(v);
const lossText = (v) => (v < 0 ? '+' + fmt(-v) : minus(v));
const pastCache = new Map(); // month → data, for months older than the live window

async function dataFor(key) {
  const [from] = monthRange(key);
  if (from >= store.since) return store.data;
  if (!pastCache.has(key)) pastCache.set(key, await store.monthData(key));
  return pastCache.get(key);
}

export default {
  title: 'Money',
  mount(el, params) {
    let tab = params.get('tab') || 'report';
    let month = params.get('month') || monthKey();
    let trend = null;
    let seq = 0;
    let by = 'item';
    let search = '';
    const custState = {};
    el.innerHTML = `
      <div class="page-head"><h1>Money</h1>
        <div class="month-pick">
          <button class="icon-btn" data-m="-1" aria-label="Previous month">${icon('back')}</button>
          <b id="m-label"></b>
          <button class="icon-btn flip" data-m="1" aria-label="Next month">${icon('back')}</button>
        </div>
      </div>
      <div class="seg tabs money-tabs" role="tablist">
        <button data-tab="report">Profit</button>
        <button data-tab="breakdown">By item</button>
        <button data-tab="sales">Receipts</button>
        <button data-tab="expenses">Expenses</button>
        <button data-tab="losses">Losses</button>
        <button data-tab="days">Days</button>
        <button data-tab="customers">Customers</button>
        <button data-tab="quotes">Quotations</button>
      </div>
      <div id="money-body"></div>`;
    const body = el.querySelector('#money-body');

    const draw = async () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      el.querySelector('.month-pick').hidden = tab === 'customers' || tab === 'quotes';
      if (tab === 'customers') { if (store.ready) { if (!body.contains(document.activeElement)) drawCustomers(body, custState); } return; }
      if (tab === 'quotes') { if (store.ready) drawQuotes(body); return; }
      el.querySelector('#m-label').textContent = monthLabel(month);
      el.querySelector('[data-m="1"]').disabled = month >= monthKey();
      if (!store.ready) { body.innerHTML = '<div class="loading">Loading…</div>'; return; }
      const my = ++seq;
      let d;
      try {
        if (monthRange(month)[0] < store.since) body.innerHTML = '<div class="loading">Loading month…</div>';
        d = await dataFor(month);
      } catch (e) {
        body.innerHTML = `<p class="banner bad">Could not load ${esc(monthLabel(month))}: ${esc(e.message)}. Older months need an internet connection the first time.</p>`;
        return;
      }
      if (my !== seq) return;
      if (tab === 'report') drawReport(d);
      if (tab === 'expenses') drawExpenses(d);
      if (tab === 'losses') drawLosses(d);
      if (tab === 'days') drawDays(d);
      if (tab === 'sales') drawSales(d);
      if (tab === 'breakdown') drawBreakdown(d);
    };

    /** Loyverse-style sales summary and breakdown by item, category, staff, payment type or day. */
    function drawBreakdown(d) {
      const range = monthRange(month);
      const pl = profitAndLoss(d, month);
      const catOf = (id) => store.item(id)?.category || '';
      const rows = salesBreakdown(d.sales || [], range, by, catOf);
      const labels = { item: 'Item', category: 'Category', staff: 'Staff', pay: 'Payment type', day: 'Day' };
      const qtyCol = by === 'item' || by === 'category';
      body.innerHTML = `
        <div class="stats compact">
          <div><span>Gross sales</span><strong>${fmt(pl.grossSales)}</strong></div>
          <div><span>Refunds</span><strong>${fmt(pl.refunds)}</strong></div>
          <div><span>Discounts</span><strong>${fmt(pl.discounts)}</strong></div>
          <div><span>Net sales</span><strong>${fmt(pl.revenue)}</strong></div>
          <div><span>Gross profit</span><strong>${fmt(pl.grossProfit)}</strong></div>
          ${pl.tax ? `<div><span>${esc(store.settings.taxName || 'VAT')} included</span><strong>${fmt(pl.tax)}</strong></div>` : ''}
        </div>
        <div class="row-btns spread">
          <div class="chips">${Object.entries(labels).map(([k, t]) => `<button type="button" class="chip ${by === k ? 'on' : ''}" data-by="${k}">${t}</button>`).join('')}</div>
          <button class="btn ghost small" data-act="csv-bd">${icon('download')}CSV</button>
        </div>
        ${rows.length ? `<table class="table">
          <thead><tr><th>${labels[by]}</th>${qtyCol ? '<th class="r">Sold</th>' : '<th class="r">Receipts</th>'}<th class="r hide-sm">Gross</th><th class="r hide-sm">Refunds</th><th class="r hide-sm">Discounts</th><th class="r">Net sales</th><th class="r hide-sm">Cost</th><th class="r">Profit</th><th class="r hide-sm">Margin</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${esc(by === 'day' ? fmtDate(monthRange(r.key.slice(0, 7))[0] + (Number(r.key.slice(8)) - 1) * 86400000) : r.label)}</td>
            <td class="r num">${qtyCol ? fmtQty(r.qty) : r.count}</td>
            <td class="r num hide-sm">${fmt(r.gross)}</td><td class="r num hide-sm">${r.refunds ? '−' + fmt(r.refunds) : '—'}</td><td class="r num hide-sm">${r.discounts ? '−' + fmt(r.discounts) : '—'}</td>
            <td class="r num">${fmt(r.net)}</td><td class="r num hide-sm">${fmt(r.cogs)}</td>
            <td class="r num ${r.profit < 0 ? 'neg' : ''}">${fmt(r.profit)}</td><td class="r num hide-sm">${r.net ? ((r.profit / r.net) * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('')}
          </tbody></table>` : emptyState('No sales this month', '')}`;
      body.querySelectorAll('[data-by]').forEach((b) => { b.onclick = () => { by = b.dataset.by; draw(); }; });
      body.querySelector('[data-act=csv-bd]').onclick = () => downloadFile(`sales-by-${by}-${month}.csv`, toCsv([
        [labels[by], qtyCol ? 'Quantity sold' : 'Receipts', 'Gross sales', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit'],
        ...rows.map((r) => [r.label, qtyCol ? r.qty : r.count, r.gross, r.refunds, r.discounts, r.net, r.cogs, r.profit]),
      ]), 'text/csv');
    }

    function drawReport(d) {
      const pl = profitAndLoss(d, month);
      const expRows = Object.entries(pl.expenses).sort((a, b) => b[1] - a[1]);
      const avg = pl.salesCount ? pl.revenue / pl.salesCount : 0;
      const closed = store.closingFor(month);
      const savings = store.savingsToDate();
      body.innerHTML = `
        <section class="card closing-card ${closed ? 'done' : ''}">
          ${closed
            ? `<div class="grow"><b>${esc(monthLabel(month))} is closed</b><small>Profit you could take: <b>${fmt(closed.takeHome)}</b> · maintenance saved ${fmt(closed.maintenance)} · closed ${fmtDate(closed.ts)}${closed.byName ? ' by ' + esc(closed.byName) : ''}</small></div>
               <button class="btn ghost small" data-act="view-close">View</button>${store.can('settings') ? '<button class="btn ghost small" data-act="close-month">Redo</button>' : ''}`
            : `<div class="grow"><b>Close ${esc(monthLabel(month))}</b><small>Take off salaries and savings to see the profit you can really take.</small></div>
               ${store.can('settings') ? '<button class="btn accent" data-act="close-month">Close the month</button>' : ''}`}
        </section>
        ${savings.maintenance || savings.other ? `<p class="muted small">Saved so far from closed months: maintenance ${fmt(savings.maintenance)}${savings.other ? ` · other ${fmt(savings.other)}` : ''}</p>` : ''}
        <section class="card statement">
          <div class="card-head"><h2>Profit and loss</h2>
            <div class="row-btns"><button class="btn ghost small" data-act="print">${icon('print')}Print</button><button class="btn ghost small" data-act="csv">${icon('download')}CSV</button></div>
          </div>
          <dl>
            <div class="line"><dt>Sales</dt><dd>${fmt(pl.revenue)}</dd></div>
            ${pl.discounts ? `<div class="line sub"><dt>Discounts given (already taken off sales)</dt><dd>${fmt(pl.discounts)}</dd></div>` : ''}
            <div class="line"><dt>Cost of goods sold</dt><dd>${minus(pl.cogs)}</dd></div>
            <div class="line strong"><dt>Gross profit <small>${pct(pl.grossMargin)} of sales</small></dt><dd>${fmt(pl.grossProfit)}</dd></div>
            ${expRows.map(([c, v]) => `<div class="line sub"><dt>${esc(c)}</dt><dd>${minus(v)}</dd></div>`).join('')}
            <div class="line"><dt>Total expenses</dt><dd>${minus(pl.expenseTotal)}</dd></div>
            <div class="line"><dt>Stock losses <small>damaged, lost, expired, count differences</small></dt><dd>${lossText(pl.losses)}</dd></div>
            <div class="line total ${pl.netProfit < 0 ? 'neg' : ''}"><dt>Net profit <small>${pct(pl.netMargin)} of sales</small></dt><dd>${fmt(pl.netProfit)}</dd></div>
          </dl>
        </section>

        <section class="card">
          <div class="stats compact">
            <div><span>Number of sales</span><strong>${pl.salesCount}</strong></div>
            <div><span>Average sale</span><strong>${fmt(avg)}</strong></div>
            <div><span>Stock bought</span><strong>${fmt(pl.stockBought)}</strong></div>
            ${Object.entries(pl.byPay).map(([k, v]) => `<div><span>${esc(k)}</span><strong>${fmt(v)}</strong></div>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Last 6 months</h2>${trend ? '' : '<button class="btn ghost small" data-act="trend">Show</button>'}</div>
          <div id="trend">${trend ? trendChart(trend) : '<p class="muted small">Compare sales and profit month by month.</p>'}</div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Most profitable items</h2></div>
          ${pl.topItems.length ? `<table class="table"><thead><tr><th>Item</th><th class="r">Sold</th><th class="r hide-sm">Sales</th><th class="r hide-sm">Cost</th><th class="r">Profit</th></tr></thead>
          <tbody>${pl.topItems.slice(0, 15).map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${fmtQty(i.qty)}</td><td class="r num hide-sm">${fmt(i.revenue)}</td><td class="r num hide-sm">${fmt(i.cogs)}</td><td class="r num ${i.profit < 0 ? 'neg' : ''}">${fmt(i.profit)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No sales this month.</p>'}
        </section>`;
      body.querySelector('[data-act=close-month]')?.addEventListener('click', () => openClosing(month, pl));
      body.querySelector('[data-act=view-close]')?.addEventListener('click', () => printClosing(store.closingFor(month)));
      body.querySelector('[data-act=print]').onclick = () => printHtml(`Profit and loss ${monthLabel(month)}`, `
        <h1>${esc(store.settings.shopName)}</h1><div class="muted">Profit and loss · ${esc(monthLabel(month))}</div>
        <table><tbody>
          <tr><td>Sales</td><td class="r">${fmt(pl.revenue)}</td></tr>
          <tr><td>Cost of goods sold</td><td class="r">${minus(pl.cogs)}</td></tr>
          <tr class="tot"><td>Gross profit (${pct(pl.grossMargin)})</td><td class="r">${fmt(pl.grossProfit)}</td></tr>
          ${expRows.map(([c, v]) => `<tr><td>&nbsp;&nbsp;${esc(c)}</td><td class="r">${minus(v)}</td></tr>`).join('')}
          <tr><td>Total expenses</td><td class="r">${minus(pl.expenseTotal)}</td></tr>
          <tr><td>Stock losses</td><td class="r">${lossText(pl.losses)}</td></tr>
          <tr class="tot"><td>Net profit (${pct(pl.netMargin)})</td><td class="r">${fmt(pl.netProfit)}</td></tr>
        </tbody></table>
        <h2>Top items</h2><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead>
        <tbody>${pl.topItems.slice(0, 20).map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${fmtQty(i.qty)}</td><td class="r">${fmt(i.revenue)}</td><td class="r">${fmt(i.profit)}</td></tr>`).join('')}</tbody></table>`);
      body.querySelector('[data-act=csv]').onclick = () => {
        const rows = [['Profit and loss', monthLabel(month)], [], ['Sales', pl.revenue], ['Cost of goods sold', pl.cogs], ['Gross profit', pl.grossProfit],
          ...expRows.map(([c, v]) => [`Expense: ${c}`, v]), ['Total expenses', pl.expenseTotal], ['Stock losses', pl.losses], ['Net profit', pl.netProfit],
          [], ['Item', 'Qty sold', 'Sales', 'Cost', 'Profit'], ...pl.topItems.map((i) => [i.name, i.qty, i.revenue, i.cogs, i.profit])];
        downloadFile(`profit-${month}.csv`, toCsv(rows), 'text/csv');
      };
      body.querySelector('[data-act=trend]')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Loading…';
        try {
          const keys = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
          trend = [];
          for (const k of keys) trend.push(profitAndLoss(await dataFor(k), k));
          draw();
        } catch (err) { toast('Needs internet to load older months', { kind: 'err' }); trend = null; draw(); }
      });
    }

    function drawExpenses(d) {
      const [a, b] = monthRange(month);
      const list = (d.expenses || []).filter((x) => x.ts >= a && x.ts < b).sort((x, y) => y.ts - x.ts);
      const total = list.reduce((t, x) => t + num(x.amount), 0);
      body.innerHTML = `
        <div class="row-btns spread"><p>Total: <b>${fmt(total)}</b></p><button class="btn primary" data-act="add-exp">${icon('plus')}Add expense</button></div>
        ${list.length ? `<ul class="rows card">${list.map((x) => `
          <li class="row tap" data-exp="${x.id}"><div class="grow"><b>${esc(x.category)}</b><small>${fmtDate(x.ts)}${x.note ? ' · ' + esc(x.note) : ''}${x.paidFrom ? ' · from ' + esc(x.paidFrom) : ''}${x.payout && x.byName ? ' · ' + esc(x.byName) : ''}</small></div><span class="num">${fmt(x.amount)}</span></li>`).join('')}</ul>`
          : emptyState('No expenses this month', 'Record rent, salaries, transport and other running costs so your net profit is right.')}`;
      body.querySelector('[data-act=add-exp]').onclick = () => openExpenseForm();
      body.querySelectorAll('[data-exp]').forEach((r) => { r.onclick = () => openExpenseForm(list.find((x) => x.id === r.dataset.exp)); });
    }

    /** Stock losses and corrections (damaged, expired, lost, count differences). Clearing removes the figure only. */
    function drawLosses(d) {
      const [a, b] = monthRange(month);
      const list = (d.adjustments || []).filter((x) => x.ts >= a && x.ts < b).sort((x, y) => y.ts - x.ts);
      const value = (x) => -num(x.qty) * num(x.cost); // positive = money lost
      const total = list.reduce((t, x) => t + value(x), 0);
      const canClear = store.can('clear');
      body.innerHTML = `
        <div class="row-btns spread">
          <p>Stock losses: <b class="${total > 0 ? 'neg' : ''}">${lossText(total)}</b> <span class="muted small">at cost · ${list.length} entr${list.length === 1 ? 'y' : 'ies'}</span></p>
          ${canClear && list.length ? `<button class="btn ghost danger" data-act="clear-all">${icon('trash')}Clear all for ${esc(monthLabel(month))}</button>` : ''}
        </div>
        <p class="muted small">${canClear ? 'Clearing removes the figure from your reports and profit. Stock stays as it is.' : 'Only the owner, or a manager the owner has allowed, can clear these figures.'}</p>
        ${list.length ? `<ul class="rows card">${list.map((x) => `
          <li class="row" data-adj="${x.id}">
            <div class="grow"><b>${esc(x.name || store.item(x.itemId)?.name || 'Item')}</b>
              <small>${esc(x.reason || 'Adjustment')} · ${fmtDate(x.ts)} · ${num(x.qty) > 0 ? '+' : ''}${fmtQty(x.qty)} ${esc(store.item(x.itemId)?.unit || 'pcs')}${x.note ? ' · ' + esc(x.note) : ''}${x.by ? ' · ' + esc(x.by) : ''}</small></div>
            <span class="num ${value(x) > 0 ? 'neg' : 'up'}">${lossText(value(x))}</span>
            ${canClear ? `<button type="button" class="icon-btn" data-clear="${x.id}" aria-label="Clear this figure">${icon('trash')}</button>` : ''}
          </li>`).join('')}</ul>`
          : emptyState('No stock losses this month', 'Damaged, expired or lost stock and count differences show here.')}`;
      const done = (n) => { pastCache.delete(month); toast(`${n} figure${n === 1 ? '' : 's'} cleared — stock unchanged`); };
      body.querySelectorAll('[data-clear]').forEach((btn) => {
        btn.onclick = async () => {
          const x = list.find((y) => y.id === btn.dataset.clear);
          if (!(await confirmBox(`Clear this figure (${x.name}, ${x.reason || 'adjustment'}, ${lossText(value(x))})? Stock stays as it is.`, { ok: 'Clear figure', danger: true }))) return;
          try { done(store.clearAdjustments([x.id])); } catch (e) { toast(e.message, { kind: 'err' }); }
        };
      });
      body.querySelector('[data-act=clear-all]')?.addEventListener('click', async () => {
        if (!(await confirmBox(`Clear all ${list.length} stock-loss figures for ${monthLabel(month)} (${lossText(total)})? Stock stays as it is. This cannot be undone.`, { ok: 'Clear all', danger: true }))) return;
        try { done(store.clearAdjustments(list.map((x) => x.id))); } catch (e) { toast(e.message, { kind: 'err' }); }
      });
    }

    /** Every closed day of the month: sales, pay-outs and whether the money matched. */
    function drawDays(d) {
      const [a, b] = monthRange(month);
      const list = (d.dayclose || []).filter((x) => x.ts >= a && x.ts < b).sort((x, y) => (x.id < y.id ? 1 : -1));
      const short = list.reduce((t, x) => t + Math.min(0, num(x.totalDiff)), 0);
      const over = list.reduce((t, x) => t + Math.max(0, num(x.totalDiff)), 0);
      const today = dayKey();
      body.innerHTML = `
        <div class="row-btns spread"><p>${list.length} day${list.length === 1 ? '' : 's'} closed${short ? ` · <span class="neg">short ${fmt(-short)}</span>` : ''}${over ? ` · <span class="up">over ${fmt(over)}</span>` : ''}</p></div>
        ${list.length ? `<ul class="rows card">${list.map((x) => `
          <li class="row tap" data-day="${x.id}"><div class="grow"><b>${fmtDate(x.ts)}</b><small>${x.count} receipts · ${fmt(x.total)} sales · ${fmt(x.payoutTotal || 0)} paid out · by ${esc(x.byName || x.by)}</small></div>
            ${!(x.rows || []).some((r) => r.counted !== null && r.counted !== undefined) ? '<span class="pill warn">Not counted</span>' : `<span class="pill ${x.totalDiff < 0 ? 'bad' : x.totalDiff > 0 ? 'warn' : 'good'}">${x.totalDiff === 0 ? 'Matches' : `${x.totalDiff > 0 ? 'Over' : 'Short'} ${fmt(Math.abs(x.totalDiff))}`}</span>`}</li>`).join('')}</ul>`
          : emptyState('No days closed this month', 'Each evening the seller closes the shift — that count closes the day and shows here.')}`;
      body.querySelectorAll('[data-day]').forEach((r) => { r.onclick = () => import('./dayclose.js').then((m) => m.showDayClose(list.find((x) => x.id === r.dataset.day))); });
    }

    function drawSales(d) {
      const [a, b] = monthRange(month);
      const sq = search.toLowerCase();
      const list = (d.sales || []).filter((s) => s.ts >= a && s.ts < b && (!sq || s.no.toLowerCase().includes(sq) || (s.customer || '').toLowerCase().includes(sq) || s.lines.some((l) => l.name.toLowerCase().includes(sq)))).sort((x, y) => y.ts - x.ts);
      const days = new Map();
      for (const s of list) { const k = dayKey(s.ts); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
      body.innerHTML = `
        <div class="row-btns spread">
          <div class="searchbar grow">${icon('search')}<input type="search" id="rc-q" placeholder="Search receipt no., item or customer" value="${esc(search)}" autocomplete="off"></div>
          <button class="btn ghost" data-act="csv-sales">${icon('download')}Export CSV</button></div>
        <p class="muted small">${list.filter((s) => !s.voided && s.type !== 'refund').length} sales${list.some((s) => s.type === 'refund') ? ` · ${list.filter((s) => s.type === 'refund').length} refunds` : ''}</p>
        ${list.length ? [...days].map(([k, ss]) => `
          <h3 class="day-head"><span>${fmtDate(ss[0].ts)}</span><span class="num">${fmt(ss.filter((s) => !s.voided).reduce((t, s) => t + s.total, 0))}</span></h3>
          <ul class="rows card">${ss.map((s) => `
            <li class="row tap ${s.voided ? 'voided' : ''}" data-sale="${s.id}"><div class="grow"><b>${s.type === 'refund' ? 'Refund · ' : ''}${esc(s.lines.map((l) => l.name).slice(0, 3).join(', '))}${s.lines.length > 3 ? ` +${s.lines.length - 3}` : ''}</b><small>${esc(s.no)} · ${fmtTime(s.ts)} · ${esc(s.pay)}${s.credit ? ' (account)' : ''}${s.customer ? ' · ' + esc(s.customer) : ''}${s.byName ? ' · ' + esc(s.byName) : ''}${s.voided ? ' · cancelled' : ''}</small></div><span class="num ${s.type === 'refund' ? 'neg' : ''}">${fmt(s.total)}</span></li>`).join('')}</ul>`).join('')
          : emptyState('No sales this month', '')}`;
      body.querySelectorAll('[data-sale]').forEach((r) => { r.onclick = () => showReceipt(list.find((s) => s.id === r.dataset.sale)); });
      const rq = body.querySelector('#rc-q');
      rq.addEventListener('input', () => { search = rq.value.trim(); draw().then(() => { const n = body.querySelector('#rc-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); });
      body.querySelector('[data-act=csv-sales]').onclick = () => {
        const rows = [['Date', 'Time', 'Receipt', 'Item', 'Qty', 'Price', 'Line total', 'Cost', 'Payment', 'Customer', 'Seller', 'Cancelled']];
        for (const s of list) for (const l of s.lines) rows.push([dayKey(s.ts), fmtTime(s.ts), s.no, l.name, l.qty, l.price, l.qty * l.price, Math.round(l.qty * l.cost), s.pay, s.customer, s.byName || s.by, s.voided ? 'yes' : '']);
        downloadFile(`sales-${month}.csv`, toCsv(rows), 'text/csv');
      };
    }

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]')?.dataset.tab;
      if (t) { tab = t; history.replaceState(null, '', `#/money?tab=${t}&month=${month}`); draw(); return; }
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (m) { month = addMonths(month, Number(m)); trend = null; history.replaceState(null, '', `#/money?tab=${tab}&month=${month}`); draw(); }
    });

    draw();
    return { update: draw };
  },
};

function trendChart(rows) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.grossProfit, Math.abs(r.netProfit))));
  const W = 600, H = 200, pad = 28, bw = (W - pad) / rows.length;
  const y = (v) => H - pad - (Math.max(0, v) / max) * (H - pad - 10);
  const bars = rows.map((r, i) => {
    const x = pad + i * bw + bw * 0.12;
    const w = bw * 0.24;
    const b = (v, k, cls) => `<rect x="${x + k * w}" y="${y(v)}" width="${w - 2}" height="${H - pad - y(v)}" class="${cls}" rx="2"><title>${fmt(v)}</title></rect>`;
    return `${b(r.revenue, 0, 'b-rev')}${b(r.grossProfit, 1, 'b-gp')}${b(r.netProfit, 2, r.netProfit < 0 ? 'b-neg' : 'b-np')}
      <text x="${pad + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${monthLabel(r.key).split(' ')[0].slice(0, 3)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Sales, gross profit and net profit for the last six months">
    <line x1="${pad}" x2="${W}" y1="${H - pad}" y2="${H - pad}" class="axis"/>${bars}</svg>
    <div class="legend"><span><i class="b-rev"></i>Sales</span><span><i class="b-gp"></i>Gross profit</span><span><i class="b-np"></i>Net profit</span></div>
    <table class="table small"><thead><tr><th>Month</th><th class="r">Sales</th><th class="r">Gross profit</th><th class="r">Net profit</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(monthLabel(r.key))}</td><td class="r num">${fmt(r.revenue)}</td><td class="r num">${fmt(r.grossProfit)}</td><td class="r num ${r.netProfit < 0 ? 'neg' : ''}">${fmt(r.netProfit)}</td></tr>`).join('')}</tbody></table>`;
}

export function openExpenseForm(x = null) {
  const cats = store.settings.expenseCategories || [];
  modal({
    title: x ? 'Edit expense' : 'Add expense',
    body: `
      ${field('Amount (TSh)', `<input name="amount" type="number" inputmode="numeric" min="1" step="1" required autofocus value="${x?.amount ?? ''}">`)}
      ${field('Category', `<input name="category" list="exp-cats" required value="${esc(x?.category || '')}" placeholder="e.g. Rent"><datalist id="exp-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      <div class="chips wrap" id="exp-chips">${cats.map((c) => `<button type="button" class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${field('Date', `<input name="date" type="date" required value="${toInputDate(x?.ts || Date.now())}">`)}
      ${field('Paid from', `<select name="paidFrom"><option value="">Owner / bank — not from the till</option>${(store.settings.payMethods || ['Cash']).filter((m) => !store.isCreditPay(m)).map((m) => `<option ${x?.paidFrom === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`, 'Paid from the till or a mobile-money line? It is then taken off when the day is closed.')}
      ${field('Note (optional)', `<input name="note" value="${esc(x?.note || '')}">`)}`,
    actions: `${x && store.can('clear') ? '<button type="button" class="btn ghost danger" data-del>Delete</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('#exp-chips').addEventListener('click', (e) => {
        const c = e.target.closest('[data-c]')?.dataset.c;
        if (c) dlg.querySelector('[name=category]').value = c;
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        close();
        if (await confirmBox(`Delete this expense of ${fmt(x.amount)}?`, { ok: 'Delete', danger: true })) {
          try { store.deleteExpense(x.id); pastCache.delete(monthKey(x.ts)); toast('Expense deleted'); } catch (e) { toast(e.message, { kind: 'err' }); }
        }
      });
    },
    onSubmit: (v) => {
      const ts = fromInputDate(v.date);
      store.saveExpense({ id: x?.id, ts, category: v.category.trim(), amount: v.amount, note: v.note, paidFrom: v.paidFrom });
      pastCache.delete(monthKey(ts));
      if (x) pastCache.delete(monthKey(x.ts));
      toast('Expense saved');
    },
  });
}

/** Month-end closing: salaries, savings and the profit the owner can take. */
function openClosing(month, pl) {
  const st = store.settings;
  const prev = store.closingFor(month);
  const list = (prev?.salaryList || st.salaryList || []).map((x) => ({ ...x }));
  if (!list.length) list.push({ name: '', amount: '' });
  const row = (s) => `<div class="sal-row"><input class="sal-name" placeholder="Name" value="${esc(s.name || '')}" aria-label="Name"><input class="sal-amt" type="number" inputmode="numeric" min="0" step="1" placeholder="Salary" value="${s.amount || ''}" aria-label="Salary"><button type="button" class="icon-btn" data-sal-del aria-label="Remove">${icon('x')}</button></div>`;
  const recorded = num(pl.expenses?.Salaries);
  modal({
    title: `Close ${monthLabel(month)}`,
    wide: true,
    body: `
      <h3>Salaries</h3>
      ${recorded ? `<p class="small">Salaries already recorded as expenses this month: <b>${fmt(recorded)}</b> — these are used. The list below is kept for next month.</p>` : '<p class="small muted">Who you pay each month. The list is remembered for next month.</p>'}
      <div id="sal-list">${list.map(row).join('')}</div>
      <button type="button" class="btn ghost small" data-sal-add>${icon('plus')}Add person</button>
      ${recorded ? '' : '<label class="check"><input type="checkbox" name="recordSalaries" checked> Also save these salaries as expenses for this month</label>'}
      <h3>Savings</h3>
      <div class="grid3">
        ${field('Maintenance (% of net profit)', `<input name="maintenancePct" type="number" inputmode="decimal" min="0" max="100" step="any" value="${prev?.maintenancePct ?? st.maintenancePct ?? 10}">`)}
        ${field('Other savings (TSh)', `<input name="otherSavings" type="number" inputmode="numeric" min="0" step="1" value="${prev?.otherSavings || ''}" placeholder="0">`)}
        ${field('Other savings for', `<input name="otherLabel" value="${esc(prev?.otherLabel || '')}" placeholder="e.g. emergencies, new shop">`)}
      </div>
      <h3>Result</h3>
      <dl class="statement-dl" id="cl-result"></dl>
      ${field('Note (optional)', `<input name="note" value="${esc(prev?.note || '')}">`)}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Close the month</button>',
    onMount: (dlg) => {
      const read = () => ({
        salaryList: [...dlg.querySelectorAll('.sal-row')].map((r) => ({ name: r.querySelector('.sal-name').value.trim(), amount: num(r.querySelector('.sal-amt').value) })).filter((s) => s.name || s.amount),
        maintenancePct: num(dlg.querySelector('[name=maintenancePct]').value),
        otherSavings: num(dlg.querySelector('[name=otherSavings]').value),
      });
      const upd = () => {
        const f = store.closingFigures(pl, read());
        const line = (t, v, cls = '', sub = '') => `<div class="line ${cls}"><dt>${t}${sub ? `<small>${sub}</small>` : ''}</dt><dd>${v}</dd></div>`;
        dlg.querySelector('#cl-result').innerHTML = [
          line('Net sales', fmt(f.revenue)),
          line('Cost of goods sold', minus(f.cogs)),
          line('Gross profit', fmt(f.grossProfit), 'strong'),
          line('Running costs', minus(f.runningCosts), '', 'rent, electricity, transport and other expenses'),
          line('Salaries', minus(f.salaries)),
          line('Stock losses', lossText(f.losses)),
          line('Net profit', fmt(f.netProfit), 'strong'),
          line('Maintenance savings', minus(f.maintenance)),
          f.otherSavings ? line('Other savings', minus(f.otherSavings)) : '',
          line('Profit you can take', fmt(f.takeHome), `total ${f.takeHome < 0 ? 'neg' : ''}`),
          line('Keep for restocking', fmt(f.stockReplacement), 'sub', 'the cost of what you sold — keep this money to buy the stock back'),
        ].join('');
      };
      dlg.querySelector('[data-sal-add]').addEventListener('click', () => { dlg.querySelector('#sal-list').insertAdjacentHTML('beforeend', row({})); upd(); });
      dlg.querySelector('#sal-list').addEventListener('click', (e) => { if (e.target.closest('[data-sal-del]')) { e.target.closest('.sal-row').remove(); upd(); } });
      dlg.addEventListener('input', upd);
      dlg._read = read;
      upd();
    },
    onSubmit: (v, { form }) => {
      const opts = { ...form.closest('dialog')._read(), otherLabel: v.otherLabel, note: v.note, recordSalaries: v.recordSalaries === 'on' };
      store.closeMonth(month, pl, opts);
      toast(`${monthLabel(month)} closed`);
      setTimeout(() => printClosing(store.closingFor(month) || { month, ...store.closingFigures(pl, opts), ...opts, ts: Date.now() }), 300);
    },
  });
}

function printClosing(c) {
  if (!c) return;
  const st = store.settings;
  const r = (t, v, cls = '') => `<tr class="${cls}"><td>${t}</td><td class="r">${v}</td></tr>`;
  printHtml(`Month-end ${c.month}`, `
    <div class="head"><div><h1>${esc(st.shopName)}</h1><div class="muted">Month-end closing</div></div>
      <div style="text-align:right"><h1>${esc(monthLabel(c.month))}</h1><div>Closed ${fmtDate(c.ts)}${c.byName ? ' by ' + esc(c.byName) : ''}</div></div></div>
    <table><tbody>
      ${r('Net sales', fmt(c.revenue))}${r('Cost of goods sold', minus(c.cogs))}${r('Gross profit', fmt(c.grossProfit), 'tot')}
      ${r('Running costs', minus(c.runningCosts))}${r('Salaries', minus(c.salaries))}${r('Stock losses', lossText(c.losses))}
      ${r('Net profit', fmt(c.netProfit), 'tot')}${r(`Maintenance savings (${c.maintenancePct || 0}%)`, minus(c.maintenance))}
      ${c.otherSavings ? r(`Other savings${c.otherLabel ? ' — ' + esc(c.otherLabel) : ''}`, minus(c.otherSavings)) : ''}
      ${r('Profit you can take', fmt(c.takeHome), 'tot')}
    </tbody></table>
    <h2>Also</h2>
    <table><tbody>
      ${r('Keep for restocking (cost of what was sold)', fmt(c.stockReplacement))}
      ${c.owedByCustomers !== undefined ? r('Customers owe you', fmt(c.owedByCustomers)) : ''}
      ${c.owedToSuppliers !== undefined ? r('You owe suppliers', fmt(c.owedToSuppliers)) : ''}
      ${Object.entries(c.byPay || {}).map(([k, v]) => r(`Sales by ${esc(k)}`, fmt(v))).join('')}
    </tbody></table>
    ${(c.salaryList || []).length ? `<h2>Salaries</h2><table><tbody>${c.salaryList.map((s) => r(esc(s.name || '—'), fmt(s.amount))).join('')}</tbody></table>` : ''}
    ${c.note ? `<p>${esc(c.note)}</p>` : ''}`);
}
