// Installing the app (home screen / desktop). Chrome and Edge fire `beforeinstallprompt`
// when the app can be installed; iPhone and iPad need Share → Add to Home Screen.
import { modal } from './ui.js';

let deferred = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  try { localStorage.setItem('app-installed', '1'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
});

export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  || (() => { try { return localStorage.getItem('app-installed') === '1' && matchMedia('(display-mode: browser)').matches === false; } catch { return false; } })();
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferred;
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Install straight away when the browser allows it, otherwise show how for this device. */
export async function installApp() {
  if (deferred) {
    const e = deferred;
    deferred = null;
    e.prompt();
    try { await e.userChoice; } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
    return;
  }
  const ios = isIOS();
  modal({
    title: 'Install the app',
    body: ios
      ? `<ol class="steps-list">
           <li>Open this page in <b>Safari</b>.</li>
           <li>Tap the <b>Share</b> button (the square with an arrow).</li>
           <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
         </ol>`
      : `<p><b>Android (Chrome):</b> tap the <b>⋮</b> menu at the top right, then <b>Install app</b> or <b>Add to Home screen</b>.</p>
         <p><b>Computer (Chrome or Edge):</b> click the install icon at the right end of the address bar, or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install</b>.</p>
         <p class="muted small">If you don't see the option, open the app once while online, wait a few seconds, then try again. It must be opened in Chrome or Edge, not inside WhatsApp or another app.</p>`,
    actions: '<button class="btn primary">OK</button>',
  });
}
