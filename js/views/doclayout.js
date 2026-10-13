// Which columns and parts appear on a request for quotation (RFQ) or purchase order (PO).
// Each column is 'fill' (your figures), 'blank' (title only — the supplier writes the figure) or 'hide'.
import { store } from '../store.js';
import { esc, modal, toast, icon } from '../ui.js';

export const COLUMNS = [
  { key: 'no', title: '#', modes: ['fill', 'hide'] },
  { key: 'sku', title: 'Code / SKU', modes: ['fill', 'blank', 'hide'] },
  { key: 'unit', title: 'Unit', modes: ['fill', 'blank', 'hide'] },
  { key: 'qty', title: 'Qty', modes: ['fill', 'blank', 'hide'] },
  { key: 'pieces', title: 'Total pieces', modes: ['fill', 'blank', 'hide'] },
  { key: 'price', title: 'Price per unit', modes: ['fill', 'blank', 'hide'] },
  { key: 'amount', title: 'Amount', modes: ['fill', 'blank', 'hide'] },
  { key: 'brand', title: 'Brand', modes: ['blank', 'hide'] },
  { key: 'available', title: 'Available (Yes/No)', modes: ['blank', 'hide'] },
  { key: 'delivery', title: 'Delivery time', modes: ['blank', 'hide'] },
  { key: 'remarks', title: 'Remarks', modes: ['blank', 'hide'] },
];

export const PARTS = [
  { key: 'dates', rfq: 'Reply-by date', po: 'Deliver-by date' },
  { key: 'address', rfq: 'Deliver-to address (your shop)', po: 'Deliver-to address (your shop)' },
  { key: 'terms', rfq: 'Payment terms (line for the supplier)', po: 'Payment terms (line to fill in)' },
  { key: 'note', rfq: 'Message to the supplier', po: 'Message to the supplier' },
  { key: 'signatures', rfq: 'Signature boxes', po: 'Signature boxes' },
];

const DEFAULTS = {
  rfq: {
    cols: { no: 'fill', sku: 'hide', unit: 'fill', qty: 'fill', pieces: 'fill', price: 'blank', amount: 'blank', brand: 'blank', available: 'hide', delivery: 'blank', remarks: 'hide' },
    custom: [],
    parts: { dates: true, address: false, terms: true, note: true, signatures: true },
  },
  po: {
    cols: { no: 'fill', sku: 'hide', unit: 'fill', qty: 'fill', pieces: 'fill', price: 'fill', amount: 'fill', brand: 'hide', available: 'hide', delivery: 'hide', remarks: 'blank' },
    custom: [],
    parts: { dates: true, address: true, terms: false, note: true, signatures: true },
  },
};

const MODE_TEXT = { fill: 'Filled', blank: 'Blank for supplier', hide: 'Hidden' };

/** The layout to use: the document's own, else the shop default, else the built-in default (missing keys filled in). */
export function layoutFor(kind, doc) {
  const base = DEFAULTS[kind];
  const src = doc?.layout || store.settings.docLayout?.[kind] || {};
  const cols = { ...base.cols };
  for (const c of COLUMNS) if (src.cols?.[c.key] && c.modes.includes(src.cols[c.key])) cols[c.key] = src.cols[c.key];
  const custom = (src.custom || []).filter((c) => c && String(c.title || '').trim()).map((c) => ({ title: String(c.title).trim(), mode: c.mode === 'hide' ? 'hide' : 'blank' }));
  return { cols, custom, parts: { ...base.parts, ...(src.parts || {}) } };
}

/** Visible columns in order: built-in ones then your own. Item name is always first after #. */
export function visibleColumns(layout) {
  const out = [];
  for (const c of COLUMNS) if (layout.cols[c.key] !== 'hide') out.push({ key: c.key, title: c.title, mode: layout.cols[c.key] });
  layout.custom.forEach((c, i) => { if (c.mode !== 'hide') out.push({ key: `custom${i}`, title: c.title, mode: 'blank' }); });
  return out;
}

/**
 * Choose columns and parts for one document. onSave(layout) gets the new layout;
 * "Use as default" also stores it for new documents of this kind.
 */
export function openLayoutEditor(kind, current, onSave) {
  const L = structuredClone(current);
  const name = kind === 'rfq' ? 'requests for quotation' : 'purchase orders';
  const colRow = (c) => `
    <div class="lay-row"><span class="lay-name">${esc(c.title)}</span>
      <div class="seg mini" role="radiogroup" aria-label="${esc(c.title)}">
        ${c.modes.map((m) => `<label class="${L.cols[c.key] === m ? 'on' : ''}"><input type="radio" name="col-${c.key}" value="${m}" ${L.cols[c.key] === m ? 'checked' : ''}>${MODE_TEXT[m]}</label>`).join('')}
      </div></div>`;
  const customRow = (c, i) => `
    <div class="lay-row" data-custom="${i}"><input class="lay-title" value="${esc(c.title)}" aria-label="Column title" maxlength="30">
      <div class="seg mini" role="radiogroup" aria-label="${esc(c.title)}">
        ${['blank', 'hide'].map((m) => `<label class="${c.mode === m ? 'on' : ''}"><input type="radio" name="cus-${i}" value="${m}" ${c.mode === m ? 'checked' : ''}>${MODE_TEXT[m]}</label>`).join('')}
      </div>
      <button type="button" class="icon-btn" data-del-custom="${i}" aria-label="Remove column">${icon('x')}</button></div>`;
  modal({
    title: kind === 'rfq' ? 'Columns on the request for quotation' : 'Columns on the purchase order',
    wide: true,
    body: `
      <p class="muted small"><b>Filled</b> shows your figures. <b>Blank for supplier</b> prints the title with empty boxes for the supplier to write in. <b>Hidden</b> leaves it out. The item name is always shown.</p>
      <div class="lay-list">${COLUMNS.map(colRow).join('')}</div>
      <h3 class="lay-h">Your own columns</h3>
      <div class="lay-list" id="lay-custom">${L.custom.map(customRow).join('') || '<p class="muted small" id="lay-none">None yet — e.g. “Expiry date”, “Colour”, “Pack size offered”.</p>'}</div>
      <div class="inline-form"><input id="lay-new" placeholder="New column title" maxlength="30" aria-label="New column title"><button type="button" class="btn ghost" data-add-custom>${icon('plus')}Add column</button></div>
      <h3 class="lay-h">Parts of the document</h3>
      ${PARTS.map((p) => `<label class="check"><input type="checkbox" name="part-${p.key}" ${L.parts[p.key] ? 'checked' : ''}> ${esc(p[kind])}</label>`).join('')}
      <label class="check lay-default"><input type="checkbox" name="asDefault" checked> Use this layout for new ${name} too</label>`,
    actions: `<button type="button" class="btn ghost" data-reset>Reset</button><button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Apply</button>`,
    onMount: (dlg, close) => {
      const box = dlg.querySelector('#lay-custom');
      const readCustom = () => [...box.querySelectorAll('[data-custom]')].map((row) => ({
        title: row.querySelector('.lay-title').value.trim(),
        mode: row.querySelector('input[type=radio]:checked')?.value || 'blank',
      }));
      const redrawCustom = (list) => { box.innerHTML = list.map(customRow).join('') || '<p class="muted small">None yet.</p>'; };
      dlg.addEventListener('change', (e) => {
        if (e.target.type === 'radio') e.target.closest('.seg').querySelectorAll('label').forEach((l) => l.classList.toggle('on', l.contains(e.target)));
      });
      dlg.querySelector('[data-add-custom]').addEventListener('click', () => {
        const inp = dlg.querySelector('#lay-new');
        const title = inp.value.trim();
        if (!title) { inp.focus(); return; }
        const list = readCustom(); list.push({ title, mode: 'blank' }); redrawCustom(list); inp.value = ''; inp.focus();
      });
      dlg.querySelector('#lay-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('[data-add-custom]').click(); } });
      box.addEventListener('click', (e) => {
        const i = e.target.closest('[data-del-custom]')?.dataset.delCustom;
        if (i === undefined) return;
        const list = readCustom(); list.splice(Number(i), 1); redrawCustom(list);
      });
      dlg.querySelector('[data-reset]').addEventListener('click', () => {
        close();
        const def = structuredClone(DEFAULTS[kind]);
        setTimeout(() => openLayoutEditor(kind, def, onSave), 50);
      });
      dlg._readCustom = readCustom;
    },
    onSubmit: (v, { form }) => {
      const out = { cols: {}, custom: form.closest('dialog')._readCustom().filter((c) => c.title), parts: {} };
      for (const c of COLUMNS) out.cols[c.key] = v[`col-${c.key}`] || L.cols[c.key];
      for (const p of PARTS) out.parts[p.key] = v[`part-${p.key}`] === 'on';
      if (v.asDefault === 'on') {
        store.saveSettings({ docLayout: { ...(store.settings.docLayout || {}), [kind]: out } });
        toast('Layout applied and saved as the default');
      } else toast('Layout applied to this document');
      onSave(out);
    },
  });
}
