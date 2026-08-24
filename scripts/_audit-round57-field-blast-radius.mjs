/**
 * ROUND 57 — BLAST RADIUS, READ-ONLY. How many stored sections would change
 * appearance when the new content fields deploy?
 *
 * No writes. Not behind a flag, not at all: one find() per collection, a walk,
 * and a report. There is no updateOne, no bulkWrite, no $set in this file.
 *
 * ── ROUND 50's PROBE PRODUCED TWO FALSE ZEROS. BOTH ARE PRE-EMPTED HERE ───
 * 1. THE COLLECTION NAME. It queried `pagebuilders` — mongoose's default
 *    pluralisation — and reported a confident ZERO from a collection that does
 *    not exist. The real name is `page_builder_pages`. Every collection this
 *    file reads goes through `requireCollection`, which ERRORS on a missing
 *    name rather than returning an empty cursor, because "no documents" and
 *    "no collection" are the same number and only one of them means anything.
 * 2. THE VERSION PATH. It then read version snapshots at `content.sections`
 *    and reported another zero; they live at `snapshot.sections`. That path is
 *    asserted below by counting the sections it finds, and the run fails loudly
 *    if a non-empty `page_versions` yields zero sections.
 *
 * A third control beyond those two: a TYPE HISTOGRAM. A walk that resolved
 * nothing reports zero of the types under test and zero of everything else; a
 * walk that works reports a spread. That is what separates "no section carries
 * the new keys" from "the walk never ran".
 *
 * ── THE CAVEAT, REPEATED ──────────────────────────────────────────────────
 * This reads whatever MONGODB_URI points at — on this clone the dev/staging
 * database, NOT production. What generalises is the SHAPE of the answer (no
 * document can carry a key no code has ever written), not the counts.
 *
 * Usage: node --env-file=.env.local scripts/_audit-round57-field-blast-radius.mjs
 */
import mongoose from 'mongoose';

function die(msg) { console.error('✖ ' + msg); process.exit(1); }

/** Every slot a container nests children in (lib/pageBuilder/containerSlots). */
const SLOTS = ['children', 'left', 'right'];

/** type → the keys round 57 adds to it. */
const NEW_FIELDS = {
  price_card: ['originalPrice', 'discountBadge', 'footnote', 'ribbon'],
  cta:        ['secondaryButtonLabel', 'secondaryButtonHref'],
  heading:    ['eyebrow'],
  checklist:  ['heading'],
};

function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (NEW_FIELDS[s.type]) (out.found[s.type] ??= []).push(s);
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ walked: 0, types: {}, found: {} });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  const pages = await (await requireCollection(db, 'page_builder_pages'))
    .find({}, { projection: { slug: 1, status: 1, sections: 1, draft: 1 } }).toArray();
  const versions = await (await requireCollection(db, 'page_versions'))
    .find({}, { projection: { pageId: 1, versionNumber: 1, snapshot: 1 } }).toArray();

  const live = bucket(); const draft = bucket(); const versioned = bucket();
  for (const d of pages) { walk(d.sections, live); walk(d?.draft?.sections, draft); }
  for (const v of versions) walk(v?.snapshot?.sections, versioned);

  // FALSE-ZERO GUARD #2, made to fail loudly rather than read as clean.
  if (versions.length > 0 && versioned.walked === 0) {
    die('page_versions holds documents but the walk found no sections — the snapshot path is wrong again');
  }

  const all = (type) => [
    ...(live.found[type] ?? []), ...(draft.found[type] ?? []), ...(versioned.found[type] ?? []),
  ];

  console.log('');
  console.log('── round 57 blast radius — READ ONLY, NOTHING WAS WRITTEN ─────────────');
  console.log('');
  console.log('  database                      : ' + (mongoose.connection.name ?? '(default)'));
  console.log('  page_builder_pages scanned    : ' + pages.length);
  console.log('  page_versions scanned         : ' + versions.length);
  console.log('  sections walked (live/draft/versions) : '
    + live.walked + ' / ' + draft.walked + ' / ' + versioned.walked);

  const spread = Object.entries({ ...live.types, ...draft.types, ...versioned.types });
  console.log('  CONTROL — distinct section types seen : ' + spread.length
    + '  (' + spread.map(([t, n]) => t + '×' + n).slice(0, 8).join(', ') + (spread.length > 8 ? ', …' : '') + ')');
  console.log('');

  let totalChanging = 0;
  for (const [type, keys] of Object.entries(NEW_FIELDS)) {
    const rows = all(type);
    const carrying = rows.filter((s) => keys.some((k) => Object.hasOwn(s.content ?? {}, k)));
    const nonEmpty = rows.filter((s) => keys.some((k) => String(s?.content?.[k] ?? '').trim() !== ''));
    totalChanging += nonEmpty.length;
    console.log('  ' + type.padEnd(12)
      + ' stored: ' + String(rows.length).padStart(3)
      + ' | carrying any new key: ' + String(carrying.length).padStart(3)
      + ' | NON-EMPTY (would change): ' + String(nonEmpty.length).padStart(3));
  }

  console.log('');
  console.log('  ── THE ANSWER ──');
  console.log('  sections that CHANGE on deploy : ' + totalChanging);
  console.log('');
  console.log('  CAVEAT: this is whatever MONGODB_URI points at — the dev/staging');
  console.log('  database on this clone, not production. The shape of the answer');
  console.log('  generalises; the counts do not.');
  console.log('');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
