import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listQueryReader, pageClampTarget, withListQuery } from '@/lib/adminListQuery';
import { articlePublicListQuery, PUBLIC_ARTICLE_LIST_PARAMS } from '@/lib/articles/publicListQuery';
import { registrationListQuery, REGISTRATION_LIST_PARAMS } from '@/lib/registrations/listQuery';
import { masterclassRegistrationListQuery, MASTERCLASS_REGISTRATION_LIST_PARAMS } from '@/lib/masterclass/registrationListQuery';
import { courseListQuery } from '@/lib/courses/adminListQuery';
import { PER_SOURCE_PARAMS } from '@/lib/registrations/filterScope';

/**
 * A list's URL state survives the trip into a detail page and back.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * /articles?page=3 → open an article → กลับไปยังบทความทั้งหมด → page 1.
 * /admin/registrations?source=inhouse&inhouse.page=3 → open → delete → page 1.
 * Every hop was a hard-coded bare path. The cure is the one /admin/courses
 * already had: the list appends its state to the row link, the detail page
 * reads it off its own URL and puts it on ← and on every redirect out.
 *
 * ── WHAT IS PINNED HERE ─────────────────────────────────────────────────────
 * The DERIVATION, end to end, for each list the round trip was wired on: a
 * list URL with several params set → the row link → what the detail page reads
 * → the ← / redirect target, compared as WHOLE STRINGS so a param that is
 * preserved in name but not in value goes red. Plus the guard the other way:
 * a bare list produces bare links, so the fix cannot invent state. The wiring
 * — that each page actually calls these — is test/fs/listStateRoundTrip.
 */

/** The searchParams a detail page would see, given the href the list wrote. */
const arrivingAt = (href) => new URL(`https://x${href}`).searchParams;

// ── The shared reader ───────────────────────────────────────────────────────

test('listQueryReader: fixed order, first value, trimmed, empties dropped', () => {
  const read = listQueryReader(['a', 'b', 'c']);
  assert.equal(read({ c: '3', a: '1', b: '2' }), 'a=1&b=2&c=3');
  assert.equal(read({ a: ['x', 'y'] }), 'a=x');
  assert.equal(read({ a: '  x  ' }), 'a=x');
  assert.equal(read({ a: '', b: '   ', c: null }), '');
  assert.equal(read(new URLSearchParams('b=2&zzz=9')), 'b=2');
});

test('courseListQuery is the same reader and behaves as it always did', () => {
  // The precedent was rewritten onto the shared loop; test/pure/adminListQuery
  // pins its behaviour in detail, this pins that the rewrite is the same
  // function and not a lookalike.
  assert.equal(courseListQuery({ type: 'public', q: 'excel', program: 'p1' }), 'q=excel&program=p1&type=public');
  assert.equal(courseListQuery({ q: 'excel', page: '3', utm_source: 'x' }), 'q=excel');
});

// ── Public /articles ────────────────────────────────────────────────────────

test('/articles: page, search, tag, program, skill and type all make the round trip', () => {
  const list = '/articles?page=3&q=excel&tag=vba&program=EXC&skill=SK1&type=video';
  const fromList = articlePublicListQuery(arrivingAt(list));
  const cardHref = withListQuery('/articles/hello-world', fromList);
  assert.equal(cardHref, '/articles/hello-world?page=3&q=excel&tag=vba&program=EXC&skill=SK1&type=video');

  const back = withListQuery('/articles', articlePublicListQuery(arrivingAt(cardHref)));
  assert.equal(back, list);
});

test('/articles: page alone — the reported case — comes back as page 3, not page 1', () => {
  const cardHref = withListQuery('/articles/x', articlePublicListQuery(arrivingAt('/articles?page=3')));
  assert.equal(cardHref, '/articles/x?page=3');
  assert.equal(withListQuery('/articles', articlePublicListQuery(arrivingAt(cardHref))), '/articles?page=3');
});

test('/articles: the param list is exactly what page.jsx reads', () => {
  assert.deepEqual(PUBLIC_ARTICLE_LIST_PARAMS, ['page', 'q', 'tag', 'program', 'skill', 'type']);
});

// ── /admin/registrations — namespaced ───────────────────────────────────────

test('/admin/registrations: source AND the namespaced inhouse.page both survive — the reported case', () => {
  const list = '/admin/registrations?source=inhouse&inhouse.page=3';
  const fromList = registrationListQuery(arrivingAt(list));
  const rowHref = withListQuery('/admin/registrations/inhouse/abc', fromList);
  assert.equal(rowHref, '/admin/registrations/inhouse/abc?source=inhouse&inhouse.page=3');

  // What the in-house detail page reads back — with source forced, as the page does.
  const onDetail = registrationListQuery({ ...Object.fromEntries(arrivingAt(rowHref)), source: 'inhouse' });
  const afterDelete = withListQuery('/admin/registrations', onDetail);
  assert.equal(afterDelete, list, 'the delete redirect must land on page 3 of in-house, not page 1');
});

test('/admin/registrations: BOTH namespaces travel, not only the source on screen', () => {
  // Public filtered to "excel" on page 2, in-house filtered to "acme" on page
  // 3 with a status, in-house showing. Toggle after coming back and public's
  // filter has to still be there.
  const list = '/admin/registrations?source=inhouse&q=excel&page=2&inhouse.status=new&inhouse.q=acme&inhouse.page=3';
  const fromList = registrationListQuery(arrivingAt(list));
  const rowHref = withListQuery('/admin/registrations/inhouse/abc', fromList);
  const back = withListQuery('/admin/registrations', registrationListQuery(arrivingAt(rowHref)));

  const expect = new URLSearchParams(list.split('?')[1]);
  const got = new URLSearchParams(back.split('?')[1]);
  assert.equal(back.split('?')[0], '/admin/registrations');
  for (const key of ['source', 'q', 'page', 'inhouse.status', 'inhouse.q', 'inhouse.page']) {
    assert.equal(got.get(key), expect.get(key), `${key} did not survive the round trip`);
  }
  assert.equal([...got.keys()].length, 6, 'a param was invented or dropped');
});

test('/admin/registrations: every per-source param is listed under BOTH spellings, plus source', () => {
  // Derived from PER_SOURCE_PARAMS, so adding a filter there adds it here.
  for (const name of PER_SOURCE_PARAMS) {
    assert.ok(REGISTRATION_LIST_PARAMS.includes(name), `${name} (public spelling) missing`);
    assert.ok(REGISTRATION_LIST_PARAMS.includes(`inhouse.${name}`), `inhouse.${name} missing`);
  }
  assert.equal(REGISTRATION_LIST_PARAMS[0], 'source');
  assert.equal(REGISTRATION_LIST_PARAMS.length, 1 + 2 * PER_SOURCE_PARAMS.length);
});

test('/admin/registrations: the public detail page forces source EMPTY, the in-house page forces it to inhouse', () => {
  // The two detail pages spread `source` over whatever the URL carried. A bare
  // arrival on the in-house page must still go back to the in-house list —
  // the guarantee the old hard-coded `?source=inhouse` redirect gave.
  assert.equal(
    withListQuery('/admin/registrations', registrationListQuery({ source: 'inhouse' })),
    '/admin/registrations?source=inhouse'
  );
  // And a public page reached with a stray source=inhouse must not send the
  // admin to the other list.
  assert.equal(
    withListQuery('/admin/registrations', registrationListQuery({ source: '', page: '2' })),
    '/admin/registrations?page=2'
  );
});

// ── /admin/masterclass/registrations ────────────────────────────────────────

test('/admin/masterclass/registrations: status, q, course, batch, scope, page and ppp all survive', () => {
  const list = '/admin/masterclass/registrations?status=paid&q=ann&range=month&courseId=c1&batchId=b2&licenseScope=per_attendee&page=4&ppp=25';
  const fromList = masterclassRegistrationListQuery(arrivingAt(list));
  const rowHref = withListQuery('/admin/masterclass/registrations/r1', fromList);
  assert.equal(withListQuery('/admin/masterclass/registrations', masterclassRegistrationListQuery(arrivingAt(rowHref))), list);
  assert.deepEqual(MASTERCLASS_REGISTRATION_LIST_PARAMS, ['status', 'q', 'range', 'courseId', 'batchId', 'licenseScope', 'page', 'ppp']);
});

// ── /admin/courses → rename ─────────────────────────────────────────────────

test('/admin/courses: the filter survives the edit → rename → back chain', () => {
  const list = '/admin/courses?q=excel&type=inhouse';
  const editHref = withListQuery('/admin/courses/abc/edit', courseListQuery(arrivingAt(list)));
  const renameHref = withListQuery('/admin/courses/rename?course=EXC-101', courseListQuery(arrivingAt(editHref)));
  assert.equal(renameHref, '/admin/courses/rename?course=EXC-101&q=excel&type=inhouse');
  assert.equal(withListQuery('/admin/courses', courseListQuery(arrivingAt(renameHref))), list);
});

// ── CONTROL: a bare list stays bare ─────────────────────────────────────────

test('CONTROL: a bare list URL produces bare links and a bare way back — no state is invented', () => {
  for (const [read, path, detail] of [
    [articlePublicListQuery, '/articles', '/articles/x'],
    [registrationListQuery, '/admin/registrations', '/admin/registrations/x'],
    [masterclassRegistrationListQuery, '/admin/masterclass/registrations', '/admin/masterclass/registrations/x'],
    [courseListQuery, '/admin/courses', '/admin/courses/x/edit'],
  ]) {
    const fromBare = read(arrivingAt(path));
    assert.equal(fromBare, '', `${path}: a bare list serialised to "${fromBare}"`);
    assert.equal(withListQuery(detail, fromBare), detail);
    assert.equal(withListQuery(path, read(arrivingAt(detail))), path);
    assert.equal(read(null), '');
    assert.equal(read(undefined), '');
  }
});

test('CONTROL: a param that is not list state does not ride along', () => {
  assert.equal(articlePublicListQuery({ page: '2', utm_source: 'fb', preview: '1' }), 'page=2');
  assert.equal(registrationListQuery({ 'inhouse.page': '2', foo: 'bar', 'public.q': 'x' }), 'inhouse.page=2');
  assert.equal(masterclassRegistrationListQuery({ page: '2', tab: 'x' }), 'page=2');
});

// ── Deleting the last row on a page ─────────────────────────────────────────

test('clamp: a page past the end goes to the last page that has rows, filters intact', () => {
  assert.equal(
    pageClampTarget({ path: '/admin/registrations', query: 'source=inhouse&inhouse.q=acme&inhouse.page=29', pageKey: 'inhouse.page', page: 29, pageCount: 28 }),
    '/admin/registrations?source=inhouse&inhouse.q=acme&inhouse.page=28'
  );
  assert.equal(
    pageClampTarget({ path: '/articles', query: 'page=5&q=excel', pageKey: 'page', page: 5, pageCount: 2 }),
    '/articles?page=2&q=excel'
  );
});

test('clamp: when nothing is left the page param is REMOVED, not written as 1', () => {
  // Every list spells its first page as an absent param.
  assert.equal(
    pageClampTarget({ path: '/admin/registrations', query: 'source=inhouse&inhouse.page=2', pageKey: 'inhouse.page', page: 2, pageCount: 0 }),
    '/admin/registrations?source=inhouse'
  );
  assert.equal(pageClampTarget({ path: '/articles', query: 'page=3', pageKey: 'page', page: 3, pageCount: 1 }), '/articles');
});

test('clamp: the namespaced key is the only one touched — public\'s page is left alone by an in-house clamp', () => {
  assert.equal(
    pageClampTarget({ path: '/admin/registrations', query: 'source=inhouse&page=7&inhouse.page=9', pageKey: 'inhouse.page', page: 9, pageCount: 3 }),
    '/admin/registrations?source=inhouse&page=7&inhouse.page=3'
  );
});

test('CONTROL: clamp is null for page 1, an in-range page and the last page — nothing redirects on a normal arrival', () => {
  assert.equal(pageClampTarget({ path: '/articles', query: '', pageKey: 'page', page: 1, pageCount: 0 }), null);
  assert.equal(pageClampTarget({ path: '/articles', query: '', pageKey: 'page', page: 1, pageCount: 1 }), null);
  assert.equal(pageClampTarget({ path: '/articles', query: 'page=2', pageKey: 'page', page: 2, pageCount: 5 }), null);
  assert.equal(pageClampTarget({ path: '/articles', query: 'page=5', pageKey: 'page', page: 5, pageCount: 5 }), null);
});
