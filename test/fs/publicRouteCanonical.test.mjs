import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * EVERY PUBLIC ROUTE DECLARES ITS OWN CANONICAL.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * Seven index pages — /training-course /schedule /promotions /articles
 * /masterclass /career-path-project /social — shipped
 * `<link rel="canonical" href="https://www.9experttraining.com"/>`: the
 * homepage. None set `alternates`, so each inherited the root layout's
 * `alternates.canonical: siteConfig.url`. A canonical naming a different URL
 * tells Google the page is a duplicate of it and need not be indexed on its
 * own — on the seven highest-value pages, the week the domain cut over. The
 * inventory that fixed them found 28 public routes without one, not seven.
 *
 * ── WHY THE ROUTE LIST COMES FROM THE FILESYSTEM ───────────────────────────
 * Nothing warned. test/fs/courseCanonicalWiring covers course detail pages
 * only, and a hand-written list here would pass forever while a new route
 * slipped past it. So the list is `src/app/(public)/**\/page.jsx` (plus the
 * root page), walked at test time: a new page.jsx is in the sweep the moment
 * it exists, and the only way out is the allow-list below, with a reason.
 *
 * ── WHAT IS CHECKED, AND WHAT CANNOT BE ────────────────────────────────────
 * Static routes (`export const metadata = {…}`): the metadata object must
 * carry `alternates: { canonical: … }` AND the canonical must name THIS
 * route's path — `${process.env.NEXT_PUBLIC_SITE_URL}/<route>`, the idiom the
 * neighbours use — so a neighbour's line pasted in unchanged goes red.
 *
 * Dynamic routes (`generateMetadata`): the value is computed from data, and a
 * source scan cannot evaluate it. What IS checked is the shape: every
 * non-empty `return {…}` object literal inside generateMetadata names
 * `alternates` with a `canonical`. NOT covered, said plainly: that the
 * computed URL is the page's own URL; a branch returning a variable rather
 * than a literal; `return {}`; and a return sitting directly inside an
 * `if (!x)` not-found guard (articles and masterclass return a bare title
 * there and the page then calls notFound(), so the metadata is never served
 * with a 200 — if that ever stops being true it is a different bug). The rendered value for
 * courses is pinned by test/render/courseCanonicalMetadata; the rest are
 * verified by curl after deploy, and that is the honest limit of this tier.
 *
 * Source is read with `readSource().code` — comments stripped — so a comment
 * that quotes the idiom cannot satisfy the check.
 */

const PUBLIC_DIR = path.join(ROOT, 'src', 'app', '(public)');

/**
 * Deliberately exempt routes, each with the reason. An exemption is a
 * decision someone wrote down, not a gap nobody noticed.
 */
const EXEMPT = new Map([
  ['/preview/[slug]',
    'robots noindex+nofollow; a canonical on a draft preview would hand crawlers a URL the page exists to hide'],
  ['/registration/bundle',
    'redirects unconditionally to /registration/bundle/step-1; its metadata is never served'],
  ['/registration/in-house',
    'redirects unconditionally to /registration/in-house/step-1; its metadata is never served'],
  ['/registration/public',
    'redirects unconditionally to /registration/public/step-1; its metadata is never served'],
  ['/registration/payment/complete',
    '"use client" page — Next forbids metadata exports from client components; a post-payment return URL (?registrationId=) whose indexing policy is its own round'],
  ['/masterclass/payment/complete',
    '"use client" page — same as /registration/payment/complete'],
]);

/** Every page.jsx under (public), as { route, rel }. */
function walkPages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkPages(full, out);
    else if (name === 'page.jsx') {
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      const route = '/' + path.relative(PUBLIC_DIR, path.dirname(full)).split(path.sep).join('/');
      out.push({ route: route === '/.' ? '/' : route, rel });
    }
  }
  return out;
}

const PAGES = walkPages(PUBLIC_DIR).sort((a, b) => a.route.localeCompare(b.route));

/** The text of the `{…}` starting at `open` (index of `{`), braces balanced. */
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(open, i + 1); }
  }
  return null;
}

/**
 * Classify one route's source. Returns { kind, problems[] } where kind is
 * 'static' | 'dynamic' | 'none' | 'client'.
 */
export function canonicalStatus(route, code) {
  const problems = [];
  if (/^\s*['"]use client['"]/.test(code)) return { kind: 'client', problems: ['a client component cannot export metadata'] };

  const staticAt = code.indexOf('export const metadata = {');
  const dynAt = code.search(/export (async )?function generateMetadata\s*\(/);

  if (staticAt >= 0) {
    const obj = balanced(code, code.indexOf('{', staticAt));
    if (!obj) return { kind: 'static', problems: ['metadata object is unbalanced'] };
    if (!/alternates\s*:\s*\{[^}]*canonical\s*:/.test(obj)) {
      problems.push('metadata has no alternates.canonical — it inherits the homepage from the root layout');
    } else {
      const expected = '`${process.env.NEXT_PUBLIC_SITE_URL}' + route + '`';
      if (!obj.includes('canonical: ' + expected)) {
        const got = obj.match(/canonical\s*:\s*([^,\n}]+)/)?.[1]?.trim() ?? '?';
        problems.push(`canonical is ${got}, expected ${expected} — a self-reference, in the idiom the neighbours use`);
      }
    }
    return { kind: 'static', problems };
  }

  if (dynAt >= 0) {
    const body = balanced(code, code.indexOf('{', code.indexOf(')', dynAt)));
    if (!body) return { kind: 'dynamic', problems: ['generateMetadata body is unbalanced'] };
    let n = 0;
    const re = /return\s*\{/g;
    let m;
    while ((m = re.exec(body))) {
      const lit = balanced(body, m.index + m[0].length - 1);
      if (!lit) { problems.push('a return literal is unbalanced'); continue; }
      if (/^\{\s*\}$/.test(lit)) continue; // `return {}` — the not-found branch
      // `if (!course) { const title = …; return {…} }` — a 404 stub.
      const lead = body.slice(Math.max(0, m.index - 240), m.index);
      if (/if\s*\(\s*!\w+(?:\??\.\w+)*\s*\)\s*\{?\s*(?:const [^;]*;\s*)*$/.test(lead)) continue;
      n += 1;
      // `alternates: { canonical: x }` or the shorthand `{ canonical }`.
      if (!/alternates\s*:\s*(\{[^}]*\bcanonical\b|\w)/.test(lit)) {
        problems.push(`generateMetadata return #${n} has no alternates.canonical`);
      }
    }
    if (n === 0) problems.push('generateMetadata returns no object literal this scan can read — verify by hand');
    return { kind: 'dynamic', problems };
  }

  return { kind: 'none', problems: ['no metadata export at all — inherits the homepage canonical from the root layout'] };
}

// ── the sweep ───────────────────────────────────────────────────────────────

test('the walk reaches the public route tree', () => {
  assert.ok(PAGES.length >= 40, `only ${PAGES.length} page.jsx found under (public)`);
  for (const r of ['/training-course', '/schedule', '/promotions', '/articles', '/masterclass', '/career-path-project', '/social', '/[...slug]']) {
    assert.ok(PAGES.some((p) => p.route === r), `${r} is not in the walk`);
  }
});

test('every public route declares a self-referencing canonical (or is exempt, with a reason)', () => {
  const offenders = [];
  for (const { route, rel } of PAGES) {
    if (EXEMPT.has(route)) continue;
    const { problems } = canonicalStatus(route, readSource(rel).code);
    if (problems.length) offenders.push(`${route} (${rel}): ${problems.join('; ')}`);
  }
  assert.deepEqual(offenders, [],
    'these public routes would ship with the homepage as their canonical:\n  ' + offenders.join('\n  '));
});

test('the seven audited index pages are STATIC and checked by value, not just by shape', () => {
  for (const r of ['/training-course', '/schedule', '/promotions', '/articles', '/masterclass', '/career-path-project', '/social']) {
    const { rel } = PAGES.find((p) => p.route === r);
    const { kind, problems } = canonicalStatus(r, readSource(rel).code);
    assert.equal(kind, 'static', `${r} is no longer a static metadata export — the value check above no longer applies to it`);
    assert.deepEqual(problems, [], r);
  }
});

test('the allow-list names routes that exist and really are what the reason says', () => {
  for (const [route, reason] of EXEMPT) {
    const page = PAGES.find((p) => p.route === route);
    assert.ok(page, `exempt route ${route} no longer exists — delete it from the list`);
    const { raw, code } = readSource(page.rel);
    if (/use client/.test(reason)) assert.match(code, /^\s*['"]use client['"]/, `${route} is no longer a client component`);
    if (/redirects unconditionally/.test(reason)) assert.match(code, /\bredirect\(`\/registration\//, `${route} no longer redirects`);
    if (/noindex/.test(reason)) assert.match(raw, /index:\s*false/, `${route} is no longer noindex`);
    assert.ok(reason.length > 20, `${route}: write the reason down`);
  }
});

test('the root page canonicalises to the site URL itself', () => {
  // Outside the (public) group, and the one page whose canonical IS the
  // homepage. Pinned so the layout default and the page agree.
  const code = readSource('src/app/page.jsx').code;
  assert.match(code, /canonical:\s*siteConfig\.url/);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: a static route with the line removed is named', () => {
  const rel = 'src/app/(public)/schedule/page.jsx';
  const code = readSource(rel).code.replace(/^\s*alternates: \{[^\n]*\n/m, '');
  assert.equal(code.includes('alternates'), false, 'the splice did not remove the line — this control is inert');
  const { problems } = canonicalStatus('/schedule', code);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no alternates\.canonical/);
});

test("CONTROL: a static route carrying a NEIGHBOUR's canonical is named", () => {
  const rel = 'src/app/(public)/schedule/page.jsx';
  const code = readSource(rel).code.replace('/schedule`', '/training-course`');
  const { problems } = canonicalStatus('/schedule', code);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /expected `\$\{process\.env\.NEXT_PUBLIC_SITE_URL\}\/schedule`/);
});

test('CONTROL: a dynamic route whose return literal drops alternates is named; `return {}` is not', () => {
  const rel = 'src/app/(public)/masterclass/[slug]/register/page.jsx';
  const good = readSource(rel).code;
  assert.deepEqual(canonicalStatus('/masterclass/[slug]/register', good).problems, []);
  const bad = good.replace(/^\s*alternates: \{[^\n]*\n/m, '');
  assert.match(canonicalStatus('/masterclass/[slug]/register', bad).problems[0], /return #1 has no alternates/);
  const withEmpty = good.replace('const course =', 'if (!slug) return {};\n  const course =');
  assert.deepEqual(canonicalStatus('/masterclass/[slug]/register', withEmpty).problems, [], 'an empty return {} must not count');
  const withStub = good.replace('const course =', "if (!slug) return { title: 'ไม่พบ' };\n  const course =");
  assert.deepEqual(canonicalStatus('/masterclass/[slug]/register', withStub).problems, [], 'a 404 stub behind if (!x) must not count');
  const shorthand = good.replace(/alternates: \{[^\n]*/, 'alternates: { canonical },');
  assert.deepEqual(canonicalStatus('/masterclass/[slug]/register', shorthand).problems, [], 'the { canonical } shorthand is accepted');
});

test('CONTROL: a route with no metadata at all is named, and a client page is classified as such', () => {
  assert.match(canonicalStatus('/x', 'export default function Page() { return null; }').problems[0], /no metadata export at all/);
  assert.equal(canonicalStatus('/x', "'use client';\nexport default function Page() {}").kind, 'client');
});
