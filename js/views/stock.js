import { store } from '../store.js';
import { num, soldQty, stockValue, DAY } from '../calc.js';
import { esc, fmt, fmtQty, fmtDate, icon, modal, toast, field, statusPill, emptyState, confirmBox, downloadFile, toCsv, parseCsv } from '../ui.js';

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
          <button class="btn primary" data-act="new">${icon('plus')}Add item</button>` : ''}
        </div>
      </div>
      <div id="stock-summary"></div>
      <div class="toolbar">
        <div class="searchbar">${icon('search')}<input type="search" id="stock-q" placeholder="Search items" autocomplete="off"></div>
        <div class="seg" role="tablist">
          <button data-f="all">All</button><button data-f="low">Needs restock</button>
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
      const plan = store.plan();
      const items = store.activeItems();
      const cats = [...new Set(items.map((i) => i.category || 'Other'))].sort();
      catEl.innerHTML = `<option value="">All categories</option>${cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
      catEl.hidden = cats.length < 2;
      if (boss) {
        const v = stockValue(items);
        const lows = plan.filter((p) => p.status !== 'ok').length;
        sumEl.innerHTML = `<div class="stats compact">
          <div><span>Items</span><strong>${items.length}</strong></div>
          <div><span>Stock value (cost)</span><strong>${fmt(v.cost)}</strong></div>
          <div><span>Stock value (selling)</span><strong>${fmt(v.retail)}</strong></div>
          <div><span>Potential profit</span><strong>${fmt(v.retail - v.cost)}</strong></div>
          <div><span>Margin</span><strong>${v.retail ? (Math.floor(((v.retail - v.cost) / v.retail) * 10000) / 100).toFixed(2) + '%' : '—'}</strong></div>
          <div class="${lows ? 'warn' : ''}"><span>Need restock</span><strong>${lows}</strong></div>
        </div>`;
      }
      const s = q.toLowerCase();
      const services = items.filter((i) => i.service).map((item) => ({ item, stock: 0, status: 'ok', service: true }));
      const rows = [...plan, ...services].filter((p) =>
        (filter !== 'low' || p.status !== 'ok') &&
        (!cat || (p.item.category || 'Other') === cat) &&
        (!s || p.item.name.toLowerCase().includes(s) || (p.item.sku || '').toLowerCase().includes(s) || (p.item.barcode || '').includes(q)));
      if (filter === 'all') rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
      listEl.innerHTML = rows.length ? `
        <table class="table">
          <thead><tr><th>Item</th><th class="r">In stock</th><th class="r hide-sm">Price</th>${boss ? '<th class="r hide-sm">Cost</th>' : ''}<th class="r hide-sm">Reorder</th><th>Status</th></tr></thead>
          <tbody>${rows.map((p) => `
            <tr class="tap" data-item="${p.item.id}">
              <td><b>${esc(p.item.name)}</b><small>${esc(p.item.category || '')}${p.item.sku ? ' · ' + esc(p.item.sku) : ''}</small></td>
              <td class="r num">${p.service ? '—' : `${fmtQty(p.stock)} <small class="unit">${esc(p.item.unit || '')}</small>`}</td>
              <td class="r num hide-sm">${p.item.variablePrice ? '<span class="muted">Variable</span>' : fmt(p.item.price)}</td>
              ${boss ? `<td class="r num hide-sm">${fmt(p.item.cost)}</td>` : ''}
              <td class="r num hide-sm">${p.service ? '' : p.suggestQty ? `<b>${fmtQty(p.suggestQty)}</b>` : `<span class="muted">at ${fmtQty(p.reorderPoint)}</span>`}</td>
              <td>${p.service ? '<span class="pill">Service</span>' : statusPill(p.status)}</td>
            </tr>`).join('')}</tbody>
        </table>`
        : items.length
          ? emptyState(filter === 'low' ? 'Nothing needs restocking' : 'No match', filter === 'low' ? 'Every item is above its reorder level.' : 'Try a different search.')
          : emptyState('Add your products', 'Add items one by one, or import the item list you exported from Loyverse.',
            boss ? '<div class="row-btns"><button class="btn primary" data-act="new">Add an item</button><button class="btn ghost" data-act="import">Import from Loyverse</button></div>' : '');
    };

    el.querySelector('#stock-q').addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
    catEl.addEventListener('change', () => { cat = catEl.value; draw(); });
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-f]')?.dataset.f;
      if (f) { filter = f; draw(); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'new') openItemForm();
      if (a === 'import') openImport();
      if (a === 'export') exportItems();
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
  const cats = [...new Set(store.data.items.map((i) => i.category).filter(Boolean))].sort();
  const sups = [...store.data.suppliers].sort((a, b) => a.name.localeCompare(b.name));
  modal({
    title: item ? `Edit ${item.name}` : 'Add item',
    body: `
      ${field('Name', `<input name="name" required autofocus value="${esc(it.name)}" placeholder="e.g. Sugar 1kg">`)}
      <div class="grid2">
        ${field('Selling price (TSh)', `<input name="price" type="number" inputmode="numeric" min="0" step="1" value="${it.variablePrice ? '' : it.price ?? ''}" ${it.variablePrice ? 'disabled' : ''}>`)}
        ${field('Cost price (TSh)', `<input name="cost" type="number" inputmode="decimal" min="0" step="any" value="${it.cost !== undefined ? Math.round(num(it.cost) * 100) / 100 : ''}">`, item ? 'Updates automatically when you receive stock' : 'What you pay the supplier per unit')}
      </div>
      <label class="check"><input type="checkbox" name="variablePrice" ${it.variablePrice ? 'checked' : ''}> Price is entered at the time of sale</label>
      <div class="grid2">
        ${field('Category', `<input name="category" list="cat-list" value="${esc(it.category)}" placeholder="e.g. Groceries"><datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
        ${field('Unit', `<input name="unit" list="unit-list" value="${esc(it.unit)}"><datalist id="unit-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>`)}
      </div>
      ${item ? '' : field('Opening stock', '<input name="stock" type="number" inputmode="decimal" step="any" value="0">', 'How many you have right now')}
      <fieldset class="group"><legend>Restocking</legend>
        <div class="grid3">
          ${field('Low stock level', `<input name="minStock" type="number" inputmode="decimal" min="0" step="any" value="${it.minStock ?? ''}" placeholder="auto">`, 'Alert at or below')}
          ${field('Fill up to', `<input name="maxStock" type="number" inputmode="decimal" min="0" step="any" value="${it.maxStock || ''}" placeholder="auto">`, 'Target after restock')}
          ${field('Pack size', `<input name="packSize" type="number" inputmode="decimal" min="1" step="any" value="${it.packSize || 1}">`, 'Order in multiples')}
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
      const variablePrice = v.variablePrice === 'on';
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
    ...store.data.purchases.filter((p) => p.ts >= since).flatMap((p) => p.lines.filter((l) => l.itemId === item.id).map((l) => ({ ts: p.ts, qty: l.qty, what: `Received${p.supplierName ? ' from ' + p.supplierName : ''} @ ${fmt(l.cost)}` }))),
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
  const rows = [['Name', 'Category', 'SKU', 'Barcode', 'Unit', 'Price', 'Cost', 'In stock', 'Low stock', 'Fill up to', 'Pack size', 'Supplier', 'Track stock', 'Variable price']];
  for (const i of store.activeItems()) {
    rows.push([i.name, i.category, i.sku, i.barcode, i.unit, i.variablePrice ? '' : i.price, Math.round(num(i.cost) * 100) / 100, i.service ? '' : i.stock, i.minStock, i.maxStock, i.packSize, store.supplier(i.supplierId)?.name || '', i.service ? 'N' : 'Y', i.variablePrice ? 'Y' : 'N']);
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
    minStock: find(/^low stock/, /^min/),
    maxStock: find(/^optimal stock/, /^fill up to$/, /^max/),
    track: find(/^track stock$/),
    service: find(/^service$/),
    variable: find(/^variable price$/),
    byWeight: find(/^sold by weight$/),
    supplier: find(/^primary supplier$/, /^supplier$/),
    unit: find(/^unit$/),
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
    const yes = (k) => /^(y|yes|true|1)$/i.test(get(r, k));
    const no = (k) => /^(n|no|false|0)$/i.test(get(r, k));
    out.push({
      name: opts ? `${name} ${opts}` : name,
      sku: get(r, 'sku'), barcode: get(r, 'barcode'), category: get(r, 'category'),
      price: get(r, 'price'), cost: get(r, 'cost'), stock: get(r, 'stock'),
      minStock: get(r, 'minStock'), maxStock: get(r, 'maxStock'), supplier: get(r, 'supplier'),
      unit: get(r, 'unit') || (yes('byWeight') ? 'kg' : ''),
      // Loyverse: "Track stock" = N means a service; a blank price means "price entered at sale".
      service: yes('service') || no('track'),
      variablePrice: yes('variable') || (m.price >= 0 && get(r, 'price') === ''),
    });
  }
  return out;
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
      <p class="muted small">Any spreadsheet saved as CSV also works if it has columns like Name, Category, Price, Cost, In stock, Low stock. Items already in the app are updated (matched by SKU or name).</p>
      <input type="file" name="file" accept=".csv,text/csv" required>
      <div id="imp-preview"></div>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary" id="imp-go" disabled>Import</button>',
    onMount: (dlg) => {
      const prev = dlg.querySelector('#imp-preview');
      dlg.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          rows = rowsFromCsv(await f.text());
          prev.innerHTML = rows.length
            ? `<p><b>${rows.length}</b> items found. First few:</p><ul class="rows">${rows.slice(0, 5).map((r) => `<li class="row"><div class="grow">${esc(r.name)}<small>${esc(r.category)}</small></div><span class="num">${fmt(r.price)} · ${fmtQty(r.stock || 0)}</span></li>`).join('')}</ul>`
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
