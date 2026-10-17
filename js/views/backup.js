// Backups: a full file you keep (weekly reminder), automatic daily snapshots kept in the shop,
// and restoring from either.
import { store } from '../store.js';
import { esc, fmtDate, fmtTime, icon, modal, toast, downloadFile, confirmBox } from '../ui.js';

export async function downloadFullBackup() {
  toast('Preparing the full backup…');
  try {
    const b = await store.fullBackup();
    const name = `${(b.shop || 'shop').replace(/[^\w-]+/g, '-').toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(name, JSON.stringify(b), 'application/json');
    store.markBackup();
    const n = ['items', 'sales', 'purchases', 'customers'].map((k) => `${(b[k] || []).length} ${k}`).join(', ');
    toast(`Backup saved: ${n}. Keep the file somewhere safe (Google Drive, email to yourself).`, { ms: 7000 });
  } catch (e) { toast(`Backup failed: ${e.message}`, { kind: 'err' }); }
}

export function backupCard() {
  const last = store.settings.lastBackupAt;
  return `
    <section class="card">
      <div class="card-head"><h2>Backup</h2></div>
      <p class="small">${last ? `Last full backup: <b>${fmtDate(last)}</b> ${fmtTime(last)}` : '<b>No full backup yet.</b>'}${store.backupDue() ? ' <span class="warn-text">— a new one is due</span>' : ''}</p>
      <p class="muted small">The full backup is one file with all your items, sales, purchases, customers and settings — every month. Keep it on Google Drive or email it to yourself once a week. ${store.mode === 'firebase' ? 'The app also keeps a snapshot of your items, customers and suppliers every day for 14 days.' : ''}</p>
      <div class="row-btns">
        <button class="btn ghost" data-act="backup-full">${icon('download')}Download full backup</button>
        ${store.can('clear') ? `<button class="btn ghost" data-act="restore">${icon('upload')}Restore…</button>` : ''}
      </div>
    </section>`;
}

/** Restore: pick a daily snapshot or a backup file, choose what to put back. */
export async function openRestore() {
  let snaps = [];
  if (store.mode === 'firebase') { try { snaps = await store.listSnapshots(); } catch { snaps = []; } }
  let src = null, srcName = '';
  modal({
    title: 'Restore from a backup',
    wide: true,
    body: `
      <p class="small">Puts items (names, prices, costs, levels), customers and suppliers back the way they were. Things added since are kept. You can undo a restore from Change history.</p>
      ${snaps.length ? `<h3 class="lay-h">Daily snapshots</h3><ul class="rows">${snaps.map((x) => `<li class="row"><div class="grow"><b>${fmtDate(x.ts)}</b><small>${x.counts?.items ?? '?'} items · ${x.counts?.customers ?? 0} customers · ${x.counts?.suppliers ?? 0} suppliers</small></div><button type="button" class="btn ghost small" data-snap="${x.id}">Use this</button></li>`).join('')}</ul>` : ''}
      <h3 class="lay-h">From a backup file</h3>
      <input type="file" id="rs-file" accept=".json,application/json">
      <div id="rs-pick"></div>`,
    actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary" id="rs-go" disabled>Restore</button>',
    onMount: (dlg) => {
      const pick = dlg.querySelector('#rs-pick');
      const show = (fromFile) => {
        const c = (k) => (src[k] || []).length;
        pick.innerHTML = `
          <div class="io-sum"><b>${esc(srcName)}</b>: ${c('items')} items, ${c('customers')} customers, ${c('suppliers')} suppliers${fromFile ? `, ${c('sales')} sales, ${c('purchases')} purchases` : ''}</div>
          <label class="check"><input type="checkbox" name="items" checked> Items — names, prices, costs, min / max, units</label>
          <label class="check"><input type="checkbox" name="withStock"> …and put stock quantities back too <small class="muted">(only if the counts were wrong)</small></label>
          <label class="check"><input type="checkbox" name="customers" checked> Customers <small class="muted">(what they owe now is kept)</small></label>
          <label class="check"><input type="checkbox" name="suppliers" checked> Suppliers</label>
          <label class="check"><input type="checkbox" name="settings"> Shop settings (details, payment methods, receipts…)</label>
          ${fromFile ? '<label class="check"><input type="checkbox" name="history"> Sales, purchases and other records missing on this shop <small class="muted">(added, never overwritten)</small></label>' : ''}`;
        dlg.querySelector('#rs-go').disabled = false;
      };
      dlg.querySelectorAll('[data-snap]').forEach((b) => b.addEventListener('click', async () => {
        try { src = await store.getSnapshot(b.dataset.snap); srcName = `Snapshot of ${b.dataset.snap}`; src.day = b.dataset.snap; show(false); } catch (e) { toast(e.message, { kind: 'err' }); }
      }));
      dlg.querySelector('#rs-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          src = JSON.parse(await f.text());
          if (!Array.isArray(src.items)) throw new Error('This is not a Shop Manager backup file');
          srcName = f.name; show(true);
        } catch (err) { src = null; pick.innerHTML = `<p class="warn-text">${esc(err.message)}</p>`; dlg.querySelector('#rs-go').disabled = true; }
      });
    },
    onSubmit: (v) => {
      if (!src) throw new Error('Choose a snapshot or a backup file');
      const opts = { items: v.items === 'on', withStock: v.withStock === 'on', customers: v.customers === 'on', suppliers: v.suppliers === 'on', settings: v.settings === 'on', history: v.history === 'on' };
      (async () => {
        if (!(await confirmBox(`Restore from ${srcName}? Items, customers and suppliers you chose go back to how they were in the backup.`, { ok: 'Restore', danger: true }))) return;
        try { const n = store.restoreFrom(src, opts); toast(`Restored ${n} records`); } catch (e) { toast(e.message, { kind: 'err' }); }
      })();
    },
  });
}

/** Home: weekly reminder for the owner. */
export function backupReminder() {
  if (!store.can('settings') || !store.backupDue()) return '';
  let snoozed = false;
  try { snoozed = localStorage.getItem('backup-snooze') === new Date().toISOString().slice(0, 10); } catch { /* ignore */ }
  if (snoozed) return '';
  return `<section class="card soft backup-due"><div class="grow"><b>${store.settings.lastBackupAt ? 'Weekly backup due' : 'Make your first full backup'}</b><small>One file with everything in your shop. Save it to Google Drive or email it to yourself.</small></div>
    <button class="btn primary" data-act="backup-full">${icon('download')}Download</button><button class="icon-btn" data-act="backup-later" aria-label="Remind me tomorrow">${icon('x')}</button></section>`;
}
