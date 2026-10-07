import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walkSources } from '../sourceScan.mjs';

/**
 * No page under src/app/(public) hands Next a plain-string `title` that already
 * ends in the brand.
 *
 * The root layout's template is `%s | 9Expert Training` (src/app/layout.jsx),
 * so a plain string ending in `| 9Expert Training` ships as
 * `X | 9Expert Training | 9Expert Training`. Measured live 2026-10-07: /social,
 * /promotions, /search, /career-path-project, three in-house registration
 * steps and every MSDB promotion detail page.
 *
 * WHAT COUNTS AS A SUFFIX: the LAST separator-delimited segment ends in
 * `9Expert` / `9Expert Training` (or `${siteConfig.name}`). That catches
 * `X | 9Expert Training`, `X - 9Expert Training` and `X | โปรโมชัน 9Expert
 * Training`, and deliberately not a name with the brand inside it and no
 * separator — `โรงแรมและร้านอาหารใกล้ 9Expert Training` is a page name, a
 * separate decision.
 *
 * WHAT IS SCANNED: string/template literals that are the value of a `title:`
 * key, or that appear on the right of `const|let title =` (the program/skill
 * fallback shape: `config?.metaTitle?.trim() || \`… | 9Expert Training\``).
 *
 * EXEMPT: `title: { absolute: … }` (the template does not apply), and `title:`
 * inside an `openGraph` / `twitter` object (no template applies there either,
 * and og:title is its own decision).
 */

const ROOT = 'src/app/(public)';
const BRAND_TOKEN = '${siteConfig.name}';
const SEP = /\s[|\-–—·]\s/;

/** The literal ends in a brand suffix, per the rule above. */
function endsInBrandSuffix(body) {
  const text = body.split(BRAND_TOKEN).join('9Expert Training').trim();
  if (!SEP.test(text)) return false;
  const last = text.split(SEP).pop();
  return /9\s?Expert(\s+Training)?$/i.test(last.trim());
}

// A FACTORY, not a shared /g regex: exec() leaves lastIndex set and matchAll()
// copies it, so one shared instance silently skipped the `const title =` scan.
const literal = () => /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Name of the object key that owns the `{` enclosing `index`, if any. */
function enclosingKey(code, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = code[i];
    if (c === '}') depth += 1;
    else if (c === '{') {
      if (depth === 0) return code.slice(Math.max(0, i - 40), i).match(/(\w+)\s*:\s*$/)?.[1] ?? null;
      depth -= 1;
    }
  }
  return null;
}

/** Every brand-suffixed title literal in one file's scrubbed code. */
function offenders(code) {
  const out = [];

  for (const m of code.matchAll(/\btitle\s*:\s*(?=['"`])/g)) {
    const start = m.index + m[0].length;
    const re = literal();
    re.lastIndex = start;
    const lit = re.exec(code);
    if (!lit || lit.index !== start) continue;
    if (['openGraph', 'twitter'].includes(enclosingKey(code, m.index))) continue;
    if (endsInBrandSuffix(lit[2])) out.push({ value: lit[2] });
  }

  for (const m of code.matchAll(/\b(?:const|let|var)\s+title\s*=([^;]*);/g)) {
    for (const lit of m[1].matchAll(literal())) {
      if (endsInBrandSuffix(lit[2])) out.push({ value: lit[2] });
    }
  }
  return out;
}

const FILES = walkSources(ROOT);

test('the scan reaches the public tree — not zero files', () => {
  assert.ok(FILES.length > 50, `only ${FILES.length} files under ${ROOT}`);
  assert.ok(FILES.some((f) => f.rel === `${ROOT}/social/page.jsx`), 'social/page.jsx not scanned');
});

test('no plain-string page title under src/app/(public) ends in a brand suffix', () => {
  // Lines come from the RAW file: scrubbing collapses comments and shifts them.
  const rawLine = (f, value) => {
    const i = f.raw.indexOf(value);
    return i < 0 ? '?' : f.raw.slice(0, i).split('\n').length;
  };
  const found = FILES.flatMap((f) =>
    offenders(f.code).map((o) => `${f.rel}:${rawLine(f, o.value)} ${JSON.stringify(o.value)}`));
  assert.deepEqual(found, [], `the root template appends the brand again:\n  ${found.join('\n  ')}`);
});

test('CONTROL: each shape that shipped doubled is caught', () => {
  for (const planted of [
    "export const metadata = { title: 'Social Channels | 9Expert Training' };",
    "export const metadata = { title: 'สมัครอบรม - 9Expert Training' };",
    'const title = config?.meta_title?.trim() || `${promotion.title} | โปรโมชัน 9Expert Training`;',
    'const title = config?.metaTitle?.trim() || `${skill.skill_name} | 9Expert Training`;',
    'export const metadata = { title: `ค้นหา | ${siteConfig.name}` };',
    "export const metadata = { title: 'X | 9Expert' };",
  ]) {
    assert.equal(offenders(planted).length, 1, `not caught: ${planted}`);
  }
});

/**
 * The other half, for the three fallback branches c0cca407 changed: their
 * `<title>` lost its literal brand (the template appends it), but og:title gets
 * NO template — so each builds `shareTitle = \`${title} | ${siteConfig.name}\``
 * and hands THAT to openGraph. The og:title then ends with the brand exactly
 * once: once from shareTitle, none from `title` (checked by the guard above).
 */
const OG_FALLBACKS = [
  'src/app/(public)/promotions/[slug]/page.jsx',
  'src/app/(public)/program/[slug]/page.jsx',
  'src/app/(public)/skill/[slug]/page.jsx',
];

/** The openGraph / twitter `title:` values in the LAST generateMetadata return. */
function shareTitleWiring(code) {
  const gm = code.indexOf('export async function generateMetadata');
  const next = code.indexOf('\nexport ', gm + 1);
  const body = code.slice(gm, next < 0 ? code.length : next);
  const share = body.match(/const shareTitle\s*=\s*(`[^`]*`)\s*;/)?.[1] ?? null;
  const ret = body.slice(body.lastIndexOf('return {'));
  const ogTitles = [...ret.matchAll(/\b(openGraph|twitter)\s*:\s*\{[^}]*?\btitle\s*(?::\s*([\w.]+))?\s*,/g)]
    .map((m) => ({ key: m[1], value: m[2] ?? 'title' }));
  return { share, ogTitles };
}

for (const rel of OG_FALLBACKS) {
  test(`${rel} — fallback og:title ends with the brand exactly once`, () => {
    const file = FILES.find((f) => f.rel === rel);
    assert.ok(file, `${rel} not scanned`);
    const { share, ogTitles } = shareTitleWiring(file.code);
    assert.equal(share, '`${title} | ${siteConfig.name}`', `shareTitle is not title + brand: ${share}`);
    assert.ok(ogTitles.length >= 1, 'no openGraph title in the fallback return');
    for (const { key, value } of ogTitles) {
      assert.equal(value, 'shareTitle', `${key}.title is \`${value}\`, not shareTitle — og:title would lack the brand`);
    }
    // and `title` itself carries no brand, so shareTitle's is the only one
    assert.deepEqual(offenders(file.code), []);
    assert.match(file.withImports, /import \{ siteConfig \} from ['"]@\/config\/site['"]/);
  });
}

test('CONTROL: the og wiring check notices og:title left on the bare title', () => {
  const bare = "export async function generateMetadata() { const title = 'X'; " +
    "const shareTitle = `${title} | ${siteConfig.name}`; return { title, openGraph: { title, description } }; }";
  assert.deepEqual(shareTitleWiring(bare).ogTitles, [{ key: 'openGraph', value: 'title' }]);
  const wired = bare.replace('openGraph: { title,', 'openGraph: { title: shareTitle,');
  assert.deepEqual(shareTitleWiring(wired).ogTitles, [{ key: 'openGraph', value: 'shareTitle' }]);
});

test('CONTROL: absolute titles, og/twitter titles and brand-inside-the-name are exempt', () => {
  for (const allowed of [
    "export const metadata = { title: { absolute: 'X | 9Expert Training' } };",
    "export const metadata = { title: 'X', openGraph: { title: 'X | 9Expert Training' } };",
    "export const metadata = { title: 'X', twitter: { card: 'c', title: 'X | 9Expert Training' } };",
    "export const metadata = { title: 'โรงแรมและร้านอาหารใกล้ 9Expert Training' };",
    "export const metadata = { title: 'Social Channels' };",
    'const title = `${promotion.title} | โปรโมชัน`;',
  ]) {
    assert.deepEqual(offenders(allowed), [], `wrongly flagged: ${allowed}`);
  }
});
