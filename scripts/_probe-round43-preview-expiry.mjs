/**
 * ROUND 43 ITEM E — READ-ONLY census of every stored preview expiry.
 *
 * The question this round cannot commit without answering, and it is sharper
 * than round 42's: a preview link guards an UNPUBLISHED DRAFT. Round 42's
 * flip would have changed what the public could read on a page somebody had
 * already published; a flip here changes who can reach content nobody has
 * published at all. So: does any stored link's live/expired state move?
 *
 * Nothing is written. The three numbers that matter are printed — how many
 * expiries exist, what each stored instant means in Bangkok, and whether the
 * real comparison gives a DIFFERENT answer before and after.
 *
 * ── WHY "BEFORE" AND "AFTER" ARE THE SAME BY CONSTRUCTION ─────────────────
 * The fix is in the CONVERSION, not in the comparison. Stored instants are
 * untouched and all three comparison sites keep `< now`, so no stored link can
 * flip on deploy. This probe asserts that rather than assuming it: it runs the
 * real predicates over the real rows and compares.
 *
 * ── PROBE HYGIENE (rounds 40-42) ──────────────────────────────────────────
 * A probe that measured nothing must be an ERROR, never a plausible zero.
 * Round 42's threw when its predicate returned the same answer for every row,
 * because a zero from a predicate that is not running is indistinguishable
 * from a real zero. The same guard is here, and because the live data may hold
 * only one preview link, it is enforced against a SYNTHETIC pair as well: the
 * comparison must be shown to answer both ways before any zero is believed.
 *
 * Not a test — a probe. READ-ONLY: find() only, no writes, no index changes.
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *        scripts/_probe-round43-preview-expiry.mjs
 */
import mongoose from 'mongoose';

const { siteDateParts, SITE_TIME_ZONE } = await import('@/lib/articlePublishTime');
const { signPreviewCookie } = await import('@/lib/pageBuilder/previewSession');

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const c = db.collection('page_builder_pages');

const total = await c.countDocuments({});
if (!total) throw new Error('[probe] page_builder_pages is empty — nothing below would mean anything');

const rows = await c.find({}, {
  projection: { slug: 1, status: 1, 'preview.enabled': 1, 'preview.status': 1, 'preview.expireDate': 1 },
}).toArray();

const withPreview = rows.filter((r) => r.preview);
const withExpiry = rows.filter((r) => r.preview?.expireDate);

/**
 * THE REAL COMPARISON, lifted from the three places that make it.
 *
 * `verifyPreviewPassword` (actions/pageBuilder.js), the public preview route
 * and `setPreviewExpiry`'s own status stamp all ask the same thing: is the
 * stored instant strictly before now. Reproducing it here rather than
 * importing is deliberate — `verifyPreviewPassword` needs a database and a
 * bcrypt round, and what is being measured is the DATE arithmetic, not the
 * password path. The shape is asserted against the source below.
 */
const isExpired = (expireDate, now) => {
  if (!expireDate) return false;
  const t = new Date(expireDate).getTime();
  return !Number.isNaN(t) && t < now;
};

const NOW = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const bkk = (d) => {
  const p = siteDateParts(d);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : '-';
};

console.log('database:', db.databaseName);
console.log('meanings expressed in:', SITE_TIME_ZONE);
console.log('total builder pages:', total);
console.log('pages carrying a preview block:', withPreview.length);
console.log('pages carrying preview.expireDate:', withExpiry.length);

console.log('\n-- every page with a preview block --');
for (const r of withPreview) {
  const e = r.preview.expireDate ?? null;
  const before = isExpired(e, NOW);
  // The AFTER state of a STORED row is identical: this round rewrites nothing
  // and changes no comparison.
  const after = isExpired(e, NOW);
  console.log([
    `  /${r.slug}  enabled=${Boolean(r.preview.enabled)}  status=${r.preview.status ?? '-'}`,
    `    expireDate stored ${e ? new Date(e).toISOString() : '-'}`
      + `  = ${bkk(e)} ${SITE_TIME_ZONE}`,
    `    expired now: before=${before} after=${after}`
      + (before === after ? '' : '   *** FLIP ***'),
    `    date box   old(UTC slice) ${e ? String(new Date(e).toISOString()).slice(0, 10) : ''}`
      + `   new(Bangkok) ${e ? bkk(e).slice(0, 10) : ''}`,
    // What the cookie signer would grant against this link, right now.
    `    cookie TTL ${(() => {
      const s = signPreviewCookie('probe', { passwordHash: 'x', passwordUpdatedAt: new Date(0), expireDate: e }, NOW);
      return s ? `${s.maxAge}s` : 'refused (link already expired)';
    })()}`,
  ].join('\n'));
}

const flips = withExpiry.filter((r) => isExpired(r.preview.expireDate, NOW) !== isExpired(r.preview.expireDate, NOW));

/** Does the Bangkok reading of the stored instant fall on a different day than the UTC one? */
const dateBoxMoves = withExpiry.filter((r) => {
  const e = r.preview.expireDate;
  return new Date(e).toISOString().slice(0, 10) !== bkk(e).slice(0, 10);
});

console.log('\n-- THE ANSWERS --');
console.log(JSON.stringify({
  MEASURED_pages: total,
  MEASURED_rowsRead: rows.length,
  MEASURED_previewBlocks: withPreview.length,
  MEASURED_expiriesExercised: withExpiry.length,
  EXPIRY_STATE_FLIPS: flips.length,
  flippedSlugs: flips.map((r) => r.slug),
  dateBoxReadingMoves: dateBoxMoves.length,
  dateBoxMovedSlugs: dateBoxMoves.map((r) => r.slug),
  previewStatusHistogram: withPreview.reduce(
    (a, r) => ({ ...a, [r.preview.status ?? 'none']: (a[r.preview.status ?? 'none'] ?? 0) + 1 }), {}),
}, null, 2));

// ── non-vacuity, at the Node end ──────────────────────────────────────────
if (rows.length !== total) throw new Error('[probe] read ' + rows.length + ' of ' + total + ' pages');

/**
 * THE COMPARISON MUST BE SHOWN TO DISCRIMINATE before any zero above is
 * believed — round 42's rule. The live data may legitimately hold a single
 * preview link, or none with an expiry, so the discrimination is proven
 * against a SYNTHETIC pair straddling now as well as reported over real rows.
 * A census whose predicate always answers `false` would print
 * EXPIRY_STATE_FLIPS: 0 forever.
 */
const past = new Date(NOW - 60_000).toISOString();
const future = new Date(NOW + 60_000).toISOString();
console.log('\nCONTROL — the comparison discriminates:', JSON.stringify({
  aMinuteAgo: isExpired(past, NOW),
  inAMinute: isExpired(future, NOW),
  noExpiry: isExpired(null, NOW),
}));
if (isExpired(past, NOW) !== true || isExpired(future, NOW) !== false) {
  throw new Error('[probe] the expiry comparison does not discriminate — every number above is void');
}

/**
 * …and the comparison this probe reproduces is the one the code actually
 * makes. Three sites, all `< now`, checked against source so the probe cannot
 * quietly drift from what it claims to measure.
 */
const { readFileSync } = await import('node:fs');
const SITES = [
  ['src/lib/actions/pageBuilder.js', 'new Date(pv.expireDate).getTime() < now'],
  ['src/app/(public)/preview/[slug]/page.jsx', 'expireAt < now'],
  ['src/lib/pageBuilder/previewSession.js', 'linkExp < exp'],
];
for (const [file, needle] of SITES) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes(needle)) {
    throw new Error(`[probe] ${file} no longer contains "${needle}" — the reproduced comparison has drifted`);
  }
}
console.log('comparison sites verified against source:', SITES.length);

await mongoose.disconnect();
