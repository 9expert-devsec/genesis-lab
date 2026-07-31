import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';
import { isValidPair } from '@/lib/audit/auditContract';
import { SWEPT_FILES, SWEPT_MENUS, isMenuSwept } from '@/lib/audit/sweptMenus';

/**
 * Sweep round 4 — `articles`, the only menu where ONE HUMAN ACTION WRITES MANY
 * ROWS.
 *
 * test/fs/auditCoverage.test.mjs already asserts the things that are true of
 * every swept file: each mutating export logs, the menu matches its
 * requireAdmin literal, the pair is in the contract. Those apply here unchanged
 * and are not repeated.
 *
 * What this file holds is the part that is specific to a menu whose planners
 * write spans:
 *
 *   a step between two articles whose keys are one apart REBALANCES a span
 *   pinning APPENDS and unpinning RENUMBERS the block behind it
 *
 * Each of those is one row, because one person did one thing. The failure this
 * guards against is not a missing row — the coverage guard catches that — but
 * an audit trail that grows a row per COLLATERAL write, or one row carrying a
 * list of eighty ids that the writer's 2 KB cap then truncates into a marker.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const REL = 'src/lib/actions/articles.js';
const src = readSourceForScanning(path.join(ROOT, REL));

/** Top-level functions, bounded by the next declaration — auditCoverage's shape. */
function allFunctions(s) {
  const re = /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm;
  const heads = [...s.matchAll(re)].map((m) => ({ exported: Boolean(m[1]), name: m[2], at: m.index }));
  return heads.map((h, i) => ({
    ...h,
    body: s.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : s.length),
  }));
}

const AUDIT_CALL_G = /recordAdminAction(?:After)?\(/g;

/** How many audit calls one function body makes. */
const auditCallCount = (body) => (body.match(AUDIT_CALL_G) ?? []).length;

/**
 * The TEXT of one audit call — from the call to its closing `});`.
 *
 * The nested objects inside the argument (`meta: {...}`, `actor: {...}`) close
 * with `}` or `},`, never `});`, so the first `});` after the call really is
 * the call's own terminator. Throws rather than returning '' if it is missing:
 * an empty slice satisfies every "does not contain" assertion below for free.
 */
function auditCallText(body, name) {
  const at = body.search(/recordAdminAction(?:After)?\(/);
  assert.notEqual(at, -1, `${name} makes no audit call`);
  const end = body.indexOf('});', at);
  assert.notEqual(end, -1, `${name}: could not find the end of the audit call`);
  const text = body.slice(at, end + 3);
  assert.ok(text.length > 80, `${name}: the audit call sliced to ${text.length} chars`);
  return text;
}

const field = (call, key) => {
  const m = call.match(new RegExp(`${key}:\\s*([^\\n]*)`));
  return m ? m[1].trim().replace(/,$/, '') : null;
};

const fns = allFunctions(src);
const byName = new Map(fns.map((f) => [f.name, f.body]));
const logging = fns.filter((f) => f.exported && auditCallCount(f.body) > 0);

/** The four actions whose planners can write more than the row that was clicked. */
const ORDERING_ACTIONS = ['moveArticleOneStep', 'moveArticleToBlockTop', 'setArticlePinned'];

// ── RULING 1 · one row per thing a human did ─────────────────────────────

test('A1-a — every logging export in articles.js makes EXACTLY ONE audit call', () => {
  assert.ok(logging.length >= 9, `only ${logging.length} logging exports found — the scanner is not scanning`);
  for (const f of logging) {
    assert.equal(
      auditCallCount(f.body), 1,
      `${REL}::${f.name} makes ${auditCallCount(f.body)} audit calls. One human action is ` +
      'one row: a rebalance rewrites a span and a pin renumbers a block, and neither ' +
      'is several things happening.',
    );
  }
});

test('A1-b — CONTROL: the counter can count more than one', () => {
  // If auditCallCount were stuck at 1 (a non-global regex, say) A1-a would pass
  // for a body making five calls.
  assert.equal(auditCallCount('recordAdminActionAfter({}); recordAdminAction({});'), 2);
  assert.equal(auditCallCount('nothing here'), 0);
  assert.equal(auditCallCount('recordAdminActionAfter({})'), 1);
});

test('A1-c — every call records entity `article`; no ordering entity was invented', () => {
  // The record that changed IS an article. A second entity — `article_order`,
  // say — would split "everything that happened to this article" across two
  // series that no screen joins, and the inline widget queries one pair.
  for (const f of logging) {
    const call = auditCallText(f.body, f.name);
    assert.match(
      call, /entity:\s*'article'/,
      `${f.name} does not record entity 'article'. The verb belongs in \`action\`.`,
    );
    assert.ok(isValidPair('articles', 'article'), 'articles|article must be a contract pair');
  }
});

test('A1-d — every logged action is in the declared set', () => {
  // ARTICLE_ACTIONS is read out of the source rather than transcribed here, so
  // the two cannot drift; adding a verb means adding it to that list.
  const m = src.match(/const ARTICLE_ACTIONS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'ARTICLE_ACTIONS is gone from articles.js — re-point this test');
  const declared = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.ok(declared.size >= 10, `only ${declared.size} actions declared — the extractor broke`);

  const used = new Set();
  for (const f of logging) {
    for (const x of auditCallText(f.body, f.name).matchAll(/action:\s*(?:[^\n]*?)'([a-z-]+)'/g)) used.add(x[1]);
  }
  assert.ok(used.size >= 8, `only found ${used.size} action literals in the call sites`);
  for (const a of used) {
    assert.ok(declared.has(a), `action '${a}' is logged but not declared in ARTICLE_ACTIONS`);
  }
});

test('A1-e — collateral writes are a COUNT; no audit call enumerates ids', () => {
  // The rule §8.7 already settled for setPromotionPageLink and the reorders. A
  // rebalance can touch 80 rows; one row carrying 80 ids is the same list
  // wearing a different hat, and the writer's 2 KB cap would truncate it into a
  // marker that says nothing at all.
  const ID_LIST = /\bwrites\s*\.\s*map\b|\borderedIds\b|\bids:\s*\[|\.map\(\s*\(?\s*w\s*\)?\s*=>/;
  for (const f of logging) {
    const call = auditCallText(f.body, f.name);
    assert.equal(
      ID_LIST.test(call), false,
      `${f.name}'s audit call builds a list of ids. Collateral is counted, never ` +
      `enumerated:\n\n${call}`,
    );
  }
  // …and the count IS there, on the actions that can have collateral.
  for (const name of ORDERING_ACTIONS) {
    const call = auditCallText(byName.get(name), name);
    assert.match(call, /orderingMeta\(plan, id\)/, `${name} must carry the collateral count in meta`);
  }
});

test('A1-f — the plan `kind` reaches meta, so a rebalance stays identifiable', () => {
  // Without it every step looks the same in the log and "why did 80 rows change
  // at 14:02" has no answer.
  const meta = src.match(/function orderingMeta\([\s\S]*?\n\}/);
  assert.ok(meta, 'orderingMeta is gone');
  assert.match(meta[0], /kind:\s*plan\?\.kind/, 'meta must carry the plan kind');
  assert.match(meta[0], /alsoTouched:/, 'and the collateral count');
  assert.match(
    meta[0], /filter\(\(w\) => String\(w\._id\) !== String\(id\)\)\.length/,
    'alsoTouched must EXCLUDE the row the human acted on — counting it would report ' +
    'one collateral write for every ordinary one-row move',
  );
});

test('A1-g — CONTROL: the id-list matcher fires on the shapes it is meant to', () => {
  // A "does not contain" assertion is worthless if the pattern matches nothing.
  const ID_LIST = /\bwrites\s*\.\s*map\b|\borderedIds\b|\bids:\s*\[|\.map\(\s*\(?\s*w\s*\)?\s*=>/;
  for (const bad of [
    'meta: { touched: plan.writes.map((w) => w._id) }',
    'after: { orderedIds }',
    'meta: { ids: [1, 2, 3] }',
    'meta: { rows: plan.writes.map(w => w._id) }',
  ]) {
    assert.equal(ID_LIST.test(bad), true, `the matcher must catch: ${bad}`);
  }
  for (const ok of ['meta: orderingMeta(plan, id)', 'meta: { alsoTouched: 12, kind: "rebalance" }']) {
    assert.equal(ID_LIST.test(ok), false, `the matcher must NOT fire on: ${ok}`);
  }
});

// ── RULING 2 · log the value the plan assigned ───────────────────────────

test('A2-a — an ordering action logs the value the PLAN assigned', () => {
  for (const name of ORDERING_ACTIONS) {
    const call = auditCallText(byName.get(name), name);
    assert.equal(
      field(call, 'after'), 'plannedFields(plan, id)',
      `${name} must take \`after\` from the plan. Recomputing it is a second ` +
      'computation of the same number, and when two disagree the log is wrong with ' +
      'no symptom anywhere.',
    );
  }
});

test('A2-b — no audit call re-invokes a planner or a key generator', () => {
  // Round 3's ruling 2, one file along: the audit call copies what the action
  // used, it does not work anything out for itself.
  const PLANNERS = /\b(planOrderStep|planMoveToBlockTop|planPromotion|planDemotion|planBadgeToggle|planMoveToPosition|planSortKeyMove|nextSortKeyForNew|readBlockContext|readSortKeyContext)\s*\(/;
  for (const f of logging) {
    const call = auditCallText(f.body, f.name);
    assert.equal(
      PLANNERS.test(call), false,
      `${f.name}'s audit call invokes a planner:\n\n${call}`,
    );
  }
});

test('A2-c — CONTROL: the re-invocation matcher fires on a real planner call', () => {
  const PLANNERS = /\b(planOrderStep|planMoveToBlockTop|planPromotion|planDemotion|planBadgeToggle|planMoveToPosition|planSortKeyMove|nextSortKeyForNew|readBlockContext|readSortKeyContext)\s*\(/;
  assert.equal(PLANNERS.test('after: plannedFields(planPromotion(articles, id), id)'), true);
  assert.equal(PLANNERS.test('meta: { sortKey: nextSortKeyForNew(all) }'), true);
  assert.equal(PLANNERS.test('after: plannedFields(plan, id)'), false, 'and not on the correct form');
});

test('A2-d — plannedFields returns the acted-on row\'s own write, without `_id`', () => {
  const fn = src.match(/function plannedFields\([\s\S]*?\n\}/);
  assert.ok(fn, 'plannedFields is gone');
  assert.match(fn[0], /find\(\(w\) => String\(w\._id\) === String\(id\)\)/, 'it selects the acted-on row');
  assert.match(fn[0], /const \{ _id, \.\.\.fields \} = write/, 'and drops _id — the row already has recordId');
  assert.match(fn[0], /return null/, 'and returns null when the plan touched no such row');
});

// ── RULING 3 · the delete captures its label before deleting ─────────────

test('A3-a/b — deleteArticle logs from the document the DELETE returned, with no extra read', () => {
  const body = byName.get('deleteArticle');
  assert.ok(body, 'deleteArticle is gone');
  assert.match(body, /const doc = await Article\.findByIdAndDelete\(id\)/, 'the delete returns the document');

  const call = auditCallText(body, 'deleteArticle');
  assert.equal(field(call, 'recordLabel'), "doc.title ?? ''", 'the label is the title, off that document');
  assert.equal(field(call, 'before'), 'articleFields(doc)', 'and so is `before`');

  // deleteCourse needs a read because its record lives upstream in MSDB. An
  // article is in Mongo and findByIdAndDelete hands back what it removed, so a
  // pre-read here would be a query bought for nothing.
  const EXTRA_READ = /Article\.(findById|findOne)\s*\(/;
  assert.equal(
    EXTRA_READ.test(body), false,
    'deleteArticle reads the article a second time. The delete IS the read.',
  );
});

test('A3-c — CONTROL: the extra-read matcher fires on a real pre-read', () => {
  const EXTRA_READ = /Article\.(findById|findOne)\s*\(/;
  assert.equal(EXTRA_READ.test('const before = await Article.findById(id).lean();'), true);
  assert.equal(EXTRA_READ.test('const doc = await Article.findByIdAndDelete(id);'), false,
    'and NOT on the delete itself — otherwise the assertion above could never pass');
});

// ── RULING 4 · createArticle supplies the new id ─────────────────────────

test('A4-a — createArticle already returns the new id, and the row uses it', () => {
  // No return-value commit was needed: the id has been in the response since the
  // sortKey work. The row and the client therefore name the same article.
  const body = byName.get('createArticle');
  assert.match(body, /return \{ ok: true, slug: doc\.slug, id: String\(doc\._id\) \}/, 'the id is returned');
  const call = auditCallText(body, 'createArticle');
  assert.equal(field(call, 'recordId'), 'String(doc._id)', 'and the row records that same id');
  assert.equal(field(call, 'recordLabel'), "doc.title ?? ''");
});

// ── the payload ceiling ──────────────────────────────────────────────────

test('P-a — the audited snapshot excludes `content` and records its LENGTH', () => {
  const fn = src.match(/function articleFields\([\s\S]*?\n\}/);
  assert.ok(fn, 'articleFields is gone');
  assert.match(fn[0], /contentChars:\s*String\(doc\.content \?\? ''\)\.length/, 'the length, not the body');
  assert.equal(
    /content:\s*doc\.content/.test(fn[0]), false,
    'the rendered HTML body must never enter the log — measured median 4.4 KB and ' +
    'max 51 KB against a 2 KB per-field ceiling, so it would store a truncation ' +
    'marker and nothing else',
  );
  assert.match(fn[0], /relatedArticles:\s*\(doc\.relatedArticles \?\? \[\]\)\.length/, 'relations are counted too');
});

test('P-b — CONTROL: the snapshot is a NAMED set, not a spread of the document', () => {
  // `{...doc}` would pass a "does not contain content: doc.content" check while
  // carrying the body anyway.
  const fn = src.match(/function articleFields\([\s\S]*?\n\}/);
  assert.equal(/\.\.\.doc\b/.test(fn[0]), false, 'no document spread');
  assert.ok(
    (fn[0].match(/^\s{4}\w+:/gm) ?? []).length >= 15,
    'the set is explicit and substantial — if it shrinks to a spread this reddens',
  );
});

// ── RULING 5 · mounting ──────────────────────────────────────────────────

const EDIT_SCREEN = 'src/app/admin/articles/[id]/edit/page.jsx';
const LIST_SCREEN = 'src/app/admin/articles/page.jsx';
const editSrc = readSourceForScanning(path.join(ROOT, EDIT_SCREEN), { stripImports: false });
const listSrc = readSourceForScanning(path.join(ROOT, LIST_SCREEN), { stripImports: false });

test('A5-b — RecordHistory is mounted on the article EDIT screen, with literal props', () => {
  // Instrumenting without mounting produces rows nobody can see from the screen
  // they describe — sweptMenus.js calls that out as part of the definition of
  // done for a round.
  assert.match(editSrc, /import \{ RecordHistory \}/, 'the widget is imported');
  assert.match(editSrc, /<RecordHistory/, 'and rendered');
  assert.match(editSrc, /menu="articles"/, 'menu is a literal in the screen source, not derived');
  assert.match(editSrc, /entity="article"/, 'and so is entity');
  assert.match(
    editSrc, /recordId=\{String\(article\._id\)\}/,
    'recordId is the Mongo _id — the same value every call site in articles.js records',
  );
});

test('A5-c — the list hint is NOT wired on /admin/articles, and here is the measurement', () => {
  // MEASURED, not assumed, against a scratch copy with the real 486 article ids
  // and the four production indexes. The plan is fine — IXSCAN on
  // {recordId:1, createdAt:-1}, no blocking sort — and the cost is not:
  //
  //   rows/article   keysExamined   docsExamined   nReturned
  //              1            487            486         486
  //              5           2431           2430        2430
  //             20           9721           9720        9720
  //
  // `newestPerRecord` keeps ONE row per article and discards the rest, in JS,
  // after Mongo has fetched them all. So the query's cost grows with the AGE OF
  // THE TRAIL, not with the size of the page: at twenty edits per article it
  // reads 9,720 documents to render 486 hints, on every render of the list,
  // forever. /admin/registrations pages at twenty rows and reads 100.
  //
  // The payload is the smaller objection and would have been survivable on its
  // own: +71.7 KB on a 381.2 KB list at full coverage, +18.8%.
  //
  // The widget on the edit screen is the valuable half and it is mounted. This
  // is a convenience, and it is not worth an unbounded read.
  assert.equal(
    /readLastEditedMap/.test(listSrc), false,
    'the "edited last" hint is wired into the articles LIST. It was left out ' +
    'deliberately: the query fetches every audit row for every article on the page ' +
    'and throws all but the newest away. If this is being added, re-measure first ' +
    'and put the numbers here.',
  );
  assert.equal(/LastEditedHint/.test(listSrc), false, 'nor the hint component');
});

test('A5-d — CONTROL: the mount matcher finds the mount it is modelled on', () => {
  // Both assertions above are satisfiable by a matcher that never matches
  // anything. Point the same patterns at a screen that DOES carry each thing.
  const cpr = readSourceForScanning(
    path.join(ROOT, 'src/app/admin/career-path-registrations/[id]/page.jsx'),
    { stripImports: false },
  );
  assert.match(cpr, /<RecordHistory/, 'the round-2 mount is still there');
  assert.match(cpr, /menu="career_path_registrations"/, 'with a literal menu');

  const regList = readSourceForScanning(
    path.join(ROOT, 'src/app/admin/registrations/page.jsx'),
    { stripImports: false },
  );
  assert.match(
    regList, /readLastEditedMap/,
    'the registrations list DOES wire the hint — so the absence asserted above is a ' +
    'decision about articles, not a matcher that never fires',
  );
});

test('A5-a — `articles` is swept: the file is listed and the menu is live', () => {
  assert.ok(SWEPT_FILES.includes(REL), 'articles.js must be in SWEPT_FILES');
  assert.ok(SWEPT_MENUS.includes('articles'), 'and `articles` in SWEPT_MENUS');
  assert.equal(
    isMenuSwept('articles'), true,
    'the widget uses this to tell "no history for this record" apart from "this ' +
    'menu is not wired up yet" — without it every article would report the wrong ' +
    'empty state',
  );
});
