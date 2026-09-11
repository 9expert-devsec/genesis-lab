import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The list-state round trip is WIRED at every hop, and the article page is
 * still ISR.
 *
 * test/pure/listStateRoundTrip proves the derivation; this file pins that each
 * page actually calls it — the row link, the ← control, the redirect after a
 * delete or a save, the sibling hop — because the precedent's own warning is
 * that missing ONE hop is indistinguishable from the bug it replaces. Every
 * site here was one of the nine found in the inventory: two on /articles,
 * five on /admin/registrations, two on /admin/masterclass/registrations, and
 * the courses → rename hop.
 */

const ARTICLE_PAGE   = 'src/app/(public)/articles/[slug]/page.jsx';
const ARTICLE_CLIENT = 'src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx';
const ARTICLE_BACK   = 'src/app/(public)/articles/[slug]/_components/ArticleBackLink.jsx';
const ARTICLES_LIST  = 'src/app/(public)/articles/page.jsx';
const ARTICLES_GRID  = 'src/app/(public)/articles/_components/ArticlesPageClient.jsx';
const ARTICLE_CARD   = 'src/components/articles/ArticleCard.jsx';

const REG_LIST        = 'src/app/admin/registrations/page.jsx';
const REG_CLIENT      = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const REG_DETAIL_PAGE = 'src/app/admin/registrations/[id]/page.jsx';
const REG_DETAIL      = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INH_DETAIL_PAGE = 'src/app/admin/registrations/inhouse/[id]/page.jsx';
const INH_DETAIL      = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';
const SHELL           = 'src/app/admin/registrations/_components/detailShell.jsx';

const MC_LIST        = 'src/app/admin/masterclass/registrations/page.jsx';
const MC_CLIENT      = 'src/app/admin/masterclass/registrations/_components/MasterclassRegistrationsClient.jsx';
const MC_DETAIL_PAGE = 'src/app/admin/masterclass/registrations/[id]/page.jsx';
const MC_DETAIL      = 'src/app/admin/masterclass/registrations/[id]/_components/MasterclassRegDetailClient.jsx';

const COURSE_FORM   = 'src/app/admin/courses/_components/CourseForm.jsx';
const RENAME_PAGE   = 'src/app/admin/courses/rename/page.jsx';
const RENAME_CLIENT = 'src/app/admin/courses/rename/_components/RenamePreviewClient.jsx';

// ── The article page STAYS ISR ──────────────────────────────────────────────

test('the article page keeps revalidate = 3600 and reads no searchParams', () => {
  const { code } = readSource(ARTICLE_PAGE);
  assert.match(code, /export const revalidate = 3600;/, 'the article page is no longer ISR at 3600');
  assert.doesNotMatch(code, /searchParams/, 'the server page reads searchParams — that flips every article to per-request rendering');
  assert.doesNotMatch(code, /export const dynamic/, 'a `dynamic` export appeared on the article page');
});

test('the back link is its own client component, inside its own Suspense, with a BARE fallback', () => {
  const { code, withImports } = readSource(ARTICLE_BACK);
  assert.match(withImports, /^'use client';/m);
  assert.match(code, /useSearchParams\(\)/, 'the back link does not read the URL — it cannot carry the list state');
  assert.match(code, /<Suspense fallback=\{<BackAnchor href="\/articles" \/>\}>/, 'no Suspense boundary with a bare /articles fallback around the hook');
  assert.match(code, /withListQuery\('\/articles', articlePublicListQuery\(searchParams\)\)/);
});

test('ArticleDetailClient itself does not read useSearchParams — only the boundary-wrapped child does', () => {
  // If the hook were called here, the bailout would climb past the boundary
  // to the next one up — which is the whole page.
  const { code, withImports } = readSource(ARTICLE_CLIENT);
  assert.doesNotMatch(withImports, /useSearchParams/, 'useSearchParams is in ArticleDetailClient — the CSR bailout now takes the article body with it');
  assert.match(code, /<ArticleBackLink \/>/, 'the back link component is not mounted');
  assert.doesNotMatch(code, /href="\/articles"/, 'a hard-coded bare back link is back');
});

// ── /articles: list → card → back ───────────────────────────────────────────

test('/articles: the list serialises its state once, clamps an over-range page, and hands the query to the grid', () => {
  const { code } = readSource(ARTICLES_LIST);
  assert.match(code, /const listQuery = articlePublicListQuery\(sp\);/);
  assert.match(code, /pageClampTarget\(\{ path: '\/articles', query: listQuery, pageKey: 'page', page, pageCount: totalPages \}\)/);
  assert.match(code, /if \(clampTo\) redirect\(clampTo\);/);
  assert.match(code, /listQuery=\{listQuery\}/, 'the grid does not receive the query');
});

test('/articles: the grid forwards the query to every card, and the card appends it to its link', () => {
  const grid = readSource(ARTICLES_GRID).code;
  assert.match(grid, /<ArticleCard[\s\S]*?listQuery=\{listQuery\}/, 'ArticleCard is rendered without listQuery');
  assert.doesNotMatch(readSource(ARTICLES_GRID).withImports, /useSearchParams/, 'the grid must not re-derive the URL — test/fs/articlesServerRender');

  const card = readSource(ARTICLE_CARD).code;
  assert.match(card, /const href = withListQuery\(`\/articles\/\$\{article\.slug\}`, listQuery\);/);
  assert.match(card, /listQuery = ''/, 'listQuery must default to empty so the landing page and program page cards stay bare');
});

// ── /admin/registrations: list → row → detail → back / delete / sibling ─────

test('/admin/registrations: the list serialises both namespaces, clamps under THIS source\'s page key, and hands the query down', () => {
  const { code } = readSource(REG_LIST);
  assert.match(code, /const listQuery = registrationListQuery\(sp\);/);
  assert.match(code, /pageKey: filterParamKey\('page', source\)/, 'the clamp is not keyed by source — an in-house clamp would rewrite public\'s page');
  assert.match(code, /pageCount: data\.pageCount/);
  assert.match(code, /if \(clampTo\) redirect\(clampTo\);/);
  assert.match(code, /listQuery=\{listQuery\}/);
});

test('/admin/registrations: BOTH tables\' row links carry the query', () => {
  const { code } = readSource(REG_CLIENT);
  assert.match(code, /function detailHref\(source, id, listQuery = ''\)/);
  assert.match(code, /detailHref=\{\(id\) => detailHref\('inhouse', id, listQuery\)\}/, 'the in-house table falls back to its bare default href');
  assert.match(code, /detailHref=\{\(id\) => detailHref\('public', id, listQuery\)\}/, 'the public table\'s links are bare');
});

test('/admin/registrations: both detail PAGES read the query off their own URL, with source forced', () => {
  const pub = readSource(REG_DETAIL_PAGE).code;
  assert.match(pub, /async function Page\(\{ params, searchParams \}\)/);
  assert.match(pub, /registrationListQuery\(\{ \.\.\.\(\(await searchParams\) \?\? \{\}\), source: '' \}\)/, 'the public page must force source empty');
  assert.match(pub, /listQuery=\{listQuery\}/);

  const inh = readSource(INH_DETAIL_PAGE).code;
  assert.match(inh, /async function Page\(\{ params, searchParams \}\)/);
  assert.match(inh, /registrationListQuery\(\{ \.\.\.\(\(await searchParams\) \?\? \{\}\), source: 'inhouse' \}\)/, 'the in-house page must force source=inhouse — the old redirect\'s guarantee');
  assert.match(inh, /listQuery=\{listQuery\}/);
});

test('/admin/registrations: every way out of the public detail goes through the list href', () => {
  const { code } = readSource(REG_DETAIL);
  assert.match(code, /const listHref = withListQuery\('\/admin\/registrations', listQuery\);/);
  assert.match(code, /<BackLink label="กลับรายการ" href=\{listHref\} \/>/, '← is not the list href');
  assert.doesNotMatch(code, /router\.back\(\)/, 'router.back() is back — it has nothing to go to in a new tab');
  assert.doesNotMatch(code, /router\.push\('\/admin\/registrations'\)/, 'a bare post-delete redirect survives');
  // Bounded on `;`, never on `)` — the survivor push has a call inside it
  // (sourceScan defect 6).
  const pushes = [...code.matchAll(/router\.push\((.*?)\);/g)].map((m) => m[1]);
  assert.deepEqual(
    pushes,
    ['listHref', 'withListQuery(`/admin/registrations/${survivor._id}`, listQuery)', 'listHref'],
    'the delete, survivor-leg and last-leg redirects are not all carrying the list state'
  );
  assert.match(code, /href=\{withListQuery\(`\/admin\/registrations\/\$\{leg\._id\}`, listQuery\)\}/, 'the sibling-leg link drops the state, so the sibling\'s ← is bare');
});

test('/admin/registrations: the in-house detail\'s ← and delete redirect go through the list href', () => {
  const { code } = readSource(INH_DETAIL);
  assert.match(code, /const listHref = withListQuery\('\/admin\/registrations', listQuery\);/);
  assert.match(code, /<BackLink label="กลับรายการ" href=\{listHref\} \/>/);
  assert.doesNotMatch(code, /router\.back\(\)/);
  assert.doesNotMatch(code, /'\/admin\/registrations\?source=inhouse'/, 'the hard-coded redirect is back');
  assert.match(code, /if \(res\.ok\) router\.push\(listHref\);/);
});

test('the shell\'s BackLink is a real anchor taking href, not a button', () => {
  const { code } = readSource(SHELL);
  assert.match(code, /export function BackLink\(\{ label, href \}\)/);
  assert.match(code, /<Link\s+href=\{href\}/);
  // Scoped to BackLink's own body: the shell's menu items legitimately take
  // an onClick, so a file-wide negative would be red on correct code.
  const body = /export function BackLink\(([\s\S]*?)\r?\n\}/.exec(code)?.[1] ?? '';
  assert.ok(body.length > 100, 'BackLink body not found');
  assert.doesNotMatch(body, /<button|onClick/, 'the button form is back');
});

// ── /admin/masterclass/registrations ────────────────────────────────────────

test('/admin/masterclass/registrations: list serialises, clamps and hands down; the row link carries it', () => {
  const list = readSource(MC_LIST).code;
  assert.match(list, /const listQuery = masterclassRegistrationListQuery\(sp\);/);
  assert.match(list, /pageKey: 'page'/);
  assert.match(list, /if \(clampTo\) redirect\(clampTo\);/);
  assert.match(list, /listQuery=\{listQuery\}/);

  const client = readSource(MC_CLIENT).code;
  assert.match(client, /href=\{withListQuery\(`\/admin\/masterclass\/registrations\/\$\{reg\._id\}`, listQuery\)\}/);
});

test('/admin/masterclass/registrations: the detail page reads the query; ← and the delete redirect use it', () => {
  const page = readSource(MC_DETAIL_PAGE).code;
  assert.match(page, /\{ params, searchParams \}/);
  assert.match(page, /const listQuery = masterclassRegistrationListQuery\(await searchParams\);/);
  assert.match(page, /<MasterclassRegDetailClient reg=\{reg\} listQuery=\{listQuery\} \/>/);

  const client = readSource(MC_DETAIL).code;
  assert.match(client, /const listHref = withListQuery\('\/admin\/masterclass\/registrations', listQuery\);/);
  assert.match(client, /href=\{listHref\}/, '← is bare');
  assert.match(client, /if \(res\?\.ok\) router\.push\(listHref\);/, 'the delete redirect is bare');
  assert.doesNotMatch(client, /"\/admin\/masterclass\/registrations"/, 'a hard-coded list path remains');
});

// ── /admin/courses → rename → back ──────────────────────────────────────────

test('/admin/courses: the edit form carries the filter into the rename link, and the rename page carries it back', () => {
  assert.match(
    readSource(COURSE_FORM).code,
    /withListQuery\(`\/admin\/courses\/rename\?course=\$\{encodeURIComponent\(courseId\)\}`, listQuery\)/
  );
  const page = readSource(RENAME_PAGE).code;
  assert.match(page, /const listQuery = courseListQuery\(sp\);/);
  assert.match(page, /listQuery=\{listQuery\}/);

  const client = readSource(RENAME_CLIENT).code;
  assert.match(client, /href=\{withListQuery\('\/admin\/courses', listQuery\)\}/, '← on the rename page is bare');
  assert.match(client, /new URLSearchParams\(listQuery\)/, 'picking another course rewrites the URL from scratch and sheds the filter');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────

test('CONTROL: no fixed site still hard-codes its list path in an href or push', () => {
  // The nine rows of the inventory, as the strings they used to contain.
  const gone = [
    [ARTICLE_CLIENT, /href="\/articles"/],
    [INH_DETAIL,     /'\/admin\/registrations\?source=inhouse'/],
    [REG_DETAIL,     /router\.push\('\/admin\/registrations'\)/],
    [REG_DETAIL,     /router\.push\(`\/admin\/registrations\/\$\{survivor\._id\}`\)/],
    [REG_DETAIL,     /router\.back\(\)/],
    [INH_DETAIL,     /router\.back\(\)/],
    [MC_DETAIL,      /href="\/admin\/masterclass\/registrations"/],
    [MC_DETAIL,      /router\.push\('\/admin\/masterclass\/registrations'\)/],
    [RENAME_CLIENT,  /href="\/admin\/courses"/],
  ];
  for (const [file, re] of gone) {
    assert.doesNotMatch(readSource(file).code, re, `${file}: ${re} is back`);
  }
});

test('CONTROL: the files were read and the negatives point at real syntax', () => {
  for (const f of [ARTICLE_PAGE, ARTICLE_CLIENT, REG_DETAIL, INH_DETAIL, MC_DETAIL, RENAME_CLIENT]) {
    assert.ok(readSource(f).code.length > 500, `${f} scrubbed to nothing`);
  }
  // The `useSearchParams` negative above points at real syntax: the same
  // matcher finds it in the one file that is supposed to call it.
  assert.match(readSource('src/app/(public)/articles/[slug]/_components/ArticleBackLink.jsx').withImports, /useSearchParams/);
});
