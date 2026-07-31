import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * b-004, still: the rank column must not speak the badge's vocabulary.
 *
 * The original defect — the ลำดับบน /articles column drew a `<Pin>` glyph and
 * said ปักหมุด, while the ป้าย switch a few columns over owned the actual badge.
 * To an admin who had just switched the badge off, that reads as "I removed the
 * pin and the pin is still there."
 *
 * ── WHY THIS FILE SURVIVES ROUND 2 RATHER THAN RETIRING WITH THE LABELS ─────
 * The กำหนดเอง / ตามวันที่ pair is gone: every article now carries its own
 * `sortKey`, so "did someone choose this spot, or did the date?" has one answer
 * for all 486 rows. The column is a plain number.
 *
 * The RULE it enforced is more important now, not less. `isPinnedOnArticlePage`
 * used to mean "has a manually chosen position", which made pin vocabulary in
 * this column merely wrong; it now genuinely means PINNED, which makes หมุด
 * TEMPTING here — and it would reproduce the reported bug exactly, because an
 * article can be pinned with the badge switched off.
 *
 * ── SCOPING IS STILL THE ENTIRE TEST ────────────────────────────────────────
 * Neither assertion can be made against the whole document:
 *
 *   assert(!/หมุด/.test(html))  fails on the อยู่กลุ่มปักหมุด pill, which is
 *                               correct and must stay
 *   assert(/หมุด/.test(html))   passes off that same pill while the rank column
 *                               is still wrong
 *
 * Both are true of this page at once, so a document-wide matcher cannot tell the
 * fixed page from the broken one. Each cell is extracted first, and the
 * extraction FAILS LOUDLY rather than returning an empty string.
 *
 * ── WHAT CHANGED WHEN THE ป้าย SWITCH LEFT ──────────────────────────────────
 * The pairing used to be rank-cell-vs-badge-switch, both in this document. The
 * switch has moved to the article edit screen, so the other half of the pair is
 * now the อยู่กลุ่มปักหมุด pill — which is ORDERING vocabulary that happens to
 * contain the same noun, and is therefore the sharper test of the two: it is the
 * one phrase left in this list that a careless "remove หมุด from the admin" would
 * take with it, and it is the only thing on screen that explains a dead arrow.
 *
 * The BADGE half is asserted where the badge now is — see
 * test/fs/adminRankVocabulary.test.mjs, which reads ArticleForm.jsx (the
 * control) and ArticlesPageClient.jsx (the glyph). It is an fs guard rather than
 * a render one because ArticleForm mounts a TipTap editor at module scope and
 * does not render under this loader; a source guard that can run beats a render
 * guard that cannot.
 */

const PINNED_BADGE_OFF = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaa01',
  slug: 'the-reported-article',
  title: 'บทความที่ปักหมุดไว้',
  author: 'ผู้เขียน',
  tags: [],
  articleType: 'article',
  active: true,
  featuredOnLanding: false,
  publishedAt: '2026-07-30T11:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isPinnedOnArticlePage: true,
  pinOrder: 1,
  sortKey: 5000,
  showPinBadge: false,
};

/** One row, nothing hidden — so the truncation banner stays out of the way. */
function render(article) {
  return renderToStaticMarkup(
    createElement(ArticlesAdminClient, { articles: [article], total: 1, reachable: 1 })
  );
}

/**
 * The `<td>` cells of the single data row.
 *
 * Anchored on <tbody> so the <th> header cells — which legitimately mention
 * หมุด in the column tooltip — cannot leak into a cell slice and satisfy an
 * assertion on their own.
 */
function cells(html) {
  const start = html.indexOf('<tbody>');
  assert.notEqual(start, -1, 'no <tbody> in the render — the table did not render');
  const end = html.indexOf('</tbody>', start);
  assert.notEqual(end, -1, 'unterminated <tbody>');
  const body = html.slice(start, end);

  const parts = body.split('<td').slice(1).map((c) => `<td${c}`);
  assert.ok(parts.length >= 10, `only found ${parts.length} <td> cells — the row did not render`);
  return parts;
}

/**
 * The ลำดับ cell — the column that reports the article's position on /articles.
 * (It read `ลำดับบน /articles` until the header was shortened; the path lives in
 * the tooltip now, which is where it always did the work.)
 *
 * Identified by position (it is the first column) but VERIFIED by content: it
 * must carry either a number or the ไม่เผยแพร่ label. If the columns are ever
 * reordered this throws and names the problem instead of silently asserting
 * against the wrong cell — which for a "does not contain" check would look
 * exactly like a pass.
 */
function rankCell(html) {
  const cell = cells(html)[0];
  assert.match(
    cell, />(\d+|—)</,
    'the first <td> does not look like the rank cell — columns may have been ' +
    'reordered. Re-point this extractor; do not weaken the assertions below.',
  );
  return cell;
}

/**
 * The จัดลำดับ cell — found by a control it always carries, not by an index.
 *
 * KEYED ON THE ขึ้นบนสุด BUTTON, not on `role="switch"`. The switch was the
 * badge toggle and it has left this list entirely, so the old extractor would
 * have found ZERO cells — and the failure mode of a zero-length or absent slice
 * is that every "does not contain" assertion below passes for free. It throws
 * instead, naming what it could not find.
 *
 * The to-top button renders on EVERY row regardless of state (disabled at the
 * top of a group, never hidden), which is what makes it a safe anchor: an
 * extractor keyed on something conditional would silently return nothing for the
 * rows where the condition is false.
 */
function orderCell(html) {
  const found = cells(html).filter((c) => /aria-label="ย้ายขึ้นบนสุด"/.test(c));
  assert.equal(
    found.length, 1,
    `expected exactly one cell containing the ขึ้นบนสุด button, found ${found.length}. ` +
    'This extractor was keyed on role="switch" until the ป้าย toggle left the list; ' +
    'if the ordering controls moved again, re-point it — do NOT let it return nothing, ' +
    'which would make every assertion below vacuous.',
  );
  return found[0];
}

const html = render(PINNED_BADGE_OFF);

// ── the rank cell ────────────────────────────────────────────────────────────

test('U4-d — the rank cell is a plain position number', () => {
  assert.match(rankCell(html), />1</, 'the article is first, so the column says 1');
  assert.equal(/กำหนดเอง/.test(rankCell(html)), false, 'and no basis label — there is only one basis now');
  assert.equal(/ตามวันที่/.test(rankCell(html)), false);
});

test('b-004: pinned with the badge OFF — the rank cell contains NO หมุด', () => {
  const cell = rankCell(html);
  assert.equal(
    cell.includes('หมุด'), false,
    'THE REPORTED BUG: the admin switched the ป้าย toggle off and this column ' +
    'still says หมุด. It is reporting POSITION using the BADGE\'s noun — and now ' +
    'that isPinnedOnArticlePage genuinely means pinned, the temptation to put it ' +
    `back is stronger than it was.\n\nrank cell was:\n${cell}`,
  );
});

test('b-004: the rank cell carries no pin glyph', () => {
  // The glyphs render as inline <svg>, so the component name is gone by now —
  // match the geometry. lucide's Pin emits a "12 17v5" stem.
  assert.equal(/M12 17v5/.test(rankCell(html)), false, 'the pin glyph is back in the rank cell');
});

// ── the ordering cell, which owns the GROUP half of the vocabulary ───────────

test('the ordering cell says the row is in the pinned group — and that is not the badge', () => {
  // The pill survives the switch's removal, and it had to: it is the only thing
  // on screen that explains why this row's ↑ is dead, and the pinned group is
  // otherwise invisible now that the rank column is a plain number. It says
  // กลุ่มปักหมุด — "which group this row is in" — rather than a bare ปักหมุด,
  // which would read as a claim about the badge.
  const cell = orderCell(html);
  assert.match(cell, /อยู่กลุ่มปักหมุด/, 'the group marker');
  assert.equal(
    /ป้ายหมุด/.test(cell), false,
    'the ป้าย vocabulary is back in this cell. The badge has ONE control now and it ' +
    'is on the article edit screen — see test/fs/adminRankVocabulary.test.mjs.',
  );
});

test('the ป้าย SWITCH is gone from the list — the badge has one control, elsewhere', () => {
  // A per-document decoration switch sitting twelve to a page beside arrows
  // built to be clicked repeatedly. The pin toggle it depends on was already on
  // the edit screen (shouldShowPinBadge gates the badge on the pinned state), so
  // the two halves of one decision were a screen apart.
  assert.equal(/role="switch"/.test(html), false, 'no switch anywhere in the list');
  assert.equal(/aria-checked/.test(html), false, 'and nothing left behind that acts like one');
  assert.equal(
    /จะแสดงเมื่อปักหมุดแล้ว/.test(html), false,
    'and the badge-without-pin warning went with it — it explained the switch',
  );
});

// ── controls ─────────────────────────────────────────────────────────────────

test('CONTROL: the two cells are DIFFERENT slices, and only one holds หมุด', () => {
  // This is the assertion that makes the pair meaningful. Both cells exist in
  // one document; a document-wide matcher would report "หมุด is present" and
  // "หมุด is absent" as contradictory, so the whole guard lives or dies on the
  // slices being real and distinct.
  const rank = rankCell(html);
  const order = orderCell(html);

  assert.notEqual(rank, order, 'the extractors returned the same cell');
  assert.equal(rank.includes(order), false, 'the ordering cell must not be nested in the rank cell');
  assert.ok(rank.length > 20 && order.length > 50, 'both slices must be substantial');

  assert.equal(rank.includes('หมุด'), false, 'rank cell: clean');
  assert.equal(order.includes('หมุด'), true, 'ordering cell: keeps the word');

  assert.equal(
    html.includes('หมุด'), true,
    'the word is present SOMEWHERE — so `assert(!/หมุด/)` on the full document ' +
    'would fail on the fixed page, and `assert(/หมุด/)` would pass on the broken one',
  );
});

test('CONTROL: the rank cell genuinely varies — an inactive row reads differently', () => {
  // Without this, `rankCell` could be returning a constant fragment and the
  // number assertion would be pinning a literal rather than a branch.
  const draft = render({ ...PINNED_BADGE_OFF, active: false });
  const cell = rankCell(draft);
  assert.match(cell, />ไม่เผยแพร่</, 'an inactive article has NO position on /articles');
  assert.equal(/>1</.test(cell), false, 'and must not be given one — that would shift every real rank');
});

test('CONTROL: showPinBadge changes NOTHING on this page any more', () => {
  // This used to assert that the RANK cell was unmoved by a badge toggle while
  // the switch beside it flipped. With the switch gone the claim gets stronger,
  // not weaker: the whole document must be byte-identical, because this list has
  // no opinion about the badge at all. A row that renders differently is a row
  // reading a field it has no business reading — the first step back toward the
  // two-meanings-one-column state b-004 came out of.
  const badgeOn = render({ ...PINNED_BADGE_OFF, showPinBadge: true });
  assert.equal(
    badgeOn, html,
    'the admin list render changed when only showPinBadge was toggled',
  );
  // …and the comparison is capable of reporting a difference, which a render
  // that ignored its props entirely would also satisfy.
  assert.notEqual(
    render({ ...PINNED_BADGE_OFF, isPinnedOnArticlePage: false, pinOrder: 0 }), html,
    'while a change to something this list DOES report moves the markup — otherwise ' +
    'the equality above would pass for a component rendering a constant',
  );
});

test('CONTROL: unpinning does not change the rank cell either', () => {
  // The rank is the position on /articles. A single row is first whether or not
  // it is pinned, so the column must read the same — if it changes, the cell is
  // reporting group membership rather than position, which is the two-tier
  // vocabulary creeping back in numeric form.
  const unpinned = render({ ...PINNED_BADGE_OFF, isPinnedOnArticlePage: false, pinOrder: 0 });
  assert.equal(rankCell(unpinned), rankCell(html));
  assert.equal(
    /อยู่กลุ่มปักหมุด/.test(orderCell(unpinned)), false,
    'while the ORDERING cell, which does report membership, changes',
  );
});
