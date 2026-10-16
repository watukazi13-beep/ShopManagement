import { store } from '../store.js';
import { num, soldQty, stockValue, DAY, BUY_UNITS, plural, packInfo, orderQtyText } from '../calc.js';

const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
import { esc, fmt, fmtQty, fmtDate, icon, modal, toast, field, fieldHtml, statusPill, emptyState, confirmBox, downloadFile, toCsv, parseCsv } from '../ui.js';
import { openReceivePo, isLate } from './orders.js';

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'carton', 'bag', 'dozen', 'packet', 'bottle', 'tin', 'pair', 'metre'];

export default {
  title: 'Stock',
  mount(el, params) {
    let filter = params.get('filter') || 'all';
    let q = '';
    let cat = '';
    const boss = store.can('editItems');
    el.innerHTML = `
      <div class="page-head">
        <h1>Stock</h1>
        <div class="head-actions">
          ${boss ? `<button class="btn ghost" data-act="import">${icon('upload')}<span class="hide-sm">Import</span></button>
          <button class="btn ghost" data-act="export">${icon('download')}<span class="hide-sm">Export</span></button>
          <button class="btn ghost" data-act="levels">Min / max</button>
          <button class="btn ghost" data-act="count">Count stock</button>
          <button class="btn primary" data-act="new">${icon('plus')}Add item</button>` : ''}
        </div>
      </div>
      <div id="stock-summary"></div>
      <div class="toolbar">
        <div class="searchbar">${icon('search')}<input type="search" id="stock-q" placeholder="Search items" autocomplete="off"></div>
        <div class="seg" role="tablist">
          <button data-f="all">All</button><button data-f="low">Needs restock</button><button data-f="incoming">Incoming<span class="seg-count" id="inc-count"></span></button>
        </div>
        <select id="stock-cat" aria-label="Category"></select>
      </div>
      <div id="stock-list"></div>`;
    const listEl = el.querySelector('#stock-list');
    const sumEl = el.querySelector('#stock-summary');
    const catEl = el.querySelector('#stock-cat');

    const draw = () => {
      if (!store.ready) { listEl.innerHTML = '<div class="loading">Loading…</div>'; return; }
      el.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
      const incoming = store.openPos();
      el.querySelector('#inc-count').textContent = incoming.length ? ` ${incoming.length}` : '';
      const plan = store.plan();
      const items = store.activeItems();
      const cats = [...new Set(items.map((i) => i.category || 'Other'))].sort();
      catEl.innerHTML = `<option value="">All categories</option>${cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
      catEl.hidden = cats.length < 2;
      if (boss) {
        const v = stockValue(items);
        const lows = plan.filter((p) => p.status === 'out' || p.status === 'low').length;
        sumEl.innerHTML = `<div class="stats compact">
          <div><span>Items</span><strong>${items.length}</strong></div>
          <div><span>Stock value (cost)</span><strong>${fmt(v.cost)}</strong></div>
          <div><span>Stock value (selling)</span><strong>${fmt(v.retail)}</strong></div>
          <div><span>Potential profit</span><strong>${fmt(v.retail - v.cost)}</strong></div>
          <div><span>Margin</span><strong>${v.retail ? (Math.floor(((v.retail - v.cost) / v.retail) * 10000) / 100).toFixed(2) + '%' : '—'}</strong></div>
          <div class="${lows ? 'warn' : ''}"><span>Need restock</span><strong>${lows}</strong></div>
        </div>`;
      }
      if (filter === 'incoming') { drawIncoming(incoming); return; }
      const s = q.toLowerCase();
      const services = items.filter((i) => i.service).map((item) => ({ item, stock: 0, status: 'ok', service: true }));
      const rows = [...plan, ...services].filter((p) =>
        (filter !== 'low' || p.status !== 'ok') &&
        (!cat || (p.item.category || 'Other') === cat) &&
        (!s || p.item.name.toLowerCase().includes(s) || (p.item.sku || '').toLowerCase().includes(s) || (p.item.barcode || '').includes(q)));
      if (filter === 'all') rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
      listEl.innerHTML = rows.length ? `
        <table class="table">
          <thead><tr><th>Item</th><th class="r">In stock</th><th class="r hide-sm">Price</th>${boss ? '<th class="r hide-sm">Cost</th>' : ''}<th class="r hide-sm">Min</th><th class="r hide-sm">Max</th><th class="r hide-sm">Order</th><th>Status</th></tr></thead>
          <tbody>${rows.map((p) => `
            <tr class="tap" data-item="${p.item.id}">
              <td><b>${esc(p.item.name)}</b><small>${esc(p.item.category || '')}${p.item.sku ? ' · ' + esc(p.item.sku) : ''}</small></td>
              <td class="r num">${p.service ? '—' : `${fmtQty(p.stock)} <small class="unit">${esc(p.item.unit || '')}</small><small class="only-sm levels">min ${fmtQty(p.item.minStock || 0)} · max ${p.maxSet ? fmtQty(p.item.maxStock) : '—'}</small>${p.onOrder ? `<small class="on-order">+${fmtQty(p.onOrder)} on order</small>` : ''}`}</td>
              <td class="r num hide-sm">${p.item.variablePrice ? '<span class="muted">Variable</span>' : fmt(p.item.price)}</td>
              ${boss ? `<td class="r num hide-sm">${fmt(p.item.cost)}</td>` : ''}
              <td class="r num hide-sm">${p.service ? '' : fmtQty(p.item.minStock || 0)}</td>
              <td class="r num hide-sm">${p.service ? '' : p.maxSet ? fmtQty(p.item.maxStock) : '<span class="muted">not set</span>'}</td>
              <td class="r num hide-sm">${p.service ? '' : p.suggestQty ? `<b>${fmtQty(p.suggestQty)}</b>` : ''}</td>
              <td>${p.service ? '<span class="pill">Service</span>' : statusPill(p.status)}</td>
            </tr>`).join('')}</tbody>
        </table>`
        : items.length
          ? emptyState(filter === 'low' ? 'Nothing needs restocking' : 'No match', filter === 'low' ? 'Every item is above its reorder level.' : 'Try a different search.')
          : emptyState('Add your products', 'Add items one by one, or import the item list you exported from Loyverse.',
            boss ? '<div class="row-btns"><button class="btn primary" data-act="new">Add an item</button><button class="btn ghost" data-act="import">Import from Loyverse</button></div>' : '');
    };

    function drawIncoming(list) {
      const canRecv = store.can('receive');
      list = [...list].sort((a, b) => (a.expectedTs || 0) - (b.expectedTs || 0));
      listEl.innerHTML = list.length ? `<ul class="rows card">${list.map((po) => {
        const left = po.lines.filter((l) => num(l.received) < num(l.qty));
        return `<li class="row ${canRecv ? 'tap' : ''}" data-incoming="${po.id}">
          <div class="grow"><b>${esc(po.supplierName || 'Any supplier')}</b>
            <small>${esc(po.no)} · expected ${fmtDate(po.expectedTs)} · ${left.map((l) => (l.ordUnit
              ? `${esc(l.name)} ${fmtQty(Math.max(0, num(l.ordQty) - num(l.receivedUnits)))} ${esc(plural(l.ordUnit === 'pcs' ? l.unit || 'pcs' : l.ordUnit, num(l.ordQty) - num(l.receivedUnits)))}`
              : `${esc(l.name)} ${esc(orderQtyText(num(l.qty) - num(l.received), packInfo(l, store.item(l.itemId)), l.unit).replace(/ \(.*\)$/, ''))}`)).slice(0, 3).join(', ')}${left.length > 3 ? ` +${left.length - 3} more` : ''}</small></div>
          ${isLate(po) ? '<span class="pill bad">Late</span>' : po.status === 'partial' ? '<span class="pill warn">Partly received</span>' : '<span class="pill info">Ordered</span>'}
          ${canRecv ? `<button type="button" class="btn primary small" data-recv="${po.id}">Receive</button>` : ''}
        </li>`;
      }).join('')}</ul>${canRecv ? '' : '<p class="muted small">An owner or manager receives deliveries.</p>'}`
        : emptyState('Nothing on its way', 'Purchase orders marked as Ordered show here until their goods arrive.', store.can('orders') ? '<a class="btn ghost" href="#/orders?tab=pos">Go to purchase orders</a>' : '');
    }

    el.querySelector('#stock-q').addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
    catEl.addEventListener('change', () => { cat = catEl.value; draw(); });
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-f]')?.dataset.f;
      if (f) { filter = f; draw(); return; }
      const rv = e.target.closest('[data-recv]')?.dataset.recv || (store.can('receive') && e.target.closest('[data-incoming]')?.dataset.incoming);
      if (rv) { openReceivePo(rv); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'new') openItemForm();
      if (a === 'import') openImport();
      if (a === 'export') exportItems();
      if (a === 'levels') openLevels();
      if (a === 'count') openCount();
      const id = e.target.closest('[data-item]')?.dataset.item;
      if (id) openItem(store.item(id));
    });

    draw();
    if (params.get('new') && boss) openItemForm();
    if (params.get('item')) openItem(store.item(params.get('item')));
    return { update: draw };
  },
};

export function openItemForm(item = null) {
  const it = item || { unit: 'pcs', packSize: 1 };
  // Buying unit: single pieces, a dozen (always 12), carton, box, set… or a name of your own.
  const buyKinds = [['', 'Single pieces'], ...BUY_UNITS.map((u) => [u, cap(u)]), ['other', 'Other…']];
  const kind = !it.buyUnit || !(num(it.packSize) > 1) ? '' : BUY_UNITS.includes(String(it.buyUnit).toLowerCase()) ? String(it.buyUnit).toLowerCase() : 'other';
  const cats = [...new Set(store.data.items.map((i) => i.category).filter(Boolean))].sort();
  const sups = [...store.data.suppliers].sort((a, b) => a.name.localeCompare(b.name));
  modal({
    title: item ? `Edit ${item.name}` : 'Add item',
    body: `
      ${field('Name', `<input name="name" required autofocus value="${esc(it.name)}" placeholder="e.g. Sugar 1kg">`)}
      <fieldset class="group buy-group"><legend>How you buy it</legend>
        <div class="grid2">
          ${field('Buying unit', `<select name="buyKind">${buyKinds.map(([v, t]) => `<option value="${v}" ${v === kind ? 'selected' : ''}>${t}</option>`).join('')}</select>`, 'How the wholesaler sells it to you')}
          ${field('Other unit name', `<input name="buyOther" value="${esc(kind === 'other' ? it.buyUnit : '')}" placeholder="e.g. tray, sack, tin">`)}
        </div>
        <div class="grid2" data-pack-fields>
          ${fieldHtml('<span data-bu>Pieces</span> in one <span data-bu1>unit</span>', `<input name="packSize" type="number" inputmode="numeric" min="2" step="any" value="${num(it.packSize) > 1 ? it.packSize : ''}" placeholder="e.g. 12">`, 'How many you sell from one')}
          ${fieldHtml('Price per <span data-bu1>unit</span> (TSh)', `<input name="packCost" type="number" inputmode="decimal" min="0" step="any" value="${num(it.packSize) > 1 && it.cost !== undefined ? Math.round(num(it.cost) * num(it.packSize)) : ''}">`, 'What the wholesaler charges you')}
        </div>
        <p class="pack-rule" data-rule></p>
      </fieldset>
      <div class="grid2">
        ${field('Selling price (TSh)', `<input name="price" type="number" inputmode="numeric" min="0" step="1" value="${it.variablePrice ? '' : it.price ?? ''}" ${it.variablePrice ? 'disabled' : ''}>`)}
        ${fieldHtml('Cost per <span data-pc>' + esc(it.unit || 'pcs') + '</span> (TSh)', `<input name="cost" type="number" inputmode="decimal" min="0" step="any" value="${it.cost !== undefined ? Math.round(num(it.cost) * 100) / 100 : ''}">`, item ? 'Updates automatically when you receive stock' : 'What one piece costs you')}
      </div>
      <label class="check"><input type="checkbox" name="variablePrice" ${it.variablePrice ? 'checked' : ''}> Price is entered at the time of sale</label>
      <div class="grid2">
        ${field('Category', `<input name="category" list="cat-list" value="${esc(it.category)}" placeholder="e.g. Groceries"><datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
        ${field('Unit', `<input name="unit" list="unit-list" value="${esc(it.unit)}"><datalist id="unit-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>`)}
      </div>
      ${item ? '' : field('Opening stock', '<input name="stock" type="number" inputmode="decimal" step="any" value="0">', 'How many you have right now')}
      <fieldset class="group"><legend>Restocking</legend>
        <div class="grid2">
          ${field('Minimum stock', `<input name="minStock" type="number" inputmode="decimal" min="0" step="any" value="${it.minStock ?? ''}" placeholder="auto">`, 'Alert and order at or below this')}
          ${field('Maximum stock', `<input name="maxStock" type="number" inputmode="decimal" min="0" step="any" value="${it.maxStock || ''}" placeholder="not set">`, 'Orders fill up to this')}
        </div>
        ${field('Usual supplier', `<select name="supplierId"><option value="">— None —</option>${sups.map((s) => `<option value="${s.id}" ${s.id === it.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`)}
      </fieldset>
      <details class="more"><summary>Barcode, SKU and more</summary>
        <div class="grid2">
          ${field('SKU / code', `<input name="sku" value="${esc(it.sku)}">`)}
          ${field('Barcode', `<input name="barcode" value="${esc(it.barcode)}" inputmode="numeric">`)}
        </div>
        <label class="check"><input type="checkbox" name="service" ${it.service ? 'checked' : ''}> This is a service (no stock to track)</label>
      </details>`,
    actions: `${item ? '<button type="button" class="btn ghost danger" data-archive>Remove</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">${item ? 'Save changes' : 'Add item'}</button>`,
    onMount: (dlg, close) => {
      const f = dlg.querySelector('form');
      const unitName = () => (f.buyKind.value === 'other' ? f.buyOther.value.trim() || 'unit' : f.buyKind.value);
      const pcName = () => f.unit.value.trim() || 'pcs';
      const showPack = () => {
        const k = f.buyKind.value;
        f.buyOther.closest('.field').hidden = k !== 'other';
        dlg.querySelector('[data-pack-fields]').hidden = !k;
        if (k === 'dozen') { f.packSize.value = 12; f.packSize.readOnly = true; } else f.packSize.readOnly = false;
        dlg.querySelectorAll('[data-bu1]').forEach((e) => { e.textContent = unitName(); });
        dlg.querySelectorAll('[data-bu]').forEach((e) => { e.textContent = cap(pcName()); });
        dlg.querySelectorAll('[data-pc]').forEach((e) => { e.textContent = pcName(); });
        const per = num(f.packSize.value);
        const rule = dlg.querySelector('[data-rule]');
        rule.textContent = k && per > 1
          ? `1 ${unitName()} = ${per} ${pcName()}${num(f.packCost.value) ? ` · ${fmt(num(f.packCost.value))} per ${unitName()} = ${fmt(num(f.packCost.value) / per)} per ${pcName() === 'pcs' ? 'piece' : pcName()}` : ''}. Orders are made in ${plural(unitName(), 2)}; receiving 1 ${unitName()} adds ${per} ${pcName()} to stock.`
          : k ? `Enter how many ${pcName()} are in one ${unitName()}.` : 'Ordered and received one by one.';
      };
      // Price per carton ↔ cost per piece stay in step.
      const fromPack = () => { const per = num(f.packSize.value); if (per > 1 && f.packCost.value !== '') f.cost.value = Math.round((num(f.packCost.value) / per) * 100) / 100; };
      f.buyKind.addEventListener('change', () => { showPack(); if (f.buyKind.value === 'other') f.buyOther.focus(); else if (f.buyKind.value && f.buyKind.value !== 'dozen') f.packSize.focus(); fromPack(); showPack(); });
      f.packSize.addEventListener('input', () => { fromPack(); showPack(); });
      f.packCost.addEventListener('input', () => { fromPack(); showPack(); });
      f.buyOther.addEventListener('input', showPack);
      f.unit.addEventListener('input', showPack);
      f.cost.addEventListener('input', () => { const per = num(f.packSize.value); if (f.buyKind.value && per > 1 && f.cost.value !== '') f.packCost.value = Math.round(num(f.cost.value) * per); showPack(); });
      showPack();
      const vp = dlg.querySelector('[name=variablePrice]');
      vp.addEventListener('change', () => { const p = dlg.querySelector('[name=price]'); p.disabled = vp.checked; if (vp.checked) p.value = ''; });
      dlg.querySelector('[data-archive]')?.addEventListener('click', async () => {
        close();
        if (await confirmBox(`Remove ${item.name}? Its sales history stays in your reports.`, { ok: 'Remove item', danger: true })) {
          store.archiveItem(item.id);
          toast(`${item.name} removed`);
        }
      });
    },
    onSubmit: (v) => {
      const dup = store.activeItems().find((i) => i.name.toLowerCase() === v.name.trim().toLowerCase() && i.id !== item?.id);
      if (dup) throw new Error(`An item called “${dup.name}” already exists`);
      if (num(v.maxStock) > 0 && num(v.maxStock) <= num(v.minStock)) throw new Error('Maximum stock must be more than minimum stock');
      const variablePrice = v.variablePrice === 'on';
      // Buying unit: none (single pieces) or a named unit with how many pieces are in it.
      let buyUnit = '', packSize = 1;
      if (v.buyKind) {
        buyUnit = v.buyKind === 'other' ? String(v.buyOther || '').trim() : v.buyKind;
        packSize = v.buyKind === 'dozen' ? 12 : num(v.packSize);
        if (!buyUnit) throw new Error('Enter the name of the buying unit, e.g. tray');
        if (!(packSize > 1)) throw new Error(`Enter how many ${v.unit || 'pcs'} are in one ${buyUnit}`);
      }
      v.buyUnit = buyUnit; v.packSize = packSize;
      if (!variablePrice && v.price === '') throw new Error('Enter a selling price, or tick “Price is entered at the time of sale”');
      store.saveItem({ ...v, price: variablePrice ? 0 : v.price, id: item?.id, service: v.service === 'on', variablePrice });
      toast(item ? 'Changes saved' : `${v.name} added`);
    },
  });
}

export function openAdjust(item) {
  modal({
    title: `Adjust stock · ${item.name}`,
    body: `
      <p class="muted">Recorded now: <b>${fmtQty(item.stock)} ${esc(item.unit || '')}</b></p>
      <div class="chips wrap">
        <label class="chip radio"><input type="radio" name="mode" value="count" checked>Set counted amount</label>
        <label class="chip radio"><input type="radio" name="mode" value="remove">Remove</label>
        <label class="chip radio"><input type="radio" name="mode" value="add">Add</label>
      </div>
      ${field('Quantity', '<input name="qty" type="number" inputmode="decimal" step="any" min="0" required autofocus>')}
      ${field('Reason', `<select name="reason">${['Stock count', 'Damaged', 'Expired', 'Lost or stolen', 'Own use', 'Returned to supplier', 'Found', 'Other'].map((r) => `<option>${r}</option>`).join('')}</select>`)}
      ${field('Note (optional)', '<input name="note">')}
      <p class="muted small">Removed stock is counted as a loss at cost in your profit report. To record stock you bought, use “Receive stock” instead.</p>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>',
    onSubmit: (v) => {
      store.adjustStock(item, v);
      toast('Stock updated');
    },
  });
}

function openItem(item) {
  if (!item) return;
  const plan = store.plan().find((p) => p.item.id === item.id);
  const boss = store.can('editItems');
  const sold30 = soldQty(store.data.sales, 30)[item.id] || 0;
  const since = Date.now() - 60 * DAY;
  const moves = [
    ...store.data.sales.filter((s) => !s.voided && s.ts >= since).flatMap((s) => s.lines.filter((l) => l.itemId === item.id).map((l) => ({ ts: s.ts, qty: -l.qty, what: `Sold · ${s.no}` }))),
    ...store.data.purchases.filter((p) => p.ts >= since).flatMap((p) => p.lines.filter((l) => l.itemId === item.id).map((l) => ({ ts: p.ts, qty: l.qty, what: `Received${p.poNo ? ' on ' + p.poNo : ''}${p.supplierName ? ' from ' + p.supplierName : ''} @ ${fmt(l.cost)}` }))),
    ...store.data.adjustments.filter((a) => a.itemId === item.id && a.ts >= since).map((a) => ({ ts: a.ts, qty: a.qty, what: a.reason })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 25);
  const sup = store.supplier(item.supplierId);
  const margin = num(item.price) ? (num(item.price) - num(item.cost)) / num(item.price) : 0;
  modal({
    title: item.name,
    wide: true,
    body: `
      <div class="stats compact">
        <div><span>In stock</span><strong>${item.service ? '—' : fmtQty(item.stock) + ' ' + esc(item.unit || '')}</strong></div>
        <div><span>Selling price</span><strong>${item.variablePrice ? 'Set at sale' : fmt(item.price)}</strong></div>
        ${boss ? `<div><span>Average cost</span><strong>${fmt(item.cost)}</strong></div>
        <div><span>Margin</span><strong>${(margin * 100).toFixed(0)}%</strong></div>` : ''}
      </div>
      ${plan ? `<div class="stats compact">
        <div><span>Sold last 30 days</span><strong>${fmtQty(sold30)}</strong></div>
        <div><span>Average per day</span><strong>${plan.avgDaily.toFixed(1)}</strong></div>
        <div><span>Alert at</span><strong>${fmtQty(plan.reorderPoint)}</strong></div>
        <div class="${plan.status !== 'ok' ? 'warn' : ''}"><span>${plan.suggestQty ? 'Order now' : 'Lasts about'}</span><strong>${plan.suggestQty ? fmtQty(plan.suggestQty) + ' ' + esc(item.unit || '') : plan.daysLeft !== null ? Math.floor(plan.daysLeft) + ' days' : '—'}</strong></div>
      </div>` : ''}
      <p class="muted small">${[item.category, item.sku && 'SKU ' + item.sku, item.barcode && 'Barcode ' + item.barcode, sup && 'Supplier: ' + sup.name, item.lastCost && boss ? 'Last bought at ' + fmt(item.lastCost) : ''].filter(Boolean).map(esc).join(' · ')}</p>
      ${(() => {
        const open = store.openPos().filter((po) => po.lines.some((l) => l.itemId === item.id && num(l.received) < num(l.qty)));
        return open.length ? `<h3>On order</h3><ul class="rows">${open.map((po) => {
          const l = po.lines.find((x) => x.itemId === item.id);
          return `<li class="row"><div class="grow">${esc(po.no)} · ${esc(po.supplierName)}<small>expected ${fmtDate(po.expectedTs)}${isLate(po) ? ' · late' : ''}</small></div><span class="num up">+${fmtQty(num(l.qty) - num(l.received))}</span></li>`;
        }).join('')}</ul>` : '';
      })()}
      <h3>Last 60 days</h3>
      ${moves.length ? `<ul class="rows">${moves.map((m) => `<li class="row"><div class="grow">${esc(m.what)}<small>${fmtDate(m.ts)}</small></div><span class="num ${m.qty < 0 ? 'neg' : 'up'}">${m.qty > 0 ? '+' : '−'}${fmtQty(Math.abs(m.qty))}</span></li>`).join('')}</ul>` : '<p class="muted">No movement.</p>'}`,
    actions: boss
      ? `<button type="button" class="btn ghost" data-edit>${icon('edit')}Edit</button>${item.service ? '' : `<button type="button" class="btn ghost" data-adjust>Adjust stock</button>`}<button class="btn primary">Done</button>`
      : '<button class="btn primary">Done</button>',
    onMount: (dlg, close) => {
      dlg.querySelector('[data-edit]')?.addEventListener('click', () => { close(); openItemForm(item); });
      dlg.querySelector('[data-adjust]')?.addEventListener('click', () => { close(); openAdjust(item); });
    },
  });
}

function exportItems() {
  const rows = [['Name', 'Category', 'SKU', 'Barcode', 'Unit', 'Price', 'Cost', 'In stock', 'Minimum stock', 'Maximum stock', 'Bought in', 'Pieces in each', 'Supplier', 'Track stock', 'Variable price']];
  for (const i of store.activeItems()) {
    rows.push([i.name, i.category, i.sku, i.barcode, i.unit, i.variablePrice ? '' : i.price, Math.round(num(i.cost) * 100) / 100, i.service ? '' : i.stock, i.minStock, i.maxStock, num(i.packSize) > 1 ? i.buyUnit || 'pack' : '', num(i.packSize) > 1 ? i.packSize : '', store.supplier(i.supplierId)?.name || '', i.service ? 'N' : 'Y', i.variablePrice ? 'Y' : 'N']);
  }
  downloadFile(`items-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
}

/** Map a CSV header row (Loyverse export or any simple sheet) to our fields. */
export function mapColumns(header) {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...res) => {
    for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; }
    return -1;
  };
  return {
    handle: find(/^handle$/),
    name: find(/^name$/, /^item name$/, /^item$/, /^product/),
    opt1: find(/^option 1 value$/),
    opt2: find(/^option 2 value$/),
    sku: find(/^sku$/, /^code$/),
    barcode: find(/^barcode$/),
    category: find(/^category$/),
    price: find(/^default price$/, /^price \[/, /^price$/, /^selling price$/),
    cost: find(/^cost$/, /^purchase cost$/, /^cost price$/),
    stock: find(/^in stock/, /^stock$/, /^quantity$/, /^qty$/),
    minStock: find(/^low stock/, /^minimum stock$/, /^min/),
    maxStock: find(/^optimal stock/, /^maximum stock$/, /^fill up to$/, /^max/),
    track: find(/^track stock$/),
    service: find(/^service$/),
    variable: find(/^variable price$/),
    byWeight: find(/^sold by weight$/),
    supplier: find(/^primary supplier$/, /^supplier$/),
    unit: find(/^unit$/, /^sold by$/),
    buyUnit: find(/^bought in$/, /^buying unit$/, /^buy unit$/),
    packSize: find(/^pieces in each$/, /^pieces in one/, /^pack size$/, /^per pack$/),
  };
}

export function rowsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const m = mapColumns(rows[0]);
  if (m.name < 0) throw new Error('Could not find a “Name” column in this file');
  const get = (r, k) => (m[k] >= 0 ? (r[m[k]] ?? '').trim() : '');
  const out = [];
  let lastHandle = '', lastName = '';
  for (const r of rows.slice(1)) {
    let name = get(r, 'name');
    const handle = get(r, 'handle');
    if (!name && handle && handle === lastHandle) name = lastName; // Loyverse variant rows
    else { lastName = name; lastHandle = handle; }
    const opts = [get(r, 'opt1'), get(r, 'opt2')].filter(Boolean).join(' ');
    if (!name) continue;
    const yes = (k) => /^(y|yes|true|1|ndiyo)$/i.test(get(r, k));
    const no = (k) => /^(n|no|false|0|hapana)$/i.test(get(r, k));
    // true / false when the file says so; undefined when the cell is empty (an existing item keeps its setting).
    const flag = (k) => (yes(k) ? true : no(k) ? false : undefined);
    const tracked = flag('track');
    out.push({
      name: opts ? `${name} ${opts}` : name,
      sku: get(r, 'sku'), barcode: get(r, 'barcode'), category: get(r, 'category'),
      price: get(r, 'price'), cost: get(r, 'cost'), stock: get(r, 'stock'),
      minStock: get(r, 'minStock'), maxStock: get(r, 'maxStock'), supplier: get(r, 'supplier'),
      unit: get(r, 'unit') || (yes('byWeight') ? 'kg' : ''),
      buyUnit: get(r, 'buyUnit'), packSize: get(r, 'packSize'),
      // Loyverse: "Track stock" = N means a service; a blank price means "price entered at sale" (for new items).
      service: flag('service') ?? (tracked === undefined ? undefined : !tracked),
      variablePrice: flag('variable'),
      priceBlank: m.price >= 0 && get(r, 'price') === '',
    });
  }
  return out;
}

/** A ready-to-fill example: every column the importer reads, with typical stationery rows. */
export function sampleCsv() {
  return toCsv([
    ['Name', 'Category', 'SKU', 'Barcode', 'Unit', 'Price', 'Cost', 'In stock', 'Minimum stock', 'Maximum stock', 'Bought in', 'Pieces in each', 'Supplier', 'Track stock', 'Variable price'],
    ['Blue Pen (Bic)', 'Pens', 'PEN-BLUE', '', 'pcs', 300, 200, 50, 20, 60, 'dozen', 12, 'Example Wholesaler', 'Y', 'N'],
    ['Counter Book Q4', 'Exercise books', 'CB-Q4', '', 'pcs', 4000, 2800, 10, 5, 15, 'carton', 24, 'Example Wholesaler', 'Y', 'N'],
    ['Ream A4 Double A', 'Paper', 'RM-DA', '', 'pcs', 19000, 15200, 5, 2, 6, 'box', 5, 'Example Paper Supplier', 'Y', 'N'],
    ['Mathematical set', 'Geometry', 'MATH-SET', '', 'pcs', 3000, 1450, 4, 1, 3, '', '', '', 'Y', 'N'],
    ['Photocopy', 'Services', 'SRV-COPY', '', 'page', 100, '', '', '', '', '', '', '', 'N', 'N'],
    ['Printing (price at sale)', 'Services', 'SRV-PRINT', '', 'page', '', '', '', '', '', '', '', '', 'N', 'Y'],
  ]);
}

function openImport() {
  let rows = [];
  modal({
    title: 'Import items',
    body: `
      <p>Upload a CSV file of your items. Exports from Loyverse work directly:</p>
      <ol class="steps-list">
        <li>In Loyverse Back Office open <b>Items → Item list</b>.</li>
        <li>Click <b>Export</b> and save the CSV file.</li>
        <li>Choose that file below.</li>
      </ol>
      <p class="muted small">Any spreadsheet saved as CSV also works. Start from the sample file — it has every column and example rows (single pieces, a dozen, a carton and a service).</p>
      <p><button type="button" class="btn ghost small" data-sample>${icon('download')}Download sample CSV</button></p>
      <p class="muted small">Items already in the app are matched by SKU or name and <b>only the cells you fill in are changed</b> — leave a cell empty to keep what is saved (e.g. a file with just Name, Minimum stock and Maximum stock updates only the levels).</p>
      <input type="file" name="file" accept=".csv,text/csv" required>
      <div id="imp-preview"></div>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary" id="imp-go" disabled>Import</button>',
    onMount: (dlg) => {
      dlg.querySelector('[data-sample]').addEventListener('click', () => downloadFile('shop-items-sample.csv', sampleCsv(), 'text/csv'));
      const prev = dlg.querySelector('#imp-preview');
      dlg.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          rows = rowsFromCsv(await f.text());
          prev.innerHTML = rows.length
            ? (() => {
              const known = (r) => store.activeItems().some((i) => (r.sku && i.sku && i.sku.toLowerCase() === r.sku.toLowerCase()) || i.name.toLowerCase() === r.name.toLowerCase());
              const upd = rows.filter(known).length;
              return `<p><b>${rows.length}</b> items found: <b>${rows.length - upd}</b> new, <b>${upd}</b> to update. First few:</p><ul class="rows">${rows.slice(0, 5).map((r) => `<li class="row"><div class="grow">${esc(r.name)}<small>${known(r) ? 'Update' : 'New'}${r.category ? ' · ' + esc(r.category) : ''}${r.minStock !== '' || r.maxStock !== '' ? ` · min ${esc(r.minStock || '—')} / max ${esc(r.maxStock || '—')}` : ''}</small></div><span class="num">${r.price !== '' ? fmt(r.price) : '—'}${r.stock !== '' ? ' · ' + fmtQty(r.stock) : ''}</span></li>`).join('')}</ul>`;
            })()
            : '<p class="warn-text">No items found in this file.</p>';
          dlg.querySelector('#imp-go').disabled = !rows.length;
        } catch (err) {
          prev.innerHTML = `<p class="warn-text">${esc(err.message)}</p>`;
        }
      });
    },
    onSubmit: () => {
      const r = store.importItems(rows);
      toast(`Imported: ${r.added} new, ${r.updated} updated`);
    },
  });
}

/** One table to set every item's minimum and maximum stock. */
export function openLevels() {
  const items = store.activeItems().filter((i) => !i.service);
  const missing = items.filter((i) => !(num(i.maxStock) > 0)).length;
  modal({
    title: 'Minimum and maximum stock',
    wide: true,
    body: `
      <p class="muted small">Minimum: when stock reaches this, the item is flagged and ordered. Maximum: orders fill stock back up to this.</p>
      <div class="row-btns spread">
        <div class="searchbar grow">${icon('search')}<input type="search" id="lv-q" placeholder="Search items" autocomplete="off"></div>
        ${missing ? `<button type="button" class="btn ghost small" data-fill>Suggest maximums for ${missing} item${missing > 1 ? 's' : ''}</button>` : ''}
      </div>
      <table class="table levels-table">
        <thead><tr><th>Item</th><th class="r">In stock</th><th class="r">Min</th><th class="r">Max</th></tr></thead>
        <tbody>${items.map((i) => `
          <tr data-id="${i.id}" data-name="${esc(i.name.toLowerCase())}">
            <td>${esc(i.name)}</td>
            <td class="r num">${fmtQty(i.stock)}</td>
            <td class="r"><input class="lv-min" type="number" inputmode="decimal" min="0" step="any" value="${num(i.minStock) || ''}" aria-label="Minimum for ${esc(i.name)}"></td>
            <td class="r"><input class="lv-max" type="number" inputmode="decimal" min="0" step="any" value="${num(i.maxStock) || ''}" placeholder="not set" aria-label="Maximum for ${esc(i.name)}"></td>
          </tr>`).join('')}</tbody>
      </table>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save levels</button>',
    onMount: (dlg) => {
      dlg.querySelector('#lv-q').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        dlg.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = q && !tr.dataset.name.includes(q); });
      });
      dlg.querySelector('[data-fill]')?.addEventListener('click', (e) => {
        // A starting point the owner can adjust: three times the minimum (at least 10 above it).
        let n = 0;
        dlg.querySelectorAll('tbody tr').forEach((tr) => {
          const max = tr.querySelector('.lv-max');
          const min = num(tr.querySelector('.lv-min').value);
          if (!max.value && min > 0) { max.value = Math.max(min * 3, min + 10); max.classList.add('suggested'); n++; }
        });
        e.target.textContent = n ? `Suggested ${n} — check them, then save` : 'Set minimums first';
        e.target.disabled = true;
      });
    },
    onSubmit: (_, { form }) => {
      const changes = [];
      for (const tr of form.querySelectorAll('tbody tr')) {
        const it = store.item(tr.dataset.id);
        const min = num(tr.querySelector('.lv-min').value);
        const max = num(tr.querySelector('.lv-max').value);
        if (max > 0 && max <= min) throw new Error(`${it.name}: maximum must be more than minimum`);
        if (min !== num(it.minStock) || max !== num(it.maxStock)) changes.push({ id: it.id, minStock: min, maxStock: max });
      }
      const n = changes.length ? store.setLevels(changes) : 0;
      toast(n ? `Saved levels for ${n} item${n > 1 ? 's' : ''}` : 'No changes');
    },
  });
}

/** Count many items at once (all, or one category). Only the items you type a count for change. */
export function openCount() {
  const items = store.activeItems().filter((i) => !i.service);
  const cats = [...new Set(items.map((i) => i.category || 'Other'))].sort();
  modal({
    title: 'Count stock',
    wide: true,
    body: `
      <p class="muted small">Type what you count on the shelf. Leave a box empty to skip that item. Differences are saved as "Stock count" adjustments, and shortages count as stock losses in your profit report.</p>
      <div class="row-btns spread">
        <div class="searchbar grow">${icon('search')}<input type="search" id="ct-q" placeholder="Search items" autocomplete="off"></div>
        ${cats.length > 1 ? `<select id="ct-cat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>` : ''}
      </div>
      <table class="table levels-table count-table">
        <thead><tr><th>Item</th><th class="r">Recorded</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead>
        <tbody>${items.map((i) => `
          <tr data-id="${i.id}" data-name="${esc(i.name.toLowerCase())}" data-cat="${esc(i.category || 'Other')}">
            <td>${esc(i.name)}</td><td class="r num">${fmtQty(i.stock)}</td>
            <td class="r"><input class="ct-n" type="number" inputmode="decimal" min="0" step="any" aria-label="Counted ${esc(i.name)}"></td>
            <td class="r num ct-d"></td></tr>`).join('')}</tbody>
      </table>
      <p class="total-row"><span id="ct-sum">No counts yet</span><strong id="ct-val"></strong></p>
      ${field('Note (optional)', '<input name="note" placeholder="e.g. end of month count">')}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save count</button>',
    onMount: (dlg) => {
      const filter = () => {
        const q = dlg.querySelector('#ct-q').value.trim().toLowerCase();
        const c = dlg.querySelector('#ct-cat')?.value || '';
        dlg.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = (q && !tr.dataset.name.includes(q)) || (c && tr.dataset.cat !== c); });
      };
      dlg.querySelector('#ct-q').addEventListener('input', filter);
      dlg.querySelector('#ct-cat')?.addEventListener('change', filter);
      dlg.querySelector('tbody').addEventListener('input', () => {
        let n = 0, changed = 0, val = 0;
        dlg.querySelectorAll('tbody tr').forEach((tr) => {
          const inp = tr.querySelector('.ct-n');
          const cell = tr.querySelector('.ct-d');
          if (inp.value === '') { cell.textContent = ''; return; }
          const it = store.item(tr.dataset.id);
          const d = num(inp.value) - num(it.stock);
          n++; if (d) changed++; val += d * num(it.cost);
          cell.innerHTML = d === 0 ? '<span class="up">✓</span>' : `<span class="${d < 0 ? 'neg' : 'up'}">${d > 0 ? '+' : '−'}${fmtQty(Math.abs(d))}</span>`;
        });
        dlg.querySelector('#ct-sum').textContent = n ? `${n} counted · ${changed} different` : 'No counts yet';
        dlg.querySelector('#ct-val').textContent = n ? `${val < 0 ? '−' : '+'}${fmt(Math.abs(val))} at cost` : '';
      });
    },
    onSubmit: (v, { form }) => {
      const counts = [...form.querySelectorAll('tbody tr')].map((tr) => ({ itemId: tr.dataset.id, counted: tr.querySelector('.ct-n').value }));
      if (!counts.some((c) => c.counted !== '')) throw new Error('Type the count for at least one item');
      const r = store.countStock(counts, v.note);
      toast(r.changed ? `Count saved — ${r.changed} item${r.changed > 1 ? 's' : ''} corrected (${r.value < 0 ? '−' : '+'}${fmt(Math.abs(r.value))})` : 'Count saved — everything matched');
    },
  });
}
