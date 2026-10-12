// Customers: who owes what (credit sales), payments received and each customer's history.
import { store } from '../store.js';
import { num } from '../calc.js';
import { esc, fmt, fmtDate, icon, modal, toast, field, emptyState, confirmBox, printHtml } from '../ui.js';
import { showReceipt } from './sell.js';

const waPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '255');

/** Draw the customers list into `body` (used as a tab of Money). */
export function drawCustomers(body, state) {
  const q = (state.q || '').toLowerCase();
  const only = state.onlyOwing;
  const all = [...store.data.customers].sort((a, b) => num(b.balance) - num(a.balance) || a.name.localeCompare(b.name));
  const list = all.filter((c) => (!only || num(c.balance) > 0) && (!q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)));
  const owed = store.owedByCustomers();
  const owing = all.filter((c) => num(c.balance) > 0).length;
  body.innerHTML = `
    <div class="stats compact">
      <div><span>Customers</span><strong>${all.length}</strong></div>
      <div class="${owed ? 'warn' : ''}"><span>Owed to you</span><strong>${fmt(owed)}</strong></div>
      <div><span>Customers owing</span><strong>${owing}</strong></div>
    </div>
    <div class="toolbar">
      <div class="searchbar">${icon('search')}<input type="search" id="cu-q" placeholder="Search name or phone" value="${esc(state.q || '')}" autocomplete="off"></div>
      <div class="seg"><button data-cu-f="all" class="${only ? '' : 'on'}">All</button><button data-cu-f="owing" class="${only ? 'on' : ''}">Owing</button></div>
      <button class="btn primary" data-cu-new>${icon('plus')}Add customer</button>
    </div>
    ${list.length ? `<ul class="rows card">${list.map((c) => `
      <li class="row tap" data-cust="${c.id}">
        <div class="grow"><b>${esc(c.name)}</b><small>${esc(c.phone || 'No phone')}${c.lastVisit ? ' · last visit ' + fmtDate(c.lastVisit) : ''}</small></div>
        ${num(c.balance) > 0 ? `<span class="num neg">owes ${fmt(c.balance)}</span>` : `<span class="num muted">${fmt(c.spent || 0)} spent</span>`}
      </li>`).join('')}</ul>`
      : emptyState(all.length ? 'No match' : 'No customers yet', all.length ? 'Try a different search.' : 'Add regular customers, or type a name at the till. Credit sales need a customer.')}`;
  const qEl = body.querySelector('#cu-q');
  qEl.addEventListener('input', () => { state.q = qEl.value.trim(); drawCustomers(body, state); const n = body.querySelector('#cu-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  body.querySelectorAll('[data-cu-f]').forEach((b) => { b.onclick = () => { state.onlyOwing = b.dataset.cuF === 'owing'; drawCustomers(body, state); }; });
  body.querySelector('[data-cu-new]').onclick = () => openCustomerForm();
  body.querySelectorAll('[data-cust]').forEach((r) => { r.onclick = () => openCustomer(r.dataset.cust); });
}

export function openCustomerForm(c = null, { onSaved } = {}) {
  modal({
    title: c ? `Edit ${c.name}` : 'Add customer',
    body: `
      ${field('Name', `<input name="name" required autofocus value="${esc(c?.name)}">`)}
      <div class="grid2">
        ${field('Phone / WhatsApp', `<input name="phone" type="tel" value="${esc(c?.phone)}" placeholder="0712 345 678">`)}
        ${field('Email', `<input name="email" type="email" value="${esc(c?.email)}">`)}
      </div>
      ${field('Credit limit (TSh)', `<input name="creditLimit" type="number" inputmode="numeric" min="0" step="1" value="${c?.creditLimit || ''}" placeholder="No limit">`, 'You are warned at the till when a credit sale would go over this.')}
      ${field('Note', `<input name="note" value="${esc(c?.note)}" placeholder="e.g. school, office, address">`)}`,
    actions: `${c ? '<button type="button" class="btn ghost danger" data-del>Delete</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>`,
    onMount: (dlg, close) => dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmBox(`Delete customer ${c.name}? Their past sales stay in your reports.`, { ok: 'Delete', danger: true })) {
        try { store.deleteCustomer(c); toast('Customer deleted'); } catch (e) { toast(e.message, { kind: 'err' }); }
      }
    }),
    onSubmit: (v) => {
      const dup = store.data.customers.find((x) => x.id !== c?.id && x.name.toLowerCase() === v.name.trim().toLowerCase() && (x.phone || '') === (v.phone || '').trim());
      if (dup) throw new Error(`${dup.name} is already a customer`);
      const id = store.saveCustomer({ ...v, id: c?.id });
      toast(c ? 'Customer saved' : `${v.name} added`);
      onSaved?.(id);
    },
  });
}

/** One customer: balance, record a payment, history of sales and payments. */
export function openCustomer(id) {
  const c = store.customer(id);
  if (!c) return;
  const sales = store.data.sales.filter((s) => s.customerId === id && !s.voided).map((s) => ({ ts: s.ts, kind: 'sale', s }));
  const pays = store.data.payments.filter((p) => p.customerId === id).map((p) => ({ ts: p.ts, kind: 'pay', p }));
  const history = [...sales, ...pays].sort((a, b) => b.ts - a.ts).slice(0, 40);
  const owes = num(c.balance) > 0;
  modal({
    title: c.name,
    wide: true,
    body: `
      <div class="stats compact">
        <div class="${owes ? 'warn' : ''}"><span>Owes you</span><strong>${fmt(Math.max(0, c.balance || 0))}</strong></div>
        <div><span>Total spent</span><strong>${fmt(c.spent || 0)}</strong></div>
        ${num(c.creditLimit) ? `<div><span>Credit limit</span><strong>${fmt(c.creditLimit)}</strong></div>` : ''}
      </div>
      <p class="muted small">${[c.phone, c.email, c.note].filter(Boolean).map(esc).join(' · ') || 'No contact details'}</p>
      <h3>Recent activity</h3>
      ${history.length ? `<ul class="rows">${history.map((h) => h.kind === 'sale'
        ? `<li class="row tap" data-sale="${h.s.id}"><div class="grow">${h.s.type === 'refund' ? 'Refund' : 'Sale'} ${esc(h.s.no)}<small>${fmtDate(h.ts)} · ${esc(h.s.pay)}${h.s.credit ? ' (on account)' : ''}</small></div><span class="num ${h.s.credit ? 'neg' : ''}">${fmt(h.s.total)}</span></li>`
        : `<li class="row"><div class="grow">Payment received<small>${fmtDate(h.ts)} · ${esc(h.p.method)}${h.p.note ? ' · ' + esc(h.p.note) : ''}</small></div><span class="num up">+${fmt(h.p.amount)}</span></li>`).join('')}</ul>`
        : '<p class="muted">Nothing in the last two months.</p>'}`,
    actions: `
      <button type="button" class="btn ghost" data-edit>${icon('edit')}<span class="hide-sm">Edit</span></button>
      ${owes && c.phone ? `<button type="button" class="btn ghost" data-remind>${icon('wa')}<span class="hide-sm">Remind</span></button>` : ''}
      ${owes ? `<button type="button" class="btn ghost" data-statement>${icon('print')}<span class="hide-sm">Statement</span></button>` : ''}
      ${owes ? '<button type="button" class="btn accent" data-pay>Record payment</button>' : ''}
      <button class="btn primary">Done</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('[data-edit]').addEventListener('click', () => { close(); openCustomerForm(c); });
      dlg.querySelector('[data-pay]')?.addEventListener('click', () => { close(); openPayment(c); });
      dlg.querySelector('[data-remind]')?.addEventListener('click', () => {
        const st = store.settings;
        const text = `Habari ${c.name}, this is ${st.shopName}. Your balance with us is ${fmt(c.balance)}. Thank you!`;
        window.open(`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
      dlg.querySelector('[data-statement]')?.addEventListener('click', () => printStatement(c, history));
      dlg.querySelectorAll('[data-sale]').forEach((r) => r.addEventListener('click', () => { close(); setTimeout(() => showReceipt(store.data.sales.find((s) => s.id === r.dataset.sale)), 120); }));
    },
  });
}

function printStatement(c, history) {
  const st = store.settings;
  printHtml(`Statement ${c.name}`, `
    <div class="head"><div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address)}<br>${esc(st.phone)}</div></div>
      <div style="text-align:right"><h1>Statement</h1><div>${fmtDate(Date.now())}</div></div></div>
    <div class="box"><b>Customer:</b> ${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
    <table><thead><tr><th>Date</th><th>Details</th><th class="r">Amount</th></tr></thead>
    <tbody>${history.map((h) => h.kind === 'sale'
      ? `<tr><td>${fmtDate(h.ts)}</td><td>${h.s.type === 'refund' ? 'Refund' : 'Sale'} ${esc(h.s.no)}${h.s.credit ? ' (on account)' : ` (${esc(h.s.pay)})`}</td><td class="r">${fmt(h.s.total)}</td></tr>`
      : `<tr><td>${fmtDate(h.ts)}</td><td>Payment (${esc(h.p.method)})</td><td class="r">−${fmt(h.p.amount)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="2">Balance owed</td><td class="r">${fmt(c.balance)}</td></tr></tbody></table>`);
}

export function openPayment(c) {
  const methods = (store.settings.payMethods || ['Cash']).filter((m) => !store.isCreditPay(m));
  modal({
    title: `Payment from ${c.name}`,
    body: `
      <p>Owes <b>${fmt(c.balance)}</b>.</p>
      ${field('Amount paid (TSh)', `<input name="amount" type="number" inputmode="numeric" min="1" step="1" required autofocus value="${Math.max(0, Math.round(num(c.balance)))}">`)}
      <div class="field"><span class="field-label">Paid with</span>
        <div class="chips wrap">${methods.map((m, i) => `<label class="chip radio"><input type="radio" name="method" value="${esc(m)}" ${i === 0 ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div></div>
      ${field('Note (optional)', '<input name="note">')}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save payment</button>',
    onSubmit: (v) => {
      store.receivePayment(c, { amount: v.amount, method: v.method, note: v.note });
      toast(`Payment of ${fmt(v.amount)} saved — ${c.name} now owes ${fmt(Math.max(0, num(c.balance) - num(v.amount)))}`);
    },
  });
}
