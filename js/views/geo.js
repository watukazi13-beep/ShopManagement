// Shop location (4.20): shifts open and close only within the set distance of the shop.
import { store } from '../store.js';
import { modal, esc, toast } from '../ui.js';

export const DEFAULT_RADIUS = 200;
const ACC_ALLOW = 50; // a little room for the phone's own GPS error

/** The shop's place from Settings, or null when the check is off or not set. */
export function shopPlace() {
  const s = store.settings;
  if (!s.geoOn || !Number.isFinite(Number(s.shopLat)) || !Number.isFinite(Number(s.shopLng)) || s.shopLat === '' || s.shopLng === '') return null;
  return { lat: Number(s.shopLat), lng: Number(s.shopLng), radius: Number(s.shopRadius) || DEFAULT_RADIUS };
}

/** Distance in metres between two points (haversine). */
export function distanceM(a, b) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** Where this phone is now. Rejects with { code } like the browser does (1 = refused, 2 = unavailable, 3 = too slow). */
export function here() {
  if (window.__fakeGeo) return window.__fakeGeo(); // tests only
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject({ code: 2 }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
      (e) => reject({ code: e.code || 2 }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
  });
}

/**
 * Check that this phone is at the shop before opening or closing a shift.
 * Resolves { ok: true, geo } (geo = { d, acc } or null when the check is off), or { ok: false } after telling the person why.
 */
export async function checkAtShop(what = 'open the shift') {
  const shop = shopPlace();
  if (!shop) return { ok: true, geo: null };
  const wait = toast('Checking where you are…', { ms: 20000 });
  let pos;
  try { pos = await here(); } catch (e) {
    wait?.el?.remove();
    return { ok: false, retry: await tellNoLocation(e.code, what) };
  }
  wait?.el?.remove();
  const d = distanceM(shop, pos);
  const geo = { d, acc: pos.acc };
  if (d - Math.min(pos.acc || 0, ACC_ALLOW) <= shop.radius) return { ok: true, geo };
  await tellTooFar(d, shop.radius, what);
  return { ok: false, geo };
}

/** Keep asking until the person is at the shop or gives up. */
export async function atShopOrStop(what) {
  for (;;) {
    const r = await checkAtShop(what);
    if (r.ok || !r.retry) return r;
  }
}

function tellTooFar(d, radius, what) {
  const shop = esc(store.settings.shopName || 'the shop');
  return new Promise((resolve) => modal({
    title: 'You are not at the shop',
    body: `<div class="geo-msg"><p class="geo-big">${fmtDist(d)}</p><p>You are <b>${fmtDist(d)}</b> from <b data-no-tr>${shop}</b>.</p>
      <p class="muted">You can ${what} only at the shop, within ${radius} m. Go to the shop and try again.</p></div>`,
    actions: '<button class="btn primary" value="cancel">OK</button>',
    onClose: resolve,
  }));
}

function tellNoLocation(code, what) {
  return new Promise((resolve) => {
    let retry = false;
    modal({
      title: code === 1 ? 'Allow location' : 'Location not found',
      body: `<div class="geo-msg">
        <p>To ${what}, the app must see that you are at the shop.</p>
        ${code === 1
    ? `<p class="muted">Location is blocked for this app. Turn it on:</p>
          <ol class="geo-steps"><li>Turn on <b>Location</b> on the phone.</li><li>Tap the <b>lock</b> or <b>ⓘ</b> next to the web address, then <b>Permissions → Location → Allow</b>.</li><li>Tap <b>Try again</b>.</li></ol>`
    : '<p class="muted">Turn on Location on the phone, go near a window or outside the shop door, then tap Try again.</p>'}
      </div>`,
      actions: '<button class="btn ghost" value="cancel">Cancel</button><button class="btn primary">Try again</button>',
      onSubmit: () => { retry = true; },
      onClose: () => resolve(retry),
    });
  });
}

/** Settings: fill the shop position from where this phone is now. */
export async function useMyPosition(form) {
  try {
    const p = await here();
    form.querySelector('[name=shopLat]').value = p.lat.toFixed(6);
    form.querySelector('[name=shopLng]').value = p.lng.toFixed(6);
    form.classList.add('dirty');
    toast(`Position taken (within about ${p.acc} m) — tap Save`);
  } catch (e) {
    toast(e.code === 1 ? 'Location is blocked — allow it for this app first' : 'Could not find your position — try near a window', { kind: 'err' });
  }
}
