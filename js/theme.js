// Light / dark theme. Saved on this device only; "auto" follows the phone or computer.
const KEY = 'theme';
const BAR = { light: '#0F4A2E', dark: '#0A2417' };
const media = window.matchMedia?.('(prefers-color-scheme: dark)');

/** 'auto' | 'light' | 'dark' */
export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}

/** The theme actually showing right now. */
export function shownTheme() {
  const t = getTheme();
  if (t !== 'auto') return t;
  return media?.matches ? 'dark' : 'light';
}

export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[shownTheme()]);
  document.dispatchEvent(new CustomEvent('themechange', { detail: shownTheme() }));
}

export function setTheme(t) {
  try { if (t === 'light' || t === 'dark') localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private window: still applies for this visit */ }
  applyTheme(t);
}

/** Flip between light and dark from whatever is showing now. */
export function toggleTheme() {
  setTheme(shownTheme() === 'dark' ? 'light' : 'dark');
}

// Follow the device when set to automatic.
media?.addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto'); });
