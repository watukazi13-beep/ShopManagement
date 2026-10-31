// Paying out from the till (staff food, transport…) and closing the day:
// what should be in the drawer and on each mobile-money line, what was counted, and the difference.
import { store } from '../store.js';
import { dayKey, num } from '../calc.js';
import { esc, fmt, fmtDate, fmtTime, icon, modal, toast, field, printHtml, toInputDate, fromInputDate } from '../ui.js';

const moneyMethods = () => (store.settings.payMethods || ['Cash']).filter((m) => !store.isCreditPay(m));
const diffText = (d) => (d == null ? '—' : d === 0 ? 'Matches' : `${d > 0 ? 'Over' : 'Short'} ${fmt(Math.abs(d))}`);
const diffCls = (d) => (d == null || d === 0 ? '' : d > 0 ? 'up' : 'neg');

/** Record money paid out during the day. Anyone working in the shop can do this. */
export function openPayout() {
  const cats = store.settings.payoutCategories || ['Food', 'Transport', 'Airtime', 'Cleaning', 'Other'];
  const methods = moneyMethods();
  modal({
    title: 'Pay out',
    body: `
      <p class="muted small">Money taken from the till or sent by mobile money for the shop's daily needs — staff food, transport, airtime. It is counted as an expense and taken off what should be in the drawer when the day is closed.</p>
      ${field('Amount (TSh)', '<input name="amount" type="number" inputmode="numeric" min="1" step="1" required autofocus>')}
      <div class="field"><span class="field-label">What for</span>
        <div class="chips wrap" id="po-cats">${cats.map((c, i) => `<label class="chip radio"><input type="radio" name="category" value="${esc(c)}" ${i === 0 ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></div>
      ${field('Paid from', `<select name="paidFrom">${methods.map((m) => `<option ${m === methods[0] ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`)}
      ${field('Note (optional)', '<input name="note" placeholder="e.g. lunch for 2 staff, bodaboda to supplier">')}
      ${store.can('reports') ? field('Date', `<input name="date" type="date" value="${toInputDate(Date.now())}">`) : ''}`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save pay-out</button>',
    onSubmit: (v) => {
      const ts = v.date ? Math.min(Date.now(), fromInputDate(v.date) + (dayKey(fromInputDate(v.date)) === dayKey() ? Date.now() - fromInputDate(v.date) : 12 * 3600000)) : Date.now();
      store.payout({ amount: v.amount, category: v.category, note: v.note, paidFrom: v.paidFrom, ts });
      toast(`${fmt(num(v.amount))} paid out for ${v.category}`);
    },
  });
}

/** Count the drawer and mobile money for a day and save it. */
export function openDayClose(day = dayKey()) {
  const prev = store.dayCloseFor(day);
  const opening = prev ? num(prev.openingCash) : store.openingCashFor(day);
  let f = store.dayFigures(day, opening);
  const rowsHtml = () => f.rows.map((r) => {
    const was = prev?.rows?.find((x) => x.method === r.method)?.counted;
    return `<tr data-m="${esc(r.method)}">
      <td><b>${esc(r.method)}</b><small>${[r.opening ? `start ${fmt(r.opening)}` : '', r.sales ? `sales ${fmt(r.sales)}` : '', r.payments ? `paid debts ${fmt(r.payments)}` : '', r.refunds ? `refunds −${fmt(r.refunds)}` : '', r.payouts ? `pay-outs −${fmt(r.payouts)}` : ''].filter(Boolean).join(' · ') || 'nothing today'}</small></td>
      <td class="r num">${fmt(r.expected)}</td>
      <td class="r"><input class="dc-count" type="number" inputmode="numeric" step="1" min="0" value="${was ?? ''}" placeholder="${r.expected}" aria-label="${esc(r.method)} counted"></td>
      <td class="r dc-diff"></td></tr>`;
  }).join('');
  modal({
    title: `Close the day · ${fmtDate(new Date(`${day}T12:00:00`).getTime())}`,
    wide: true,
    body: `
      ${prev ? `<p class="banner warn">Already closed at ${fmtTime(prev.closedAt)} by ${esc(prev.byName || prev.by)}. Saving again replaces it.</p>` : ''}
      <div class="stats compact">
        <div><span>Sales</span><strong>${fmt(f.total)}</strong></div>
        <div><span>Receipts</span><strong>${f.count}</strong></div>
        <div><span>On credit</span><strong>${fmt(f.creditSales)}</strong></div>
        <div><span>Paid out</span><strong>${fmt(f.payoutTotal)}</strong></div>
      </div>
      ${field('Cash in the drawer at the start of the day (TSh)', `<input name="openingCash" type="number" inputmode="numeric" step="1" min="0" value="${opening}">`, 'Left from the last closing — change it if it was different')}
      <p class="small">Count the cash and check each mobile-money balance received today, then type what you found. Leave a line empty if you have not checked it.</p>
      <table class="table dc-table"><thead><tr><th>Money</th><th class="r">Should be</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead>
        <tbody id="dc-rows">${rowsHtml()}</tbody>
        <tfoot><tr class="tot"><td>Total</td><td class="r num" id="dc-exp">${fmt(f.expected)}</td><td class="r num" id="dc-cnt"></td><td class="r" id="dc-tdiff"></td></tr></tfoot></table>
      ${f.payouts.length ? `<details class="more"><summary>Pay-outs today (${f.payouts.length})</summary><ul class="rows">${f.payouts.map((p) => `<li class="row"><div class="grow"><b>${esc(p.category)}</b><small>${esc(p.note || '')}${p.byName ? ' · ' + esc(p.byName) : ''} · from ${esc(p.paidFrom)}</small></div><span class="num">${fmt(p.amount)}</span></li>`).join('')}</ul></details>` : ''}
      <div class="grid2">
        ${field('Cash taken out (bank / owner)', `<input name="takenOut" type="number" inputmode="numeric" step="1" min="0" value="${prev?.takenOut || ''}" placeholder="0">`)}
        <div class="field"><span class="field-label">Left in the drawer for tomorrow</span><p class="big-total" id="dc-left"></p></div>
      </div>
      ${field('Note (optional)', `<input name="note" value="${esc(prev?.note || '')}" placeholder="e.g. 2,000 short — change given twice">`)}`,
    actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">${icon('check')}Close the day</button>`,
    onMount: (dlg) => {
      const form = dlg.querySelector('form');
      const upd = () => {
        f = store.dayFigures(day, num(form.openingCash.value));
        let cnt = 0, any = false, tdiff = 0;
        dlg.querySelectorAll('#dc-rows tr').forEach((tr) => {
          const r = f.rows.find((x) => x.method === tr.dataset.m);
          tr.querySelector('td:nth-child(2)').textContent = fmt(r.expected);
          const v = tr.querySelector('.dc-count').value;
          tr.querySelector('.dc-count').placeholder = r.expected;
          const d = v === '' ? null : Math.round(num(v) - r.expected);
          if (v !== '') { cnt += num(v); any = true; tdiff += d; }
          const cell = tr.querySelector('.dc-diff');
          cell.textContent = diffText(d); cell.className = `r dc-diff ${diffCls(d)}`;
        });
        dlg.querySelector('#dc-exp').textContent = fmt(f.expected);
        dlg.querySelector('#dc-cnt').textContent = any ? fmt(cnt) : '';
        const td = dlg.querySelector('#dc-tdiff');
        td.textContent = any ? diffText(tdiff) : ''; td.className = `r ${any ? diffCls(tdiff) : ''}`;
        const cashTr = dlg.querySelector(`#dc-rows tr[data-m="${CSS.escape(f.cashName)}"]`);
        const cashRow = f.rows.find((r) => r.method === f.cashName);
        const cashCounted = cashTr && cashTr.querySelector('.dc-count').value !== '' ? num(cashTr.querySelector('.dc-count').value) : num(cashRow?.expected);
        dlg.querySelector('#dc-left').textContent = fmt(cashCounted - num(form.takenOut.value));
      };
      dlg.addEventListener('input', upd);
      upd();
    },
    onSubmit: (v, { form }) => {
      const counted = {};
      form.querySelectorAll('#dc-rows tr').forEach((tr) => { counted[tr.dataset.m] = tr.querySelector('.dc-count').value; });
      const rec = store.closeDay(day, { counted, openingCash: num(v.openingCash), takenOut: v.takenOut, note: v.note });
      toast(rec.totalDiff === 0 ? 'Day closed — everything matches' : `Day closed — ${rec.totalDiff > 0 ? 'over' : 'short'} by ${fmt(Math.abs(rec.totalDiff))}`, { kind: rec.totalDiff < 0 ? 'warn' : 'ok', ms: 5000 });
      setTimeout(() => showDayClose(rec), 200);
    },
  });
}

/** A closed day: summary with print / WhatsApp. */
export function showDayClose(rec) {
  modal({
    title: `Shift and day closed · ${fmtDate(rec.ts)}`,
    wide: true,
    body: dayCloseHtml(rec, false),
    actions: `<button type="button" class="btn ghost" data-wa>${icon('wa')}WhatsApp</button><button type="button" class="btn ghost" data-print>${icon('print')}Print / PDF</button><button class="btn primary">Done</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('[data-print]').addEventListener('click', () => printHtml(`Day ${rec.day}`, dayCloseHtml(rec, true)));
      dlg.querySelector('[data-wa]').addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent(dayCloseText(rec))}`, '_blank', 'noopener'));
    },
  });
}

function dayCloseHtml(rec, forPrint) {
  const st = store.settings;
  return `
    ${forPrint ? `<div class="head"><div><h1>${esc(st.shopName)}</h1><div class="muted">${esc(st.address || '')}</div></div><div style="text-align:right"><h1>End of day</h1><div>${fmtDate(rec.ts)}<br>Closed ${fmtTime(rec.closedAt)} by ${esc(rec.byName || rec.by)}</div></div></div>` : `<p class="muted">Closed ${fmtTime(rec.closedAt)} by ${esc(rec.byName || rec.by)}</p>`}
    <table class="${forPrint ? '' : 'table'}"><tbody>
      <tr><td>Sales (${rec.count} receipt${rec.count === 1 ? '' : 's'})</td><td class="r">${fmt(rec.total)}</td></tr>
      <tr><td>Of which on credit</td><td class="r">${fmt(rec.creditSales)}</td></tr>
      <tr><td>Paid out (food, transport…)</td><td class="r">${fmt(rec.payoutTotal)}</td></tr>
    </tbody></table>
    <table class="${forPrint ? '' : 'table'}"><thead><tr><th>Money</th><th class="r">Should be</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead>
      <tbody>${rec.rows.map((r) => `<tr><td>${esc(r.method)}</td><td class="r">${fmt(r.expected)}</td><td class="r">${r.counted == null ? '—' : fmt(r.counted)}</td><td class="r ${forPrint ? '' : diffCls(r.difference)}">${diffText(r.difference)}</td></tr>`).join('')}
      <tr class="tot"><td>Total difference</td><td></td><td></td><td class="r">${diffText(rec.totalDiff)}</td></tr></tbody></table>
    <table class="${forPrint ? '' : 'table'}"><tbody>
      <tr><td>Cash at the start</td><td class="r">${fmt(rec.openingCash)}</td></tr>
      <tr><td>Cash taken out (bank / owner)</td><td class="r">${fmt(rec.takenOut)}</td></tr>
      <tr><td><b>Left in the drawer</b></td><td class="r"><b>${fmt(rec.leftInDrawer)}</b></td></tr>
    </tbody></table>
    ${(rec.payouts || []).length ? `<h2>Pay-outs</h2><table class="${forPrint ? '' : 'table'}"><tbody>${rec.payouts.map((p) => `<tr><td>${esc(p.category)}${p.note ? ` — ${esc(p.note)}` : ''}${p.byName ? ` <small class="muted">(${esc(p.byName)})</small>` : ''}</td><td class="r">${fmt(p.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${rec.note ? `<p><b>Note:</b> ${esc(rec.note)}</p>` : ''}
    ${forPrint ? '<div class="sig"><div>Closed by</div><div>Checked by (owner)</div></div>' : ''}`;
}

export function dayCloseText(rec) {
  return [
    `END OF DAY ${fmtDate(rec.ts)} — ${store.settings.shopName}`,
    `Sales: ${fmt(rec.total)} (${rec.count} receipts) · credit ${fmt(rec.creditSales)} · paid out ${fmt(rec.payoutTotal)}`,
    ...rec.rows.map((r) => `${r.method}: should be ${fmt(r.expected)}, counted ${r.counted == null ? '—' : fmt(r.counted)} → ${diffText(r.difference)}`),
    `Total difference: ${diffText(rec.totalDiff)}`,
    `Cash taken out: ${fmt(rec.takenOut)} · left in drawer: ${fmt(rec.leftInDrawer)}`,
    ...(rec.note ? [`Note: ${rec.note}`] : []),
    `Closed by ${rec.byName || rec.by} at ${fmtTime(rec.closedAt)}`,
  ].join('\n');
}

/** The Home card: today's money and the Close the day button. */
export function todayCard() {
  const day = dayKey();
  const rec = store.lastClosing() && (store.lastClosing().day || store.lastClosing().id) === day ? store.lastClosing() : null;
  const f = store.dayFigures(day);
  const top = f.rows.filter((r) => r.expected || r.sales).slice(0, 4);
  return `
    <section class="card day-card">
      <div class="card-head"><h2>Today's money</h2>${rec ? `<span class="pill ${rec.totalDiff < 0 ? 'bad' : 'good'}">Closed ${fmtTime(rec.closedAt)} · ${diffText(rec.totalDiff)}</span>` : ''}</div>
      <div class="stats compact">${(top.length ? top : f.rows.slice(0, 2)).map((r) => `<div><span>${esc(r.method)}</span><strong>${fmt(r.expected)}</strong></div>`).join('')}
        <div><span>Paid out</span><strong>${fmt(f.payoutTotal)}</strong></div></div>
      <div class="row-btns">
        <button type="button" class="btn ghost" data-act="payout">${icon('cash')}Pay out</button>
        ${rec ? '<button type="button" class="btn ghost" data-act="dayclose-view">View closing</button>' : ''}
      </div>
    </section>`;
}

/**
 * Close shift = close the day. One count for the whole drawer: every way of paying, pay-outs,
 * cash put in or taken out during the shift, cash taken to the bank/owner, and what is left for tomorrow.
 */
export function openCloseShift(sh = store.myOpenShift(), { onDone, summary = true } = {}) {
  if (!sh) return;
  let f = store.shiftDayFigures(sh);
  const day = f.day;
  const parts = (r) => [r.opening ? `start ${fmt(r.opening)}` : '', r.sales ? `sales ${fmt(r.sales)}` : '', r.payments ? `paid debts ${fmt(r.payments)}` : '', r.cashIn ? `put in ${fmt(r.cashIn)}` : '',
    r.refunds ? `refunds −${fmt(r.refunds)}` : '', r.payouts ? `pay-outs −${fmt(r.payouts)}` : '', r.cashOut ? `taken out −${fmt(r.cashOut)}` : ''].filter(Boolean).join(' · ') || 'nothing today';
  modal({
    title: `Close shift · ${fmtDate(new Date(`${day}T12:00:00`).getTime())}`,
    wide: true,
    body: `
      <p class="small">Shift opened ${day !== dayKey() ? `${esc(fmtDate(sh.ts))} ` : ''}${fmtTime(sh.ts)} by <b>${esc(sh.byName || '')}</b>. Closing the shift also closes the day.</p>
      <div class="stats compact">
        <div><span>Sales</span><strong>${fmt(f.total)}</strong></div>
        <div><span>Receipts</span><strong>${f.count}</strong></div>
        <div><span>On credit</span><strong>${fmt(f.creditSales)}</strong></div>
        <div><span>Paid out</span><strong>${fmt(f.payoutTotal)}</strong></div>
      </div>
      <p class="small"><b>Count all the cash in the drawer</b> (including the opening cash) and check each mobile-money balance received today. Cash must be counted; leave a mobile-money line empty if you have not checked it.</p>
      <table class="table dc-table"><thead><tr><th>Money</th><th class="r">Should be</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead>
        <tbody id="dc-rows">${f.rows.map((r) => `<tr data-m="${esc(r.method)}">
          <td><b>${esc(r.method)}</b><small>${parts(r)}</small></td>
          <td class="r num">${fmt(r.expected)}</td>
          <td class="r"><input class="dc-count" type="number" inputmode="numeric" step="1" min="0" ${r.method === f.cashName ? 'required' : ''} placeholder="${r.method === f.cashName ? 'Count' : '—'}" aria-label="${esc(r.method)} counted"></td>
          <td class="r dc-diff"></td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td>Total</td><td class="r num">${fmt(f.expected)}</td><td class="r num" id="dc-cnt"></td><td class="r" id="dc-tdiff"></td></tr></tfoot></table>
      ${f.payouts.length ? `<details class="more"><summary>Pay-outs (${f.payouts.length})</summary><ul class="rows">${f.payouts.map((p) => `<li class="row"><div class="grow"><b>${esc(p.category)}</b><small>${esc(p.note || '')}${p.byName ? ' · ' + esc(p.byName) : ''} · from ${esc(p.paidFrom)}</small></div><span class="num">${fmt(p.amount)}</span></li>`).join('')}</ul></details>` : ''}
      <div class="grid2">
        ${field('Cash taken out (bank / owner)', '<input name="takenOut" type="number" inputmode="numeric" step="1" min="0" placeholder="0">')}
        <div class="field"><span class="field-label">Left in the drawer for tomorrow</span><p class="big-total" id="dc-left">—</p></div>
      </div>
      ${field('Note (optional)', '<input name="note" placeholder="e.g. 2,000 short — change given twice">')}
      <p class="pin-err" id="dc-err" role="alert"></p>`,
    actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">${icon('check')}Close shift</button>`,
    onMount: (dlg) => {
      const form = dlg.querySelector('form');
      const upd = () => {
        f = store.shiftDayFigures(sh);
        let cnt = 0, any = false, tdiff = 0, cashCounted = null;
        dlg.querySelectorAll('#dc-rows tr').forEach((tr) => {
          const r = f.rows.find((x) => x.method === tr.dataset.m);
          if (!r) return;
          const v = tr.querySelector('.dc-count').value;
          const d = v === '' ? null : Math.round(num(v) - r.expected);
          if (v !== '') { cnt += num(v); any = true; tdiff += d; }
          if (r.method === f.cashName && v !== '') cashCounted = num(v);
          const cell = tr.querySelector('.dc-diff');
          cell.textContent = v === '' ? (r.method === f.cashName ? '' : 'Not checked') : diffText(d); cell.className = `r dc-diff ${diffCls(d)}`;
        });
        dlg.querySelector('#dc-cnt').textContent = any ? fmt(cnt) : '';
        const td = dlg.querySelector('#dc-tdiff');
        td.textContent = any ? diffText(tdiff) : ''; td.className = `r ${any ? diffCls(tdiff) : ''}`;
        dlg.querySelector('#dc-left').textContent = cashCounted === null ? '—' : fmt(cashCounted - num(form.takenOut.value));
      };
      dlg.addEventListener('input', upd);
      upd();
      setTimeout(() => dlg.querySelector('.dc-count[required]')?.focus(), 80);
    },
    onSubmit: (v, { form }) => {
      const counted = {};
      form.querySelectorAll('#dc-rows tr').forEach((tr) => { counted[tr.dataset.m] = tr.querySelector('.dc-count').value; });
      const rec = store.closeShiftDay(sh, { counted, takenOut: num(v.takenOut), note: v.note });
      toast(rec.totalDiff === 0 ? 'Shift closed — everything matches' : `Shift closed — ${rec.totalDiff > 0 ? 'over' : 'short'} by ${fmt(Math.abs(rec.totalDiff))}`, { kind: rec.totalDiff < 0 ? 'warn' : 'ok', ms: 6000 });
      setTimeout(() => { if (summary) showDayClose(rec); onDone?.(rec); }, 250);
    },
  });
}
