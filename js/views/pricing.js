// When goods arrive at a higher cost: show which selling prices no longer give the margin they did,
// suggest new prices (same margin, rounded up to TSh 50), and update the ones you tick.
import { store } from '../store.js';
import { num } from '../calc.js';
import { esc, fmt, modal, toast } from '../ui.js';

const roundUp = (v, step = 50) => Math.ceil(v / step) * step;
const pct = (price, cost) => (price > 0 ? Math.round(((price - cost) / price) * 100) : 0);

/** Suggested selling price for a new cost: keep the old margin, never below cost + 10%. */
export function suggestPrice(item, newCost, oldCost) {
  const price = num(item.price), old = num(oldCost ?? (item.lastCost || item.cost));
  const target = num(store.settings.targetMargin) || 30;
  let p = price > 0 && old > 0 ? price * (newCost / old) : newCost / (1 - target / 100);
  p = Math.max(p, newCost * 1.1);
  return roundUp(p, newCost >= 1000 ? 100 : 50);
}

/** Remember each item's cost before a delivery is saved (saving overwrites it). */
export function costsBefore(rows) {
  return rows.map((r) => { const it = store.item(r.itemId); return { ...r, oldCost: num(it?.lastCost || it?.cost) }; });
}

/**
 * rows: [{ itemId, newCost, oldCost }] — cost per piece of what just arrived, taken BEFORE the delivery is saved.
 * Opens the review only for items that got dearer (more than 2%) or would now sell at a loss.
 */
export function reviewPrices(rows) {
  const list = [];
  for (const r of rows) {
    const it = store.item(r.itemId);
    if (!it || it.variablePrice || it.service || !(num(r.newCost) > 0)) continue;
    const old = num(r.oldCost ?? (it.lastCost || it.cost));
    const dearer = old > 0 && r.newCost > old * 1.02;
    const loss = num(it.price) > 0 && r.newCost >= num(it.price);
    if (!dearer && !loss) continue;
    list.push({ it, old, cost: num(r.newCost), price: num(it.price), suggest: suggestPrice(it, num(r.newCost), old) });
  }
  if (!list.length || !store.can('editItems')) return;
  setTimeout(() => modal({
    title: 'Prices to review',
    wide: true,
    body: `
      <p class="small">These arrived at a higher cost. Your margin drops unless the selling price goes up. The suggested price keeps the margin you had (rounded up).</p>
      <table class="table pr-table"><thead><tr><th>Item</th><th class="r">Cost</th><th class="r">Margin now</th><th class="r">New price</th><th></th></tr></thead>
      <tbody>${list.map((x, i) => `<tr data-i="${i}">
        <td><b>${esc(x.it.name)}</b><small>was ${fmt(x.old)} · price ${fmt(x.price)}</small></td>
        <td class="r num">${fmt(x.cost)}</td>
        <td class="r num ${pct(x.price, x.cost) < 10 ? 'neg' : ''}">${pct(x.price, x.cost)}%</td>
        <td class="r"><input class="pr-new" type="number" inputmode="numeric" step="1" min="0" value="${x.suggest}" aria-label="New price for ${esc(x.it.name)}"><small class="pr-m">${pct(x.suggest, x.cost)}% margin</small></td>
        <td><input type="checkbox" class="pr-on" checked aria-label="Update ${esc(x.it.name)}"></td></tr>`).join('')}</tbody></table>`,
    actions: '<button class="btn ghost" value="cancel">Keep prices</button><button class="btn primary">Update ticked prices</button>',
    onMount: (dlg) => dlg.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr || !e.target.classList.contains('pr-new')) return;
      const x = list[Number(tr.dataset.i)];
      tr.querySelector('.pr-m').textContent = `${pct(num(e.target.value), x.cost)}% margin`;
    }),
    onSubmit: (v, { form }) => {
      const changes = [...form.querySelectorAll('tr[data-i]')].filter((tr) => tr.querySelector('.pr-on').checked)
        .map((tr) => ({ id: list[Number(tr.dataset.i)].it.id, price: num(tr.querySelector('.pr-new').value) }))
        .filter((c) => c.price > 0);
      if (!changes.length) return;
      store.setPrices(changes);
      toast(`${changes.length} price${changes.length === 1 ? '' : 's'} updated`);
    },
  }), 400);
}
