import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrubSource } from '../sourceScan.mjs';

/**
 * THE INVARIANT: exactly one thing decides a `sortKey`, it is a planner in
 * src/lib/articleSortKey.js, and it is called ON THE SERVER FROM A FRESH READ.
 *
 * Same rule the pinOrder guard next door encodes, for the same reason — a key
 * chosen against one document instead of the whole collection is how b-005 and
 * b-006 were produced — with one difference worth stating: in round 1 there is
 * exactly ONE write path (`createArticle`) and no UI, so this guard is cheap to
 * satisfy today. That is precisely when to install it. Round 2 adds the move
 * controls; a rule written after the second caller exists is a rule negotiated
 * with the code that already broke it.
 *
 * The matchers are deliberately the same three families as
 * test/fs/articlePinOrderWrites.test.mjs, whose header records why an
 * "is this an assignment?" regex was wrong in BOTH directions and why the guard
 * targets PERSISTENCE rather than syntax. They are re-stated here rather than
 * shared because the two guards protect different fields and will diverge in
 * round 2 (sortKey acquires a sort-cascade appearance, exactly the shape that
 * over-fired for pinOrder).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

/** The ONE file allowed to persist a sortKey. */
const WRITER_REL = 'src/lib/actions/articles.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** Comments stripped — a doc block explaining the rule quotes what it forbids. */
const stripComments = (text) => scrubSource(text, { stripImports: false });

const FILES = walk(SRC).map((full) => ({
  rel: path.relative(ROOT, full).split(path.sep).join('/'),
  code: stripComments(readFileSync(full, 'utf8')),
}));

const writer = (() => {
  const f = FILES.find((x) => x.rel === WRITER_REL);
  assert.ok(f, `${WRITER_REL} was not found — re-point WRITER_REL`);
  return f;
})();

const MONGO_WRITES = [
  /\$set\s*\.\s*sortKey/,
  /\$set\s*:\s*\{[^{}]*\bsortKey\b/,
  /\$set\s*=\s*\{[^{}]*\bsortKey\b/,
  /\$inc\s*:\s*\{[^{}]*\bsortKey\b/,
];
const PROPERTY_ASSIGN = /\.\s*sortKey\s*=(?!=)/;
const WRITE_CALLS = /\b(?:updateOne|updateMany|replaceOne|findByIdAndUpdate|findOneAndUpdate|findOneAndReplace|bulkWrite|insertOne|insertMany|create)\s*\(/g;
const CALL_WINDOW = 300;

function writeCallCarriesSortKey(code) {
  for (const m of code.matchAll(WRITE_CALLS)) {
    if (/\bsortKey\b/.test(code.slice(m.index, m.index + CALL_WINDOW))) return true;
  }
  return false;
}

const writesSortKey = (code) =>
  MONGO_WRITES.some((re) => re.test(code)) ||
  PROPERTY_ASSIGN.test(code) ||
  writeCallCarriesSortKey(code);

/** The body of one exported action, so a claim about it cannot be satisfied elsewhere. */
function actionBody(name) {
  const start = writer.code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `could not find ${name} in ${WRITER_REL}`);
  const end = writer.code.indexOf('\nexport async function', start + 10);
  return writer.code.slice(start, end === -1 ? undefined : end);
}

// ── the create path ───────────────────────────────────────────────────────

test('R4-d — createArticle takes its sortKey from the planner, over a FRESH read', () => {
  const body = actionBody('createArticle');

  assert.match(
    body, /nextSortKeyForNew\(/,
    'createArticle must ask the planner for the key. A new article goes to the TOP ' +
    '(max + GAP) regardless of publishedAt — backdating a publish date must not bury ' +
    'an article nobody can then find.',
  );
  assert.match(
    body, /readSortKeyContext\(\)/,
    'and the planner must be fed a read taken at call time. A key decided from anything ' +
    'the caller supplied is a key decided against a snapshot.',
  );
  assert.match(
    body, /Article\.create\(\s*\{\s*\.\.\.buildModelData\([^)]*\),\s*sortKey\s*[,}]/,
    'the assignment must come AFTER the form payload spread, so no payload key can ' +
    'shadow it',
  );
});

test('R4-e — the value is not a literal, a parameter, or the form payload', () => {
  // "Only one file writes it" is satisfied by that file writing whatever it
  // likes — which is exactly what the retired updateArticlePinOrder did.
  const hits = [...writer.code.matchAll(/\bconst\s+sortKey\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.equal(hits.length, 1, `expected exactly ONE place that decides a sortKey, found ${hits.length}: ${hits.join(' | ')}`);
  assert.equal(
    hits[0], 'nextSortKeyForNew(await readSortKeyContext())',
    'a literal, an argument, or anything arithmetic here is a second numbering rule',
  );
});

test('R4-f — updateArticle never touches sortKey', () => {
  // The form's `$set` is the one path that could silently clobber a planned key
  // on every save. It cannot, because articleSchema does not declare the field
  // and zod strips what it does not declare — but that is a guarantee two files
  // away, so it is also asserted where the write happens.
  assert.equal(
    /\bsortKey\b/.test(actionBody('updateArticle')), false,
    'updateArticle must not mention sortKey at all — ordering is not part of saving a ' +
    'document, and a stale form tab would overwrite a position set from the list',
  );
});

test('R4-g — no file outside the single writer persists a sortKey', () => {
  const offenders = FILES
    .filter((f) => f.rel !== WRITER_REL)
    .filter((f) => writesSortKey(f.code))
    .map((f) => f.rel);

  assert.deepEqual(
    offenders, [],
    `These files write a sortKey to Mongo outside ${WRITER_REL}:\n\n` +
    offenders.map((f) => `  ${f}`).join('\n') +
    '\n\nA key written without a view of the whole collection collides, and a collision ' +
    'falls through to the date order — so the position someone chose silently stops ' +
    'deciding anything. Route it through src/lib/articleSortKey.js.',
  );
});

// ── controls ──────────────────────────────────────────────────────────────

test('R4-h — CONTROL: the walker is live and each matcher family fires on shapes only it catches', () => {
  assert.ok(FILES.length > 100, `only walked ${FILES.length} files`);
  assert.equal(writesSortKey(writer.code), true, 'the sanctioned writer does write sortKey');

  const operatorOnly = 'await col.updateMany({}, { $set: { sortKey: 0 } });';
  const assignOnly = 'a.sortKey = 5;';
  const callOnly = 'await Article.updateOne({ _id }, { sortKey: 5 });';

  assert.equal(MONGO_WRITES.some((re) => re.test(operatorOnly)), true, 'operator family');
  assert.equal(PROPERTY_ASSIGN.test(assignOnly), true, 'assignment family');
  assert.equal(PROPERTY_ASSIGN.test(operatorOnly), false, 'assignment family must not cover the operator shape');
  assert.equal(writeCallCarriesSortKey(callOnly), true, 'write-call family');
  assert.equal(
    MONGO_WRITES.some((re) => re.test(callOnly)), false,
    'the operator family must NOT cover the operator-less update, or the write-call ' +
    'family would be untested dead weight',
  );

  for (const shape of [
    'const a = await Article.findById(id);\na.sortKey = 5;\nawait a.save();',
    'await Article.findByIdAndUpdate(id, { $set: { sortKey: 3 } });',
    'await Article.bulkWrite(ops.map((o) => ({ updateOne: { update: { sortKey: o.n } } })));',
  ]) {
    assert.equal(writesSortKey(shape), true, `matcher missed a real write: ${shape}`);
  }
});

test('CONTROL: the matcher does NOT fire on reading, sorting or planning a sortKey', () => {
  // If it did, every consumer would need an exception and the exception list
  // would become the thing under review instead of the code. Round 2 adds
  // `sortKey: -1` to the cascade in this very file — a SORT, not a write — and
  // the pinOrder guard's header records that misclassifying exactly that shape
  // was the original matcher bug.
  for (const shape of [
    'const at = Number(article.sortKey) || 0;',
    '.sort({ isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 })',
    '<RankCell sortKey={a.sortKey} />',
    'writes.push({ _id: String(row._id), sortKey });',
    'const keys = list.map(sortKeyOf).filter((k) => k !== null);',
  ]) {
    assert.equal(writesSortKey(shape), false, `matcher over-fired on: ${shape}`);
  }
});

test('CONTROL: the action-body extractor is scoped, and throws rather than scanning nothing', () => {
  // R4-f is a "does not contain" assertion, which an extractor returning the
  // empty string satisfies perfectly.
  const create = actionBody('createArticle');
  const update = actionBody('updateArticle');

  assert.ok(create.includes('Article.create('), 'createArticle body really is the create path');
  assert.ok(update.includes('findByIdAndUpdate'), 'updateArticle body really is the update path');
  assert.equal(create.includes('export async function updateArticle'), false, 'the two do not overlap');
  assert.throws(() => actionBody('noSuchAction'), /could not find noSuchAction/);
});
