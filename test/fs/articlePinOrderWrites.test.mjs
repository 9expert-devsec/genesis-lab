import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrubSource } from '../sourceScan.mjs';

/**
 * THE INVARIANT: exactly one thing decides a `pinOrder` value, and it is a
 * planner in src/lib/articlePositioning.js.
 *
 * b-005 and b-006 were both produced by write paths that set ONE positioning
 * field without maintaining the block:
 *
 *   updateArticlePinOrder            wrote a free integer to one row
 *   toggleArticlePinnedOnArticlePage wrote isPinnedOnArticlePage, left pinOrder stale
 *   applyArticlePositionPlan         accepted a whole plan FROM THE BROWSER
 *
 * The third is the subtle one and is why this guard is structural rather than a
 * code-review convention. In a `'use server'` module an export IS a POST
 * endpoint, so an exported action taking `{writes:[{_id, pinOrder}]}` is a free
 * pinOrder write with extra steps — the planner becomes something the client is
 * merely expected to have used. It is now un-exported.
 *
 * This file walks the real source tree and asserts that no file outside the
 * sanctioned pair assigns `pinOrder` at all. It is deliberately blunt: a
 * narrower check (only `$set`, only server actions) is exactly the kind that
 * misses the next variant.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

/**
 * The ONE file allowed to persist a pinOrder. The planners decide the value;
 * this is the only place that hands one to Mongo.
 */
const WRITER_REL = 'src/lib/actions/articles.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Comments stripped: a doc block explaining the rule quotes what it forbids.
 *
 * Delegated to test/sourceScan.mjs. The hand-rolled version this replaces swept
 * only WHOLE-LINE `//` comments, deliberately, because a bare `//` sweep eats
 * the tail of any URL. The shared scanner is string-aware, so it also removes
 * TRAILING `//` comments — which the old one missed — without that risk.
 * Imports are kept: this guard is not about imports.
 */
const stripComments = (text) => scrubSource(text, { stripImports: false });

const FILES = walk(SRC).map((full) => ({
  rel: path.relative(ROOT, full).split(path.sep).join('/'),
  code: stripComments(readFileSync(full, 'utf8')),
}));

const actionsCode = (() => {
  const f = FILES.find((x) => x.rel === WRITER_REL);
  assert.ok(f, `${WRITER_REL} was not found — re-point WRITER_REL`);
  return f.code;
})();

/**
 * A MONGO WRITE naming pinOrder.
 *
 * ── WHY A UNION OF NARROW PATTERNS AND NOT ONE "IS THIS AN ASSIGNMENT" REGEX ──
 * The first version of this guard tried `/(?:^|[^.\w])pinOrder\s*[:=](?!=)/`,
 * i.e. "pinOrder followed by : or =". It was wrong in BOTH directions, and its
 * own controls caught it:
 *
 *   MISSED   `doc.pinOrder = 7`      — the leading `[^.]` excluded the exact
 *                                      `.pinOrder =` shape it claimed to catch
 *   OVERFIRED `.sort({ …, pinOrder: 1 })`   — the sort CASCADE, not a write
 *   OVERFIRED `<RankCell pinOrder={…} />`   — a JSX prop
 *
 * `pinOrder: 1` is a sort key in one file and a write in another; raw text does
 * not distinguish them. So the guard targets the thing that actually causes the
 * defect — PERSISTING a value — rather than trying to classify syntax. Reading,
 * sorting and rendering pinOrder stay unrestricted, which is what keeps the
 * exception list from growing until it is the thing being reviewed.
 */
const MONGO_WRITES = [
  /\$set\s*\.\s*pinOrder/,             // $set.pinOrder = …
  /\$set\s*:\s*\{[^{}]*\bpinOrder\b/,  // { $set: { pinOrder: … } }
  /\$set\s*=\s*\{[^{}]*\bpinOrder\b/,  // const $set = { pinOrder: … }
  /\$inc\s*:\s*\{[^{}]*\bpinOrder\b/,  // { $inc: { pinOrder: … } }
];

/**
 * Property assignment — `doc.pinOrder = 5`, the first half of the Mongoose
 * document-mutation shape:
 *
 *     const a = await Article.findById(id);
 *     a.pinOrder = 5;
 *     await a.save();
 *
 * An operator-shape guard alone sails straight past that. Banning the
 * ASSIGNMENT rather than the `.save()` is the sharper end: it catches the
 * mutation at the point where a value is decided, whether or not a save
 * follows, and it does not have to reason about which variable is a document.
 *
 * Verified not to over-fire: `.pinOrder =` occurs exactly ONCE in all of src/,
 * inside the sanctioned writer. Plans are built as object literals
 * (`{ _id, pinOrder: want }`), never by assignment, so the planner is unaffected.
 */
const PROPERTY_ASSIGN = /\.\s*pinOrder\s*=(?!=)/;

/**
 * A pinOrder riding inside the arguments of a Mongo write call — the
 * OPERATOR-LESS update shape, which carries no `$set` to match on:
 *
 *     await Article.updateOne({ _id }, { pinOrder: 5 });        // replacement
 *     await Article.findByIdAndUpdate(id, { pinOrder: 5 });     // implicit $set
 *
 * Checked by window rather than by parsing the argument list, because the
 * payload is frequently a variable, a spread, or several lines long. The window
 * is generous on purpose: a false positive here is a line of review, a false
 * negative is b-005 again.
 *
 * Verified not to over-fire: every one of these call names appears elsewhere in
 * src/ (2FA, registrations, masterclass, webhooks) and NONE of those windows
 * mentions pinOrder.
 */
const WRITE_CALLS = /\b(?:updateOne|updateMany|replaceOne|findByIdAndUpdate|findOneAndUpdate|findOneAndReplace|bulkWrite|insertOne|insertMany|create)\s*\(/g;
const CALL_WINDOW = 300;

function writeCallCarriesPinOrder(code) {
  for (const m of code.matchAll(WRITE_CALLS)) {
    if (/\bpinOrder\b/.test(code.slice(m.index, m.index + CALL_WINDOW))) return true;
  }
  return false;
}

const writesPinOrder = (code) =>
  MONGO_WRITES.some((re) => re.test(code)) ||
  PROPERTY_ASSIGN.test(code) ||
  writeCallCarriesPinOrder(code);

/**
 * ── WHAT THIS GUARD STILL CANNOT SEE ────────────────────────────────────────
 * Stated rather than left for someone to discover, because a guard that does
 * not declare its blind spots gets trusted further than it deserves.
 *
 *   · a computed key — `doc['pinOrder'] = n`, or `doc[field] = n` where
 *     `field` is a variable holding the string
 *   · a payload assembled far from the call — `const u = {}; u[k] = n;` more
 *     than CALL_WINDOW characters before the write
 *   · anything reaching the collection outside this repo: a script run by hand,
 *     mongosh, Compass, a restored backup
 *
 * The last one is not hypothetical and is not fixable by a text scan, which is
 * precisely why the `ลำดับซ้ำ` tripwire in ArticlesAdminClient was kept rather
 * than deleted once ties became unreachable through the UI: this guard covers
 * the code, and the tripwire covers everything that is not the code.
 */

test('no file outside the single writer persists a pinOrder', () => {
  const offenders = FILES
    .filter((f) => f.rel !== WRITER_REL)
    .filter((f) => writesPinOrder(f.code))
    .map((f) => f.rel);

  assert.deepEqual(
    offenders, [],
    `These files write a pinOrder to Mongo outside ${WRITER_REL}:\n\n` +
    offenders.map((f) => `  ${f}`).join('\n') +
    `\n\nA pinOrder written without a view of the WHOLE block is how b-005 ` +
    `(duplicates and gaps: production held 1,1,2,3,4,5,6,7,9,10) and b-006 (an ` +
    `unpinned row carrying a stale non-zero value, which sinks it below every ` +
    `pinOrder:0 row) were produced. Route the change through ` +
    `planMoveToPosition / planPromotion / planDemotion instead.`,
  );
});

test('the single writer takes its pinOrder from a PLAN, never from a literal or a parameter', () => {
  // The other half. "Only one file writes it" is satisfied by that one file
  // writing whatever it likes — which is exactly what updateArticlePinOrder did.
  const hits = [...actionsCode.matchAll(/\$set\s*\.\s*pinOrder\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.equal(
    hits.length, 1,
    `expected exactly ONE place that sets pinOrder, found ${hits.length}: ${hits.join(' | ')}`,
  );
  assert.equal(
    hits[0], 'Number(w.pinOrder)',
    'the value must come from a plan write `w`, so the planner decided it. A literal, ' +
    'a function parameter, or anything arithmetic here is a second numbering rule.',
  );
});

test('CONTROL: the walker is live and the write-matcher fires on every shape it claims', () => {
  // Zero offenders out of zero files, or out of files nothing can match, is a
  // pass for the wrong reason.
  assert.ok(FILES.length > 100, `only walked ${FILES.length} files`);
  assert.ok(FILES.some((f) => f.rel === WRITER_REL), `${WRITER_REL} was not walked`);
  assert.equal(writesPinOrder(actionsCode), true, 'the sanctioned writer does write pinOrder');

  for (const shape of [
    // operator shapes
    'if (ok) $set.pinOrder = Number(w.pinOrder);',
    'await Article.findByIdAndUpdate(id, { $set: { pinOrder: 3 } });',
    'const $set = { pinOrder: n };',
    'await col.updateOne({ _id }, { $inc: { pinOrder: 1 } });',
    // document mutation + save — invisible to an operator-only guard
    'const a = await Article.findById(id);\na.pinOrder = 5;\nawait a.save();',
    'doc.pinOrder = 7;',
    'article . pinOrder = n;',
    // operator-less updates — no $set to match on
    'await Article.updateOne({ _id }, { pinOrder: 5 });',
    'await Article.findByIdAndUpdate(id, { pinOrder: 5 });',
    'await Article.replaceOne({ _id }, { slug, title, pinOrder: 2 });',
    'await Article.bulkWrite(ops.map((o) => ({ updateOne: { update: { pinOrder: o.n } } })));',
  ]) {
    assert.equal(writesPinOrder(shape), true, `matcher missed a real write: ${shape}`);
  }
});

test('CONTROL: each matcher FAMILY is independently load-bearing', () => {
  // Three families guard three different shapes. If one were dead, the sweep
  // above would still pass on the strength of the others, so each is exercised
  // against a shape ONLY it can catch.
  const operatorOnly = 'await col.updateMany({}, { $set: { pinOrder: 0 } });';
  const assignOnly = 'a.pinOrder = 5;';
  const callOnly = 'await Article.updateOne({ _id }, { pinOrder: 5 });';

  assert.equal(MONGO_WRITES.some((re) => re.test(operatorOnly)), true, 'operator family');
  assert.equal(PROPERTY_ASSIGN.test(assignOnly), true, 'assignment family');
  assert.equal(PROPERTY_ASSIGN.test(operatorOnly), false, 'assignment family must not cover the operator shape');
  assert.equal(writeCallCarriesPinOrder(callOnly), true, 'write-call family');
  assert.equal(
    MONGO_WRITES.some((re) => re.test(callOnly)), false,
    'the operator family must NOT cover the operator-less update — if it did, the ' +
    'write-call family would be untested dead weight',
  );
});

test('CONTROL: the write-matcher does NOT fire on reading, sorting or rendering pinOrder', () => {
  // If it did, every consumer would need an exception and the exception list
  // would become the thing that has to be reviewed instead of the code. The
  // sort cascade in particular is NOT a write, and flagging it would put
  // articles.js on the list for entirely the wrong reason.
  for (const shape of [
    'const at = Number(article.pinOrder) || 0;',
    '.sort({ isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1 })',
    '<RankCell pinOrder={a.pinOrder} />',
    'if (orderOf(a) !== want) writes.push({ _id, pinOrder: want });',
    'const block = list.filter(isPositioned).sort(compareArticlesForPublicOrder);',
  ]) {
    assert.equal(writesPinOrder(shape), false, `matcher over-fired on: ${shape}`);
  }
  // The plan-write literal on the fourth line is the one worth naming: BUILDING
  // a plan is exactly what the planner does, and flagging it would put the
  // planner on the exception list for doing its job. What keeps it safe is not
  // this matcher but the two assertions either side of it — the only value that
  // reaches $set is `Number(w.pinOrder)`, and the client cannot send a plan at
  // all.
});

test('the admin client cannot build a positioning plan at all', () => {
  // The structural half of "the server decides". Even a correct client-side
  // plan is computed from a page-load snapshot, and a move renumbers the WHOLE
  // block — so a tab left open since this morning would write a block-wide
  // renumbering from stale data. The client imports the APPLY helper (to replay
  // the server's plan locally) but none of the plan BUILDERS.
  const client = FILES.find((f) => f.rel === 'src/app/admin/articles/_components/ArticlesAdminClient.jsx');
  assert.ok(client, 'the admin client was not walked');

  const imports = client.code.slice(0, client.code.indexOf('export function'));
  for (const builder of ['planMoveToPosition', 'planPromotion', 'planDemotion', 'planBadgeToggle']) {
    assert.equal(
      imports.includes(builder), false,
      `ArticlesAdminClient imports ${builder}. Positioning plans are computed on the ` +
      'server from a fresh read; the client only replays the plan it is handed.',
    );
  }
  assert.match(client.code, /applyPositionPlan/, 'it does still replay the returned plan');
});

// ── the retired actions ──────────────────────────────────────────────────────

const actions = FILES.find((f) => f.rel === WRITER_REL);

/** Exported server-action names — in a 'use server' module, the POST surface. */
function exportedActions() {
  const names = [...actions.code.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(names.length > 5, `only found ${names.length} exports — the scanner is broken`);
  return new Set(names);
}

test('the retired actions are GONE from the server-action surface', () => {
  const exported = exportedActions();
  for (const [name, why] of [
    ['updateArticlePinOrder', 'wrote a free integer to one row with no view of the block (b-005)'],
    ['toggleArticlePinnedOnArticlePage', 'wrote isPinnedOnArticlePage and left pinOrder stale (b-006)'],
    ['applyArticlePositionPlan', 'accepted a plan from the browser, i.e. a free pinOrder write with extra steps'],
    ['moveArticleToPosition', 'took a 1..M target bounded by the pinned block; the equivalent for the ' +
      'normal ordering would be a 486-entry dropdown, and fixed-slot targeting was rejected here before'],
    ['repositionArticle', 'bundled pinning and unpinning behind one `direction` argument under a name ' +
      'that said neither — pinning has its own verb now (setArticlePinned)'],
  ]) {
    assert.equal(exported.has(name), false, `${name} is exported again — ${why}`);
  }
});

test('the replacements ARE exported (the retirement did not just remove capability)', () => {
  const exported = exportedActions();
  for (const name of [
    'moveArticleOneStep',      // ↑ / ↓, one place, either tier
    'moveArticleToBlockTop',   // to the top of this row's own block
    'setArticlePinned',        // the pin toggle, its own verb
    'setArticlePinBadge',      // unchanged — the badge, nothing to do with ordering
  ]) {
    assert.ok(exported.has(name), `${name} must be an exported server action`);
  }
});

test('every ordering action computes its plan from a FRESH read, not from an argument', () => {
  // The whole point of the retirement: the block context comes from the
  // database at call time, never from the caller. If a planner is ever handed
  // something that arrived as a parameter, the stale-tab hazard is back — and
  // for a STEP it is worse than stale, because the admin list is paged and
  // filtered, so the row above another on screen is often not its neighbour.
  for (const fn of ['moveArticleOneStep', 'moveArticleToBlockTop', 'setArticlePinned']) {
    const start = actions.code.indexOf(`export async function ${fn}(`);
    assert.notEqual(start, -1, `could not find ${fn}`);
    const end = actions.code.indexOf('\nexport async function', start + 10);
    const body = actions.code.slice(start, end === -1 ? undefined : end);
    assert.match(
      body, /readBlockContext\(\)/,
      `${fn} must re-read the block before planning — a plan computed from a ` +
      'page-load snapshot renumbers the whole block from stale data',
    );
  }
});

test('T-b/c — the pin toggle APPENDS on pin and RENUMBERS on unpin', () => {
  // Two planners, and swapping them is silent in the worst way. planPromotion
  // appends at max+1 and touches one document; planDemotion writes pinOrder 0 on
  // the released row AND re-emits the survivors as contiguous 1..M.
  //
  // Getting the unpin half wrong recreates b-006 exactly — an unpinned row left
  // holding a non-zero pinOrder sinks below every pinOrder:0 row and lands dead
  // last regardless of its date or its sortKey. That was found in production and
  // repaired earlier today; this action is the only path that could put it back.
  // Leaving a HOLE in the survivors is b-005's other half: the next pin computes
  // max+1 from an inflated maximum and the numbers drift upward forever.
  const start = actions.code.indexOf('export async function setArticlePinned(');
  assert.notEqual(start, -1, 'setArticlePinned is gone — the pinned block would have no control at all');
  const end = actions.code.indexOf('\nexport async function', start + 10);
  const body = actions.code.slice(start, end === -1 ? undefined : end);

  assert.match(body, /planPromotion\(/, 'pinning must append via planPromotion');
  assert.match(body, /planDemotion\(/, 'unpinning must renumber via planDemotion');
  assert.match(
    body, /pinned\s*\?\s*planPromotion/,
    'and in that order — planPromotion on unpin would leave the released row IN the ' +
    'block, while planDemotion on pin would strip a row that was never in it',
  );
  assert.equal(
    /pinOrder\s*:\s*\d/.test(body), false,
    'no literal pinOrder here — the planners decide the numbers, from a fresh read',
  );
});

test('the render-tier stub offers no action the real module does not', () => {
  // A stub that keeps a retired export is a fixture that lies: the component
  // imports it happily and the render tier goes on proving a deleted path works.
  const stub = stripComments(readFileSync(path.join(ROOT, 'test/stub-article-actions.mjs'), 'utf8'));
  const stubbed = [...stub.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(stubbed.length > 5, `only found ${stubbed.length} stub exports`);

  const real = new Set([
    ...[...actions.code.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]),
  ]);
  const ghosts = stubbed.filter((n) => !real.has(n));
  assert.deepEqual(
    ghosts, [],
    `the stub exports actions that no longer exist: ${ghosts.join(', ')}`,
  );
});
