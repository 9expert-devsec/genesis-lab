import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { RESERVED_SLUGS, isReservedSlug } from '@/lib/pages/reservedSlugs';
import { reservedPathOwner } from '@/lib/courses/reservedPaths';
import { PUBLIC_ARTICLE_FILTER, WRITER_ARTICLE_CARD_FIELDS, PROGRAM_ARTICLE_CARD_FIELDS, PUBLIC_LIST_FIELDS } from '@/lib/articleListFields';
import { writerArticleCountPipeline } from '@/lib/writers/writerPolicy';

/**
 * Server components and the sitemap cannot run here, so this reads their source
 * for the wiring the pure tests cannot see.
 */

const code = (rel) => readSource(rel).code;

const profile = code('src/app/(public)/writer/[slug]/page.jsx');
const list = code('src/app/(public)/writer/page.jsx');
const sitemap = code('src/app/sitemap.js');
const reads = code('src/lib/writers/writerReads.js');

// ── reserved paths ──────────────────────────────────────────────────────────

test('`writer` cannot be taken by a page', () => {
  assert.ok(RESERVED_SLUGS.includes('writer'));
  assert.equal(isReservedSlug('Writer'), true);
});

test('`writer` cannot be taken by a course alias', () => {
  assert.deepEqual(reservedPathOwner('/writer/someone'), { segment: 'writer', source: 'tree' });
});

// ── sitemap ─────────────────────────────────────────────────────────────────

test('the sitemap lists /writer as a static route', () => {
  assert.match(sitemap, /STATIC_ROUTES = \[[\s\S]*?'\/writer',[\s\S]*?\];/);
});

test('the sitemap lists the writers from the read /writer renders', () => {
  assert.match(sitemap, /writerSitemapEntries\(await readPublicWriters\(\), base\)/);
  assert.match(list, /await readPublicWriters\(\)/);
});

test('the writers reach the returned array', () => {
  assert.match(sitemap, /return \[[^\]]*\.\.\.writerEntries\]/);
});

test('the writer block is best-effort', () => {
  assert.match(sitemap, /try \{\s*writerEntries = [\s\S]*?\} catch \{/);
});

test('the articles limit is untouched', () => {
  assert.match(sitemap, /Article\.find\(\{ active: true \}\)[\s\S]*?\.limit\(500\)/);
});

// ── the public predicate ────────────────────────────────────────────────────

test('published means what /articles asks for', () => {
  assert.deepEqual({ ...PUBLIC_ARTICLE_FILTER }, { active: true });
  assert.match(code('src/app/(public)/articles/page.jsx'), /getArticles\(\{\s*active: true,/);
});

test('the list count and the profile list both use it', () => {
  assert.match(reads, /writerArticleCountPipeline\([^;]*PUBLIC_ARTICLE_FILTER\)/);
  assert.match(profile, /\.\.\.PUBLIC_ARTICLE_FILTER,\s*writer: writer\._id,/);
});

test('the count pipeline narrows both on the filter and the writer', () => {
  assert.deepEqual(writerArticleCountPipeline(['a'], { active: true })[0], {
    $match: { active: true, writerIds: { $in: ['a'] } },
  });
});

test('getArticles filters by writer', () => {
  assert.match(code('src/lib/actions/articles.js'), /if \(writer\)\s+filter\.writerIds\s+= String\(writer\);/);
});

// ── the profile route ───────────────────────────────────────────────────────

test('the route acts on the decision: 404, then 308, before any other read', () => {
  const action = profile.indexOf("if (action === 'not-found') notFound();");
  const redirect = profile.indexOf("if (action === 'redirect') permanentRedirect(DEFAULT_WRITER_PATH);");
  const articles = profile.indexOf('getArticles({');
  assert.ok(action !== -1 && action < redirect && redirect < articles);
});

test('both are outside any try block: they work by throwing', () => {
  const page = profile.slice(profile.indexOf('export default'));
  assert.equal(page.includes('try {'), false);
});

test('a bad or out-of-range page is a 404', () => {
  assert.match(profile, /parseProfilePage\(\(await searchParams\)\?\.page\);\s*if \(page === null\) notFound\(\);/);
  assert.match(profile, /if \(!isProfilePageInRange\(page, total\)\) notFound\(\);/);
});

test('the page is read from the URL, with no state of its own', () => {
  assert.equal(/useState|useSearchParams/.test(profile), false);
});

test('the route says what it is: per request, with no inert revalidate', () => {
  assert.match(profile, /export const dynamic = 'force-dynamic';/);
  assert.equal(/export const revalidate/.test(profile), false);
});

test('/writer takes the article page revalidate', () => {
  assert.match(list, /export const revalidate = 3600;/);
  assert.match(code('src/app/(public)/articles/[slug]/page.jsx'), /export const revalidate = 3600;/);
});

test('both pages have a canonical', () => {
  assert.match(list, /alternates: \{ canonical: PAGE_URL \}/);
  assert.match(profile, /alternates: \{ canonical: url \}/);
});

test('the root template adds the brand once, and the description is capped', () => {
  assert.match(code('src/app/layout.jsx'), /template: `%s \| \$\{siteConfig\.name\}`/);
  assert.match(profile, /const title = writer\.displayName;/);
  assert.match(profile, /truncateForMeta\(writer\.bio \|\| writer\.role, META_DESCRIPTION_LENGTH\)/);
  assert.match(profile, /META_DESCRIPTION_LENGTH = 155/);
});

test('both JSON-LD blocks go through the safe serialiser', () => {
  assert.equal((profile.match(/serializeJsonLd\(build/g) ?? []).length, 2);
  assert.equal(profile.includes('JSON.stringify'), false);
});

test('expertise uses the data /about-us uses', () => {
  assert.match(profile, /buildInstructorCards\(\[instructor\]\)/);
  assert.match(profile, /matchOnlineCourses\(online\.items, instructor\.name_en\)/);
});

test('the grid is the shared card', () => {
  assert.match(profile, /<ArticleCard /);
});

test('the profile projection carries what ArticleCard reads', () => {
  for (const field of ['writerIds', 'isPinnedOnArticlePage', 'showPinBadge', 'coverUrl']) {
    assert.ok(WRITER_ARTICLE_CARD_FIELDS.split(' ').includes(field), field);
  }
});

// ── card bylines ────────────────────────────────────────────────────────────

test('every card projection carries writerIds', () => {
  assert.ok(PROGRAM_ARTICLE_CARD_FIELDS.split(' ').includes('writerIds'));
  assert.ok(PUBLIC_LIST_FIELDS.split(' ').includes('writerIds'));
  assert.match(code('src/lib/actions/articles.js'), /\.select\('slug title excerpt coverUrl tags articleType publishedAt programs skills writerIds'\)/);
});

for (const [rel, n] of [
  ['src/app/page.jsx', 1],
  ['src/app/(public)/articles/page.jsx', 1],
  ['src/app/(public)/program/[slug]/page.jsx', 1],
  ['src/app/(public)/skill/[slug]/page.jsx', 1],
  ['src/app/(public)/[...slug]/page.jsx', 2],
  ['src/app/(public)/writer/[slug]/page.jsx', 1],
]) {
  test(`${rel} resolves card writers in one batched read per list`, () => {
    assert.equal((code(rel).match(/withCardWriters\(/g) ?? []).length + (code(rel).match(/\.then\(withCardWriters\)/g) ?? []).length, n);
  });
}

test('the batch is one Writer query, outside any per-article loop', () => {
  const body = reads.slice(reads.indexOf('export async function withCardWriters('), reads.indexOf('export async function readPublicWriters('));
  assert.equal((body.match(/Writer\.find\(/g) ?? []).length, 1);
  assert.ok(body.indexOf('Writer.find(') < body.indexOf('list.map((article) => ({ ...article, writers: orderWriters('));
});

test('both cards render the shared byline, and /articles passes the resolved list', () => {
  assert.match(code('src/components/articles/ArticleCard.jsx'), /<ArticleCardByline writers=\{article\.writers\} \/>/);
  assert.match(code('src/app/_components/home/BlogSection.jsx'), /<ArticleCardByline writers=\{blog\.writers\} \/>/);
  assert.match(code('src/app/(public)/articles/page.jsx'), /articles=\{cards\}/);
});

// ── the article page ────────────────────────────────────────────────────────

test('the reading time left the excerpt block for the byline', () => {
  const detail = code('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx');
  assert.match(detail, /<ArticleByline writers=\{writers\} author=\{article\.author\} minutes=\{minutes\} \/>/);
  assert.equal(detail.includes('{minutes} นาที'), false);
});

// ── admin ───────────────────────────────────────────────────────────────────

test('ดูหน้าโปรไฟล์ opens the profile in a new tab, and only for an active writer', () => {
  const form = code('src/app/admin/writers/_components/WriterForm.jsx');
  assert.match(form, /\{editing && isActive \? \(\s*<a\s+href=\{writerPath\(writer\.slug\)\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(form, /disabled\s+data-testid="writer-view-profile"\s+title=\{editing \? /);
});

test('both toggles go through the deactivation flow, not a bare confirm', () => {
  for (const rel of [
    'src/app/admin/writers/_components/WriterForm.jsx',
    'src/app/admin/writers/_components/WritersAdminClient.jsx',
  ]) {
    const text = code(rel);
    assert.match(text, /beginDeactivation\(/, rel);
    assert.match(text, /\{dialog\}/, rel);
    assert.equal(text.includes('window.confirm'), false, rel);
  }
});
