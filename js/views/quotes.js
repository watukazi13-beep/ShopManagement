// Quotations for customers (schools, offices…) and invoices for sales on account.
import { store } from '../store.js';
import { num, DAY } from '../calc.js';
import { esc, fmt, fmtQty, fmtDate, icon, modal, toast, field, emptyState, confirmBox, printHtml } from '../ui.js';
import { showReceipt } from './sell.js';
import { openCustomerForm } from './customers.js';

const waPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '255');
const STATUS = { open: ['Open', 'info'], invoiced: ['Invoiced', 'good'], declined: ['Declined', ''] };

export function drawQuotes(body) {
  const list = [...store.data.quotes].sort((a, b) => b.ts - a.ts);
  body.innerHTML = `
    <div class="card soft"><p>Make a quotation from the till: add the items, then tap <b>Quote</b> in the sale. When the customer accepts, turn it into an invoice — the goods go out on their account.</p>
      <a class="btn primary" href="#/sell">${icon('sell')}Go to the till</a></div>
    ${list.length ? `<ul class="rows card">${list.map((q) => {
      const [t, c] = STATUS[q.status] || STATUS.open;
      const expired = q.status === 'open' && q.validUntil < Date.now();
      return `<li class="row tap" data-quote="${q.id}"><div class="grow"><b>${esc(q.customer)}</b><small>${esc(q.no)} · ${fmtDate(q.ts)} · ${q.lines.length} item${q.lines.length === 1 ? '' : 's'}${q.status === 'open' ? ` · valid to ${fmtDate(q.validUntil)}` : ''}</small></div>
        <span class="num">${fmt(q.total)}</span>${expired ? '<span class="pill">Expired</span>' : `<span class="pill ${c}">${t}</span>`}</li>`;
    }).join('')}</ul>` : emptyState('No quotations yet', 'Quotations you make for customers show here.')}`;
  body.querySelectorAll('[data-quote]').forEach((r) => { r.onclick = () => openQuote(r.dataset.quote); });
}

/** Save the till's cart as a quotation for a customer. */
export function quoteFromCart(cartLines, { onSaved } = {}) {
  const customers = [...store.data.customers].sort((a, b) => a.name.localeCompare(b.name));
  modal({
    title: 'Make a quotation',
    body: `
      ${field('Customer', `<select name="customerId" required><option value="">— Choose —</option>${customers.map((c) => `<option value="${c.id}">${esc(c.name)}${c.phone ? ' — ' + esc(c.phone) : ''}</option>`).join('')}</select>`)}
      <button type="button" class="btn ghost small" data-new-cust>${icon('plus')}New customer</button>
      <div class="grid2">
        ${field('Discount', '<input name="discount" inputmode="decimal" placeholder="0 or 10%">')}
        ${field('Valid for (days)', `<input name="validDays" type="number" min="1" value="${store.settings.quoteDays || 14}">`)}
      </div>
      ${field('Note on the quotation', `<textarea name="note" rows="2">${esc(store.settings.quoteNote || '')}</textarea>`)}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save quotation</button>',
    onMount: (dlg, close) => dlg.querySelector('[data-new-cust]').addEventListener('click', () => {
      close();
      openCustomerForm(null, { onSaved: () => setTimeout(() => quoteFromCart(cartLines, { onSaved }), 200) });
    }),
    onSubmit: (v) => {
      const id = store.saveQuote({ customerId: v.customerId, lines: cartLines, discount: v.discount, validDays: v.validDays, note: v.note });
      toast('Quotation saved');
      onSaved?.(id);
      setTimeout(() => openQuote(id), 150);
    },
  });
}

export function openQuote(id) {
  const q = store.data.quotes.find((x) => x.id === id);
  if (!q) return;
  const c = store.customer(q.customerId);
  const [t, cls] = STATUS[q.status] || STATUS.open;
  modal({
    title: `Quotation ${q.no}`,
    wide: true,
    body: `
      <p><span class="pill ${cls}">${t}</span> <b>${esc(q.customer)}</b> · ${fmtDate(q.ts)} · valid to ${fmtDate(q.validUntil)}</p>
      <table class="table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${q.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="r num">${fmtQty(l.qty)} ${esc(l.unit)}</td><td class="r num">${fmt(l.price)}</td><td class="r num">${fmt(l.qty * l.price)}</td></tr>`).join('')}
      ${q.discount ? `<tr><td colspan="3">Discount</td><td class="r num">−${fmt(q.discount)}</td></tr>` : ''}
      <tr class="tot"><td colspan="3">Total</td><td class="r num">${fmt(q.total)}</td></tr></tbody></table>
      ${q.status === 'open' ? '<p class="muted small"><b>Invoice on account</b>: the goods leave stock now and the customer owes the total. To take payment now instead, use <b>Load into till</b>.</p>' : ''}`,
    actions: `
      <button type="button" class="btn ghost danger" data-del>${icon('trash')}<span class="hide-sm">Delete</span></button>
      ${c?.phone ? `<button type="button" class="btn ghost" data-wa>${icon('wa')}<span class="hide-sm">WhatsApp</span></button>` : ''}
      <button type="button" class="btn ghost" data-print>${icon('print')}<span class="hide-sm">PDF</span></button>
      ${q.status === 'open' ? '<button type="button" class="btn ghost" data-till>Load into till</button><button type="button" class="btn accent" data-invoice>Invoice on account</button>' : ''}
      ${q.saleId ? '<button type="button" class="btn ghost" data-sale>Invoice</button>' : ''}
      <button class="btn primary">Done</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('[data-print]').addEventListener('click', () => printQuote(q));
      dlg.querySelector('[data-wa]')?.addEventListener('click', () => {
        const text = [`QUOTATION ${q.no} — ${store.settings.shopName}`, `For: ${q.customer}`, '', ...q.lines.map((l, i) => `${i + 1}. ${l.name} — ${fmtQty(l.qty)} × ${fmt(l.price)} = ${fmt(l.qty * l.price)}`), '', q.discount ? `Discount: −${fmt(q.discount)}` : '', `TOTAL: ${fmt(q.total)}`, `Valid until ${fmtDate(q.validUntil)}`].filter((x) => x !== '').join('\n');
        window.open(`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
      dlg.querySelector('[data-till]')?.addEventListener('click', () => {
        try { sessionStorage.setItem('cart', JSON.stringify(q.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price })))); } catch { /* ignore */ }
        close(); location.hash = '#/sell'; setTimeout(() => location.reload(), 50);
      });
      dlg.querySelector('[data-invoice]')?.addEventListener('click', async () => {
        close();
        if (!(await confirmBox(`Invoice ${fmt(q.total)} to ${q.customer}? The items leave stock now and ${q.customer} will owe this amount.`, { ok: 'Invoice on account' }))) return;
        try { const sale = store.invoiceQuote(q); toast(`Invoiced — ${q.customer} owes ${fmt(sale.balanceAfter)}`); setTimeout(() => printInvoice(sale), 200); } catch (e) { toast(e.message, { kind: 'err' }); }
      });
      dlg.querySelector('[data-sale]')?.addEventListener('click', () => { close(); setTimeout(() => showReceipt(store.data.sales.find((s) => s.id === q.saleId)), 120); });
      dlg.querySelector('[data-del]').addEventListener('click', async () => {
        close();
        if (await confirmBox(`Delete quotation ${q.no}?`, { ok: 'Delete', danger: true })) { store.deleteQuote(q.id); toast('Quotation deleted'); }
      });
    },
  });
}

function docHead(title, rows) {
  const st = store.settings;
  return `<div class="head"><div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address)}<br>${esc(st.phone)} ${esc(st.email)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div></div>
    <div style="text-align:right"><h1>${title}</h1><div>${rows}</div></div></div>`;
}
function linesTable(lines, discount, total, tax, taxRate) {
  return `<table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
    <tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td><td class="r">${fmt(l.price)}</td><td class="r">${fmt(l.qty * l.price)}</td></tr>`).join('')}
    ${discount ? `<tr><td colspan="4">Discount</td><td class="r">−${fmt(discount)}</td></tr>` : ''}
    <tr class="tot"><td colspan="4">Total</td><td class="r">${fmt(total)}</td></tr>
    ${tax ? `<tr><td colspan="4"><small>Includes ${esc(store.settings.taxName || 'VAT')} ${taxRate}%</small></td><td class="r"><small>${fmt(tax)}</small></td></tr>` : ''}</tbody></table>`;
}

export function printQuote(q) {
  const c = store.customer(q.customerId);
  printHtml(`Quotation ${q.no}`, `
    ${docHead('Quotation', `No. <b>${esc(q.no)}</b><br>Date: ${fmtDate(q.ts)}<br>Valid until: ${fmtDate(q.validUntil)}`)}
    <div class="box"><b>To:</b> ${esc(q.customer)}${c ? '<br>' + esc([c.phone, c.email, c.note].filter(Boolean).join(' · ')) : ''}</div>
    ${linesTable(q.lines, q.discount, q.total, q.tax, q.taxRate)}
    ${q.note ? `<p>${esc(q.note)}</p>` : ''}
    <div class="sig"><div>Prepared by</div><div>Accepted by (customer)</div></div>`);
}

/** Invoice for a sale on account: what the customer owes and how to pay. */
export function printInvoice(s) {
  const st = store.settings;
  const c = store.customer(s.customerId);
  const due = s.ts + num(st.invoiceDays || 14) * DAY;
  printHtml(`Invoice ${s.no}`, `
    ${docHead('Invoice', `No. <b>${esc(s.no)}</b><br>Date: ${fmtDate(s.ts)}<br>Due: ${fmtDate(due)}`)}
    <div class="box"><b>Bill to:</b> ${esc(s.customer)}${c ? '<br>' + esc([c.phone, c.email, c.note].filter(Boolean).join(' · ')) : ''}</div>
    ${linesTable(s.lines, s.discount, s.total, s.tax, s.taxRate)}
    ${num(s.refunded) ? `<p>Less returns: −${fmt(s.refunded)} · Amount due: <b>${fmt(num(s.total) - num(s.refunded))}</b></p>` : ''}
    ${c ? `<p>Total balance on your account: <b>${fmt(c.balance)}</b></p>` : ''}
    ${st.paymentDetails ? `<div class="box"><b>How to pay:</b><br>${esc(st.paymentDetails).replace(/\n/g, '<br>')}</div>` : ''}
    <p>${esc(st.receiptFooter || 'Thank you!')}</p>`);
}
