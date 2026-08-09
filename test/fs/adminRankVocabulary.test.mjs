import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrubSource } from '../sourceScan.mjs';

/**
 * b-004 — the rank column must not speak the badge's vocabulary.
 *
 * `isPinnedOnArticlePage` (this article has a manually chosen POSITION) and
 * `showPinBadge` (this article draws a pin BADGE on its public card) were split
 * into two independent fields. The data separated cleanly; the admin copy never
 * followed. `RankCell` keys entirely off `rankBasis`, i.e. POSITION, and drew a
 * `<Pin>` glyph plus the word `ปักหมุด` — while the ป้าย switch a few columns
 * over owned the actual badge. One icon and one noun, two meanings, same row.
 *
 * Reported symptom: an admin left an article positioned, switched ป้าย OFF, and
 * the ลำดับบน /articles column still showed a pin and the word ปักหมุด. It reads
 * as "I removed the pin and the pin is still there."
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * The pin glyph and the word หมุด belong to the badge concept and NOWHERE else.
 *
 * ── WHY THIS IS THE fs TIER AND WHY IT COMES IN A PAIR ──────────────────────
 * The render tier proves what one particular article renders. This proves the
 * rule holds for EVERY branch of the component, including the tie branch that
 * b-005 is about to make unreachable and that no fixture will exercise again.
 *
 * The two halves are inseparable. "RankCell contains no หมุด" alone is
 * satisfied by deleting the word from the whole file — including from the badge
 * switch, where it is CORRECT and load-bearing. So the second half asserts the
 * badge region still HAS both the glyph and the noun. Together they say the
 * rule is about PLACEMENT, not about banning a word.
 *
 * ── THE BADGE HALF MOVED FILES; THE RULE DID NOT ────────────────────────────
 * The ป้าย switch has been removed from the list. It was the second of two
 * controls for one per-document decoration — the other is on the article edit
 * screen, beside the pin toggle the badge depends on — and having it here as
 * well put it twelve to a page next to arrows built to be clicked repeatedly.
 *
 * So "the badge still owns its vocabulary" now has to be asked of the files
 * that still hold the badge, and it splits in two, because the noun and the
 * glyph live in different places and always did:
 *
 *   the WORD หมุด   → the CONTROL, in ArticleForm.jsx (a labelled checkbox)
 *   the PIN GLYPH   → the BADGE ITSELF, on the public card in
 *                     ArticlesPageClient.jsx — which is the thing the control
 *                     switches on, and the only place a pin is ever drawn
 *
 * Deleting either half is still the wrong fix for b-004 and still has to
 * redden, which is why this file reads three sources rather than one. The list
 * is now asserted to hold NO pin glyph at all, and that assertion is only
 * legitimate because the other two say where the glyph went.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_REL = 'src/app/admin/articles/_components/ArticlesAdminClient.jsx';
const FORM_REL = 'src/app/admin/articles/_components/ArticleForm.jsx';
const PUBLIC_CARD_REL = 'src/app/(public)/articles/_components/ArticlesPageClient.jsx';
const src = readFileSync(path.join(ROOT, CLIENT_REL), 'utf8');
const formSrc = readFileSync(path.join(ROOT, FORM_REL), 'utf8');
const publicSrc = readFileSync(path.join(ROOT, PUBLIC_CARD_REL), 'utf8');

/**
 * Slice the source between two anchors.
 *
 * THROWS a named error when either anchor is missing rather than returning an
 * empty string. A silently-empty slice passes every "does not contain" check in
 * this file for free — the same failure shape as the sticky-bar ancestor guard,
 * where a moved anchor turned a real structural check into a no-op that stayed
 * green for months.
 */
/**
 * Drop comments before matching.
 *
 * NOT cosmetic — it closes a hole this file's own control found. The badge
 * region runs up to `function RankCell(`, which means it sweeps in RankCell's
 * DOC BLOCK, and that doc block quotes both `<Pin` and `หมุด` while explaining
 * the rule. So the "the badge switch still has both" assertion was passing off
 * PROSE rather than off the control. An assertion about what a component
 * RENDERS must never be satisfiable by a comment about it.
 *
 * Delegated to test/sourceScan.mjs. This used to strip block comments plus
 * WHOLE-LINE `//` only, deliberately, because a bare `//` sweep eats the tail of
 * any URL in the source. The shared scanner is string-aware, so it also removes
 * TRAILING `//` comments — which the restriction here could not — without that
 * hazard. Imports are kept: the anchors this file slices on are functions.
 */
const stripComments = (text) => scrubSource(text, { stripImports: false });

function sliceIn(source, rel, startAnchor, endAnchor, label, min = 200) {
  const start = source.indexOf(startAnchor);
  assert.notEqual(
    start, -1,
    `[${rel}] could not find the START of the ${label} region ` +
    `(${JSON.stringify(startAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  assert.notEqual(
    end, -1,
    `[${rel}] could not find the END of the ${label} region ` +
    `(${JSON.stringify(endAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const body = stripComments(source.slice(start, end));
  assert.ok(
    body.length > min,
    `[${rel}] the ${label} region sliced to ${body.length} chars — too small ` +
    'to be the real component, so every containment check below would be vacuous',
  );
  return body;
}

const slice = (startAnchor, endAnchor, label) =>
  sliceIn(src, CLIENT_REL, startAnchor, endAnchor, label);

/** `function RankCell(` … up to the next top-level function declaration. */
const rankCell = () => slice('function RankCell(', '\nfunction ', 'RankCell');

/**
 * The BADGE CONTROL, which no longer lives in the list at all.
 *
 * `<Section title="ปักหมุด / ป้าย">` on the article edit screen, up to the
 * `</Section>` that closes it. This is the whole of what an admin can do to the
 * pin and the badge, in one place, which is the state this round establishes.
 */
const badgeControl = () =>
  sliceIn(formSrc, FORM_REL, '<Section title="ปักหมุด / ป้าย">', '</Section>', 'badge control');

/**
 * The pin BADGE itself — the glyph on the public card, gated on
 * `shouldShowPinBadge`. The only place in the app that draws a pin.
 */
const publicBadge = () =>
  sliceIn(publicSrc, PUBLIC_CARD_REL, 'shouldShowPinBadge(article) && (', ')}', 'public pin badge', 100);

/**
 * The ordering controls — the JSX of OrderCell's return. Holds the two status
 * pills and the buttons' placement, but NOT the `arrow()` helper that builds the
 * aria-labels, which is declared above the return.
 *
 * The end anchor used to be the `zone 2: badge` marker. There is no zone 2, so
 * it runs to the next component instead; it is still a strict subset of
 * `orderCellFn()`, which one assertion below pins so the two cannot silently
 * become the same slice.
 */
const orderZone = () => slice('/* ── the ordering controls ──', '\nfunction RankCell(', 'ordering controls');

/**
 * The whole OrderCell component, for claims about controls whose labels are
 * built in a helper rather than written inline. Caught by this file's own
 * failure: `orderZone()` does not contain `เลื่อนขึ้นหนึ่งลำดับ` at all, because
 * the two arrows are rendered by one parameterised helper defined above the JSX
 * — so an assertion scoped to the zone was looking for a string that could not
 * be there, and would have gone green again the day someone inlined it.
 */
const orderCellFn = () => slice('function OrderCell(', '\nfunction RankCell(', 'OrderCell');

// ── half 1: the rank column is clean ─────────────────────────────────────────

test('RankCell renders NO pin glyph — the pin belongs to the badge', () => {
  const body = rankCell();
  assert.equal(
    /<Pin\b/.test(body), false,
    'RankCell is keyed off `rankBasis` (POSITION) but is drawing the badge\'s icon. ' +
    'An admin who turns the ป้าย switch off still sees a pin in this column and ' +
    'reads it as "I removed the pin and it is still there". Use ArrowUpToLine — ' +
    'the glyph on the จัดตำแหน่ง button that creates this state.',
  );
});

test('RankCell says NOTHING about หมุด — position gets its own noun', () => {
  const body = rankCell();
  assert.equal(
    body.includes('หมุด'), false,
    'the word หมุด (pin) appears in RankCell. This column reports whether a ' +
    'position was CHOSEN or came from the date — กำหนดเอง / ตามวันที่ — and the ' +
    'badge owns หมุด. Check the labels AND both title= tooltips.',
  );
});

test('U4-d — RankCell is a PLAIN NUMBER; the กำหนดเอง / ตามวันที่ pair is gone', () => {
  // That pair answered a real question while it had two possible answers: did
  // someone CHOOSE this spot, or did the publish date decide it. Every article
  // now carries its own sortKey and every article can be moved, so the question
  // has one answer for all 486 rows — and the label would be actively wrong for
  // the common case, since a row nobody has touched still has a chosen position
  // in the sense the label meant: the backfill chose it.
  const body = rankCell();
  assert.equal(/กำหนดเอง/.test(body), false, 'the manual-position label must be gone');
  assert.equal(/ตามวันที่/.test(body), false, 'and so must its counterpart');
  assert.match(body, /info\.rank/, 'the cell renders the position number');
  assert.match(body, /ไม่เผยแพร่/, 'and still distinguishes an inactive article, which HAS no position');
});

test('U4-e — the tie tripwire SURVIVED, in the zone where it is actionable', () => {
  // Ruling: pinOrder stays the second cascade key, so the b-006 shape stays
  // reachable and pinTie stays a corruption tripwire. It moved out of the rank
  // column when that became a plain number — deleting it would have traded a
  // visible symptom for a silent one, and it now sits beside the arrows whose
  // behaviour it explains.
  const zone = orderZone();
  assert.match(zone, /ลำดับซ้ำ/, 'the tie label');
  assert.equal(/ลำดับ Pin ซ้ำ/.test(rankCell()), false, 'the pre-b-004 label stays gone');
  assert.match(
    zone, /ตำแหน่งจริงจึงตัดสินด้วยลำดับปกติแทน/,
    'and the sentence explaining that a duplicate number does not decide the position ' +
    'must travel with it — it is the only place a user can learn that',
  );
  assert.equal(
    /ลำดับซ้ำ/.test(rankCell()), false,
    'it moved rather than being duplicated; two copies would drift',
  );
});

// ── half 2: the badge still owns its own vocabulary, in the files that hold it ─

test('the badge CONTROL still names หมุด (the rule is placement, not a ban)', () => {
  // It moved out of the list; it did not stop existing. If this fails, the ป้าย
  // switch was removed from the list by deleting the CONCEPT rather than by
  // consolidating it onto the one screen that owns the pin — and the admin now
  // has no way to turn the badge off at all.
  const zone = badgeControl();
  assert.match(
    zone, /หมุด/,
    'the badge checkbox on the article edit screen must keep the pin vocabulary — ' +
    'this is where it belongs. Check the label AND the hint under it.',
  );
  assert.match(
    zone, /แสดงป้ายหมุดบนการ์ด/,
    'and the label must say WHAT it does: draw the ป้าย on the public card',
  );
  assert.match(
    zone, /showPinBadge/,
    'wired to the field, not decorative — otherwise the copy could be right while ' +
    'the control writes nothing',
  );
});

test('the badge CONTROL says it is the only place, now that the list has none', () => {
  // A control that used to exist in two places and now exists in one has to say
  // so, or "where did the ป้าย toggle go" is a question the UI cannot answer.
  const zone = badgeControl();
  assert.match(
    zone, /ที่นี่ที่เดียว/,
    'the section must state that pinning and the badge are set HERE and nowhere ' +
    'else. The switch was on the list until this round; an admin who used it there ' +
    'will look there first.',
  );
  assert.match(zone, /หน้ารายการบทความ/, 'and name the screen it was removed from');
});

test('the PIN GLYPH still exists — on the public card, which is the badge itself', () => {
  // The other half of the vocabulary, and it lives in a third file. The glyph is
  // not a control and never was: it is the mark on the reader-facing card that
  // the checkbox above switches on. `assert(!/<Pin/)` against the admin list is
  // only a legitimate assertion because this one says where the glyph went.
  const badge = publicBadge();
  assert.match(badge, /<Pin\b/, 'the public card draws the pin');
  assert.match(
    publicSrc, /shouldShowPinBadge\(article\)/,
    'and it is gated on the helper, not on a raw field read — the helper treats an ' +
    'ABSENT showPinBadge as ON, which is what keeps every legacy article badged',
  );
});

test('the admin list draws NO pin glyph anywhere, in any cell', () => {
  // Stronger than the RankCell-only rule that came before it, and safe to state
  // only because the two assertions above say where the glyph does live. The
  // list orders articles; it does not preview their cards.
  const code = stripComments(src);
  assert.equal(
    /<Pin\b/.test(code), false,
    'a pin glyph is back in the admin list. b-004 was a pin drawn in a column that ' +
    'reports POSITION while the badge lived elsewhere; the surest form of that ' +
    'defect not recurring is the list not drawing pins at all.',
  );
  assert.equal(
    /\bPin\b/.test(code.slice(0, code.indexOf('export function'))), false,
    'and the lucide import went with it — an unused import is how the glyph comes ' +
    'back without anyone deciding to bring it back',
  );
});

test('CONTROL: the slicers are live — they find different, non-empty regions', () => {
  // Without this, the anchors could resolve to something tiny and half 1 would
  // pass by measuring nothing. `sliceIn` already throws on a missing anchor;
  // this pins that the regions are genuinely DISTINCT and non-overlapping,
  // which is the property the pairing above depends on.
  const rank = rankCell();
  const badge = badgeControl();
  const glyph = publicBadge();
  assert.ok(rank.length > 400, `RankCell region is only ${rank.length} chars`);
  assert.ok(badge.length > 400, `badge control region is only ${badge.length} chars`);
  assert.equal(rank.includes(badge), false, 'the badge control must not be inside RankCell');
  assert.equal(badge.includes(rank), false, 'RankCell must not be inside the badge control');

  // and the containment matchers themselves work: each region holds something
  // the others do not
  assert.match(rank, /info\.rank/, 'the rank region should render the rank');
  assert.equal(/info\.rank/.test(badge), false, 'the badge control should not');
  assert.equal(/หมุด/.test(rank), false, 'the rank region holds no หมุด…');
  assert.equal(/หมุด/.test(badge), true, '…and the badge control does — the pair is real');
  assert.equal(/<Pin\b/.test(badge), false, 'the CONTROL is a checkbox, not a glyph…');
  assert.equal(/<Pin\b/.test(glyph), true, '…and the GLYPH is the card, not a control');
});

test('CONTROL: the ป้าย switch is genuinely GONE from the list, not merely renamed', () => {
  // "The list has no หมุด" is satisfiable by a switch that kept its behaviour and
  // lost its label — which would be worse than leaving it, since it would be an
  // unnamed control writing a field. Assert the wiring is gone too.
  const code = stripComments(src);
  assert.equal(/role="switch"/.test(code), false, 'no switch role left in the list');
  assert.equal(/setArticlePinBadge/.test(code), false, 'and no import or call of the badge action');
  assert.equal(/showPinBadge/.test(code), false, 'and the list reads the field nowhere');
  assert.equal(
    /shouldShowPinBadge/.test(code), false,
    'nor the helper — the list has no opinion about the badge at all any more',
  );
});

test('CONTROL: a missing anchor THROWS a named error rather than passing vacuously', () => {
  assert.throws(
    () => slice('function ThisDoesNotExist(', '\nfunction ', 'bogus'),
    /could not find the START of the bogus region/,
    'a moved anchor must fail loudly — a silently-empty slice satisfies every ' +
    '"does not contain" assertion in this file',
  );
});

// ── the two-tier vocabulary is gone from the list ────────────────────────────

test('U4-c — จัดตำแหน่ง / ปลดตำแหน่ง are GONE from the admin list', () => {
  // They named the act of moving an article INTO or OUT OF the pinned block,
  // which is the "switch something on before you can order it" step this round
  // removes. The act itself survives — pinning is real, ruling 2 keeps
  // pinOrder as the second cascade key — but it is one thing now, it has its own
  // verb (ปักหมุด), and it lives on the edit screen rather than beside arrows
  // that get clicked twelve to a page.
  //
  // Comments stripped first, or this is vacuous in both directions: the note in
  // OrderCell explains what จัดตำแหน่ง used to be.
  const code = stripComments(src);
  assert.equal(/จัดตำแหน่ง/.test(code), false, 'the promote button must be gone from the list');
  assert.equal(/ปลดตำแหน่ง/.test(code), false, 'and so must the demote button');
  assert.equal(
    /ปลด(?!ปักหมุด)/.test(code), false,
    'a bare ปลด remains — ปลดอะไร? Thai gives a regex no word boundary to lean on, ' +
    'so this matches any ปลด that is not part of the one compound the UI still uses.',
  );
});

test('U4-c2 — the ordering cell offers one step, a group top, AND a typed rank', () => {
  // This assertion USED TO READ `no free number field` and `no position
  // dropdown`. The dropdown is still gone and is not coming back — a 1..M select
  // was coherent while M was the pinned block of five and is not a control at
  // 486 options. The number field is back, and REPLACING the assertion rather
  // than deleting it is the point: the invariant it was really protecting is
  // "no free integer reaches pinOrder or sortKey", which
  // test/fs/articlePinOrderWrites enforces STRUCTURALLY — the only value that
  // reaches $set is `Number(w.pinOrder)` off a plan, and the client cannot send
  // a plan at all. A ban on the widget was a proxy for that, and a proxy that
  // outlives what it proxies for is how a guard starts blocking the fix.
  const cell = orderCellFn();
  assert.equal(/<select/.test(cell), false, 'no position dropdown — 486 options is not a control');
  assert.match(cell, /เลื่อนขึ้นหนึ่งลำดับ/, 'one step up');
  assert.match(cell, /เลื่อนลงหนึ่งลำดับ/, 'one step down');
  assert.match(cell, /ขึ้นบนสุด/, 'and to the top of this row\'s own group');
  assert.match(cell, /type="number"/, 'and a typed rank');

  // …and the zone slice really is the narrower one, so the two are not
  // interchangeable and this test cannot silently widen back.
  assert.ok(orderZone().length < cell.length, 'the zone must be a strict subset of the component');
});

test('U4-c4 — the rank input is BOUNDED by the live list, not by a constant', () => {
  // A hardcoded ceiling would let the box offer a number the server refuses,
  // which is the live-looking-control defect the disabled arrows exist to
  // avoid — and it would be wrong the moment an article is created or deleted.
  const cell = orderCellFn();
  assert.match(cell, /min=\{1\}/, 'ranks start at 1 — that one IS a constant, and correctly so');
  assert.match(
    cell, /max=\{maxRank\}/,
    'the ceiling must be the live maximum. A literal here is the whole defect: the ' +
    'input would keep offering a number after the collection stopped having it.',
  );
  assert.match(
    src, /for \(const v of rankById\.values\(\)\)/,
    'and maxRank must be DERIVED from the ranks the ranker produced, not from ' +
    'rows.length — an inactive article holds no rank, so the row count offers ' +
    'numbers no article can hold',
  );
  assert.equal(
    /max=\{\d+\}|max="\d+"/.test(cell), false,
    'a numeric literal ceiling is present',
  );
});

test('U4-c5 — the typed value travels through moveArticleToRank, and no plan is built here', () => {
  // The structural half. The client may DESCRIBE (to render the warning) and
  // may REPLAY (applyPositionPlan, over the plan the server returned). It may
  // not PLAN: a plan computed here comes from a page-load snapshot, and a move
  // can renumber a whole block or rebalance a span.
  const code = stripComments(src);
  assert.match(code, /moveArticleToRank\(a\._id, rank\)/, 'the value is posted to the action');
  assert.match(code, /describeRankTarget/, 'and the warning comes from the describer');

  for (const builder of [
    'planMoveToRank', 'planMoveToPosition', 'planOrderStep', 'planMoveToBlockTop',
    'planSortKeyMove', 'planPromotion', 'planDemotion', 'planBadgeToggle',
  ]) {
    assert.equal(
      code.includes(builder), false,
      `the admin list references ${builder}. describeRankTarget is a DESCRIBER; every ` +
      'plan is built on the server from a fresh read, and the client only replays it.',
    );
  }
  assert.match(code, /applyPositionPlan/, 'replaying the returned plan is still allowed');
});

test('U4-c6 — the warning is rendered from the SAME function the server refuses with', () => {
  // One condition, two surfaces. A second condition written in the client would
  // drift from the action, and the symptom is an input that offers a number the
  // server rejects — or worse, refuses one it would have accepted.
  const cell = orderCellFn();
  assert.match(cell, /describeRank\(draft\)/, 'the descriptor is consulted as the admin types');
  assert.match(cell, /seen\?\.message/, 'and the sentence is taken from it verbatim');
  assert.match(cell, /if \(warning\) return;/, 'the same sentence blocks the submit');
  assert.match(cell, /text-amber-600/, 'shown in amber — nothing has failed yet');

  // The server half: the action returns the message the PLAN carries, which the
  // descriptor put there. No second lookup.
  //
  // SCOPED TO moveArticleToRank'S OWN BODY, and that scoping is not cosmetic.
  // This was a document-wide match until `setArticlePinned` grew the pinned-block
  // cap and adopted the SAME refusal line, at which point deleting this one left
  // the assertion green on the strength of the other function's copy — found by
  // running the control, not by reading. It is the scoping defect this suite
  // keeps relearning (the rank cell vs the badge switch, the card vs the type
  // filter): a claim about ONE region satisfied by an identical string in
  // another.
  const actions = stripComments(readFileSync(path.join(ROOT, 'src/lib/actions/articles.js'), 'utf8'));
  const start = actions.indexOf('export async function moveArticleToRank(');
  assert.notEqual(start, -1, 'moveArticleToRank is gone — re-point this anchor');
  const end = actions.indexOf('\nexport async function', start + 10);
  assert.notEqual(end, -1, 'could not find the end of moveArticleToRank');
  const body = actions.slice(start, end);
  assert.ok(body.length > 300, `moveArticleToRank sliced to ${body.length} chars`);

  assert.match(
    body, /if \(plan\.reason\) return \{ ok: false, error: plan\.message, plan \};/,
    'moveArticleToRank must refuse with the sentence the PLAN carries',
  );
  assert.ok(
    (actions.match(/if \(plan\.reason\) return \{ ok: false, error: plan\.message, plan \};/g) ?? []).length >= 2,
    'and it is deliberately not the only function that does — setArticlePinned uses the ' +
    'same shape for the pin cap, which is exactly why this assertion is scoped',
  );
});

test('U4-c7 — the page-window caveat is written down rather than quietly fixed', () => {
  // With a search filter or on page 2 the row can appear to jump or vanish: the
  // number means a position in the WHOLE collection and the visible list is a
  // window onto it. Already true and already accepted for the arrows, which
  // plan against true neighbours for the same reason.
  assert.match(
    src, /THE INPUT TARGETS TRUE RANKS, NOT THE VISIBLE PAGE/,
    'the caveat must be stated at the control it applies to',
  );
});

test('U4-c3 — the boundary refusal EXPLAINS itself and names where the act lives', () => {
  // A disabled arrow with no explanation is indistinguishable from a broken one,
  // and "the row above you is in the pinned group" is not something anyone would
  // guess. The sentence has to point at the screen that can actually do it.
  const code = stripComments(src);
  assert.match(code, /เหนือขึ้นไปเป็นบทความที่ปักหมุดไว้/, 'why the up arrow is dead at the boundary');
  assert.match(code, /ถัดลงไปเป็นบทความที่ไม่ได้ปักหมุด/, 'and the down arrow');
  assert.match(code, /หน้าแก้ไขบทความ/, 'both must say WHERE the pin toggle is');
  assert.match(
    code, /STEP_REFUSALS/,
    'and the reasons must be the CODES the planner and the server action use, not a ' +
    'second set of conditions written here that would drift from them',
  );
});

test('the column tooltip no longer has to argue that the two are unrelated', () => {
  // The parenthetical existed only because the UI implied they were the same
  // thing. It is evidence the defect was known and papered over, so it goes
  // with the defect — while the description of what each zone does stays.
  assert.equal(
    /title="[^"]*คนละเรื่องกัน/.test(src), false,
    'the (คนละเรื่องกัน) clause is back in a tooltip. If the UI needs it again, ' +
    'the vocabulary has leaked back — fix that instead of re-adding the disclaimer.',
  );
  // The tooltip then described TWO zones — ลำดับ and ป้าย — and the ป้าย half
  // outlived the switch it described by exactly as long as it took to notice.
  // A tooltip naming a control that is not on the screen is the same defect the
  // (คนละเรื่องกัน) clause was: authoritative text papering over the UI.
  assert.equal(
    /title="[^"]*ป้าย = /.test(src), false,
    'the tooltip still describes a ป้าย zone. That switch is on the article edit ' +
    'screen now; a column header promising a control the column does not have sends ' +
    'the reader hunting for it.',
  );
  assert.match(
    src, /title="เลื่อนบทความขึ้นหรือลงทีละหนึ่ง หรือย้ายขึ้นบนสุดของกลุ่ม · การปักหมุดและป้ายหมุดตั้งค่าที่หน้าแก้ไขบทความ"/,
    'what survives must describe what this column DOES, and point at the screen ' +
    'that owns the pin — otherwise removing the switch just loses the affordance',
  );
  // Whitespace-tolerant on purpose: the header text sits on its own line in the
  // JSX, so a literal `>จัดลำดับ<` is not in the source at all — matching it
  // that way fails against a page that is perfectly correct, which is the
  // mirror image of the substring traps this file already documents.
  assert.match(
    src, />\s*จัดลำดับ\s*</,
    'the header names one concept. `ลำดับ / ป้าย` named two, one of which is gone.',
  );
  assert.equal(/>\s*ลำดับ \/ ป้าย\s*</.test(src), false, 'the two-concept header must not come back');
});

test('U4-e2 — ย้ายขึ้นบนสุด does NOT promise position 1 to an unpinned row', () => {
  // It lands at the top of the NORMAL ordering, which with five pinned articles
  // is position 6. The number is DERIVED from the live pinned count rather than
  // written into a string, because b-004 was precisely a case of the data
  // changing while the words did not.
  const code = stripComments(src);
  assert.match(code, /function toTopTitle/, 'the copy is computed, not a constant');
  assert.match(code, /pinnedCount \+ 1/, 'and the position it claims comes from the live count');
  assert.match(
    code, /เพราะมีบทความปักหมุดอยู่/,
    'the sentence must say WHY it is not position 1',
  );
  assert.match(code, /pinnedCount === 0/, 'and it must collapse to "position 1" when nothing is pinned');
});
