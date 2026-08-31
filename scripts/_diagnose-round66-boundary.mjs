/**
 * ROUND 66 §B/§C/§E — reproduce the save path in-process, against the REAL
 * failing page, and walk every value that crosses to the client.
 *
 * The editor route is behind requirePage('pages') — credentials + bcrypt +
 * TOTP — so the browser cannot be driven from here (round 62 hit the same wall).
 * This does the next best thing and the thing §C asks for: it runs
 * saveDraftContent's own body, step for step, minus the auth and the write, on
 * the content actually stored for the page the author reports failing; and it
 * runs resolveBuilderSectionData's resolver over the same sections.
 *
 * §B is the comparison that settles whether round 64 is implicated: the same
 * walk is run over the page WITH its course_schedule and with that section
 * removed. If only one of them is dirty, round 64 is named; if neither is, the
 * code is clean and the cause is elsewhere.
 *
 * READ-ONLY. Reads the page doc, writes nothing, has no --apply, and never
 * calls findByIdAndUpdate.
 *
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *        scripts/_diagnose-round66-boundary.mjs
 */
import { MongoClient } from 'mongodb';
import { nonPlainValues, describeNonPlain } from '../test/plainValue.mjs';

const PAGE = process.env.PAGE_ID ?? '6a9423c32767c5968c7dc0dd';

const { draftContentSchema } = await import('@/lib/schemas/pageBuilder');
const { resolveSectionData } = await import('@/lib/pageBuilder/resolveSectionData');
const { sanitizePageForTier, renumberSections } = await import('@/lib/pages/tierSanitize');
const { effectiveContent } = await import('@/lib/pageBuilder/draftState');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB_NAME);
const { ObjectId } = await import('mongodb');
const doc = await db.collection('page_builder_pages').findOne({ _id: new ObjectId(PAGE) });
await client.close();
if (!doc) { console.error('page not found: ' + PAGE); process.exit(2); }

const report = (label, value) => {
  const hits = nonPlainValues(value);
  console.log(`  ${label.padEnd(46)} ${hits.length ? 'DIRTY (' + hits.length + ')' : 'clean'}`);
  if (hits.length) console.log(describeNonPlain(hits.slice(0, 12)));
  return hits.length;
};

const sectionsOf = (d) => d.draft?.sections ?? d.sections ?? [];
const strip = (arr, type) => (Array.isArray(arr) ? arr : [])
  .filter((s) => s?.type !== type)
  .map((s) => ({ ...s, content: Object.fromEntries(
    Object.entries(s.content ?? {}).map(([k, v]) => [k, Array.isArray(v) ? strip(v, type) : v]),
  ) }));

const all = sectionsOf(doc);
const without = strip(all, 'course_schedule');
const countOf = (arr) => { let n = 0; const w = (a) => { for (const s of Array.isArray(a) ? a : []) {
  if (!s || typeof s !== 'object') continue; if (s.type === 'course_schedule') n += 1;
  for (const k of Object.keys(s.content ?? {})) if (Array.isArray(s.content[k])) w(s.content[k]); } }; w(arr); return n; };

console.log(`PAGE ${PAGE}  slug=${doc.slug}`);
console.log(`  sections: ${all.length} top-level, course_schedule x${countOf(all)} (without: x${countOf(without)})`);

console.log('\n=== §A  what roundIds / roundSnapshots actually hold on this page ===');
const walkSchedules = (arr, out = []) => { for (const s of Array.isArray(arr) ? arr : []) {
  if (!s || typeof s !== 'object') continue;
  if (s.type === 'course_schedule') out.push(s.content ?? {});
  for (const k of Object.keys(s.content ?? {})) if (Array.isArray(s.content[k])) walkSchedules(s.content[k], out);
} return out; };
for (const c of walkSchedules(all)) {
  console.log('   ' + JSON.stringify(c));
  console.log(`     source=${c.source ?? '(absent)'}  roundIds=${JSON.stringify(c.roundIds ?? '(absent)')}  roundSnapshots=${JSON.stringify(c.roundSnapshots ?? '(absent)')}`);
}

console.log('\n=== §C  saveDraftContent, step for step (auth and write omitted) ===');
let dirty = 0;
const patch = effectiveContent(doc);
dirty += report('1. the patch the client would send', patch);
const parsed = draftContentSchema.safeParse(patch);
console.log(`  2. draftContentSchema.safeParse                 ${parsed.success ? 'ok' : 'REJECTED: ' + parsed.error?.issues?.[0]?.message}`);
if (parsed.success) {
  dirty += report('3. parsed.data', parsed.data);
  const sanitized = sanitizePageForTier(parsed.data, effectiveContent(doc), true);
  sanitized.sections = renumberSections(sanitized.sections);
  dirty += report('4. sanitizePageForTier + renumberSections', sanitized);
  const draft = { ...sanitized, savedAt: new Date(), savedBy: { name: 'x', id: 'y' } };
  const hits = nonPlainValues(draft);
  console.log(`  5. the draft object WRITTEN to Mongo           ${hits.length ? 'has ' + hits.length + ' non-plain (expected: savedAt is a Date, server-side only)' : 'clean'}`);
  if (hits.length) console.log(describeNonPlain(hits));
  dirty += report('6. the RETURN value {ok, updatedAt:string}', { ok: true, updatedAt: new Date().toISOString() });
}

console.log('\n=== §B/§E  resolveBuilderSectionData output — WITH vs WITHOUT course_schedule ===');
for (const [label, sections] of [['WITH course_schedule', all], ['WITHOUT course_schedule', without]]) {
  const resolved = await resolveSectionData(sections);
  const hits = nonPlainValues(resolved);
  console.log(`  ${label.padEnd(30)} keys=${Object.keys(resolved).length}  ${hits.length ? 'DIRTY (' + hits.length + ')' : 'clean'}`);
  if (hits.length) console.log(describeNonPlain(hits.slice(0, 20)));
  dirty += hits.length;
}

console.log('\n=== CONTROL: the walk can SEE a planted value ===');
const { ObjectId: OID } = await import('mongodb');
const planted = { a: 1, nested: [{ ok: 'yes' }, { bad: new OID() }] };
const ph = nonPlainValues(planted);
console.log(`  planted ObjectId found: ${ph.length === 1 && ph[0].kind === '_bsontype' ? 'YES at ' + ph[0].path : 'NO — THE WALK IS BROKEN'}`);
const pd = nonPlainValues({ when: new Date() });
console.log(`  planted Date found:     ${pd.length === 1 ? 'YES at ' + pd[0].path : 'NO — THE WALK IS BROKEN'}`);

console.log(`\nTOTAL non-plain values on client-reachable paths: ${dirty}`);
