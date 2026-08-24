/**
 * ROUND 65 §H — every stored rich_text must CHANGE, and change the same way.
 *
 * ── BYTE-IDENTITY DOES NOT APPLY TO THIS ROUND, AND SAYING SO IS THE POINT ─
 * Rounds 50, 57, 59, 60 and 61 each proved a change inert by rendering every
 * stored shape through the pre-change component and reporting ZERO differing.
 * That gate is the wrong instrument here: this round is MEANT to alter every
 * stored rich_text, so a zero would mean the change did not land. Reporting one
 * would be the same harness pointed at a question it cannot answer.
 *
 * So it is INVERTED. Same corpus, same before/after render out of git, and the
 * assertion flips: every stored shape must DIFFER, and the difference must be
 * confined to the wrapper's class attribute. Nothing inside the prose — no node,
 * no text, no href, no attribute on any child — may move, because a type-scale
 * change has no business editing an author's content.
 *
 * The control is the mirror of the usual one: a shape rendered through the SAME
 * component twice must come back equal. Without it, "everything differed" is
 * indistinguishable from a harness that reports a difference for anything.
 *
 * READ-ONLY apart from one temp file it creates and removes under src/.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round65-stored-rich-text.mjs
 *   BASE_REF=<sha> node --import … (default HEAD)
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MongoClient } from 'mongodb';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const TARGET = 'src/components/pageBuilder/sections/rich_text.jsx';
const BASELINE = 'src/components/pageBuilder/sections/_baseline_rich_text.jsx';

writeFileSync(
  path.join(ROOT, BASELINE),
  execFileSync('git', ['show', `${BASE_REF}:${TARGET}`], { encoding: 'utf8' }),
  'utf8',
);

/** Every rich_text section stored on this clone, from every tree on every doc. */
async function storedDocs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { docs: [], note: 'MONGODB_URI not set — stored corpus skipped' };
  const client = await new MongoClient(uri).connect();
  try {
    const db = client.db(process.env.MONGODB_DB_NAME);
    const rows = await db.collection('page_builder_pages').find({}).toArray();
    const found = [];
    const walk = (arr, where) => {
      for (const s of Array.isArray(arr) ? arr : []) {
        if (!s || typeof s !== 'object') continue;
        if (s.type === 'rich_text') found.push({ where, id: s.id, content: s.content ?? {} });
        for (const k of Object.keys(s.content ?? {})) {
          if (Array.isArray(s.content[k])) walk(s.content[k], where);
        }
      }
    };
    for (const d of rows) {
      walk(d.sections, `${d.slug}:sections`);
      for (const key of ['draft', 'live']) {
        if (d[key]?.sections) walk(d[key].sections, `${d.slug}:${key}`);
      }
    }
    return { docs: found, note: `${rows.length} page docs scanned` };
  } finally { await client.close(); }
}

const { docs: STORED, note } = await storedDocs();

let report;
try {
  const { RichTextSection: Now } = await import('@/components/pageBuilder/sections/rich_text');
  const { RichTextSection: Then } = await import('@/components/pageBuilder/sections/_baseline_rich_text');

  const draw = (C, content) => renderToStaticMarkup(C({ content }));
  /** The wrapper's class, and everything inside it, separated. */
  const split = (html) => {
    if (!html) return { cls: '', inner: '' };
    const d = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
    const box = d.querySelector('body > div');
    return { cls: box?.getAttribute('class') ?? '', inner: box?.innerHTML ?? '' };
  };

  const rows = [];
  for (const s of STORED) {
    const before = draw(Then, s.content);
    const after = draw(Now, s.content);
    const b = split(before);
    const a = split(after);
    rows.push({
      where: s.where,
      id: s.id,
      differs: before !== after,
      classChanged: b.cls !== a.cls,
      innerIdentical: b.inner === a.inner,
      innerBytes: Buffer.byteLength(a.inner, 'utf8'),
      classBefore: b.cls,
      classAfter: a.cls,
    });
  }

  const uniqueAfterClasses = [...new Set(rows.map((r) => r.classAfter))];
  const uniqueBeforeClasses = [...new Set(rows.map((r) => r.classBefore))];

  // CONTROL: the same component twice must be EQUAL, or "all differed" is noise.
  const controlEqual = STORED.every((s) => draw(Now, s.content) === draw(Now, s.content));
  // ...and the comparison must be able to see an inner change at all.
  const witness = { doc: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] } };
  const witnessOther = { doc: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'ข' }] }] } };
  const controlSeesInner = split(draw(Now, witness)).inner !== split(draw(Now, witnessOther)).inner;

  report = {
    baseRef: BASE_REF,
    scan: note,
    storedRichTextSections: rows.length,
    '── every one must DIFFER (byte-identity does NOT apply) ──': '',
    differing: rows.filter((r) => r.differs).length,
    notDiffering: rows.filter((r) => !r.differs).length,
    '── and differ ONLY in the wrapper class ──': '',
    classChanged: rows.filter((r) => r.classChanged).length,
    innerIdentical: rows.filter((r) => r.innerIdentical).length,
    innerChanged: rows.filter((r) => !r.innerIdentical).map((r) => r.id),
    '── uniform: one class string before, one after ──': '',
    distinctClassStringsBefore: uniqueBeforeClasses.length,
    distinctClassStringsAfter: uniqueAfterClasses.length,
    classBefore: uniqueBeforeClasses,
    classAfter: uniqueAfterClasses,
    '── CONTROLS ──': '',
    sameComponentTwiceIsEqual: controlEqual,
    comparisonCanSeeAnInnerChange: controlSeesInner,
    detail: rows.map(({ classBefore, classAfter, ...r }) => r),
  };
} finally {
  rmSync(path.join(ROOT, BASELINE), { force: true });
}

console.log(JSON.stringify(report, null, 2));

const r = report;
const bad = [];
if (!r.storedRichTextSections) bad.push('no stored rich_text found — nothing was measured');
if (r.notDiffering) bad.push(`${r.notDiffering} stored shapes did NOT change`);
if (r.innerChanged.length) bad.push('the prose CONTENT moved: ' + r.innerChanged.join(', '));
if (r.distinctClassStringsAfter !== 1) bad.push('the change is not uniform across stored shapes');
if (!r.sameComponentTwiceIsEqual) bad.push('CONTROL: the same component rendered differently twice');
if (!r.comparisonCanSeeAnInnerChange) bad.push('CONTROL: the comparison cannot see an inner change');
if (bad.length) { console.error('FAILED: ' + bad.join('; ')); process.exit(1); }
console.log('every stored rich_text changed, uniformly, and only in the wrapper class.');
