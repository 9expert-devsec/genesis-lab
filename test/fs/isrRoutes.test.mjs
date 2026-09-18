// Public routes that are served from the ISR cache stay that way.
//
// A `[param]` segment is an ISR route only when it DECLARES generateStaticParams
// (an empty list is enough — it registers the route in prerender-manifest's
// dynamicRoutes; without it the exported `revalidate` is inert and Vercel runs
// a function per request, MEASURED 2026-09-18). And any route — static or
// [param] — falls back to per-request rendering the moment something in its
// tree reads `searchParams`, `cookies()`, `headers()`, `draftMode()`,
// `connection()` or `unstable_noStore`. Neither failure prints a warning; the
// build glyph stays ƒ either way. These guards are what would say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, blankStringBodies } from '../sourceScan.mjs';

/** page: the segment file; tree: every source under it; revalidate: the exported window. */
const ROUTES = [
  { path: '/articles/[slug]', page: 'src/app/(public)/articles/[slug]/page.jsx', tree: ['src/app/(public)/articles/[slug]'], revalidate: 3600, param: true },
  { path: '/faq', page: 'src/app/(public)/faq/page.jsx', tree: ['src/app/(public)/faq'], revalidate: 3600, param: false },
  { path: '/masterclass', page: 'src/app/(public)/masterclass/page.jsx', tree: ['src/app/(public)/masterclass/page.jsx', 'src/app/(public)/masterclass/_components'], revalidate: 3600, param: false },
  // `[slug]/register` is its own force-dynamic route (it reads searchParams) and is
  // deliberately NOT in this tree; only the detail page and its components are.
  { path: '/masterclass/[slug]', page: 'src/app/(public)/masterclass/[slug]/page.jsx', tree: ['src/app/(public)/masterclass/[slug]/page.jsx', 'src/app/(public)/masterclass/[slug]/_components'], revalidate: 3600, param: true },
];

/** Every writer of masterclass BATCH state (paid seat, freed seat) must bust the public pages. */
const SEAT_WRITERS = [
  'src/app/api/masterclass/register/charge/route.js',
  'src/app/api/webhooks/omise/route.js',
  'src/lib/actions/masterclass-registrations.js',
];

/** The chrome every (public) page renders — a dynamic read here defeats every route above. */
const SHARED_CHROME = [
  'src/app/(public)/layout.jsx',
  'src/app/layout.jsx',
  'src/components/layout',
  'src/components/notifications',
];

const GSP_EMPTY = /export\s+(?:async\s+)?function\s+generateStaticParams\s*\(\s*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/;
/** Server-side dynamic reads (code view). `useSearchParams` is the client hook and is handled separately. */
const DYNAMIC_READ = /\bawait\s+searchParams\b|\bsearchParams\s*\}|\bcookies\(\)|\bheaders\(\)|\bdraftMode\(\)|\bconnection\(\)|\bunstable_noStore\b|\bnoStore\(\)/;
const HEADERS_IMPORT = /from\s+['"]next\/headers['"]/;

function sourcesUnder(rel) {
  return rel.endsWith('.jsx') || rel.endsWith('.js') ? [readSource(rel)] : walkSources(rel);
}

for (const r of ROUTES) {
  test(`${r.path}: exports revalidate = ${r.revalidate}, no force-dynamic${r.param ? ', and an EMPTY generateStaticParams' : ''}`, () => {
    const code = blankStringBodies(readSource(r.page).code);
    assert.match(code, new RegExp(`export const revalidate\\s*=\\s*${r.revalidate}\\b`));
    assert.doesNotMatch(code, /export const dynamic\s*=\s*'force-dynamic'/, 'force-dynamic would make the revalidate inert');
    if (r.param) assert.match(code, GSP_EMPTY, 'a [param] route needs generateStaticParams() { return [] } to be an ISR route at all');
    else assert.doesNotMatch(code, /generateStaticParams/, 'a static route has nothing to enumerate');
  });

  test(`${r.path}: nothing in its tree reads searchParams / cookies / headers / draftMode on the server`, () => {
    const files = r.tree.flatMap(sourcesUnder);
    assert.ok(files.length >= 1, 'the tree has files');
    for (const f of files) {
      const code = blankStringBodies(f.code);
      const hit = code.match(DYNAMIC_READ);
      assert.equal(hit, null, `${f.rel} reads a dynamic API: ${hit?.[0]} — the route silently becomes per-request`);
      assert.doesNotMatch(f.withImports, HEADERS_IMPORT, `${f.rel} imports next/headers`);
      // The client hook is allowed only under a Suspense boundary in the same
      // file: the static HTML then carries the fallback and the shell stays cached.
      if (/\buseSearchParams\(\)/.test(code)) {
        assert.match(code, /<Suspense\b/, `${f.rel} calls useSearchParams() without a Suspense boundary — the whole route would bail to client rendering`);
      }
    }
  });
}

test('article revalidation encodes the slug the way Next keys the cache (Thai slugs)', () => {
  // The cache entry's implicit tag is `_N_T_` + the request's URL.pathname —
  // percent-encoded. MEASURED 2026-09-18: a Thai article's .meta carried
  // `_N_T_/articles/claude-fable-5-1-%E0%B8%84…` while bustCaches passed the
  // raw slug, so admin saves refreshed nothing. Both call sites must go
  // through the encoding helper, and the helper must match URL.pathname.
  const { code } = readSource('src/lib/actions/articles.js');
  assert.match(code, /function publicArticlePath\(slug\) \{\s*return `\$\{PUBLIC_PATH\}\/\$\{encodeURIComponent\(slug\)\}`;/);
  const rawSites = code.match(/revalidatePath\(`\$\{PUBLIC_PATH\}\/\$\{[^}]+\}`\)/g) || [];
  assert.deepEqual(rawSites, [], `a public article path is revalidated without encoding: ${rawSites.join(' ')}`);
  const viaHelper = (code.match(/revalidatePath\(publicArticlePath\((slug|previous\.slug)\)\)/g) || []).length;
  assert.equal(viaHelper, 2, 'both the current slug (bustCaches) and the previous slug (rename) go through the helper');

  for (const slug of ['claude-fable-5-1-คืออะไร', 'python-for-multi-agent-ai-system-automation', "a-b_c.d~e", "x(y)!z"]) {
    const helper = `/articles/${encodeURIComponent(slug)}`;
    const nextKeysOn = new URL(`http://x/articles/${slug}`).pathname;
    assert.equal(helper, nextKeysOn, `${slug}: helper and URL.pathname diverge`);
  }
});

test('every masterclass seat writer busts the public pages after it moves registered_count', () => {
  for (const rel of SEAT_WRITERS) {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /from\s+'@\/lib\/masterclass\/revalidatePublic'/, `${rel} does not import revalidateMasterclassPublic`);
    const incs = (code.match(/registered_count:\s*-?1/g) || []).length;
    assert.ok(incs >= 1, `${rel} no longer moves registered_count — is it still a seat writer?`);
    const calls = (code.match(/await revalidateMasterclassPublic\(doc\.course_id\)/g) || []).length;
    assert.equal(calls, incs, `${rel}: ${incs} registered_count write(s) but ${calls} public revalidation(s)`);
  }
});

test('revalidateMasterclassPublic busts the listing and the slug, and never throws', () => {
  const { code, withImports } = readSource('src/lib/masterclass/revalidatePublic.js');
  assert.match(withImports, /from 'next\/cache'/);
  assert.match(code, /revalidatePath\(PUBLIC_LISTING\)/);
  assert.match(code, /revalidatePath\(`\$\{PUBLIC_LISTING\}\/\$\{course\.slug\}`\)/);
  assert.match(code, /PUBLIC_LISTING = '\/masterclass'/);
  assert.match(code, /try \{[\s\S]*\} catch \(err\) \{[\s\S]*console\.warn/, 'a missed revalidation must not fail a payment route');
});

test('the shared (public) chrome reads no dynamic API — one call there would defeat every ISR route', () => {
  const files = SHARED_CHROME.flatMap(sourcesUnder);
  assert.ok(files.length >= 5, 'the chrome walk found files');
  for (const f of files) {
    const code = blankStringBodies(f.code);
    const hit = code.match(DYNAMIC_READ);
    assert.equal(hit, null, `${f.rel} reads a dynamic API: ${hit?.[0]}`);
    assert.doesNotMatch(f.withImports, HEADERS_IMPORT, `${f.rel} imports next/headers`);
  }
});

test('CONTROL: the matchers fire on each forbidden shape and not on the allowed ones', () => {
  for (const s of [
    'const sp = await searchParams;',
    'export default async function Page({ params, searchParams }) {',
    'const jar = await cookies();',
    'const h = await headers();',
    'const { isEnabled } = await draftMode();',
    'await connection();',
    'unstable_noStore();',
  ]) assert.ok(DYNAMIC_READ.test(s), `should fire: ${s}`);
  for (const s of [
    'const { slug } = await params;',
    'const searchParams = useSearchParams();',
    "res.headers.get('x-pathname')",
    'const h = await fetchWithTimeout(url, { headers: { accept: "json" } });',
  ]) assert.ok(!DYNAMIC_READ.test(s), `should not fire: ${s}`);
  assert.ok(GSP_EMPTY.test('export function generateStaticParams() {\n  return [];\n}'));
  assert.ok(GSP_EMPTY.test('export async function generateStaticParams(){ return [] }'));
  assert.ok(!GSP_EMPTY.test('export function generateStaticParams() { return slugs.map((s) => ({ slug: s })); }'), 'an enumerating declaration is a different route shape');
  assert.ok(HEADERS_IMPORT.test("import { headers } from 'next/headers';"));
  assert.ok(!HEADERS_IMPORT.test("import { NextResponse } from 'next/server';"));
});
