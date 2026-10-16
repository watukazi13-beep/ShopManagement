// Change history: what was changed, by whom and when — with Undo for owners
// (and managers the owner allows).
import { store } from '../store.js';
import { esc, fmtDate, fmtTime, modal, toast, confirmBox, emptyState } from '../ui.js';

const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return `${fmtDate(ts)} ${fmtTime(ts)}`;
};
const FIELD = { stock: 'stock', price: 'price', cost: 'cost', minStock: 'minimum', maxStock: 'maximum', lines: 'order lines', status: 'status', active: 'removed/active', name: 'name' };

/** Ask, then undo. Warns when the same things were changed again afterwards. */
export async function undoWithConfirm(rec) {
  if (!rec) { toast('That change is still saving — try again in a moment', { kind: 'warn' }); return false; }
  const later = store.changedSince(rec);
  const list = later.slice(0, 6).map((c) => `${c.name}${c.field ? ` (${FIELD[c.field] || c.field})` : ''}`).join(', ');
  const msg = `Undo “${rec.label}”? Everything it changed goes back to how it was before${rec.undo.some((o) => o.type === 'incr') ? ' (stock is corrected by the same amount, so sales made since are kept)' : ''}.`
    + (later.length ? ` Note: ${later.length} thing${later.length === 1 ? ' was' : 's were'} changed again since — ${list}${later.length > 6 ? '…' : ''}. Undo puts the older values back.` : '');
  if (!(await confirmBox(msg, { ok: 'Undo', danger: true }))) return false;
  try {
    await store.undoChange(rec);
    toast(`Undone: ${rec.label}`);
    return true;
  } catch (e) { toast(e.message, { kind: 'err' }); return false; }
}

/** After an action, add "Undo" to the message it showed (or show one). */
export function offerUndo({ id, label, at }) {
  if (!store.can('clear')) return;
  const run = () => undoWithConfirm(store.data.changes.find((c) => c.id === id));
  const last = toast.last;
  if (last && last.at >= at - 50 && last.kind !== 'err' && document.body.contains(last.el)) last.addAction('Undo', run);
  else toast(label, { action: { label: 'Undo', fn: run } });
}

export function openChanges() {
  const canUndo = store.can('clear');
  modal({
    title: 'Change history',
    wide: true,
    body: '<div id="ch-list"></div>',
    actions: '<button class="btn primary" value="cancel">Done</button>',
    onMount: (dlg, close) => {
      const el = dlg.querySelector('#ch-list');
      const draw = () => {
        const list = [...store.data.changes].sort((a, b) => b.ts - a.ts);
        el.innerHTML = `<p class="muted small">Imports, deliveries, stock counts and adjustments, price and min/max changes, and deletions from the last 60 days. ${canUndo ? 'Undo puts things back the way they were.' : 'Only the owner, or a manager the owner allows, can undo.'}</p>
          ${list.length ? `<ul class="rows ch-rows">${list.map((c) => `
            <li class="row ${c.undone ? 'ch-undone' : ''}">
              <div class="grow"><b>${esc(c.label)}</b>
                <small>${ago(c.ts)} · ${esc(c.byName || c.by || '')}${c.detail ? ' · ' + esc(c.detail) : ''}${c.undone ? ` · <span class="warn-text">undone ${ago(c.undoneAt)}${c.undoneBy ? ' by ' + esc(c.undoneBy) : ''}</span>` : ''}${c.tooBig ? ' · too large to undo' : ''}</small></div>
              ${canUndo && !c.undone && !c.tooBig && (c.undo || []).length ? `<button type="button" class="btn ghost small" data-undo="${c.id}">Undo</button>` : ''}
            </li>`).join('')}</ul>` : emptyState('No changes yet', 'When you import, receive, count stock or delete something, it shows here.')}`;
      };
      draw();
      el.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-undo]')?.dataset.undo;
        if (!id) return;
        close();
        await undoWithConfirm(store.data.changes.find((c) => c.id === id));
        setTimeout(openChanges, 300);
      });
    },
  });
}
