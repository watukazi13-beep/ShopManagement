import { store } from '../store.js';
import { profitAndLoss, monthKey, monthLabel, addMonths, monthRange, num, dayKey } from '../calc.js';
import { esc, fmt, fmtQty, fmtDate, fmtTime, pct, icon, modal, toast, field, emptyState, confirmBox, downloadFile, toCsv, printHtml, toInputDate, fromInputDate } from '../ui.js';
import { showReceipt } from './sell.js';

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
    el.innerHTML = `
      <div class="page-head"><h1>Money</h1>
        <div class="month-pick">
          <button class="icon-btn" data-m="-1" aria-label="Previous month">${icon('back')}</button>
          <b id="m-label"></b>
          <button class="icon-btn flip" data-m="1" aria-label="Next month">${icon('back')}</button>
        </div>
      </div>
      <div class="seg tabs" role="tablist">
        <button data-tab="report">Profit report</button>
        <button data-tab="expenses">Expenses</button>
        <button data-tab="sales">Sales</button>
      </div>
      <div id="money-body"></div>`;
    const body = el.querySelector('#money-body');

    const draw = async () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
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
      if (tab === 'sales') drawSales(d);
    };

    function drawReport(d) {
      const pl = profitAndLoss(d, month);
      const expRows = Object.entries(pl.expenses).sort((a, b) => b[1] - a[1]);
      const avg = pl.salesCount ? pl.revenue / pl.salesCount : 0;
      body.innerHTML = `
        <section class="card statement">
          <div class="card-head"><h2>Profit and loss</h2>
            <div class="row-btns"><button class="btn ghost small" data-act="print">${icon('print')}Print</button><button class="btn ghost small" data-act="csv">${icon('download')}CSV</button></div>
          </div>
          <dl>
            <div class="line"><dt>Sales</dt><dd>${fmt(pl.revenue)}</dd></div>
            ${pl.discounts ? `<div class="line sub"><dt>Discounts given (already taken off sales)</dt><dd>${fmt(pl.discounts)}</dd></div>` : ''}
            <div class="line"><dt>Cost of goods sold</dt><dd>−${fmt(pl.cogs, { bare: false })}</dd></div>
            <div class="line strong"><dt>Gross profit <small>${pct(pl.grossMargin)} of sales</small></dt><dd>${fmt(pl.grossProfit)}</dd></div>
            ${expRows.map(([c, v]) => `<div class="line sub"><dt>${esc(c)}</dt><dd>−${fmt(v)}</dd></div>`).join('')}
            <div class="line"><dt>Total expenses</dt><dd>−${fmt(pl.expenseTotal)}</dd></div>
            <div class="line"><dt>Stock losses <small>damaged, lost, expired, count differences</small></dt><dd>${pl.losses < 0 ? '+' + fmt(-pl.losses) : '−' + fmt(pl.losses)}</dd></div>
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
      body.querySelector('[data-act=print]').onclick = () => printHtml(`Profit and loss ${monthLabel(month)}`, `
        <h1>${esc(store.settings.shopName)}</h1><div class="muted">Profit and loss · ${esc(monthLabel(month))}</div>
        <table><tbody>
          <tr><td>Sales</td><td class="r">${fmt(pl.revenue)}</td></tr>
          <tr><td>Cost of goods sold</td><td class="r">−${fmt(pl.cogs)}</td></tr>
          <tr class="tot"><td>Gross profit (${pct(pl.grossMargin)})</td><td class="r">${fmt(pl.grossProfit)}</td></tr>
          ${expRows.map(([c, v]) => `<tr><td>&nbsp;&nbsp;${esc(c)}</td><td class="r">−${fmt(v)}</td></tr>`).join('')}
          <tr><td>Total expenses</td><td class="r">−${fmt(pl.expenseTotal)}</td></tr>
          <tr><td>Stock losses</td><td class="r">−${fmt(pl.losses)}</td></tr>
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
          <li class="row tap" data-exp="${x.id}"><div class="grow"><b>${esc(x.category)}</b><small>${fmtDate(x.ts)}${x.note ? ' · ' + esc(x.note) : ''}</small></div><span class="num">${fmt(x.amount)}</span></li>`).join('')}</ul>`
          : emptyState('No expenses this month', 'Record rent, salaries, transport and other running costs so your net profit is right.')}`;
      body.querySelector('[data-act=add-exp]').onclick = () => openExpenseForm();
      body.querySelectorAll('[data-exp]').forEach((r) => { r.onclick = () => openExpenseForm(list.find((x) => x.id === r.dataset.exp)); });
    }

    function drawSales(d) {
      const [a, b] = monthRange(month);
      const list = (d.sales || []).filter((s) => s.ts >= a && s.ts < b).sort((x, y) => y.ts - x.ts);
      const days = new Map();
      for (const s of list) { const k = dayKey(s.ts); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
      body.innerHTML = `
        <div class="row-btns spread"><p class="muted">${list.filter((s) => !s.voided).length} sales</p><button class="btn ghost" data-act="csv-sales">${icon('download')}Export CSV</button></div>
        ${list.length ? [...days].map(([k, ss]) => `
          <h3 class="day-head"><span>${fmtDate(ss[0].ts)}</span><span class="num">${fmt(ss.filter((s) => !s.voided).reduce((t, s) => t + s.total, 0))}</span></h3>
          <ul class="rows card">${ss.map((s) => `
            <li class="row tap ${s.voided ? 'voided' : ''}" data-sale="${s.id}"><div class="grow"><b>${esc(s.lines.map((l) => l.name).slice(0, 3).join(', '))}${s.lines.length > 3 ? ` +${s.lines.length - 3}` : ''}</b><small>${fmtTime(s.ts)} · ${esc(s.pay)}${s.byName ? ' · ' + esc(s.byName) : ''}${s.voided ? ' · cancelled' : ''}</small></div><span class="num">${fmt(s.total)}</span></li>`).join('')}</ul>`).join('')
          : emptyState('No sales this month', '')}`;
      body.querySelectorAll('[data-sale]').forEach((r) => { r.onclick = () => showReceipt(list.find((s) => s.id === r.dataset.sale)); });
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
      ${field('Note (optional)', `<input name="note" value="${esc(x?.note || '')}">`)}`,
    actions: `${x ? '<button type="button" class="btn ghost danger" data-del>Delete</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('#exp-chips').addEventListener('click', (e) => {
        const c = e.target.closest('[data-c]')?.dataset.c;
        if (c) dlg.querySelector('[name=category]').value = c;
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        close();
        if (await confirmBox(`Delete this expense of ${fmt(x.amount)}?`, { ok: 'Delete', danger: true })) { store.deleteExpense(x.id); pastCache.delete(monthKey(x.ts)); toast('Expense deleted'); }
      });
    },
    onSubmit: (v) => {
      const ts = fromInputDate(v.date);
      store.saveExpense({ id: x?.id, ts, category: v.category.trim(), amount: v.amount, note: v.note });
      pastCache.delete(monthKey(ts));
      if (x) pastCache.delete(monthKey(x.ts));
      toast('Expense saved');
    },
  });
}
