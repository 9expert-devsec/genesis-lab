import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * The admin article list's COLUMN SET, as it actually renders.
 *
 * The cover thumbnail was removed: a 40px circle of a decorative image, one per
 * row, twelve to a page, in a table whose job is to find and order articles. It
 * identified nothing the title did not, and it was the widest non-text column on
 * a table already at `min-w-[900px]`.
 *
 * ── WHY A COUNT AND A NEGATIVE, AND WHY BOTH ────────────────────────────────
 * "No <img> in a row" alone is satisfied by a fixture with no cover to render —
 * which is exactly what every other admin fixture in this suite has (`coverUrl:
 * ''`), and under the OLD code those rendered the initial-letter fallback, not
 * an image. So the fixture here carries a REAL cover URL: with the column back,
 * that row emits an `<img src=…>` and this file reddens. With an empty
 * `coverUrl` it would stay green either way and prove nothing.
 *
 * And the count alone is satisfied by removing the wrong column. The two
 * together say which ten columns are left.
 */

const WITH_COVER = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaa01',
  slug: 'has-a-cover',
  title: 'บทความที่มีภาพปก',
  author: 'ผู้เขียน',
  // THE POINT OF THIS FIXTURE. Not '' — see the note above.
  coverUrl: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
  tags: ['tag-a'],
  articleType: 'article',
  active: true,
  featuredOnLanding: false,
  publishedAt: '2026-07-30T11:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  sortKey: 5000,
  showPinBadge: true,
};

const html = renderToStaticMarkup(
  createElement(ArticlesAdminClient, { articles: [WITH_COVER], total: 1, reachable: 1 })
);

/**
 * The `<th>` cells of the header row.
 *
 * THROWS when the table is not there rather than returning an empty list: a
 * zero-length header would make the count assertion fail with a confusing diff
 * and the "no <img>" assertion pass for free.
 */
function headerCells(markup) {
  const start = markup.indexOf('<thead>');
  assert.notEqual(start, -1, 'no <thead> in the render — the table did not render');
  const end = markup.indexOf('</thead>', start);
  assert.notEqual(end, -1, 'unterminated <thead>');
  // From AFTER the opening tag: `<thead>` itself starts with `<th`, and slicing
  // from `start` made the split report one phantom column. Caught by L1-a going
  // red at 11 against a header that really has 10.
  return markup.slice(start + '<thead>'.length, end).split('<th').slice(1);
}

/** The single data row. Same fail-loud discipline. */
function dataRow(markup) {
  const start = markup.indexOf('<tbody>');
  assert.notEqual(start, -1, 'no <tbody> in the render');
  const end = markup.indexOf('</tbody>', start);
  assert.notEqual(end, -1, 'unterminated <tbody>');
  const body = markup.slice(start, end);
  assert.ok(body.includes('>has-a-cover<'), 'the fixture row did not render');
  return body;
}

test('L1-a — the header row has EXACTLY 10 columns', () => {
  // Exact, not a floor: a floor is satisfied by adding a column back. The empty
  // state's colSpan is derived from this number by hand, so the two are pinned
  // together below.
  const cells = headerCells(html);
  assert.equal(
    cells.length, 10,
    `expected 10 header cells, found ${cells.length}. Was 11 until the ภาพ column ` +
    'was removed. If a column was added or removed deliberately, move this number ' +
    'AND the empty-state colSpan in the same edit.',
  );
});

test('L1-b — the ภาพ column is gone, header and body', () => {
  const cells = headerCells(html);
  assert.equal(
    cells.some((c) => c.includes('>ภาพ<')), false,
    'the cover-image header is back',
  );
  assert.equal(
    /<img/.test(dataRow(html)), false,
    'a rendered row emits an <img>. The fixture carries a real coverUrl, so this ' +
    'reddens the moment the thumbnail column returns — which is the whole reason ' +
    'it is not the usual empty-string fixture.',
  );
});

test('L1-c — the empty-state colSpan matches the header width', () => {
  // Two numbers that must agree, with nothing in the framework forcing them to:
  // a colSpan too small leaves a stray cell, too large silently widens the
  // table. Rendered with no rows so the empty state is on screen.
  const empty = renderToStaticMarkup(
    createElement(ArticlesAdminClient, { articles: [], total: 0, reachable: 0 })
  );
  assert.match(empty, /ยังไม่มีบทความ/, 'the empty state must be what rendered');
  const m = empty.match(/<td[^>]*colspan="(\d+)"/i);
  assert.ok(m, 'the empty-state cell carries no colSpan');
  assert.equal(
    Number(m[1]), headerCells(empty).length,
    'the empty row spans a different number of columns than the header has',
  );
});

test('L1-d — CONTROL: the extractors are live and can see a column that IS there', () => {
  // Every assertion above is a negative or a count, and both are satisfied by
  // extractors that return nothing. Point the same two at columns that must
  // exist, and at the image the fixture would render if the column came back.
  const cells = headerCells(html);
  assert.ok(cells.some((c) => c.includes('>ลำดับ<')), 'the rank column header');
  assert.ok(cells.some((c) => c.includes('>Home<')), 'the home-page column header');
  assert.ok(cells.some((c) => c.includes('>หัวข้อ / Slug<')), 'the title column header');

  const row = dataRow(html);
  assert.ok(row.length > 200, `the row sliced to ${row.length} chars`);
  assert.equal(
    /<img/.test('<td><img src="x.jpg" alt="y"/></td>'), true,
    'and the matcher fires on the markup the removed column produced — otherwise ' +
    'L1-b passes against a pattern that matches nothing',
  );
});

test('L1-e — the two renamed headers say what they now mean', () => {
  // `ลำดับบน /articles` → `ลำดับ`: the tooltip already said "นับจากบทความทั้งหมด",
  // so the path was doing no work in a 24px-wide column.
  // `Landing` → `Home`: the public route is `/`, and nothing user-facing has
  // been called "Landing" since the page was renamed.
  const cells = headerCells(html);
  assert.equal(cells.some((c) => c.includes('>ลำดับบน /articles<')), false, 'the old rank header is gone');
  assert.equal(cells.some((c) => c.includes('>Landing<')), false, 'and the old featured header');
  assert.match(
    html, /title="ลำดับจริงบนหน้า \/articles — นับจากบทความทั้งหมด ไม่ใช่เฉพาะหน้านี้"/,
    'the tooltip survives the rename — it carries the meaning the header shed',
  );
  assert.match(
    html, /aria-label="แสดงบนหน้าแรก \(Home\)"/,
    'and the star button agrees with its column header rather than still saying Landing',
  );
});
