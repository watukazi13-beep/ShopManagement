// Shared till: several staff use one phone or computer. Each unlocks it with a 4-digit PIN,
// so every sale, pay-out and closing records who did it, and the screens follow their role.
import { store, hashPin } from '../store.js';
import { langSwitch } from '../i18n.js';
import { esc, icon, modal, toast, field, confirmBox } from '../ui.js';

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } return null; };
const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { return null; } return null; };
const salt = () => store.shop?.id || 'local';
const staffList = () => (store.settings.staff || []).filter((s) => s && s.id && s.name);
const ROLE = { staff: 'Seller', manager: 'Manager', owner: 'Owner' };

export const isSharedTill = () => LS('shared-till') === '1' && staffList().length > 0;
const lockMinutes = () => Number(LS('till-lock-min')) || 5;
let lastActive = Date.now();
let timer = null;

function setActive(s) {
  store.activeStaff = s ? { id: s.id, name: s.name, role: s.role || 'staff', canClear: !!s.canClear } : null;
  if (s) SS('till-staff', JSON.stringify({ id: s.id, at: Date.now() })); else SS('till-staff', null);
  window.dispatchEvent(new CustomEvent('staff-change'));
}

/** Show the lock screen: pick your name, type your PIN. */
export function lock() {
  if (!isSharedTill()) return;
  setActive(null);
  document.getElementById('staff-lock')?.remove();
  const el = document.createElement('div');
  el.id = 'staff-lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Who is selling?');
  let chosen = null, pin = '';
  const draw = () => {
    el.innerHTML = `<div class="lock-card">
      <img src="brand/book-icon.svg" alt="" width="44" height="44">
      <h1>${chosen ? esc(chosen.name) : 'Who is selling?'}</h1>
      ${chosen ? `
        <p class="muted">Enter your 4-digit PIN</p>
        <div class="pin-dots" aria-live="polite">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
        <p class="pin-err" id="pin-err"></p>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-d="${n}">${n}</button>`).join('')}
          <button type="button" data-back aria-label="Back">${icon('back')}</button><button type="button" data-d="0">0</button><button type="button" data-del aria-label="Delete">⌫</button></div>`
      : `<div class="staff-pick">${staffList().map((s) => `<button type="button" class="btn ghost block" data-staff="${s.id}"><b data-no-tr>${esc(s.name)}</b><small>${ROLE[s.role] || 'Seller'}</small></button>`).join('')}</div>`}
      ${langSwitch('on-dark')}
    </div>`;
  };
  const tryPin = async () => {
    const h = await hashPin(pin, salt());
    if (h === chosen.pin) { el.remove(); lastActive = Date.now(); setActive(chosen); toast(`Hello ${chosen.name}`); return; }
    pin = ''; draw();
    el.querySelector('#pin-err').textContent = 'Wrong PIN — try again';
  };
  el.addEventListener('click', (e) => {
    const sid = e.target.closest('[data-staff]')?.dataset.staff;
    if (sid) { chosen = staffList().find((s) => s.id === sid); pin = ''; draw(); return; }
    if (e.target.closest('[data-back]')) { chosen = null; pin = ''; draw(); return; }
    if (e.target.closest('[data-del]')) { pin = pin.slice(0, -1); draw(); return; }
    const d = e.target.closest('[data-d]')?.dataset.d;
    if (d !== undefined && chosen && pin.length < 4) { pin += d; draw(); if (pin.length === 4) tryPin(); }
  });
  el.addEventListener('keydown', (e) => {
    if (!chosen) return;
    if (/^\d$/.test(e.key) && pin.length < 4) { pin += e.key; draw(); if (pin.length === 4) tryPin(); }
    if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
  });
  el.tabIndex = -1;
  draw();
  document.body.append(el);
  el.focus();
}

/** Called once the shop is loaded: restore the person still using the till, or lock. */
export function initTill() {
  if (!isSharedTill()) { if (store.activeStaff) setActive(null); return; }
  if (!timer) {
    ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, () => { lastActive = Date.now(); }, true));
    timer = setInterval(() => {
      if (isSharedTill() && store.activeStaff && Date.now() - lastActive > lockMinutes() * 60000 && !document.querySelector('dialog[open]')) lock();
    }, 20000);
  }
  if (store.activeStaff || document.getElementById('staff-lock')) return;
  try {
    const saved = JSON.parse(SS('till-staff') || 'null');
    const s = saved && staffList().find((x) => x.id === saved.id);
    if (s && Date.now() - saved.at < lockMinutes() * 60000) { setActive(s); return; }
  } catch { /* lock below */ }
  lock();
}

/** Settings card: staff list (owner) and "this device is a shared till". */
export function tillCard() {
  const owner = store.role === 'owner' && (!store.activeStaff || store.activeStaff.role === 'owner');
  const list = staffList();
  return `
    <section class="card">
      <div class="card-head"><h2>Shared till (staff PINs)</h2></div>
      <p class="muted small">If several people sell on one phone or computer, each one unlocks it with their own 4-digit PIN. Every sale, pay-out and closing then shows who did it, and each person sees only what their role allows. The PIN is a quick lock for a shared till, not a password.</p>
      ${list.length ? `<ul class="rows">${list.map((s) => `<li class="row"><div class="grow"><b>${esc(s.name)}</b><small>${ROLE[s.role] || 'Seller'}${s.role === 'manager' && s.canClear ? ' · can delete received orders and clear figures' : ''}</small></div>${owner ? `<button type="button" class="btn ghost small" data-staff-edit="${s.id}">Edit</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">No staff added yet.</p>'}
      ${owner ? `<button type="button" class="btn ghost" data-act="staff-add">${icon('plus')}Add staff</button>` : ''}
      <label class="check"><input type="checkbox" id="till-on" ${LS('shared-till') === '1' ? 'checked' : ''} ${list.length ? '' : 'disabled'}> This ${matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer'} is a shared till — ask for a staff PIN</label>
      <label class="field inline"><span class="field-label">Lock after</span>
        <select id="till-min">${[2, 5, 10, 30].map((m) => `<option value="${m}" ${lockMinutes() === m ? 'selected' : ''}>${m} minutes without use</option>`).join('')}</select></label>
      ${isSharedTill() && store.activeStaff ? `<button type="button" class="btn ghost" data-act="till-lock">Lock now (switch staff)</button>` : ''}
    </section>`;
}

export function wireTillCard(el, redraw) {
  el.querySelector('#till-on')?.addEventListener('change', (e) => {
    LS('shared-till', e.target.checked ? '1' : null);
    if (e.target.checked) { toast('Shared till on — each person unlocks with their PIN'); lock(); } else { setActive(null); toast('Shared till off on this device'); }
    redraw();
  });
  el.querySelector('#till-min')?.addEventListener('change', (e) => LS('till-lock-min', e.target.value));
  el.querySelector('[data-act=till-lock]')?.addEventListener('click', lock);
  el.querySelector('[data-act=staff-add]')?.addEventListener('click', () => openStaffForm(null, redraw));
  el.querySelectorAll('[data-staff-edit]').forEach((b) => b.addEventListener('click', () => openStaffForm(staffList().find((s) => s.id === b.dataset.staffEdit), redraw)));
}

function openStaffForm(s, redraw) {
  modal({
    title: s ? `Edit ${s.name}` : 'Add staff',
    body: `
      ${field('Name', `<input name="name" required value="${esc(s?.name || '')}" placeholder="e.g. Juma">`)}
      ${field('Role', `<select name="role">${Object.entries(ROLE).map(([k, t]) => `<option value="${k}" ${(s?.role || 'staff') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`, 'Seller: sell, pay out, close the day. Manager: everything except people. Owner: everything.')}
      <label class="check"><input type="checkbox" name="canClear" ${s?.canClear ? 'checked' : ''}> Manager may delete received orders and clear figures</label>
      ${field(s ? 'New PIN (leave empty to keep)' : '4-digit PIN', `<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" ${s ? '' : 'required'}>`)}
      ${field('Type the PIN again', '<input name="pin2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">')}`,
    actions: `${s ? '<button type="button" class="btn ghost danger" data-del>Remove</button>' : ''}<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>`,
    onMount: (dlg, close) => dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (!(await confirmBox(`Remove ${s.name} from the shared till?`, { ok: 'Remove', danger: true }))) return;
      store.saveSettings({ staff: staffList().filter((x) => x.id !== s.id) });
      toast(`${s.name} removed`); redraw();
    }),
    onSubmit: (v) => {
      const pin = String(v.pin || '').trim();
      if (pin || !s) {
        if (!/^\d{4}$/.test(pin)) throw new Error('The PIN must be 4 digits');
        if (pin !== String(v.pin2 || '').trim()) throw new Error('The two PINs are not the same');
      }
      const id = s?.id || Math.random().toString(36).slice(2, 10);
      (async () => {
        const hash = pin ? await hashPin(pin, salt()) : s.pin;
        if (staffList().some((x) => x.id !== id && x.pin === hash)) { toast('Someone else already uses that PIN — choose another', { kind: 'err' }); return; }
        const next = staffList().filter((x) => x.id !== id);
        next.push({ id, name: v.name.trim(), role: v.role, canClear: v.role === 'manager' && v.canClear === 'on', pin: hash });
        store.saveSettings({ staff: next });
        toast(`${v.name.trim()} saved`); redraw();
      })();
    },
  });
}

/** Small chip in the top bar showing who is selling; tap to switch. */
export function staffChip() {
  if (!isSharedTill() || !store.activeStaff) return '';
  return `<button type="button" class="staff-chip" id="staff-chip" title="Switch staff">${esc(store.activeStaff.name)}</button>`;
}
