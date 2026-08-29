/**
 * ROUND 50 — BLAST RADIUS, READ-ONLY. How many stored `course_card` sections
 * would change appearance when the price toggle deploys?
 *
 * This script performs NO writes. Not behind a flag, not at all: one `find()`
 * with a projection, a walk, and a report. There is no `updateOne`, no
 * `bulkWrite`, no `$set` anywhere in this file.
 *
 * ── WHY THE ANSWER MUST BE ZERO, AND WHY THAT IS WORTH MEASURING ──────────
 * The field defaults to ON and the renderer reads `content.showPrice !== false`,
 * so a card that does not carry the key keeps its price. That is an argument.
 * The measurement is: count the stored cards, count how many carry the key at
 * all, and count how many carry a LITERAL `false`. Only the last group changes,
 * and no author has been able to write one yet.
 *
 * A zero here and a zero from a query that matched nothing print the same
 * number, so the counts that make it meaningful are printed beside it:
 * documents scanned, sections walked, course_card sections found, and — the
 * one that discriminates — how many of those resolve a non-empty courseId and
 * therefore actually draw a price today.
 *
 * ── THE CAVEAT, REPEATED ──────────────────────────────────────────────────
 * This reads whatever MONGODB_URI points at. On this clone that is the dev /
 * staging database, NOT production. Production may hold pages this one does
 * not. What generalises is the SHAPE of the answer — no document can carry a
 * key that no code has ever written — not the specific counts.
 *
 * The walk RECURSES: container / two_column sections nest their children in
 * `content.children` / `content.left` / `content.right`, and a course_card
 * inside a container is just as much a stored course_card. Counting only
 * top-level sections would under-report and would look like a clean result.
 *
 * Usage:  node --env-file=.env.local scripts/_audit-round50-course-card-prices.mjs
 */

import mongoose from 'mongoose';

function die(msg) { console.error('✖ ' + msg); process.exit(1); }

/** Every slot a container can nest child sections in (lib/pageBuilder/containerSlots). */
const SLOTS = ['children', 'left', 'right'];

function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (s.type === 'course_card') out.cards.push(s);
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

/**
 * THE COLLECTION NAME IS ITS OWN TRAP, and this run hit it: the first version
 * of this script queried `pagebuilders` — mongoose's default pluralisation —
 * and reported a confident, entirely false ZERO from a collection that does not
 * exist. The model names it explicitly (`page_builder_pages`), and a missing
 * collection is now an ERROR rather than an empty answer, because the two are
 * the same number and only one of them means anything.
 */
async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die('collection "' + name + '" does not exist — a zero from it would be a lie');
  return db.collection(name);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // Raw collection access — no model import chain, and a read-only find().
  const pages = await requireCollection(db, 'page_builder_pages');
  const docs = await pages
    .find({}, { projection: { slug: 1, status: 1, sections: 1, draft: 1 } })
    .toArray();

  /**
   * VERSION SNAPSHOTS COUNT TOO — under `snapshot.sections`, which is the
   * SECOND false zero this script produced before it was believed (the first
   * was the collection name). `page_versions` holds restorable copies of a
   * page's sections; a card in there becomes a live card the moment someone
   * restores it, so leaving it out would under-report the radius.
   */
  const versionsCol = await requireCollection(db, 'page_versions');
  const versions = await versionsCol
    .find({}, { projection: { pageId: 1, versionNumber: 1, snapshot: 1 } })
    .toArray();

  const live = { walked: 0, cards: [], types: {} };
  const draft = { walked: 0, cards: [], types: {} };
  const versioned = { walked: 0, cards: [], types: {} };
  const perPage = [];

  for (const d of docs) {
    const before = live.cards.length + draft.cards.length;
    walk(d.sections, live);
    walk(d?.draft?.sections, draft);
    const added = live.cards.length + draft.cards.length - before;
    if (added) perPage.push({ slug: d.slug, status: d.status, courseCards: added });
  }
  for (const v of versions) walk(v?.snapshot?.sections, versioned);

  const all = [...live.cards, ...draft.cards, ...versioned.cards];
  const withKey = all.filter((s) => Object.hasOwn(s.content ?? {}, 'showPrice'));
  const literalFalse = all.filter((s) => s?.content?.showPrice === false);
  // "Draws a price today" = fails-closed only on an empty code; a code that is
  // set but unresolvable is a runtime fact this read cannot see, and the report
  // says so rather than implying it counted it.
  const withCode = all.filter((s) => String(s?.content?.courseId ?? '').trim() !== '');

  console.log('');
  console.log('── round 50 blast radius — READ ONLY, NOTHING WAS WRITTEN ─────────────');
  console.log('');
  console.log('  database                      : ' + (mongoose.connection.name ?? '(default)'));
  console.log('  page_builder_pages scanned    : ' + docs.length);
  console.log('  page_versions scanned         : ' + versions.length);
  console.log('  sections walked (live)        : ' + live.walked);
  console.log('  sections walked (draft)       : ' + draft.walked);
  console.log('  sections walked (versions)    : ' + versioned.walked);
  console.log('');
  // CONTROL. A walk that resolved nothing reports zero course_cards and zero of
  // everything else; a walk that works reports a spread of real types. This is
  // what separates "no card carries the key" from "the walk never ran".
  const spread = Object.entries({ ...live.types, ...draft.types, ...versioned.types });
  console.log('  CONTROL — section types seen  : ' + spread.length + '  (' +
    spread.map(([t, n]) => t + '×' + n).slice(0, 8).join(', ') + (spread.length > 8 ? ', …' : '') + ')');
  console.log('');
  console.log('  course_card sections, live    : ' + live.cards.length);
  console.log('  course_card sections, draft   : ' + draft.cards.length);
  console.log('  course_card sections, versions: ' + versioned.cards.length);
  console.log('  ── total                      : ' + all.length);
  console.log('  …of those, with a course code : ' + withCode.length + '   (these draw a price today)');
  console.log('  …carrying a showPrice key     : ' + withKey.length);
  console.log('  …carrying a LITERAL false     : ' + literalFalse.length);
  console.log('');
  console.log('  ── THE ANSWER ──');
  console.log('  cards that CHANGE on deploy   : ' + literalFalse.length);
  console.log('');
  if (perPage.length) {
    console.log('  pages holding a course_card:');
    for (const p of perPage) console.log('    ' + String(p.slug).padEnd(34) + String(p.status ?? '').padEnd(12) + p.courseCards);
    console.log('');
  }
  console.log('  CAVEAT: this is whatever MONGODB_URI points at — the dev/staging');
  console.log('  database on this clone, not production. The shape of the answer');
  console.log('  generalises (no document can carry a key no code has written);');
  console.log('  the counts do not.');
  console.log('');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
