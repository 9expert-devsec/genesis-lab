import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * The bounded position controls that replaced the free `<input type="number">`.
 *
 * b-005: the number field let an admin type any integer into one row while the
 * action wrote it without looking at the others, so duplicates and gaps were a
 * normal thing to type — production held 1,1,2,3,4,5,6,7,9,10. The replacement
 * is ↑/↓ plus a select of exactly 1..M, both routed through
 * planMoveToPosition, which re-emits the block as contiguous 1..M.
 *
 * The pure tier proves the planner. This tier proves the SURFACE cannot ask for
 * anything the planner would have to clamp: no free text field, an option list
 * bounded by the LIVE block size, and the arrows dead at the ends.
 *
 * BOTH HALVES OF EVERY CLAIM. "The controls are present for a positioned row"
 * alone is satisfied by rendering them on every row; "absent for an unpinned
 * row" alone is satisfied by an empty cell. Each pair is asserted together.
 */

const at = (y) => `20${y}-01-01T00:00:00.000Z`;

function row(id, over = {}) {
  return {
    _id: id,
    slug: id,
    title: `บทความ ${id}`,
    author: '',
    coverUrl: '',
    tags: [],
    articleType: 'article',
    active: true,
    featuredOnLanding: false,
    publishedAt: at(26),
    createdAt: at(20),
    isPinnedOnArticlePage: false,
    pinOrder: 0,
    showPinBadge: true,
    ...over,
  };
}

const pinned = (id, order, pub) =>
  row(id, { isPinnedOnArticlePage: true, pinOrder: order, publishedAt: pub ?? at(26) });

/** A block of `n` positioned articles plus one date-ordered article. */
function listOf(n) {
  const block = Array.from({ length: n }, (_, i) => pinned(`p${i + 1}`, i + 1, at(30 - i)));
  return [...block, row('dated', { publishedAt: at(29) })];
}

function html(articles) {
  return renderToStaticMarkup(
    createElement(ArticlesAdminClient, {
      articles,
      total: articles.length,
      reachable: articles.length,
    })
  );
}

/** The <td> cells of one row, found by the row's slug text. */
function cellsOfRow(markup, id) {
  const body = markup.slice(markup.indexOf('<tbody>'), markup.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  const found = rows.filter((r) => r.includes(`>${id}<`));
  assert.equal(found.length, 1, `expected exactly one row for ${id}, found ${found.length}`);
  return found[0];
}

/** The ตำแหน่ง / ป้าย cell — identified by the badge switch it always contains. */
function positionCell(markup, id) {
  const r = cellsOfRow(markup, id);
  const cells = r.split('<td').slice(1).map((c) => `<td${c}`);
  const found = cells.filter((c) => /role="switch"/.test(c));
  assert.equal(found.length, 1, `expected one position/badge cell in row ${id}, found ${found.length}`);
  return found[0];
}

const optionValues = (cell) =>
  [...cell.matchAll(/<option[^>]*value="(\d+)"/g)].map((m) => Number(m[1]));

// ── present for a positioned row, absent for an unpinned one ─────────────────

test('a positioned row gets the move select; an unpinned row does not', () => {
  const markup = html(listOf(4));
  assert.match(positionCell(markup, 'p2'), /<select/, 'positioned row: select present');
  assert.equal(
    /<select/.test(positionCell(markup, 'dated')), false,
    'an unpinned article has no position to move — offering 1..M there would invite ' +
    '"put this at 3" and silently promote it instead',
  );
});

test('a positioned row gets both arrows; an unpinned row gets neither', () => {
  const markup = html(listOf(4));
  const p = positionCell(markup, 'p2');
  assert.match(p, /aria-label="เลื่อนขึ้นหนึ่งลำดับ[^"]*"/, 'up arrow');
  assert.match(p, /aria-label="เลื่อนลงหนึ่งลำดับ[^"]*"/, 'down arrow');

  const d = positionCell(markup, 'dated');
  assert.equal(/เลื่อนขึ้นหนึ่งลำดับ/.test(d), false, 'unpinned: no up arrow');
  assert.equal(/เลื่อนลงหนึ่งลำดับ/.test(d), false, 'unpinned: no down arrow');
  assert.match(d, /จัดตำแหน่ง/, 'it gets the promote button instead');
});

test('the free number input is GONE — b-005 is unrepresentable at the surface', () => {
  const markup = html(listOf(4));
  const p = positionCell(markup, 'p2');
  assert.equal(
    /<input[^>]*type="number"/.test(p), false,
    'a free number field re-opens duplicates and gaps. The point is not that typing ' +
    'is inconvenient — it is that the bad states cannot be expressed.',
  );
  // and nowhere else in the table either
  assert.equal(/<input[^>]*type="number"/.test(markup), false, 'no number input anywhere in the list');
});

// ── the select is bounded by the LIVE block size ─────────────────────────────

test('the select offers exactly 1..M, where M is the live block size', () => {
  for (const n of [2, 4, 7]) {
    const cell = positionCell(html(listOf(n)), 'p1');
    assert.deepEqual(
      optionValues(cell),
      Array.from({ length: n }, (_, i) => i + 1),
      `block of ${n} must offer exactly 1..${n}`,
    );
  }
});

test('CONTROL: the option count TRACKS the block — it is not a constant', () => {
  // Without this, "1..M" could be a hardcoded list that happens to match one
  // fixture. Two different block sizes must produce two different option lists.
  const four = optionValues(positionCell(html(listOf(4)), 'p1'));
  const seven = optionValues(positionCell(html(listOf(7)), 'p1'));
  assert.notDeepEqual(four, seven, 'the option list did not change with the block size');
  assert.equal(four.length, 4);
  assert.equal(seven.length, 7);
});

test('the select never offers a position the model cannot store', () => {
  // The list is two contiguous blocks: ranks M+1 and beyond belong to the
  // date-ordered mass and cannot be assigned. The fixture has an unpinned
  // article, so the LIST is longer than the block — the select must follow the
  // block, not the list.
  const articles = listOf(3); // 3 pinned + 1 dated = 4 rows
  assert.equal(articles.length, 4, 'fixture: more rows than block members');
  const values = optionValues(positionCell(html(articles), 'p1'));
  assert.deepEqual(values, [1, 2, 3], 'bounded by the block (3), not the row count (4)');
});

// ── the arrows are dead at the ends ──────────────────────────────────────────

/**
 * Is the button carrying `label` rendered disabled?
 *
 * ── THE RULE, WHICH IS NOT ABOUT `disabled` ─────────────────────────────────
 * NEVER match a bare HTML attribute NAME in Tailwind markup. Match `attr=""`.
 *
 * Tailwind variant prefixes are attribute names followed by a colon, and `:` is
 * a non-word character — so `\b` sits happily inside them. `/\bdisabled\b/`
 * matches `disabled:opacity-30`; `/\bchecked\b/` matches `checked:bg-blue-500`;
 * the same holds for `required:`, `open:`, `readonly:`, `indeterminate:`,
 * `placeholder-shown:` and every other state variant. The class is present on
 * BOTH the enabled and the disabled render, so a name-only matcher returns true
 * unconditionally: assertions expecting "on" pass for the wrong reason, and
 * assertions expecting "off" fail with a confusing diff.
 *
 * That is exactly what happened here — the first version of this helper used
 * `/\bdisabled\b/`, reported EVERY arrow as disabled, failed the three "live"
 * assertions, and passed the all-dead one for entirely the wrong reason. Same
 * family as the banner suite's bare /ค้นหา/ matching the search placeholder:
 * a matcher aimed at a token that appears in more than one role.
 */
function arrowDisabled(cell, label) {
  const m = cell.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`));
  assert.ok(m, `no button found for ${label}`);
  return /\sdisabled=""/.test(m[0]);
}

test('CONTROL: arrowDisabled reads the ATTRIBUTE, not the disabled: Tailwind class', () => {
  const live = '<button type="button" aria-label="เลื่อนขึ้นX" class="disabled:opacity-30">';
  const dead = '<button type="button" disabled="" aria-label="เลื่อนขึ้นX" class="disabled:opacity-30">';
  assert.equal(arrowDisabled(live, 'เลื่อนขึ้น'), false, 'the class alone must not read as disabled');
  assert.equal(arrowDisabled(dead, 'เลื่อนขึ้น'), true, 'the attribute must');

  // The general rule, demonstrated rather than only asserted for `disabled`:
  // a name-only matcher cannot tell the two apart, which is why it must never
  // be used against Tailwind markup.
  assert.equal(/\bdisabled\b/.test(live), true, 'a name-only matcher fires on the CLASS…');
  assert.equal(/\bdisabled\b/.test(dead), true, '…and on the attribute — it cannot distinguish them');
  for (const variant of ['checked:bg-blue-500', 'required:border-red-500', 'open:rotate-180', 'readonly:bg-gray-100']) {
    const attr = variant.split(':')[0];
    assert.match(
      variant, new RegExp(`\\b${attr}\\b`),
      `\\b${attr}\\b matches inside the Tailwind variant ${variant} — the trap is not ` +
      'specific to `disabled`, it applies to every state variant',
    );
  }
});

test('the UP arrow is disabled at position 1 and live elsewhere', () => {
  const markup = html(listOf(4));
  assert.equal(arrowDisabled(positionCell(markup, 'p1'), 'เลื่อนขึ้น'), true, 'at the top: dead');
  assert.equal(arrowDisabled(positionCell(markup, 'p2'), 'เลื่อนขึ้น'), false, 'mid-block: live');
});

test('the DOWN arrow is disabled at position M and live elsewhere', () => {
  const markup = html(listOf(4));
  assert.equal(arrowDisabled(positionCell(markup, 'p4'), 'เลื่อนลง'), true, 'at the bottom: dead');
  assert.equal(arrowDisabled(positionCell(markup, 'p3'), 'เลื่อนลง'), false, 'mid-block: live');
});

test('CONTROL: both arrows are live in the middle — disabled is not the default', () => {
  // If `disabled` were unconditional, the two tests above would pass on their
  // disabled half and the "live" half would be the only thing holding them
  // honest. Assert a row where NEITHER end applies.
  const cell = positionCell(html(listOf(5)), 'p3');
  assert.equal(arrowDisabled(cell, 'เลื่อนขึ้น'), false);
  assert.equal(arrowDisabled(cell, 'เลื่อนลง'), false);
});

test('a block of ONE has both arrows dead and the select disabled', () => {
  // The degenerate case: nowhere to move. The controls stay rendered rather
  // than disappearing, so the cell does not reflow as the block shrinks.
  const cell = positionCell(html(listOf(1)), 'p1');
  assert.equal(arrowDisabled(cell, 'เลื่อนขึ้น'), true);
  assert.equal(arrowDisabled(cell, 'เลื่อนลง'), true);
  // ATTRIBUTE, not the `disabled:opacity-50` class — see arrowDisabled's note.
  assert.match(cell, /<select[^>]*\sdisabled=""/, 'the one-option select is disabled');
  assert.equal(
    /<select[^>]*\sdisabled=""/.test(positionCell(html(listOf(4)), 'p1')), false,
    'and a multi-member block leaves it enabled — otherwise this is a constant',
  );
  assert.deepEqual(optionValues(cell), [1]);
});

// ── the tripwire ─────────────────────────────────────────────────────────────

test('pinTie still renders ลำดับซ้ำ — it is a corruption tripwire now, not a normal state', () => {
  // Ties are unreachable through the UI once the free input is gone. This
  // branch is kept deliberately: if it ever fires, something wrote pinOrder
  // outside the planner, and a visible symptom beats a silent one.
  const markup = html([
    pinned('t1', 2, at(30)),
    pinned('t2', 2, at(29)), // same pinOrder — only reachable via corruption
  ]);
  assert.match(markup, />ลำดับซ้ำ</, 'the amber tie pill must still render when the data is corrupt');
});

test('CONTROL: a clean block does NOT show the tie pill', () => {
  assert.equal(/>ลำดับซ้ำ</.test(html(listOf(3))), false, 'no tie, no pill');
});
