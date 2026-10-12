import { store } from '../store.js';
import { cartTotals, num } from '../calc.js';
import { esc, fmt, fmtQty, fmtDateTime, icon, modal, toast, printHtml, confirmBox, emptyState, field } from '../ui.js';

// The cart survives switching screens (kept for this browser tab).
let cart = [];
try { cart = JSON.parse(sessionStorage.getItem('cart') || '[]'); } catch { cart = []; }
const saveCart = () => { try { sessionStorage.setItem('cart', JSON.stringify(cart)); } catch { /* ignore */ } };

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
        <div class="cart-head"><h2>Current sale</h2>${lines.length ? `<button type="button" class="link" data-clear>Clear</button>` : ''}</div>
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

    const draw = () => { drawTiles(); drawCart(); };

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
      if (d.charge !== undefined) return checkout();
      if (t.id === 'cart-bar') { el.querySelector('.pos').classList.add('show-cart'); return; }
    });
    cartEl.addEventListener('click', (e) => {
      if (e.target === cartEl) el.querySelector('.pos').classList.remove('show-cart');
    });

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
      modal({
        title: 'Take payment',
        body: `
          <p class="big-total" id="co-total">${fmt(t.total)}</p>
          <div class="field"><span class="field-label">Paid with</span>
            <div class="chips wrap" role="radiogroup">${methods.map((m, i) => `<label class="chip radio"><input type="radio" name="pay" value="${esc(m)}" ${i === 0 ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div>
          </div>
          ${boss ? field('Discount (TSh)', '<input name="discount" type="number" inputmode="numeric" min="0" step="1" value="0">') : ''}
          ${field('Cash received (optional)', '<input name="cash" type="number" inputmode="numeric" min="0" step="1" placeholder="To work out change">', '')}
          <p class="change" id="co-change"></p>
          ${field('Customer (optional)', '<input name="customer" autocomplete="off" placeholder="Name or phone — useful for credit sales">')}`,
        actions: '<button class="btn ghost" value="cancel">Back</button><button class="btn accent big">Complete sale</button>',
        onMount: (dlg) => {
          const upd = () => {
            const disc = num(dlg.querySelector('[name=discount]')?.value);
            const tot = cartTotals(lines.map((l) => ({ ...l, cost: 0 })), disc).total;
            dlg.querySelector('#co-total').textContent = fmt(tot);
            const cash = num(dlg.querySelector('[name=cash]').value);
            dlg.querySelector('#co-change').innerHTML = cash ? (cash >= tot ? `Change: <b>${fmt(cash - tot)}</b>` : `<span class="warn-text">Short by ${fmt(tot - cash)}</span>`) : '';
          };
          dlg.addEventListener('input', upd);
        },
        onSubmit: (v) => {
          const sale = store.recordSale({ lines, discount: v.discount || 0, pay: v.pay, customer: v.customer || '' });
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
  return [
    st.shopName, st.phone, '',
    `Receipt ${s.no}`, fmtDateTime(s.ts), '',
    ...s.lines.map((l) => `${l.name}\n  ${fmtQty(l.qty)} × ${fmt(l.price, { bare: true })} = ${fmt(l.qty * l.price, { bare: true })}`),
    '',
    s.discount ? `Discount: ${fmt(s.discount)}` : null,
    `TOTAL: ${fmt(s.total)}`,
    `Paid: ${s.pay}`,
    '', 'Thank you!',
  ].filter((x) => x !== null).join('\n');
}

export function showReceipt(s, { fresh = false } = {}) {
  if (!s) return;
  const st = store.settings;
  const rows = s.lines.map((l) => `<tr><td>${esc(l.name)}<br><small class="muted">${fmtQty(l.qty)} × ${fmt(l.price)}</small></td><td class="r">${fmt(l.qty * l.price)}</td></tr>`).join('');
  const table = `<table class="receipt">${rows}
      ${s.discount ? `<tr><td>Discount</td><td class="r">−${fmt(s.discount)}</td></tr>` : ''}
      <tr class="tot"><td>Total</td><td class="r">${fmt(s.total)}</td></tr></table>`;
  const canVoid = store.can('voidSale') && !s.voided;
  modal({
    title: fresh ? 'Sale complete' : `Receipt ${s.no}`,
    body: `
      ${s.voided ? `<p class="banner bad">This sale was cancelled${s.voidReason ? ': ' + esc(s.voidReason) : ''}. Stock was returned.</p>` : ''}
      <p class="muted">${esc(s.no)} · ${fmtDateTime(s.ts)} · ${esc(s.pay)}${s.customer ? ' · ' + esc(s.customer) : ''}${s.byName ? ' · by ' + esc(s.byName) : ''}</p>
      ${table}
      ${store.can('reports') ? `<p class="muted small">Cost of goods: ${fmt(s.cogs)} · Gross profit: ${fmt(s.total - s.cogs)}</p>` : ''}`,
    actions: `
      ${canVoid ? `<button type="button" class="btn ghost danger" data-void>Cancel sale</button>` : ''}
      <button type="button" class="btn ghost" data-share>${icon('wa')}WhatsApp</button>
      <button type="button" class="btn ghost" data-print>${icon('print')}Print</button>
      <button class="btn primary">${fresh ? 'Next sale' : 'Done'}</button>`,
    onMount: (dlg, close) => {
      dlg.querySelector('[data-print]').addEventListener('click', () => printHtml(`Receipt ${s.no}`, `
        <div style="max-width:320px;margin:auto"><h1>${esc(st.shopName)}</h1>
        <div class="muted">${esc(st.address)}<br>${esc(st.phone)}${st.tin ? '<br>TIN ' + esc(st.tin) : ''}</div>
        <p>Receipt ${esc(s.no)}<br>${fmtDateTime(s.ts)} · ${esc(s.pay)}</p>${table}<p style="text-align:center">Thank you!</p></div>`));
      dlg.querySelector('[data-share]').addEventListener('click', () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(receiptText(s))}`, '_blank', 'noopener');
      });
      dlg.querySelector('[data-void]')?.addEventListener('click', async () => {
        close();
        if (await confirmBox(`Cancel sale ${s.no} for ${fmt(s.total)}? The items go back into stock.`, { ok: 'Cancel sale', danger: true })) {
          store.voidSale(s, 'Cancelled');
          toast('Sale cancelled and stock returned');
        }
      });
    },
  });
}
