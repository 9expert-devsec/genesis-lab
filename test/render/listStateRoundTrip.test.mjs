import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { __setSearchParams, __failSearchParams } from 'next/navigation';

import { ArticleCard } from '@/components/articles/ArticleCard';
import { ArticleBackLink } from '@/app/(public)/articles/[slug]/_components/ArticleBackLink';
import { ArticleDetailClient } from '@/app/(public)/articles/[slug]/_components/ArticleDetailClient';
import { BackLink } from '@/app/admin/registrations/_components/detailShell';
import { InhouseTable } from '@/app/admin/registrations/_components/InhouseTable';

/**
 * The list-state round trip, RENDERED: what the browser actually receives at
 * each end of the trip, and — the constraint that matters most — what the
 * SERVER sends for the article page's back link when the URL is not available
 * to it, which is the ISR render path.
 *
 * The pure tier proves the strings; the fs tier proves the wiring; this proves
 * the anchors carry them.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const BACK_TEXT = 'กลับไปยังบทความทั้งหมด';

const backAnchor = (doc) =>
  [...doc.querySelectorAll('a')].find((a) => a.textContent.includes(BACK_TEXT));

const ARTICLE = {
  _id: 'a1', slug: 'hello-world', title: 'Hello World', content: '<p>สวัสดี</p>', tags: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

// ── The card ────────────────────────────────────────────────────────────────

test('the /articles card appends the list state to BOTH of its links', () => {
  const doc = docOf(renderToStaticMarkup(createElement(ArticleCard, {
    article: ARTICLE, listQuery: 'page=3&q=excel',
  })));
  const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.length >= 2, 'the card renders two links (cover and title)');
  for (const h of hrefs) assert.equal(h, '/articles/hello-world?page=3&q=excel');
});

test('CONTROL: the card with no list state renders bare links — the landing page and program page case', () => {
  const doc = docOf(renderToStaticMarkup(createElement(ArticleCard, { article: ARTICLE })));
  for (const a of doc.querySelectorAll('a')) assert.equal(a.getAttribute('href'), '/articles/hello-world');
});

// ── The article back link, hydrated: reads the URL ──────────────────────────

test('the back link carries the page and filters found on the article URL', () => {
  __setSearchParams('page=3&q=excel&tag=vba');
  try {
    const a = backAnchor(docOf(renderToStaticMarkup(createElement(ArticleBackLink))));
    assert.ok(a, 'no back link rendered');
    assert.equal(a.getAttribute('href'), '/articles?page=3&q=excel&tag=vba');
  } finally {
    __setSearchParams('');
  }
});

test('CONTROL: a bare article URL gives a bare back link', () => {
  __setSearchParams('');
  const a = backAnchor(docOf(renderToStaticMarkup(createElement(ArticleBackLink))));
  assert.equal(a.getAttribute('href'), '/articles');
});

test('CONTROL: a param that is not list state is not carried back', () => {
  __setSearchParams('utm_source=fb&page=2');
  try {
    const a = backAnchor(docOf(renderToStaticMarkup(createElement(ArticleBackLink))));
    assert.equal(a.getAttribute('href'), '/articles?page=2');
  } finally {
    __setSearchParams('');
  }
});

// ── The article back link, on the render path that cannot read the URL ──────

/**
 * THE ISR CONSTRAINT, RENDERED.
 *
 * On a static render Next refuses `useSearchParams` and bails the subtree out
 * to CSR up to the nearest Suspense boundary, flushing the FALLBACK. The stub
 * models the refusal by throwing (see its note), and React's server renderer
 * does what the real one does with an error inside a boundary: it emits the
 * fallback. So this asserts the two things the constraint requires — the
 * server-sent link is BARE, and the failure stops at the boundary rather than
 * taking the page down.
 */
test('when the URL is unavailable, the SERVER sends a bare /articles back link and nothing else fails', () => {
  __failSearchParams(true);
  try {
    const a = backAnchor(docOf(renderToStaticMarkup(createElement(ArticleBackLink))));
    assert.ok(a, 'the fallback did not render — the bailout climbed past the boundary');
    assert.equal(a.getAttribute('href'), '/articles');
  } finally {
    __failSearchParams(false);
  }
});

test('the whole article page still renders on that path, and its back link is the bare one', () => {
  // The boundary is around the link, not the page: the body, share strip and
  // everything else must survive the hook being refused.
  __failSearchParams(true);
  try {
    const doc = docOf(renderToStaticMarkup(createElement(ArticleDetailClient, {
      article: ARTICLE, related: [], relatedCoursesData: [], minutes: 2,
    })));
    assert.ok(doc.querySelector('h1')?.textContent.includes('Hello World'), 'the article body did not render');
    const a = backAnchor(doc);
    assert.ok(a, 'the back link is missing from the page');
    assert.equal(a.getAttribute('href'), '/articles');
  } finally {
    __failSearchParams(false);
  }
});

// ── The admin shell's back link ─────────────────────────────────────────────

test('the registrations shell renders ← as an anchor with the list href, not a button', () => {
  const doc = docOf(renderToStaticMarkup(createElement(BackLink, {
    label: 'กลับรายการ', href: '/admin/registrations?source=inhouse&inhouse.page=3',
  })));
  assert.equal(doc.querySelector('button'), null, 'a button rendered');
  const a = doc.querySelector('a');
  assert.ok(a, 'no anchor rendered');
  assert.equal(a.getAttribute('href'), '/admin/registrations?source=inhouse&inhouse.page=3');
  assert.equal(a.textContent.trim(), 'กลับรายการ');
});

// ── The in-house table's rows ───────────────────────────────────────────────

test('the in-house table puts the list state on every cell link of a row when given a detailHref', () => {
  const row = {
    _id: 'r1', company: 'ACME', contactName: 'Ann', email: 'a@x.th', phone: '', status: 'new',
    coursesInterested: [], createdAt: '2026-09-01T00:00:00.000Z',
  };
  const listQuery = 'source=inhouse&inhouse.page=3';
  const doc = docOf(renderToStaticMarkup(createElement(InhouseTable, {
    items: [row], courseNames: {},
    detailHref: (id) => `/admin/registrations/inhouse/${id}?${listQuery}`,
  })));
  const hrefs = [...doc.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.length > 0, 'no row links rendered');
  for (const h of hrefs) assert.equal(h, '/admin/registrations/inhouse/r1?source=inhouse&inhouse.page=3');
});
