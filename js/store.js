// App state + every action that changes data.
import {
  DAY, averageCost, cartTotals, dayKey, docNo, draftRfqs, monthKey, monthRange, addMonths, num, money, reorderPlan, onOrderQty,
} from './calc.js';

export const DEFAULT_SETTINGS = {
  shopName: 'My Shop',
  address: '',
  phone: '',
  email: '',
  tin: '',
  currency: 'TZS',
  leadDays: 7,
  coverDays: 30,
  windowDays: 30,
  autoMonthlyRfq: true,
  lastAutoRfq: '',
  rfqNote: 'Please send us your best prices and delivery time for the items below.',
  expenseCategories: ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Taxes & Licences', 'Repairs', 'Other'],
  payMethods: ['Cash', 'M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Card', 'Credit'],
  staffCanReceive: false,
  poNote: 'Please supply the items below. Quote this order number on your delivery note and invoice.',
};

const HISTORY = ['sales', 'purchases', 'adjustments', 'expenses'];
const MASTER = ['items', 'suppliers', 'rfqs', 'pos'];

export const store = {
  backend: null,
  user: null,
  access: null,
  role: null, // 'owner' | 'manager' | 'staff'
  ready: false,
  pending: false,
  online: navigator.onLine,
  since: 0,
  data: { items: [], suppliers: [], rfqs: [], pos: [], sales: [], purchases: [], adjustments: [], expenses: [] },
  settings: { ...DEFAULT_SETTINGS },
  _loaded: new Set(),
  _subs: new Set(),
  _alerted: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit() { for (const fn of this._subs) fn(); },

  item(id) { return this._itemMap?.get(id); },
  supplier(id) { return this.data.suppliers.find((s) => s.id === id); },
  activeItems() { return this.data.items.filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name)); },
  can(what) {
    const r = this.role;
    if (r === 'owner') return true;
    if (r === 'manager') return what !== 'users';
    if (what === 'receive') return !!this.settings.staffCanReceive;
    return ['sell', 'viewStock'].includes(what);
  },

  plan() {
    return reorderPlan(this.activeItems(), this.data.sales, this.settings, Date.now(), onOrderQty(this.data.pos));
  },
  /** Items that are low or out and not already covered by a sent purchase order. */
  lowStock() { return this.plan().filter((p) => p.status === 'out' || p.status === 'low'); },
  openPos() { return this.data.pos.filter((p) => p.status === 'ordered' || p.status === 'partial'); },

  /** Start listening to data once the user has access. */
  startData() {
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    this.since = Math.min(prevMonthStart, Date.now() - 60 * DAY);
    const specs = [
      ...MASTER.map((col) => ({ col })),
      ...HISTORY.map((col) => ({ col, since: this.since })),
      { col: 'meta', docId: 'settings' },
    ];
    this.backend.watch(
      specs,
      (key, docs) => {
        if (key === 'meta/settings') this.settings = { ...DEFAULT_SETTINGS, ...(docs[0] || {}) };
        else {
          this.data[key] = docs;
          if (key === 'items') this._itemMap = new Map(docs.map((d) => [d.id, d]));
        }
        this._loaded.add(key);
        if (!this.ready && this._loaded.has('items') && this._loaded.has('meta/settings')) {
          this.ready = true;
          setTimeout(() => this.autoMonthlyRfq(), 1500);
        }
        this.emit();
      },
      (pending) => { if (pending !== this.pending) { this.pending = pending; this.emit(); } },
    );
  },

  /** Load history for any month (uses live data when it is recent). */
  async monthData(key) {
    const [from, to] = monthRange(key);
    if (from >= this.since) return this.data;
    const out = {};
    for (const col of HISTORY) out[col] = await this.backend.fetchRange(col, from, to);
    return out;
  },

  _stamp(extra = {}) {
    return { updatedAt: Date.now(), updatedBy: this.user?.email || '', ...extra };
  },

  // ---------- Items ----------
  saveItem(input) {
    const isNew = !input.id;
    const id = input.id || this.backend.newId('items');
    const data = {
      name: String(input.name || '').trim(),
      sku: String(input.sku || '').trim(),
      barcode: String(input.barcode || '').trim(),
      category: String(input.category || '').trim(),
      unit: String(input.unit || 'pcs').trim() || 'pcs',
      price: money(input.price),
      cost: num(input.cost),
      minStock: num(input.minStock),
      maxStock: num(input.maxStock),
      packSize: num(input.packSize) || 1,
      supplierId: input.supplierId || '',
      service: !!input.service,
      variablePrice: !!input.variablePrice,
      active: true,
      ...this._stamp(),
    };
    if (isNew) {
      data.stock = num(input.stock);
      data.lastCost = num(input.cost);
      data.createdAt = Date.now();
      this.backend.write([{ type: 'set', col: 'items', id, data }]);
    } else {
      this.backend.write([{ type: 'merge', col: 'items', id, data }]);
    }
    return id;
  },
  /** changes: [{ id, minStock, maxStock }] — saved together. */
  setLevels(changes) {
    const ops = changes.map((c) => ({ type: 'merge', col: 'items', id: c.id, data: { minStock: num(c.minStock), maxStock: num(c.maxStock), ...this._stamp() } }));
    for (let i = 0; i < ops.length; i += 400) this.backend.write(ops.slice(i, i + 400));
    return ops.length;
  },
  archiveItem(id) {
    this.backend.write([{ type: 'merge', col: 'items', id, data: { active: false, ...this._stamp() } }]);
  },

  /** Bulk import (e.g. from a Loyverse items export). Matches existing items by SKU, then name. */
  importItems(rows) {
    const bySku = new Map(this.data.items.filter((i) => i.sku).map((i) => [i.sku.toLowerCase(), i]));
    const byName = new Map(this.data.items.map((i) => [i.name.toLowerCase(), i]));
    const supByName = new Map(this.data.suppliers.map((s) => [s.name.toLowerCase(), s]));
    const ops = [];
    let added = 0, updated = 0;
    for (const r of rows) {
      if (!r.name) continue;
      let supplierId = '';
      if (r.supplier) {
        let s = supByName.get(r.supplier.toLowerCase());
        if (!s) {
          s = { id: this.backend.newId('suppliers'), name: r.supplier };
          supByName.set(r.supplier.toLowerCase(), s);
          ops.push({ type: 'set', col: 'suppliers', id: s.id, data: { name: r.supplier, phone: '', email: '', address: '', ...this._stamp({ createdAt: Date.now() }) } });
        }
        supplierId = s.id;
      }
      const existing = (r.sku && bySku.get(r.sku.toLowerCase())) || byName.get(r.name.toLowerCase());
      const base = {
        name: r.name, sku: r.sku || '', barcode: r.barcode || '', category: r.category || '',
        price: money(r.price), cost: num(r.cost), lastCost: num(r.cost), minStock: num(r.minStock),
        unit: r.unit || 'pcs', service: !!r.service, variablePrice: !!r.variablePrice, active: true, ...this._stamp(),
      };
      if (r.maxStock !== undefined && r.maxStock !== '') base.maxStock = num(r.maxStock);
      if (supplierId) base.supplierId = supplierId;
      if (existing) {
        if (r.stock !== undefined && r.stock !== '') base.stock = r.service ? 0 : num(r.stock);
        ops.push({ type: 'merge', col: 'items', id: existing.id, data: base });
        updated++;
      } else {
        ops.push({
          type: 'set', col: 'items', id: this.backend.newId('items'),
          data: { maxStock: 0, packSize: 1, supplierId: '', ...base, stock: r.service ? 0 : num(r.stock), createdAt: Date.now() },
        });
        added++;
      }
    }
    for (let i = 0; i < ops.length; i += 400) this.backend.write(ops.slice(i, i + 400));
    return { added, updated };
  },

  // ---------- Sales ----------
  recordSale({ lines, discount = 0, pay = 'Cash', customer = '', note = '' }) {
    const ts = Date.now();
    const full = lines
      .filter((l) => num(l.qty) > 0)
      .map((l) => {
        const it = this.item(l.itemId) || {};
        return { itemId: l.itemId, name: it.name || l.name, qty: num(l.qty), price: money(l.price), cost: num(it.cost), unit: it.unit || 'pcs' };
      });
    if (!full.length) throw new Error('The cart is empty');
    const totals = cartTotals(full, discount);
    const id = this.backend.newId('sales');
    const sale = {
      no: docNo('S', ts), ts, date: dayKey(ts), lines: full, ...totals, pay, customer, note,
      voided: false, by: this.user?.email || '', byName: this.user?.name || '',
    };
    const before = new Map(this.plan().map((p) => [p.item.id, p.status]));
    const ops = [{ type: 'set', col: 'sales', id, data: sale }];
    for (const l of full) {
      const it = this.item(l.itemId);
      if (it && !it.service) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: -l.qty });
    }
    this.backend.write(ops);
    this._alertNewLows(before);
    return { ...sale, id };
  },
  voidSale(sale, reason = '') {
    const ops = [{ type: 'merge', col: 'sales', id: sale.id, data: { voided: true, voidReason: reason, voidedAt: Date.now(), voidedBy: this.user?.email || '' } }];
    for (const l of sale.lines) {
      const it = this.item(l.itemId);
      if (it && !it.service) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: num(l.qty) });
    }
    this.backend.write(ops);
  },

  // ---------- Stock in / adjustments ----------
  receivePurchase({ supplierId = '', ref = '', ts = Date.now(), lines, paid = true, note = '', rfqId = '', poId = '', poNo = '', extraOps = [] }) {
    const merged = new Map();
    for (const l of lines) {
      if (!l.itemId || num(l.qty) <= 0) continue;
      const m = merged.get(l.itemId) || { qty: 0, value: 0 };
      m.qty += num(l.qty);
      m.value += num(l.qty) * num(l.cost);
      merged.set(l.itemId, m);
    }
    if (!merged.size) throw new Error('Add at least one item with a quantity');
    const ops = [];
    const outLines = [];
    for (const [itemId, m] of merged) {
      const it = this.item(itemId) || {};
      const unitCost = m.value / m.qty;
      const newCost = averageCost(it.stock, it.cost, m.qty, unitCost);
      ops.push({ type: 'incr', col: 'items', id: itemId, field: 'stock', by: m.qty, data: { cost: newCost, lastCost: unitCost, updatedBy: this.user?.email || '' } });
      outLines.push({ itemId, name: it.name, unit: it.unit || 'pcs', qty: m.qty, cost: money(unitCost) });
    }
    const id = this.backend.newId('purchases');
    const total = money(outLines.reduce((t, l) => t + l.qty * l.cost, 0));
    const sup = this.supplier(supplierId);
    ops.push({
      type: 'set', col: 'purchases', id,
      data: { no: docNo('P', ts), ts, date: dayKey(ts), supplierId, supplierName: sup?.name || '', ref, lines: outLines, total, paid, note, rfqId, poId, poNo, by: this.user?.email || '' },
    });
    if (rfqId) ops.push({ type: 'merge', col: 'rfqs', id: rfqId, data: { status: 'closed', purchaseId: id, ...this._stamp() } });
    this.backend.write([...ops, ...extraOps]);
    return id;
  },

  // ---------- Purchase orders ----------
  _poLines(lines) {
    const merged = new Map();
    for (const l of lines) {
      if (!l.itemId || num(l.qty) <= 0) continue;
      const it = this.item(l.itemId) || {};
      const m = merged.get(l.itemId) || { itemId: l.itemId, name: it.name || l.name, sku: it.sku || '', unit: it.unit || l.unit || 'pcs', qty: 0, cost: money(l.cost), received: num(l.received) };
      m.qty += num(l.qty);
      if (num(l.cost)) m.cost = money(l.cost);
      merged.set(l.itemId, m);
    }
    return [...merged.values()];
  },
  /** Create (no id) or update a purchase order. Returns its id. */
  savePo(po) {
    const { id, data, isNew } = this.buildPo(po);
    this.backend.write([{ type: isNew ? 'set' : 'merge', col: 'pos', id, data }]);
    return id;
  },
  /** The stored form of a purchase order (also used to print it before the save syncs back). */
  buildPo(po) {
    const lines = this._poLines(po.lines || []);
    const sup = this.supplier(po.supplierId);
    const ts = po.ts || Date.now();
    const id = po.id || this.backend.newId('pos');
    const data = {
      no: po.no || docNo('PO', ts), ts, date: dayKey(ts),
      supplierId: po.supplierId || '', supplierName: sup?.name || po.supplierName || 'Any supplier',
      expectedTs: num(po.expectedTs) || ts + num(this.settings.leadDays || 7) * DAY,
      status: po.status || 'draft', lines,
      total: money(lines.reduce((t, l) => t + l.qty * l.cost, 0)),
      note: po.note ?? this.settings.poNote ?? '', rfqId: po.rfqId || '', auto: !!po.auto,
      by: po.by || this.user?.email || '', ...this._stamp(),
    };
    if (po.orderedAt) data.orderedAt = po.orderedAt;
    const isNew = !this.data.pos.some((x) => x.id === id);
    return { id, data, isNew };
  },
  /** Draft one purchase order per supplier for everything low (fills up to maximum). */
  generatePos({ auto = false, week = '' } = {}) {
    const drafts = draftRfqs(this.plan(), this.data.suppliers);
    return drafts.map((d) => this.savePo({
      id: auto && week ? `auto-${week}-${d.supplierId || 'any'}` : undefined,
      supplierId: d.supplierId, supplierName: d.supplierName, auto,
      lines: d.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, cost: l.lastCost })),
    }));
  },
  poFromRfq(rfq) {
    const id = this.savePo({ supplierId: rfq.supplierId, rfqId: rfq.id, lines: rfq.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, cost: l.quotedCost || l.lastCost })) });
    this.backend.write([{ type: 'merge', col: 'rfqs', id: rfq.id, data: { status: 'ordered', poId: id, ...this._stamp() } }]);
    return id;
  },
  setPoStatus(po, status) {
    const extra = status === 'ordered' && !po.orderedAt ? { orderedAt: Date.now() } : {};
    this.backend.write([{ type: 'merge', col: 'pos', id: po.id, data: { status, ...extra, ...this._stamp() } }]);
  },
  deletePo(id) { this.backend.write([{ type: 'delete', col: 'pos', id }]); },
  /**
   * Receive (part of) a purchase order. receipts: [{ itemId, qty, cost }].
   * Stock and average cost update at once; anything not delivered stays on order
   * unless closeShort is set.
   */
  receivePo(po, receipts, { ts = Date.now(), ref = '', paid = false, closeShort = false, note = '' } = {}) {
    const got = new Map(receipts.filter((r) => num(r.qty) > 0).map((r) => [r.itemId, r]));
    if (!got.size && !closeShort) throw new Error('Enter how many of each item arrived');
    const lines = po.lines.map((l) => {
      const r = got.get(l.itemId);
      return r ? { ...l, received: num(l.received) + num(r.qty), cost: money(r.cost || l.cost) } : l;
    });
    const complete = lines.every((l) => num(l.received) >= num(l.qty));
    const status = complete || closeShort ? 'received' : 'partial';
    const poOp = {
      type: 'merge', col: 'pos', id: po.id,
      data: { lines, status, closedShort: !complete && closeShort, ...(status === 'received' ? { receivedAt: Date.now() } : {}), ...this._stamp() },
    };
    if (!got.size) { this.backend.write([poOp]); return null; }
    return this.receivePurchase({
      supplierId: po.supplierId, ref, ts, paid, note, poId: po.id, poNo: po.no,
      lines: [...got.values()].map((r) => ({ itemId: r.itemId, qty: num(r.qty), cost: num(r.cost) })),
      extraOps: [poOp],
    });
  },
  markPurchasePaid(p, paid) {
    this.backend.write([{ type: 'merge', col: 'purchases', id: p.id, data: { paid, ...this._stamp() } }]);
  },

  /** mode: 'add' | 'remove' | 'count' (set to counted quantity) */
  adjustStock(item, { mode, qty, reason, note = '' }) {
    const current = num(item.stock);
    const change = mode === 'count' ? num(qty) - current : mode === 'remove' ? -Math.abs(num(qty)) : Math.abs(num(qty));
    if (!change) return;
    const ts = Date.now();
    const before = new Map(this.plan().map((p) => [p.item.id, p.status]));
    this.backend.write([
      { type: 'incr', col: 'items', id: item.id, field: 'stock', by: change },
      {
        type: 'set', col: 'adjustments', id: this.backend.newId('adjustments'),
        data: { ts, date: dayKey(ts), itemId: item.id, name: item.name, qty: change, cost: num(item.cost), reason, note, by: this.user?.email || '' },
      },
    ]);
    this._alertNewLows(before);
  },

  // ---------- Expenses ----------
  saveExpense(e) {
    const id = e.id || this.backend.newId('expenses');
    const ts = e.ts || Date.now();
    this.backend.write([{
      type: 'set', col: 'expenses', id,
      data: { ts, date: dayKey(ts), category: e.category || 'Other', amount: money(e.amount), note: e.note || '', by: this.user?.email || '', ...this._stamp() },
    }]);
  },
  deleteExpense(id) { this.backend.write([{ type: 'delete', col: 'expenses', id }]); },

  // ---------- Suppliers ----------
  saveSupplier(s) {
    const id = s.id || this.backend.newId('suppliers');
    this.backend.write([{
      type: 'merge', col: 'suppliers', id,
      data: { name: s.name.trim(), contact: s.contact || '', phone: s.phone || '', email: s.email || '', address: s.address || '', ...this._stamp(s.id ? {} : { createdAt: Date.now() }) },
    }]);
    return id;
  },
  deleteSupplier(id) { this.backend.write([{ type: 'delete', col: 'suppliers', id }]); },

  // ---------- Requests for quotation ----------
  generateRfqs({ includeAll = false, auto = false } = {}) {
    const drafts = draftRfqs(this.plan(), this.data.suppliers, { includeAll });
    const ts = Date.now();
    const month = monthKey(ts);
    const ops = [];
    const ids = [];
    drafts.forEach((d, i) => {
      // Automatic monthly requests use fixed ids so two devices can't create duplicates.
      const id = auto ? `auto-${month}-${d.supplierId || 'any'}` : this.backend.newId('rfqs');
      ids.push(id);
      ops.push({
        type: 'set', col: 'rfqs', id,
        data: {
          no: auto ? `RFQ-${month}-${String(i + 1).padStart(2, '0')}` : docNo('RFQ', ts),
          ts, date: dayKey(ts), month, auto, status: 'draft',
          supplierId: d.supplierId, supplierName: d.supplierName, lines: d.lines, estimate: d.estimate,
          note: this.settings.rfqNote || '', by: this.user?.email || '',
        },
      });
    });
    if (auto) ops.push({ type: 'merge', col: 'meta', id: 'settings', data: { lastAutoRfq: month } });
    if (ops.length) this.backend.write(ops);
    return ids;
  },
  saveRfq(r) {
    const { id, ...rest } = r;
    rest.estimate = money((rest.lines || []).reduce((t, l) => t + num(l.qty) * num(l.lastCost), 0));
    const sup = this.supplier(rest.supplierId);
    if (sup) rest.supplierName = sup.name;
    this.backend.write([{ type: 'merge', col: 'rfqs', id, data: { ...rest, ...this._stamp() } }]);
  },
  deleteRfq(id) { this.backend.write([{ type: 'delete', col: 'rfqs', id }]); },

  autoMonthlyRfq() {
    if (!this.can('orders') || this.settings.autoMonthlyRfq === false) return;
    const m = monthKey();
    if (this.settings.lastAutoRfq === m) return;
    // A brand-new shop starts its monthly requests next month.
    if (!this.settings.lastAutoRfq || !this.data.items.length) { this.saveSettings({ lastAutoRfq: m }); return; }
    const ids = this.generateRfqs({ auto: true });
    if (!ids.length) this.saveSettings({ lastAutoRfq: m });
    else this._notify(`${ids.length} monthly request${ids.length > 1 ? 's' : ''} for quotation ready`, 'New month: draft RFQs were created for items that need restocking.', '#/orders');
  },

  // ---------- Settings & access ----------
  saveSettings(patch) {
    this.backend.write([{ type: 'merge', col: 'meta', id: 'settings', data: { ...patch, ...this._stamp() } }]);
  },
  claimShop() {
    this.backend.write([{
      type: 'set', col: 'meta', id: 'access',
      data: { owner: this.user.uid, ownerEmail: this.user.email, members: {}, createdAt: Date.now() },
    }]);
  },
  setMember(email, role) {
    const members = { ...(this.access?.members || {}) };
    const key = email.trim().toLowerCase();
    if (role) members[key] = role; else delete members[key];
    this.backend.write([{ type: 'merge', col: 'meta', id: 'access', data: { members } }]);
  },

  // ---------- Alerts ----------
  _alertNewLows(before) {
    setTimeout(() => {
      for (const p of this.plan()) {
        if (p.status === 'ok' || p.status === 'onorder') continue;
        if (before.get(p.item.id) === p.status) continue;
        const msg = p.status === 'out' ? `${p.item.name} is OUT of stock` : `${p.item.name} is low: ${p.stock} ${p.item.unit || ''} left`;
        this._notify('Low stock', msg, '#/stock?filter=low');
      }
    }, 300);
  },
  dailyLowStockCheck() {
    const key = 'low-alert-' + dayKey();
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* ignore */ }
    const lows = this.lowStock();
    if (lows.length) this._notify('Stock alert', `${lows.length} item${lows.length > 1 ? 's need' : ' needs'} restocking`, '#/stock?filter=low');
  },
  _notify(title, body, link) {
    window.dispatchEvent(new CustomEvent('app-alert', { detail: { title, body, link } }));
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: body, data: { link } }));
      }
    } catch { /* ignore */ }
  },

  /** Copy everything entered in device-only trial mode into the synced shop. */
  importTrialData(local) {
    const ops = [];
    for (const [col, docs] of Object.entries(local)) {
      for (const [id, d] of Object.entries(docs || {})) {
        if (col === 'meta' && id !== 'settings') continue;
        ops.push({ type: col === 'meta' ? 'merge' : 'set', col, id, data: col === 'sales' ? { ...d, by: this.user?.email || d.by } : d });
      }
    }
    for (let i = 0; i < ops.length; i += 400) this.backend.write(ops.slice(i, i + 400));
    return ops.length;
  },

  // ---------- Backup ----------
  exportJson() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), settings: this.settings, ...this.data }, null, 1);
  },
};

export { monthKey, addMonths };
