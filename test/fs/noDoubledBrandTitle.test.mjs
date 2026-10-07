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
