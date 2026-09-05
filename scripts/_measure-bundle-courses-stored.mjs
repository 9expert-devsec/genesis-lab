/**
 * Every stored `bundle_courses` section, in all three places a page's sections
 * are kept. READ-ONLY: find() only, no writes, no migrations.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 * `promotion_bundle` is about to ship into the same picker group as
 * `bundle_courses`, which is labelled `คอร์สในแพ็กเกจ` and renders a plain grid
 * of course cards from `content.courseIds`. Two bundle-ish types in one group
 * is a choice an author has to make with nothing on screen to make it by, and
 * the round-80 `RETIRED_SECTION_TYPES` mechanism exists for exactly this shape.
 *
 * Whether to retire `bundle_courses` is a decision that must rest on a COUNT,
 * not an impression — retiring a type that is in real use costs authors the
 * ability to add one, and keeping a type nobody uses costs every future author
 * a choice they cannot resolve. This measures which of those we are in.
 *
 * ── THE NAMES THAT HAVE BEEN GOT WRONG BEFORE ─────────────────────────────
 * Copied deliberately from scripts/_measure-round81-stored.mjs, which records
 * them because each has cost a run:
 *
 *   · the collection is `page_builder_pages`, NOT `pagebuilders`;
 *   · a version's sections are at `snapshot.sections`, NOT `content.sections`,
 *     and `snapshot` lives in `page_versions` (a whole page document), not on
 *     the page;
 *   · on the page document the PUBLISHED sections are the top-level `sections`
 *     array and the in-progress ones are `draft.sections`.
 *
 * Every wrong name returns an empty result rather than an error, so a run
 * against any of them reports "zero stored sections" and reads as good news —
 * which is the exact answer this script exists to be trusted about. So the walk
 * asserts it found sections AT ALL before reporting any count, and exits 1 if
 * it did not.
 *
 * A second, narrower version of the same trap: `bundle_courses` could be zero
 * while the walk is healthy. That is a real and useful answer, so it is NOT an
 * error — but the run prints the per-type census beside it, so a zero can be
 * read against the types that ARE stored rather than taken on faith.
 *
 * Run:  node --env-file=.env.local scripts/_measure-bundle-courses-stored.mjs
 */
import { MongoClient } from 'mongodb';

const TYPE = 'bundle_courses';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = await new MongoClient(uri).connect();
const db = client.db(process.env.MONGODB_DB_NAME);
console.log(`DATABASE: ${db.databaseName}`);

/**
 * Every section node, however deeply nested inside container children.
 *
 * ── IT DESCENDS THROUGH NAMED SLOTS, NOT THROUGH EVERY ARRAY ──────────────
 * The first version of this walk recursed into ANY array under `content`, which
 * is what scripts/_measure-round81-stored.mjs does. That is wrong and it showed
 * up in the first run as a census line reading `49 undefined`: a `checklist`'s
 * `content.items`, a `timeline`'s / `tabs`' / `accordion`'s items and a
 * `price_card`'s `features` are all arrays under `content`, and every entry in
 * them was being counted as a section.
 *
 * It could not change THIS script's answer — an item object has no `type`, so
 * it can never be counted as a `bundle_courses` — but it made the census beside
 * the answer, which is the thing that lets a zero be trusted, off by 49 on a
 * corpus of 6 pages. A measurement whose supporting number is wrong is not a
 * measurement.
 *
 * The slots are the ones lib/pageBuilder/containerSlots.js declares. They are
 * RESTATED here rather than imported, because this script talks to Mongo
 * directly and importing from `@/…` would drag the app's alias resolution and
 * its server-only modules into a standalone node run. The list is four names
 * long and the census is what would catch it drifting: a container's children
 * disappearing from the count is exactly as visible as items appearing in it.
 */
const CONTAINER_SLOTS = ['children', 'left', 'right'];

function walk(arr, out = []) {
  for (const s of Array.isArray(arr) ? arr : []) {
    if (!s || typeof s !== 'object') continue;
    out.push(s);
    for (const slot of CONTAINER_SLOTS) {
      if (Array.isArray(s.content?.[slot])) walk(s.content[slot], out);
    }
  }
  return out;
}

const found = [];
const census = new Map();
let walked = 0;

const record = (where, page, sections) => {
  for (const s of walk(sections)) {
    walked += 1;
    census.set(s.type, (census.get(s.type) ?? 0) + 1);
    if (s.type === TYPE) {
      found.push({ where, slug: page.slug, status: page.status, id: s.id, content: s.content ?? {} });
    }
  }
};

const pages = await db.collection('page_builder_pages').find({}).toArray();
for (const d of pages) {
  const page = { slug: d.slug, status: d.status };
  record('live', page, d.sections);            // what /[...slug] renders
  record('draft', page, d?.draft?.sections);
}
for (const v of await db.collection('page_versions').find({}).toArray()) {
  const snap = v?.snapshot ?? {};
  record('version', { slug: `${snap.slug ?? v.pageId}@v${v.versionNumber ?? '?'}`, status: snap.status }, snap.sections);
}

console.log(`pages: ${pages.length}   sections walked: ${walked}`);
if (walked === 0) {
  console.error('X walked ZERO sections — a PATH is wrong, not the data. Do not read the count below.');
  await client.close();
  process.exit(1);
}

// ── the census, so a zero above can be read against a healthy walk ─────────
console.log('\nsections by type (all three places):');
for (const [type, n] of [...census].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${type}`);
}

// ── the answer ────────────────────────────────────────────────────────────
console.log(`\n${TYPE} sections stored: ${found.length}`);

const livePages = new Set(found.filter((f) => f.where === 'live').map((f) => f.slug));
const draftPages = new Set(found.filter((f) => f.where === 'draft').map((f) => f.slug));
const anyPage = new Set([...livePages, ...draftPages]);
const publishedPages = new Set(
  found.filter((f) => f.where !== 'version' && f.status === 'published').map((f) => f.slug)
);

console.log(`  distinct pages (live or draft): ${anyPage.size}`);
console.log(`    of which status='published':  ${publishedPages.size}`);
console.log(`  in a live sections array:       ${livePages.size} page(s)`);
console.log(`  in a draft only:                ${[...draftPages].filter((s) => !livePages.has(s)).length} page(s)`);
console.log(`  in a version snapshot:          ${found.filter((f) => f.where === 'version').length} occurrence(s)`);

if (found.length) {
  console.log('\nwhat content.courseIds actually holds:');
  for (const f of found) {
    const ids = Array.isArray(f.content.courseIds) ? f.content.courseIds : null;
    const shape = ids === null ? 'courseIds ABSENT or not an array' : `[${ids.map((x) => JSON.stringify(x)).join(', ')}]`;
    const extra = Object.keys(f.content).filter((k) => k !== 'courseIds');
    console.log(
      `  ${f.where.padEnd(8)} ${String(f.slug).padEnd(38)} status=${String(f.status ?? '?').padEnd(10)} ` +
      `n=${ids === null ? '-' : ids.length} ${shape}${extra.length ? `  other content keys: ${extra.join(',')}` : ''}`
    );
  }
} else {
  console.log(`\nno ${TYPE} section is stored anywhere — the walk above is healthy, so this is a real zero.`);
}

await client.close();
