import assert from 'node:assert/strict';
import { parseDiscount, taxIncluded, refundTotals, salesBreakdown, averageCost, cartTotals, profitAndLoss, reorderPlan, draftRfqs, monthRange, monthKey, stockValue, DAY } from '../js/calc.js';

// Average cost: 10 @ 1000 + 10 @ 1200 = 1100
assert.equal(averageCost(10, 1000, 10, 1200), 1100);
assert.equal(averageCost(0, 1000, 5, 1500), 1500);
assert.equal(averageCost(-3, 1000, 5, 1500), 1500);

// Cart totals
const t = cartTotals([{ qty: 2, price: 1500, cost: 1000 }, { qty: 1, price: 3000, cost: 2000 }], 500);
assert.deepEqual(t, { subtotal: 6000, discount: 500, total: 5500, cogs: 4000 });

// P&L for October 2026
const [oct] = monthRange('2026-10');
const sales = [
  { ts: oct + DAY, total: 5500, subtotal: 6000, discount: 500, cogs: 4000, pay: 'Cash', lines: [{ itemId: 'a', name: 'Sugar', qty: 2, price: 1500, cost: 1000 }, { itemId: 'b', name: 'Oil', qty: 1, price: 3000, cost: 2000 }] },
  { ts: oct + 2 * DAY, total: 3000, subtotal: 3000, discount: 0, cogs: 2000, pay: 'M-Pesa', lines: [{ itemId: 'b', name: 'Oil', qty: 1, price: 3000, cost: 2000 }] },
  { ts: oct + 2 * DAY, total: 9999, subtotal: 9999, cogs: 1, voided: true, lines: [] },
  { ts: oct - DAY, total: 7777, subtotal: 7777, cogs: 1, lines: [] }, // September
];
const expenses = [{ ts: oct + DAY, category: 'Rent', amount: 1000 }, { ts: oct + 3 * DAY, category: 'Transport', amount: 200 }];
const adjustments = [{ ts: oct + DAY, qty: -2, cost: 1000 }, { ts: oct + DAY, qty: 1, cost: 500 }];
const pl = profitAndLoss({ sales, expenses, adjustments, purchases: [{ ts: oct, total: 50000 }] }, '2026-10');
assert.equal(pl.revenue, 8500);
assert.equal(pl.cogs, 6000);
assert.equal(pl.grossProfit, 2500);
assert.equal(pl.expenseTotal, 1200);
assert.equal(pl.losses, 1500);
assert.equal(pl.netProfit, -200);
assert.equal(pl.salesCount, 2);
assert.equal(pl.stockBought, 50000);
assert.deepEqual(pl.byPay, { Cash: 5500, 'M-Pesa': 3000 });
const itemProfitSum = pl.topItems.reduce((s, i) => s + i.profit, 0);
assert.equal(itemProfitSum, pl.grossProfit);

// Reorder: item sells 2/day over 30 days, lead 7, cover 30
const now = Date.now();
const many = Array.from({ length: 30 }, (_, i) => ({ ts: now - i * DAY - 1000, lines: [{ itemId: 'x', qty: 2 }] }));
const items = [
  { id: 'x', name: 'Rice', stock: 10, cost: 2000, price: 2500, packSize: 25, supplierId: 's1' },
  { id: 'y', name: 'Salt', stock: 0, cost: 300, price: 500, minStock: 5 },
  { id: 'z', name: 'Soap', stock: 50, cost: 800, price: 1000, minStock: 5 },
  { id: 'w', name: 'Old', stock: 0, active: false },
];
const plan = reorderPlan(items, many, { leadDays: 7, coverDays: 30, windowDays: 30 }, now);
const byId = Object.fromEntries(plan.map((p) => [p.item.id, p]));
assert.equal(plan.length, 3);
assert.equal(byId.x.reorderPoint, 14);
assert.equal(byId.x.status, 'low');
assert.equal(byId.x.target, 74);
assert.equal(byId.x.suggestQty, 75); // 64 rounded up to pack of 25
assert.equal(byId.y.status, 'out');
assert.equal(byId.y.suggestQty, 10); // min 5 → target 10
assert.equal(byId.z.status, 'ok');
assert.equal(plan[0].item.id, 'y');

const rfqs = draftRfqs(plan, [{ id: 's1', name: 'Bakhresa' }]);
assert.equal(rfqs.length, 2);
const r1 = rfqs.find((r) => r.supplierId === 's1');
assert.equal(r1.lines[0].qty, 75);
assert.equal(r1.estimate, 150000);
assert.equal(rfqs.find((r) => r.supplierId === '').supplierName, 'Any supplier');

assert.deepEqual(stockValue(items), { cost: 20000 + 40000, retail: 25000 + 50000, units: 60 });
assert.equal(monthKey(monthRange('2026-12')[1]), '2027-01');
// Discounts: amount or percentage, never more than the subtotal
assert.equal(parseDiscount('10%', 15000), 1500);
assert.equal(parseDiscount('500', 15000), 500);
assert.equal(parseDiscount('20000', 15000), 15000);
assert.equal(parseDiscount('', 15000), 0);
assert.equal(parseDiscount('-5', 15000), 0);

// VAT included in price
assert.equal(taxIncluded(11800, 18), 1800);
assert.equal(taxIncluded(11800, 0), 0);

// Refund 1 of 2 sugar from a sale with a 500 discount on 6000
const sale = { subtotal: 6000, total: 5500, discount: 500, lines: [{ itemId: 'a', name: 'Sugar', qty: 2, price: 1500, cost: 1000 }, { itemId: 'b', name: 'Oil', qty: 1, price: 3000, cost: 2000 }] };
const rf = refundTotals(sale, { a: 1 });
assert.equal(rf.lines.length, 1);
assert.equal(rf.lines[0].qty, -1);
assert.equal(rf.subtotal, -1500);
assert.equal(rf.total, -1375); // 1500 × 5500/6000
assert.equal(rf.cogs, -1000);
// Can't refund more than was sold or already refunded
const rf2 = refundTotals({ ...sale, refundedQty: { a: 2 } }, { a: 1, b: 5 });
assert.equal(rf2.lines.length, 1);
assert.equal(rf2.lines[0].itemId, 'b');
assert.equal(rf2.lines[0].qty, -1);

// P&L counts refunds separately and nets them out of sales
const refundDoc = { ts: oct + 3 * DAY, type: 'refund', pay: 'Cash', ...rf };
const pl2 = profitAndLoss({ sales: [...sales, refundDoc], expenses: [], adjustments: [] }, '2026-10');
assert.equal(pl2.salesCount, 2);
assert.equal(pl2.refunds, 1375);
assert.equal(pl2.grossSales, 9000);
assert.equal(pl2.revenue, 8500 - 1375);
assert.equal(pl2.cogs, 6000 - 1000);

// Breakdown by item, category, payment, staff, day
const range = monthRange('2026-10');
const cat = (id) => ({ a: 'Groceries', b: 'Groceries' }[id]);
const byItem = salesBreakdown([...sales, refundDoc], range, 'item', cat);
const sugar = byItem.find((r) => r.key === 'a');
assert.equal(sugar.qty, 1);
assert.equal(sugar.gross, 3000);
assert.equal(sugar.refunds, 1375);
assert.equal(sugar.net, 2750 - 1375);
const byCat = salesBreakdown([...sales, refundDoc], range, 'category', cat);
assert.equal(byCat.length, 1);
assert.equal(byCat[0].net, 8500 - 1375);
assert.equal(byCat[0].profit, (8500 - 1375) - (6000 - 1000));
const byPay = salesBreakdown([...sales, refundDoc], range, 'pay');
assert.equal(byPay.find((r) => r.key === 'Cash').net, 5500 - 1375);
assert.equal(byPay.find((r) => r.key === 'Cash').count, 1);
assert.equal(salesBreakdown(sales, range, 'day').length, 2);

// Orders fill up to the maximum: Correction pen 3 in stock, min 5, max 20 → order 17
const pen = reorderPlan([{ id: 'cp', name: 'Correction pen', stock: 3, minStock: 5, maxStock: 20 }], [], {}, now)[0];
assert.equal(pen.status, 'low');
assert.equal(pen.maxSet, true);
assert.equal(pen.suggestQty, 17);
const penRfq = draftRfqs([pen])[0].lines[0];
assert.equal(penRfq.qty, 17);
assert.equal(penRfq.fillTo, 20);
assert.equal(penRfq.maxSet, true);
// Negative stock: Bahasha A4 at −143, max 200 → order 343
assert.equal(reorderPlan([{ id: 'b', name: 'Bahasha A4', stock: -143, minStock: 10, maxStock: 200 }], [], {}, now)[0].suggestQty, 343);
// No maximum → flagged
assert.equal(reorderPlan([{ id: 'n', name: 'X', stock: 1, minStock: 5 }], [], {}, now)[0].maxSet, false);

console.log('All calculation tests passed');
