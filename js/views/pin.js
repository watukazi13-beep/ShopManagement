// PIN check before opening or closing a shift, so a shift is never opened or closed by accident
// or by someone else. Sellers on a shared till use their staff PIN; everyone else uses the PIN
// the owner set for them in Settings → People with access (owners can set their own here too).
import { store } from '../store.js';
import { esc, modal, toast } from '../ui.js';

/** Ask for the PIN of whoever is using the app. Resolves true when it is right. */
export function askPin({ title = 'Enter your PIN', reason = '' } = {}) {
  return new Promise((resolve) => {
    const has = store.hasPin();
    const canSetOwn = !has && store.can('settings') && !store.activeStaff;
    if (!has && !canSetOwn) {
      modal({
        title: 'No PIN yet',
        body: `<p>${esc(store.whoName() || 'You')} has no PIN yet. A PIN is needed to open and close a shift.</p>
          <p class="muted small">Ask the shop owner to set it in <b>Settings → People with access → Set PIN</b>.</p>`,
        actions: '<button class="btn primary" value="cancel">OK</button>',
        onClose: () => resolve(false),
      });
      return;
    }
    let ok = false;
    modal({
      title: canSetOwn ? 'Create your PIN' : title,
      body: `
        ${reason ? `<p class="small">${esc(reason)}</p>` : ''}
        ${canSetOwn ? '<p class="muted small">Choose a 4-digit PIN. You will type it each time you open or close a shift.</p>' : ''}
        <label class="field"><span class="field-label">${canSetOwn ? 'New PIN' : 'PIN'}</span>
          <input name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required autofocus></label>
        ${canSetOwn ? '<label class="field"><span class="field-label">Type the PIN again</span><input name="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required></label>' : ''}
        <p class="pin-err" id="pin-msg" role="alert"></p>`,
      actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">${canSetOwn ? 'Save PIN' : 'Continue'}</button>`,
      onMount: (dlg) => setTimeout(() => dlg.querySelector('[name=pin]')?.focus(), 60),
      onSubmit: (v, { close, form }) => {
        const msg = form.querySelector('#pin-msg');
        const pin = String(v.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) { msg.textContent = 'The PIN must be 4 digits'; return false; }
        if (canSetOwn) {
          if (pin !== String(v.pin2 || '').trim()) { msg.textContent = 'The two PINs are not the same'; return false; }
          store.setMemberPin(store._pinEmail(), pin).then(() => { ok = true; toast('PIN saved'); close(); }).catch((e) => { msg.textContent = e.message; });
          return false;
        }
        store.verifyPin(pin).then((right) => {
          if (right) { ok = true; close(); return; }
          msg.textContent = 'Wrong PIN — try again';
          form.pin.value = ''; form.pin.focus();
        });
        return false;
      },
      onClose: () => resolve(ok),
    });
  });
}
