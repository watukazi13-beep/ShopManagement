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
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  sell: '<path d="M4 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20.5 8H7"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  stock: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  orders: '<path d="M7 3h10l3 3v15H4V3z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  money: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shops: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7M10 20v-4h4v4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
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
export function toast(msg, { kind = 'ok', link, ms = 3200, action } = {}) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.append(wrap); }
  // Keep at most two messages on screen so they never cover the page.
  while (wrap.children.length >= 2) wrap.firstElementChild.remove();
  const t = document.createElement(link ? 'a' : 'div');
  t.className = `toast toast-${kind}`;
  if (link) t.href = link;
  t.innerHTML = `<span class="toast-msg">${esc(msg)}</span>`;
  t.setAttribute('role', 'status');
  wrap.append(t);
  const timer = { out: setTimeout(() => t.classList.add('out'), ms), rm: setTimeout(() => t.remove(), ms + 400) };
  const api = {
    el: t, at: Date.now(), kind,
    /** Add a button (e.g. Undo) and keep the message up longer. */
    addAction(label, fn, keepMs = 9000) {
      if (t.querySelector('.toast-act')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-act'; b.textContent = label;
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); t.remove(); fn(); });
      t.append(b);
      clearTimeout(timer.out); clearTimeout(timer.rm);
      timer.out = setTimeout(() => t.classList.add('out'), keepMs);
      timer.rm = setTimeout(() => t.remove(), keepMs + 400);
    },
  };
  if (action) api.addAction(action.label, action.fn, action.ms);
  toast.last = api;
  return api;
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
/** Same as field(), for a label that carries its own markup (e.g. a unit name that updates as you type). */
export function fieldHtml(labelHtml, input, hint = '') {
  return `<label class="field"><span class="field-label">${labelHtml}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
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

/**
 * Show a printable document (receipt, quotation request, purchase order, report)
 * full-screen with a "Save as PDF / Print" button. Printing shows only the document,
 * so "Save as PDF" in the print dialog gives a clean PDF file on phones and computers.
 */
export function printHtml(title, inner, { autoPrint = false } = {}) {
  document.getElementById('print-root')?.remove();
  // A modal <dialog> sits above any open window, so "Back" returns to it.
  const root = document.createElement('dialog');
  root.id = 'print-root';
  root.setAttribute('aria-label', title);
  const logo = store.settings.logo ? `<img class="doc-logo" src="${esc(store.settings.logo)}" alt="">` : '';
  root.innerHTML = `
    <div class="doc-bar">
      <button type="button" class="btn ghost" data-doc-close>${icon('back')}Back</button>
      <b class="doc-title">${esc(title)}</b>
      <button type="button" class="btn primary" data-doc-print>${icon('download')}Save as PDF / Print</button>
    </div>
    <div class="doc-scroll"><article class="doc">${logo}${inner}</article></div>`;
  document.body.append(root);
  document.body.classList.add('doc-open');
  const oldTitle = document.title;
  root.addEventListener('close', () => { root.remove(); document.body.classList.remove('doc-open'); document.title = oldTitle; });
  const close = () => root.close();
  const print = () => { document.title = title; window.print(); setTimeout(() => { document.title = oldTitle; }, 1000); };
  root.showModal();
  root.querySelector('[data-doc-close]').addEventListener('click', close);
  root.querySelector('[data-doc-print]').addEventListener('click', print);
  if (autoPrint) setTimeout(print, 300);
  return { close, print, el: root };
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function statusPill(status) {
  const map = { out: ['Out of stock', 'bad'], low: ['Low', 'warn'], onorder: ['On order', 'info'], ok: ['OK', 'good'] };
  const [t, c] = map[status] || [status, ''];
  return `<span class="pill ${c}">${t}</span>`;
}
