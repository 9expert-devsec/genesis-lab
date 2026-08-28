/**
 * ROUND 43 ITEM G — is /promotions showing visitors the wrong day?
 *
 * Round 42 reported that `formatThaiDate` in src/app/(public)/promotions/page.jsx
 * reads `getDate()` / `getMonth()` / `getFullYear()` — the RUNTIME's ambient
 * zone — on a PUBLIC page, while lib/utils.js's `formatDateRange` pins
 * Asia/Bangkok. Two conventions in one area. That is a smell; whether it is a
 * DEFECT is a question about the values that actually exist, and this answers
 * it with them rather than with reasoning.
 *
 * The page is a SERVER component with `revalidate = 3600`, so there is no
 * SSR/hydration divergence to chase: exactly one zone decides, and on Vercel
 * it is UTC (verified in lib/articlePublishTime.js's header — nothing in this
 * repo sets TZ).
 *
 * ── WHAT THE LABEL IS FOR, WHICH IS THE WHOLE QUESTION ────────────────────
 * `วันนี้ - {end}` promises a LAST DAY. The honest answer is "the last calendar
 * day in Asia/Bangkok on which the page is still visible", because the reader
 * is in Thailand and the page's visibility is decided by isPubliclyVisible
 * against the stored instant. So the probe computes that reference answer
 * independently and scores BOTH formatters against it — rather than assuming
 * the pinned one must be the better of the two.
 *
 * ── PROBE HYGIENE (rounds 40-42) ──────────────────────────────────────────
 * The two functions under test are FILE-LOCAL and cannot be imported, so they
 * are reproduced here and each reproduction is asserted against the file's
 * source text. A drifted reproduction is a hard error, never a number. And the
 * comparison is proven to discriminate — a formatter pair that agreed on
 * everything would print "0 disagreements" whether or not it was running.
 *
 * Not a test — a probe. READ-ONLY. Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round43-promotion-label.mjs
 */
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';

const { siteDateParts, SITE_TIME_ZONE } = await import('@/lib/articlePublishTime');
const { isPubliclyVisible } = await import('@/lib/pageBuilder/visibility');

const PAGE = 'src/app/(public)/promotions/page.jsx';
const src = readFileSync(PAGE, 'utf8');

// ── the reproductions, CHECKED against the file ───────────────────────────
for (const needle of [
  'const year = d.getFullYear() + 543;',
  'return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;',
  'return `วันนี้ - ${end}`;',
]) {
  if (!src.includes(needle)) {
    throw new Error(`[probe] ${PAGE} no longer contains "${needle}" — the reproduction has drifted`);
  }
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/** TODAY'S function, byte-for-byte in behaviour: the runtime's ambient zone. */
function formatThaiDateAmbient(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear() + 543;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;
}

/** The same thing, pinned to the site's zone the way formatDateRange is. */
function formatThaiDatePinned(value) {
  const p = siteDateParts(value);
  if (!p) return null;
  return `${p.day} ${THAI_MONTHS[p.month - 1]} ${p.year + 543}`;
}

/**
 * THE REFERENCE ANSWER — the last calendar day in Bangkok on which the page is
 * still visible, computed from the RULE rather than from either formatter.
 *
 * isPubliclyVisible expires on `now > end`, so the last visible instant IS the
 * stored instant. The day it falls in, in Bangkok, is the answer.
 */
function lastVisibleThaiDay(page) {
  const end = page.publishEndDate;
  if (!end) return null;
  const t = new Date(end).getTime();
  if (Number.isNaN(t)) return null;
  if (!isPubliclyVisible(page, t)) return null; // not visible even at its own end
  const p = siteDateParts(new Date(t));
  return `${p.day} ${THAI_MONTHS[p.month - 1]} ${p.year + 543}`;
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;

// ── every value that reaches this label, from BOTH sources ────────────────
const builder = await db.collection('page_builder_pages').find(
  { pageType: 'promotion' },
  { projection: { slug: 1, title: 1, status: 1, publishStartDate: 1, publishEndDate: 1 } },
).toArray();

const msdb = await db.collection('promotions').find(
  {},
  { projection: { promotion_id: 1, start_date: 1, end_date: 1 } },
).toArray().catch(() => []);

console.log('database:', db.databaseName);
console.log('server zone this run:', process.env.TZ ?? '(system)', '| Vercel runs UTC');
console.log('builder promotion pages:', builder.length);
console.log('MSDB promotions:', msdb.length);

const rows = [
  ...builder.map((p) => ({ source: 'builder', key: `/${p.slug}`, end: p.publishEndDate, page: p })),
  ...msdb.map((p) => ({ source: 'msdb', key: p.promotion_id, end: p.end_date, page: null })),
].filter((r) => r.end);

if (!rows.length) {
  throw new Error('[probe] no promotion carries an end date — the comparison would be vacuous');
}

console.log('\n-- every end date that reaches the label --');
const scored = [];
for (const r of rows) {
  const iso = new Date(r.end).toISOString();
  const ambient = formatThaiDateAmbient(r.end);
  const pinned = formatThaiDatePinned(r.end);
  const truth = r.page ? lastVisibleThaiDay(r.page) : null;
  scored.push({ ...r, iso, ambient, pinned, truth });
  console.log([
    `  ${r.source.padEnd(7)} ${r.key}`,
    `    stored ${iso}  = ${(() => { const p = siteDateParts(r.end); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; })()} ${SITE_TIME_ZONE}`,
    `    label today (ambient) : วันนี้ - ${ambient}`,
    `    label if pinned (ICT) : วันนี้ - ${pinned}`,
    truth ? `    last visible ICT day  : ${truth}` : '    last visible ICT day  : (no rule for an MSDB row)',
  ].join('\n'));
}

const disagree = scored.filter((r) => r.ambient !== r.pinned);
const ambientWrong = scored.filter((r) => r.truth && r.ambient !== r.truth);
const pinnedWrong = scored.filter((r) => r.truth && r.pinned !== r.truth);

console.log('\n-- THE ANSWERS --');
console.log(JSON.stringify({
  MEASURED_endDates: rows.length,
  MEASURED_builderRowsWithRule: scored.filter((r) => r.truth).length,
  formattersDisagree: disagree.length,
  disagreeingKeys: disagree.map((r) => `${r.key}: ambient=${r.ambient} pinned=${r.pinned}`),
  AMBIENT_WRONG_vs_rule: ambientWrong.length,
  ambientWrongKeys: ambientWrong.map((r) => `${r.key}: shows ${r.ambient}, last visible ${r.truth}`),
  PINNED_WRONG_vs_rule: pinnedWrong.length,
  pinnedWrongKeys: pinnedWrong.map((r) => `${r.key}: would show ${r.pinned}, last visible ${r.truth}`),
}, null, 2));

/**
 * CONTROL — the two formatters CAN disagree, and the reference answer CAN
 * catch each of them. Without this, every zero above is indistinguishable from
 * a probe whose formatters are not running.
 */
const nearMidnight = '2026-08-28T17:00:00.000Z';   // 29 Aug 00:00 ICT
const endOfDay = '2026-08-28T16:59:59.999Z';       // 28 Aug 23:59:59.999 ICT
console.log('\nCONTROL — the pair discriminates:', JSON.stringify({
  nearMidnightAmbient: formatThaiDateAmbient(nearMidnight),
  nearMidnightPinned: formatThaiDatePinned(nearMidnight),
  endOfDayAmbient: formatThaiDateAmbient(endOfDay),
  endOfDayPinned: formatThaiDatePinned(endOfDay),
}));
if (formatThaiDateAmbient(nearMidnight) === formatThaiDatePinned(nearMidnight)) {
  throw new Error('[probe] the two formatters agree on an instant that straddles ICT midnight — '
    + 'this run cannot observe the difference it exists to measure (is TZ set to Asia/Bangkok?)');
}

await mongoose.disconnect();
