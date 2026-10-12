// Device-only backend (demo / trying the app before Firebase is set up).
// Data stays in this browser only and does not sync.

const KEY = 'shop-local-data-v1';

export function createLocalBackend() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { data = {}; }
  const watchers = [];
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error(e); }
  };
  const docs = (col) => Object.entries(data[col] || {}).map(([id, d]) => ({ ...d, id }));
  const emit = () => {
    for (const { col, since, docId, onData } of watchers) {
      if (docId) onData(`${col}/${docId}`, data[col]?.[docId] ? [{ ...data[col][docId], id: docId }] : []);
      else onData(col, docs(col).filter((d) => !since || d.ts >= since));
    }
  };

  const user = { uid: 'local', email: 'this-device', name: 'This device' };

  return {
    mode: 'local',
    onUser(cb) { setTimeout(() => cb(user), 0); return () => {}; },
    async signIn() {},
    async signOut() {},
    onError() {},
    watchAccess(cb) { setTimeout(() => cb({ owner: 'local', members: {} }, false), 0); return () => {}; },
    watch(specs, onData, onSync) {
      for (const s of specs) watchers.push({ ...s, onData });
      onSync(false);
      setTimeout(emit, 0);
    },
    newId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
    write(ops) {
      for (const op of ops) {
        const c = (data[op.col] ||= {});
        if (op.type === 'set') c[op.id] = structuredClone(op.data);
        else if (op.type === 'merge') c[op.id] = { ...(c[op.id] || {}), ...structuredClone(op.data) };
        else if (op.type === 'delete') delete c[op.id];
        else if (op.type === 'incr' && c[op.id]) {
          c[op.id] = { ...c[op.id], ...(op.data || {}), [op.field]: (Number(c[op.id][op.field]) || 0) + op.by, updatedAt: Date.now() };
        }
      }
      save();
      emit();
    },
    async fetchRange(col, from, to) {
      return docs(col).filter((d) => d.ts >= from && d.ts < to);
    },
    exportAll() { return structuredClone(data); },
  };
}
