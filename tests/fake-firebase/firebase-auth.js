// Test stand-in for Firebase Auth. The "next" user to sign in is set in localStorage.
const cbs = [];
const cur = () => JSON.parse(localStorage.getItem('fake-user') || 'null');
const toUser = (u) => u && { uid: u.uid, email: u.email, displayName: u.name, photoURL: null };
export function getAuth() { return {}; }
export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup() {
  const u = JSON.parse(localStorage.getItem('fake-next-user'));
  localStorage.setItem('fake-user', JSON.stringify(u));
  cbs.forEach((c) => c(toUser(u)));
}
export async function signInWithRedirect() {}
export async function getRedirectResult() { return null; }
export function onAuthStateChanged(a, cb) { cbs.push(cb); setTimeout(() => cb(toUser(cur())), 0); return () => {}; }
export async function signOut() { localStorage.removeItem('fake-user'); cbs.forEach((c) => c(null)); }
