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
    salesCount: ms.filter((x) => x.type !== 'refund').length,
    grossSales: money(ms.filter((x) => x.type !== 'refund').reduce((t, x) => t + num(x.subtotal), 0)),
    refunds: money(-ms.filter((x) => x.type === 'refund').reduce((t, x) => t + num(x.total), 0)),
    tax: money(ms.reduce((t, x) => t + num(x.tax), 0)),
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
/** Quantity of each item still to arrive on purchase orders that were sent (ordered or partly received). */
export function onOrderQty(pos = []) {
  const out = {};
  for (const po of pos) {
    if (po.status !== 'ordered' && po.status !== 'partial') continue;
    for (const l of po.lines || []) {
      const left = num(l.qty) - num(l.received);
      if (left > 0) out[l.itemId] = (out[l.itemId] || 0) + left;
    }
  }
  return out;
}

export function reorderPlan(items, sales, settings = {}, now = Date.now(), onOrder = {}) {
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
      const ordered = num(onOrder[item.id]);
      let status = 'ok';
      if (stock <= 0) status = 'out';
      else if (reorderPoint > 0 && stock <= reorderPoint) status = 'low';
      const needs = status !== 'ok';
      // What is already on a sent purchase order counts towards the fill-up, so nothing is ordered twice.
      const gap = Math.max(target - stock, 1) - ordered;
      const suggestQty = needs && gap > 0 ? roundUpTo(gap, item.packSize) : 0;
      if (needs && ordered > 0 && suggestQty === 0) status = 'onorder';
      const daysLeft = avgDaily > 0 ? Math.max(0, stock) / avgDaily : null;
      return { item, stock, avgDaily, reorderPoint, target, maxSet: num(item.maxStock) > 0, onOrder: ordered, status, suggestQty, daysLeft };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
}
const rank = (p) => ({ out: 0, low: 1, onorder: 2 }[p.status] ?? 3);

/** Group items needing stock into one request for quotation per supplier. */
export function draftRfqs(plan, suppliers = [], { includeAll = false } = {}) {
  const sup = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  const groups = {};
  for (const p of plan) {
    if (!includeAll && p.suggestQty <= 0) continue;
    const qty = p.suggestQty > 0 ? p.suggestQty : roundUpTo(Math.max(p.target - p.stock - num(p.onOrder), 1), p.item.packSize);
    const sid = sup[p.item.supplierId] ? p.item.supplierId : '';
    (groups[sid] ||= []).push({
      itemId: p.item.id,
      name: p.item.name,
      sku: p.item.sku || '',
      unit: p.item.unit || 'pcs',
      qty,
      fillTo: p.target,
      maxSet: p.maxSet,
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
  const count = ds.filter((s) => s.type !== 'refund').length;
  const cogs = ds.reduce((t, s) => t + num(s.cogs), 0);
  return { count, revenue: money(revenue), profit: money(revenue - cogs) };
}

/** Short, collision-resistant document number usable offline, e.g. S-261012-K7Q2 */
export function docNo(prefix, ts = Date.now()) {
  const d = new Date(ts);
  const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rnd}`;
}

/** Discount typed as an amount ("500") or a percentage ("10%") → shillings. */
export function parseDiscount(input, subtotal) {
  const t = String(input ?? '').trim();
  if (!t) return 0;
  const sub = Math.max(0, num(subtotal));
  const amount = t.endsWith('%') ? sub * Math.min(100, Math.max(0, num(t.slice(0, -1)))) / 100 : num(t);
  return money(Math.min(Math.max(0, amount), sub));
}

/** Tax already included in a price, e.g. VAT 18%: 11,800 → 1,800. */
export function taxIncluded(total, rate) {
  const r = num(rate);
  return r > 0 ? money(num(total) * r / (100 + r)) : 0;
}

/**
 * Lines and totals for refunding part of a sale. `qtys` maps itemId → quantity to return.
 * The sale's discount is shared across lines so a refund gives back what was actually paid.
 */
export function refundTotals(sale, qtys) {
  const factor = num(sale.subtotal) > 0 ? num(sale.total) / num(sale.subtotal) : 1;
  const lines = [];
  for (const l of sale.lines || []) {
    const left = num(l.qty) - num(sale.refundedQty?.[l.itemId]);
    const q = Math.min(Math.max(0, num(qtys[l.itemId])), left);
    if (q > 0) lines.push({ ...l, qty: -q });
  }
  const subtotal = lines.reduce((t, l) => t + l.qty * num(l.price), 0);
  const total = money(subtotal * factor);
  return {
    lines,
    subtotal: money(subtotal),
    discount: money(subtotal) - total,
    total,
    cogs: money(lines.reduce((t, l) => t + l.qty * num(l.cost), 0)),
  };
}

/**
 * Sales grouped like Loyverse reports. by: 'item' | 'category' | 'staff' | 'pay' | 'day'.
 * Each row: gross sales, refunds, discounts, net sales, cost of goods, gross profit.
 */
export function salesBreakdown(sales, [from, to], by, itemCategory = () => '') {
  const rows = {};
  const row = (k, label) => (rows[k] ||= { key: k, label, count: 0, qty: 0, gross: 0, refunds: 0, discounts: 0, net: 0, cogs: 0 });
  for (const s of sales) {
    if (s.voided || s.ts < from || s.ts >= to) continue;
    const refund = s.type === 'refund';
    const factor = num(s.subtotal) ? num(s.total) / num(s.subtotal) : 1;
    if (by === 'item' || by === 'category') {
      for (const l of s.lines || []) {
        const k = by === 'item' ? l.itemId : (itemCategory(l.itemId) || 'No category');
        const r = row(k, by === 'item' ? l.name : k);
        const amount = num(l.qty) * num(l.price);
        r.qty += num(l.qty);
        if (refund) r.refunds -= amount * factor; else { r.gross += amount; r.discounts += amount * (1 - factor); }
        r.net += amount * factor;
        r.cogs += num(l.qty) * num(l.cost);
      }
    } else {
      const k = by === 'staff' ? (s.byName || s.by || 'Unknown') : by === 'pay' ? (s.pay || 'Cash') : dayKey(s.ts);
      const r = row(k, k);
      if (!refund) r.count += 1;
      if (refund) r.refunds -= num(s.total); else { r.gross += num(s.subtotal); r.discounts += num(s.discount); }
      r.net += num(s.total);
      r.cogs += num(s.cogs);
    }
  }
  return Object.values(rows).map((r) => ({
    ...r, gross: money(r.gross), refunds: money(r.refunds), discounts: money(r.discounts),
    net: money(r.net), cogs: money(r.cogs), profit: money(r.net - r.cogs),
  })).sort((a, b) => (by === 'day' ? b.key.localeCompare(a.key) : b.net - a.net));
}

/**
 * Cash a drawer should hold at the end of a shift:
 * opening cash + cash sales − cash refunds + customer payments in cash + cash put in − cash taken out.
 */
export function shiftExpected(shift, sales = [], payments = [], { cashName = 'Cash', expenses = [] } = {}) {
  const from = num(shift.ts);
  const to = num(shift.closedAt) || Infinity;
  // On a shared till several staff use one account: a shift then counts only its staff member's sales.
  const mine = (x) => x.by === shift.by && (!shift.staffId || x.staffId === shift.staffId) && x.ts >= from && x.ts < to;
  const isCash = (p) => String(p || '').toLowerCase() === cashName.toLowerCase();
  let cashSales = 0, cashRefunds = 0, otherSales = 0, count = 0;
  for (const s of sales) {
    if (s.voided || !mine(s)) continue;
    if (s.type === 'refund') { if (isCash(s.pay) && !s.credit) cashRefunds -= num(s.total); continue; }
    count += 1;
    if (isCash(s.pay) && !s.credit) cashSales += num(s.total); else otherSales += num(s.total);
  }
  const cashPayments = payments.filter((p) => mine(p) && isCash(p.method)).reduce((t, p) => t + num(p.amount), 0);
  const moves = shift.moves || [];
  const cashIn = moves.filter((m) => m.type === 'in').reduce((t, m) => t + num(m.amount), 0);
  const cashOut = moves.filter((m) => m.type === 'out').reduce((t, m) => t + num(m.amount), 0);
  // Pay-outs (food, transport…) taken from the drawer during the shift.
  const cashPayouts = expenses.filter((e) => e.payout && mine(e) && isCash(e.paidFrom || cashName)).reduce((t, e) => t + num(e.amount), 0);
  const expected = num(shift.openingCash) + cashSales - cashRefunds + cashPayments + cashIn - cashOut - cashPayouts;
  return {
    count, cashSales: money(cashSales), cashRefunds: money(cashRefunds), otherSales: money(otherSales),
    cashPayments: money(cashPayments), cashIn: money(cashIn), cashOut: money(cashOut), cashPayouts: money(cashPayouts), expected: money(expected),
  };
}

/** Week identifier such as "2026-10-12" (the date the week starts), weeks starting on `startDay` (1 = Monday). */
export function weekKey(ts = Date.now(), startDay = 1) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - back);
  return dayKey(d.getTime());
}

/**
 * Month-end closing: from the month's profit and loss to the profit the owner can take.
 * Salaries come from the expenses recorded under the salary category when there are any,
 * otherwise from the staff salary list. Running costs are the other expenses.
 */
export function monthClosing(pl, { salaryList = [], salaryCategory = 'Salaries', maintenancePct = 0, maintenanceFixed = 0, otherSavings = 0 } = {}) {
  const recordedSalaries = num(pl.expenses?.[salaryCategory]);
  const listedSalaries = salaryList.reduce((t, s) => t + num(s.amount), 0);
  const salaries = recordedSalaries > 0 ? recordedSalaries : listedSalaries;
  const runningCosts = Object.entries(pl.expenses || {}).filter(([c]) => c !== salaryCategory).reduce((t, [, v]) => t + num(v), 0);
  const netProfit = num(pl.grossProfit) - runningCosts - salaries - num(pl.losses);
  const maintenance = num(maintenanceFixed) > 0 ? num(maintenanceFixed) : Math.max(0, netProfit) * num(maintenancePct) / 100;
  const other = num(otherSavings);
  return {
    revenue: money(pl.revenue), cogs: money(pl.cogs), grossProfit: money(pl.grossProfit),
    runningCosts: money(runningCosts), salaries: money(salaries), salariesRecorded: recordedSalaries > 0,
    losses: money(pl.losses), netProfit: money(netProfit),
    maintenance: money(maintenance), otherSavings: money(other),
    takeHome: money(netProfit - maintenance - other),
    stockReplacement: money(pl.cogs),
  };
}

// ---------- Buying units: carton, dozen, box, set… ----------
/** Units shops buy in from wholesalers. A dozen is always 12. */
export const BUY_UNITS = ['dozen', 'carton', 'box', 'set', 'packet', 'pack', 'ream', 'bundle', 'bag', 'crate', 'roll'];
const PLURALS = { box: 'boxes', dozen: 'dozen', pcs: 'pcs', kg: 'kg', g: 'g', l: 'l', ml: 'ml', m: 'm', each: 'each' };
/** "carton", 2 → "cartons"; "box" → "boxes"; "dozen" stays "dozen". */
export function plural(unit, n) {
  const u = String(unit || '').trim();
  if (!u || Math.abs(num(n)) === 1) return u;
  const low = u.toLowerCase();
  if (PLURALS[low]) return PLURALS[low];
  if (/(s|x|z|ch|sh)$/.test(low)) return `${u}es`;
  if (/[^aeiou]y$/.test(low)) return `${u.slice(0, -1)}ies`;
  return `${u}s`;
}
/** Price per piece kept to 4 decimals, so a carton price divided by its pieces adds back up exactly. */
export const unitPrice = (v) => Math.round(num(v) * 10000) / 10000;
/**
 * The buying unit of an order line (snapshot) or item: { unit: 'carton', per: 24 }.
 * null when the item is bought one by one.
 */
export function packInfo(src = {}, item = {}) {
  const per = num(src.packSize ?? item?.packSize);
  if (!(per > 1)) return null;
  return { unit: (src.buyUnit ?? item?.buyUnit) || 'pack', per };
}
/** Whether a line is shown in its buying unit (cartons) rather than pieces. */
export function inPacks(line = {}, item = {}) {
  const p = packInfo(line, item);
  if (!p) return false;
  if (line.inPacks !== undefined) return !!line.inPacks;
  const q = num(line.qty);
  return !q || Math.abs(q / p.per - Math.round(q / p.per)) < 1e-9;
}
/** 48 pcs in cartons of 24 → "2 cartons (48 pcs)"; 51 → "2 cartons + 3 pcs (51 pcs)"; no pack → "48 pcs". */
export function orderQtyText(qty, pack, pieceUnit = 'pcs') {
  const q = num(qty);
  const pcs = `${fmtN(q)} ${pieceUnit || 'pcs'}`;
  if (!pack || !q) return pcs;
  const whole = Math.floor(q / pack.per + 1e-9);
  const rest = Math.round((q - whole * pack.per) * 1000) / 1000;
  if (!whole) return pcs;
  return `${fmtN(whole)} ${plural(pack.unit, whole)}${rest ? ` + ${fmtN(rest)} ${pieceUnit || 'pcs'}` : ''} (${pcs})`;
}
/** "1 carton = 24 pcs" */
export const packRule = (pack, pieceUnit = 'pcs') => (pack ? `1 ${pack.unit} = ${fmtN(pack.per)} ${pieceUnit || 'pcs'}` : '');
const fmtN = (n) => (Math.round(num(n) * 1000) / 1000).toLocaleString('en-US');

/** "100 pcs" bought in boxes of 50 → "2 boxes of 50"; not a whole number of packs → "2 boxes of 50 + 3 pcs". */
export function packsText(qty, item = {}) {
  const per = num(item.packSize);
  const q = num(qty);
  if (!(per > 1) || !q) return '';
  const name = item.buyUnit || 'pack';
  const whole = Math.floor(q / per + 1e-9);
  const rest = Math.round((q - whole * per) * 1000) / 1000;
  return `${whole ? `${whole} ${plural(name, whole)} of ${per}` : ''}${whole && rest ? ' + ' : ''}${rest ? `${rest} ${item.unit || 'pcs'}` : ''}`;
}

// ---------- Importing a supplier's order / price list ----------
const UNIT_ALIASES = {
  pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', pce: 'pcs', each: 'pcs', ea: 'pcs',
  doz: 'dozen', dz: 'dozen', dozen: 'dozen', dozens: 'dozen',
  ctn: 'carton', ctns: 'carton', carton: 'carton', cartons: 'carton',
  pkt: 'packet', pkts: 'packet', packet: 'packet', packets: 'packet', pack: 'pack', packs: 'pack',
  box: 'box', boxes: 'box', bx: 'box', ream: 'ream', reams: 'ream', rim: 'ream',
  outer: 'outer', outers: 'outer', kopo: 'kopo', tin: 'tin', bundle: 'bundle', bag: 'bag', roll: 'roll', set: 'set', sets: 'set',
};
/** "carton", "Ctn", "pc" → a standard unit name ("" when none). */
export function normUnit(u) {
  const k = String(u || '').trim().toLowerCase().replace(/[.\s]+$/, '');
  return UNIT_ALIASES[k] || k;
}
/**
 * A quantity as suppliers write it: "1 dozen", "50 pcs", "1 dozen (50 pcs)", "2", "" (= 1).
 * Returns { qty, unit, per } — per = pieces in one unit when the text says so — or null
 * when it is not a quantity at all (e.g. "Hizi sina" = not available).
 */
export function parseOrderQty(text) {
  const t = String(text ?? '').trim();
  if (!t) return { qty: 1, unit: '', per: null, blank: true };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z/]*)\.?\s*(?:\(\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*\))?\s*$/);
  if (!m) return null;
  const qty = num(m[1].replace(',', '.'));
  let unit = normUnit(m[2]);
  let per = m[3] ? num(m[3]) : null;
  if (unit === 'pcs') per = 1;
  if (unit === 'dozen' && !per) per = 12;
  return { qty, unit, per };
}

/** Find the column that matches any of the patterns (headers are compared lower-case). */
function findCol(header, ...res) {
  const h = header.map((x) => String(x || '').trim().toLowerCase());
  for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; }
  return -1;
}
/**
 * Rows of a supplier order (first row = headers) → lines with quantity, unit and prices.
 * The "Price" column is the amount for that line (it adds up to the TOTAL row); a "Unit price"
 * column, when present, is used as the price per unit instead.
 */
export function parseOrderRows(rows) {
  if (!rows.length) throw new Error('The file is empty');
  const head = rows[0];
  const c = {
    name: findCol(head, /^item/, /^name/, /^description/, /^product/, /^bidhaa/, /^jina/),
    qty: findCol(head, /^quantity/, /^qty/, /^idadi/, /^kiasi/),
    unitPrice: findCol(head, /^unit price/, /^price per/, /^price each/, /^bei ya kimoja/, /^rate/),
    amount: findCol(head, /^amount/, /^total/, /^price/, /^bei/, /^cost/),
  };
  if (c.amount === c.unitPrice) c.amount = -1;
  if (c.name < 0) throw new Error('Could not find an “Item” column in this file');
  const lines = [];
  let fileTotal = null;
  for (const r of rows.slice(1)) {
    const name = String(r[c.name] ?? '').trim();
    const cells = r.map((x) => String(x ?? '').trim()).join(' ');
    if (/^(grand\s*)?total/i.test(name) || (!name && /total/i.test(cells))) {
      const v = num(String(r[c.amount] ?? '').replace(/,/g, ''));
      if (v) fileTotal = v;
      continue;
    }
    if (!name) continue;
    const qtyText = c.qty >= 0 ? String(r[c.qty] ?? '').trim() : '';
    const amountText = c.amount >= 0 ? String(r[c.amount] ?? '').replace(/,/g, '').trim() : '';
    const unitText = c.unitPrice >= 0 ? String(r[c.unitPrice] ?? '').replace(/,/g, '').trim() : '';
    const q = parseOrderQty(qtyText);
    if (!q || (amountText === '' && unitText === '')) {
      lines.push({ name, qtyText, unavailable: true, reason: q ? 'No price' : qtyText || 'No quantity' });
      continue;
    }
    const unitPriceV = unitText !== '' ? num(unitText) : num(amountText) / (q.qty || 1);
    const amount = amountText !== '' ? num(amountText) : unitPriceV * q.qty;
    lines.push({ name, qtyText, qty: q.qty, unit: q.unit, per: q.per, unitPrice: unitPrice(unitPriceV), amount: money(amount) });
  }
  const sum = money(lines.filter((l) => !l.unavailable).reduce((t, l) => t + l.amount, 0));
  return { lines, fileTotal, sum };
}

// Supplier names vs your item names: "Quire Two" ~ "Counter Book Q2", "Chongeo" ~ "Vichongeo".
const NAME_SWAPS = [
  [/\bquire\s*(one|1)\b/g, 'q1'], [/\bquire\s*(two|2)\b/g, 'q2'], [/\bquire\s*(three|3)\b/g, 'q3'], [/\bquire\s*(four|4)\b/g, 'q4'],
  [/\bcounter\s*book\b/g, ''], [/\bcounter\b/g, ''], [/\bmaths?\b/g, 'mathematical'], [/\bw\/book\b/g, 'notebook'],
  [/\bpg\b/g, 'page'], [/\bpages?\b/g, 'page'], [/\bpage\s*(\d+)/g, 'p$1'], [/\bsellotape\b|\bcellotape\b|\bsole\s*tape\b/g, 'sellotape'], [/\bpaper one\b/g, 'a one'],
  [/\bvi(?=[a-z]{4,})/g, ''], [/\bkubwa\b/g, 'big'], [/\bndogo\b/g, 'small'], [/\bya\b|\bza\b|\bwa\b|\bla\b|\bthe\b|\bof\b/g, ''],
];
export function normName(s) {
  let t = String(s || '').toLowerCase().replace(/[()|,.;:_\-+*]/g, ' ');
  for (const [re, to] of NAME_SWAPS) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}
const bigrams = (s) => { const t = ` ${s} `; const out = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
/** 0..1 — how alike two item names are (letter pairs + whole words). */
export function nameScore(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x), B = bigrams(y);
  const pool = [...B]; let hit = 0;
  for (const g of A) { const k = pool.indexOf(g); if (k >= 0) { hit++; pool.splice(k, 1); } }
  const dice = (2 * hit) / (A.length + B.length);
  const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  const wa = new Set(x.split(' ').map(stem)), wb = new Set(y.split(' ').map(stem));
  const common = [...wa].filter((w) => wb.has(w)).length;
  const words = common / Math.max(1, Math.max(wa.size, wb.size));
  let score = Math.max(dice, 0.5 * dice + 0.5 * (common / Math.max(1, Math.min(wa.size, wb.size))) * (0.5 + 0.5 * words));
  // Sizes must agree: A4 is not A5, Q2 is not Q3, big is not small.
  const isSize = (w) => /^(a\d|q\d|p\d+|\d+x\d+|\d+mm|big|small)$/.test(w);
  const sa = [...wa].filter(isSize), sb = [...wb].filter(isSize);
  const ka = [...wa].filter((w) => !isSize(w)), kb = [...wb].filter((w) => !isSize(w));
  const keyCommon = ka.filter((w) => kb.includes(w)).length;
  // Every real word of the shorter name is in the longer one: a strong match ("Graph Pad" → "Graph pad A4").
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (short.length && short.every((w) => long.includes(w))) score = Math.max(score, 0.75 + 0.25 * (short.length / long.length));
  const sizeAgree = sa.length && sb.length && sa.some((w) => sb.includes(w));
  if (!keyCommon && !(sizeAgree && (!ka.length || !kb.length))) score *= 0.6; // only sizes or nothing in common
  score += 0.01 * keyCommon; // more shared words wins a tie ("Colour Pencil" → "Colour pencils", not "Pencil")
  if (sa.length && sb.length && !sa.some((w) => sb.includes(w))) score *= 0.4;
  return Math.min(1, score);
}
/** Best matching item for a supplier's name, or null when nothing is close enough. */
export function bestItemMatch(name, items, min = 0.55) {
  let best = null, score = 0;
  for (const it of items) { const s = nameScore(name, it.name); if (s > score) { score = s; best = it; } }
  return score >= min ? { item: best, score } : null;
}

/** Money for one order line: supplier units × price per unit, or pieces × cost per piece. */
export function lineAmount(l) {
  return l.ordUnit ? num(l.ordQty) * num(l.ordPrice) : num(l.qty) * num(l.cost);
}

// ---------- Closing the day ----------
/**
 * Money that should be in the drawer and on each mobile-money line for one day.
 * For every payment method: sales + customer payments − refunds − payouts paid from it.
 * Cash also starts with the cash left in the drawer from the day before.
 * Credit sales bring in no money that day; they are listed separately.
 */
export function dayClose({ day, sales = [], payments = [], expenses = [], methods = ['Cash'], openingCash = 0, creditName = 'Credit' }) {
  const rows = new Map();
  const row = (m) => {
    const k = m || 'Cash';
    if (!rows.has(k)) rows.set(k, { method: k, sales: 0, payments: 0, refunds: 0, payouts: 0 });
    return rows.get(k);
  };
  for (const m of methods) if (m && m.toLowerCase() !== creditName.toLowerCase()) row(m);
  const cashName = methods.find((m) => m.toLowerCase() === 'cash') || methods[0] || 'Cash';
  let creditSales = 0, count = 0, total = 0;
  for (const s of sales) {
    if (s.voided || dayKey(s.ts) !== day) continue;
    if (s.type === 'refund') {
      if (s.credit) creditSales += num(s.total); else row(s.pay).refunds += -num(s.total);
      total += num(s.total);
      continue;
    }
    count += 1;
    total += num(s.total);
    if (s.credit) creditSales += num(s.total); else row(s.pay).sales += num(s.total);
  }
  for (const p of payments) if (dayKey(p.ts) === day) row(p.method).payments += num(p.amount);
  const payouts = expenses.filter((e) => dayKey(e.ts) === day && e.paidFrom);
  for (const e of payouts) row(e.paidFrom).payouts += num(e.amount);
  const out = [...rows.values()].map((r) => {
    const opening = r.method === cashName ? num(openingCash) : 0;
    return { ...r, opening, expected: money(opening + r.sales + r.payments - r.refunds - r.payouts) };
  });
  return {
    day, count, total: money(total), creditSales: money(creditSales), cashName,
    rows: out, payouts: payouts.map((e) => ({ category: e.category, amount: num(e.amount), note: e.note || '', paidFrom: e.paidFrom, byName: e.byName || e.by || '' })),
    payoutTotal: money(payouts.reduce((t, e) => t + num(e.amount), 0)),
    expected: money(out.reduce((t, r) => t + r.expected, 0)),
  };
}

// ---------- Items that use other items (photocopy uses paper, lamination uses a pouch) ----------
/**
 * item.uses = [{ itemId, per }] — one unit of that item covers `per` sales of this one.
 * Returns what `qty` sold takes out of stock and the cost it adds per unit sold.
 */
export function usesFor(item, qty, itemById) {
  const out = [];
  let costPerUnit = 0;
  for (const u of item?.uses || []) {
    const per = num(u.per);
    const used = itemById(u.itemId);
    if (!(per > 0) || !used) continue;
    out.push({ itemId: u.itemId, name: used.name, per, qty: Math.round((num(qty) / per) * 10000) / 10000 });
    costPerUnit += num(used.cost) / per;
  }
  return { used: out, costPerUnit };
}
