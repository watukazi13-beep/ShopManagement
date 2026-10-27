// Sellers open a shift before they can use the app, and are reminded to close it in the evening.
//  - Morning screen: count the cash in the drawer → Open shift. Nothing else shows until then.
//    A shift left open from an earlier day must be closed (counted) first.
//  - From the close time (default 19:30): a red bar on every page, and a reminder every 15 minutes
//    (a phone notification when the app is in the background) until the shift is closed.
//  - Home (owner / manager): who opened today, when, and how each shift closed.
import { store } from '../store.js';
import { dayKey, num } from '../calc.js';
import { esc, fmt, fmtDate, fmtTime, icon, toast } from '../ui.js';
import { isSharedTill } from './staff.js';
import { openCloseShift } from './sell.js';

const REMIND_EVERY = 15 * 60 * 1000;
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };

/** Sellers must open a shift (setting on by default). Owners and managers may, but don't have to. */
export const shiftRequired = () => store.settings.sellerMustOpenShift !== false && store.effectiveRole() === 'staff';
export const closeTime = () => (/^\d{1,2}:\d{2}$/.test(store.settings.closeShiftAt || '') ? store.settings.closeShiftAt : '19:30');
function closeTs(ts = Date.now()) {
  const [h, m] = closeTime().split(':').map(Number);
  const d = new Date(ts);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
const firstName = () => (store.whoName() || '').split(/\s+/)[0];
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** What the morning screen should show now: null (nothing), 'open', or 'stale' (an earlier day's shift is still open). */
export function gateState() {
  if (!store.ready || !store._loaded.has('shifts') || !shiftRequired()) return null;
  if (isSharedTill() && !store.activeStaff) return null; // the PIN screen comes first
  const sh = store.myOpenShift();
  if (!sh) return { mode: 'open' };
  if ((sh.date || dayKey(sh.ts)) !== dayKey()) return { mode: 'stale', sh };
  return null;
}

/** The evening reminder for whoever has a shift open: null, or { text, stale }. */
export function reminderState() {
  if (!store.ready) return null;
  const sh = store.myOpenShift();
  if (!sh) return null;
  if ((sh.date || dayKey(sh.ts)) !== dayKey()) return { sh, stale: true, text: `Your shift from ${fmtDate(sh.ts)} is still open — count the cash and close it` };
  if (Date.now() >= closeTs()) return { sh, text: `It's past ${closeTime()} — time to close your shift` };
  return null;
}

let gateEl = null, gateKey = '', hooks = {};

/** Show, change or remove the morning screen. Called whenever the shop data changes. */
export function checkShiftGate(h = hooks) {
  hooks = h;
  const st = gateState();
  const key = st ? `${st.mode}:${st.sh?.id || ''}:${store.activeStaff?.id || ''}` : '';
  if (key === gateKey) return;
  gateKey = key;
  gateEl?.remove();
  gateEl = null;
  document.body.classList.toggle('shift-gated', !!st);
  if (!st) return;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  gateEl = document.createElement('div');
  gateEl.id = 'shift-gate';
  gateEl.setAttribute('role', 'dialog');
  gateEl.setAttribute('aria-modal', 'true');
  gateEl.setAttribute('aria-label', st.mode === 'open' ? 'Open your shift' : 'Close the earlier shift');
  const shop = esc(store.settings.shopName || store.shop?.name || 'Shop');
  const links = `<div class="sg-links">${isSharedTill() ? '<button type="button" data-switch>Change person</button>' : ''}<button type="button" data-signout>Sign out</button></div>`;
  if (st.mode === 'open') {
    gateEl.innerHTML = `
      <form class="lock-card sg-card" novalidate>
        <img src="brand/book-icon.svg" alt="" width="56" height="56">
        <p class="muted">${shop} · ${fmtDate(Date.now())}</p>
        <h1>${greeting()}${firstName() ? `, ${esc(firstName())}` : ''}</h1>
        <p class="muted">Open your shift to start selling. Count the money in the drawer first.</p>
        <label class="sg-field"><span>Cash in the drawer now (TSh)</span>
          <input name="cash" type="number" inputmode="numeric" min="0" step="1" required placeholder="e.g. 20000"></label>
        <p class="pin-err" id="sg-err" role="alert"></p>
        <button class="btn accent big block">${icon('check')}Open shift</button>
        <p class="muted small">You'll be reminded to close it at ${closeTime()}.</p>
        ${links}
      </form>`;
  } else {
    const f = store.shiftFigures(st.sh);
    gateEl.innerHTML = `
      <form class="lock-card sg-card" novalidate>
        <img src="brand/book-icon.svg" alt="" width="56" height="56">
        <h1>Close the earlier shift first</h1>
        <p class="muted">Your shift from <b>${fmtDate(st.sh.ts)} ${fmtTime(st.sh.ts)}</b> was not closed. Count the cash in the drawer and close it, then open today's shift.</p>
        <div class="sg-expect"><span>Expected in the drawer</span><b>${fmt(f.expected)}</b></div>
        <label class="sg-field"><span>Cash counted (TSh)</span>
          <input name="counted" type="number" inputmode="numeric" min="0" step="1" required></label>
        <p class="sg-diff" id="sg-diff"></p>
        <label class="sg-field"><span>Note (optional)</span><input name="note" placeholder="e.g. forgot to close last night"></label>
        <p class="pin-err" id="sg-err" role="alert"></p>
        <button class="btn accent big block">Close that shift</button>
        ${links}
      </form>`;
    gateEl.addEventListener('input', () => {
      const v = gateEl.querySelector('[name=counted]').value;
      const diff = num(v) - f.expected;
      gateEl.querySelector('#sg-diff').textContent = v === '' ? '' : diff === 0 ? 'Drawer matches.' : diff > 0 ? `${fmt(diff)} more than expected.` : `${fmt(-diff)} short.`;
    });
  }
  const form = gateEl.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = gateEl.querySelector('#sg-err');
    try {
      if (st.mode === 'open') {
        const v = form.cash.value;
        if (v === '' || num(v) < 0) throw new Error('Type the cash in the drawer (0 if empty)');
        store.openShift(num(v));
        askNotify();
        toast(`Shift opened — have a good day${firstName() ? `, ${firstName()}` : ''}`);
      } else {
        const v = form.counted.value;
        if (v === '' || num(v) < 0) throw new Error('Type the cash you counted');
        const r = store.closeShift(st.sh, num(v), form.note.value.trim() || 'Closed the next time the app was opened');
        toast(r.difference === 0 ? 'Earlier shift closed — drawer matches' : `Earlier shift closed — ${r.difference > 0 ? 'over' : 'short'} by ${fmt(Math.abs(r.difference))}`);
      }
      setTimeout(() => checkShiftGate(), 50);
    } catch (ex) { err.textContent = ex.message; }
  });
  gateEl.querySelector('[data-signout]').addEventListener('click', () => hooks.signOut?.());
  gateEl.querySelector('[data-switch]')?.addEventListener('click', () => hooks.switchUser?.());
  document.body.appendChild(gateEl);
  setTimeout(() => gateEl?.querySelector('input')?.focus(), 50);
}

/** Opening the shift is a tap, so the browser lets us ask for phone notifications here. */
function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
}

/** Red bar under the top bar, on every page, while a reminder is due. */
export function paintShiftBar() {
  const bar = document.getElementById('shift-bar');
  if (!bar) return;
  const st = gateEl ? null : reminderState();
  document.body.classList.toggle('has-shift-bar', !!st);
  const html = st ? `<span>${icon('clock')}${esc(st.text)}</span><button type="button" class="btn small" data-close-shift-now>Close shift</button>` : '';
  if (bar.innerHTML === html) return;
  bar.innerHTML = html;
  bar.hidden = !st;
  bar.querySelector('[data-close-shift-now]')?.addEventListener('click', () => openCloseShift(st.sh));
}

let ticker = null;
/** Every 30 seconds: repaint the bar, and remind again every 15 minutes until the shift is closed. */
export function startShiftReminders() {
  if (ticker) return;
  const tick = () => {
    paintShiftBar();
    const st = gateEl ? null : reminderState();
    if (!st) return;
    const key = `shift-remind:${st.sh.id}`;
    if (Date.now() - num(LS(key)) < REMIND_EVERY) return;
    LS(key, String(Date.now()));
    store._notify('Close your shift', st.stale ? `Your shift from ${fmtDate(st.sh.ts)} is still open. Count the cash and close it.` : `It's past ${closeTime()}. Count the cash in the drawer and close your shift.`, '#/sell');
  };
  ticker = setInterval(tick, 30000);
  setTimeout(tick, 3000);
}

/** Home, for owners and managers: today's shifts. */
export function shiftsTodayCard() {
  if (!store.can('orders') || !(store.settings.sellerMustOpenShift !== false || store.settings.useShifts)) return '';
  const today = dayKey();
  const list = store.data.shifts.filter((s) => (s.date || dayKey(s.ts)) === today || !s.closedAt).sort((a, b) => a.ts - b.ts);
  const late = Date.now() >= closeTs();
  const row = (s) => {
    const who = esc(s.byName || s.by || 'Someone');
    const opened = `${(s.date || dayKey(s.ts)) === today ? '' : `${fmtDate(s.ts)} `}${fmtTime(s.ts)}`;
    const status = s.closedAt
      ? `<span class="pill ${num(s.difference) < 0 ? 'bad' : num(s.difference) > 0 ? 'warn' : 'good'}">Closed ${fmtTime(s.closedAt)} · ${num(s.difference) === 0 ? 'matches' : num(s.difference) < 0 ? `short ${fmt(-num(s.difference))}` : `over ${fmt(num(s.difference))}`}</span>`
      : `<span class="pill ${late || (s.date || dayKey(s.ts)) !== today ? 'bad' : 'good'}">${late || (s.date || dayKey(s.ts)) !== today ? 'Still open' : 'Open'}</span>`;
    return `<li class="row"><div class="grow"><b>${who}</b><small>Opened ${opened} · cash ${fmt(s.openingCash)}</small></div>${status}</li>`;
  };
  return `
    <section class="card shifts-card">
      <div class="card-head"><h2>Shifts today</h2><span class="muted small">Close by ${closeTime()}</span></div>
      ${list.length ? `<ul class="rows">${list.map(row).join('')}</ul>` : '<p class="muted small">No shift opened yet today.</p>'}
    </section>`;
}
