import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * The ordering controls, as they actually render.
 *
 * EVERY ROW GETS THEM — that is the whole point of this round. There is no
 * จัดตำแหน่ง button to press first, because every article carries its own
 * `sortKey` and every article can be moved.
 *
 * The pure tier proves the planner. This tier proves the SURFACE: that the
 * controls exist on every row, that the ones the planner would refuse are dead
 * and say why, and that the two things the previous design used — a free number
 * field and a 1..N select — are both gone.
 *
 * BOTH HALVES OF EVERY CLAIM. "The arrows are live here" alone is satisfied by
 * arrows that are never disabled; "dead there" alone by arrows that are always
 * disabled. Each pair is asserted together.
 */

const at = (y) => `${y}-01-01T00:00:00.000Z`;

function row(id, over = {}) {
  return {
    _id: id,
    slug: id,
    title: `บทความ ${id}`,
    author: '',
    tags: [],
    articleType: 'article',
    active: true,
    featuredOnLanding: false,
    publishedAt: at(2026),
    createdAt: at(2020),
    isPinnedOnArticlePage: false,
    pinOrder: 0,
    sortKey: 1000,
    showPinBadge: true,
    ...over,
  };
}

const pinned = (id, order) => row(id, { isPinnedOnArticlePage: true, pinOrder: order, sortKey: 500 });
const plain = (id, sortKey) => row(id, { sortKey });

/** Two pinned rows above four unpinned ones — the production shape in miniature. */
const LIST = [
  pinned('p1', 1), pinned('p2', 2),
  plain('u1', 4000), plain('u2', 3000), plain('u3', 2000), plain('u4', 1000),
];

/** No pinned rows at all — the state the collection reaches if all five are released. */
const UNPINNED_ONLY = [plain('a', 3000), plain('b', 2000), plain('c', 1000)];

function html(articles) {
  return renderToStaticMarkup(
    createElement(ArticlesAdminClient, {
      articles,
      total: articles.length,
      reachable: articles.length,
    })
  );
}

/** The <tr> of one row, found by its slug text. */
function rowOf(markup, id) {
  const body = markup.slice(markup.indexOf('<tbody>'), markup.indexOf('</tbody>'));
  const rows = body.split('<tr').slice(1);
  const found = rows.filter((r) => r.includes(`>${id}<`));
  assert.equal(found.length, 1, `expected exactly one row for ${id}, found ${found.length}`);
  return found[0];
}

/**
 * The จัดลำดับ cell — identified by the ขึ้นบนสุด button it always contains.
 *
 * It was keyed on `role="switch"` (the ป้าย badge toggle) until that control
 * moved to the article edit screen. Keyed on something CONDITIONAL it would
 * return nothing for the rows where the condition is false, and a missing slice
 * makes every "is this disabled" assertion below fail with a confusing diff
 * rather than a useful one — so the anchor is a button that renders on every
 * row in every state (disabled at the top of a group, never hidden), and the
 * count is asserted EXACTLY 1 so a zero-match throws instead of sliding past.
 */
function orderCell(markup, id) {
  const cells = rowOf(markup, id).split('<td').slice(1).map((c) => `<td${c}`);
  const found = cells.filter((c) => /aria-label="ย้ายขึ้นบนสุด"/.test(c));
  assert.equal(
    found.length, 1,
    `expected one ordering cell in row ${id}, found ${found.length} — re-point this ` +
    'extractor rather than letting it return an empty slice',
  );
  return found[0];
}

/**
 * Is the control carrying `label` rendered disabled?
 *
 * ── THE RULE, WHICH IS NOT ABOUT `disabled` ─────────────────────────────────
 * NEVER match a bare HTML attribute NAME in Tailwind markup. Match `attr=""`.
 *
 * Tailwind variant prefixes are attribute names followed by a colon, and `:` is
 * a non-word character — so `\b` sits happily inside them. `/\bdisabled\b/`
 * matches `disabled:opacity-30`; the same holds for `checked:`, `required:`,
 * `open:`, `readonly:` and every other state variant. The class is present on
 * BOTH the enabled and the disabled render, so a name-only matcher returns true
 * unconditionally: assertions expecting "on" pass for the wrong reason, and
 * assertions expecting "off" fail with a confusing diff.
 *
 * That is exactly what happened when this helper was first written — it used
 * `/\bdisabled\b/`, reported EVERY arrow as disabled, and passed the all-dead
 * assertion for entirely the wrong reason.
 */
function controlDisabled(cell, label) {
  const m = cell.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`));
  assert.ok(m, `no button found for ${label}`);
  return /\sdisabled=""/.test(m[0]);
}

/** The `title=` on the control carrying `label` — the sentence a dead one shows. */
function controlTitle(cell, label) {
  const m = cell.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`));
  assert.ok(m, `no button found for ${label}`);
  const t = m[0].match(/\stitle="([^"]*)"/);
  assert.ok(t, `the button for ${label} carries no title — a dead control with no ` +
    'explanation is indistinguishable from a broken one');
  return t[1];
}

test('CONTROL: controlDisabled reads the ATTRIBUTE, not the disabled: Tailwind class', () => {
  const live = '<button type="button" aria-label="เลื่อนขึ้นX" title="t" class="disabled:opacity-30">';
  const dead = '<button type="button" disabled="" aria-label="เลื่อนขึ้นX" title="t" class="disabled:opacity-30">';
  assert.equal(controlDisabled(live, 'เลื่อนขึ้น'), false, 'the class alone must not read as disabled');
  assert.equal(controlDisabled(dead, 'เลื่อนขึ้น'), true, 'the attribute must');

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

// ── U4-a · every row gets the controls ───────────────────────────────────────

test('U4-a — EVERY row renders all three controls, pinned or not', () => {
  // The point of the round, on screen: there is nothing to switch on first.
  const markup = html(LIST);
  for (const id of ['p1', 'p2', 'u1', 'u2', 'u3', 'u4']) {
    const cell = orderCell(markup, id);
    assert.match(cell, /aria-label="เลื่อนขึ้นหนึ่งลำดับ[^"]*"/, `${id}: up arrow`);
    assert.match(cell, /aria-label="เลื่อนลงหนึ่งลำดับ[^"]*"/, `${id}: down arrow`);
    assert.match(cell, /aria-label="ย้ายขึ้นบนสุด"/, `${id}: to-top button`);
  }
});

test('U4-c — จัดตำแหน่ง / ปลดตำแหน่ง render nowhere in the list', () => {
  const markup = html(LIST);
  assert.equal(/จัดตำแหน่ง/.test(markup), false, 'the promote button is gone');
  assert.equal(/ปลดตำแหน่ง/.test(markup), false, 'and the demote button');
});

/** The rank input in one row's ordering cell. Throws rather than returning ''. */
function rankInput(markup, id) {
  const m = orderCell(markup, id).match(/<input[^>]*type="number"[^>]*>/);
  assert.ok(m, `row ${id} has no rank input — re-point this extractor, do not delete the test`);
  return m[0];
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

test('U4-b — the rank input is BOUNDED BY THE LIVE LIST, and there is still no select', () => {
  // THIS ASSERTION USED TO READ "no numeric input". Replaced, not deleted: the
  // invariant it protected is "no free integer reaches pinOrder/sortKey", and
  // test/fs/articlePinOrderWrites enforces that structurally — the only value
  // reaching $set is `Number(w.pinOrder)` off a server-built plan. What has to
  // be true of the WIDGET is different: it must not offer a number the action
  // will refuse.
  const six = html(LIST);
  assert.equal(attr(rankInput(six, 'u4'), 'min'), '1', 'ranks start at 1');
  assert.equal(attr(rankInput(six, 'u4'), 'max'), '6', 'six ranked articles, so six is the ceiling');
  assert.equal(/<select/.test(six), false, 'and no position dropdown — 486 options is not a control');
});

test('U4-b2 — CONTROL: the ceiling MOVES with the collection', () => {
  // The assertion above passes for a hardcoded `max="6"`. A three-row list must
  // report three, and a fourteen-row list fourteen — the last one also proving
  // the bound is the COLLECTION and not the twelve rows painted on page 1,
  // which is the same rank-vs-visible-page distinction the arrows already keep.
  assert.equal(attr(rankInput(html(UNPINNED_ONLY), 'c'), 'max'), '3');
  assert.equal(
    attr(rankInput(html(TWO_PAGES), 'n01'), 'max'), '14',
    'fourteen ranked articles, twelve of them on this page — the input targets true ' +
    'ranks over the whole collection',
  );
});

test('U4-b3 — an INACTIVE row gets a disabled input that says why', () => {
  // It holds no rank at all, so there is no number that could mean anything.
  // Disabled WITH an explanation: a dead control with no reason is
  // indistinguishable from a broken one, which is the rule the arrows follow.
  const markup = html([plain('a', 3000), row('off', { active: false, sortKey: 2000 }), plain('c', 1000)]);
  const dead = rankInput(markup, 'off');
  assert.match(dead, /\sdisabled=""/, 'the attribute, not the Tailwind class');
  assert.match(attr(dead, 'title'), /ยังไม่เผยแพร่/, 'and it names the real cause');

  // …and the live rows in the same render are NOT disabled, or "disabled" would
  // just be this component's default.
  assert.equal(/\sdisabled=""/.test(rankInput(markup, 'a')), false, 'an active row is editable');
  assert.equal(attr(rankInput(markup, 'a'), 'max'), '2', 'and the ceiling counts ranked rows only');
});

test('U4-b4 — the input is SEEDED with the row\'s own current rank', () => {
  // Otherwise it is a blank box that means nothing until you type, and the
  // admin has to read the number out of the first column and copy it across.
  const markup = html(LIST);
  assert.equal(attr(rankInput(markup, 'p1'), 'value'), '1');
  assert.equal(attr(rankInput(markup, 'u4'), 'value'), '6');
  assert.notEqual(
    attr(rankInput(markup, 'p1'), 'value'), attr(rankInput(markup, 'u4'), 'value'),
    'the seed varies per row — a constant would pass the two assertions above if ' +
    'they ever collapsed to one',
  );
});

// ── U4-f · the controls VARY, and the ends are dead ──────────────────────────

test('the UP arrow is dead at the top of the list and live below it', () => {
  const markup = html(LIST);
  assert.equal(controlDisabled(orderCell(markup, 'p1'), 'เลื่อนขึ้น'), true, 'row 1 of the list: dead');
  assert.equal(controlDisabled(orderCell(markup, 'p2'), 'เลื่อนขึ้น'), false, 'row 2: live');
  assert.match(controlTitle(orderCell(markup, 'p1'), 'เลื่อนขึ้น'), /บนสุดของรายการ/);
});

test('the DOWN arrow is dead at the bottom of the list and live above it', () => {
  const markup = html(LIST);
  assert.equal(controlDisabled(orderCell(markup, 'u4'), 'เลื่อนลง'), true, 'last row: dead');
  assert.equal(controlDisabled(orderCell(markup, 'u3'), 'เลื่อนลง'), false, 'second from last: live');
  assert.match(controlTitle(orderCell(markup, 'u4'), 'เลื่อนลง'), /ล่างสุดของรายการ/);
});

test('U4-f — CONTROL: a middle row has BOTH arrows live — disabled is not the default', () => {
  const cell = orderCell(html(LIST), 'u2');
  assert.equal(controlDisabled(cell, 'เลื่อนขึ้น'), false);
  assert.equal(controlDisabled(cell, 'เลื่อนลง'), false);
  assert.equal(controlDisabled(cell, 'ย้ายขึ้นบนสุด'), false);
});

// ── S4-c · the pin boundary, on screen ───────────────────────────────────────

test('the boundary arrows are dead ON BOTH SIDES and say why', () => {
  // p2 is the last pinned row; u1 is the first unpinned one. Stepping between
  // them means leaving or joining the pinned group, which is the toggle's job.
  const markup = html(LIST);

  assert.equal(controlDisabled(orderCell(markup, 'p2'), 'เลื่อนลง'), true, 'last pinned, downward: dead');
  assert.match(
    controlTitle(orderCell(markup, 'p2'), 'เลื่อนลง'), /ไม่ได้ปักหมุด/,
    'and it explains that what is below is a different kind of row',
  );

  assert.equal(controlDisabled(orderCell(markup, 'u1'), 'เลื่อนขึ้น'), true, 'first unpinned, upward: dead');
  assert.match(controlTitle(orderCell(markup, 'u1'), 'เลื่อนขึ้น'), /ปักหมุดไว้/);
  assert.match(
    controlTitle(orderCell(markup, 'u1'), 'เลื่อนขึ้น'), /หน้าแก้ไขบทความ/,
    'and both point at the screen that CAN do it — otherwise the refusal is a dead end',
  );
});

test('S4-d — CONTROL: the boundary rows are live in the OTHER direction', () => {
  // Otherwise "dead at the boundary" would be indistinguishable from "these two
  // rows are frozen", and the assertion above would prove nothing about the
  // boundary specifically.
  const markup = html(LIST);
  assert.equal(controlDisabled(orderCell(markup, 'p2'), 'เลื่อนขึ้น'), false, 'p2 still moves inside the group');
  assert.equal(controlDisabled(orderCell(markup, 'u1'), 'เลื่อนลง'), false, 'u1 still moves down the normal order');
});

test('the boundary sentence differs from the end-of-list sentence', () => {
  // Two different situations need two different explanations: "there is nothing
  // above you" and "what is above you is a different kind of thing".
  const markup = html(LIST);
  assert.notEqual(
    controlTitle(orderCell(markup, 'u1'), 'เลื่อนขึ้น'),
    controlTitle(orderCell(markup, 'p1'), 'เลื่อนขึ้น'),
    'the pin boundary and the top of the list must not read identically',
  );
});

// ── S4-e · to the top of this row's own group ────────────────────────────────

test('ย้ายขึ้นบนสุด is dead at the top of each group and live everywhere else', () => {
  const markup = html(LIST);
  assert.equal(controlDisabled(orderCell(markup, 'p1'), 'ย้ายขึ้นบนสุด'), true, 'top of the pinned group');
  assert.equal(controlDisabled(orderCell(markup, 'u1'), 'ย้ายขึ้นบนสุด'), true, 'top of the normal order');
  assert.equal(controlDisabled(orderCell(markup, 'u4'), 'ย้ายขึ้นบนสุด'), false, 'anywhere else: live');
  assert.equal(controlDisabled(orderCell(markup, 'p2'), 'ย้ายขึ้นบนสุด'), false);
});

test('U4-e2 — the ขึ้นบนสุด tooltip does not promise position 1 to an unpinned row', () => {
  // With two pinned articles above, "the top" is position 3 — and the sentence
  // says so, with the number derived from the live pinned count.
  const title = controlTitle(orderCell(html(LIST), 'u4'), 'ย้ายขึ้นบนสุด');
  assert.match(title, /ลำดับที่ 3/, 'it names the position it will actually reach');
  assert.match(title, /ปักหมุดอยู่ 2 รายการ/, 'and why that is not 1');
  assert.equal(/\(ลำดับที่ 1\)/.test(title), false, 'it must not claim the top of the page');
});

test('U4-e3 — CONTROL: with nothing pinned, the SAME control does claim position 1', () => {
  // The number is derived, not a constant, and the "why" clause disappears when
  // there is nothing to explain. Without this the assertion above would pass for
  // a hardcoded sentence about two pinned articles.
  const title = controlTitle(orderCell(html(UNPINNED_ONLY), 'c'), 'ย้ายขึ้นบนสุด');
  assert.match(title, /ลำดับที่ 1/, 'with no pinned group the top of the normal order IS the top');
  assert.equal(/เพราะมีบทความปักหมุด/.test(title), false, 'and the explanation is not shown when it does not apply');
});

test('with nothing pinned, no arrow is refused for a boundary that does not exist', () => {
  const markup = html(UNPINNED_ONLY);
  assert.equal(controlDisabled(orderCell(markup, 'b'), 'เลื่อนขึ้น'), false);
  assert.equal(controlDisabled(orderCell(markup, 'b'), 'เลื่อนลง'), false);
  assert.equal(/อยู่กลุ่มปักหมุด/.test(markup), false, 'and no row claims to be in a group that is empty');
});

// ── N3: the PAGE boundary is not the LIST boundary ───────────────────────────

/**
 * Fourteen rows — two more than PAGE_SIZE, so page 1 ends at row 12 while the
 * collection carries on.
 *
 * THIS FIXTURE EXISTS BECAUSE A CONTROL FIRED NOTHING. Deriving the control
 * states from `pageRows` instead of `rows` — the exact defect ruling 3 is about
 * — reddened NOT ONE assertion in this file, because every other fixture here
 * has six rows or fewer and fits on one page, where `pageRows === rows` and the
 * two are indistinguishable. A guard that cannot see the bug it is named after
 * is not a guard.
 */
const TWO_PAGES = Array.from({ length: 14 }, (_, i) => plain(`n${String(i + 1).padStart(2, '0')}`, 20000 - i * 1000));

test('N3 — the last row of PAGE 1 keeps a live ↓, because the collection continues', () => {
  // The row visually last on screen is not last in the ordering. If the disabled
  // state were computed from the visible rows, this arrow would be dead and the
  // admin would be told they had reached the end of a list with two more pages.
  const markup = html(TWO_PAGES);
  assert.match(markup, />n12</, 'row 12 is on page 1');
  assert.equal(/>n13</.test(markup), false, 'and row 13 is not — the pager is doing its job');

  assert.equal(
    controlDisabled(orderCell(markup, 'n12'), 'เลื่อนลง'), false,
    'the last row ON THIS PAGE must still be able to move down — there are 2 more rows',
  );
  assert.equal(
    controlDisabled(orderCell(markup, 'n01'), 'เลื่อนขึ้น'), true,
    'while the genuine first row of the COLLECTION is still dead — otherwise this ' +
    'test would pass against controls that are never disabled at all',
  );
});

test('N3 — CONTROL: a 14-row fixture really does paginate', () => {
  // If PAGE_SIZE ever rises above 14 this fixture silently stops exercising the
  // boundary and the test above becomes a duplicate of the six-row one.
  const markup = html(TWO_PAGES);
  const rendered = [...markup.matchAll(/>n\d\d</g)].length;
  assert.equal(rendered, 12, `expected exactly one page of 12 rows, rendered ${rendered}`);
  assert.match(markup, /aria-label="แบ่งหน้า"/, 'and the pager is on screen');
});

// ── the pinned marker and the tripwire ───────────────────────────────────────

test('a pinned row is MARKED, so the dead boundary arrow is explicable at a glance', () => {
  const markup = html(LIST);
  assert.match(orderCell(markup, 'p1'), /อยู่กลุ่มปักหมุด/, 'pinned rows say so');
  assert.equal(
    /อยู่กลุ่มปักหมุด/.test(orderCell(markup, 'u1')), false,
    'and unpinned rows do not — otherwise the marker is decoration',
  );
});

test('pinTie still renders ลำดับซ้ำ — a corruption tripwire, not a normal state', () => {
  // Duplicates are unreachable through this UI: every pinned move goes through
  // planMoveToPosition, which re-emits the block as contiguous 1..M. If this
  // ever fires, something wrote pinOrder outside the planner.
  const markup = html([pinned('t1', 2), pinned('t2', 2), plain('u1', 1000)]);
  assert.match(markup, />ลำดับซ้ำ</, 'the amber tie pill must still render when the data is corrupt');
});

test('CONTROL: a clean block does NOT show the tie pill', () => {
  assert.equal(/>ลำดับซ้ำ</.test(html(LIST)), false, 'no tie, no pill');
});
