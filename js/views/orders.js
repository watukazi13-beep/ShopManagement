import { store } from '../store.js';
import { num, DAY, docNo, packsText, packInfo, inPacks, orderQtyText, packRule, plural, unitPrice, lineAmount, parseOrderRows, bestItemMatch, normName } from '../calc.js';
import { layoutFor, visibleColumns, openLayoutEditor } from './doclayout.js';
import { esc, fmt, fmtQty, fmtDate, icon, modal, toast, field, emptyState, confirmBox, printHtml, toInputDate, fromInputDate, parseCsv } from '../ui.js';

const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'warn'], quoted: ['Quote received', 'good'], ordered: ['PO created', 'good'], closed: ['Goods received', 'good'] };
export const PO_STATUS = { draft: ['Draft', ''], ordered: ['Ordered', 'info'], partial: ['Partly received', 'warn'], received: ['Received', 'good'], cancelled: ['Cancelled', ''] };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const isLate = (po) => (po.status === 'ordered' || po.status === 'partial') && po.expectedTs && po.expectedTs < startOfToday();

export default {
  title: 'Orders',
  mount(el, params) {
    let tab = params.get('tab') || 'rfq';
    el.innerHTML = `
      <div class="page-head"><h1>Orders</h1></div>
      <div class="seg tabs" role="tablist">
        <button data-tab="rfq">Requests</button>
        <button data-tab="pos">POs</button>
        <button data-tab="received">Received</button>
        <button data-tab="suppliers">Suppliers</button>
      </div>
      <div id="orders-body"></div>`;
    const body = el.querySelector('#orders-body');

    const draw = () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      if (!store.ready) { body.innerHTML = '<div class="loading">Loading…</div>'; return; }
      if (tab === 'rfq') drawRfqs();
      if (tab === 'pos') drawPos();
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

    function drawPos() {
      const lows = store.lowStock().length;
      const order = { draft: 0, ordered: 1, partial: 1, received: 2, cancelled: 3 };
      const list = [...store.data.pos].sort((a, b) => (order[a.status] - order[b.status]) || b.ts - a.ts);
      body.innerHTML = `
        <div class="card soft">
          <p>Send a purchase order to a supplier. Once it is marked <b>Ordered</b>, its items show as <b>On order</b> in Stock, and the delivery is received from <b>Stock → Incoming</b>.</p>
          <div class="row-btns">
            <button class="btn primary" data-act="new-po">${icon('plus')}New purchase order</button>
            <button class="btn ghost" data-act="po-low" ${lows ? '' : 'disabled'}>Fill from low stock${lows ? ` (${lows})` : ''}</button>
            <button class="btn ghost" data-act="import-po">${icon('upload')}Import order</button>
          </div>
        </div>
        ${list.length ? `<ul class="rows card">${list.map((po) => {
          const [t, c] = PO_STATUS[po.status] || PO_STATUS.draft;
          const done = po.lines.filter((l) => num(l.received) >= num(l.qty)).length;
          return `<li class="row tap" data-po="${po.id}">
            <div class="grow"><b>${esc(po.supplierName || 'Any supplier')}</b><small>${esc(po.no)} · ${fmtDate(po.ts)} · ${po.lines.length} item${po.lines.length === 1 ? '' : 's'}${po.status === 'partial' ? ` · ${done}/${po.lines.length} arrived` : ''}${po.status === 'ordered' || po.status === 'partial' ? ` · expected ${fmtDate(po.expectedTs)}` : ''}${po.auto ? ' · weekly' : ''}</small></div>
            <span class="num hide-sm">${fmt(po.total)}</span>
            ${isLate(po) ? '<span class="pill bad">Late</span>' : ''}<span class="pill ${c}">${t}</span>
          </li>`;
        }).join('')}</ul>` : emptyState('No purchase orders yet', 'Create one, or fill one from your low stock.')}`;
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
      if (a === 'new-po') openPo(null);
      if (a === 'import-po') openImportOrder();
      if (a === 'po-low') {
        const ids = store.generatePos();
        toast(ids.length ? `${ids.length} draft purchase order${ids.length > 1 ? 's' : ''} created` : 'Everything low is already on order', { kind: ids.length ? 'ok' : 'err' });
        if (ids.length === 1) setTimeout(() => openPo(ids[0]), 100);
      }
      const po = e.target.closest('[data-po]')?.dataset.po;
      if (po) openPo(po);
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
    if (params.get('po')) setTimeout(() => openPo(params.get('po')), 200);
    return { update: draw };
  },
};

// ---------- Item line editor shared by RFQ and purchase forms ----------
function itemOptions() {
  return `<datalist id="items-dl">${store.activeItems().filter((i) => !i.service).map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>`;
}
const round3 = (n) => Math.round(num(n) * 1000) / 1000;
const itemByName = (name) => store.activeItems().find((i) => i.name.toLowerCase() === String(name || '').trim().toLowerCase());

/** Order unit choices for an item: its buying unit (e.g. "carton · 24 pcs") and single pieces. Value = pieces per unit. */
function unitOptions(pack, pieceUnit, big) {
  const pc = pieceUnit || 'pcs';
  if (!pack) return `<option value="1">${esc(pc)}</option>`;
  return `<option value="${pack.per}" ${big ? 'selected' : ''}>${esc(pack.unit)} · ${fmtQty(pack.per)} ${esc(pc)}</option><option value="1" ${big ? '' : 'selected'}>${esc(pc)}</option>`;
}
/** The small line under a row: "= 48 pcs" when ordering cartons, or "= 2 cartons" when ordering pieces. */
function lineHint(qtyShown, factor, pack, pieceUnit) {
  const q = num(qtyShown);
  if (!pack || !q) return '';
  const pcs = q * factor;
  return factor > 1 ? `= ${fmtQty(round3(pcs))} ${pieceUnit || 'pcs'} into stock · ${packRule(pack, pieceUnit)}` : (packsText(pcs, { packSize: pack.per, buyUnit: pack.unit, unit: pieceUnit }) ? `= ${packsText(pcs, { packSize: pack.per, buyUnit: pack.unit, unit: pieceUnit })}` : '');
}
/** How a saved line was ordered: 2 cartons of 24 at TSh 36,000 per carton, or 10 pcs at TSh 2,000. */
function asOrdered(l) {
  const it = store.item(l.itemId);
  const pc = l.unit || it?.unit || 'pcs';
  if (l.ordUnit) {
    // In the supplier's unit; pieces per unit may only be known once the goods arrive.
    const per = l.perOk ? num(l.packSize) : 0;
    const unitIsPiece = l.ordUnit === 'pcs';
    return {
      ord: true, perKnown: per > 0, pack: per > 1 ? { unit: l.ordUnit, per } : null, big: !unitIsPiece, f: per || 1, pc,
      pieces: per ? num(l.ordQty) * per : 0, qty: num(l.ordQty), unit: unitIsPiece ? pc : l.ordUnit,
      unitLabel: unitIsPiece ? cap(pc) : per ? `${cap(l.ordUnit)} of ${fmtQty(per)} ${pc}` : cap(l.ordUnit),
      price: num(l.ordPrice),
    };
  }
  const pack = packInfo(l, it);
  const big = !!pack && inPacks(l, it);
  const f = big ? pack.per : 1;
  return {
    pack, big, f, pc, pieces: num(l.qty),
    qty: round3(num(l.qty) / f),
    unit: big ? pack.unit : pc,
    unitLabel: big ? `${cap(pack.unit)} of ${fmtQty(pack.per)} ${pc}` : cap(pc),
    price: num(l.cost) * f,
  };
}
const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
/** "2 cartons × 24 pcs = 48 pcs" or "10 pcs" */
function orderedText(o, qty = o.pieces) {
  if (o.ord && !o.perKnown) return `${fmtQty(o.qty)} ${plural(o.unit, o.qty)} (pieces counted on arrival)`;
  if (!o.big) return `${fmtQty(qty)} ${o.pc}`;
  const n = round3(num(qty) / o.f);
  return `${fmtQty(n)} ${plural(o.unit, n)} × ${fmtQty(o.f)} ${o.pc} = ${fmtQty(qty)} ${o.pc}`;
}

function lineRow(l, withCost) {
  if (l.ordUnit) {
    // A line in the supplier's unit (imported order): quantity and price are per that unit.
    const o = asOrdered(l);
    return `<div class="line-row" data-ord="${esc(l.ordUnit)}" data-per="${num(l.packSize) || ''}" data-per-ok="${l.perOk ? 1 : ''}" data-src="${esc(l.srcName || '')}">
    <input class="li-name" list="items-dl" placeholder="Item" value="${esc(l.name || '')}" data-id="${l.itemId || ''}" aria-label="Item">
    <label class="li-f"><span>Qty</span><input class="li-qty" type="number" inputmode="decimal" step="any" min="0" value="${num(l.ordQty)}" aria-label="Quantity"></label>
    <label class="li-f"><span>Unit</span><select class="li-unit" aria-label="Order unit" disabled><option value="${o.f}">${esc(o.unitLabel)}</option></select></label>
    ${withCost ? `<label class="li-f"><span>Price per unit</span><input class="li-cost" type="number" inputmode="decimal" step="any" min="0" value="${Math.round(num(l.ordPrice) * 100) / 100}" aria-label="Price per unit"></label>` : ''}
    <button type="button" class="icon-btn" data-del-line aria-label="Remove line">${icon('x')}</button>
    <small class="li-pack">${o.perKnown ? `= ${fmtQty(o.pieces)} ${esc(o.pc)} into stock` : `Pieces in 1 ${esc(o.unit)} are counted when the goods arrive`}${l.srcName && normName(l.srcName) !== normName(l.name) ? ` · supplier calls it “${esc(l.srcName)}”` : ''}</small>
  </div>`;
  }
  const it = l.itemId ? store.item(l.itemId) : null;
  const pack = it || l.packSize ? packInfo(l, it) : null;
  const big = !!pack && inPacks(l, it);
  const f = big ? pack.per : 1;
  const qty = l.qty === undefined || l.qty === '' ? '' : round3(num(l.qty) / f);
  const cost = l.cost === undefined || l.cost === '' ? '' : Math.round(num(l.cost) * f * 100) / 100;
  const pc = it?.unit || l.unit || 'pcs';
  return `<div class="line-row">
    <input class="li-name" list="items-dl" placeholder="Item" value="${esc(l.name || '')}" data-id="${l.itemId || ''}" aria-label="Item">
    <label class="li-f"><span>Qty</span><input class="li-qty" type="number" inputmode="decimal" step="any" min="0" placeholder="Qty" value="${qty}" aria-label="Quantity"></label>
    <label class="li-f"><span>Unit</span><select class="li-unit" aria-label="Order unit" ${pack ? '' : 'disabled'}>${unitOptions(pack, pc, big)}</select></label>
    ${withCost ? `<label class="li-f"><span>Price per unit</span><input class="li-cost" type="number" inputmode="decimal" step="any" min="0" placeholder="Price" value="${cost}" aria-label="Price per unit"></label>` : ''}
    <button type="button" class="icon-btn" data-del-line aria-label="Remove line">${icon('x')}</button>
    ${!withCost && it && !(num(it.maxStock) > 0) ? '<small class="li-note">Max not set — quantity is an estimate. Set it in Stock → Min / max.</small>' : ''}
    <small class="li-pack">${esc(lineHint(qty, f, pack, pc))}</small>
  </div>`;
}
/** Read the rows back into lines counted in pieces (qty) with the price per piece (cost). */
function readLines(dlg) {
  const out = [];
  for (const row of dlg.querySelectorAll('.line-row')) {
    const name = row.querySelector('.li-name').value.trim();
    if (!name) continue;
    const item = itemByName(name);
    if (!item) throw new Error(`“${name}” is not in your items. Add it in Stock first.`);
    if (row.dataset.ord) {
      out.push({
        itemId: item.id, name: item.name, unit: item.unit || 'pcs', lastCost: num(item.lastCost || item.cost),
        ordUnit: row.dataset.ord, ordQty: num(row.querySelector('.li-qty').value), ordPrice: num(row.querySelector('.li-cost')?.value),
        packSize: num(row.dataset.per) || 0, perOk: !!row.dataset.perOk, srcName: row.dataset.src || '',
        qty: num(row.querySelector('.li-qty').value) * (num(row.dataset.per) || 1),
      });
      continue;
    }
    const f = num(row.querySelector('.li-unit')?.value) || 1;
    const pack = packInfo({}, item);
    out.push({
      itemId: item.id, name: item.name, unit: item.unit || 'pcs',
      qty: round3(num(row.querySelector('.li-qty').value) * f),
      cost: unitPrice(num(row.querySelector('.li-cost')?.value) / f),
      lastCost: num(item.lastCost || item.cost),
      packSize: pack ? pack.per : 1, buyUnit: pack ? pack.unit : '', inPacks: !!pack && f > 1,
    });
  }
  return out;
}
function wireLines(dlg, withCost, onChange) {
  const box = dlg.querySelector('.lines');
  const hint = (row) => {
    const it = itemByName(row.querySelector('.li-name').value);
    const pack = it ? packInfo({}, it) : null;
    if (row.dataset.ord) {
      const per = num(row.dataset.per);
      row.querySelector('.li-pack').textContent = row.dataset.perOk && per ? `= ${fmtQty(round3(num(row.querySelector('.li-qty').value) * per))} ${it?.unit || 'pcs'} into stock` : `Pieces in 1 ${row.dataset.ord} are counted when the goods arrive`;
      return;
    }
    row.querySelector('.li-pack').textContent = lineHint(row.querySelector('.li-qty').value, num(row.querySelector('.li-unit').value) || 1, pack, it?.unit);
  };
  dlg.querySelector('[data-add-line]').addEventListener('click', () => {
    box.insertAdjacentHTML('beforeend', lineRow({}, withCost));
    box.lastElementChild.querySelector('input').focus();
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-del-line]')) { e.target.closest('.line-row').remove(); onChange?.(); }
  });
  box.addEventListener('change', (e) => {
    const row = e.target.closest('.line-row');
    if (!row) return;
    if (e.target.classList.contains('li-name')) {
      // New item chosen: offer its buying unit (cartons, dozens…) first, with the price per that unit.
      delete row.dataset.ord; row.querySelector('.li-unit').disabled = false;
      const it = itemByName(e.target.value);
      const pack = it ? packInfo({}, it) : null;
      const sel = row.querySelector('.li-unit');
      sel.innerHTML = unitOptions(pack, it?.unit, !!pack);
      sel.disabled = !pack;
      const c = row.querySelector('.li-cost');
      if (it && withCost && !c.value) c.value = Math.round(num(it.lastCost || it.cost) * (num(sel.value) || 1));
    }
    if (e.target.classList.contains('li-unit')) {
      // Switching cartons ↔ pieces keeps the same amount: 2 cartons of 24 becomes 48 pcs.
      const prev = num(e.target.dataset.prev) || num([...e.target.options].find((o) => o.value !== e.target.value)?.value) || 1;
      const now = num(e.target.value) || 1;
      const q = row.querySelector('.li-qty'), c = row.querySelector('.li-cost');
      if (q.value !== '') q.value = round3(num(q.value) * prev / now);
      if (c && c.value !== '') c.value = Math.round(num(c.value) * now / prev * 100) / 100;
    }
    hint(row);
    row.querySelector('.li-unit').dataset.prev = row.querySelector('.li-unit').value;
    onChange?.();
  });
  box.addEventListener('focusin', (e) => { if (e.target.classList.contains('li-unit')) e.target.dataset.prev = e.target.value; });
  box.addEventListener('input', (e) => {
    const row = e.target.closest('.line-row');
    if (row) hint(row);
    onChange?.();
  });
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
      <div class="line-head"><span>Item</span><span>Qty</span><span>Unit</span><span>Price per unit (TSh)</span><span></span></div>
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
      <table class="table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price per unit</th><th class="r">Amount</th></tr></thead>
      <tbody>${p.lines.map((l) => { const o = asOrdered(l); return `<tr><td>${esc(l.name)}</td><td class="r num">${fmtQty(o.qty)} ${esc(plural(o.unit, o.qty))}${o.big && (!o.ord || o.perKnown) ? `<small class="muted block">${fmtQty(o.pieces)} ${esc(o.pc)}</small>` : ''}</td><td class="r num">${fmt(o.price)}${o.big ? `<small class="muted block">per ${esc(o.unit)}</small>` : ''}</td><td class="r num">${fmt(l.qty * l.cost)}</td></tr>`; }).join('')}
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

/** Cell value for one column of one line (plain text; html=true allows a small second line). */
function colValue(kind, key, l, i, costOf, html) {
  const cost = costOf(l);
  const o = asOrdered({ ...l, cost });
  switch (key) {
    case 'no': return String(i + 1);
    case 'sku': return l.sku || store.item(l.itemId)?.sku || '';
    case 'unit': return o.unitLabel;
    case 'qty': return fmtQty(o.qty);
    case 'pieces': return o.ord && !o.perKnown ? '' : `${fmtQty(o.pieces)} ${o.pc}`;
    case 'price':
      if (!cost) return '';
      return fmt(o.price) + (html && o.big && kind === 'po' ? `<br><small class="muted">${fmt(cost)} per ${o.pc === 'pcs' ? 'piece' : esc(o.pc)}</small>` : '');
    case 'amount': return l.ordUnit ? fmt(lineAmount(l)) : cost ? fmt(num(l.qty) * cost) : '';
    default: return '';
  }
}
const RIGHT = new Set(['qty', 'pieces', 'price', 'amount']);

/** The item table of an RFQ or PO, following its layout (filled / blank for the supplier / hidden). */
function docTable(kind, lines, layout, costOf) {
  const cols = visibleColumns(layout);
  const before = cols.filter((c) => c.key === 'no');
  const after = cols.filter((c) => c.key !== 'no');
  const th = (c) => `<th class="${RIGHT.has(c.key) ? 'r' : ''}">${esc(c.title)}</th>`;
  const td = (c, l, i) => (c.mode === 'blank'
    ? `<td class="blank${RIGHT.has(c.key) ? ' r' : ''}"></td>`
    : `<td class="${RIGHT.has(c.key) ? 'r' : ''}">${c.key === 'price' ? colValue(kind, c.key, l, i, costOf, true) : esc(colValue(kind, c.key, l, i, costOf))}</td>`);
  const amount = cols.find((c) => c.key === 'amount');
  const total = lines.reduce((t, l) => t + (l.ordUnit ? lineAmount(l) : num(l.qty) * costOf(l)), 0);
  const span = before.length + 1 + after.filter((c) => c !== amount).length;
  const amountIdx = after.indexOf(amount);
  const tail = amount ? after.length - amountIdx - 1 : 0;
  return `<div class="tbl-wrap"><table class="${cols.some((c) => c.mode === 'blank') ? 'has-blank' : ''}"><thead><tr>${before.map(th).join('')}<th>Item</th>${after.map(th).join('')}</tr></thead>
    <tbody>${lines.map((l, i) => `<tr>${before.map((c) => td(c, l, i)).join('')}<td>${esc(l.name)}</td>${after.map((c) => td(c, l, i)).join('')}</tr>`).join('')}
    ${amount ? `<tr class="tot"><td colspan="${span - tail}">Total</td><td class="r${amount.mode === 'blank' ? ' blank' : ''}">${amount.mode === 'fill' && total ? fmt(total) : ''}</td>${tail ? `<td colspan="${tail}"></td>` : ''}</tr>` : ''}</tbody></table></div>`;
}

/** The same lines as text for WhatsApp / email: blanks become "______" for the supplier to fill. */
function docTextLines(kind, lines, layout, costOf) {
  const cols = visibleColumns(layout).filter((c) => c.key !== 'no');
  return lines.map((l, i) => `${i + 1}. ${l.name}${cols.length ? ' — ' : ''}${cols.map((c) => `${c.title}: ${c.mode === 'blank' ? '______' : colValue(kind, c.key, l, i, costOf) || '______'}`).join(' · ')}`);
}

/** Header, supplier box and the optional parts (address, terms, message, signatures). */
function docParts(kind, layout) {
  const st = store.settings;
  return {
    address: layout.parts.address ? `<div class="box"><b>Deliver to:</b> ${esc(st.shopName)}${st.address ? ', ' + esc(st.address) : ''}${st.phone ? ' · ' + esc(st.phone) : ''}</div>` : '',
    terms: layout.parts.terms ? '<p><b>Payment terms:</b> ____________________________________________</p>' : '',
    sig: layout.parts.signatures ? `<div class="sig"><div>${kind === 'rfq' ? 'Requested by' : 'Authorised by'}</div><div>Supplier signature &amp; stamp</div></div>` : '',
  };
}

export function rfqText(r) {
  const st = store.settings;
  const L = layoutFor('rfq', r);
  const cost = (l) => num(l.quotedCost || l.lastCost);
  return [
    `REQUEST FOR QUOTATION ${r.no}`,
    `From: ${st.shopName}${st.phone ? ' (' + st.phone + ')' : ''}`,
    `Date: ${fmtDate(r.ts)}${L.parts.dates ? ` · Reply by: ${fmtDate(r.ts + 7 * DAY)}` : ''}`,
    ...(L.parts.address ? [`Deliver to: ${st.shopName}${st.address ? ', ' + st.address : ''}`] : []),
    '',
    ...(L.parts.note && r.note ? [r.note, ''] : []),
    ...docTextLines('rfq', r.lines, L, cost),
    '',
    ...(L.parts.terms ? ['Payment terms: ______', ''] : []),
    'Please reply with the figures marked ______ and your delivery time. Thank you.',
  ].join('\n');
}

function printRfq(r) {
  const st = store.settings;
  const sup = store.supplier(r.supplierId);
  const L = layoutFor('rfq', r);
  const P = docParts('rfq', L);
  printHtml(`${r.no}`, `
    <div class="head">
      <div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address)}<br>${esc(st.phone)} ${esc(st.email)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div></div>
      <div style="text-align:right"><h1>Request for quotation</h1><div>No. <b>${esc(r.no)}</b><br>Date: ${fmtDate(r.ts)}${L.parts.dates ? `<br>Reply by: ${fmtDate(r.ts + 7 * DAY)}` : ''}</div></div>
    </div>
    <div class="box"><b>To:</b> ${esc(sup?.name || r.supplierName || '')}<br>${esc([sup?.contact, sup?.phone, sup?.email, sup?.address].filter(Boolean).join(' · '))}</div>
    ${P.address}
    ${L.parts.note && r.note ? `<p>${esc(r.note)}</p>` : ''}
    ${docTable('rfq', r.lines, L, (l) => num(l.quotedCost || l.lastCost))}
    ${P.terms}
    ${L.parts.note ? '<p>Please fill in the empty boxes and state how long your prices are valid.</p>' : ''}
    ${P.sig}`);
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
      <div class="line-head two"><span>Item</span><span>Qty</span><span>Unit</span><span></span></div>
      <div class="lines">${r.lines.map((l) => lineRow(l, false)).join('')}</div>
      <button type="button" class="btn ghost small" data-add-line>${icon('plus')}Add line</button>
      ${field('Message to supplier', `<textarea name="note" rows="2">${esc(r.note)}</textarea>`)}
      <p class="muted small">Estimated cost at last prices: ${fmt(r.estimate)} · ${esc(st)}</p>`,
    actions: `
      <button type="button" class="btn ghost danger" data-del>${icon('trash')}<span class="hide-sm">Delete</span></button>
      <button type="button" class="btn ghost" data-wa>${icon('wa')}WhatsApp</button>
      <button type="button" class="btn ghost" data-mail>${icon('mail')}<span class="hide-sm">Email</span></button>
      <button type="button" class="btn ghost" data-layout>${icon('orders')}<span class="hide-sm">Columns</span></button>
      <button type="button" class="btn ghost" data-print>${icon('print')}<span class="hide-sm">Print / PDF</span></button>
      ${r.status !== 'closed' && r.status !== 'ordered' ? '<button type="button" class="btn ghost" data-make-po>Make purchase order</button>' : ''}
      <button class="btn primary">Save</button>`,
    onMount: (dlg, close) => {
      wireLines(dlg, false);
      let layout = r.layout || null; // this request's own columns, once chosen
      const current = () => {
        const f = dlg.querySelector('form');
        const lines = readLines(f).map(({ itemId, name, unit, qty, lastCost, packSize, buyUnit, inPacks: ip }) => ({ itemId, name, unit, qty, lastCost, packSize, buyUnit, inPacks: ip }));
        return { ...r, supplierId: f.supplierId.value, status: f.status.value, note: f.note.value, lines, ...(layout ? { layout } : {}) };
      };
      dlg.querySelector('[data-layout]').addEventListener('click', () => openLayoutEditor('rfq', layoutFor('rfq', { layout }), (out) => { layout = out; dlg._layout = out; }));
      dlg._layout = layout;
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
      act('[data-make-po]', () => { const c = persist(); close(); const id = store.poFromRfq(c); toast('Purchase order created — enter the quoted prices'); setTimeout(() => openPo(id), 150); });
      act('[data-del]', async () => {
        close();
        if (await confirmBox(`Delete ${r.no}?`, { ok: 'Delete', danger: true })) { store.deleteRfq(r.id); toast('Request deleted'); }
      });
    },
    onSubmit: (v, { form }) => {
      const lines = readLines(form).map(({ itemId, name, unit, qty, lastCost, packSize, buyUnit, inPacks: ip }) => ({ itemId, name, unit, qty, lastCost, packSize, buyUnit, inPacks: ip }));
      store.saveRfq({ ...r, supplierId: v.supplierId, status: v.status, note: v.note, lines, ...(form.closest('dialog')._layout ? { layout: form.closest('dialog')._layout } : {}) });
      toast('Request saved');
    },
  });
  void sup;
}

// ---------- Purchase orders ----------
export function poText(po) {
  const st = store.settings;
  const L = layoutFor('po', po);
  const amt = L.cols.amount === 'fill';
  return [
    `PURCHASE ORDER ${po.no}`,
    `From: ${st.shopName}${st.phone ? ' (' + st.phone + ')' : ''}`,
    `Date: ${fmtDate(po.ts)}${L.parts.dates ? ` · Deliver by: ${fmtDate(po.expectedTs)}` : ''}`,
    ...(L.parts.address ? [`Deliver to: ${st.shopName}${st.address ? ', ' + st.address : ''}`] : []),
    '',
    ...(L.parts.note && po.note ? [po.note, ''] : []),
    ...docTextLines('po', po.lines, L, (l) => num(l.cost)),
    '',
    ...(L.cols.amount !== 'hide' ? [`TOTAL: ${amt ? fmt(po.total) : '______'}`] : []),
    ...(L.parts.terms ? ['Payment terms: ______'] : []),
  ].join('\n');
}

export function printPo(po) {
  const st = store.settings;
  const sup = store.supplier(po.supplierId);
  const L = layoutFor('po', po);
  const P = docParts('po', L);
  const big = L.cols.unit === 'fill' && po.lines.some((l) => asOrdered(l).big);
  printHtml(po.no, `
    <div class="head">
      <div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address)}<br>${esc(st.phone)} ${esc(st.email)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div></div>
      <div style="text-align:right"><h1>Purchase order</h1><div>No. <b>${esc(po.no)}</b><br>Date: ${fmtDate(po.ts)}${L.parts.dates ? `<br>Deliver by: ${fmtDate(po.expectedTs)}` : ''}</div></div>
    </div>
    <div class="box"><b>Supplier:</b> ${esc(sup?.name || po.supplierName || '')}<br>${esc([sup?.contact, sup?.phone, sup?.email, sup?.address].filter(Boolean).join(' · '))}</div>
    ${P.address}
    ${L.parts.note && po.note ? `<p>${esc(po.note)}</p>` : ''}
    ${docTable('po', po.lines, L, (l) => num(l.cost))}
    ${big ? '<p class="muted small">Quantities are in the unit shown (carton, dozen, box…). Total pieces is what we count into stock.</p>' : ''}
    ${P.terms}
    ${P.sig}`);
}

/** Create (id = null) or open a purchase order. */
export function openPo(id) {
  const po = id ? store.data.pos.find((x) => x.id === id) : null;
  if (id && !po) return;
  const draft = !po || po.status === 'draft';
  const editable = !po || ((po.status === 'draft' || po.status === 'ordered') && po.lines.every((l) => !num(l.received)));
  const [stText, stCls] = po ? PO_STATUS[po.status] || PO_STATUS.draft : PO_STATUS.draft;
  const canReceive = po && (po.status === 'ordered' || po.status === 'partial') && store.can('receive');
  // Not received yet: owners and managers may delete. Received (even partly): owner, or a manager the owner allowed.
  const anyReceived = !!po && po.lines.some((l) => num(l.received) > 0);
  const canDelete = !!po && store.can('orders') && (!anyReceived || store.can('clear'));
  const lines = po?.lines || [{}, {}];
  // A new order gets its id and number now, so saving, printing and sending never create duplicates.
  const meta = { id: po?.id || store.backend.newId('pos'), no: po?.no || docNo('PO'), ts: po?.ts || Date.now(), layout: po?.layout || null };
  modal({
    title: po ? po.no : 'New purchase order',
    wide: true,
    body: `
      ${po ? `<p><span class="pill ${stCls}">${stText}</span>${isLate(po) ? ' <span class="pill bad">Late</span>' : ''}${po.closedShort ? ' <span class="muted small">Closed short — not everything arrived</span>' : ''}</p>` : ''}
      ${anyReceived && !canDelete && store.can('orders') ? '<p class="muted small">Received orders can only be deleted by the owner, or a manager the owner has allowed.</p>' : ''}
      <div class="grid2">
        ${field('Supplier', editable ? supplierSelect(po?.supplierId) : `<input value="${esc(po.supplierName)}" disabled>`)}
        ${field('Expected delivery', `<input type="date" name="expected" value="${toInputDate(po?.expectedTs || Date.now() + num(store.settings.leadDays || 7) * DAY)}" ${po && !editable && po.status !== 'ordered' && po.status !== 'partial' ? 'disabled' : ''}>`)}
      </div>
      ${editable ? `
        ${itemOptions()}
        <div class="line-head"><span>Item</span><span>Qty</span><span>Unit</span><span>Price per unit (TSh)</span><span></span></div>
        <div class="lines">${lines.map((l) => lineRow(l, true)).join('')}</div>
        <button type="button" class="btn ghost small" data-add-line>${icon('plus')}Add line</button>`
      : `<table class="table"><thead><tr><th>Item</th><th class="r">Ordered</th><th class="r">Received</th><th class="r">Unit price</th><th class="r hide-sm">Amount</th></tr></thead>
        <tbody>${po.lines.map((l) => { const o = asOrdered(l); return `<tr><td>${esc(l.name)}${o.big ? `<small class="muted block">${esc(packRule(o.pack, o.pc))}</small>` : ''}</td><td class="r num">${fmtQty(o.qty)} ${esc(plural(o.unit, o.qty))}${o.big && (!o.ord || o.perKnown) ? `<small class="muted block">${fmtQty(o.pieces)} ${esc(o.pc)}</small>` : ''}</td><td class="r num ${num(l.received) >= num(l.qty) ? 'up' : num(l.received) ? 'warn-text' : ''}">${o.big ? `${fmtQty(round3(num(l.received) / o.f))} ${esc(plural(o.unit, round3(num(l.received) / o.f)))}<small class="muted block">${fmtQty(l.received || 0)} ${esc(o.pc)}</small>` : fmtQty(l.received || 0)}</td><td class="r num">${fmt(o.price)}<small class="muted block">per ${esc(o.unit)}</small></td><td class="r num hide-sm">${fmt(l.qty * l.cost)}</td></tr>`; }).join('')}</tbody></table>`}
      <p class="total-row"><span>Total</span><strong id="po-total">${fmt(po?.total || 0)}</strong></p>
      ${field('Message to supplier', `<textarea name="note" rows="2" ${editable ? '' : 'disabled'}>${esc(po?.note ?? store.settings.poNote ?? '')}</textarea>`)}`,
    actions: `
      ${po && canDelete ? `<button type="button" class="btn ghost danger" data-del>${icon('trash')}<span class="hide-sm">Delete</span></button>` : ''}
      ${po && po.status === 'partial' ? '<button type="button" class="btn ghost" data-close-short>Close short</button>' : ''}
      <button type="button" class="btn ghost" data-wa>${icon('wa')}<span class="hide-sm">WhatsApp</span></button>
      <button type="button" class="btn ghost" data-mail>${icon('mail')}<span class="hide-sm">Email</span></button>
      <button type="button" class="btn ghost" data-layout>${icon('orders')}<span class="hide-sm">Columns</span></button>
      <button type="button" class="btn ghost" data-print>${icon('print')}<span class="hide-sm">Print / PDF</span></button>
      ${draft ? '<button type="button" class="btn ghost" data-order>Mark as ordered</button>' : ''}
      ${canReceive ? `<button type="button" class="btn accent" data-recv>${icon('truck')}Receive</button>` : ''}
      <button class="btn primary">${po ? 'Save' : 'Save draft'}</button>`,
    onMount: (dlg, close) => {
      const total = () => {
        if (!editable) return;
        let t = 0;
        dlg.querySelectorAll('.line-row').forEach((r) => { t += num(r.querySelector('.li-qty').value) * num(r.querySelector('.li-cost').value); });
        dlg.querySelector('#po-total').textContent = fmt(t);
      };
      if (editable) { wireLines(dlg, true, total); total(); }
      const form = dlg.querySelector('form');
      /** Save what is on screen and return the stored version (same id and number every time). */
      dlg.querySelector('[data-layout]').addEventListener('click', () => openLayoutEditor('po', layoutFor('po', { layout: meta.layout }), (out) => { meta.layout = out; }));
      const persist = (extra = {}) => {
        const data = { id: meta.id, no: meta.no, ts: meta.ts, status: po?.status, rfqId: po?.rfqId, auto: po?.auto, by: po?.by, orderedAt: po?.orderedAt, layout: meta.layout };
        if (form.expected && !form.expected.disabled) data.expectedTs = fromInputDate(form.expected.value);
        else data.expectedTs = po?.expectedTs;
        if (editable) {
          data.supplierId = form.supplierId.value;
          data.lines = readLines(form);
          data.note = form.note.value;
          if (!data.lines.length) throw new Error('Add at least one item with a quantity');
        } else { data.supplierId = po.supplierId; data.lines = po.lines; data.note = po.note; }
        const built = store.buildPo({ ...data, ...extra });
        store.savePo({ ...data, ...extra });
        return { ...built.data, id: built.id };
      };
      const act = (sel, fn) => dlg.querySelector(sel)?.addEventListener('click', async () => { try { await fn(); } catch (e) { toast(e.message, { kind: 'err' }); } });
      const sendStatus = () => (draft ? { status: 'ordered', orderedAt: Date.now() } : {});
      act('[data-print]', () => printPo(persist()));
      act('[data-wa]', () => {
        const c = persist(sendStatus());
        const s = store.supplier(c.supplierId);
        window.open(`https://wa.me/${waNumber(s?.phone)}?text=${encodeURIComponent(poText(c))}`, '_blank', 'noopener');
        if (draft) toast('Marked as ordered — items now show as On order');
        close();
      });
      act('[data-mail]', () => {
        const c = persist(sendStatus());
        const s = store.supplier(c.supplierId);
        location.href = `mailto:${encodeURIComponent(s?.email || '')}?subject=${encodeURIComponent(`Purchase order ${c.no} — ${store.settings.shopName}`)}&body=${encodeURIComponent(poText(c))}`;
        if (draft) toast('Marked as ordered — items now show as On order');
      });
      act('[data-order]', () => { persist({ status: 'ordered', orderedAt: Date.now() }); close(); toast('Marked as ordered — items now show as On order'); });
      act('[data-recv]', () => { const c = persist(); close(); setTimeout(() => openReceivePo(c.id), 120); });
      act('[data-del]', async () => {
        close();
        await confirmDeletePo(po);
      });
      act('[data-close-short]', async () => {
        close();
        if (await confirmBox(`Close ${po.no}? Items that have not arrived will no longer show as on order.`, { ok: 'Close order' })) { store.receivePo(po, [], { closeShort: true }); toast('Order closed'); }
      });
    },
    onSubmit: (v, { form }) => {
      const data = { id: meta.id, no: meta.no, ts: meta.ts, status: po?.status, rfqId: po?.rfqId, auto: po?.auto, by: po?.by, orderedAt: po?.orderedAt, note: v.note ?? po?.note, layout: meta.layout };
      data.expectedTs = form.expected && !form.expected.disabled ? fromInputDate(form.expected.value) : po?.expectedTs;
      if (editable) {
        data.supplierId = v.supplierId;
        data.lines = readLines(form);
        if (!data.lines.length) throw new Error('Add at least one item with a quantity');
      } else { data.supplierId = po.supplierId; data.lines = po.lines; }
      store.savePo(data);
      toast(po ? 'Purchase order saved' : 'Draft purchase order saved');
    },
  });
}

// ---------- Import an order from a supplier's file ----------
/**
 * A supplier's list (Item, Quantity like "1 dozen" / "50 pcs" / "1 carton", Price for that quantity)
 * becomes a draft purchase order. Each line is matched to your items — names you matched before for
 * this supplier are remembered — or a new item is created, or the line is skipped.
 */
export function openImportOrder() {
  let parsed = null;
  const items = () => store.activeItems().filter((i) => !i.service).sort((a, b) => a.name.localeCompare(b.name));
  const matchFor = (name, supplierId) => {
    const alias = store.settings.orderAliases?.[supplierId || 'any']?.[normName(name)];
    if (alias && store.item(alias) && store.item(alias).active !== false) return { item: store.item(alias), how: 'remembered' };
    const m = bestItemMatch(name, items());
    if (!m) return null;
    return { item: m.item, how: m.score >= 0.85 ? 'match' : 'check' };
  };
  const PILL = { remembered: ['Remembered', 'good'], match: ['Matched', 'good'], check: ['Check', 'warn'], new: ['New item', 'info'], skip: ['Skip', ''] };
  modal({
    title: 'Import an order from a file',
    wide: true,
    body: `
      <p class="small">Choose the supplier's list saved as CSV. Columns like <b>Item</b>, <b>Quantity</b> (“1 dozen”, “50 pcs”, “1 carton”) and <b>Price</b> (the amount for that quantity) are read. Pieces in a carton or box are filled in when the goods arrive.</p>
      <div class="grid2">
        ${field('Supplier', supplierSelect(''))}
        ${field('Order file (CSV)', '<input type="file" name="file" accept=".csv,text/csv">')}
      </div>
      <div id="io-body"></div>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary" id="io-go" disabled>Create draft order</button>',
    onMount: (dlg) => {
      const bodyEl = dlg.querySelector('#io-body');
      const supSel = dlg.querySelector('[name=supplierId]');
      const draw = () => {
        if (!parsed) { bodyEl.innerHTML = ''; return; }
        const list = items();
        const opts = (sel) => list.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
        let nOrder = 0, nCheck = 0, nNew = 0, nNo = 0;
        const rows = parsed.lines.map((l, i) => {
          if (l.unavailable) { nNo++; return `<div class="io-line io-off"><div class="io-src"><b>${esc(l.name)}</b><small>Not available — ${esc(l.reason)}</small></div><span class="pill">Not ordered</span></div>`; }
          const m = l.choice ?? (l.choice = (() => { const x = matchFor(l.name, supSel.value); return x ? { value: x.item.id, how: x.how } : { value: 'new', how: 'new' }; })());
          const how = m.value === 'new' ? 'new' : m.value === 'skip' ? 'skip' : m.how;
          if (how !== 'skip') nOrder++;
          if (how === 'check') nCheck++;
          if (how === 'new') nNew++;
          const [pt, pc] = PILL[how];
          return `<div class="io-line ${how === 'skip' ? 'io-off' : ''}" data-i="${i}">
            <div class="io-src"><b>${esc(l.name)}</b><small>${fmtQty(l.qty)} ${esc(l.unit ? plural(l.unit, l.qty) : 'unit')}${l.per && l.unit !== 'pcs' ? ` (${fmtQty(l.per)} pcs each)` : ''} · ${fmt(l.amount)}${l.qty !== 1 ? ` · ${fmt(l.unitPrice)} per ${esc(l.unit || 'unit')}` : ''}</small></div>
            <select class="io-pick" aria-label="Your item for ${esc(l.name)}">
              <option value="new" ${m.value === 'new' ? 'selected' : ''}>＋ Create new item “${esc(l.name)}”</option>
              <option value="skip" ${m.value === 'skip' ? 'selected' : ''}>Skip this line</option>
              <optgroup label="Your items">${opts(m.value)}</optgroup>
            </select>
            <span class="pill ${pc}">${pt}</span>
          </div>`;
        });
        const totalOk = parsed.fileTotal == null || Math.abs(parsed.fileTotal - parsed.sum) < 1;
        bodyEl.innerHTML = `
          <div class="io-sum ${totalOk ? '' : 'warn'}"><b>${parsed.lines.length}</b> lines · <b>${nOrder}</b> to order${nNew ? ` (${nNew} new items)` : ''}${nNo ? ` · ${nNo} not available` : ''}${nCheck ? ` · <span class="warn-text">${nCheck} to check</span>` : ''}
            <br>Lines add up to <b>${fmt(parsed.sum)}</b>${parsed.fileTotal != null ? (totalOk ? ` — matches the file total ✓` : ` — the file says ${fmt(parsed.fileTotal)}`) : ''}</div>
          <div class="io-list">${rows.join('')}</div>`;
        dlg.querySelector('#io-go').disabled = !nOrder;
      };
      dlg.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          parsed = parseOrderRows(parseCsv(await f.text()));
          if (!parsed.lines.length) throw new Error('No items found in this file');
        } catch (err) { parsed = null; bodyEl.innerHTML = `<p class="warn-text">${esc(err.message)}</p>`; dlg.querySelector('#io-go').disabled = true; return; }
        draw();
      });
      supSel.addEventListener('change', () => { if (parsed) { parsed.lines.forEach((l) => { delete l.choice; }); draw(); } });
      bodyEl.addEventListener('change', (e) => {
        const sel = e.target.closest('.io-pick');
        if (!sel) return;
        const l = parsed.lines[Number(sel.closest('[data-i]').dataset.i)];
        l.choice = { value: sel.value, how: 'remembered' };
        draw();
      });
    },
    onSubmit: (v) => {
      if (!parsed) throw new Error('Choose the order file first');
      const lines = parsed.lines.filter((l) => !l.unavailable).map((l) => {
        const c = l.choice?.value || 'new';
        return { ...l, skip: c === 'skip', create: c === 'new', itemId: c === 'new' || c === 'skip' ? null : c };
      });
      const id = store.importOrder({ supplierId: v.supplierId, lines });
      const n = lines.filter((l) => !l.skip).length;
      toast(`Draft order created with ${n} line${n === 1 ? '' : 's'} — check it, then mark it as ordered`);
      setTimeout(() => openPo(id), 150);
    },
  });
}

/** Ask, then delete an order. A received order shows exactly what comes back out of stock. */
export async function confirmDeletePo(po) {
  const received = po.lines.some((l) => num(l.received) > 0);
  if (!received) {
    if (await confirmBox(`Delete ${po.no}? ${po.status === 'draft' ? 'The draft' : 'The order'} is removed from Orders, and its items no longer show as on order in Stock.`, { ok: 'Delete order', danger: true })) {
      try { await store.deletePo(po); toast('Purchase order deleted'); } catch (e) { toast(e.message, { kind: 'err' }); }
    }
    return;
  }
  let rev;
  try { rev = await store.poReversal(po); } catch (e) { toast(e.message, { kind: 'err' }); return; }
  const rows = rev.lines.map((l) => {
    const o = asOrdered({ ...po.lines.find((x) => x.itemId === l.itemId), qty: l.take });
    return `<tr><td>${esc(l.name)}</td><td class="r num">−${esc(orderedText(o, l.take))}${l.sold > 0 ? `<small class="warn-text block">${fmtQty(l.sold)} already sold — stock goes to 0</small>` : ''}</td></tr>`;
  }).join('');
  const ok = await new Promise((resolve) => modal({
    title: `Delete received order ${po.no}?`,
    body: `
      <p>This order has been received. Deleting it will undo the deliveries:</p>
      <table class="table"><thead><tr><th>Item</th><th class="r">Out of stock</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${rev.purchases.length} delivery record${rev.purchases.length === 1 ? '' : 's'} (${fmt(rev.total)}) will be removed from purchases and supplier balances. Cost prices stay as they are.</p>
      <p class="banner warn">This cannot be undone.</p>`,
    actions: '<button class="btn ghost" value="cancel">Keep order</button><button class="btn danger">Delete and take out of stock</button>',
    onSubmit: () => resolve(true),
    onClose: () => resolve(false),
  }));
  if (!ok) return;
  try { await store.deletePo(po); toast(`${po.no} deleted — stock updated`); } catch (e) { toast(e.message, { kind: 'err' }); }
}

/** Receive a delivery against a purchase order: stock and cost update on save. */
export function openReceivePo(id) {
  const po = store.data.pos.find((x) => x.id === id);
  if (!po) return;
  const canRemember = store.can('editItems');
  // Each line is counted in its buying unit (carton, dozen…) with the pieces in one unit; plain pieces otherwise.
  const rowsInfo = po.lines.map((l, idx) => {
    const o = asOrdered(l);
    const it = store.item(l.itemId);
    const pack = !!l.ordUnit ? l.ordUnit !== 'pcs' : o.big;
    const unit = pack ? o.unit : o.pc;
    const per = l.ordUnit ? (l.perOk ? num(l.packSize) : '') : o.f;
    const restUnits = l.ordUnit
      ? Math.max(0, round3(num(l.ordQty) - num(l.receivedUnits)))
      : round3(Math.max(0, num(l.qty) - num(l.received)) / (pack ? o.f : 1));
    const itemPer = num(it?.packSize) > 1 ? num(it.packSize) : 0;
    return { l, idx, o, it, pack, unit, per, restUnits, price: pack ? o.price : num(l.cost), itemPer };
  });
  const row = (r) => {
    const { l, o, pack, unit, per, restUnits, price } = r;
    const done = !restUnits;
    return `
          <tr data-idx="${r.idx}" ${done ? 'class="muted"' : ''}>
            <td>${esc(l.name)}<small>Ordered ${esc(l.ordUnit ? `${fmtQty(l.ordQty)} ${plural(unit, l.ordQty)}` : orderedText(o))}${num(l.received) ? ` · ${fmtQty(l.received)} ${esc(o.pc)} already in` : ''}</small>
              ${l.srcName && normName(l.srcName) !== normName(l.name) ? `<small class="muted">Supplier: “${esc(l.srcName)}”</small>` : ''}</td>
            <td class="r num">${fmtQty(restUnits)}<small>${esc(plural(unit, restUnits))}</small></td>
            <td class="r">
              <input class="rv-qty" type="number" inputmode="decimal" min="0" step="any" value="${restUnits || ''}" ${done ? 'disabled' : ''} aria-label="${esc(plural(unit, 2))} of ${esc(l.name)} that arrived">
              ${pack ? `<label class="rv-per-l">pcs in 1 ${esc(unit)}<input class="rv-per ${per ? '' : 'need'}" type="number" inputmode="numeric" min="1" step="any" value="${per || ''}" placeholder="?" ${done ? 'disabled' : ''} aria-label="Pieces in one ${esc(unit)} of ${esc(l.name)}"></label>
                <small class="rv-pcs"></small>
                ${canRemember && !done ? `<label class="rv-rem"><input type="checkbox" class="rv-remember" ${r.itemPer && r.itemPer === num(per) ? '' : 'checked'}> Save on item</label>` : ''}` : '<input class="rv-per" type="hidden" value="1">'}
            </td>
            <td class="r"><input class="rv-cost" type="number" inputmode="decimal" min="0" step="any" value="${Math.round(price * 100) / 100}" ${done ? 'disabled' : ''} aria-label="Price per ${esc(unit)} of ${esc(l.name)}"><small>per ${esc(unit)}</small></td>
          </tr>`;
  };
  modal({
    title: `Receive ${po.no}`,
    wide: true,
    body: `
      <p class="muted">${esc(po.supplierName)} · ordered ${fmtDate(po.orderedAt || po.ts)} · expected ${fmtDate(po.expectedTs)}</p>
      <p class="small">Count what arrived in the supplier's units (carton, dozen, box…) and fill in <b>how many pieces are in one</b> — stock goes up by units × pieces. Change the price if it changed.</p>
      <table class="table recv-table">
        <thead><tr><th>Item</th><th class="r">To come</th><th class="r">Arrived</th><th class="r">Price</th></tr></thead>
        <tbody>${rowsInfo.map(row).join('')}</tbody>
      </table>
      <p class="total-row"><span>Value of this delivery</span><strong id="rv-total"></strong></p>
      <div class="grid2">
        ${field('Date received', `<input type="date" name="date" value="${toInputDate(Date.now())}" required>`)}
        ${field('Delivery note / invoice no.', '<input name="ref" autocomplete="off">')}
      </div>
      <label class="check"><input type="checkbox" name="paid"> Paid to the supplier already</label>
      <label class="check" id="rv-short-wrap" hidden><input type="checkbox" name="closeShort"> Close the order — the missing items are not coming</label>`,
    actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">${icon('truck')}Receive into stock</button>`,
    onMount: (dlg) => {
      const upd = () => {
        let t = 0, short = false;
        dlg.querySelectorAll('tbody tr').forEach((tr) => {
          const q = tr.querySelector('.rv-qty');
          if (q.disabled) return;
          const r = rowsInfo[Number(tr.dataset.idx)];
          const units = num(q.value), per = num(tr.querySelector('.rv-per').value);
          t += units * num(tr.querySelector('.rv-cost').value);
          const pcs = tr.querySelector('.rv-pcs');
          if (pcs) pcs.textContent = q.value !== '' && per ? `= ${fmtQty(round3(units * per))} ${r.o.pc} into stock` : q.value !== '' ? 'enter the pieces' : '';
          tr.querySelector('.rv-per')?.classList.toggle('need', r.pack && units > 0 && !per);
          if (units < r.restUnits - 1e-9) short = true;
        });
        dlg.querySelector('#rv-total').textContent = fmt(t);
        dlg.querySelector('#rv-short-wrap').hidden = !short;
      };
      dlg.addEventListener('input', upd);
      upd();
    },
    onSubmit: (v, { form }) => {
      // Back to pieces: 1 carton with 24 inside at TSh 36,000 → 24 pcs at TSh 1,500 each.
      const receipts = [];
      for (const tr of form.querySelectorAll('tbody tr')) {
        const q = tr.querySelector('.rv-qty');
        if (q.disabled) continue;
        const r = rowsInfo[Number(tr.dataset.idx)];
        const units = num(q.value);
        if (!(units > 0)) continue;
        const per = num(tr.querySelector('.rv-per').value);
        if (!(per > 0)) throw new Error(`Enter how many pieces are in one ${r.unit} of ${r.l.name}`);
        if (units > r.restUnits + 1e-9) throw new Error(`More ${r.l.name} than ordered — change the order first, or record the extra with Receive stock`);
        receipts.push({
          idx: r.idx, units, per, qty: round3(units * per), cost: unitPrice(num(tr.querySelector('.rv-cost').value) / per),
          remember: !!tr.querySelector('.rv-remember')?.checked, inPacks: r.pack && per > 1,
        });
      }
      store.receivePo(po, receipts, { ts: fromInputDate(v.date), ref: v.ref, paid: v.paid === 'on', closeShort: v.closeShort === 'on' });
      const n = receipts.length;
      toast(n ? `${n} item${n > 1 ? 's' : ''} received — stock updated` : 'Order closed');
    },
  });
}
