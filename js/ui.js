// Small UI helpers: formatting, dialogs, toasts, icons.
import { store } from './store.js';
import { num } from './calc.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(v, { sign = false, bare = false } = {}) {
  const n = Math.round(num(v));
  const s = Math.abs(n).toLocaleString('en-US');
  const cur = bare ? '' : (store.settings.currency === 'TZS' ? 'TSh ' : store.settings.currency + ' ');
  return (n < 0 ? '−' : sign && n > 0 ? '+' : '') + cur + s;
}
export const fmtQty = (q) => {
  const n = num(q);
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
export const pct = (v) => `${(num(v) * 100).toFixed(1)}%`;
export const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (ts) => `${fmtDate(ts)}, ${fmtTime(ts)}`;
export const toInputDate = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fromInputDate = (v) => {
  const [y, m, d] = v.split('-').map(Number);
  const now = new Date();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).getTime();
};

const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  sell: '<path d="M4 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20.5 8H7"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  stock: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  orders: '<path d="M7 3h10l3 3v15H4V3z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  money: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M6 14h12v7H6z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c.3 2 2.2 4.2 4.5 4.8l1.2-1.1 1.8.8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

// ---------- Toasts ----------
export function toast(msg, { kind = 'ok', link, ms = 3200 } = {}) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.append(wrap); }
  const t = document.createElement(link ? 'a' : 'div');
  t.className = `toast toast-${kind}`;
  if (link) t.href = link;
  t.innerHTML = esc(msg);
  t.setAttribute('role', 'status');
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// ---------- Dialogs ----------
/**
 * Open a modal. `body` is HTML; returns {el, close}. onSubmit receives FormData
 * values when the dialog contains a <form>; return false to keep it open.
 */
export function modal({ title, body, actions = '', wide = false, onMount, onSubmit, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet${wide ? ' wide' : ''}`;
  dlg.innerHTML = `
    <form method="dialog" class="sheet-in" novalidate>
      <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="sheet-body">${body}</div>
      ${actions ? `<footer class="sheet-foot">${actions}</footer>` : ''}
    </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
    if (e.target.closest('[data-close]')) close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    if (submitter?.value === 'cancel') return close();
    if (!onSubmit) return close();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const keep = onSubmit(values, { form, submitter, close });
      if (keep !== false) close();
    } catch (err) {
      toast(err.message || String(err), { kind: 'err' });
    }
  });
  dlg.showModal();
  onMount?.(dlg, close);
  const first = dlg.querySelector('[autofocus]');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
  return { el: dlg, close };
}

export function confirmBox(message, { ok = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    modal({
      title: 'Please confirm',
      body: `<p>${esc(message)}</p>`,
      actions: `<button class="btn ghost" value="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button>`,
      onSubmit: () => { answer = true; },
      onClose: () => resolve(answer),
    });
  });
}

/** Simple labelled field. */
export function field(label, input, hint = '') {
  return `<label class="field"><span class="field-label">${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function toCsv(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

/** Minimal CSV parser (handles quotes, commas, newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Print an HTML document (receipts, RFQs, reports) in a hidden frame. */
export function printHtml(title, inner) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:24px}
    h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;margin:18px 0 6px}
    .muted{color:#555} table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;vertical-align:top}
    th{background:#f1f1f1} .r{text-align:right} .tot td{font-weight:700;border-top:2px solid #111}
    .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:10px}
    .box{border:1px solid #bbb;padding:8px 10px;margin-top:12px} .sig{margin-top:40px;display:flex;gap:40px}
    .sig div{flex:1;border-top:1px solid #111;padding-top:4px}
    @page{margin:14mm}
  </style></head><body>${inner}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 2000); }, 250);
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function statusPill(status) {
  const map = { out: ['Out of stock', 'bad'], low: ['Low', 'warn'], ok: ['OK', 'good'] };
  const [t, c] = map[status] || [status, ''];
  return `<span class="pill ${c}">${t}</span>`;
}
