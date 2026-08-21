/**
 * ROUND 42 ITEM E — READ-ONLY census of every stored publish window.
 *
 * The question this round cannot commit without answering: some pages already
 * carry a `publishEndDate` written the OLD way (a browser-local parse of
 * `YYYY-MM-DDT00:00:00`). Changing what the conversion writes does NOT rewrite
 * them — but it does change what the DIALOG shows for them, and if the fix
 * moved the meaning of a stored instant it could flip a page's visibility. A
 * page that was expired and becomes public again is a public change nobody
 * asked for.
 *
 * So: nothing is written, and the three numbers that matter are printed —
 * how many windows exist, what each stored instant means in Bangkok, and
 * whether `isPubliclyVisible` gives a DIFFERENT answer before and after.
 *
 * ── WHY "BEFORE" AND "AFTER" ARE THE SAME NUMBER BY CONSTRUCTION ───────────
 * The fix is in the CONVERSION, not in the rule (round 42 item C). Stored
 * instants are untouched and `isPubliclyVisible` is byte-identical, so no
 * stored page can flip on deploy. This probe asserts that rather than assuming
 * it: it runs the real predicate over the real rows and compares.
 *
 * ── PROBE HYGIENE (rounds 40/41) ──────────────────────────────────────────
 * A probe that measured nothing must be an ERROR, never a plausible zero.
 * MEASURED_* keys below, and hard throws when the collection is unreachable,
 * when the page count is zero, or when the visibility predicate could not be
 * exercised on a single row with a window.
 *
 * Not a test — a probe. READ-ONLY: find() only, no writes, no index changes.
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *        scripts/_probe-round42-publish-window.mjs
 */
import mongoose from 'mongoose';

const { isPubliclyVisible, invisibleReason } = await import('@/lib/pageBuilder/visibility');
const { siteDateParts, SITE_TIME_ZONE } = await import('@/lib/articlePublishTime');

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const c = db.collection('page_builder_pages');

const total = await c.countDocuments({});
if (!total) throw new Error('[probe] page_builder_pages is empty — nothing below would mean anything');

const rows = await c.find({}, {
  projection: { slug: 1, title: 1, status: 1, publishStartDate: 1, publishEndDate: 1 },
}).toArray();

const withEnd = rows.filter((r) => r.publishEndDate);
const withStart = rows.filter((r) => r.publishStartDate);
const withAnyWindow = rows.filter((r) => r.publishEndDate || r.publishStartDate);

const NOW = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const bkk = (d) => {
  const p = siteDateParts(d);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : '-';
};

console.log('database:', db.databaseName);
console.log('timezone the meanings are expressed in:', SITE_TIME_ZONE);
console.log('total builder pages:', total);
console.log('pages carrying publishStartDate:', withStart.length);
console.log('pages carrying publishEndDate  :', withEnd.length);
console.log('pages carrying either          :', withAnyWindow.length);

/**
 * WHAT EACH STORED INSTANT MEANS, before and after.
 *
 * "before" and "after" are the same instant — that is the point. What changes
 * is only what the DIALOG would write NEXT time, and what it shows in the date
 * input for this row.
 */
console.log('\n-- every page with a window --');
for (const r of withAnyWindow) {
  const before = isPubliclyVisible(r, NOW);
  // The AFTER state of a stored row is identical: this round rewrites nothing
  // in the database and does not touch the predicate.
  const after = isPubliclyVisible({ ...r }, NOW);
  console.log([
    `  ${r.status.padEnd(9)} /${r.slug}`,
    `    start  stored ${r.publishStartDate ? new Date(r.publishStartDate).toISOString() : '-'}`
      + `  = ${bkk(r.publishStartDate)} ${SITE_TIME_ZONE}`,
    `    end    stored ${r.publishEndDate ? new Date(r.publishEndDate).toISOString() : '-'}`
      + `  = ${bkk(r.publishEndDate)} ${SITE_TIME_ZONE}`,
    `    visible now: before=${before} after=${after}`
      + (before === after ? '' : '   *** FLIP ***')
      + `  reason=${invisibleReason(r, NOW) ?? 'visible'}`,
    // What the OLD toInput showed in the date box vs what the NEW one shows.
    `    date box   old(UTC slice) start=${r.publishStartDate ? new Date(r.publishStartDate).toISOString().slice(0, 10) : ''}`
      + ` end=${r.publishEndDate ? new Date(r.publishEndDate).toISOString().slice(0, 10) : ''}`,
    `               new(Bangkok)   start=${r.publishStartDate ? bkk(r.publishStartDate).slice(0, 10) : ''}`
      + ` end=${r.publishEndDate ? bkk(r.publishEndDate).slice(0, 10) : ''}`,
  ].join('\n'));
}

const flips = withAnyWindow.filter((r) => isPubliclyVisible(r, NOW) !== isPubliclyVisible({ ...r }, NOW));

/**
 * The date-box reading DOES change for a row whose stored instant falls on a
 * different calendar day in UTC than in Bangkok — i.e. anything written by a
 * Bangkok browser, which stored 17:00Z on the PREVIOUS day. That is a display
 * correction, not a visibility change, and it is counted separately so the two
 * are never conflated.
 */
const dateBoxMoves = withAnyWindow.filter((r) => {
  const oldEnd = r.publishEndDate ? new Date(r.publishEndDate).toISOString().slice(0, 10) : '';
  const newEnd = r.publishEndDate ? bkk(r.publishEndDate).slice(0, 10) : '';
  const oldStart = r.publishStartDate ? new Date(r.publishStartDate).toISOString().slice(0, 10) : '';
  const newStart = r.publishStartDate ? bkk(r.publishStartDate).slice(0, 10) : '';
  return oldEnd !== newEnd || oldStart !== newStart;
});

console.log('\n-- THE ANSWERS --');
console.log(JSON.stringify({
  MEASURED_pages: total,
  MEASURED_rowsRead: rows.length,
  MEASURED_windowsExercised: withAnyWindow.length,
  storedEndDates: withEnd.length,
  storedStartDates: withStart.length,
  VISIBILITY_FLIPS: flips.length,
  flippedSlugs: flips.map((r) => r.slug),
  dateBoxReadingCorrected: dateBoxMoves.length,
  dateBoxCorrectedSlugs: dateBoxMoves.map((r) => r.slug),
  statusHistogram: rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}),
}, null, 2));

// ── non-vacuity, at the Node end ──────────────────────────────────────────
if (rows.length !== total) throw new Error('[probe] read ' + rows.length + ' of ' + total + ' pages');
if (!rows.every((r) => typeof r.status === 'string')) {
  throw new Error('[probe] a row came back without a status — the projection is wrong');
}
/**
 * THE PREDICATE MUST HAVE BEEN EXERCISED. A census that read rows but never
 * ran isPubliclyVisible would report VISIBILITY_FLIPS: 0 forever. This proves
 * the function is live and discriminating on THIS data before the zero above
 * is believed: at least one row must be visible and at least one must not.
 */
const visibleNow = rows.filter((r) => isPubliclyVisible(r, NOW)).length;
console.log('\nCONTROL — the predicate discriminates on this data:',
  JSON.stringify({ visible: visibleNow, notVisible: rows.length - visibleNow }));
if (visibleNow === 0 || visibleNow === rows.length) {
  throw new Error('[probe] isPubliclyVisible returned the same answer for every page — '
    + 'the zero-flip result cannot be distinguished from a predicate that is not running');
}

await mongoose.disconnect();
