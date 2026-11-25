// Late / On time (4.21): Monday to Saturday the first shift of the day should open by the opening time,
// and the shift should not close before the closing time. Sundays are never marked.
import { store } from '../store.js';
import { dayKey } from '../calc.js';

const at = (day, hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); const d = new Date(`${day}T00:00:00`); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
export const openTime = () => store.settings.openShiftAt || '07:30';
export const closeTimeSet = () => store.settings.closeShiftAt || '19:30';
export const isWorkDay = (day = dayKey()) => new Date(`${day}T12:00:00`).getDay() !== 0;
export const fmtMins = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

const dayOf = (s) => s.date || dayKey(s.ts);
const firstOfDay = (s) => !store.data.shifts.some((o) => o.id !== s.id && dayOf(o) === dayOf(s) && o.ts < s.ts);

/** Minutes late opening (0 = on time), or null when not marked (Sunday, or not the first shift of the day). */
export function lateMins(s) {
  if (!s || !isWorkDay(dayOf(s)) || !firstOfDay(s)) return null;
  return Math.max(0, Math.floor((s.ts - at(dayOf(s), openTime())) / 60000));
}
/** Minutes closed before the closing time (0 = not early), or null when not closed / not marked. */
export function earlyMins(s) {
  if (!s?.closedAt || !isWorkDay(dayOf(s))) return null;
  return Math.max(0, Math.ceil((at(dayOf(s), closeTimeSet()) - s.closedAt) / 60000));
}
/** Right now: minutes past the opening time today (0 when not late, or Sunday). */
export function lateNow() {
  if (!isWorkDay()) return 0;
  return Math.max(0, Math.floor((Date.now() - at(dayKey(), openTime())) / 60000));
}
/** Small pills for a shift: Late 16 min / On time, and Closed early 40 min. */
export function punctualPills(s) {
  if (!s) return '';
  const l = lateMins(s), e = earlyMins(s);
  return `${l === null ? '' : l > 0 ? `<span class="pill bad">Late ${fmtMins(l)}</span>` : '<span class="pill good">On time</span>'}${e ? `<span class="pill warn">Closed early ${fmtMins(e)}</span>` : ''}`;
}
/** The same in words for summaries and WhatsApp. */
export function punctualText(s) {
  if (!s) return '';
  const l = lateMins(s), e = earlyMins(s);
  return [l === null ? '' : l > 0 ? `Late ${fmtMins(l)}` : 'On time', e ? `Closed early ${fmtMins(e)}` : ''].filter(Boolean).join(' · ');
}
