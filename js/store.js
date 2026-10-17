// App state + every action that changes data.
import {
  DAY, monthLabel, averageCost, cartTotals, dayKey, docNo, draftRfqs, monthKey, monthRange, addMonths, num, money, reorderPlan, onOrderQty,
  stockValue, profitAndLoss, daySummary, parseDiscount, taxIncluded, refundTotals, shiftExpected, weekKey, monthClosing, unitPrice, inPacks, lineAmount, normUnit, normName, dayClose, usesFor,
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
  payoutCategories: ['Food', 'Transport', 'Airtime', 'Cleaning', 'Other'],
  taxRate: 0,
  taxName: 'VAT',
  receiptHeader: '',
  receiptFooter: 'Thank you!',
  useShifts: false,
  autoWeeklyPo: true,
  weeklyPoDay: 1,
  lastAutoPo: '',
  salaryList: [],
  maintenancePct: 10,
  lastClosed: '',
  invoiceDays: 14,
  quoteDays: 14,
  paymentDetails: '',
  quoteNote: 'Prices are valid for 14 days. Thank you for your enquiry.',
  poNote: 'Please supply the items below. Quote this order number on your delivery note and invoice.',
};

const HISTORY = ['sales', 'purchases', 'adjustments', 'expenses', 'payments', 'shifts', 'dayclose'];
const MASTER = ['items', 'suppliers', 'rfqs', 'pos', 'customers', 'closings', 'quotes'];
const CHANGES_DAYS = 60; // change history (with Undo) kept on screen for this many days
const STAMP_FIELDS = new Set(['updatedAt', 'updatedBy']);

export const store = {
  backend: null,
  user: null,
  access: null,
  role: null, // 'owner' | 'manager' | 'staff'
  // Multiple shops: management (platform/admins) creates shops; each shop has owners and members.
  admins: null,
  isAdmin: false,
  shops: [],
  shop: null,
  ready: false,
  pending: false,
  online: navigator.onLine,
  since: 0,
  data: { items: [], suppliers: [], rfqs: [], pos: [], customers: [], closings: [], quotes: [], sales: [], purchases: [], adjustments: [], expenses: [], payments: [], shifts: [], dayclose: [], changes: [] },
  settings: { ...DEFAULT_SETTINGS },
  _loaded: new Set(),
  _subs: new Set(),
  _alerted: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit() { for (const fn of this._subs) fn(); },

  item(id) { return this._itemMap?.get(id); },
  supplier(id) { return this.data.suppliers.find((s) => s.id === id); },
  customer(id) { return this.data.customers.find((c) => c.id === id); },
  isCreditPay(pay) { return /credit|deni|mkopo/i.test(pay || ''); },
  activeItems() { return this.data.items.filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name)); },
  can(what) {
    if (what === 'manage') return this.isAdmin; // all shops: management only
    const r = this.role;
    if (r === 'owner') return true;
    // 'clear' = delete received orders, clear losses, delete expenses: managers only when the owner allows it.
    if (r === 'manager') return what === 'clear' ? !!this.shop?.canClear?.[this.user?.email] : what !== 'users';
    if (what === 'clear') return false;
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
      ...(this.can('orders') ? [{ col: 'changes', since: Date.now() - CHANGES_DAYS * DAY }] : []),
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
          setTimeout(() => { this.autoMonthlyRfq(); this.autoWeeklyPo(); this.closingReminder(); }, 1500);
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

  // ---------- Change history and Undo ----------
  /** A record as it is right now (from what is loaded, or `known` for records fetched separately). */
  _current(col, id, known = {}) {
    if (known[`${col}/${id}`]) return known[`${col}/${id}`];
    if (col === 'meta' && id === 'settings') return this.settings;
    return (this.data[col] || []).find((d) => d.id === id) || null;
  },
  /**
   * The steps that reverse `ops`: created records are deleted, changed fields get their old values back,
   * deleted records come back, and stock is reversed by the difference (so later sales are kept).
   */
  _inverse(ops, known = {}) {
    const inv = [];
    const clean = (d) => { const { id, ...rest } = d; return structuredClone(rest); };
    const seenNew = new Set();
    for (const op of ops) {
      if (!op.col || op.col.startsWith('/') || op.col === 'changes') continue;
      const key = `${op.col}/${op.id}`;
      const before = seenNew.has(key) ? null : this._current(op.col, op.id, known);
      if (op.type === 'incr') {
        inv.push({ type: 'incr', col: op.col, id: op.id, field: op.field, by: -num(op.by) });
        const fields = Object.keys(op.data || {}).filter((f) => !STAMP_FIELDS.has(f));
        if (before && fields.length) inv.push({ type: 'update', col: op.col, id: op.id, data: Object.fromEntries(fields.map((f) => [f, before[f] ?? null])), after: Object.fromEntries(fields.map((f) => [f, op.data[f] ?? null])) });
      } else if (op.type === 'set') {
        if (before) inv.push({ type: 'set', col: op.col, id: op.id, data: clean(before) });
        else { inv.push({ type: 'delete', col: op.col, id: op.id, created: true }); seenNew.add(key); }
      } else if (op.type === 'merge' || op.type === 'update') {
        if (!before) { if (!seenNew.has(key)) { inv.push({ type: 'delete', col: op.col, id: op.id, created: true }); seenNew.add(key); } continue; }
        const fields = Object.keys(op.data || {}).filter((f) => !STAMP_FIELDS.has(f));
        const data = {}, after = {};
        for (const f of fields) {
          if (f === 'stock' && op.col === 'items') {
            // stock set to a number: undo by the difference, not by overwriting
            const diff = num(before.stock) - num(op.data.stock);
            if (diff) inv.push({ type: 'incr', col: op.col, id: op.id, field: 'stock', by: diff });
            continue;
          }
          data[f] = before[f] === undefined ? null : structuredClone(before[f]);
          after[f] = op.data[f] === undefined ? null : structuredClone(op.data[f]);
        }
        if (Object.keys(data).length) inv.push({ type: 'update', col: op.col, id: op.id, data, after });
      } else if (op.type === 'delete') {
        if (before) inv.push({ type: 'set', col: op.col, id: op.id, data: clean(before) });
      }
    }
    return inv.reverse();
  },
  /**
   * Write `ops` and record them in the change history with the steps to undo them.
   * Big changes are written in parts; the history record goes with the last part.
   */
  _commit(label, ops, { known = {}, detail = '' } = {}) {
    if (!ops.length) return Promise.resolve();
    const undo = this._inverse(ops, known);
    const id = this.backend.newId('changes');
    const rec = { ts: Date.now(), label, detail, count: ops.length, by: this.user?.email || '', byName: this.user?.name || '', undo, undone: false };
    const size = JSON.stringify(rec).length;
    if (size > 900_000) { rec.undo = []; rec.tooBig = true; } // too large to keep the undo steps
    const all = [...ops, { type: 'set', col: 'changes', id, data: rec }];
    this.lastChange = { id, label, at: Date.now() };
    // Let the screen offer "Undo" on the message that follows this action.
    if (typeof window !== 'undefined') setTimeout(() => window.dispatchEvent(new CustomEvent('shop:change', { detail: { id, label, at: rec.ts } })), 60);
    let p = Promise.resolve();
    for (let i = 0; i < all.length; i += 450) p = this.backend.write(all.slice(i, i + 450));
    return p;
  },
  /** Fields changed again since this change (shown as a warning before undoing). */
  changedSince(rec) {
    const out = [];
    for (const op of rec.undo || []) {
      if (op.type !== 'update' || !op.after) continue;
      const cur = this._current(op.col, op.id);
      if (!cur) { out.push({ col: op.col, id: op.id, name: '(removed)', field: '' }); continue; }
      for (const [f, v] of Object.entries(op.after)) {
        if (JSON.stringify(cur[f] ?? null) !== JSON.stringify(v ?? null)) out.push({ col: op.col, id: op.id, name: cur.name || cur.no || op.id, field: f });
      }
    }
    return out;
  },
  /** Undo a recorded change. Only owners, and managers the owner allows. */
  undoChange(rec) {
    if (!this.can('clear')) throw new Error('Only the owner, or a manager the owner has allowed, can undo changes');
    if (rec.undone) throw new Error('This change was already undone');
    if (rec.tooBig || !(rec.undo || []).length) throw new Error('This change is too large to undo automatically');
    const ops = rec.undo.map(({ after, created, ...op }) => {
      // A record that no longer exists cannot be "updated": put the old values back as a merge instead.
      if (op.type === 'update' && !this._current(op.col, op.id)) return { ...op, type: 'merge' };
      if (op.type === 'incr' && op.col === 'items' && !this._current('items', op.id)) return null;
      return op;
    }).filter(Boolean);
    ops.push({ type: 'merge', col: 'changes', id: rec.id, data: { undone: true, undoneAt: Date.now(), undoneBy: this.user?.email || '' } });
    let p = Promise.resolve();
    for (let i = 0; i < ops.length; i += 450) p = this.backend.write(ops.slice(i, i + 450));
    return p;
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
      buyUnit: String(input.buyUnit || '').trim(),
      supplierId: input.supplierId || '',
      service: !!input.service,
      variablePrice: !!input.variablePrice,
      uses: (Array.isArray(input.uses) ? input.uses : (() => { try { return JSON.parse(input.uses || '[]'); } catch { return []; } })())
        .filter((u) => u && u.itemId && num(u.per) > 0).map((u) => ({ itemId: u.itemId, per: num(u.per) })),
      active: true,
      ...this._stamp(),
    };
    if (isNew) {
      data.stock = num(input.stock);
      data.lastCost = num(input.cost);
      data.createdAt = Date.now();
      this._commit(`Added item ${data.name}`, [{ type: 'set', col: 'items', id, data }]);
    } else {
      this._commit(`Edited item ${data.name}`, [{ type: 'merge', col: 'items', id, data }]);
    }
    return id;
  },
  /** changes: [{ id, minStock, maxStock }] — saved together. */
  setLevels(changes) {
    const ops = changes.map((c) => ({ type: 'merge', col: 'items', id: c.id, data: { minStock: num(c.minStock), maxStock: num(c.maxStock), ...this._stamp() } }));
    this._commit(`Changed min / max for ${ops.length} item${ops.length === 1 ? '' : 's'}`, ops);
    return ops.length;
  },
  /** Rename item categories: pairs of [old, new] (same new name merges them). */
  renameCategories(pairs) {
    const map = new Map(pairs);
    const ops = this.data.items.filter((i) => map.has(i.category)).map((i) => ({ type: 'merge', col: 'items', id: i.id, data: { category: map.get(i.category), ...this._stamp() } }));
    this._commit(`Renamed ${pairs.length} categor${pairs.length === 1 ? 'y' : 'ies'}`, ops);
    return ops.length;
  },
  archiveItem(id) {
    this._commit(`Removed item ${this.item(id)?.name || ''}`, [{ type: 'merge', col: 'items', id, data: { active: false, ...this._stamp() } }]);
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
      const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
      const pack = has(r.packSize) && num(r.packSize) > 1
        ? { packSize: num(r.packSize), buyUnit: String(r.buyUnit || '').trim() || 'pack' }
        : has(r.packSize) || (has(r.buyUnit) && /^(single|pcs|piece|each|-)$/i.test(String(r.buyUnit).trim())) ? { packSize: 1, buyUnit: '' } : null;
      if (existing) {
        // Update: only what the file fills in. Empty cells keep what is saved (prices, levels, stock…).
        const d = { name: r.name, active: true, ...this._stamp() };
        for (const k of ['sku', 'barcode', 'category', 'unit']) if (has(r[k])) d[k] = String(r[k]).trim();
        if (has(r.price)) { d.price = money(r.price); if (r.variablePrice === undefined) d.variablePrice = false; }
        if (has(r.cost)) { d.cost = num(r.cost); d.lastCost = num(r.cost); }
        if (has(r.minStock)) d.minStock = num(r.minStock);
        if (has(r.maxStock)) d.maxStock = num(r.maxStock);
        if (r.service !== undefined) d.service = !!r.service;
        if (r.variablePrice !== undefined) d.variablePrice = !!r.variablePrice;
        if (pack) Object.assign(d, pack);
        if (supplierId) d.supplierId = supplierId;
        if (has(r.stock)) d.stock = (d.service ?? existing.service) ? 0 : num(r.stock);
        ops.push({ type: 'merge', col: 'items', id: existing.id, data: d });
        updated++;
      } else {
        const service = !!r.service;
        ops.push({
          type: 'set', col: 'items', id: this.backend.newId('items'),
          data: {
            name: r.name, sku: String(r.sku || '').trim(), barcode: String(r.barcode || '').trim(), category: String(r.category || '').trim(),
            unit: String(r.unit || '').trim() || 'pcs', price: money(r.price), cost: num(r.cost), lastCost: num(r.cost),
            minStock: num(r.minStock), maxStock: num(r.maxStock), packSize: 1, buyUnit: '', ...(pack || {}), supplierId,
            service, variablePrice: r.variablePrice ?? !!r.priceBlank, active: true,
            stock: service ? 0 : num(r.stock), createdAt: Date.now(), ...this._stamp(),
          },
        });
        added++;
      }
    }
    this._commit(`Imported items: ${added} new, ${updated} updated`, ops);
    return { added, updated };
  },

  // ---------- Sales ----------
  recordSale({ lines, discount = 0, pay = 'Cash', customer = '', customerId = '', note = '' }) {
    const ts = Date.now();
    const full = lines
      .filter((l) => num(l.qty) > 0)
      .map((l) => {
        const it = this.item(l.itemId) || {};
        // Paper for a photocopy, a pouch for lamination…: their cost is part of this sale's cost.
        const u = usesFor(it, l.qty, (id) => this.item(id));
        return {
          itemId: l.itemId, name: it.name || l.name, qty: num(l.qty), price: money(l.price), cost: unitPrice(num(it.cost) + u.costPerUnit), unit: it.unit || 'pcs',
          ...(u.used.length ? { used: u.used.map(({ itemId, name, per }) => ({ itemId, name, per })) } : {}),
        };
      });
    if (!full.length) throw new Error('The cart is empty');
    const sub = full.reduce((t, l) => t + l.qty * l.price, 0);
    // Discount may be typed as an amount ("500") or a percentage ("10%").
    const totals = cartTotals(full, parseDiscount(discount, sub));
    const cust = customerId ? this.customer(customerId) : null;
    const credit = this.isCreditPay(pay);
    if (credit && !cust) throw new Error('Choose the customer for a credit sale');
    const id = this.backend.newId('sales');
    const sale = {
      no: docNo('S', ts), ts, date: dayKey(ts), lines: full, ...totals, pay,
      tax: taxIncluded(totals.total, this.settings.taxRate), taxRate: num(this.settings.taxRate),
      customerId: cust?.id || '', customer: cust?.name || customer || '', credit, note,
      voided: false, by: this.user?.email || '', byName: this.user?.name || '',
    };
    const before = new Map(this.plan().map((p) => [p.item.id, p.status]));
    const ops = [{ type: 'set', col: 'sales', id, data: sale }];
    const usedTotal = new Map();
    for (const l of full) {
      const it = this.item(l.itemId);
      if (it && !it.service) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: -l.qty });
      for (const u of l.used || []) usedTotal.set(u.itemId, num(usedTotal.get(u.itemId)) + l.qty / u.per);
    }
    for (const [itemId, q] of usedTotal) if (this.item(itemId)) ops.push({ type: 'incr', col: 'items', id: itemId, field: 'stock', by: -Math.round(q * 10000) / 10000 });
    if (cust) {
      ops.push({ type: 'incr', col: 'customers', id: cust.id, field: 'spent', by: totals.total, data: { lastVisit: ts } });
      if (credit) ops.push({ type: 'incr', col: 'customers', id: cust.id, field: 'balance', by: totals.total });
    }
    this.backend.write(ops);
    this._alertNewLows(before);
    return { ...sale, id, balanceAfter: cust && credit ? num(cust.balance) + totals.total : undefined };
  },
  voidSale(sale, reason = '') {
    if (sale.refunded) throw new Error('Part of this sale was refunded — refund the rest instead of cancelling it');
    const ops = [{ type: 'merge', col: 'sales', id: sale.id, data: { voided: true, voidReason: reason, voidedAt: Date.now(), voidedBy: this.user?.email || '' } }];
    for (const l of sale.lines) {
      const it = this.item(l.itemId);
      if (it && !it.service) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: num(l.qty) });
      for (const u of l.used || []) if (this.item(u.itemId)) ops.push({ type: 'incr', col: 'items', id: u.itemId, field: 'stock', by: Math.round((num(l.qty) / num(u.per)) * 10000) / 10000 });
    }
    if (sale.customerId && this.customer(sale.customerId)) {
      ops.push({ type: 'incr', col: 'customers', id: sale.customerId, field: 'spent', by: -num(sale.total) });
      if (sale.credit) ops.push({ type: 'incr', col: 'customers', id: sale.customerId, field: 'balance', by: -num(sale.total) });
    }
    this.backend.write(ops);
  },
  /** Refund some or all items of a sale. qtys: { itemId: quantity to return }. */
  refundSale(sale, qtys, reason = '') {
    const rf = refundTotals(sale, qtys);
    if (!rf.lines.length) throw new Error('Choose what is being returned');
    const ts = Date.now();
    const id = this.backend.newId('sales');
    const refundedQty = { ...(sale.refundedQty || {}) };
    for (const l of rf.lines) refundedQty[l.itemId] = num(refundedQty[l.itemId]) + Math.abs(l.qty);
    const doc = {
      type: 'refund', refundOf: sale.id, refundOfNo: sale.no, no: docNo('R', ts), ts, date: dayKey(ts),
      lines: rf.lines, subtotal: rf.subtotal, discount: rf.discount, total: rf.total, cogs: rf.cogs,
      tax: -taxIncluded(-rf.total, sale.taxRate ?? this.settings.taxRate), pay: sale.pay,
      customerId: sale.customerId || '', customer: sale.customer || '', credit: !!sale.credit, note: reason,
      voided: false, by: this.user?.email || '', byName: this.user?.name || '',
    };
    const ops = [
      { type: 'set', col: 'sales', id, data: doc },
      { type: 'merge', col: 'sales', id: sale.id, data: { refundedQty, refunded: num(sale.refunded) - rf.total, ...this._stamp() } },
    ];
    for (const l of rf.lines) {
      const it = this.item(l.itemId);
      if (it && !it.service) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: Math.abs(l.qty) });
      for (const u of l.used || []) if (this.item(u.itemId)) ops.push({ type: 'incr', col: 'items', id: u.itemId, field: 'stock', by: Math.round((Math.abs(l.qty) / num(u.per)) * 10000) / 10000 });
    }
    if (sale.customerId && this.customer(sale.customerId)) {
      ops.push({ type: 'incr', col: 'customers', id: sale.customerId, field: 'spent', by: rf.total });
      if (sale.credit) ops.push({ type: 'incr', col: 'customers', id: sale.customerId, field: 'balance', by: rf.total });
    }
    this.backend.write(ops);
    return { ...doc, id };
  },

  // ---------- Customers ----------
  saveCustomer(c) {
    const id = c.id || this.backend.newId('customers');
    const data = { name: String(c.name || '').trim(), phone: String(c.phone || '').trim(), email: String(c.email || '').trim(), note: String(c.note || '').trim(), creditLimit: money(c.creditLimit), ...this._stamp() };
    if (!data.name) throw new Error('Enter the customer’s name');
    if (c.id) this.backend.write([{ type: 'merge', col: 'customers', id, data }]);
    else this.backend.write([{ type: 'set', col: 'customers', id, data: { ...data, balance: 0, spent: 0, createdAt: Date.now() } }]);
    return id;
  },
  deleteCustomer(c) {
    if (Math.round(num(c.balance))) throw new Error(`${c.name} still owes ${money(c.balance).toLocaleString('en-US')} — record the payment first`);
    this.backend.write([{ type: 'delete', col: 'customers', id: c.id }]);
  },
  /** A customer pays back what they owe. */
  receivePayment(c, { amount, method = 'Cash', note = '', ts = Date.now() }) {
    const amt = money(amount);
    if (!(amt > 0)) throw new Error('Enter the amount paid');
    const id = this.backend.newId('payments');
    this.backend.write([
      { type: 'set', col: 'payments', id, data: { no: docNo('PAY', ts), ts, date: dayKey(ts), customerId: c.id, customer: c.name, amount: amt, method, note, by: this.user?.email || '', byName: this.user?.name || '' } },
      { type: 'incr', col: 'customers', id: c.id, field: 'balance', by: -amt },
    ]);
    return id;
  },
  // ---------- Quotations for customers ----------
  /** Save a quotation (price offer — no stock moves). lines: [{ itemId, qty, price }] */
  saveQuote(q) {
    const ts = q.ts || Date.now();
    const cust = this.customer(q.customerId);
    if (!cust) throw new Error('Choose the customer');
    const lines = (q.lines || []).filter((l) => num(l.qty) > 0).map((l) => {
      const it = this.item(l.itemId) || {};
      return { itemId: l.itemId, name: it.name || l.name, unit: it.unit || 'pcs', qty: num(l.qty), price: money(l.price) };
    });
    if (!lines.length) throw new Error('Add at least one item');
    const sub = lines.reduce((t, l) => t + l.qty * l.price, 0);
    const discount = parseDiscount(q.discount, sub);
    const total = money(sub - discount);
    const id = q.id || this.backend.newId('quotes');
    const data = {
      no: q.no || docNo('Q', ts), ts, date: dayKey(ts), customerId: cust.id, customer: cust.name, lines,
      subtotal: money(sub), discount, total, tax: taxIncluded(total, this.settings.taxRate), taxRate: num(this.settings.taxRate),
      validUntil: ts + num(q.validDays || this.settings.quoteDays || 14) * DAY, note: q.note ?? this.settings.quoteNote ?? '',
      status: q.status || 'open', saleId: q.saleId || '', by: q.by || this.user?.email || '', ...this._stamp(),
    };
    this.backend.write([{ type: 'set', col: 'quotes', id, data }]);
    return id;
  },
  deleteQuote(id) { this.backend.write([{ type: 'delete', col: 'quotes', id }]); },
  /** The customer accepted: goods go out on their account (stock down, they owe the total). */
  invoiceQuote(q) {
    const credit = (this.settings.payMethods || []).find((m) => this.isCreditPay(m)) || 'Credit';
    const sale = this.recordSale({ lines: q.lines, discount: q.discount, pay: credit, customerId: q.customerId, note: `From quotation ${q.no}` });
    this.backend.write([{ type: 'merge', col: 'quotes', id: q.id, data: { status: 'invoiced', saleId: sale.id, ...this._stamp() } }]);
    return sale;
  },
  owedByCustomers() { return money(this.data.customers.reduce((t, c) => t + Math.max(0, num(c.balance)), 0)); },

  // ---------- Stock in / adjustments ----------
  receivePurchase({ supplierId = '', ref = '', ts = Date.now(), lines, paid = true, note = '', rfqId = '', poId = '', poNo = '', extraOps = [] }) {
    const merged = new Map();
    for (const l of lines) {
      if (!l.itemId || num(l.qty) <= 0) continue;
      const it0 = this.item(l.itemId) || {};
      const m = merged.get(l.itemId) || { qty: 0, value: 0, packSize: num(l.packSize ?? it0.packSize) || 1, buyUnit: String(l.buyUnit ?? it0.buyUnit ?? '') };
      if (m.inPacks === undefined && l.inPacks !== undefined) m.inPacks = !!l.inPacks;
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
      outLines.push({ itemId, name: it.name, unit: it.unit || 'pcs', qty: m.qty, cost: unitPrice(unitCost), packSize: m.packSize, buyUnit: m.buyUnit, inPacks: m.inPacks ?? inPacks({ qty: m.qty, packSize: m.packSize, buyUnit: m.buyUnit }) });
    }
    const id = this.backend.newId('purchases');
    const total = money(outLines.reduce((t, l) => t + l.qty * l.cost, 0));
    const sup = this.supplier(supplierId);
    ops.push({
      type: 'set', col: 'purchases', id,
      data: { no: docNo('P', ts), ts, date: dayKey(ts), supplierId, supplierName: sup?.name || '', ref, lines: outLines, total, paid, note, rfqId, poId, poNo, by: this.user?.email || '' },
    });
    if (rfqId) ops.push({ type: 'merge', col: 'rfqs', id: rfqId, data: { status: 'closed', purchaseId: id, ...this._stamp() } });
    this._commit(poNo ? `Received delivery for ${poNo}` : `Received stock ${docNo('P', ts)}`, [...ops, ...extraOps], { detail: `${outLines.length} item${outLines.length === 1 ? '' : 's'} · TSh ${total.toLocaleString('en-US')}` });
    return id;
  },

  // ---------- Purchase orders ----------
  _poLines(lines) {
    const merged = new Map();
    for (const l of lines) {
      if (!l.itemId) continue;
      const it = this.item(l.itemId) || {};
      if (l.ordUnit) {
        // A line in the supplier's unit (e.g. "1 carton" from an imported order). Pieces per unit may be
        // unknown until the goods arrive (perOk false); qty/cost in pieces then use 1 as a placeholder.
        if (num(l.ordQty) <= 0) continue;
        const key = `${l.itemId}|${l.ordUnit}`;
        const per = num(l.packSize) > 0 ? num(l.packSize) : 1;
        const m = merged.get(key) || {
          itemId: l.itemId, name: it.name || l.name, sku: it.sku || '', unit: it.unit || l.unit || 'pcs',
          ordUnit: l.ordUnit, ordQty: 0, ordPrice: unitPrice(l.ordPrice), perOk: !!l.perOk, packSize: per, buyUnit: l.ordUnit,
          srcName: l.srcName || '', received: num(l.received), receivedUnits: num(l.receivedUnits), inPacks: l.ordUnit !== 'pcs',
        };
        m.ordQty += num(l.ordQty);
        if (num(l.ordPrice)) m.ordPrice = unitPrice(l.ordPrice);
        m.qty = Math.round(m.ordQty * per * 1000) / 1000;
        m.cost = unitPrice(m.ordPrice / per);
        merged.set(key, m);
        continue;
      }
      if (num(l.qty) <= 0) continue;
      // Buying unit is copied onto the line, so the order still reads "2 cartons" if the item changes later.
      const m = merged.get(l.itemId) || {
        itemId: l.itemId, name: it.name || l.name, sku: it.sku || '', unit: it.unit || l.unit || 'pcs', qty: 0, cost: unitPrice(l.cost), received: num(l.received),
        packSize: num(l.packSize ?? it.packSize) || 1, buyUnit: String(l.buyUnit ?? it.buyUnit ?? ''), _inPacks: l.inPacks,
      };
      m.qty += num(l.qty);
      if (num(l.cost)) m.cost = unitPrice(l.cost);
      merged.set(l.itemId, m);
    }
    return [...merged.values()].map(({ _inPacks, ...m }) => (m.ordUnit ? m : { ...m, inPacks: inPacks({ ...m, inPacks: _inPacks }) }));
  },
  /**
   * Turn a supplier's order file into a draft purchase order.
   * lines: [{ name, qty, unit, per, unitPrice, itemId | null, create, skip }]; new items are created first.
   * The supplier's names are remembered so the next file matches them straight away.
   */
  importOrder({ supplierId = '', lines, note = '' }) {
    const ops = [];
    const aliases = { ...(this.settings.orderAliases || {}) };
    const supKey = supplierId || 'any';
    const mine = { ...(aliases[supKey] || {}) };
    const poLines = [];
    for (const l of lines) {
      if (l.skip || l.unavailable) continue;
      let itemId = l.itemId;
      const unit = l.unit || 'unit';
      if (!itemId && l.create) {
        itemId = this.backend.newId('items');
        const per = num(l.per) > 1 ? num(l.per) : 1;
        ops.push({
          type: 'set', col: 'items', id: itemId,
          data: {
            name: l.name.trim(), sku: '', barcode: '', category: '', unit: 'pcs', price: 0, variablePrice: true,
            cost: unitPrice(l.unitPrice / per), lastCost: unitPrice(l.unitPrice / per), minStock: 0, maxStock: 0,
            packSize: per, buyUnit: per > 1 ? unit : '', supplierId, service: false, active: true, stock: 0,
            createdAt: Date.now(), ...this._stamp(),
          },
        });
      }
      if (!itemId) continue;
      const it = this.item(itemId) || {};
      let per = num(l.per) || 0;
      if (!per && normUnit(it.buyUnit) === normUnit(unit) && num(it.packSize) > 1) per = num(it.packSize);
      poLines.push({
        itemId, name: it.name || l.name, ordQty: num(l.qty), ordUnit: unit, ordPrice: l.unitPrice,
        packSize: per || 0, perOk: per > 0, srcName: l.name,
      });
      mine[normName(l.name)] = itemId;
    }
    if (!poLines.length) throw new Error('No lines to order — match or create at least one item');
    aliases[supKey] = mine;
    ops.push({ type: 'merge', col: 'meta', id: 'settings', data: { orderAliases: aliases, ...this._stamp() } });
    const created = ops.filter((o) => o.col === 'items').length;
    const { id, data } = this.buildPo({ supplierId, lines: poLines, note: note || this.settings.poNote || '' });
    data.imported = true;
    ops.push({ type: 'set', col: 'pos', id, data });
    this._commit(`Imported order ${data.no}: ${poLines.length} line${poLines.length === 1 ? '' : 's'}${created ? `, ${created} new item${created === 1 ? '' : 's'}` : ''}`, ops);
    return id;
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
      total: money(lines.reduce((t, l) => t + lineAmount(l), 0)),
      note: po.note ?? this.settings.poNote ?? '', rfqId: po.rfqId || '', auto: !!po.auto,
      by: po.by || this.user?.email || '', ...this._stamp(),
    };
    if (po.orderedAt) data.orderedAt = po.orderedAt;
    if (po.layout) data.layout = po.layout; // columns chosen for this order's document
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
  /** Delivery records saved against a purchase order (looks further back online if the order is old). */
  async purchasesOfPo(po) {
    const found = new Map(this.data.purchases.filter((p) => p.poId === po.id).map((p) => [p.id, p]));
    if (num(po.ts) < this.since) {
      try {
        for (const p of await this.backend.fetchRange('purchases', num(po.ts) - DAY, Date.now() + DAY)) if (p.poId === po.id) found.set(p.id, p);
      } catch { /* offline: use what is on this device */ }
    }
    return [...found.values()];
  },
  /** What deleting a received order will undo: pieces back out of stock (never below 0) and its deliveries. */
  async poReversal(po) {
    const lines = po.lines.filter((l) => num(l.received) > 0).map((l) => {
      const it = this.item(l.itemId);
      const take = Math.min(num(l.received), Math.max(0, num(it?.stock)));
      return { itemId: l.itemId, name: l.name, unit: l.unit || 'pcs', received: num(l.received), take, sold: num(l.received) - take, gone: !it };
    });
    const purchases = lines.length ? await this.purchasesOfPo(po) : [];
    return { lines, purchases, total: money(purchases.reduce((t, p) => t + num(p.total), 0)) };
  },
  /**
   * Delete a purchase order. Not received yet: it simply goes (and stops showing as on order).
   * Partly or fully received: owner, or a manager allowed by the owner, only — the pieces come
   * back out of stock and its delivery records are removed. Item cost prices are left as they are.
   */
  async deletePo(poOrId) {
    const po = typeof poOrId === 'string' ? this.data.pos.find((x) => x.id === poOrId) : poOrId;
    if (!po) return;
    const ops = [];
    const known = {};
    const received = po.lines.some((l) => num(l.received) > 0);
    if (received) {
      if (!this.can('clear')) throw new Error('Received orders can only be deleted by the owner, or a manager the owner has allowed');
      const rev = await this.poReversal(po);
      for (const l of rev.lines) if (l.take > 0 && !l.gone) ops.push({ type: 'incr', col: 'items', id: l.itemId, field: 'stock', by: -l.take });
      for (const p of rev.purchases) { ops.push({ type: 'delete', col: 'purchases', id: p.id }); known[`purchases/${p.id}`] = p; }
    } else if (!this.can('orders')) throw new Error('Only owners and managers can delete orders');
    // A request for quotation that became this order goes back to "sent".
    if (po.rfqId && this.data.rfqs.some((r) => r.id === po.rfqId)) ops.push({ type: 'merge', col: 'rfqs', id: po.rfqId, data: { status: 'sent', poId: '', ...this._stamp() } });
    ops.push({ type: 'delete', col: 'pos', id: po.id });
    return this._commit(`Deleted order ${po.no}${received ? ' (received goods taken out of stock)' : ''}`, ops, { known });
  },
  /**
   * Receive (part of) a purchase order. receipts: [{ itemId, qty, cost }].
   * Stock and average cost update at once; anything not delivered stays on order
   * unless closeShort is set.
   */
  receivePo(po, receipts, { ts = Date.now(), ref = '', paid = false, closeShort = false, note = '' } = {}) {
    // receipts: [{ idx (line number), qty (pieces), cost (per piece), units?, per? (pieces in one unit), remember? }]
    // Older callers may pass { itemId, qty, cost } — matched to the first line of that item.
    const got = new Map();
    for (const r of receipts) {
      if (!(num(r.qty) > 0)) continue;
      const idx = r.idx ?? po.lines.findIndex((l) => l.itemId === r.itemId);
      if (idx >= 0) got.set(idx, r);
    }
    if (!got.size && !closeShort) throw new Error('Enter how many of each item arrived');
    const remember = [];
    const lines = po.lines.map((l, i) => {
      const r = got.get(i);
      if (!r) return l;
      const out = { ...l, received: Math.round((num(l.received) + num(r.qty)) * 1000) / 1000, cost: unitPrice(r.cost || l.cost) };
      if (l.ordUnit) {
        const per = num(r.per) || num(l.packSize) || 1;
        out.receivedUnits = Math.round((num(l.receivedUnits) + num(r.units ?? num(r.qty) / per)) * 1000) / 1000;
        out.packSize = per; out.perOk = true;
        out.qty = Math.round(num(l.ordQty) * per * 1000) / 1000;
        out.ordPrice = unitPrice(out.cost * per);
      }
      if (r.remember && num(r.per) > 1 && this.can('editItems')) remember.push({ itemId: l.itemId, buyUnit: l.ordUnit || l.buyUnit || 'pack', packSize: num(r.per) });
      return out;
    });
    const complete = lines.every((l) => num(l.received) >= num(l.qty) - 1e-6);
    const status = complete || closeShort ? 'received' : 'partial';
    const poOp = {
      type: 'merge', col: 'pos', id: po.id,
      data: { lines, status, closedShort: !complete && closeShort, ...(status === 'received' ? { receivedAt: Date.now() } : {}), ...this._stamp() },
    };
    const itemOps = remember.map((x) => ({ type: 'merge', col: 'items', id: x.itemId, data: { buyUnit: x.buyUnit, packSize: x.packSize, ...this._stamp() } }));
    if (!got.size) { this._commit(`Closed ${po.no} short`, [poOp]); return null; }
    return this.receivePurchase({
      supplierId: po.supplierId, ref, ts, paid, note, poId: po.id, poNo: po.no,
      lines: [...got.entries()].map(([i, r]) => {
        const l = po.lines[i];
        const per = num(r.per) || num(l.packSize) || 1;
        return { itemId: l.itemId, qty: num(r.qty), cost: num(r.cost), packSize: per, buyUnit: l.ordUnit || l.buyUnit, inPacks: r.inPacks ?? (per > 1) };
      }),
      extraOps: [poOp, ...itemOps],
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
    this._commit(`Stock adjusted: ${item.name} ${change > 0 ? '+' : ''}${change} (${reason})`, [
      { type: 'incr', col: 'items', id: item.id, field: 'stock', by: change },
      {
        type: 'set', col: 'adjustments', id: this.backend.newId('adjustments'),
        data: { ts, date: dayKey(ts), itemId: item.id, name: item.name, qty: change, cost: num(item.cost), reason, note, by: this.user?.email || '' },
      },
    ]);
    this._alertNewLows(before);
  },

  /** Stock count of many items: counts = [{ itemId, counted }]. Differences are saved as adjustments. */
  countStock(counts, note = '') {
    const ts = Date.now();
    const ops = [];
    let changed = 0, value = 0;
    for (const { itemId, counted } of counts) {
      const it = this.item(itemId);
      if (!it || counted === '' || counted === null || counted === undefined) continue;
      const diff = num(counted) - num(it.stock);
      if (!diff) continue;
      changed++;
      value += diff * num(it.cost);
      ops.push({ type: 'incr', col: 'items', id: itemId, field: 'stock', by: diff });
      ops.push({ type: 'set', col: 'adjustments', id: this.backend.newId('adjustments'), data: { ts, date: dayKey(ts), itemId, name: it.name, qty: diff, cost: num(it.cost), reason: 'Stock count', note, by: this.user?.email || '' } });
    }
    this._commit(`Stock count: ${changed} item${changed === 1 ? '' : 's'} changed`, ops);
    return { changed, value: money(value) };
  },

  // ---------- Shifts (cash drawer) ----------
  myOpenShift() { return this.data.shifts.find((s) => !s.closedAt && s.by === this.user?.email); },
  shiftFigures(shift) { return shiftExpected(shift, this.data.sales, this.data.payments, { cashName: (this.settings.payMethods || ['Cash'])[0] || 'Cash' }); },
  openShift(openingCash) {
    if (this.myOpenShift()) throw new Error('You already have an open shift');
    const ts = Date.now();
    const id = this.backend.newId('shifts');
    this.backend.write([{ type: 'set', col: 'shifts', id, data: { no: docNo('SH', ts), ts, date: dayKey(ts), openingCash: money(openingCash), moves: [], by: this.user?.email || '', byName: this.user?.name || '' } }]);
    return id;
  },
  shiftMove(shift, { type, amount, note = '' }) {
    if (!(money(amount) > 0)) throw new Error('Enter the amount');
    const moves = [...(shift.moves || []), { ts: Date.now(), type, amount: money(amount), note }];
    this.backend.write([{ type: 'merge', col: 'shifts', id: shift.id, data: { moves } }]);
  },
  closeShift(shift, countedCash, note = '') {
    const f = this.shiftFigures(shift);
    const counted = money(countedCash);
    this.backend.write([{ type: 'merge', col: 'shifts', id: shift.id, data: { closedAt: Date.now(), countedCash: counted, expectedCash: f.expected, difference: counted - f.expected, figures: f, closeNote: note } }]);
    return { ...f, counted, difference: counted - f.expected };
  },

  // ---------- Expenses ----------
  saveExpense(e) {
    const id = e.id || this.backend.newId('expenses');
    const ts = e.ts || Date.now();
    this.backend.write([{
      type: 'set', col: 'expenses', id,
      data: { ts, date: dayKey(ts), category: e.category || 'Other', amount: money(e.amount), note: e.note || '', paidFrom: e.paidFrom || '', by: this.user?.email || '', byName: this.user?.name || '', ...this._stamp() },
    }]);
  },
  /**
   * Money paid out during the day — staff food, transport, airtime… — from the cash drawer or a
   * mobile-money line. Anyone working in the shop can record it; it counts as an expense and is
   * taken off what should be in the drawer when the day is closed.
   */
  payout({ amount, category = 'Other', note = '', paidFrom = 'Cash', ts = Date.now() }) {
    const amt = money(amount);
    if (!(amt > 0)) throw new Error('Enter the amount paid out');
    const id = this.backend.newId('expenses');
    this._commit(`Paid out ${category} TSh ${amt.toLocaleString('en-US')} from ${paidFrom}`, [{
      type: 'set', col: 'expenses', id,
      data: { ts, date: dayKey(ts), category, amount: amt, note, paidFrom, payout: true, by: this.user?.email || '', byName: this.user?.name || '', ...this._stamp() },
    }]);
    return id;
  },

  // ---------- Closing the day ----------
  dayCloseFor(day) { return this.data.dayclose.find((d) => d.id === day) || null; },
  /** Cash left in the drawer at the last close before `day` — tomorrow's starting cash. */
  openingCashFor(day) {
    const prev = this.data.dayclose.filter((d) => d.id < day).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    return prev ? num(prev.leftInDrawer) : num(this.settings.drawerFloat);
  },
  dayFigures(day = dayKey(), openingCash = this.openingCashFor(day)) {
    return dayClose({
      day, sales: this.data.sales, payments: this.data.payments, expenses: this.data.expenses,
      methods: this.settings.payMethods || ['Cash'], openingCash,
      creditName: (this.settings.payMethods || []).find((m) => this.isCreditPay(m)) || 'Credit',
    });
  },
  /** Save the day's count: counted = { Cash: 52000, 'M-Pesa': 18000, … }. Closing again replaces it. */
  closeDay(day, { counted = {}, openingCash, takenOut = 0, note = '' }) {
    const f = this.dayFigures(day, openingCash);
    const rows = f.rows.map((r) => {
      const c = counted[r.method];
      const has = c !== undefined && c !== '' && c !== null;
      return { ...r, counted: has ? money(c) : null, difference: has ? money(money(c) - r.expected) : null };
    });
    const totalDiff = money(rows.reduce((t, r) => t + (r.difference || 0), 0));
    const cash = rows.find((r) => r.method === f.cashName);
    const cashCounted = cash?.counted ?? cash?.expected ?? 0;
    const rec = {
      day, ts: new Date(`${day}T12:00:00`).getTime(), closedAt: Date.now(), openingCash: money(openingCash ?? this.openingCashFor(day)),
      rows, totalDiff, takenOut: money(takenOut), leftInDrawer: money(cashCounted - money(takenOut)),
      count: f.count, total: f.total, creditSales: f.creditSales, payouts: f.payouts, payoutTotal: f.payoutTotal,
      note, by: this.user?.email || '', byName: this.user?.name || '',
    };
    if (rec.leftInDrawer < 0) throw new Error('More cash taken out than is in the drawer');
    this.backend.write([{ type: 'set', col: 'dayclose', id: day, data: rec }]);
    return { ...rec, id: day };
  },
  deleteExpense(id) {
    if (!this.can('clear')) throw new Error('Only the owner, or a manager the owner has allowed, can delete expenses');
    const x = this.data.expenses.find((e) => e.id === id);
    this._commit(`Deleted expense${x ? ` ${x.category} TSh ${money(x.amount).toLocaleString('en-US')}` : ''}`, [{ type: 'delete', col: 'expenses', id }]);
  },
  /** Clear stock-loss figures (one or many). Only the figure goes; stock stays as it is. */
  clearAdjustments(ids) {
    if (!this.can('clear')) throw new Error('Only the owner, or a manager the owner has allowed, can clear losses');
    const ops = ids.map((id) => ({ type: 'delete', col: 'adjustments', id }));
    this._commit(`Cleared ${ops.length} loss figure${ops.length === 1 ? '' : 's'}`, ops);
    return ops.length;
  },

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

  /**
   * Weekly purchase orders: on the chosen weekday (or the first time the app is opened
   * after it), draft one PO per supplier for everything at or below its minimum.
   * Last week's untouched automatic drafts are replaced, so they never pile up.
   */
  autoWeeklyPo(now = Date.now()) {
    if (!this.can('orders') || this.settings.autoWeeklyPo === false || !this.data.items.length) return [];
    const day = num(this.settings.weeklyPoDay ?? 1);
    const week = weekKey(now, day);
    if (this.settings.lastAutoPo === week) return [];
    const stale = this.data.pos.filter((p) => p.auto && p.status === 'draft' && !String(p.id).startsWith(`auto-${week}-`));
    if (stale.length) this.backend.write(stale.map((p) => ({ type: 'delete', col: 'pos', id: p.id })));
    const ids = this.generatePos({ auto: true, week });
    this.saveSettings({ lastAutoPo: week });
    if (ids.length) this._notify('Weekly purchase orders ready', `${ids.length} draft purchase order${ids.length > 1 ? 's' : ''} for items below their minimum.`, '#/orders?tab=pos');
    return ids;
  },

  // ---------- Month-end closing ----------
  closingFor(month) { return this.data.closings.find((c) => c.id === month); },
  closingFigures(pl, opts = {}) {
    const s = this.settings;
    return monthClosing(pl, {
      salaryList: opts.salaryList ?? s.salaryList ?? [],
      maintenancePct: opts.maintenancePct ?? s.maintenancePct ?? 0,
      maintenanceFixed: opts.maintenanceFixed ?? 0,
      otherSavings: opts.otherSavings ?? 0,
    });
  },
  /** Save a month's closing. Optionally records the salary list as expenses for that month. */
  closeMonth(month, pl, opts) {
    const f = this.closingFigures(pl, opts);
    const ops = [];
    if (opts.recordSalaries && !f.salariesRecorded) {
      const [, end] = monthRange(month);
      const ts = Math.min(Date.now(), end - 3600000);
      for (const s of opts.salaryList || []) {
        if (!(num(s.amount) > 0)) continue;
        ops.push({ type: 'set', col: 'expenses', id: this.backend.newId('expenses'), data: { ts, date: dayKey(ts), category: 'Salaries', amount: money(s.amount), note: `Salary — ${s.name || ''}`.trim(), by: this.user?.email || '', ...this._stamp() } });
      }
    }
    const owedToSuppliers = money(this.data.purchases.filter((p) => !p.paid).reduce((t, p) => t + num(p.total), 0));
    ops.push({
      type: 'set', col: 'closings', id: month,
      data: {
        month, ...f, maintenancePct: num(opts.maintenancePct), otherLabel: opts.otherLabel || '', salaryList: opts.salaryList || [],
        owedByCustomers: this.owedByCustomers(), owedToSuppliers, byPay: pl.byPay || {}, note: opts.note || '',
        ts: Date.now(), by: this.user?.email || '', byName: this.user?.name || '',
      },
    });
    ops.push({ type: 'merge', col: 'meta', id: 'settings', data: { salaryList: opts.salaryList || [], maintenancePct: num(opts.maintenancePct), lastClosed: month > (this.settings.lastClosed || '') ? month : this.settings.lastClosed } });
    this.backend.write(ops);
    return f;
  },
  savingsToDate() {
    return this.data.closings.reduce((t, c) => ({ maintenance: t.maintenance + num(c.maintenance), other: t.other + num(c.otherSavings) }), { maintenance: 0, other: 0 });
  },
  closingReminder(now = Date.now()) {
    if (!this.can('reports')) return;
    const prev = addMonths(monthKey(now), -1);
    const d = new Date(now);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate();
    if (lastDay && !this.closingFor(monthKey(now))) this._notify('Month end', 'Today is the last day of the month — close the month in Money → Profit.', `#/money?tab=report&month=${monthKey(now)}`);
    else if (this.data.sales.some((s) => monthKey(s.ts) === prev) && !this.closingFor(prev)) this._notify('Close last month', `${monthLabel(prev)} has not been closed yet — see your real profit in Money → Profit.`, `#/money?tab=report&month=${prev}`);
  },

  // ---------- Settings & access ----------
  saveSettings(patch) {
    this.backend.write([{ type: 'merge', col: 'meta', id: 'settings', data: { ...patch, ...this._stamp() } }]);
  },
  // ---------- Shops & management ----------
  /** This user's role in a shop: management counts as owner everywhere. */
  roleIn(shop) {
    const e = this.user?.email;
    if (!shop || !e) return null;
    if (this.isAdmin) return 'owner';
    if ((shop.owners || []).includes(e)) return 'owner';
    return shop.members?.[e] || null;
  },
  claimManagement() {
    return this.backend.write([{ type: 'set', col: '/platform', id: 'admins', data: { admins: { [this.user.email]: true }, createdAt: Date.now(), createdBy: this.user.email } }]);
  },
  setAdmin(email, on) {
    const admins = { ...(this.admins?.admins || {}) };
    const key = email.trim().toLowerCase();
    if (on) admins[key] = true; else delete admins[key];
    if (!admins[this.user.email]) throw new Error('You cannot remove yourself from management');
    return this.backend.write([{ type: 'update', col: '/platform', id: 'admins', data: { admins, updatedAt: Date.now() } }]);
  },
  _shopPeople(owners, members, canClear = this.shop?.canClear || {}) {
    // Only managers keep the "can clear" permission; it goes if they are removed or change role.
    const keep = Object.fromEntries(Object.entries(canClear).filter(([e, on]) => on && members[e] === 'manager'));
    return { owners, members, memberEmails: [...new Set([...owners, ...Object.keys(members)])], canClear: keep };
  },
  /** Owner: allow (or stop) a manager deleting received orders and clearing losses and expenses. */
  setCanClear(email, on) {
    if (!this.can('users')) throw new Error('Only the owner can change this');
    const key = email.trim().toLowerCase();
    if (this.shop.members?.[key] !== 'manager') throw new Error('Only managers can be given this permission');
    const canClear = { ...(this.shop.canClear || {}) };
    if (on) canClear[key] = true; else delete canClear[key];
    return this.backend.write([{ type: 'update', col: '/shops', id: this.shop.id, data: { canClear, updatedAt: Date.now() } }]);
  },
  /** Management: create a shop with an owner; optionally copy another shop's item list (stock starts at 0). */
  async createShop({ name, ownerEmail, copyFrom = '' }) {
    const owner = ownerEmail.trim().toLowerCase();
    if (!name.trim()) throw new Error('Give the shop a name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner)) throw new Error('Enter the owner’s email address');
    const id = this.backend.newId('/shops');
    await this.backend.write([{
      type: 'set', col: '/shops', id,
      data: { name: name.trim(), ...this._shopPeople([owner], {}, {}), createdAt: Date.now(), createdBy: this.user.email },
    }]);
    const ops = [{ type: 'set', col: `/shops/${id}/meta`, id: 'settings', data: { shopName: name.trim(), ...this._stamp() } }];
    if (copyFrom) {
      const items = await this.backend.getAll(`/shops/${copyFrom}/items`);
      for (const { id: itemId, ...it } of items) {
        if (it.active === false) continue;
        ops.push({ type: 'set', col: `/shops/${id}/items`, id: itemId, data: { ...it, stock: 0, supplierId: '', ...this._stamp({ createdAt: Date.now() }) } });
      }
    }
    for (let i = 0; i < ops.length; i += 400) this.backend.write(ops.slice(i, i + 400));
    return id;
  },
  /** Give someone a role in the current shop (role null removes them). Only management can make owners. */
  setShopMember(email, role) {
    const key = email.trim().toLowerCase();
    const owners = (this.shop.owners || []).filter((e) => e !== key);
    const members = { ...(this.shop.members || {}) };
    delete members[key];
    if (role === 'owner') {
      if (!this.isAdmin) throw new Error('Only management can make someone an owner');
      owners.push(key);
    } else if (role) members[key] = role;
    if (!owners.length) throw new Error('A shop needs at least one owner');
    if (!this.isAdmin && owners.join() !== (this.shop.owners || []).join()) throw new Error('Only management can change owners');
    return this.backend.write([{ type: 'update', col: '/shops', id: this.shop.id, data: { ...this._shopPeople(owners, members), updatedAt: Date.now() } }]);
  },
  renameShop(name) {
    return this.backend.write([
      { type: 'update', col: '/shops', id: this.shop.id, data: { name: name.trim(), updatedAt: Date.now() } },
      { type: 'merge', col: 'meta', id: 'settings', data: { shopName: name.trim(), ...this._stamp() } },
    ]);
  },
  /** Figures for the management overview, read straight from a shop. */
  async shopSummary(shopId) {
    const base = `/shops/${shopId}`;
    const [from, to] = monthRange(monthKey());
    const [items, sales, expenses, adjustments] = await Promise.all([
      this.backend.getAll(`${base}/items`),
      this.backend.fetchRange(`${base}/sales`, from, to),
      this.backend.fetchRange(`${base}/expenses`, from, to),
      this.backend.fetchRange(`${base}/adjustments`, from, to),
    ]);
    const active = items.filter((i) => i.active !== false);
    const plan = reorderPlan(active, sales, {});
    return {
      items: active.length,
      stock: stockValue(active),
      lows: plan.filter((p) => p.status === 'out' || p.status === 'low').length,
      today: daySummary(sales),
      month: profitAndLoss({ sales, expenses, adjustments }, monthKey()),
    };
  },
  /**
   * One-time upgrade: the single shop stored at the top of the database becomes
   * shop 1 under shops/, and this owner becomes management. The old copy is kept.
   */
  async migrateLegacy(onProgress = () => {}) {
    // Absolute paths ("/…") throughout: the app must not switch into the new shop half-way.
    this.migrating = true;
    const legacy = await this.backend.getDoc('/meta', 'access');
    const settings = (await this.backend.getDoc('/meta', 'settings')) || {};
    await this.claimManagement();
    const id = this.backend.newId('/shops');
    const members = { ...(legacy?.members || {}) };
    const name = settings.shopName && settings.shopName !== 'My Shop' ? settings.shopName : 'Greenlight Stationeries';
    await this.backend.write([{ type: 'set', col: '/shops', id, data: { name, ...this._shopPeople([this.user.email], members), createdAt: Date.now(), createdBy: this.user.email, migratedFrom: 'single-shop' } }]);
    const { id: _s, ...settingsData } = settings;
    const ops = [{ type: 'set', col: `/shops/${id}/meta`, id: 'settings', data: { ...settingsData, shopName: name } }];
    const cols = ['items', 'suppliers', 'rfqs', 'pos', 'sales', 'purchases', 'adjustments', 'expenses'];
    let n = 0;
    for (const col of cols) {
      onProgress(`Moving ${col}…`);
      const docs = await this.backend.getAll('/' + col);
      for (const { id: docId, ...d } of docs) { ops.push({ type: 'set', col: `/shops/${id}/${col}`, id: docId, data: d }); n++; }
    }
    onProgress(`Saving ${n} records…`);
    for (let i = 0; i < ops.length; i += 400) await this.backend.write(ops.slice(i, i + 400));
    await this.backend.write([{ type: 'merge', col: '/meta', id: 'access', data: { migratedTo: id } }]);
    return { id, records: n };
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
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: 'icons/book-192.png', tag: body, data: { link } }));
      }
    } catch { /* ignore */ }
  },

  /** Copy everything entered in device-only trial mode into the synced shop. */
  importTrialData(local) {
    const ops = [];
    for (const [col, docs] of Object.entries(local)) {
      for (const [id, d] of Object.entries(docs || {})) {
        if (col === 'meta' && id !== 'settings') continue;
        if (col === 'changes') continue; // the trial's change history stays behind
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
