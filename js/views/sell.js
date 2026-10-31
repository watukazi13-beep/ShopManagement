import { store } from '../store.js';
import { shiftRequired } from './shiftgate.js';
import { cartTotals, num, parseDiscount, taxIncluded, refundTotals, dayKey } from '../calc.js';
import { esc, fmt, fmtQty, fmtDateTime, fmtTime, icon, modal, toast, printHtml, confirmBox, emptyState, field } from '../ui.js';

// The cart survives switching screens (kept for this browser tab).
let cart = [];
try { cart = JSON.parse(sessionStorage.getItem('cart') || '[]'); } catch { cart = []; }
const saveCart = () => { try { sessionStorage.setItem('cart', JSON.stringify(cart)); } catch { /* ignore */ } };

// Held sales ("open tickets"): parked carts on this device, picked up again later.
const heldKey = () => `held-sales-${store.shop?.id || 'local'}`;
const getHeld = () => { try { return JSON.parse(localStorage.getItem(heldKey()) || '[]'); } catch { return []; } };
const setHeld = (list) => { try { localStorage.setItem(heldKey(), JSON.stringify(list)); } catch { /* ignore */ } };

function addToCart(item, qty = 1) {
  const line = cart.find((l) => l.itemId === item.id);
  if (line) line.qty = num(line.qty) + qty;
  else cart.push({ itemId: item.id, qty, price: item.price });
  saveCart();
}

export default {
  title: 'Sell',
  mount(el) {
    let q = '';
    let cat = '';
    el.innerHTML = `
      <div class="pos">
        <section class="pos-items">
          <div class="searchbar">
            ${icon('search')}
            <input id="pos-search" type="search" placeholder="Search or scan barcode" autocomplete="off" enterkeyhint="search">
          </div>
          <div class="chips" id="pos-cats"></div>
          <div class="pos-tools" id="pos-tools"></div>
          <div class="tiles" id="pos-tiles"></div>
        </section>
        <aside class="pos-cart" id="pos-cart"></aside>
        <button class="cart-bar" id="cart-bar" type="button"></button>
      </div>`;
    const search = el.querySelector('#pos-search');
    const tilesEl = el.querySelector('#pos-tiles');
    const catsEl = el.querySelector('#pos-cats');
    const cartEl = el.querySelector('#pos-cart');
    const barEl = el.querySelector('#cart-bar');

    const items = () => store.activeItems();
    const match = (i) => {
      if (cat && (i.category || 'Other') !== cat) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return i.name.toLowerCase().includes(s) || (i.sku || '').toLowerCase() === s || (i.barcode || '') === q;
    };

    const drawTiles = () => {
      const all = items();
      const cats = [...new Set(all.map((i) => i.category || 'Other'))].sort();
      catsEl.innerHTML = cats.length > 1
        ? [`<button type="button" class="chip ${!cat ? 'on' : ''}" data-cat="">All</button>`, ...cats.map((c) => `<button type="button" class="chip ${cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)].join('')
        : '';
      const list = all.filter(match);
      const inCart = new Map(cart.map((l) => [l.itemId, l.qty]));
      tilesEl.innerHTML = list.length
        ? list.map((i) => {
          const low = !i.service && num(i.stock) <= Math.max(0, num(i.minStock));
          return `<button type="button" class="tile ${inCart.has(i.id) ? 'in' : ''}" data-add="${i.id}">
            <span class="tile-name">${esc(i.name)}</span>
            <span class="tile-price">${i.variablePrice ? 'Enter price' : fmt(i.price)}</span>
            ${i.service ? '' : `<span class="tile-stock ${low ? 'low' : ''}">${fmtQty(i.stock)} ${esc(i.unit || '')}</span>`}
            ${inCart.has(i.id) ? `<span class="tile-badge">${fmtQty(inCart.get(i.id))}</span>` : ''}
          </button>`;
        }).join('')
        : all.length
          ? emptyState('No match', `Nothing matches “${q}”.`)
          : emptyState('No items yet', 'Add the products you sell first.', store.can('editItems') ? '<a class="btn primary" href="#/stock?new=1">Add an item</a>' : '');
    };

    const drawCart = () => {
      const lines = cart.map((l) => ({ ...l, item: store.item(l.itemId) })).filter((l) => l.item);
      const t = cartTotals(lines.map((l) => ({ qty: l.qty, price: l.price, cost: 0 })));
      const count = lines.reduce((s, l) => s + num(l.qty), 0);
      cartEl.innerHTML = `
        <div class="cart-head"><h2>Current sale</h2>${lines.length ? `<span class="row-btns">${store.can('orders') ? '<button type="button" class="link" data-quote>Quote</button>' : ''}<button type="button" class="link" data-hold>Hold</button><button type="button" class="link" data-clear>Clear</button></span>` : ''}</div>
        ${lines.length ? `<ul class="cart-lines">${lines.map((l) => {
          const short = !l.item.service && num(l.qty) > num(l.item.stock);
          return `<li class="cart-line">
            <div class="grow">
              <b>${esc(l.item.name)}</b>
              <button type="button" class="link small" data-price="${l.itemId}">${fmt(l.price)} each</button>
              ${short ? `<small class="warn-text">Only ${fmtQty(l.item.stock)} recorded in stock</small>` : ''}
            </div>
            <div class="stepper">
              <button type="button" class="icon-btn" data-dec="${l.itemId}" aria-label="One less">${icon('minus')}</button>
              <button type="button" class="qty" data-qty="${l.itemId}">${fmtQty(l.qty)}</button>
              <button type="button" class="icon-btn" data-inc="${l.itemId}" aria-label="One more">${icon('plus')}</button>
            </div>
            <span class="num line-total">${fmt(num(l.qty) * num(l.price))}</span>
          </li>`;
        }).join('')}</ul>` : '<p class="muted pad">Tap items to add them.</p>'}
        <div class="cart-foot">
          <div class="total-row"><span>Total</span><strong>${fmt(t.total)}</strong></div>
          <button type="button" class="btn accent big block" data-charge ${lines.length ? '' : 'disabled'}>Charge ${fmt(t.total)}</button>
        </div>`;
      barEl.hidden = !lines.length;
      barEl.innerHTML = `<span>${fmtQty(count)} item${count === 1 ? '' : 's'}</span><strong>View sale · ${fmt(t.total)}</strong>`;
    };

    const drawTools = () => {
      const held = getHeld();
      const shifts = store.settings.useShifts || shiftRequired();
      const sh = shifts ? store.myOpenShift() : null;
      el.querySelector('#pos-tools').innerHTML = `
        ${shifts && !sh ? `<div class="banner warn grow">No shift open. <button type="button" class="btn primary small" data-shift>Open shift</button></div>` : ''}
        ${held.length ? `<button type="button" class="btn ghost small" data-held>Held sales <span class="count">${held.length}</span></button>` : ''}
        ${shifts && sh ? `<button type="button" class="btn ghost small" data-shift>Shift · since ${fmtTime(sh.ts)}</button>` : ''}
        <button type="button" class="btn ghost small" data-payout>${icon('cash')}Pay out</button>`;
    };
    const draw = () => { drawTools(); drawTiles(); drawCart(); };

    search.addEventListener('input', () => { q = search.value.trim(); drawTiles(); });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = search.value.trim();
      if (!v) return;
      const exact = items().find((i) => i.barcode === v || (i.sku && i.sku.toLowerCase() === v.toLowerCase()));
      const list = items().filter(match);
      const pick = exact || (list.length === 1 ? list[0] : null);
      if (pick) {
        search.value = ''; q = '';
        add(pick);
        if (!pick.variablePrice) toast(`Added ${pick.name}`, { ms: 1200 });
      }
    });

    el.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      if (d.cat !== undefined) { cat = d.cat; drawTiles(); return; }
      if (d.add) { add(store.item(d.add)); return; }
      if (d.inc) { const l = cart.find((x) => x.itemId === d.inc); l.qty = num(l.qty) + 1; saveCart(); draw(); return; }
      if (d.dec) {
        const l = cart.find((x) => x.itemId === d.dec);
        l.qty = num(l.qty) - 1;
        if (l.qty <= 0) cart = cart.filter((x) => x !== l);
        saveCart(); draw(); return;
      }
      if (d.qty) return editLine(d.qty, 'qty');
      if (d.price) return store.can('editPrice') || store.item(d.price)?.variablePrice ? editLine(d.price, 'price') : toast('Only the owner or a manager can change prices', { kind: 'err' });
      if (d.clear !== undefined) { cart = []; saveCart(); draw(); return; }
      if (d.hold !== undefined) return holdSale();
      if (d.quote !== undefined) return import('./quotes.js').then((m) => m.quoteFromCart(cart.filter((l) => store.item(l.itemId)), { onSaved: () => { cart = []; saveCart(); el.querySelector('.pos').classList.remove('show-cart'); draw(); } }));
      if (d.held !== undefined) return openHeld();
      if (d.shift !== undefined) return openShiftPanel();
      if (d.payout !== undefined) return import('./dayclose.js').then((m) => m.openPayout());
      if (d.dayclose !== undefined) return import('./dayclose.js').then((m) => m.openDayClose());
      if (d.charge !== undefined) return checkout();
      if (t.id === 'cart-bar') { el.querySelector('.pos').classList.add('show-cart'); return; }
    });
    cartEl.addEventListener('click', (e) => {
      if (e.target === cartEl) el.querySelector('.pos').classList.remove('show-cart');
    });

    function holdSale() {
      modal({
        title: 'Hold this sale',
        body: `<p class="muted small">Park it and serve the next customer. Pick it up again from <b>Held sales</b>.</p>${field('Name or note', '<input name="name" autofocus placeholder="e.g. Mama Asha, school order">')}`,
        actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Hold sale</button>',
        onSubmit: ({ name }) => {
          const total = cart.reduce((t, l) => t + num(l.qty) * num(l.price), 0);
          setHeld([...getHeld(), { id: Date.now().toString(36), name: name.trim() || `Sale ${getHeld().length + 1}`, ts: Date.now(), total, cart }]);
          cart = []; saveCart();
          el.querySelector('.pos').classList.remove('show-cart');
          draw();
          toast('Sale held');
        },
      });
    }
    function openHeld() {
      const held = getHeld();
      modal({
        title: 'Held sales',
        body: held.length ? `<ul class="rows">${held.map((h) => `<li class="row"><div class="grow"><b>${esc(h.name)}</b><small>${fmtTime(h.ts)} · ${h.cart.length} item${h.cart.length === 1 ? '' : 's'} · ${fmt(h.total)}</small></div>
          <button type="button" class="btn primary small" data-resume="${h.id}">Open</button><button type="button" class="icon-btn" data-drop="${h.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('')}</ul>` : '<p class="muted">Nothing held.</p>',
        actions: '<button class="btn primary">Close</button>',
        onMount: (dlg, close) => {
          dlg.addEventListener('click', (e) => {
            const r = e.target.closest('[data-resume]')?.dataset.resume;
            const x = e.target.closest('[data-drop]')?.dataset.drop;
            if (r) {
              const h = getHeld().find((y) => y.id === r);
              if (cart.length) setHeld([...getHeld().filter((y) => y.id !== r), { id: Date.now().toString(36), name: 'Previous sale', ts: Date.now(), total: cart.reduce((t, l) => t + num(l.qty) * num(l.price), 0), cart }]);
              else setHeld(getHeld().filter((y) => y.id !== r));
              cart = h.cart.filter((l) => store.item(l.itemId)); saveCart(); draw(); close();
              toast(`${h.name} opened`);
            }
            if (x) { setHeld(getHeld().filter((y) => y.id !== x)); close(); draw(); openHeld(); }
          });
        },
      });
    }

    /** Add an item; variable-price items ask for their price first. */
    function add(item) {
      if (!item) return;
      if (!item.variablePrice || cart.some((l) => l.itemId === item.id)) { addToCart(item); draw(); return; }
      modal({
        title: item.name,
        body: field('Price (TSh)', '<input name="price" type="number" inputmode="numeric" min="1" step="1" required autofocus>')
          + field(`Quantity (${item.unit || 'pcs'})`, '<input name="qty" type="number" inputmode="decimal" min="0" step="any" value="1" required>'),
        actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Add to sale</button>',
        onSubmit: ({ price, qty }) => {
          if (!(num(price) > 0)) throw new Error('Enter the price');
          cart.push({ itemId: item.id, qty: num(qty) || 1, price: Math.round(num(price)) });
          saveCart(); draw();
        },
      });
    }

    function editLine(itemId, key) {
      const l = cart.find((x) => x.itemId === itemId);
      const it = store.item(itemId);
      modal({
        title: key === 'qty' ? `Quantity of ${it.name}` : `Price of ${it.name}`,
        body: field(key === 'qty' ? `Quantity (${it.unit || 'pcs'})` : 'Price each', `<input name="v" type="number" inputmode="decimal" step="any" min="0" value="${l[key]}" required autofocus>`)
          + (key === 'qty' ? `<button type="button" class="btn danger ghost block" data-remove>Remove from sale</button>` : ''),
        actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>',
        onMount: (dlg, close) => {
          const inp = dlg.querySelector('input'); inp.select();
          dlg.querySelector('[data-remove]')?.addEventListener('click', () => { cart = cart.filter((x) => x !== l); saveCart(); draw(); close(); });
        },
        onSubmit: ({ v }) => {
          l[key] = key === 'price' ? Math.round(num(v)) : num(v);
          if (key === 'qty' && l.qty <= 0) cart = cart.filter((x) => x !== l);
          saveCart(); draw();
        },
      });
    }

    function checkout() {
      const lines = cart.filter((l) => store.item(l.itemId));
      const noPrice = lines.find((l) => store.item(l.itemId).variablePrice && !(num(l.price) > 0));
      if (noPrice) return toast(`Enter the price for ${store.item(noPrice.itemId).name}`, { kind: 'err' });
      const t = cartTotals(lines.map((l) => ({ ...l, cost: 0 })));
      const methods = store.settings.payMethods || ['Cash'];
      const boss = store.can('discount');
      const rate = num(store.settings.taxRate);
      const customers = [...store.data.customers].sort((a, b) => a.name.localeCompare(b.name));
      const label = (c) => `${c.name}${c.phone ? ' — ' + c.phone : ''}`;
      modal({
        title: 'Take payment',
        body: `
          <p class="big-total" id="co-total">${fmt(t.total)}</p>
          <p class="muted small center" id="co-sub"></p>
          <div class="field"><span class="field-label">Paid with</span>
            <div class="chips wrap" role="radiogroup">${methods.map((m, i) => `<label class="chip radio"><input type="radio" name="pay" value="${esc(m)}" ${i === 0 ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div>
          </div>
          ${boss ? `<div class="field"><span class="field-label">Discount</span>
            <div class="disc-row"><input name="discount" inputmode="decimal" autocomplete="off" placeholder="0 or 10%" aria-label="Discount in shillings or percent">
            <button type="button" class="chip" data-d="5%">5%</button><button type="button" class="chip" data-d="10%">10%</button><button type="button" class="chip" data-d="">None</button></div>
            <small>Type an amount (500) or a percentage (10%).</small></div>` : ''}
          ${field('Cash received (optional)', '<input name="cash" type="number" inputmode="numeric" min="0" step="1" placeholder="To work out change">', '')}
          <p class="change" id="co-change"></p>
          ${field('Customer', `<input name="customer" list="cust-dl" autocomplete="off" placeholder="Optional — needed for credit sales"><datalist id="cust-dl">${customers.map((c) => `<option value="${esc(label(c))}">`).join('')}</datalist>`, '')}
          <p class="small" id="co-cust"></p>`,
        actions: '<button class="btn ghost" value="cancel">Back</button><button class="btn accent big">Complete sale</button>',
        onMount: (dlg) => {
          const findCust = () => {
            const v = dlg.querySelector('[name=customer]').value.trim().toLowerCase();
            return v ? customers.find((c) => label(c).toLowerCase() === v || c.name.toLowerCase() === v || (c.phone && c.phone === v)) : null;
          };
          const upd = () => {
            const discIn = dlg.querySelector('[name=discount]')?.value || '';
            const disc = parseDiscount(discIn, t.subtotal);
            const tot = t.subtotal - disc;
            dlg.querySelector('#co-total').textContent = fmt(tot);
            dlg.querySelector('#co-sub').innerHTML = [disc ? `${fmt(t.subtotal)} − discount ${fmt(disc)}` : '', rate ? `includes ${esc(store.settings.taxName || 'VAT')} ${rate}%: ${fmt(taxIncluded(tot, rate))}` : ''].filter(Boolean).join(' · ');
            const cash = num(dlg.querySelector('[name=cash]').value);
            dlg.querySelector('#co-change').innerHTML = cash ? (cash >= tot ? `Change: <b>${fmt(cash - tot)}</b>` : `<span class="warn-text">Short by ${fmt(tot - cash)}</span>`) : '';
            const pay = dlg.querySelector('[name=pay]:checked')?.value;
            const c = findCust();
            const typed = dlg.querySelector('[name=customer]').value.trim();
            const credit = store.isCreditPay(pay);
            let msg = '';
            if (c) msg = `${esc(c.name)}${num(c.balance) > 0 ? ` owes <b>${fmt(c.balance)}</b>` : ''}${credit ? ` → will owe <b>${fmt(num(c.balance) + tot)}</b>` : ''}${credit && num(c.creditLimit) > 0 && num(c.balance) + tot > num(c.creditLimit) ? ` <span class="warn-text">(over their limit of ${fmt(c.creditLimit)})</span>` : ''}`;
            else if (typed) msg = `New customer “${esc(typed)}” will be added.`;
            else if (credit) msg = '<span class="warn-text">A credit sale needs a customer.</span>';
            dlg.querySelector('#co-cust').innerHTML = msg;
          };
          dlg.addEventListener('input', upd);
          dlg.addEventListener('change', upd);
          dlg.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { dlg.querySelector('[name=discount]').value = b.dataset.d; upd(); }));
          dlg._findCust = findCust;
          upd();
        },
        onSubmit: (v, { form }) => {
          const dlgEl = form.closest('dialog');
          let cust = dlgEl._findCust();
          const typed = (v.customer || '').trim();
          if (!cust && typed) {
            // New customer typed at the till: "Name" or "Name — 0712…"
            const [name, phone = ''] = typed.split(/\s+—\s+/);
            const id = store.saveCustomer({ name, phone });
            cust = { id, name, phone, balance: 0 };
            store.data.customers = [...store.data.customers.filter((c) => c.id !== id), cust];
          }
          const sale = store.recordSale({ lines, discount: v.discount || 0, pay: v.pay, customerId: cust?.id || '', customer: cust?.name || '' });
          cart = []; saveCart();
          el.querySelector('.pos').classList.remove('show-cart');
          draw();
          toast(`Sale saved · ${fmt(sale.total)}`);
          setTimeout(() => showReceipt(sale, { fresh: true }), 150);
        },
      });
    }

    draw();
    if (matchMedia('(pointer: fine)').matches) search.focus();
    return { update: draw };
  },
};

export function receiptText(s) {
  const st = store.settings;
  const refund = s.type === 'refund';
  return [
    st.shopName, st.phone, st.receiptHeader || null, '',
    `${refund ? 'Refund' : 'Receipt'} ${s.no}${refund ? ` (for ${s.refundOfNo})` : ''}`, fmtDateTime(s.ts), s.customer ? `Customer: ${s.customer}` : null, '',
    ...s.lines.map((l) => `${l.name}\n  ${fmtQty(l.qty)} × ${fmt(l.price, { bare: true })} = ${fmt(l.qty * l.price, { bare: true })}`),
    '',
    s.discount ? `Discount: ${fmt(s.discount)}` : null,
    `TOTAL: ${fmt(s.total)}`,
    s.tax ? `Includes ${st.taxName || 'VAT'} ${s.taxRate}%: ${fmt(s.tax)}` : null,
    `${refund ? 'Refunded via' : 'Paid'}: ${s.pay}${s.credit ? ' (on account)' : ''}`,
    s.balanceAfter !== undefined ? `Balance owed: ${fmt(s.balanceAfter)}` : null,
    '', st.receiptFooter || 'Thank you!',
  ].filter((x) => x !== null).join('\n');
}

function receiptTable(s) {
  const st = store.settings;
  const rows = s.lines.map((l) => {
    const back = num(s.refundedQty?.[l.itemId]);
    return `<tr><td>${esc(l.name)}<br><small class="muted">${fmtQty(l.qty)} × ${fmt(l.price)}${back ? ` · ${fmtQty(back)} returned` : ''}</small></td><td class="r">${fmt(l.qty * l.price)}</td></tr>`;
  }).join('');
  return `<table class="receipt">${rows}
      ${s.discount ? `<tr><td>Discount</td><td class="r">${s.discount > 0 ? '−' : '+'}${fmt(Math.abs(s.discount))}</td></tr>` : ''}
      <tr class="tot"><td>${s.type === 'refund' ? 'Refund total' : 'Total'}</td><td class="r">${fmt(s.total)}</td></tr>
      ${s.tax ? `<tr><td><small>Includes ${esc(st.taxName || 'VAT')} ${s.taxRate}%</small></td><td class="r"><small>${fmt(s.tax)}</small></td></tr>` : ''}
      ${num(s.refunded) ? `<tr><td>Refunded</td><td class="r">−${fmt(s.refunded)}</td></tr>` : ''}</table>`;
}

export function printReceipt(s) {
  const st = store.settings;
  const refund = s.type === 'refund';
  printHtml(`${refund ? 'Refund' : 'Receipt'} ${s.no}`, `
    <div style="max-width:340px;margin:auto"><h1>${esc(st.shopName)}</h1>
    <div class="muted">${esc(st.address)}<br>${esc(st.phone)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div>
    ${st.receiptHeader ? `<p>${esc(st.receiptHeader)}</p>` : ''}
    <p>${refund ? 'Refund' : 'Receipt'} <b>${esc(s.no)}</b>${refund ? ` for ${esc(s.refundOfNo)}` : ''}<br>${fmtDateTime(s.ts)} · ${esc(s.pay)}${s.credit ? ' (on account)' : ''}${s.customer ? `<br>Customer: ${esc(s.customer)}` : ''}</p>
    ${receiptTable(s)}
    ${s.balanceAfter !== undefined ? `<p>Balance owed: <b>${fmt(s.balanceAfter)}</b></p>` : ''}
    <p style="text-align:center">${esc(st.receiptFooter || 'Thank you!')}</p></div>`);
}

export function showReceipt(s, { fresh = false } = {}) {
  if (!s) return;
  s = store.data.sales.find((x) => x.id === s.id) ? { ...store.data.sales.find((x) => x.id === s.id), balanceAfter: s.balanceAfter } : s;
  const refund = s.type === 'refund';
  const canVoid = store.can('voidSale') && !s.voided && !refund && !num(s.refunded);
  const left = refund ? [] : s.lines.filter((l) => num(l.qty) - num(s.refundedQty?.[l.itemId]) > 0);
  const canRefund = store.can('voidSale') && !s.voided && !refund && left.length;
  modal({
    title: fresh ? 'Sale complete' : `${refund ? 'Refund' : 'Receipt'} ${s.no}`,
    body: `
      ${s.voided ? `<p class="banner bad">This sale was cancelled${s.voidReason ? ': ' + esc(s.voidReason) : ''}. Stock was returned.</p>` : ''}
      ${refund ? `<p class="banner warn">Refund for receipt ${esc(s.refundOfNo)}${s.note ? ' — ' + esc(s.note) : ''}. Stock was returned.</p>` : ''}
      <p class="muted">${esc(s.no)} · ${fmtDateTime(s.ts)} · ${esc(s.pay)}${s.credit ? ' (on account)' : ''}${s.customer ? ' · ' + esc(s.customer) : ''}${s.byName ? ' · by ' + esc(s.byName) : ''}</p>
      ${receiptTable(s)}
      ${s.balanceAfter !== undefined ? `<p><b>${esc(s.customer)}</b> now owes <b>${fmt(s.balanceAfter)}</b>.</p>` : ''}
      ${store.can('reports') ? `<p class="muted small">Cost of goods: ${fmt(s.cogs)} · Gross profit: ${fmt(s.total - s.cogs)}</p>` : ''}`,
    actions: `
      ${canVoid ? `<button type="button" class="btn ghost danger" data-void>Cancel sale</button>` : ''}
      ${canRefund ? `<button type="button" class="btn ghost" data-refund>Refund</button>` : ''}
      <button type="button" class="btn ghost" data-share>${icon('wa')}<span class="hide-sm">WhatsApp</span></button>
      <button type="button" class="btn ghost" data-print>${icon('print')}<span class="hide-sm">Print / PDF</span></button>
      ${s.credit && !refund ? '<button type="button" class="btn ghost" data-invoice>Invoice</button>' : ''}
      <button class="btn primary">${fresh ? 'Next sale' : 'Done'}</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('[data-print]').addEventListener('click', () => printReceipt(s));
      dlg.querySelector('[data-invoice]')?.addEventListener('click', () => import('./quotes.js').then((m) => m.printInvoice(s)));
      dlg.querySelector('[data-share]').addEventListener('click', () => {
        const c = s.customerId && store.customer(s.customerId);
        const phone = c?.phone ? String(c.phone).replace(/\D/g, '').replace(/^0/, '255') : '';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(receiptText(s))}`, '_blank', 'noopener');
      });
      dlg.querySelector('[data-void]')?.addEventListener('click', async () => {
        close();
        if (await confirmBox(`Cancel sale ${s.no} for ${fmt(s.total)}? The items go back into stock.`, { ok: 'Cancel sale', danger: true })) {
          try { store.voidSale(s, 'Cancelled'); toast('Sale cancelled and stock returned'); } catch (e) { toast(e.message, { kind: 'err' }); }
        }
      });
      dlg.querySelector('[data-refund]')?.addEventListener('click', () => { close(); setTimeout(() => openRefund(s), 120); });
    },
  });
}

/** Return some or all items of a sale: money back (or off the customer's account) and stock back. */
export function openRefund(s) {
  const left = (l) => num(l.qty) - num(s.refundedQty?.[l.itemId]);
  modal({
    title: `Refund ${s.no}`,
    body: `
      <p class="muted small">Enter how many of each item came back. Stock goes back up${s.credit ? ` and ${esc(s.customer)}'s balance goes down` : ''}.</p>
      <table class="table recv-table"><thead><tr><th>Item</th><th class="r">Sold</th><th class="r">Returned</th></tr></thead>
      <tbody>${s.lines.filter((l) => left(l) > 0).map((l) => `<tr data-item="${l.itemId}"><td>${esc(l.name)}<small>${fmt(l.price)} each</small></td><td class="r num">${fmtQty(left(l))}</td>
        <td class="r"><input class="rf-qty" type="number" inputmode="decimal" min="0" max="${left(l)}" step="any" value="${left(l)}" aria-label="Returned ${esc(l.name)}"></td></tr>`).join('')}</tbody></table>
      <p class="total-row"><span>Money back</span><strong id="rf-total"></strong></p>
      ${field('Reason', '<input name="reason" placeholder="e.g. damaged, wrong item" autocomplete="off">')}`,
    actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Refund</button>`,
    onMount: (dlg) => {
      const qtys = () => Object.fromEntries([...dlg.querySelectorAll('tbody tr')].map((tr) => [tr.dataset.item, num(tr.querySelector('.rf-qty').value)]));
      const upd = () => { dlg.querySelector('#rf-total').textContent = fmt(-refundTotals(s, qtys()).total); };
      dlg.addEventListener('input', upd); upd();
      dlg._qtys = qtys;
    },
    onSubmit: (v, { form }) => {
      const r = store.refundSale(s, form.closest('dialog')._qtys(), v.reason || '');
      toast(`Refunded ${fmt(-r.total)} — stock returned`);
      setTimeout(() => showReceipt(r), 150);
    },
  });
}

/** Shift (cash drawer): open with a float, cash in/out, close with a count. */
export function openShiftPanel() {
  const sh = store.myOpenShift();
  if (!sh) {
    modal({
      title: 'Open shift',
      body: field('Cash in the drawer now (TSh)', '<input name="cash" type="number" inputmode="numeric" min="0" step="1" required autofocus value="0">', 'Count the money in the drawer before you start selling.'),
      actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Open shift</button>',
      onSubmit: ({ cash }) => { import('./pin.js').then((m) => m.askPin({ title: 'Your PIN to open the shift' })).then((ok) => { if (!ok) return; store.openShift(cash); toast('Shift opened'); }); },
    });
    return;
  }
  const f = store.shiftFigures(sh);
  modal({
    title: `Shift since ${fmtTime(sh.ts)}`,
    body: `
      <table class="table">
        <tr><td>Opening cash</td><td class="r num">${fmt(sh.openingCash)}</td></tr>
        <tr><td>Cash sales (${f.count} sale${f.count === 1 ? '' : 's'} in total)</td><td class="r num">+${fmt(f.cashSales)}</td></tr>
        ${f.cashRefunds ? `<tr><td>Cash refunds</td><td class="r num">−${fmt(f.cashRefunds)}</td></tr>` : ''}
        ${f.cashPayments ? `<tr><td>Customer payments in cash</td><td class="r num">+${fmt(f.cashPayments)}</td></tr>` : ''}
        ${f.cashIn ? `<tr><td>Cash put in</td><td class="r num">+${fmt(f.cashIn)}</td></tr>` : ''}
        ${f.cashOut ? `<tr><td>Cash taken out</td><td class="r num">−${fmt(f.cashOut)}</td></tr>` : ''}
        ${f.cashPayouts ? `<tr><td>Pay-outs from the drawer (food, transport…)</td><td class="r num">−${fmt(f.cashPayouts)}</td></tr>` : ''}
        <tr class="tot"><td>Expected in drawer</td><td class="r num">${fmt(f.expected)}</td></tr>
        <tr><td class="muted">Other payments (M-Pesa, card, credit…)</td><td class="r num muted">${fmt(f.otherSales)}</td></tr>
      </table>
      ${(sh.moves || []).length ? `<h3>Cash in / out</h3><ul class="rows">${sh.moves.map((m) => `<li class="row"><div class="grow">${m.type === 'in' ? 'Put in' : 'Taken out'}<small>${fmtTime(m.ts)}${m.note ? ' · ' + esc(m.note) : ''}</small></div><span class="num ${m.type === 'in' ? 'up' : 'neg'}">${m.type === 'in' ? '+' : '−'}${fmt(m.amount)}</span></li>`).join('')}</ul>` : ''}`,
    actions: `<button type="button" class="btn ghost" data-move="in">Cash in</button><button type="button" class="btn ghost" data-move="out">Cash out</button>
      <button type="button" class="btn accent" data-close-shift>Close shift</button><button class="btn primary">Done</button>`,
    onMount: (dlg, close) => {
      dlg.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
        close();
        const type = b.dataset.move;
        modal({
          title: type === 'in' ? 'Put cash in' : 'Take cash out',
          body: field('Amount (TSh)', '<input name="amount" type="number" inputmode="numeric" min="1" step="1" required autofocus>') + field('Reason', `<input name="note" placeholder="${type === 'in' ? 'e.g. change from bank' : 'e.g. paid transport'}">`),
          actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Save</button>',
          onSubmit: (v) => { store.shiftMove(sh, { type, amount: v.amount, note: v.note }); toast('Saved'); setTimeout(openShiftPanel, 150); },
        });
      }));
      dlg.querySelector('[data-close-shift]').addEventListener('click', () => { close(); openCloseShift(sh); });
    },
  });
}

/** Close shift = close the day (full count of every way of paying). */
export function openCloseShift(sh = store.myOpenShift(), opts = {}) {
  if (!sh) return;
  import('./dayclose.js').then((m) => m.openCloseShift(sh, opts));
}
