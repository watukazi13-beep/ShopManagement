// Test stand-in for Firestore, with a simplified copy of firestore.rules.
const KEY = 'fake-fs';
const db = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const listeners = new Set();
const user = () => JSON.parse(localStorage.getItem('fake-user') || 'null');
function role() {
  const acc = db['meta/access']; const u = user();
  if (!u || !acc) return null;
  if (acc.owner === u.uid) return 'owner';
  return acc.members?.[u.email] || null;
}
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
window.__fsWrites = 0; window.__fsDenied = [];

export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export function initializeFirestore() { return {}; }
export function getFirestore() { return {}; }
export function collection(_d, name) { return { type: 'col', path: name }; }
export function doc(a, ...segs) {
  if (a && a.type === 'col') { const id = segs[0] || Math.random().toString(36).slice(2, 12); return { type: 'doc', path: `${a.path}/${id}`, id }; }
  return { type: 'doc', path: segs.join('/'), id: segs[segs.length - 1] };
}
export function where(f, op, v) { return { f, op, v }; }
export function query(c, ...w) { return { type: 'query', path: c.path, wheres: w }; }
export function increment(n) { return { __inc: n }; }

function snap(ref) {
  const r = role();
  const meta = { fromCache: false, hasPendingWrites: false };
  if (ref.type === 'doc') {
    const d = db[ref.path];
    if (ref.path === 'meta/access') {
      const u = user();
      if (!u) throw denied();
      if (d && !(d.owner === u.uid || (d.members || {})[u.email])) throw denied();
    } else if (!r) throw denied();
    return { id: ref.id, exists: () => !!d, data: () => (d ? structuredClone(d) : undefined), metadata: meta };
  }
  if (!r) throw denied();
  const docs = Object.entries(db)
    .filter(([p]) => p.split('/')[0] === ref.path && p.split('/').length === 2)
    .filter(([, d]) => (ref.wheres || []).every((w) => (w.op === '>=' ? d[w.f] >= w.v : w.op === '<' ? d[w.f] < w.v : true)))
    .map(([p, d]) => ({ id: p.split('/')[1], data: () => structuredClone(d) }));
  return { docs, metadata: meta };
}
function fire(l) { try { l.next(snap(l.ref)); } catch (e) { listeners.delete(l); l.err?.(e); } }

export function onSnapshot(ref, a, b, c) {
  const [next, err] = typeof a === 'function' ? [a, b] : [b, c];
  const l = { ref, next, err };
  listeners.add(l);
  setTimeout(() => fire(l), 0);
  return () => listeners.delete(l);
}
export async function getDocs(q) { return snap(q); }

function allowed(kind, path, data, old) {
  const r = role(); const col = path.split('/')[0]; const u = user();
  if (path === 'meta/access') {
    if (kind === 'set' && !old) return u && data.owner === u.uid && Object.keys(data.members || {}).length === 0;
    return r === 'owner';
  }
  if (!r) return false;
  if (r === 'owner' || r === 'manager') return true;
  if (col === 'sales' && kind === 'set' && !old) return data.by === u.email;
  const recv = db['meta/settings']?.staffCanReceive === true;
  if (col === 'items' && kind === 'update') return Object.keys(data).every((k) => (recv ? ['stock', 'updatedAt', 'cost', 'lastCost', 'updatedBy'] : ['stock', 'updatedAt']).includes(k));
  if (col === 'pos' && kind === 'update' && recv) return Object.keys(data).every((k) => ['lines', 'status', 'closedShort', 'receivedAt', 'updatedAt', 'updatedBy'].includes(k));
  if (col === 'purchases' && kind === 'set' && !old) return recv;
  return false;
}
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, opt) { ops.push({ kind: opt?.merge ? 'merge' : 'set', ref, data }); },
    update(ref, data) { ops.push({ kind: 'update', ref, data }); },
    delete(ref) { ops.push({ kind: 'delete', ref }); },
    commit() {
      for (const o of ops) {
        if (!allowed(o.kind === 'merge' ? (db[o.ref.path] ? 'update' : 'set') : o.kind, o.ref.path, o.data || {}, db[o.ref.path])) {
          window.__fsDenied.push(o.ref.path);
          return Promise.reject(denied());
        }
      }
      for (const o of ops) {
        const p = o.ref.path;
        if (o.kind === 'set') db[p] = structuredClone(o.data);
        else if (o.kind === 'merge') db[p] = { ...(db[p] || {}), ...structuredClone(o.data) };
        else if (o.kind === 'delete') delete db[p];
        else if (o.kind === 'update') {
          if (!db[p]) return Promise.reject(Object.assign(new Error('No document to update'), { code: 'not-found' }));
          const cur = { ...db[p] };
          for (const [k, v] of Object.entries(o.data)) cur[k] = v && v.__inc !== undefined ? (Number(cur[k]) || 0) + v.__inc : v;
          db[p] = cur;
        }
      }
      window.__fsWrites++;
      save();
      [...listeners].forEach(fire);
      return Promise.resolve();
    },
  };
}
