// Shop setup, step by step — everything an owner needs, without Firebase or GitHub.
import { store } from '../store.js';
import { num } from '../calc.js';
import { esc, icon, modal, toast, field } from '../ui.js';

const DEFAULT_PAY = ['Cash', 'M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa', 'Card', 'Bank transfer', 'Credit'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Shrink a picked image to a small logo (data URL) that fits in the shop settings. */
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!/^image\//.test(file.type)) return reject(new Error('Choose a picture file (PNG or JPG)'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 360 / img.width, 160 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/png');
      if (data.length > 120000) data = c.toDataURL('image/jpeg', 0.85);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be read')); };
    img.src = url;
  });
}

const STEPS = [
  {
    title: 'Your shop',
    body: (s) => `
      <p class="muted small">Shown on receipts, quotations, invoices and orders.</p>
      ${field('Shop name', `<input name="shopName" required value="${esc(s.shopName === 'My Shop' ? store.shop?.name || '' : s.shopName)}">`)}
      <div class="grid2">
        ${field('Phone', `<input name="phone" type="tel" value="${esc(s.phone)}">`)}
        ${field('Email', `<input name="email" type="email" value="${esc(s.email)}">`)}
      </div>
      <div class="grid2">
        ${field('Address', `<input name="address" value="${esc(s.address)}" placeholder="e.g. Kenyatta Rd, Mwanza">`)}
        ${field('TIN (optional)', `<input name="tin" value="${esc(s.tin)}">`)}
      </div>
      <div class="field"><span class="field-label">Logo (optional)</span>
        <div class="logo-pick"><span id="logo-prev">${s.logo ? `<img src="${esc(s.logo)}" alt="Logo">` : '<span class="muted small">No logo</span>'}</span>
          <input type="file" accept="image/*" id="logo-file" aria-label="Choose logo">
          ${s.logo ? '<button type="button" class="btn ghost small" id="logo-remove">Remove</button>' : ''}</div></div>`,
    mount: (dlg, state) => {
      dlg.querySelector('#logo-file').addEventListener('change', async (e) => {
        try {
          state.logo = await readLogo(e.target.files[0]);
          dlg.querySelector('#logo-prev').innerHTML = state.logo ? `<img src="${state.logo}" alt="Logo">` : '';
        } catch (err) { toast(err.message, { kind: 'err' }); }
      });
      dlg.querySelector('#logo-remove')?.addEventListener('click', () => { state.logo = ''; dlg.querySelector('#logo-prev').innerHTML = '<span class="muted small">No logo</span>'; });
    },
    save: (v, state) => {
      if (!v.shopName.trim()) throw new Error('Enter the shop name');
      const patch = { shopName: v.shopName.trim(), phone: v.phone, email: v.email, address: v.address, tin: v.tin };
      if (state.logo !== undefined) patch.logo = state.logo;
      return patch;
    },
  },
  {
    title: 'Payments and tax',
    body: (s) => {
      const on = s.payMethods || [];
      const all = [...new Set([...on, ...DEFAULT_PAY])];
      return `
      <div class="field"><span class="field-label">How customers pay you</span>
        <div class="chips wrap" id="pay-chips">${all.map((m) => `<label class="chip radio"><input type="checkbox" name="pay" value="${esc(m)}" ${on.includes(m) ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div>
        <div class="inline-form"><input id="pay-new" placeholder="Add another, e.g. Lipa Namba" aria-label="New payment method"><button type="button" class="btn ghost small" id="pay-add">${icon('plus')}Add</button></div>
        <small>The first one ticked is treated as cash for shift counts. Keep "Credit" to sell on account.</small></div>
      <div class="grid2">
        ${field('Tax name', `<input name="taxName" value="${esc(s.taxName || 'VAT')}">`)}
        ${field('Tax included in prices (%)', `<input name="taxRate" type="number" inputmode="decimal" min="0" max="50" step="any" value="${s.taxRate || 0}">`, '0 if you are not VAT-registered. Tanzania VAT is 18%.')}
      </div>`;
    },
    mount: (dlg) => {
      dlg.querySelector('#pay-add').addEventListener('click', () => {
        const v = dlg.querySelector('#pay-new').value.trim();
        if (!v) return;
        dlg.querySelector('#pay-chips').insertAdjacentHTML('beforeend', `<label class="chip radio"><input type="checkbox" name="pay" value="${esc(v)}" checked>${esc(v)}</label>`);
        dlg.querySelector('#pay-new').value = '';
      });
    },
    save: (v, state, form) => {
      const pay = [...form.querySelectorAll('[name=pay]:checked')].map((x) => x.value);
      if (!pay.length) throw new Error('Tick at least one way to pay');
      return { payMethods: pay, taxName: v.taxName || 'VAT', taxRate: Math.max(0, num(v.taxRate)) };
    },
  },
  {
    title: 'Receipts and documents',
    body: (s) => `
      <div class="grid2">
        ${field('Receipt header', `<input name="receiptHeader" value="${esc(s.receiptHeader || '')}" placeholder="e.g. Karibu!">`)}
        ${field('Receipt footer', `<input name="receiptFooter" value="${esc(s.receiptFooter || 'Thank you!')}">`)}
      </div>
      ${field('How customers can pay you (on invoices)', `<textarea name="paymentDetails" rows="2" placeholder="e.g. M-Pesa Lipa Namba 123456 · NMB account 2010…">${esc(s.paymentDetails || '')}</textarea>`)}
      ${field('Message on quotations to customers', `<textarea name="quoteNote" rows="2">${esc(s.quoteNote || '')}</textarea>`)}
      ${field('Message on requests for quotation to suppliers', `<textarea name="rfqNote" rows="2">${esc(s.rfqNote || '')}</textarea>`)}
      ${field('Message on purchase orders', `<textarea name="poNote" rows="2">${esc(s.poNote || '')}</textarea>`)}`,
    save: (v) => ({ receiptHeader: v.receiptHeader, receiptFooter: v.receiptFooter, paymentDetails: v.paymentDetails, quoteNote: v.quoteNote, rfqNote: v.rfqNote, poNote: v.poNote }),
  },
  {
    title: 'Categories',
    body: (s) => {
      const cats = [...new Set(store.data.items.map((i) => i.category).filter(Boolean))].sort();
      return `
      <div class="field"><span class="field-label">Item categories</span>
        ${cats.length ? `<small>Rename a category to fix spelling or merge two (give them the same name).</small>
        <div class="cat-list">${cats.map((c) => `<div class="cat-row"><span>${esc(c)}</span><input name="cat:${esc(c)}" value="${esc(c)}" aria-label="New name for ${esc(c)}"><small>${store.data.items.filter((i) => i.category === c).length} items</small></div>`).join('')}</div>`
          : '<small>Categories come from your items — add or import items first.</small>'}
      </div>
      ${field('Expense types', `<input name="expenseCategories" value="${esc((s.expenseCategories || []).join(', '))}">`, 'Separate with commas. Keep "Salaries" for month-end closing.')}`;
    },
    save: (v, state, form) => {
      const renames = [...form.querySelectorAll('[name^="cat:"]')].map((i) => [i.name.slice(4), i.value.trim()]).filter(([a, b]) => b && a !== b);
      state.renames = renames;
      return { expenseCategories: (v.expenseCategories || '').split(',').map((x) => x.trim()).filter(Boolean) };
    },
  },
  {
    title: 'Restocking and orders',
    body: (s) => `
      <div class="grid2">
        ${field('Supplier delivery time (days)', `<input name="leadDays" type="number" min="1" value="${s.leadDays}">`, 'Alerts come early enough to cover this')}
        ${field('Order enough for (days)', `<input name="coverDays" type="number" min="1" value="${s.coverDays}">`, 'Used when an item has no maximum')}
      </div>
      <div class="inline-check">
        <label class="check"><input type="checkbox" name="autoWeeklyPo" ${s.autoWeeklyPo !== false ? 'checked' : ''}> Draft purchase orders every week for items below their minimum, on</label>
        <select name="weeklyPoDay" aria-label="Day">${DAYS.map((d, i) => `<option value="${i}" ${Number(s.weeklyPoDay ?? 1) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <label class="check"><input type="checkbox" name="autoMonthlyRfq" ${s.autoMonthlyRfq !== false ? 'checked' : ''}> Draft requests for quotation at the start of each month</label>
      <label class="check"><input type="checkbox" name="useShifts" ${s.useShifts ? 'checked' : ''}> Use shifts: count the cash drawer when opening and closing</label>
      <label class="check"><input type="checkbox" name="staffCanReceive" ${s.staffCanReceive ? 'checked' : ''}> Sellers can receive deliveries into stock</label>
      <p class="muted small">Set each item's minimum and maximum stock in Stock → Min / max.</p>`,
    save: (v) => ({
      leadDays: num(v.leadDays) || 7, coverDays: num(v.coverDays) || 30, autoWeeklyPo: v.autoWeeklyPo === 'on', weeklyPoDay: Number(v.weeklyPoDay ?? 1),
      autoMonthlyRfq: v.autoMonthlyRfq === 'on', useShifts: v.useShifts === 'on', staffCanReceive: v.staffCanReceive === 'on',
    }),
  },
  {
    title: 'People',
    skip: () => store.mode === 'local' || !store.can('users'),
    body: () => {
      const owners = store.shop?.owners || [];
      const members = Object.entries(store.shop?.members || {});
      const role = (r) => ({ manager: 'Manager', staff: 'Seller' }[r] || r);
      return `
      <p class="muted small">Give your staff access with their Google (Gmail) address. Managers do everything except manage people; sellers only sell and see stock.</p>
      <ul class="rows">${owners.map((e) => `<li class="row"><div class="grow"><b>${esc(e)}</b><small>Owner</small></div></li>`).join('')}${members.map(([e, r]) => `<li class="row"><div class="grow"><b>${esc(e)}</b><small>${role(r)}</small></div></li>`).join('')}</ul>
      <div class="inline-form"><input id="ppl-email" type="email" placeholder="their.email@gmail.com" aria-label="Email"><select id="ppl-role" aria-label="Role"><option value="staff">Seller</option><option value="manager">Manager</option></select><button type="button" class="btn primary" id="ppl-add">Give access</button></div>`;
    },
    mount: (dlg, state, rerender) => {
      dlg.querySelector('#ppl-add').addEventListener('click', () => {
        const email = dlg.querySelector('#ppl-email').value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter their email address', { kind: 'err' });
        try { store.setShopMember(email, dlg.querySelector('#ppl-role').value).catch(() => {}); toast(`${email} can now sign in`); setTimeout(rerender, 300); } catch (e) { toast(e.message, { kind: 'err' }); }
      });
    },
    save: () => ({}),
  },
  {
    title: 'Your items',
    body: () => {
      const n = store.activeItems().length;
      const noMax = store.activeItems().filter((i) => !i.service && !(num(i.maxStock) > 0)).length;
      return `
      <p>${n ? `You have <b>${n} items</b>.` : 'No items yet.'}</p>
      <div class="row-btns">
        <a class="btn ghost" href="#/stock?new=1" data-close>${icon('plus')}Add an item</a>
        <a class="btn ghost" href="#/stock" data-go="import">${icon('upload')}Import from Loyverse or a spreadsheet</a>
        ${noMax ? `<a class="btn ghost" href="#/stock" data-go="levels">Set min / max for ${noMax} item${noMax > 1 ? 's' : ''}</a>` : ''}
      </div>
      <p class="muted small">You can come back to this setup any time from Settings.</p>`;
    },
    mount: (dlg, state, rerender, close) => {
      dlg.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => {
        close();
        setTimeout(() => document.querySelector(`[data-act="${a.dataset.go}"]`)?.click(), 400);
      }));
      dlg.querySelector('[data-close]')?.addEventListener('click', () => close());
    },
    save: () => ({}),
  },
];

/** Open the setup guide at a step (0-based). */
export function openSetup(start = 0) {
  const steps = STEPS.filter((s) => !s.skip?.());
  const state = {};
  let i = Math.min(start, steps.length - 1);
  const show = () => {
    const step = steps[i];
    let dlgRef = null;
    const { el, close } = modal({
      title: `Set up your shop · ${i + 1} of ${steps.length}`,
      wide: true,
      body: `<div class="setup-dots">${steps.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'on' : ''}" title="${esc(s.title)}"></span>`).join('')}</div>
        <h3 class="setup-title">${esc(step.title)}</h3>${step.body(store.settings, state)}`,
      actions: `${i ? '<button type="button" class="btn ghost" data-back>Back</button>' : ''}<button class="btn ghost" value="cancel">Close</button>
        <button class="btn primary">${i === steps.length - 1 ? 'Finish' : 'Save and continue'}</button>`,
      onMount: (dlg, closeFn) => {
        dlgRef = dlg;
        step.mount?.(dlg, state, () => { closeFn(); setTimeout(show, 50); }, closeFn);
        dlg.querySelector('[data-back]')?.addEventListener('click', () => { closeFn(); i -= 1; setTimeout(show, 50); });
      },
      onSubmit: (v, { form }) => {
        const patch = step.save(v, state, form);
        if (state.renames?.length) { store.renameCategories(state.renames); state.renames = []; }
        const last = i === steps.length - 1;
        store.saveSettings({ ...patch, ...(last ? { setupDone: true } : {}) });
        if (last) { toast('Setup saved — you can change anything later in Settings'); return; }
        i += 1;
        setTimeout(show, 50);
      },
    });
    void el; void close; void dlgRef;
  };
  show();
}
