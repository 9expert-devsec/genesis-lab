import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesAdminClient } from '@/app/admin/articles/_components/ArticlesAdminClient';

/**
 * The truncation banner on /admin/articles — the actual fix for b-002/b-003.
 *
 * The list fetched 200 of 484 articles and every surface on the page agreed
 * that nothing was wrong, including the row count in the header, which reported
 * the fetch size as the collection size. A bigger fetch would have moved the
 * cliff; the banner removes the silence.
 *
 * WHY THE RENDER TIER: test/pure/adminListWindow.test.mjs already proves the
 * arithmetic. It cannot prove the component USES it — a correct
 * `describeListWindow` wired to nothing, or a banner rendered unconditionally,
 * both pass the pure tests. Only rendering the real component with real props
 * shows the banner appearing and, just as importantly, NOT appearing.
 *
 * BOTH HALVES ARE MANDATORY. "Banner present when truncated" alone is satisfied
 * by a banner that is always on, which would train the admin to ignore it — the
 * unread-badge failure this repo's test doctrine keeps coming back to.
 */

/** One row, shaped like what ADMIN_LIST_FIELDS projects. */
function row(i) {
  return {
    _id: `aaaaaaaaaaaaaaaaaaaaaa${String(i).padStart(2, '0')}`,
    slug: `article-${i}`,
    title: `บทความ ${i}`,
    author: 'ผู้เขียน',
    coverUrl: '',
    tags: [],
    articleType: 'article',
    active: true,
    featuredOnLanding: false,
    publishedAt: '2026-07-30T11:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    isPinnedOnArticlePage: false,
    pinOrder: 0,
    showPinBadge: true,
  };
}

const rows = (n) => Array.from({ length: n }, (_, i) => row(i));

const html = (props) => renderToStaticMarkup(createElement(ArticlesAdminClient, props));

/** The banner is the only role="alert" on this page. */
const hasBanner = (markup) => /role="alert"/.test(markup);

// ── half 1: it fires ─────────────────────────────────────────────────────────

test('total > shown → the banner is rendered', () => {
  const markup = html({ articles: rows(3), total: 484, limit: 3 });
  assert.equal(hasBanner(markup), true, 'the list is hiding 481 articles and said nothing');
});

test('the banner names the HIDDEN COUNT, not just "some rows are missing"', () => {
  // A vague warning is dismissable. The number is what makes an admin act, and
  // it is the number the old page could not compute because it discarded total.
  const markup = html({ articles: rows(3), total: 484, limit: 3 });
  assert.match(markup, /481/, 'the hidden count (484 - 3) must appear in the banner');
  assert.match(markup, /ไม่ครบ/, 'the banner must say outright that the list is incomplete');
});

test('the banner warns that the search box cannot reach the hidden rows', () => {
  // This is the half that made b-003 read as data loss: searching an exact
  // title of a hidden article returns "ไม่พบบทความ", because the search box is
  // a client-side filter over the rows already fetched.
  //
  // NOTE the specificity. A bare /ค้นหา/ ALSO matches the search input's own
  // placeholder ("ค้นหา title / slug / author / tag…"), so it passes with no
  // banner on the page at all — verified by hardcoding `truncated: false` and
  // watching this test stay green while nine others went red. Match the
  // banner's own sentence.
  const markup = html({ articles: rows(3), total: 484, limit: 3 });
  assert.match(
    markup, /ช่องค้นหาด้านบนกรองเฉพาะ/,
    'the banner must say the search box only filters the rows already loaded',
  );
  assert.equal(
    /ช่องค้นหาด้านบนกรองเฉพาะ/.test(html({ articles: rows(3), total: 3, limit: 3 })),
    false,
    'and that sentence must belong to the banner, not to the page chrome',
  );
});

test('the banner is loud — amber, bordered, and announced', () => {
  const markup = html({ articles: rows(3), total: 484, limit: 3 });
  assert.match(markup, /role="alert"/, 'announced to assistive tech, not merely coloured');
  assert.match(markup, /border-amber-400/, 'amber border per the required treatment');
  assert.match(markup, /bg-amber-50/, 'amber fill');
});

// ── half 2: it stays quiet ───────────────────────────────────────────────────

test('total === shown → NO banner (the half that stops it crying wolf)', () => {
  const markup = html({ articles: rows(12), total: 12, limit: 200 });
  assert.equal(
    hasBanner(markup), false,
    'a banner on a complete list is a banner nobody reads, which is the same ' +
    'silence in a louder colour',
  );
});

test('total === shown === limit → still no banner (the exact-fit boundary)', () => {
  const markup = html({ articles: rows(5), total: 5, limit: 5 });
  assert.equal(hasBanner(markup), false, 'a full window is not a truncated one');
});

test('CONTROL: the same markup differs between the two cases — the matcher is live', () => {
  // Without this, `hasBanner` could be broken (a bad regex, a component that
  // fails to render) and BOTH halves above would pass for the wrong reason:
  // "no banner" is the default answer of a matcher that never matches.
  const truncated = html({ articles: rows(3), total: 484, limit: 3 });
  const complete = html({ articles: rows(3), total: 3, limit: 3 });
  assert.notEqual(truncated, complete, 'the two renders are identical — nothing is conditional');
  assert.equal(hasBanner(truncated), true);
  assert.equal(hasBanner(complete), false);
  // and the component genuinely rendered, rather than returning nothing
  assert.match(complete, /จัดการบทความ/, 'the page heading is missing — the component did not render');
});

// ── the header count, which was the other half of the lie ────────────────────

test('the header reports TOTAL, never the fetched row count', () => {
  // `ทั้งหมด {rows.length}` was authoritative and wrong by 284. Render 3 rows
  // against a total of 484 and the header must say 484.
  const markup = html({ articles: rows(3), total: 484, limit: 3 });
  assert.match(markup, /ทั้งหมด\s*(<!-- -->)?484/, 'the header must show the collection size');
  assert.equal(
    /ทั้งหมด\s*(<!-- -->)?3\s*(<!-- -->)?บทความ/.test(markup), false,
    'the header is still reporting the fetch size as the collection size',
  );
});

test('CONTROL: the header count follows `total` and is not a hardcoded 484', () => {
  const markup = html({ articles: rows(3), total: 77, limit: 3 });
  assert.match(markup, /ทั้งหมด\s*(<!-- -->)?77/);
});
