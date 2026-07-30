import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_REL = 'src/app/admin/articles/_components/ArticlesAdminClient.jsx';
const src = readFileSync(path.join(ROOT, CLIENT_REL), 'utf8');

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
 * Block comments only, plus whole-line `//` — a bare `//` sweep would eat the
 * tail of any URL in the source.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

function slice(startAnchor, endAnchor, label) {
  const start = src.indexOf(startAnchor);
  assert.notEqual(
    start, -1,
    `[${CLIENT_REL}] could not find the START of the ${label} region ` +
    `(${JSON.stringify(startAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  assert.notEqual(
    end, -1,
    `[${CLIENT_REL}] could not find the END of the ${label} region ` +
    `(${JSON.stringify(endAnchor)}) — re-point this anchor, do not delete the test`,
  );
  const body = stripComments(src.slice(start, end));
  assert.ok(
    body.length > 200,
    `[${CLIENT_REL}] the ${label} region sliced to ${body.length} chars — too small ` +
    'to be the real component, so every containment check below would be vacuous',
  );
  return body;
}

/** `function RankCell(` … up to the next top-level function declaration. */
const rankCell = () => slice('function RankCell(', '\nfunction ', 'RankCell');

/** The badge zone inside PositionCell … up to where RankCell begins. */
const badgeZone = () => slice('{/* ── zone 2: badge ── */}', 'function RankCell(', 'badge switch');

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

test('RankCell uses the matched pair กำหนดเอง / ตามวันที่', () => {
  // Not decoration: the two labels are the two answers to the ONE question this
  // column asks. A lone `กำหนดเอง` with no counterpart would leave the
  // date-ordered rows reading as an unlabelled number again.
  const body = rankCell();
  assert.match(body, /กำหนดเอง/, 'the manual-position label');
  assert.match(body, /ตามวันที่/, 'its counterpart on date-ordered rows');
  assert.match(body, /ArrowUpToLine/, 'the position glyph, shared with the จัดตำแหน่ง button');
});

test('the tie branch keeps its explanation, minus the borrowed noun', () => {
  // b-005 will make duplicate order numbers unrepresentable and this branch
  // becomes an unreachable tripwire. Renamed, not invested in, NOT deleted —
  // and the sentence explaining that a duplicate number does not decide the
  // position is the only place a user can learn that, so it must survive the
  // rename.
  const body = rankCell();
  assert.match(body, /ลำดับซ้ำ/, 'the tie label, no longer naming Pin');
  assert.equal(/ลำดับ Pin ซ้ำ/.test(body), false, 'the old tie label is gone');
  assert.match(
    body, /ตำแหน่งจริงจึงตัดสินด้วยวันที่เผยแพร่/,
    'the tie tooltip must still explain that publishedAt breaks the tie',
  );
});

// ── half 2: the badge still owns its own vocabulary ──────────────────────────

test('the badge switch DOES keep the pin glyph and the word หมุด (the rule is placement, not a ban)', () => {
  const zone = badgeZone();
  assert.match(
    zone, /<Pin\b/,
    'the ป้าย switch carries the pin glyph — that is what the control is FOR. If ' +
    'this fails, the fix for b-004 was applied by deleting the word everywhere ' +
    'instead of by moving it to where it belongs.',
  );
  assert.match(
    zone, /หมุด/,
    'the switch\'s aria-label names the pin (ซ่อนป้ายหมุด / แสดงป้ายหมุด). Removing ' +
    'it would leave the control unnamed for screen readers.',
  );
});

test('CONTROL: the slicer is live — it finds different, non-empty regions', () => {
  // Without this, both anchors could resolve to the same span (or to something
  // tiny) and half 1 would pass by measuring nothing. `slice` already throws on
  // a missing anchor; this pins that the two regions are genuinely DISTINCT,
  // which is the property the pairing above depends on.
  const rank = rankCell();
  const badge = badgeZone();
  assert.ok(rank.length > 400, `RankCell region is only ${rank.length} chars`);
  assert.ok(badge.length > 400, `badge region is only ${badge.length} chars`);
  assert.equal(rank.includes(badge), false, 'the badge region must not be inside RankCell');
  assert.equal(badge.includes(rank), false, 'RankCell must not be inside the badge region');

  // and the containment matchers themselves work: each region holds something
  // the other does not
  assert.match(rank, /rankBasis/, 'the rank region should mention rankBasis');
  assert.equal(/rankBasis/.test(badge), false, 'the badge region should not');
});

test('CONTROL: a missing anchor THROWS a named error rather than passing vacuously', () => {
  assert.throws(
    () => slice('function ThisDoesNotExist(', '\nfunction ', 'bogus'),
    /could not find the START of the bogus region/,
    'a moved anchor must fail loudly — a silently-empty slice satisfies every ' +
    '"does not contain" assertion in this file',
  );
});

// ── the button that had to be renamed with them ──────────────────────────────

test('the demote button says WHICH thing it releases', () => {
  // A bare `ปลด` was survivable while one concept wore both names. Now that
  // position and badge are spelled differently everywhere else, it is the one
  // control left that does not say which of the two it acts on.
  // Comments stripped first, or this is vacuous in both directions: the note
  // sitting above the label literally contains the string `ปลด`, and the note
  // ALSO sits between the previous `>` and the label, so a positional regex
  // would fail to match a genuinely-bare label too.
  const code = stripComments(src);
  assert.match(code, /ปลดตำแหน่ง/, 'the demote button must name the position');
  assert.equal(
    /ปลด(?!ตำแหน่ง)/.test(code), false,
    'a bare ปลด remains — ปลดอะไร, the position or the badge? Thai has no word ' +
    'boundary for a regex to lean on, so this matches any ปลด NOT followed by ตำแหน่ง.',
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
  assert.match(
    src, /title="ตำแหน่ง = ย้ายบทความขึ้นบล็อกบนสุด · ป้าย = แสดงหมุดบนการ์ด"/,
    'the useful half of the tooltip must survive',
  );
});
