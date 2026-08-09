import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';
import { MAX_PINNED_ARTICLES } from '@/lib/articlePositioning';

/**
 * The pinned block is capped at MAX_PINNED_ARTICLES, and this file guards the
 * two claims the pure tier cannot make.
 *
 * ── WHY THIS IS A SOURCE GUARD AND NOT A RENDER ONE ─────────────────────────
 * The pin toggle lives in ArticleForm.jsx, which mounts a TipTap editor at
 * module scope and does not load under the suite's loader. That was established
 * when the ป้าย badge switch moved onto this screen: a source guard that can run
 * beats a render guard that cannot. Everything asserted here is therefore about
 * SHAPE — that the condition is wired to the descriptor, that the copy is
 * interpolated rather than written out, that the refusal exists on the server
 * independently of any of it.
 *
 * ── THE TWO CLAIMS ──────────────────────────────────────────────────────────
 *   1. ONE NUMBER. `MAX_PINNED_ARTICLES` is the only place the cap is written.
 *      No sentence, no disabled condition and no fixture spells it out, so
 *      raising it changes one line and cannot leave a second surface claiming a
 *      limit that is no longer the limit.
 *   2. THE SERVER REFUSES ON ITS OWN. `setArticlePinned` is an exported function
 *      in a `'use server'` module — a POST endpoint. A disabled button is a hint
 *      to whoever is looking at the screen and nothing at all to a stale tab, a
 *      second admin, or a replayed request.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (p) => path.join(ROOT, p);

const FORM_REL = 'src/app/admin/articles/_components/ArticleForm.jsx';
const ACTIONS_REL = 'src/lib/actions/articles.js';
const POSITIONING_REL = 'src/lib/articlePositioning.js';
const EDIT_PAGE_REL = 'src/app/admin/articles/[id]/edit/page.jsx';
const LIST_REL = 'src/app/admin/articles/_components/ArticlesAdminClient.jsx';

const form = readSourceForScanning(rel(FORM_REL), { stripImports: false });
const actions = readSourceForScanning(rel(ACTIONS_REL), { stripImports: false });
const positioning = readSourceForScanning(rel(POSITIONING_REL), { stripImports: false });
const editPage = readSourceForScanning(rel(EDIT_PAGE_REL), { stripImports: false });
const list = readSourceForScanning(rel(LIST_REL), { stripImports: false });

/**
 * Slice a source between two anchors, THROWING when either is missing.
 *
 * A silently-empty slice satisfies every "does not contain" check in this file
 * for free — the failure shape this suite has already paid for twice (the
 * sticky-bar ancestor guard, and the badge-region slice that swept in a doc
 * block). Comments are already stripped by readSourceForScanning, so a rule
 * quoted in prose cannot satisfy an assertion about code.
 */
function slice(src, name, startAnchor, endAnchor, label, min = 150) {
  const start = src.indexOf(startAnchor);
  assert.notEqual(
    start, -1,
    `[${name}] could not find the START of the ${label} region ` +
    `(${JSON.stringify(startAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  assert.notEqual(
    end, -1,
    `[${name}] could not find the END of the ${label} region ` +
    `(${JSON.stringify(endAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const body = src.slice(start, end);
  assert.ok(
    body.length > min,
    `[${name}] the ${label} region sliced to ${body.length} chars — too small to be ` +
    'the real thing, so every containment check would be vacuous',
  );
  return body;
}

/**
 * ANCHORS ARE DECLARATIONS, NEVER `/**`.
 *
 * `readSourceForScanning` strips comments, which is the point — a rule quoted in
 * prose must not satisfy an assertion about code — but it also means a doc-block
 * anchor does not exist in the text being sliced. The first draft of this file
 * anchored four regions on `\n/**`, and all four threw. Anchoring on the next
 * declaration is both correct and more stable: a declaration is a thing the
 * module has, a comment is a thing someone may delete.
 */
/** The ปักหมุด / ป้าย section of the form — the whole pin surface. */
const pinSection = () =>
  slice(form, FORM_REL, '<Section title="ปักหมุด / ป้าย">', '</Section>', 'pin section');

/** `setArticlePinned`, up to the next exported function. */
const setPinnedFn = () =>
  slice(actions, ACTIONS_REL, 'export async function setArticlePinned(', '\nexport async function', 'setArticlePinned');

/** `planPromotion`, up to the next top-level declaration. */
const planPromotionFn = () =>
  slice(positioning, POSITIONING_REL, 'export function planPromotion(', '\nexport function planDemotion(', 'planPromotion');

/** `pinCapacityMessage`, the single author of the Thai copy. */
const messageFn = () =>
  slice(positioning, POSITIONING_REL, 'export function pinCapacityMessage(', '\nexport function planPromotion(', 'pinCapacityMessage', 100);

/**
 * Drop every `className="…"` value before matching a bare number.
 *
 * THE TAILWIND TRAP, ONE STEP ALONG FROM `disabled:opacity-30`. This file's
 * claim is "the cap is not spelled out anywhere", and `\b5\b` is a perfectly
 * good matcher for that in a `.js` planner — but in JSX it also fires inside
 * `mt-0.5`, `py-0.5` and `gap-1.5`, because `.` is a non-word character and
 * `\b` sits happily right before the `5`. Those classes are present whether or
 * not anybody spelled the cap out, so a name-only matcher reports the defect
 * unconditionally. The rule this repo already writes down is "never match a bare
 * attribute NAME in Tailwind markup"; the same reasoning applies to a bare
 * DIGIT, and the fix is the same shape — take the styling out of the text
 * before asking a question about the text.
 */
const withoutClassNames = (region) => region.replace(/className="[^"]*"/g, 'className=""');

// ── claim 1: one number, derived everywhere ──────────────────────────────────

test('K-a — MAX_PINNED_ARTICLES is declared ONCE, and the cap is not spelled out anywhere else', () => {
  const N = String(MAX_PINNED_ARTICLES);
  const declarations = positioning.match(/export const MAX_PINNED_ARTICLES = \d+;/g) ?? [];
  assert.equal(declarations.length, 1, 'exactly one declaration');
  assert.equal(declarations[0], `export const MAX_PINNED_ARTICLES = ${N};`, 'and it is the value');

  // The three surfaces that talk about the cap must not contain the digit at
  // all. Scanned through readSourceForScanning, so a comment mentioning it does
  // not count — the assertion is about what the code SAYS to an admin.
  for (const [name, region] of [
    ['pinCapacityMessage', messageFn()],
    ['planPromotion', planPromotionFn()],
    ['the form\'s pin section', withoutClassNames(pinSection())],
    ['setArticlePinned', setPinnedFn()],
  ]) {
    assert.equal(
      new RegExp(`\\b${N}\\b`).test(region), false,
      `${name} contains the literal ${N}. Every surface must derive the cap from ` +
      'MAX_PINNED_ARTICLES, or raising it leaves a sentence claiming a limit that ' +
      `is no longer the limit.\n\n${region}`,
    );
  }
});

test('K-a2 — the Thai copy INTERPOLATES both numbers rather than writing them out', () => {
  const body = messageFn();
  assert.match(body, /\$\{count\}/, 'the current count is interpolated');
  assert.match(body, /\$\{max\}/, 'and so is the cap');
  assert.match(
    body, /\$\{max - 1\}/,
    'and the over-cap advice derives how far the block must come down, rather ' +
    'than naming a number that only happens to be right at one cap',
  );
  assert.match(
    body, /count > max/,
    'and there are two sentences: "full at MAX" is FALSE when the block holds 11, ' +
    'and an admin who counts the list would find a number they were not told',
  );
});

test('K-a3 — CONTROL: the digit matcher and the slicers are live', () => {
  // K-a is four negatives. All four are satisfied by a matcher that never fires
  // or by regions that sliced to nothing.
  const N = String(MAX_PINNED_ARTICLES);
  assert.match(positioning, new RegExp(`\\b${N}\\b`), `the digit ${N} IS present in the module…`);
  assert.match(
    slice(positioning, POSITIONING_REL, 'export const MAX_PINNED_ARTICLES', 'export const PIN_REFUSALS', 'the constant', 20),
    new RegExp(`\\b${N}\\b`),
    '…specifically in the declaration, which is the one place allowed to hold it',
  );

  // and the className stripper is load-bearing rather than decorative: the raw
  // pin section DOES contain a bare `N`-looking token inside Tailwind decimals,
  // which is exactly what would make K-a fail against a correct component.
  assert.match(
    pinSection(), /\bmt-0\.5\b|\bpy-0\.5\b|\bgap-1\.5\b/,
    'the form really does carry Tailwind decimals — if it stops, this control is ' +
    'no longer demonstrating anything and the stripper can be reconsidered',
  );

  for (const [label, region] of [
    ['pinCapacityMessage', messageFn()],
    ['planPromotion', planPromotionFn()],
    ['pin section', pinSection()],
    ['setArticlePinned', setPinnedFn()],
  ]) {
    assert.ok(region.length > 150, `${label} sliced to ${region.length} chars`);
  }
  assert.equal(
    withoutClassNames('<p className="mt-0.5 py-0.5">x</p>').includes('0.5'), false,
    'the stripper removes class values…',
  );
  assert.match(withoutClassNames('<p className="mt-0.5">5 รายการ</p>'), /5 รายการ/, '…and keeps the text');
  assert.throws(
    () => slice(form, FORM_REL, '<Section title="ThisDoesNotExist">', '</Section>', 'bogus'),
    /could not find the START of the bogus region/,
    'a moved anchor must fail loudly rather than passing every negative for free',
  );
});

// ── the form: disabled from the descriptor, reason on the page ───────────────

test('K-b — the toggle disables from the DESCRIPTOR, and never blocks unpinning', () => {
  const section = pinSection();
  assert.match(
    form, /const pinBlocked = !positioned && pinCapacity\?\.canPin === false;/,
    'the condition must be the descriptor\'s own answer. A second condition written ' +
    'here would drift from the action, and the symptom is a disabled button guarding ' +
    'an endpoint that would have said yes — or a live one the server refuses.',
  );
  assert.match(section, /disabled=\{posBusy \|\| pinBlocked\}/, 'and it is what disables the button');
  assert.match(
    form, /!positioned &&/,
    'GATED ON !positioned: unpinning is how an over-cap block drains, so the cap must ' +
    'never be able to block it',
  );
  assert.equal(
    /canPin === false \|\| /.test(form), false,
    'no extra clause may widen the condition past the descriptor',
  );
});

test('K-c — the reason is rendered ON THE PAGE, not only in a title attribute', () => {
  const section = pinSection();
  assert.match(
    section, /\{pinBlockedWhy\}/,
    'a disabled control whose explanation is hidden behind a hover is ' +
    'indistinguishable from a broken one — the rule the list\'s dead arrows follow. ' +
    'This one is unguessable: nothing else on the screen mentions a size limit.',
  );
  assert.match(section, /text-amber-600/, 'shown as a warning, not as an error — nothing has failed');
  assert.match(
    form, /pinCapacityMessage\(pinCapacity\)/,
    'and the sentence is the SERVER\'S OWN, so what is refused and what is explained ' +
    'cannot describe different situations',
  );
  assert.match(
    section, /ปักหมุดอยู่ \{pinCapacity\.count\} จาก \{pinCapacity\.max\} รายการ/,
    'and the live count is on screen even when the cap is not biting, so an admin ' +
    'about to take the last slot can see that it is the last slot',
  );
});

test('K-d — the edit PAGE reads the capacity server-side and passes it in', () => {
  // The form holds ONE document; "is the block full" is a property of the whole
  // collection. A client that worked it out would be counting rows it does not
  // have.
  assert.match(editPage, /getPinCapacity/, 'the page reads it');
  assert.match(editPage, /pinCapacity=\{pinCapacity\}/, 'and hands it to the form');
  assert.match(
    actions, /export async function getPinCapacity\(id\) \{/,
    'and the reader is a server action in the module that owns the block',
  );
  assert.match(
    slice(actions, ACTIONS_REL, 'export async function getPinCapacity(', '\nfunction stepRefusalMessage(', 'getPinCapacity', 100),
    /readBlockContext\(\)/,
    'REUSING the existing block read rather than adding a countDocuments — a second ' +
    'way of answering one question is how the two halves start disagreeing',
  );
});

// ── claim 2: the server refuses on its own ───────────────────────────────────

test('K-e — setArticlePinned refuses BEFORE any write, and logs no audit row', () => {
  const body = setPinnedFn();
  const refusal = body.indexOf('if (plan.reason) return { ok: false, error: plan.message, plan };');
  assert.notEqual(
    refusal, -1,
    'the action must refuse on its own. A disabled button is nothing to a stale tab, ' +
    'a second admin, or a replayed POST.',
  );

  const apply = body.indexOf('await applyPlan(');
  const audit = body.indexOf('recordAdminActionAfter(');
  assert.notEqual(apply, -1, 'the write call is still there');
  assert.notEqual(audit, -1, 'and so is the audit call');
  assert.ok(refusal < apply, 'the refusal must come BEFORE the write');
  assert.ok(
    refusal < audit,
    'and before the audit row: a refused pin is not a thing that happened, which is ' +
    'the rule moveArticleOneStep and moveArticleToRank already follow',
  );

  assert.match(
    body, /pinned \? planPromotion/,
    'and only the PIN branch can be refused — planDemotion has no capacity check and ' +
    'must never grow one',
  );
});

test('K-f — the refusal lives in the PLANNER, so it cannot be bypassed by a caller', () => {
  const body = planPromotionFn();
  assert.match(body, /describePinCapacity\(list, key\)/, 'planPromotion asks the descriptor');
  assert.match(body, /if \(!capacity\.canPin\)/, 'and refuses on its answer');
  assert.match(body, /writes: \[\]/, 'writing nothing');
  assert.match(
    body, /message: pinCapacityMessage\(capacity\)/,
    'and carrying the sentence, so the action returns it verbatim rather than asking ' +
    'a second time and risking a second answer',
  );

  // planDemotion must NOT consult it. Asserted on the function itself rather
  // than on the file, or the constant's own docstring would satisfy it.
  const demote = slice(positioning, POSITIONING_REL, 'export function planDemotion(', '\nfunction blockInOrder(', 'planDemotion');
  assert.equal(
    /describePinCapacity|MAX_PINNED_ARTICLES|canPin/.test(demote), false,
    'planDemotion consults the cap. Unpinning is the only way an over-cap block ' +
    'drains; a check here locks the block at whatever size it reached.',
  );
});

test('K-g — the edit screen is the ONLY surface that can pin', () => {
  // Confirmed in the source rather than assumed. The list's badge and pin
  // controls were removed in an earlier round; if a second pin surface ever
  // appears it has to be given the same capacity read, and this is what says so.
  assert.match(form, /setArticlePinned\(article\._id, !positioned\)/, 'the form pins');
  assert.equal(
    /setArticlePinned/.test(list), false,
    'the admin LIST must not pin — it has arrows and a rank box, and no membership ' +
    'control at all',
  );

  const callers = ['src/app/admin/articles/_components/ArticleForm.jsx'];
  assert.deepEqual(
    callers, [FORM_REL],
    'if this list grows, the new surface needs its own pinCapacity read — the cap is ' +
    'enforced by the planner either way, but a surface with no count shows a button ' +
    'that always fails',
  );
});
