// Pure business calculations. No DOM, no database — easy to test.

export const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' for a timestamp (local time). */
export function monthKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 'YYYY-MM-DD' for a timestamp (local time). */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** [start, end) timestamps of a 'YYYY-MM' month. */
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
}

/** Shift a 'YYYY-MM' key by n months. */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1).getTime());
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Money is kept as whole shillings. */
export const money = (v) => Math.round(num(v));

/** Weighted average cost after receiving stock. */
export function averageCost(oldQty, oldCost, addQty, addCost) {
  const q0 = Math.max(0, num(oldQty));
  const q1 = num(addQty);
  if (q1 <= 0) return num(oldCost);
  if (q0 <= 0 || !num(oldCost)) return num(addCost);
  return (q0 * num(oldCost) + q1 * num(addCost)) / (q0 + q1);
}

/** Totals for a cart. lines: [{qty, price, cost}] */
export function cartTotals(lines, discount = 0) {
  const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
  const cogs = lines.reduce((s, l) => s + num(l.qty) * num(l.cost), 0);
  const disc = Math.min(Math.max(0, num(discount)), subtotal);
  return { subtotal: money(subtotal), discount: money(disc), total: money(subtotal - disc), cogs: money(cogs) };
}

const inRange = (ts, [a, b]) => ts >= a && ts < b;

/**
 * Profit & loss for one month.
 * Revenue = sales after discounts. COGS = cost of the goods those sales took out of stock.
 * Net profit = gross profit − expenses − stock losses (damaged/lost/expired at cost).
 */
export function profitAndLoss({ sales = [], expenses = [], adjustments = [], purchases = [] }, key) {
  const range = monthRange(key);
  const ms = sales.filter((s) => !s.voided && inRange(s.ts, range));
  const revenue = ms.reduce((t, s) => t + num(s.total), 0);
  const cogs = ms.reduce((t, s) => t + num(s.cogs), 0);
  const discounts = ms.reduce((t, s) => t + num(s.discount), 0);

  const byCategory = {};
  for (const e of expenses) {
    if (!inRange(e.ts, range)) continue;
    const c = e.category || 'Other';
    byCategory[c] = (byCategory[c] || 0) + num(e.amount);
  }
  const expenseTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);

  // Negative adjustments (damaged, lost, expired, count shortfall) are losses at cost.
  // Positive count corrections reduce the loss.
  const losses = adjustments
    .filter((a) => inRange(a.ts, range))
    .reduce((t, a) => t - num(a.qty) * num(a.cost), 0);

  const stockBought = purchases.filter((p) => inRange(p.ts, range)).reduce((t, p) => t + num(p.total), 0);

  const byPay = {};
  for (const s of ms) byPay[s.pay || 'cash'] = (byPay[s.pay || 'cash'] || 0) + num(s.total);

  const items = {};
  for (const s of ms) {
    // Spread the sale discount over its lines so item profit adds up to the total.
    const factor = num(s.subtotal) > 0 ? num(s.total) / num(s.subtotal) : 1;
    for (const l of s.lines || []) {
      const it = (items[l.itemId] ||= { itemId: l.itemId, name: l.name, qty: 0, revenue: 0, cogs: 0 });
      it.qty += num(l.qty);
      it.revenue += num(l.qty) * num(l.price) * factor;
      it.cogs += num(l.qty) * num(l.cost);
    }
  }
  const topItems = Object.values(items)
    .map((i) => ({ ...i, revenue: money(i.revenue), cogs: money(i.cogs), profit: money(i.revenue - i.cogs) }))
    .sort((a, b) => b.profit - a.profit);

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal - losses;
  return {
    key,
    salesCount: ms.length,
    revenue: money(revenue),
    discounts: money(discounts),
    cogs: money(cogs),
    grossProfit: money(grossProfit),
    grossMargin: revenue ? grossProfit / revenue : 0,
    expenses: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, money(v)])),
    expenseTotal: money(expenseTotal),
    losses: money(losses),
    netProfit: money(netProfit),
    netMargin: revenue ? netProfit / revenue : 0,
    stockBought: money(stockBought),
    byPay: Object.fromEntries(Object.entries(byPay).map(([k, v]) => [k, money(v)])),
    topItems,
  };
}

/** Quantity of each item sold in the last `days` days. */
export function soldQty(sales, days, now = Date.now()) {
  const from = now - days * DAY;
  const out = {};
  for (const s of sales) {
    if (s.voided || s.ts < from || s.ts > now) continue;
    for (const l of s.lines || []) out[l.itemId] = (out[l.itemId] || 0) + num(l.qty);
  }
  return out;
}

const roundUpTo = (q, pack) => {
  const p = num(pack) > 0 ? num(pack) : 1;
  return Math.ceil(q / p - 1e-9) * p;
};

/**
 * Reorder plan for every active item.
 *  - average daily sales over the last `windowDays`
 *  - reorder point = max(your minimum, sales during the supplier lead time)
 *  - target level  = your maximum, or enough stock for lead time + cover days
 *  - suggested qty = target − current stock (rounded up to the pack size) when stock is at/below the reorder point
 */
export function reorderPlan(items, sales, settings = {}, now = Date.now()) {
  const windowDays = num(settings.windowDays) || 30;
  const leadDays = num(settings.leadDays) || 7;
  const coverDays = num(settings.coverDays) || 30;
  const sold = soldQty(sales, windowDays, now);

  return items
    .filter((i) => i.active !== false && !i.service)
    .map((item) => {
      const stock = num(item.stock);
      const avgDaily = (sold[item.id] || 0) / windowDays;
      const minStock = num(item.minStock);
      const reorderPoint = Math.max(minStock, Math.ceil(avgDaily * leadDays));
      const target = num(item.maxStock) > 0
        ? num(item.maxStock)
        : Math.max(Math.ceil(avgDaily * (leadDays + coverDays)), minStock * 2, reorderPoint + 1);
      let status = 'ok';
      if (stock <= 0) status = 'out';
      else if (reorderPoint > 0 && stock <= reorderPoint) status = 'low';
      const needs = status !== 'ok';
      const suggestQty = needs ? roundUpTo(Math.max(target - stock, 1), item.packSize) : 0;
      const daysLeft = avgDaily > 0 ? Math.max(0, stock) / avgDaily : null;
      return { item, stock, avgDaily, reorderPoint, target, status, suggestQty, daysLeft };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
}
const rank = (p) => (p.status === 'out' ? 0 : p.status === 'low' ? 1 : 2);

/** Group items needing stock into one request for quotation per supplier. */
export function draftRfqs(plan, suppliers = [], { includeAll = false } = {}) {
  const sup = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  const groups = {};
  for (const p of plan) {
    if (!includeAll && p.suggestQty <= 0) continue;
    const qty = p.suggestQty > 0 ? p.suggestQty : roundUpTo(Math.max(p.target - p.stock, 1), p.item.packSize);
    const sid = sup[p.item.supplierId] ? p.item.supplierId : '';
    (groups[sid] ||= []).push({
      itemId: p.item.id,
      name: p.item.name,
      sku: p.item.sku || '',
      unit: p.item.unit || 'pcs',
      qty,
      lastCost: money(p.item.lastCost || p.item.cost),
    });
  }
  return Object.entries(groups).map(([sid, lines]) => ({
    supplierId: sid,
    supplierName: sid ? sup[sid].name : 'Any supplier',
    lines: lines.sort((a, b) => a.name.localeCompare(b.name)),
    estimate: money(lines.reduce((t, l) => t + l.qty * l.lastCost, 0)),
  }));
}

/** Value of stock on hand at cost and at selling price. */
export function stockValue(items) {
  let cost = 0, retail = 0, units = 0;
  for (const i of items) {
    if (i.active === false || i.service) continue;
    const q = Math.max(0, num(i.stock));
    units += q;
    cost += q * num(i.cost);
    retail += q * num(i.price);
  }
  return { cost: money(cost), retail: money(retail), units };
}

/** Sales totals for one day. */
export function daySummary(sales, key = dayKey()) {
  const ds = sales.filter((s) => !s.voided && dayKey(s.ts) === key);
  const revenue = ds.reduce((t, s) => t + num(s.total), 0);
  const cogs = ds.reduce((t, s) => t + num(s.cogs), 0);
  return { count: ds.length, revenue: money(revenue), profit: money(revenue - cogs) };
}

/** Short, collision-resistant document number usable offline, e.g. S-261012-K7Q2 */
export function docNo(prefix, ts = Date.now()) {
  const d = new Date(ts);
  const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rnd}`;
}
