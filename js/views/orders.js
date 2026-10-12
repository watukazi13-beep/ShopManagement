import { store } from '../store.js';
import { num, DAY } from '../calc.js';
import { esc, fmt, fmtQty, fmtDate, icon, modal, toast, field, emptyState, confirmBox, printHtml, toInputDate, fromInputDate } from '../ui.js';

const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'warn'], quoted: ['Quote received', 'good'], closed: ['Goods received', 'good'] };

export default {
  title: 'Orders',
  mount(el, params) {
    let tab = params.get('tab') || 'rfq';
    el.innerHTML = `
      <div class="page-head"><h1>Orders</h1></div>
      <div class="seg tabs" role="tablist">
        <button data-tab="rfq">Requests</button>
        <button data-tab="received">Received</button>
        <button data-tab="suppliers">Suppliers</button>
      </div>
      <div id="orders-body"></div>`;
    const body = el.querySelector('#orders-body');

    const draw = () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      if (!store.ready) { body.innerHTML = '<div class="loading">Loading…</div>'; return; }
      if (tab === 'rfq') drawRfqs();
      if (tab === 'received') drawReceived();
      if (tab === 'suppliers') drawSuppliers();
    };

    function drawRfqs() {
      const lows = store.lowStock().length;
      const list = [...store.data.rfqs].sort((a, b) => b.ts - a.ts);
      body.innerHTML = `
        <div class="card soft">
          <p>${lows ? `<b>${lows} item${lows > 1 ? 's' : ''}</b> ${lows > 1 ? 'need' : 'needs'} restocking. ` : 'No items are low right now. '}A request is drafted for each supplier with the quantity needed to fill up your stock.${store.settings.autoMonthlyRfq !== false ? ' Drafts are also created automatically at the start of every month.' : ''}</p>
          <div class="row-btns">
            <button class="btn primary" data-act="gen" ${lows ? '' : 'disabled'}>${icon('orders')}Create for low stock</button>
            <button class="btn ghost" data-act="gen-all">Create for all items</button>
          </div>
        </div>
        ${list.length ? `<ul class="rows card">${list.map((r) => {
          const [t, c] = STATUS[r.status] || STATUS.draft;
          return `<li class="row tap" data-rfq="${r.id}">
            <div class="grow"><b>${esc(r.supplierName || 'Any supplier')}</b><small>${esc(r.no)} · ${fmtDate(r.ts)} · ${r.lines.length} item${r.lines.length === 1 ? '' : 's'}${r.auto ? ' · monthly' : ''}</small></div>
            <span class="num hide-sm">≈ ${fmt(r.estimate)}</span>
            <span class="pill ${c}">${t}</span>
          </li>`;
        }).join('')}</ul>` : emptyState('No requests yet', 'Create one from your low stock, or wait for the monthly drafts.')}`;
    }

    function drawReceived() {
      const list = [...store.data.purchases].sort((a, b) => b.ts - a.ts);
      const unpaid = list.filter((p) => !p.paid).reduce((t, p) => t + num(p.total), 0);
      body.innerHTML = `
        <div class="row-btns spread">
          <p class="muted">${unpaid ? `Unpaid to suppliers: <b>${fmt(unpaid)}</b>` : 'Stock you bought in the last two months.'}</p>
          <button class="btn primary" data-act="receive">${icon('truck')}Receive stock</button>
        </div>
        ${list.length ? `<ul class="rows card">${list.map((p) => `
          <li class="row tap" data-purchase="${p.id}">
            <div class="grow"><b>${esc(p.supplierName || 'No supplier')}</b><small>${fmtDate(p.ts)} · ${p.lines.length} item${p.lines.length === 1 ? '' : 's'}${p.ref ? ' · ' + esc(p.ref) : ''}</small></div>
            <span class="num">${fmt(p.total)}</span>
            ${p.paid ? '' : '<span class="pill warn">Unpaid</span>'}
          </li>`).join('')}</ul>` : emptyState('Nothing received yet', 'Record deliveries here so stock and costs stay correct.')}`;
    }

    function drawSuppliers() {
      const list = [...store.data.suppliers].sort((a, b) => a.name.localeCompare(b.name));
      body.innerHTML = `
        <div class="row-btns spread"><p class="muted">Link items to a supplier so requests are grouped for them.</p>
          <button class="btn primary" data-act="new-sup">${icon('plus')}Add supplier</button></div>
        ${list.length ? `<ul class="rows card">${list.map((s) => {
          const n = store.activeItems().filter((i) => i.supplierId === s.id).length;
          return `<li class="row tap" data-sup="${s.id}"><div class="grow"><b>${esc(s.name)}</b><small>${[s.contact, s.phone, s.email].filter(Boolean).map(esc).join(' · ') || 'No contact details'}</small></div><span class="muted small">${n} item${n === 1 ? '' : 's'}</span></li>`;
        }).join('')}</ul>` : emptyState('No suppliers yet', 'Add the people and companies you buy from.')}`;
    }

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]')?.dataset.tab;
      if (t) { tab = t; history.replaceState(null, '', `#/orders?tab=${t}`); draw(); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'gen' || a === 'gen-all') {
        const ids = store.generateRfqs({ includeAll: a === 'gen-all' });
        toast(ids.length ? `${ids.length} draft request${ids.length > 1 ? 's' : ''} created` : 'No items to request', { kind: ids.length ? 'ok' : 'err' });
        if (ids.length === 1) setTimeout(() => openRfq(ids[0]), 100);
      }
      if (a === 'receive') openPurchaseForm();
      if (a === 'new-sup') openSupplierForm();
      const r = e.target.closest('[data-rfq]')?.dataset.rfq;
      if (r) openRfq(r);
      const p = e.target.closest('[data-purchase]')?.dataset.purchase;
      if (p) openPurchase(store.data.purchases.find((x) => x.id === p));
      const s = e.target.closest('[data-sup]')?.dataset.sup;
      if (s) openSupplierForm(store.supplier(s));
    });

    draw();
    if (params.get('rfq')) setTimeout(() => openRfq(params.get('rfq')), 200);
    return { update: draw };
  },
};

// ---------- Item line editor shared by RFQ and purchase forms ----------
function itemOptions() {
  return `<datalist id="items-dl">${store.activeItems().filter((i) => !i.service).map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>`;
}
function lineRow(l, withCost) {
  return `<div class="line-row">
    <input class="li-name" list="items-dl" placeholder="Item" value="${esc(l.name || '')}" data-id="${l.itemId || ''}" aria-label="Item">
    <input class="li-qty" type="number" inputmode="decimal" step="any" min="0" placeholder="Qty" value="${l.qty ?? ''}" aria-label="Quantity">
    ${withCost ? `<input class="li-cost" type="number" inputmode="decimal" step="any" min="0" placeholder="Unit cost" value="${l.cost ?? ''}" aria-label="Cost per unit">` : ''}
    <button type="button" class="icon-btn" data-del-line aria-label="Remove line">${icon('x')}</button>
  </div>`;
}
function readLines(dlg) {
  const byName = new Map(store.activeItems().map((i) => [i.name.toLowerCase(), i]));
  const out = [];
  for (const row of dlg.querySelectorAll('.line-row')) {
    const name = row.querySelector('.li-name').value.trim();
    if (!name) continue;
    const item = byName.get(name.toLowerCase());
    if (!item) throw new Error(`“${name}” is not in your items. Add it in Stock first.`);
    out.push({ itemId: item.id, name: item.name, unit: item.unit || 'pcs', qty: num(row.querySelector('.li-qty').value), cost: num(row.querySelector('.li-cost')?.value), lastCost: num(item.lastCost || item.cost) });
  }
  return out;
}
function wireLines(dlg, withCost, onChange) {
  const box = dlg.querySelector('.lines');
  dlg.querySelector('[data-add-line]').addEventListener('click', () => {
    box.insertAdjacentHTML('beforeend', lineRow({}, withCost));
    box.lastElementChild.querySelector('input').focus();
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-del-line]')) { e.target.closest('.line-row').remove(); onChange?.(); }
  });
  box.addEventListener('change', (e) => {
    if (!e.target.classList.contains('li-name')) return;
    const it = store.activeItems().find((i) => i.name.toLowerCase() === e.target.value.trim().toLowerCase());
    const row = e.target.closest('.line-row');
    if (it && withCost && !row.querySelector('.li-cost').value) row.querySelector('.li-cost').value = Math.round(num(it.lastCost || it.cost));
    onChange?.();
  });
  box.addEventListener('input', () => onChange?.());
}
function supplierSelect(selected) {
  const sups = [...store.data.suppliers].sort((a, b) => a.name.localeCompare(b.name));
  return `<select name="supplierId"><option value="">— No supplier —</option>${sups.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
}

// ---------- Receive stock ----------
export function openPurchaseForm({ rfq = null } = {}) {
  const start = rfq ? rfq.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, cost: l.quotedCost || l.lastCost || '' })) : [{}, {}];
  modal({
    title: 'Receive stock',
    wide: true,
    body: `
      <div class="grid3">
        ${field('Supplier', supplierSelect(rfq?.supplierId))}
        ${field('Date', `<input type="date" name="date" value="${toInputDate(Date.now())}" required>`)}
        ${field('Invoice / delivery no.', '<input name="ref" autocomplete="off">')}
      </div>
      ${itemOptions()}
      <div class="line-head"><span>Item</span><span>Qty</span><span>Unit cost (TSh)</span><span></span></div>
      <div class="lines">${start.map((l) => lineRow(l, true)).join('')}</div>
      <button type="button" class="btn ghost small" data-add-line>${icon('plus')}Add line</button>
      <p class="total-row"><span>Total</span><strong id="pf-total">${fmt(0)}</strong></p>
      <label class="check"><input type="checkbox" name="paid" checked> Paid already</label>
      ${field('Note (optional)', '<input name="note">')}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Add to stock</button>',
    onMount: (dlg) => {
      const total = () => {
        let t = 0;
        dlg.querySelectorAll('.line-row').forEach((r) => { t += num(r.querySelector('.li-qty').value) * num(r.querySelector('.li-cost').value); });
        dlg.querySelector('#pf-total').textContent = fmt(t);
      };
      wireLines(dlg, true, total);
      total();
    },
    onSubmit: (v, { form }) => {
      const lines = readLines(form);
      const ts = fromInputDate(v.date);
      store.receivePurchase({ supplierId: v.supplierId, ref: v.ref, ts, lines, paid: v.paid === 'on', note: v.note, rfqId: rfq?.id || '' });
      toast('Stock received and costs updated');
    },
  });
}

function openPurchase(p) {
  if (!p) return;
  modal({
    title: `Received ${fmtDate(p.ts)}`,
    body: `
      <p class="muted">${esc(p.supplierName || 'No supplier')}${p.ref ? ' · ' + esc(p.ref) : ''} · ${esc(p.no)}</p>
      <table class="table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Amount</th></tr></thead>
      <tbody>${p.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="r num">${fmtQty(l.qty)} ${esc(l.unit || '')}</td><td class="r num">${fmt(l.cost)}</td><td class="r num">${fmt(l.qty * l.cost)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3">Total</td><td class="r num">${fmt(p.total)}</td></tr></tbody></table>
      ${p.note ? `<p>${esc(p.note)}</p>` : ''}`,
    actions: `<button type="button" class="btn ghost" data-paid>${p.paid ? 'Mark as unpaid' : 'Mark as paid'}</button><button class="btn primary">Done</button>`,
    onMount: (dlg, close) => dlg.querySelector('[data-paid]').addEventListener('click', () => { store.markPurchasePaid(p, !p.paid); close(); toast(p.paid ? 'Marked unpaid' : 'Marked paid'); }),
  });
}

// ---------- Suppliers ----------
export function openSupplierForm(s = null) {
  modal({
    title: s ? s.name : 'Add supplier',
    body: `
      ${field('Name', `<input name="name" required autofocus value="${esc(s?.name)}">`)}
      ${field('Contact person', `<input name="contact" value="${esc(s?.contact)}">`)}
      <div class="grid2">
        ${field('Phone / WhatsApp', `<input name="phone" type="tel" value="${esc(s?.phone)}" placeholder="0712 345 678">`)}
        ${field('Email', `<input name="email" type="email" value="${esc(s?.email)}">`)}
      </div>
      ${field('Address', `<input name="address" value="${esc(s?.address)}">`)}`,
    actions: `${s ? '<button type="button" class="btn ghost danger" data-del>Delete</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>`,
    onMount: (dlg, close) => dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmBox(`Delete supplier ${s.name}?`, { ok: 'Delete', danger: true })) { store.deleteSupplier(s.id); toast('Supplier deleted'); }
    }),
    onSubmit: (v) => { store.saveSupplier({ ...v, id: s?.id }); toast('Supplier saved'); },
  });
}

// ---------- Requests for quotation ----------
const waNumber = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '255' + d.slice(1); // Tanzania
  return d;
};

export function rfqText(r) {
  const st = store.settings;
  return [
    `REQUEST FOR QUOTATION ${r.no}`,
    `From: ${st.shopName}${st.phone ? ' (' + st.phone + ')' : ''}`,
    `Date: ${fmtDate(r.ts)}`,
    '',
    r.note || '',
    '',
    ...r.lines.map((l, i) => `${i + 1}. ${l.name} — ${fmtQty(l.qty)} ${l.unit}`),
    '',
    'Please reply with your unit prices and delivery time. Thank you.',
  ].join('\n');
}

function printRfq(r) {
  const st = store.settings;
  const sup = store.supplier(r.supplierId);
  printHtml(`${r.no}`, `
    <div class="head">
      <div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address)}<br>${esc(st.phone)} ${esc(st.email)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div></div>
      <div style="text-align:right"><h1>Request for quotation</h1><div>No. <b>${esc(r.no)}</b><br>Date: ${fmtDate(r.ts)}<br>Reply by: ${fmtDate(r.ts + 7 * DAY)}</div></div>
    </div>
    <div class="box"><b>To:</b> ${esc(sup?.name || r.supplierName || '')}<br>${esc([sup?.contact, sup?.phone, sup?.email, sup?.address].filter(Boolean).join(' · '))}</div>
    <p>${esc(r.note || '')}</p>
    <table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th class="r">Quantity</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
    <tbody>${r.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}${l.sku ? `<br><small class="muted">${esc(l.sku)}</small>` : ''}</td><td>${esc(l.unit)}</td><td class="r">${fmtQty(l.qty)}</td><td></td><td></td></tr>`).join('')}
    <tr class="tot"><td colspan="5">Total</td><td></td></tr></tbody></table>
    <p>Please state delivery time, payment terms and how long your prices are valid.</p>
    <div class="sig"><div>Requested by</div><div>Supplier signature &amp; stamp</div></div>`);
}

export function openRfq(id) {
  const r = store.data.rfqs.find((x) => x.id === id);
  if (!r) return;
  const sup = store.supplier(r.supplierId);
  const [st] = STATUS[r.status] || STATUS.draft;
  modal({
    title: `${r.no}`,
    wide: true,
    body: `
      <div class="grid2">
        ${field('Supplier', supplierSelect(r.supplierId))}
        ${field('Status', `<select name="status">${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
      </div>
      ${itemOptions()}
      <div class="line-head two"><span>Item</span><span>Qty</span><span></span></div>
      <div class="lines">${r.lines.map((l) => lineRow(l, false)).join('')}</div>
      <button type="button" class="btn ghost small" data-add-line>${icon('plus')}Add line</button>
      ${field('Message to supplier', `<textarea name="note" rows="2">${esc(r.note)}</textarea>`)}
      <p class="muted small">Estimated cost at last prices: ${fmt(r.estimate)} · ${esc(st)}</p>`,
    actions: `
      <button type="button" class="btn ghost danger" data-del>${icon('trash')}<span class="hide-sm">Delete</span></button>
      <button type="button" class="btn ghost" data-wa>${icon('wa')}WhatsApp</button>
      <button type="button" class="btn ghost" data-mail>${icon('mail')}<span class="hide-sm">Email</span></button>
      <button type="button" class="btn ghost" data-print>${icon('print')}<span class="hide-sm">Print / PDF</span></button>
      ${r.status !== 'closed' ? '<button type="button" class="btn ghost" data-receive>Goods arrived</button>' : ''}
      <button class="btn primary">Save</button>`,
    onMount: (dlg, close) => {
      wireLines(dlg, false);
      const current = () => {
        const f = dlg.querySelector('form');
        const lines = readLines(f).map(({ itemId, name, unit, qty, lastCost }) => ({ itemId, name, unit, qty, lastCost }));
        return { ...r, supplierId: f.supplierId.value, status: f.status.value, note: f.note.value, lines };
      };
      const persist = (extra = {}) => { const c = { ...current(), ...extra }; store.saveRfq(c); return { ...c, supplierName: store.supplier(c.supplierId)?.name || 'Any supplier' }; };
      const act = (sel, fn) => dlg.querySelector(sel)?.addEventListener('click', () => { try { fn(); } catch (e) { toast(e.message, { kind: 'err' }); } });
      act('[data-print]', () => printRfq(persist()));
      act('[data-wa]', () => {
        const c = persist({ status: r.status === 'draft' ? 'sent' : r.status });
        const s = store.supplier(c.supplierId);
        window.open(`https://wa.me/${waNumber(s?.phone)}?text=${encodeURIComponent(rfqText(c))}`, '_blank', 'noopener');
      });
      act('[data-mail]', () => {
        const c = persist({ status: r.status === 'draft' ? 'sent' : r.status });
        const s = store.supplier(c.supplierId);
        location.href = `mailto:${encodeURIComponent(s?.email || '')}?subject=${encodeURIComponent(`Request for quotation ${c.no} — ${store.settings.shopName}`)}&body=${encodeURIComponent(rfqText(c))}`;
      });
      act('[data-receive]', () => { const c = persist(); close(); openPurchaseForm({ rfq: c }); });
      act('[data-del]', async () => {
        close();
        if (await confirmBox(`Delete ${r.no}?`, { ok: 'Delete', danger: true })) { store.deleteRfq(r.id); toast('Request deleted'); }
      });
    },
    onSubmit: (v, { form }) => {
      const lines = readLines(form).map(({ itemId, name, unit, qty, lastCost }) => ({ itemId, name, unit, qty, lastCost }));
      store.saveRfq({ ...r, supplierId: v.supplierId, status: v.status, note: v.note, lines });
      toast('Request saved');
    },
  });
  void sup;
}
