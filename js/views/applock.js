// App lock: nobody sees anything in the app until they type their PIN.
//  - Asked when the app opens, and again after it has been away (in the background) for 5 minutes.
//  - Owners and managers with no PIN yet create one here; sellers with none are told to ask the owner.
//  - 5 wrong PINs in a row: wait 1 minute before trying again (kept on this device).
//  - A shared till already asks each person for their staff PIN, so this lock stays out of its way.
import { store } from '../store.js';
import { langSwitch } from '../i18n.js';
import { esc, toast } from '../ui.js';
import { isSharedTill } from './staff.js';

export const AWAY_MS = 5 * 60 * 1000;
const MAX_TRIES = 5;
const WAIT_MS = 60 * 1000;
const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { return null; } return null; };
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } return null; };

let el = null, hooks = {}, started = false, armed = false;
let mode = '', pin = '', first = '', busy = false;

/** Still unlocked from a moment ago (a reload or a new version), as long as it wasn't away 5 minutes. */
const me = () => String(store.user?.email || '').toLowerCase();
function unlocked() {
  let v = null;
  try { v = JSON.parse(SS('app-unlocked') || 'null'); } catch { v = null; }
  return !!v && v.u === me() && Date.now() - Number(v.at || 0) < AWAY_MS;
}
const mark = () => SS('app-unlocked', JSON.stringify({ u: me(), at: Date.now() }));
// Last time the app was in use (only while it is on screen, so time away is never counted as use).
const touch = () => { if (armed && !el && document.visibilityState !== 'hidden') mark(); };
const waitLeft = () => Math.max(0, Number(LS('pin-wait-until') || 0) - Date.now());

function needed() {
  if (!store.ready || !store.user) return false;
  if (isSharedTill()) return false; // the staff PIN screen does this job
  return !unlocked();
}

/** Show the lock when it is needed. Called whenever the shop data changes. */
export function checkAppLock(h = hooks) {
  hooks = h;
  if (!started) start();
  if (el) { if (!store.ready) return; if (mode === 'loading') { pickMode(); draw(); } return; }
  if (!store.ready || !store.user) return;
  if (needed()) lockNow();
  else { armed = true; touch(); }
}

/** Cover everything with the PIN screen. */
export function lockNow() {
  SS('app-unlocked', null);
  if (isSharedTill() || !store.user) return;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-lock';
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Enter your PIN');
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    document.body.append(el);
    document.body.classList.add('app-locked');
  }
  pin = ''; first = '';
  pickMode();
  draw();
  el.focus();
}

function pickMode() {
  if (!store.ready) { mode = 'loading'; return; }
  if (store.hasPin()) mode = 'enter';
  else if (store.can('settings')) mode = 'create';
  else mode = 'none';
}

function unlock() {
  armed = true;
  el?.remove();
  el = null;
  document.body.classList.remove('app-locked');
  mark();
  LS('pin-tries', null); LS('pin-wait-until', null);
  window.dispatchEvent(new CustomEvent('app-unlocked'));
}

function draw(err = '') {
  if (!el) return;
  const who = esc((store.whoName() || store.user?.email || '').split(/\s+/)[0]);
  const shop = esc(store.settings.shopName || store.shop?.name || 'Shop Manager');
  const wait = waitLeft();
  const dots = `<div class="pin-dots" aria-live="polite">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>`;
  const pad = `<div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-d="${n}">${n}</button>`).join('')}
    <span></span><button type="button" data-d="0">0</button><button type="button" data-del aria-label="Delete">⌫</button></div>`;
  const links = `<div class="sg-links"><button type="button" data-signout>Sign out</button></div>${langSwitch('on-dark')}`;
  let body = '';
  if (mode === 'loading') body = '<p class="muted">Opening your shop…</p>';
  else if (mode === 'none') {
    body = `<h1>No PIN yet</h1>
      <p class="muted">You need a PIN to open the app.</p>
      <p class="muted small">Ask the shop owner to set it in <b>Settings → People with access → Set PIN</b>, then tap Check again.</p>
      <button type="button" class="btn primary block" data-retry>Check again</button>`;
  } else if (mode === 'create') {
    body = `<h1>${first ? 'Type the PIN again' : 'Create your PIN'}</h1>
      <p class="muted">${first ? 'To make sure it is right' : 'Choose 4 digits. You will type them each time you open the app.'}</p>
      ${dots}<p class="pin-err" role="alert">${esc(err)}</p>${pad}`;
  } else {
    body = `<h1>${who ? `Hello ${who}` : 'Welcome back'}</h1>
      <p class="muted">Enter your PIN to open the app</p>
      ${dots}<p class="pin-err" role="alert">${esc(wait ? `Too many wrong PINs — wait ${Math.ceil(wait / 1000)} seconds` : err)}</p>${pad}`;
  }
  el.innerHTML = `<div class="lock-card al-card">
    <img src="brand/book-icon.svg" alt="" width="52" height="52">
    <p class="al-shop" data-no-tr>${shop}</p>
    ${body}
    ${links}
  </div>`;
  if (wait && mode === 'enter') { el.querySelector('.pin-pad')?.classList.add('off'); setTimeout(() => { if (el && mode === 'enter') draw(); }, Math.min(wait, 1000)); }
}

function onClick(e) {
  if (e.target.closest('[data-signout]')) { hooks.signOut?.(); return; }
  if (e.target.closest('[data-retry]')) { pickMode(); draw(); return; }
  if (e.target.closest('[data-del]')) { pin = pin.slice(0, -1); draw(); return; }
  const d = e.target.closest('[data-d]')?.dataset.d;
  if (d !== undefined) add(d);
}
function onKey(e) {
  if (/^\d$/.test(e.key)) add(e.key);
  else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
}

function add(d) {
  if (busy || !['enter', 'create'].includes(mode) || pin.length >= 4) return;
  if (mode === 'enter' && waitLeft()) return;
  pin += d;
  draw();
  if (pin.length === 4) setTimeout(done, 120);
}

async function done() {
  busy = true;
  try {
    if (mode === 'create') {
      if (!first) { first = pin; pin = ''; draw(); return; }
      if (pin !== first) { first = ''; pin = ''; draw('The two PINs were not the same — start again'); return; }
      await store.setMemberPin(store._pinEmail(), pin);
      unlock();
      toast('PIN saved — you will use it to open the app');
      return;
    }
    if (await store.verifyPin(pin)) { unlock(); return; }
    const tries = Number(LS('pin-tries') || 0) + 1;
    pin = '';
    if (tries >= MAX_TRIES) { LS('pin-tries', null); LS('pin-wait-until', String(Date.now() + WAIT_MS)); draw(); return; }
    LS('pin-tries', String(tries));
    draw(`Wrong PIN — ${MAX_TRIES - tries} ${MAX_TRIES - tries === 1 ? 'try' : 'tries'} left`);
  } catch (e) {
    pin = ''; first = '';
    draw(e.message || 'Could not save the PIN');
  } finally { busy = false; }
}

/** Lock again after the app has been away for 5 minutes. */
function start() {
  started = true;
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS && !isSharedTill() && store.user) lockNow();
    else touch();
    hiddenAt = 0;
  });
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, touch, { capture: true, passive: true }));
  setInterval(touch, 30000);
}

export const isAppLocked = () => !!el;
/** Signing out ends the unlock, so the next person must type their own PIN. */
export const forgetUnlock = () => SS('app-unlocked', null);
/** Run fn once the app is open (straight away, or after the PIN). */
export function whenUnlocked(fn) { setTimeout(() => { if (el) window.addEventListener('app-unlocked', fn, { once: true }); else fn(); }, 400); }
