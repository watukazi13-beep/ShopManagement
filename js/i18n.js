// Kiswahili: a language chosen per device. The screens are written in English; when Kiswahili is on,
// every piece of text that appears is swapped for its Kiswahili version (exact phrases, then patterns
// for text with numbers or names in it). Item names, customer names and numbers are never changed.

import { SW_PAIRS } from './sw-dict.js';

const KEY = 'lang';
export function getLang() { try { if (typeof localStorage === 'undefined') return 'en'; return localStorage.getItem(KEY) === 'sw' ? 'sw' : 'en'; } catch { return 'en'; } }
export function setLang(l) { try { localStorage.setItem(KEY, l === 'sw' ? 'sw' : 'en'); } catch { /* ignore */ } location.reload(); }

const SW = {
  // Menu and top bar
  'Home': 'Nyumbani', 'Sell': 'Uza', 'Stock': 'Bidhaa', 'Orders': 'Oda', 'Money': 'Fedha', 'Settings': 'Mipangilio', 'All shops': 'Maduka yote',
  'This device only': 'Kifaa hiki tu', 'Synced': 'Imesawazishwa', 'Syncing…': 'Inasawazisha…', 'Offline': 'Hakuna mtandao',
  'Switch to dark theme': 'Badilisha kwenda giza', 'Switch to light theme': 'Badilisha kwenda mwanga', 'Dark theme': 'Giza', 'Light theme': 'Mwanga',
  'Developed by': 'Imetengenezwa na', 'Loading your shop…': 'Inafungua duka lako…', 'Loading…': 'Inapakia…', 'Opening your shop…': 'Inafungua duka lako…',
  // Home
  'Sold today': 'Mauzo ya leo', 'New sale': 'Mauzo mapya', 'Receive stock': 'Pokea bidhaa', 'Add expense': 'Ongeza matumizi',
  'Install the app': 'Weka programu', 'Opens from your home screen and works offline.': 'Inafunguka kutoka skrini yako na inafanya kazi bila mtandao.', 'Install': 'Weka', 'Not now': 'Si sasa',
  'Set up your shop': 'Andaa duka lako', 'Start setup': 'Anza kuandaa',
  'Stock alerts': 'Tahadhari za bidhaa', 'See all': 'Ona zote', 'Create requests for quotation': 'Tengeneza maombi ya bei',
  'All items are above their reorder level.': 'Bidhaa zote ziko juu ya kiwango cha kuagiza.', 'Alerts appear here when items run low.': 'Tahadhari zitaonekana hapa bidhaa zikipungua.',
  'Turn on phone alerts': 'Washa arifa za simu', "Today's money": 'Fedha za leo', 'Cash': 'Taslimu', 'Paid out': 'Zilizotolewa',
  'Pay out': 'Toa pesa', 'Close the day': 'Funga siku', 'Close day': 'Funga siku', 'View closing': 'Ona ufungaji', 'Close again': 'Funga tena',
  'Shifts today': 'Zamu za leo', 'No shift opened yet today.': 'Hakuna zamu iliyofunguliwa leo.', 'Open': 'Fungua', 'Open now': 'Iko wazi', 'Still open': 'Bado wazi',
  'Full report': 'Ripoti kamili', 'Sales': 'Mauzo', 'Cost of goods sold': 'Gharama ya bidhaa zilizouzwa', 'Gross profit': 'Faida ghafi',
  'Expenses & losses': 'Matumizi na hasara', 'Net profit': 'Faida halisi', 'Money position': 'Hali ya fedha', 'Stock value (cost)': 'Thamani ya bidhaa (gharama)',
  'Customers owe you': 'Wateja wanakudai', 'You owe suppliers': 'Unadaiwa na wasambazaji', 'Expected deliveries': 'Mizigo inayotarajiwa',
  'Recent sales': 'Mauzo ya karibuni', 'All sales': 'Mauzo yote', 'No sales yet': 'Bado hakuna mauzo', 'Sales you record will show here.': 'Mauzo utakayorekodi yataonekana hapa.',
  'Make the first sale': 'Fanya mauzo ya kwanza', 'Weekly backup due': 'Nakala ya wiki inahitajika', 'Download': 'Pakua',
  // Sell
  'Search or scan barcode': 'Tafuta au skani msimbo', 'All': 'Zote', 'Current sale': 'Mauzo ya sasa', 'Tap items to add them.': 'Gusa bidhaa kuziongeza.',
  'Total': 'Jumla', 'Subtotal': 'Jumla ndogo', 'Discount': 'Punguzo', 'Clear': 'Futa', 'Hold sale': 'Weka kando', 'Hold': 'Weka kando',
  'Held sales': 'Mauzo yaliyowekwa kando', 'Nothing held.': 'Hakuna yaliyowekwa kando.', 'Remove from sale': 'Ondoa kwenye mauzo', 'Add to sale': 'Ongeza kwenye mauzo',
  'Paid with': 'Imelipwa kwa', 'Amount received': 'Kiasi kilichopokelewa', 'Change': 'Chenji', 'Customer': 'Mteja', 'Complete sale': 'Kamilisha mauzo',
  'On credit': 'Kwa mkopo', 'A credit sale needs a customer.': 'Mauzo ya mkopo yanahitaji mteja.', 'Note (optional)': 'Maelezo (si lazima)',
  'Receipt': 'Risiti', 'Print': 'Chapisha', 'WhatsApp': 'WhatsApp', 'New sale ': 'Mauzo mapya ', 'Refund': 'Rudisha pesa', 'Refunded': 'Imerudishwa',
  'Cancel sale': 'Ghairi mauzo', 'Enter price': 'Weka bei', 'Price': 'Bei', 'Quantity': 'Idadi', 'Qty': 'Idadi', 'Item': 'Bidhaa', 'Items': 'Bidhaa',
  'Out of stock': 'Imeisha', 'Low': 'Chache', 'OK': 'Sawa', 'Service': 'Huduma', 'Variable': 'Bei hubadilika',
  // Shifts
  'Open shift': 'Fungua zamu', 'Close shift': 'Funga zamu', 'Shift closed for today': 'Zamu imefungwa kwa leo', 'Open another shift today': 'Fungua zamu nyingine leo',
  'Cash in the drawer now (TSh)': 'Pesa iliyopo kwenye droo sasa (TSh)', 'Count the drawer': 'Hesabu droo',
  'Open your shift to start selling. Count the money in the drawer first.': 'Fungua zamu yako uanze kuuza. Hesabu pesa iliyo kwenye droo kwanza.',
  'If no money was added or taken out since, the drawer should still have this.': 'Kama hakuna pesa iliyoongezwa au kutolewa, droo inapaswa kuwa na kiasi hiki.',
  'Close the earlier shift first': 'Funga zamu iliyopita kwanza', 'Close that shift': 'Funga zamu hiyo', 'Cash counted (TSh)': 'Pesa iliyohesabiwa (TSh)',
  'Expected in the drawer': 'Inayotarajiwa kwenye droo', 'Expected in drawer': 'Inayotarajiwa kwenye droo', 'Drawer matches.': 'Droo iko sawa.',
  'Opening cash': 'Pesa ya kuanzia', 'Cash sales': 'Mauzo ya taslimu', 'Cash in': 'Weka pesa', 'Cash out': 'Toa pesa', 'Cash put in': 'Pesa iliyowekwa',
  'Cash taken out': 'Pesa iliyotolewa', 'Cash refunds': 'Marejesho ya taslimu', 'Customer payments in cash': 'Malipo ya wateja kwa taslimu',
  'Pay-outs from the drawer (food, transport…)': 'Malipo kutoka droo (chakula, usafiri…)', 'Other payments (M-Pesa, card, credit…)': 'Malipo mengine (M-Pesa, kadi, mkopo…)',
  'Close shift ': 'Funga zamu ', 'Done': 'Sawa', 'Sign out': 'Toka', 'Change person': 'Badilisha mtu',
  // Staff lock
  'Who is selling?': 'Nani anauza?', 'Enter your 4-digit PIN': 'Weka PIN yako ya tarakimu 4', 'Delete': 'Futa', 'Wrong PIN — try again': 'PIN si sahihi — jaribu tena', 'Back': 'Rudi', 'Seller': 'Muuzaji', 'Manager': 'Meneja', 'Owner': 'Mmiliki',
  // Pay out and close the day
  'What for': 'Kwa ajili ya nini', 'Amount (TSh)': 'Kiasi (TSh)', 'Paid from': 'Imelipwa kutoka', 'Save pay-out': 'Hifadhi malipo', 'Food': 'Chakula', 'Transport': 'Usafiri', 'Airtime': 'Muda wa maongezi', 'Cleaning': 'Usafi', 'Other': 'Mengine',
  'End of day': 'Mwisho wa siku', 'Counted': 'Iliyohesabiwa', 'Should be': 'Inapaswa kuwa', 'Difference': 'Tofauti', 'Total difference': 'Tofauti yote',
  'Left in the drawer for tomorrow': 'Iliyobaki kwenye droo kwa kesho', 'Closed by': 'Imefungwa na', 'Checked by (owner)': 'Imekaguliwa na (mmiliki)',
  // Stock (what sellers see)
  'Search items': 'Tafuta bidhaa', 'Needs restock': 'Zinahitaji kuagizwa', 'Incoming': 'Zinazokuja', 'All categories': 'Aina zote', 'In stock': 'Zilizopo', 'Status': 'Hali',
  'Need restock': 'Zinahitaji kuagizwa', 'More figures': 'Takwimu zaidi', 'Fewer figures': 'Takwimu chache', 'More': 'Zaidi', 'Add item': 'Ongeza bidhaa',
  // Common
  'Cancel': 'Ghairi', 'Save': 'Hifadhi', 'Close': 'Funga', 'Edit': 'Hariri', 'Remove': 'Ondoa', 'Add': 'Ongeza', 'Yes': 'Ndiyo', 'No': 'Hapana', 'Try again': 'Jaribu tena',
  'Undo': 'Tendua', 'Update now': 'Sasisha sasa', 'Saved': 'Imehifadhiwa', 'Settings saved': 'Mipangilio imehifadhiwa',
  // Settings → Appearance
  'Appearance': 'Mwonekano', 'Light': 'Mwanga', 'Dark': 'Giza', 'Automatic': 'Otomatiki', 'Language': 'Lugha',
};

// Text with numbers or names inside.
const PATTERNS = [
  [/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m, a, b) => `${{ January: 'Januari', February: 'Februari', March: 'Machi', April: 'Aprili', May: 'Mei', June: 'Juni', July: 'Julai', August: 'Agosti', September: 'Septemba', October: 'Oktoba', November: 'Novemba', December: 'Desemba' }[a]} ${b}`],
  [/^On order \((\d+)\)$/, (m, a) => `Zimeagizwa (${a})`],
  [/^Good morning(,.*)?$/, (m, a) => `Habari za asubuhi${a || ''}`],
  [/^Good afternoon(,.*)?$/, (m, a) => `Habari za mchana${a || ''}`],
  [/^Good evening(,.*)?$/, (m, a) => `Habari za jioni${a || ''}`],
  [/^Charge (.+)$/, (m, a) => `Pokea ${a}`],
  [/^(\d+) items?$/, (m, a) => `Bidhaa ${a}`],
  [/^View sale · (.+)$/, (m, a) => `Ona mauzo · ${a}`],
  [/^(\d+) sales?$/, (m, a) => `Mauzo ${a}`],
  [/^(\d+) sales? · (.+) gross profit$/, (m, a, b) => `Mauzo ${a} · faida ghafi ${b}`],
  [/^Shift · since (.+)$/, (m, a) => `Zamu · tangu ${a}`],
  [/^Shift since (.+)$/, (m, a) => `Zamu tangu ${a}`],
  [/^Close by (.+)$/, (m, a) => `Funga kabla ya ${a}`],
  [/^You'll be reminded to close it at (.+)\.$/, (m, a) => `Utakumbushwa kuifunga saa ${a}.`],
  [/^It's past (.+) — time to close your shift$/, (m, a) => `Imepita saa ${a} — wakati wa kufunga zamu yako`],
  [/^Your shift from (.+) is still open — count the cash and close it$/, (m, a) => `Zamu yako ya ${a} bado iko wazi — hesabu pesa uifunge`],
  [/^Shift opened — have a good day(.*)$/, (m, a) => `Zamu imefunguliwa — siku njema${a}`],
  [/^Shift closed — drawer matches$/, () => 'Zamu imefungwa — droo iko sawa'],
  [/^Shift closed — (short|over) by (.+)$/, (m, a, b) => `Zamu imefungwa — ${a === 'short' ? 'pungufu' : 'ziada'} ya ${b}`],
  [/^Last count, (today|.+?) (\d{1,2}:\d{2})$/, (m, a, b) => `Hesabu ya mwisho, ${a === 'today' ? 'leo' : a} ${b}`],
  [/^(.+) short\.$/, (m, a) => `Pungufu ${a}.`],
  [/^(.+) more than expected\.$/, (m, a) => `${a} zaidi ya inayotarajiwa.`],
  [/^Opened (.+) · cash (.+)$/, (m, a, b) => `Ilifunguliwa ${a} · pesa ${b}`],
  [/^Closed (\d{1,2}:\d{2}) · (.+)$/, (m, a, b) => `Imefungwa ${a} · ${b.replace('matches', 'sawa').replace('short', 'pungufu').replace('over', 'ziada')}`],
  [/^(.+) left · about (\d+) days$/, (m, a, b) => `${a} zimebaki · takriban siku ${b}`],
  [/^Sale saved(.*)$/, (m, a) => `Mauzo yamehifadhiwa${a}`],
];

const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);
const FIELDS = new Set(['TEXTAREA', 'INPUT']); // their typed text is never changed, only placeholder / label
const ATTRS = ['placeholder', 'aria-label', 'title'];

// Exact phrases and phrases with {} (numbers, names, amounts) from the full dictionary.
const EXACT = new Map(Object.entries(SW));
const TEMPLATES = [];
const COUNT_WORDS = [['item', 'bidhaa'], ['items', 'bidhaa'], ['sale', 'mauzo'], ['sales', 'mauzo'], ['receipt', 'risiti'], ['receipts', 'risiti'], ['customer', 'mteja'], ['customers', 'wateja'],
  ['supplier', 'msambazaji'], ['suppliers', 'wasambazaji'], ['purchase', 'manunuzi'], ['purchases', 'manunuzi'], ['line', 'mstari'], ['lines', 'mistari'], ['refunds', 'marejesho'], ['records', 'kumbukumbu'],
  ['days', 'siku'], ['day', 'siku'], ['counted', 'zimehesabiwa'], ['different', 'tofauti'], ['entries', 'maingizo'], ['minutes', 'dakika']];
const COUNT_RE = new RegExp(`^([\\d,.]+) (${COUNT_WORDS.map(([en]) => en).join('|')})$`);
const COUNT_MAP = new Map(COUNT_WORDS);
SW_PAIRS.push(['{} sales · {} gross profit', 'mauzo {} · faida ghafi {}'], ['{} sale · {} gross profit', 'mauzo {} · faida ghafi {}'], ['{} pcs left', 'vimebaki {}'], ['{} left', 'zimebaki {}'], ['about {} days', 'takriban siku {}'],
  ['{} receipts · {} sales · {} paid out · by {}', 'risiti {} · mauzo {} · {} imetolewa · na {}'], ['by {}', 'na {}'], ['from {}', 'kutoka {}'], ['ordered {}', 'imeagizwa {}'], ['expected {}', 'inatarajiwa {}'], ['monthly', 'kila mwezi'], ['weekly', 'kila wiki'], ['cancelled', 'imeghairiwa'],
  ['{} short.', 'Pungufu {}.'], ['{} more than expected.', '{} zaidi ya inayotarajiwa.'], ['{} each', '{} kila moja'], ['{} per piece', '{} kwa kipande'], ['{} × {} = {}', '{} × {} = {}'], ['= {} into stock', '= {} zinaingia stoo'], ['supplier calls it “{}”', 'msambazaji anaiita “{}”'],
  ['Shift opened {} · opening cash {}', 'Zamu imefunguliwa {} · pesa ya kuanzia {}'], ['Last count, {}', 'Hesabu ya mwisho, {}'], ['{} margin', 'faida {}'], ['{} − discount {}', '{} − punguzo {}'], ['Stock adjusted: {}', 'Stoo imerekebishwa: {}'], ['sales {} · paid debts {} · pay-outs {}', 'mauzo {} · madeni yaliyolipwa {} · malipo {}'],
  ['Opened {} · cash {}', 'Ilifunguliwa {} · pesa {}'], ['Closed {} · {}', 'Imefungwa {} · {}'], ['Closed {}', 'Imefungwa {}'], ['Closed {} by {}', 'Imefungwa {} na {}'], ['Shift · since {}', 'Zamu · tangu {}'], ['Shift since {}', 'Zamu tangu {}'],
  ['{} lunch for 2 staff', '{} chakula cha wafanyakazi 2'], ['Other savings — {}', 'Akiba nyingine — {}'], ['Food — {}', 'Chakula — {}'], ['to order ({} new items) · {} not available', 'za kuagiza (bidhaa mpya {}) · {} hazipatikani'], ['matches', 'sawa']);
for (const [en, sw] of SW_PAIRS) {
  if (!en.includes('{}')) { EXACT.set(en, sw); continue; }
  const parts = en.split('{}');
  const lit = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
  if (lit.trim().length < 2) continue;
  TEMPLATES.push({ multi: en.includes(' · '), re: new RegExp(`^${parts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*?)')}$`), lit, sw, n: lit.length });
}
TEMPLATES.sort((a, b) => b.n - a.n);
const MONTHS = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mac', Apr: 'Apr', May: 'Mei', Jun: 'Jun', Jul: 'Jul', Aug: 'Ago', Sep: 'Sep', Oct: 'Okt', Nov: 'Nov', Dec: 'Des' };
// Safe multi-word phrases swapped inside longer text that has no exact translation.
const PHRASES = [['Count all the money in the drawer, including the opening cash.', 'Hesabu pesa yote iliyo kwenye droo, ikiwemo pesa ya kuanzia.'], ['Opening cash', 'Pesa ya kuanzia'], ['cash sales', 'mauzo ya taslimu'], ['customer payments', 'malipo ya wateja'],
  ['pay-outs', 'malipo'], ['taken out', 'iliyotolewa'], ['put in', 'iliyowekwa'], ['refunds', 'marejesho'], ['gross profit', 'faida ghafi'], ['in total', 'kwa jumla'], ['already in', 'tayari zimeingia'], ['of sales', 'ya mauzo'], ['at cost', 'kwa gharama'],
  ['Thank you', 'Asante'], ['see you tomorrow', 'tuonane kesho'], ['into stock', 'zinaingia stoo']];

function one(t, depth = 0, multiOnly = false) {
  if (EXACT.has(t)) return EXACT.get(t);
  const c = t.match(COUNT_RE);
  if (c) return `${COUNT_MAP.get(c[2])} ${c[1]}`;
  for (const T of TEMPLATES) {
    if (multiOnly && !T.lit.includes(' · ') && !T.multi) continue;
    if (!t.includes(T.lit)) continue;
    const m = t.match(T.re);
    if (!m) continue;
    let i = 1;
    return T.sw.replace(/\{\}/g, () => { const g = m[i++] ?? ''; const x = depth < 2 && g.trim() ? one(g.trim(), depth + 1) : null; return x ?? g; });
  }
  let m = t.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})(.*)$/);
  if (m) return `${m[1]} ${MONTHS[m[2]]} ${m[3]}${m[4] ? (one(m[4].replace(/^,\s*/, '')) !== null ? `, ${one(m[4].replace(/^,\s*/, ''))}` : m[4]) : ''}`;
  for (const [re, fn] of PATTERNS) { m = t.match(re); if (m) return fn(...m); }
  return null;
}

export function tr(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 600 || !/[A-Za-z]/.test(t)) return null;
  const multi = t.includes(' · ');
  let out = multi ? one(t, 0, true) : one(t);
  if (out === null && multi) {
    // Lines such as "PO-261031 · 31 Oct 2026 · 2 items · expected 7 Nov 2026": translate each part.
    const parts = t.split(' · ').map((p) => one(p) ?? p);
    const joined = parts.join(' · ');
    if (joined !== t) out = joined;
  }
  if (out === null) {
    let x = t;
    for (const [en, sw] of PHRASES) if (x.includes(en)) x = x.split(en).join(sw);
    if (x !== t) out = x;
  }
  if (out === null || out === t) return null;
  const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0];
  return lead + out + tail;
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { const n = tr(root.nodeValue); if (n !== null && n !== root.nodeValue) root.nodeValue = n; return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('[data-no-tr]')) return;
  for (const a of ATTRS) { const v = root.getAttribute?.(a); if (v) { const n = tr(v); if (n !== null && n !== v) root.setAttribute(a, n); } }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.tagName) || n.hasAttribute('data-no-tr')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === 3) { if (!FIELDS.has(n.parentNode?.tagName)) { const x = tr(n.nodeValue); if (x !== null && x !== n.nodeValue) n.nodeValue = x; } }
    else for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const x = tr(v); if (x !== null && x !== v) n.setAttribute(a, x); } }
    n = w.nextNode();
  }
}

/** Turn Kiswahili on for this page if chosen. */
export function initLang() {
  if (getLang() !== 'sw') return;
  document.documentElement.lang = 'sw';
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Small "English | Kiswahili" switch (Settings, the PIN screen and the shift screen). */
export function langSwitch(cls = '') {
  const l = getLang();
  return `<span class="lang-switch ${cls}" data-no-tr><button type="button" data-lang="en" class="${l === 'en' ? 'on' : ''}">English</button><button type="button" data-lang="sw" class="${l === 'sw' ? 'on' : ''}">Kiswahili</button></span>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-lang]');
  if (b && b.dataset.lang !== getLang()) setLang(b.dataset.lang);
});
