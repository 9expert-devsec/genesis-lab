import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Both routes that mount SkillPageClient hand it `onlineCourses`, and both
 * read it through getOnlineCourses filtered by `skill`.
 *
 * SkillPageClient defaults `onlineCourses = []`, so a mount that forgets the
 * prop renders the page without the section and nothing throws — the quiet
 * failure programSectionPropsThreading guards on the program side. The two
 * mounts are named here rather than derived: /skill/[slug] redirects for every
 * skill with a custom urlSlug (all 8 configs, 2026-10-07), so it is the one
 * that gets missed.
 */

const MOUNTS = [
  'src/app/(public)/[...slug]/page.jsx',
  'src/app/(public)/skill/[slug]/page.jsx',
];

const scrub = (raw) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** The attribute text of every `<SkillPageClient …>` in the source. */
function mounts(code) {
  const out = [];
  const re = /<SkillPageClient(?=[\s/>])/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    out.push(code.slice(m.index, i + 1));
  }
  return out;
}

for (const rel of MOUNTS) {
  const code = scrub(readFileSync(rel, 'utf8'));

  test(`${rel} — every <SkillPageClient> mount passes onlineCourses`, () => {
    const found = mounts(code);
    assert.ok(found.length >= 1, `no SkillPageClient mount found in ${rel}`);
    for (const attrs of found) {
      assert.match(attrs, /\bonlineCourses=\{/, `mount without onlineCourses: ${attrs.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  });

  test(`${rel} — reads online courses by the skill short code`, () => {
    assert.match(code, /getOnlineCourses\(\{\s*skill:\s*skillRefId\(skill\)\s*\}\)/);
  });
}

test('CONTROL: the mount matcher notices a missing prop', () => {
  const [attrs] = mounts('<SkillPageClient skill={s} faqs={f} articles={a} />');
  assert.equal(/\bonlineCourses=\{/.test(attrs), false);
  const [ok] = mounts('<SkillPageClient skill={s} onlineCourses={o} />');
  assert.equal(/\bonlineCourses=\{/.test(ok), true);
});
