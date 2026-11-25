// Home dashboard (4.14): the shift on top (who, since when, money in the drawer, Close shift),
// today's figures as tiles, the last 7 days as bars, and the latest shifts with their money.
import { store } from '../store.js';
import { daySummary, dayKey, num } from '../calc.js';
import { esc, fmt, fmtDate, fmtTime, icon } from '../ui.js';
import { closeTime } from './shiftgate.js';
import { punctualPills } from './punctual.js';

const DAY = 86400000;
const dayOf = (s) => s.date || dayKey(s.ts);
const closingOf = (s) => store.data.dayclose.find((d) => d.shiftId === s.id || d.id === s.dayCloseId) || null;
const diffPill = (d, closedAt) => {
  const v = num(d);
  const t = v === 0 ? 'matches' : v < 0 ? `short ${fmt(-v)}` : `over ${fmt(v)}`;
  return `<span class="pill ${v < 0 ? 'bad' : v > 0 ? 'warn' : 'good'}">${closedAt ? `Closed ${fmtTime(closedAt)} · ` : ''}${t}</span>`;
};

/** The shift that matters now: mine if I have one open, else the shop's latest open shift. */
export function currentShift() {
  const mine = store.myOpenShift();
  if (mine) return mine;
  if (!store.can('orders')) return null;
  return store.data.shifts.filter((s) => !s.closedAt).sort((a, b) => b.ts - a.ts)[0] || null;
}

/** Money in the drawer right now, and what came in today by each way of paying. */
export function drawerNow() {
  const sh = currentShift();
  const f = sh ? store.shiftDayFigures(sh) : store.dayFigures(dayKey());
  const cash = f.rows.find((r) => r.method === f.cashName) || { expected: 0, sales: 0 };
  const other = f.rows.filter((r) => r.method !== f.cashName && (r.sales || r.payments));
  return { sh, f, cash: num(cash.expected), cashName: f.cashName, other };
}

/** Top of Home: the shift now, the drawer, Close shift / Open shift / Pay out. */
export function shiftNowCard() {
  const { sh, cash, cashName, other } = drawerNow();
  const today = dayKey();
  const rec = store.lastClosing();
  const closedToday = !sh && rec && (rec.day || rec.id) === today ? rec : null;
  const stale = sh && dayOf(sh) !== today;
  const late = sh && !stale && Date.now() >= (() => { const [h, m] = closeTime().split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); })();
  const mine = sh && sh.id === store.myOpenShift()?.id;
  const canClose = sh && (mine || store.can('orders'));
  const status = sh
    ? `<span class="pill ${stale || late ? 'bad' : 'good'}">${stale ? `Still open from ${fmtDate(sh.ts)}` : late ? `Close by ${closeTime()}` : 'Open now'}</span>`
    : closedToday ? diffPill(closedToday.totalDiff, closedToday.closedAt) : '<span class="pill">No shift open</span>';
  const who = sh ? `<b data-no-tr>${esc(sh.byName || sh.by || '')}</b><small>Opened ${stale ? `${fmtDate(sh.ts)} ` : ''}${fmtTime(sh.ts)} · started with ${fmt(sh.openingCash)}${sh.openGeo ? ` · ${sh.openGeo.d} m from the shop` : ''}</small><span class="sn-punct">${punctualPills(sh)}</span>`
    : closedToday ? `<b data-no-tr>${esc(closedToday.byName || '')}</b><small>Closed the shift at ${fmtTime(closedToday.closedAt)} · ${fmt(closedToday.takenOut)} taken out</small>`
      : '<b>No shift yet today</b><small>The shift opens when the first person starts work</small>';
  return `
    <section class="card day-card shift-now ${stale || late ? 'is-late' : ''}">
      <div class="sn-top">
        <div class="sn-who">${icon('clock')}<div>${who}</div></div>
        ${status}
      </div>
      <div class="sn-main">
        <div class="sn-drawer">
          <span>${closedToday ? 'Left in the drawer' : 'Money in the drawer now'}</span>
          <strong>${fmt(closedToday ? closedToday.leftInDrawer : cash)}</strong>
          <small>${esc(cashName)}${closedToday ? ' · counted at closing' : ' · should be there now'}</small>
        </div>
        ${other.length ? `<div class="sn-other">${other.map((r) => `<div><span>${esc(r.method)}</span><b>${fmt(r.sales + r.payments)}</b></div>`).join('')}</div>` : ''}
      </div>
      <div class="row-btns">
        ${canClose ? `<button type="button" class="btn ${stale || late ? 'danger' : 'primary'}" data-act="close-shift">${icon('check')}${mine ? 'Close shift' : `Close ${esc((sh.byName || 'their').split(/\s+/)[0])}'s shift`}</button>` : ''}
        ${!sh && store.settings.useShifts !== false ? `<button type="button" class="btn primary" data-act="open-shift">${icon('clock')}Open shift</button>` : ''}
        <button type="button" class="btn ghost" data-act="payout">${icon('cash')}Pay out</button>
        ${closedToday ? '<button type="button" class="btn ghost" data-act="dayclose-view">View closing</button>' : ''}
      </div>
    </section>`;
}

/** Today in tiles. Sellers don't see profit. */
export function todayTiles() {
  const exp = store.data.expenses.filter((e) => !e.deleted && dayKey(e.ts) === dayKey()).reduce((x, e) => x + num(e.amount), 0);
  const df = store.dayFigures(dayKey());
  const fromDrawer = num((df.rows.find((r) => r.method === df.cashName) || {}).payouts);
  const otherCosts = Math.max(0, exp - fromDrawer);
  const { other } = drawerNow();
  const otherTotal = other.reduce((x, r) => x + num(r.sales) + num(r.payments), 0);
  // Today so far against the same day last week, up to the same time.
  const now = Date.now();
  const lwEnd = now - 7 * DAY, lwStart = new Date(`${dayKey(lwEnd)}T00:00:00`).getTime();
  const lw = store.data.sales.filter((x) => !x.voided && x.ts >= lwStart && x.ts <= lwEnd).reduce((t, x) => t + num(x.total), 0);
  const td = daySummary(store.data.sales).revenue;
  const pct = lw ? Math.round(((td - lw) / lw) * 100) : null;
  const cashName = (store.settings.payMethods || ['Cash']).find((m) => m.toLowerCase() === 'cash') || 'Cash';
  const otherNames = (store.settings.payMethods || []).filter((m) => m !== cashName && !store.isCreditPay(m));
  const otherTile = other.length
    ? [other.length === 1 ? `${other[0].method} today` : 'Other money today', fmt(otherTotal), other.length === 1 ? 'not in the drawer' : other.map((r) => `${r.method} ${fmt(num(r.sales) + num(r.payments)).replace(/^TSh\s*/, '')}`).join(' · '), '']
    : otherNames.length ? [otherNames.length === 1 ? `${otherNames[0]} today` : 'Other money today', fmt(0), otherNames.length === 1 ? 'nothing yet today' : otherNames.join(', '), ''] : null;
  const tiles = [
    ['Same time last week', fmt(lw), pct === null ? (td ? 'no sales then' : '—') : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% today`, pct === null ? '' : pct >= 0 ? 'up' : 'down'],
    ...(otherTile ? [otherTile] : []),
    ['Paid from the drawer', fmt(fromDrawer), 'pay-outs today', ''],
    ...(store.can('reports') ? [['Other costs today', fmt(otherCosts), 'not from the drawer', '']] : []),
  ];
  return `<div class="kpis">${tiles.map(([l, v, s, c]) => `<div class="kpi ${c}"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`).join('')}</div>`;
}

/** Sales in the last 7 days as bars. */
export function weekCard() {
  const days = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * DAY));
  const vals = days.map((d) => daySummary(store.data.sales, d).revenue);
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, b) => a + b, 0);
  const short = (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : String(v));
  const wd = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
  return `
    <section class="card week-card">
      <div class="card-head"><h2>Last 7 days</h2><span class="muted small">${fmt(total)} · average ${fmt(Math.round(total / 7))} a day</span></div>
      ${total ? '' : '<p class="muted week-empty">No sales in the last 7 days yet.</p>'}
      <div class="bars ${total ? '' : 'empty'}" role="img" aria-label="Sales in the last 7 days">${days.map((d, i) => `
        <div class="bar ${i === 6 ? 'today' : ''}" title="${fmtDate(new Date(`${d}T12:00:00`).getTime())}: ${fmt(vals[i])}">
          <em>${vals[i] ? short(vals[i]) : ''}</em>
          <i style="height:${Math.max(vals[i] ? 4 : 0, Math.round((vals[i] / max) * 100))}%"></i>
          <span>${i === 6 ? 'Today' : wd(d)}</span>
        </div>`).join('')}</div>
    </section>`;
}

/** Which shifts are opened up on Home (kept while Home redraws). */
export const openShifts = new Set();
let showAllShifts = false;
export const showMoreShifts = () => { showAllShifts = true; };

/** The latest shifts with their money: sales by way of paying, cash should be / counted, taken out, left. */
export function latestShiftsCard(limit = 7) {
  if (!store.can('orders')) return '';
  const list = [...store.data.shifts].sort((a, b) => b.ts - a.ts).slice(0, limit);
  const today = dayKey();
  const item = (s) => {
    const rec = s.closedAt ? closingOf(s) : null;
    const live = s.closedAt ? null : store.shiftDayFigures(s);
    const rows = rec?.rows || live?.rows || [];
    const pays = rows.filter((r) => r.sales || r.payments).map((r) => `<span>${esc(r.method)} <b>${fmt(num(r.sales) + num(r.payments))}</b></span>`).join('');
    const total = rec ? num(rec.total) : live ? num(live.total) : 0;
    const cash = rows.find((r) => r.method === (live?.cashName || 'Cash')) || rows[0] || {};
    const reopen = s.closedAt && dayOf(s) === today ? `<button type="button" class="btn ghost small" data-reopen="${s.id}">Reopen</button>` : '';
    const status = s.closedAt ? diffPill(s.difference) : `<span class="pill ${dayOf(s) !== today ? 'bad' : 'good'}">${dayOf(s) !== today ? 'Still open' : 'Open now'}</span>`;
    const ix = list.indexOf(s);
    return `<li class="ls-li ${ix >= 3 ? 'ls-extra' : ''}"><details class="ls-item" data-ls="${s.id}" ${openShifts.has(s.id) ? 'open' : ''}>
      <summary class="ls-head">
        <div class="grow"><b><span data-no-tr>${esc(s.byName || s.by || 'Someone')}</span> · ${dayOf(s) === today ? 'Today' : fmtDate(s.ts)}</b>
          <small>${fmtTime(s.ts)} – ${s.closedAt ? fmtTime(s.closedAt) : 'now'}</small></div>
        <span class="ls-sales num">${fmt(total)}</span>
        ${status}${punctualPills(s)}${reopen}
      </summary>
      <div class="ls-body">
        <div class="ls-grid">
          <div><span>Started with</span><b>${fmt(s.openingCash)}</b></div>
          <div><span>Cash should be</span><b>${fmt(s.closedAt ? s.expectedCash : cash.expected)}</b></div>
          <div><span>Cash counted</span><b>${s.closedAt ? fmt(s.countedCash) : '—'}</b></div>
          <div><span>Taken out</span><b>${s.closedAt ? fmt(s.takenOut) : '—'}</b></div>
          <div><span>Left in drawer</span><b>${s.closedAt ? fmt(s.leftInDrawer) : '—'}</b></div>
        </div>
        ${pays ? `<div class="ls-pays">${pays}</div>` : ''}
        ${rec ? `<button type="button" class="btn ghost small" data-closing="${esc(rec.id)}">View full closing</button>` : ''}
      </div>
    </details></li>`;
  };
  return `
    <section class="card shifts-card">
      <div class="card-head"><h2>Latest shifts</h2><a class="link" href="#/money?tab=days">All closings</a></div>
      ${list.length ? `<ul class="ls-list ${showAllShifts ? 'all' : ''}">${list.map(item).join('')}</ul>
        ${list.length > 3 && !showAllShifts ? `<button type="button" class="btn ghost block ls-more" data-act="more-shifts">Show ${list.length - 3} more</button>` : ''}` : '<p class="muted small">No shifts yet.</p>'}
      ${list.length ? '<p class="muted small ls-hint">Tap a shift to see its money.</p>' : ''}
    </section>`;
}
