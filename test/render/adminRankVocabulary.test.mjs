import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * b-004, the exact reported state: an article that IS positioned but whose
 * badge is switched OFF.
 *
 *   isPinnedOnArticlePage: true   → it has a manually chosen position
 *   pinOrder: 1                   → …at rank 1
 *   showPinBadge: false           → and the admin turned the ป้าย switch off
 *
 * The ลำดับบน /articles column still drew a pin and said ปักหมุด, because it is
 * keyed off POSITION while wearing the BADGE's icon and noun. To the admin who
 * had just switched the badge off, that is "I removed the pin and the pin is
 * still there."
 *
 * ── SCOPING IS THE ENTIRE TEST ──────────────────────────────────────────────
 * Neither assertion here can be made against the whole document:
 *
 *   assert(!/หมุด/.test(html))  fails on the badge switch's OWN aria-label,
 *                               which is correct and must stay
 *   assert(/หมุด/.test(html))   passes off that same aria-label while the rank
 *                               column is still wrong
 *
 * Both are true of this page simultaneously, so a document-wide matcher cannot
 * tell the fixed page from the broken one. This is the same trap as the banner
 * suite's bare /ค้นหา/, which matched the search input's placeholder and stayed
 * green with no banner rendered at all. So each cell is extracted first, and
 * the extraction FAILS LOUDLY rather than returning an empty string.
 */

const POSITIONED_BADGE_OFF = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaa01',
  slug: 'the-reported-article',
  title: 'บทความที่ถูกจัดตำแหน่งไว้',
  author: 'ผู้เขียน',
  coverUrl: '',
  tags: [],
  articleType: 'article',
  active: true,
  featuredOnLanding: false,
  publishedAt: '2026-07-30T11:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isPinnedOnArticlePage: true,
  pinOrder: 1,
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
 * The ลำดับบน /articles cell.
 *
 * Identified by position (it is the first column) but VERIFIED by content: it
 * must carry one of the three labels this column can produce. If the columns
 * are ever reordered, this throws and names the problem instead of silently
 * asserting against the wrong cell — which for a "does not contain" check would
 * look exactly like a pass.
 */
function rankCell(html) {
  const cell = cells(html)[0];
  assert.match(
    cell, />(กำหนดเอง|ตามวันที่|ไม่เผยแพร่)</,
    'the first <td> does not look like the rank cell — columns may have been ' +
    'reordered. Re-point this extractor; do not weaken the assertions below.',
  );
  return cell;
}

/** The ตำแหน่ง / ป้าย cell — found by its switch, not by an index. */
function badgeCell(html) {
  const found = cells(html).filter((c) => /role="switch"/.test(c));
  assert.equal(
    found.length, 1,
    `expected exactly one cell containing the badge switch, found ${found.length}`,
  );
  return found[0];
}

const html = render(POSITIONED_BADGE_OFF);

// ── the rank cell ────────────────────────────────────────────────────────────

test('b-004: positioned with the badge OFF — the rank cell says กำหนดเอง', () => {
  assert.match(
    rankCell(html), />กำหนดเอง</,
    // Matched as ELEMENT TEXT, not as a substring. The date-ordered branch
    // carries the tooltip 'ตำแหน่งนี้มาจากวันที่เผยแพร่ ไม่ได้กำหนดเอง', which
    // CONTAINS กำหนดเอง — so a bare substring match here would also pass on a
    // row that says the opposite. This file's own control caught that.
    'the column must report that this position was chosen, in its own vocabulary',
  );
});

test('b-004: positioned with the badge OFF — the rank cell contains NO หมุด', () => {
  const cell = rankCell(html);
  assert.equal(
    cell.includes('หมุด'), false,
    'THE REPORTED BUG: the admin switched the ป้าย toggle off and this column ' +
    'still says หมุด. It is reporting POSITION using the BADGE\'s noun.\n\n' +
    `rank cell was:\n${cell}`,
  );
});

test('b-004: the rank cell carries the position arrow, not a pin path', () => {
  // The glyphs render as inline <svg>, so the component name is gone by now —
  // match the geometry. lucide's ArrowUpToLine emits a "M5 3h14" top bar; Pin
  // emits a "12 17v5" stem. Asserting the ABSENCE of the pin path is the half
  // that catches a straight swap back.
  const cell = rankCell(html);
  assert.match(cell, /<svg/, 'the pill should still carry a glyph');
  assert.equal(
    /M12 17v5/.test(cell), false,
    'the pin glyph is back in the rank cell',
  );
});

// ── the badge cell, which must be UNCHANGED ──────────────────────────────────

test('the ป้าย switch still names หมุด for screen readers', () => {
  const cell = badgeCell(html);
  assert.match(
    cell, /aria-label="[^"]*หมุด/,
    'the badge control must keep its pin vocabulary — this is where หมุด belongs. ' +
    'If this fails, b-004 was "fixed" by deleting the word from the whole file ' +
    'and the switch is now unnamed.',
  );
  // badge is OFF, so the control offers to turn it back on
  assert.match(cell, /aria-checked="false"/, 'the fixture has the badge switched off');
});

test('the ป้าย switch still draws the pin glyph', () => {
  assert.match(badgeCell(html), /<svg/, 'the switch knob carries the pin');
});

// ── controls ─────────────────────────────────────────────────────────────────

test('CONTROL: the two cells are DIFFERENT slices, and only one holds หมุด', () => {
  // This is the assertion that makes the pair meaningful. Both cells exist in
  // one document; a document-wide matcher would report "หมุด is present" and
  // "หมุด is absent" as contradictory, so the whole guard lives or dies on the
  // slices being real and distinct.
  const rank = rankCell(html);
  const badge = badgeCell(html);

  assert.notEqual(rank, badge, 'the extractors returned the same cell');
  assert.equal(rank.includes(badge), false, 'the badge cell must not be nested in the rank cell');
  assert.ok(rank.length > 50 && badge.length > 50, 'both slices must be substantial');

  assert.equal(rank.includes('หมุด'), false, 'rank cell: clean');
  assert.equal(badge.includes('หมุด'), true, 'badge cell: keeps the word');

  // …and the document as a whole contains it, which is exactly why a
  // document-wide assertion could not have caught this bug in either direction
  assert.equal(
    html.includes('หมุด'), true,
    'the word is present SOMEWHERE — so `assert(!/หมุด/)` on the full document ' +
    'would fail on the fixed page, and `assert(/หมุด/)` would pass on the broken one',
  );
});

test('CONTROL: the rank cell genuinely varies — a date-ordered row reads differently', () => {
  // Without this, `rankCell` could be returning a constant fragment and the
  // กำหนดเอง assertion would be pinning a literal rather than a branch.
  const dated = render({ ...POSITIONED_BADGE_OFF, isPinnedOnArticlePage: false, pinOrder: 0 });
  const cell = rankCell(dated);
  assert.match(cell, />ตามวันที่</, 'an unpositioned article is ordered by date');
  assert.equal(
    />กำหนดเอง</.test(cell), false,
    'and must NOT claim a chosen position. Note the element-text form: this ' +
    'row\'s ' +
    'tooltip legitimately ends with ไม่ได้กำหนดเอง, so a substring check would fire ' +
    'here and turn the positive assertion above into a constant.',
  );
});

test('CONTROL: turning the badge back ON does not put หมุด into the rank cell', () => {
  // The two concepts are independent in the data; they must be independent on
  // screen too. Same position, badge ON — the rank cell must read identically,
  // because nothing about the POSITION changed.
  const badgeOn = render({ ...POSITIONED_BADGE_OFF, showPinBadge: true });
  assert.equal(
    rankCell(badgeOn), rankCell(html),
    'the rank cell changed when only the BADGE was toggled — the column is reading ' +
    'showPinBadge, which is not what it reports',
  );
  assert.equal(rankCell(badgeOn).includes('หมุด'), false);
  assert.match(badgeCell(badgeOn), /aria-checked="true"/, 'the badge switch did flip');
});
