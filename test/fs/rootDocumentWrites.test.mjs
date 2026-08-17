import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankStringBodies, readSource, walkSources } from '../sourceScan.mjs';

/**
 * NO RootDocument WRITE MAY SKIP DOCUMENT MIDDLEWARE.
 *
 * ══ WHY THIS GUARD EXISTS ═══════════════════════════════════════════════════
 *
 * MEASURED last round: mongoose runs `pre('validate')` on `.save()`,
 * `.create()` and `.validate()` and NOT on `validateSync()`. The query-level
 * writers below never build a document at all — they hand a filter and an update
 * to the driver — so on those paths `pathKey` IS NEVER DERIVED. A row lands with
 * whatever key the caller passed, or with none, and the unique index cannot
 * object because the strings genuinely differ.
 *
 * `lowercase: true` on the schema used to cover that by accident. It was removed
 * deliberately — it silently masked the real derivation and made the mixed-case
 * control unfalsifiable — which left the rule stated in a comment and enforced
 * by nothing. THAT is the shape that has burned this repo twice (ADMIN_PAGES vs
 * NAV_GROUPS, and the two audit classifiers): two things that must agree, with
 * nothing forcing agreement.
 *
 * ══ SCOPED TO THIS MODEL, DELIBERATELY ══════════════════════════════════════
 *
 * `updateOne`, `bulkWrite` and the rest are CORRECT and widely used elsewhere in
 * this repo — a repo-wide ban would be plainly wrong and would fail on dozens of
 * legitimate call sites. What makes them wrong HERE is specific and local: this
 * model's lookup key is derived by middleware they do not run. So the scan keys
 * off the IMPORT — it finds what each file calls the RootDocument default export
 * and checks only calls on that binding.
 *
 * ══ IT IS LIVE NOW — IT WAS NOT WHEN IT WAS WRITTEN ═════════════════════════
 *
 * When this guard shipped NOTHING imported the model, so the repo-wide
 * assertion was a floor that passed because there was nothing to catch. The
 * first importer has since landed: src/app/root-file/[...path]/route.js reads
 * the registry with `.findOne().lean()`, which is exactly the shape this guard
 * permits, so it now passes for the right reason rather than for lack of a
 * subject.
 *
 * The DETECTOR is still proved against synthetic fixtures that own their own
 * data — one call site per banned method, plus legitimate `.save()`/`.create()`
 * sites that must NOT be flagged — because a real tree with one compliant
 * importer still cannot demonstrate that a violation would be caught.
 */

const MODEL = 'src/models/RootDocument.js';

/**
 * The query-level writers. Every one of these talks to the driver without
 * building a document, so none of them runs `pre('validate')`.
 */
const BANNED = Object.freeze([
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate',
  'replaceOne', 'bulkWrite', 'insertMany',
]);

/** The two that DO run document middleware. The only sanctioned write path. */
const ALLOWED = Object.freeze(['save', 'create']);

/** The raw collection name — reaching it by string bypasses the model entirely. */
const COLLECTION = 'root_documents';

/**
 * Local binding names a source text gives the RootDocument DEFAULT export.
 *
 * Read from `withImports`, because that is the one form where the import
 * statement still exists. Keyed off the binding rather than the literal word
 * "RootDocument" so an aliased import (`import Reg from '@/models/RootDocument'`)
 * is still caught — an alias is exactly how a ban like this gets walked around
 * without anybody meaning to.
 *
 * `blankStringBodies` is NOT applied here, and that is the opposite of the rule
 * `bypassWrites` follows one function below. MEASURED while writing this: the
 * import SPECIFIER is itself a string, so blanking string bodies turns
 * `'@/models/RootDocument'` into empty quotes and the scan resolves no bindings
 * at all — silently, and a binding set of size zero makes the whole guard skip
 * the file. Blank string bodies when the subject is an identifier; never when
 * the subject is the text.
 */
export function rootDocumentBindings(withImports) {
  const re = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"][^'"]*\/RootDocument(?:\.js)?['"]/g;
  return new Set([...String(withImports).matchAll(re)].map((m) => m[1]));
}

/**
 * Banned calls on those bindings, as `{ binding, method }`.
 *
 * String bodies are blanked first: a log line or an error message naming
 * `RootDocument.updateOne` is text, not a call, and counting it would make this
 * guard cry wolf on its own documentation.
 */
export function bypassWrites(code, bindings) {
  const text = blankStringBodies(code);
  const found = [];
  for (const binding of bindings) {
    for (const method of BANNED) {
      const re = new RegExp(String.raw`(?<![.\w$])${binding}\s*\.\s*${method}\s*\(`, 'g');
      for (const _ of text.matchAll(re)) found.push({ binding, method });
    }
    // `Model.collection` is the raw driver handle. Reaching it skips the schema,
    // the hooks and the validators in one step, so it is banned outright rather
    // than by method — there is no safe call on it for this model.
    const rawHandle = new RegExp(String.raw`(?<![.\w$])${binding}\s*\.\s*collection\b`, 'g');
    for (const _ of text.matchAll(rawHandle)) found.push({ binding, method: 'collection' });
  }
  return found;
}

// ── the detector, proved on fixtures that own their own data ────────────────

/** One call site per banned method, on an ALIASED import. */
const OFFENDING = `
  import Reg from '@/models/RootDocument';
  export async function bad() {
    await Reg.updateOne({ a: 1 }, { $set: { b: 2 } });
    await Reg.updateMany({}, {});
    await Reg.findOneAndUpdate({}, {});
    await Reg.findByIdAndUpdate('x', {});
    await Reg.replaceOne({}, {});
    await Reg.bulkWrite([]);
    await Reg.insertMany([]);
  }`;

/** The sanctioned write path, plus reads, plus a lookalike on another model. */
const INNOCENT = `
  import RootDocument from '@/models/RootDocument';
  import Article from '@/models/Article';
  export async function fine() {
    const row = new RootDocument({ publicPath: '/x.pdf' });
    await row.save();
    await RootDocument.create({ publicPath: '/y.pdf' });
    await RootDocument.findOne({ pathKey: '/x.pdf' }).lean();
    await RootDocument.find({}).sort({ uploadedAt: -1 }).lean();
    await Article.updateOne({}, {});
    await Article.bulkWrite([]);
  }`;

test('CONTROL: every banned method IS caught, on an aliased import', () => {
  const bindings = rootDocumentBindings(OFFENDING);
  assert.deepEqual([...bindings], ['Reg'], 'the alias was not resolved, so nothing below is real');

  const found = bypassWrites(OFFENDING, bindings);
  assert.deepEqual(
    [...new Set(found.map((f) => f.method))].sort(), [...BANNED].sort(),
    'the detector missed a banned method — the repo-wide assertion below would '
    + 'go green over exactly that one',
  );
  assert.equal(found.length, BANNED.length, 'one hit per call site, no double counting');
});

test('CONTROL: .save()/.create()/reads are NOT flagged, and another model is untouched', () => {
  // The other half. A detector that flagged everything would satisfy the control
  // above and would ban the only sanctioned write path.
  const bindings = rootDocumentBindings(INNOCENT);
  assert.deepEqual([...bindings], ['RootDocument']);
  assert.deepEqual(bypassWrites(INNOCENT, bindings), [],
    'a legitimate call site was flagged. Article.updateOne is CORRECT — the ban '
    + 'is scoped to this model, not to the method names');
});

test('CONTROL: the raw driver handle is caught too', () => {
  const src = `
    import RootDocument from '@/models/RootDocument';
    export const x = () => RootDocument.collection.updateOne({}, {});`;
  const found = bypassWrites(src, rootDocumentBindings(src));
  assert.ok(found.some((f) => f.method === 'collection'),
    'Model.collection skips the schema, the hooks and the validators in one step');
});

test('CONTROL: a string MENTIONING a banned call is not a call', () => {
  // The guard's own documentation names these methods. Counting text as code
  // would make it cry wolf on any file that explains the rule.
  // The fixture must contain a COMPLETE call, parentheses and all. Written
  // without them first, and it proved nothing: the matcher requires `(`, so it
  // never fired either way and removing the string-blanking reddened nothing.
  const src = `
    import RootDocument from '@/models/RootDocument';
    export const NOTE = 'never call RootDocument.updateOne({}, {}) here';`;
  assert.match(src, /RootDocument\.updateOne\(/, 'the fixture must contain a real-looking call');
  assert.deepEqual(bypassWrites(src, rootDocumentBindings(src)), []);
});

// ── the repo-wide scan ──────────────────────────────────────────────────────

test('CONTROL: the scan really read a substantial tree', () => {
  // Without this, "zero violations" could mean the walk returned nothing.
  const files = [...walkSources('src'), ...walkSources('scripts')];
  assert.ok(files.length > 200, `the walk found only ${files.length} files`);
  assert.ok(files.some((f) => f.rel === MODEL), `${MODEL} was not reached by the walk`);
});

test('THE GUARD: nothing in src/ or scripts/ writes a RootDocument past middleware', () => {
  const violations = [];
  for (const file of [...walkSources('src'), ...walkSources('scripts')]) {
    const bindings = rootDocumentBindings(file.withImports);
    if (!bindings.size) continue;
    for (const hit of bypassWrites(file.code, bindings)) {
      violations.push(`${file.rel}: ${hit.binding}.${hit.method}(`);
    }
  }
  assert.deepEqual(
    violations, [],
    'These writes skip pre(\'validate\'), so pathKey is never derived and the row '
    + 'lands with an underived key. Use .save() or .create():\n'
    + violations.join('\n'),
  );
});

test('THE GUARD: nothing reaches the collection by raw name either', () => {
  // The last way round the model: `db.collection('root_documents')`. It does not
  // import anything, so the binding scan cannot see it.
  const offenders = [];
  for (const file of [...walkSources('src'), ...walkSources('scripts')]) {
    if (file.rel === MODEL) continue;   // the model declares its own collection
    if (new RegExp(String.raw`collection\(\s*['"]${COLLECTION}['"]`).test(file.code)) {
      offenders.push(file.rel);
    }
  }
  assert.deepEqual(offenders, [],
    'a raw driver handle on root_documents bypasses the schema entirely');
});

test('CONTROL: that raw-name matcher DOES fire on a synthetic offender', () => {
  const src = `const rows = db.collection('${COLLECTION}');`;
  assert.equal(new RegExp(String.raw`collection\(\s*['"]${COLLECTION}['"]`).test(src), true);
  assert.equal(
    new RegExp(String.raw`collection\(\s*['"]${COLLECTION}['"]`).test("db.collection('webroot_document_files')"),
    false, 'and it does not fire on a DIFFERENT collection — the ban is scoped');
});

// ── the header and the guard cannot drift ───────────────────────────────────

/**
 * The model header's ban PARAGRAPH — the block a person actually reads before
 * writing a publish action.
 *
 * Bounded, rather than searched for across the whole header, because the header
 * mentions `.save()` in several places. An assertion that only asked "does this
 * file contain .save() anywhere" was written first and DELETED: a revert that
 * stripped `.save()` out of this very paragraph reddened nothing, because
 * another sentence still mentioned it. Scope is what makes it falsifiable.
 */
function banParagraph(raw) {
  const at = raw.indexOf('THE PUBLISH PATH MUST USE');
  return at === -1 ? '' : raw.slice(at, raw.indexOf('*/', at));
}

/** The indented method list out of that paragraph. */
function bannedNamesInHeader(raw) {
  return banParagraph(raw).split('\n')
    .filter((line) => /^\s*\*\s{4,}\w/.test(line))
    .flatMap((line) => line.match(/[A-Za-z][\w$]*/g) ?? []);
}

test('the model header names EXACTLY the methods this guard bans', () => {
  // The header is what a person reads before writing a publish action. If it
  // listed six of the seven, the seventh would look permitted and the guard
  // would look like a surprise.
  const named = bannedNamesInHeader(readSource(MODEL).raw);
  assert.deepEqual([...named].sort(), [...BANNED].sort(),
    'the model header and this guard disagree about what is banned');
});

test('CONTROL: the header extractor really parses, and can come back empty', () => {
  // Without this, deepEqual against an empty list would be the failure mode —
  // and a header that lost its ban paragraph would read as "nothing banned".
  assert.ok(bannedNamesInHeader(readSource(MODEL).raw).length > 0,
    'the extractor found nothing in the real header — the matcher is broken');
  assert.deepEqual(bannedNamesInHeader('/** no such paragraph */'), [],
    'and it returns empty rather than throwing when the paragraph is gone');
});

test('the SAME paragraph that bans seven methods names the way through', () => {
  // A ban with no stated alternative sends the reader looking for one, and the
  // first thing they find is the method they were about to use.
  const paragraph = banParagraph(readSource(MODEL).raw);
  assert.ok(paragraph.length > 100, 'the ban paragraph was not found — the matcher is broken');
  for (const method of ALLOWED) {
    assert.match(paragraph, new RegExp(String.raw`\.${method}\(\)`),
      `the ban paragraph never names .${method}() as the sanctioned write path`);
  }
});
