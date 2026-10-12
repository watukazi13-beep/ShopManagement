// Firebase backend: Google sign-in + Firestore with offline cache.
// Firestore keeps a full copy on the device, so the app works offline and
// queued changes upload automatically when the connection comes back.

const V = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseBackend(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Offline cache unavailable, using memory cache', e);
    db = F.getFirestore(app);
  }

  const unsubs = [];
  const pending = new Map();
  let errorHandler = () => {};

  const toDoc = (snap) => ({ ...snap.data(), id: snap.id });

  return {
    mode: 'firebase',

    onUser(cb) {
      A.getRedirectResult(auth).catch((e) => errorHandler(e));
      return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || u.email, photo: u.photoURL } : null));
    },

    async signIn() {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
          await A.signInWithRedirect(auth, provider);
        } else throw e;
      }
    },

    signOut() {
      unsubs.splice(0).forEach((u) => u());
      return A.signOut(auth);
    },

    onError(fn) { errorHandler = fn; },

    /** Live-watch the access document (owner + allowed people). */
    watchAccess(cb, onErr) {
      const u = F.onSnapshot(
        F.doc(db, 'meta', 'access'),
        (snap) => cb(snap.exists() ? snap.data() : null, snap.metadata.fromCache),
        (e) => onErr(e),
      );
      unsubs.push(u);
      return u;
    },

    /**
     * Subscribe to collections. specs: [{col, since?}] — `since` limits
     * history-type collections (sales, expenses…) to recent records.
     */
    watch(specs, onData, onSync) {
      for (const { col, since, docId } of specs) {
        const ref = docId
          ? F.doc(db, col, docId)
          : since
            ? F.query(F.collection(db, col), F.where('ts', '>=', since))
            : F.collection(db, col);
        const key = docId ? `${col}/${docId}` : col;
        const u = F.onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snap) => {
            pending.set(key, snap.metadata.hasPendingWrites);
            onSync([...pending.values()].some(Boolean));
            if (docId) onData(key, snap.exists() ? [toDoc(snap)] : []);
            else onData(col, snap.docs.map(toDoc));
          },
          (e) => errorHandler(e),
        );
        unsubs.push(u);
      }
    },

    newId(col) { return F.doc(F.collection(db, col)).id; },

    /**
     * Apply several changes together. Not awaited for the server, so it works
     * offline: the local copy updates at once and syncs later.
     * ops: {type:'set'|'merge'|'delete'|'incr', col, id, data?, field?, by?}
     */
    write(ops) {
      const batch = F.writeBatch(db);
      for (const op of ops) {
        const ref = F.doc(db, op.col, op.id);
        if (op.type === 'set') batch.set(ref, op.data);
        else if (op.type === 'merge') batch.set(ref, op.data, { merge: true });
        else if (op.type === 'delete') batch.delete(ref);
        else if (op.type === 'incr') batch.update(ref, { [op.field]: F.increment(op.by), updatedAt: Date.now(), ...(op.data || {}) });
      }
      batch.commit().catch((e) => errorHandler(e));
    },

    /** One-off read of older records (for reports on past months). */
    async fetchRange(col, from, to) {
      const q = F.query(F.collection(db, col), F.where('ts', '>=', from), F.where('ts', '<', to));
      const snap = await F.getDocs(q);
      return snap.docs.map(toDoc);
    },
  };
}
