// Test stand-in for Firestore, with a simplified copy of firestore.rules.
const KEY = 'fake-fs';
const db = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const listeners = new Set();
const user = () => JSON.parse(localStorage.getItem('fake-user') || 'null');
function legacyRole() {
  const acc = db['meta/access']; const u = user();
  if (!u || !acc) return null;
  if (acc.owner === u.uid) return 'owner';
  return acc.members?.[u.email] || null;
}
const isAdmin = () => { const u = user(); return !!(u && db['platform/admins']?.admins?.[u.email]); };
function shopRole(shopId) {
  const u = user(); const sh = db[`shops/${shopId}`];
  if (!u || !sh) return null;
  if (isAdmin()) return 'owner';
  if ((sh.owners || []).includes(u.email)) return 'owner';
  return sh.members?.[u.email] || null;
}
/** Which shop a path belongs to, its role, and the collection inside it. */
function scope(path) {
  const seg = path.split('/');
  if (seg[0] === 'shops' && seg.length > 2) return { shopId: seg[1], col: seg[2], id: seg[3], role: shopRole(seg[1]) };
  return { shopId: null, col: seg[0], id: seg[1], role: legacyRole() };
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
export async function getDoc(ref) { return snap(ref); }
export function query(c, ...w) { return { type: 'query', path: c.path, wheres: w }; }
export function increment(n) { return { __inc: n }; }

function snap(ref) {
  const meta = { fromCache: false, hasPendingWrites: false };
  const u = user();
  if (ref.type === 'doc') {
    const d = db[ref.path];
    if (ref.path === 'meta/access') {
      if (!u) throw denied();
      if (d && !(d.owner === u.uid || (d.members || {})[u.email])) throw denied();
    } else if (ref.path === 'platform/admins') {
      if (!u) throw denied();
    } else if (/^shops\/[^/]+$/.test(ref.path)) {
      if (!u || (!isAdmin() && !(d?.memberEmails || []).includes(u.email))) throw denied();
    } else if (!scope(ref.path).role) throw denied();
    return { id: ref.id, exists: () => !!d, data: () => (d ? structuredClone(d) : undefined), metadata: meta };
  }
  const wheres = ref.wheres || [];
  if (ref.path === 'shops') {
    if (!u) throw denied();
    if (!isAdmin() && !wheres.some((w) => w.f === 'memberEmails' && w.op === 'array-contains' && w.v === u.email)) throw denied();
  } else if (!scope(ref.path + '/x').role) throw denied();
  const depth = ref.path.split('/').length + 1;
  const docs = Object.entries(db)
    .filter(([p]) => p.startsWith(ref.path + '/') && p.split('/').length === depth)
    .filter(([, d]) => wheres.every((w) => (w.op === '>=' ? d[w.f] >= w.v : w.op === '<' ? d[w.f] < w.v : w.op === 'array-contains' ? (d[w.f] || []).includes(w.v) : true)))
    .map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) }));
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
  const u = user();
  if (!u) return false;
  if (path === 'platform/admins') {
    if (kind === 'set' && !old) return Object.keys(data.admins || {}).join() === u.email && data.admins[u.email] === true && (!db['meta/access'] || db['meta/access'].owner === u.uid);
    return isAdmin() && (data.admins ? data.admins[u.email] === true : true);
  }
  if (/^shops\/[^/]+$/.test(path)) {
    if (!old) return isAdmin();
    if (isAdmin()) return true;
    return (old.owners || []).includes(u.email) && (!data.owners || JSON.stringify(data.owners) === JSON.stringify(old.owners));
  }
  if (path === 'meta/access') {
    if (kind === 'set' && !old) return data.owner === u.uid && Object.keys(data.members || {}).length === 0;
    return legacyRole() === 'owner';
  }
  const { shopId, col, role: r } = scope(path);
  if (!shopId) return false; // the old single-shop layout is read-only now
  if (!r) return false;
  if (col === 'changes') {
    const clear = r === 'owner' || (r === 'manager' && db[`shops/${shopId}`]?.canClear?.[u.email] === true);
    if (kind === 'set' && !old) return data.by === u.email;
    if (kind === 'update' || kind === 'merge') return clear && Object.keys(data).every((k) => ['undone', 'undoneAt', 'undoneBy'].includes(k));
    return false;
  }
  if (r === 'owner') return true;
  if (r === 'manager') {
    if (kind !== 'delete') return true;
    const clear = db[`shops/${shopId}`]?.canClear?.[u.email] === true;
    if (col === 'pos') return ['draft', 'ordered', 'cancelled'].includes(old?.status) || clear;
    if (['purchases', 'adjustments', 'expenses'].includes(col)) return clear;
    return col !== 'sales';
  }
  const recv = db[`shops/${shopId}/meta/settings`]?.staffCanReceive === true;
  if (col === 'sales' && kind === 'set' && !old) return data.by === u.email;
  if (col === 'customers' && kind !== 'delete') return true;
  if (col === 'payments' && kind === 'set' && !old) return data.by === u.email;
  if (col === 'shifts' && kind === 'set' && !old) return true;
  if (col === 'shifts' && kind === 'update') return old?.by === u.email;
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
