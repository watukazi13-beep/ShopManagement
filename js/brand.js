// Who made the app. Shown on the sign-in screens, the computer side menu and Settings → About.
export const APP_NAME = 'Shop Manager';
export const MAKER = 'Greenlight Developers';
export const AUTHOR = 'Michael Kepha';
export const VERSION = '3.6'; // shown in Settings → About; raise it with each release
export const CREDIT = `Developed by ${MAKER} · Author: ${AUTHOR}`;

/**
 * The opening screen: a business book with the Greenlight G that opens,
 * flips through its ledger pages and closes again while the app loads.
 * index.html carries a static copy of this markup for the very first paint.
 */
export function bookLoader(text = 'Loading…') {
  const t = String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<main class="splash" role="status" aria-live="polite">
  <div class="book" aria-hidden="true">
    <div class="bk-back"><div class="bk-ledger"></div></div>
    <div class="bk-page p1"></div><div class="bk-page p2"></div><div class="bk-page p3"></div>
    <div class="bk-cover"><div class="bk-front"><img src="brand/symbol.svg" alt=""><i></i><b></b></div><div class="bk-inside"></div></div>
  </div>
  <p class="splash-name">${APP_NAME}</p>
  <p class="splash-text">${t}</p>
  <img class="splash-dev" src="brand/developers-logo-on-dark.svg" alt="${MAKER}">
</main>`;
}
