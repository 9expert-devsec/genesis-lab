import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walkSources } from '../sourceScan.mjs';

/**
 * Every route that mounts `ProgramPageClient` must supply the props its new
 * sections read.
 *
 * ── THE DEFECT CLASS, WHICH THIS REPO HAS ALREADY PAID FOR ─────────────────
 * `currentYear`, 2026-08-13: two of four mounts in ONE file were threaded and
 * 35 catalogue pages went down. `skillSlugs` is the same shape a second time,
 * and its guard (test/fs/skillSlugsThreading) is this file's model.
 *
 * ProgramPageClient has TWO mounts in two different files, and the newer one is
 * the easy one to miss — `program/[slug]/page.jsx` redirects to the custom slug
 * for all 27 published configs (audit 7a98eb3 §0), so it is live code that
 * almost never executes. A missing prop there would not 500 and would not log:
 * the component defaults `onlineCourses = []` / `articles = []`, so the section
 * simply would not render, on a route nobody looks at. That is the quietest
 * possible failure and exactly why the default exists AND why this guard does.
 *
 * ── ROOTED ON FILE PATHS, RESOLVED THROUGH IMPORT MAPS ─────────────────────
 * Membership is never decided by the name `ProgramPageClient`. Each candidate
 * file's own import map is read and the mount counts only if that name resolves
 * to THIS module. A file importing a same-named component from elsewhere
 * contributes nothing — the mistake this repo made twice with the two
 * `CourseCard` files and the two `CourseCarousel` files.
 *
 * ── WHAT THIS CANNOT SEE ───────────────────────────────────────────────────
 * That the prop holds anything. `onlineCourses={[]}` satisfies every assertion
 * here and renders no section — which is a legitimate state (14 of 27 programs
 * genuinely have no online courses), so it cannot be an error. The render tier
 * covers what the section does with rows; this file covers only the wiring.
 */

const OWNER = 'src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx';
const COMPONENT = 'ProgramPageClient';

/**
 * The props the new sections depend on. ONE ENTRY PER SECTION, added in the
 * same commit as the section — a name listed here before the prop exists turns
 * the guard red for the whole repo, and a section shipped without adding its
 * name here is exactly the hole this file is for.
 */
const REQUIRED_PROPS = ['onlineCourses', 'articles', 'programNames', 'skillNames'];

/**
 * Line-preserving comment blanking — this guard reports `file:line`, and the
 * canonical scrubber collapses a block comment to a single space, which would
 * report a mount dozens of lines away from where it really is. Same reasoning
 * and same shape as skillSlugsThreading's.
 */
function blankComments(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** Every JSX mount of `<Name …>` with its full attribute list and true line. */
function mountsOf(text, name) {
  const out = [];
  const re = new RegExp(`<${name}(?=[\\s/>])`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    // Brace-aware: a `>` inside `{cond ? <a/> : <b/>}` does not end the tag.
    let i = m.index + m[0].length;
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    out.push({ attrs: text.slice(m.index, i + 1), line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

const FILES = walkSources('src').map((f) => ({ ...f, scan: blankComments(f.raw) }));
const BY_REL = new Map(FILES.map((f) => [f.rel, f]));

/** Resolve an import specifier to a repo-relative file (`@/` alias + Next exts). */
function resolveSpecifier(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) {
    const parts = fromRel.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    base = parts.join('/');
  } else return null;
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (BY_REL.has(cand)) return cand;
  }
  return null;
}

/** Which file each imported NAME in this module actually comes from. */
function importMap(file) {
  const out = new Map();
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(file.withImports ?? file.raw)) !== null) {
    const rel = resolveSpecifier(file.rel, m[2]);
    if (!rel) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.set(name, rel);
    }
  }
  return out;
}
const IMPORTS = new Map(FILES.map((f) => [f.rel, importMap(f)]));

/**
 * The class: every (file, mount) pair where the mounted name resolves to OWNER.
 * Derived, not listed — a third route added tomorrow joins without an edit here.
 */
function mountSites() {
  const sites = [];
  for (const f of FILES) {
    if (IMPORTS.get(f.rel)?.get(COMPONENT) !== OWNER) continue;
    for (const mount of mountsOf(f.scan, COMPONENT)) {
      sites.push({ rel: f.rel, line: mount.line, attrs: mount.attrs });
    }
  }
  return sites;
}

const SITES = mountSites();

test('the owner module exists and exports the component the class is rooted on', () => {
  const owner = BY_REL.get(OWNER);
  assert.ok(owner, `${OWNER} not found — the guard is rooted on a path that moved`);
  assert.match(owner.raw, new RegExp(`export function ${COMPONENT}\\b`));
});

test('the class is DERIVED and finds both known mounts — not one, not zero', () => {
  assert.ok(
    SITES.length >= 2,
    `expected at least the two known mounts, found ${SITES.length}: ` +
      SITES.map((s) => `${s.rel}:${s.line}`).join(', ')
  );
  const files = new Set(SITES.map((s) => s.rel));
  assert.ok(
    files.has('src/app/(public)/[...slug]/page.jsx'),
    'the catch-all route mount was not found — the scanner is broken'
  );
  assert.ok(
    files.has('src/app/(public)/program/[slug]/page.jsx'),
    'the /program/[slug] mount was not found — this is the one that gets missed'
  );
});

/**
 * ONE TEST PER PROP PER SITE, not one test asserting over a loop.
 *
 * The separation is the requirement, not a style choice: a single looping test
 * fails with whichever site it reaches first, so removing the prop from
 * /program/[slug] and removing it from [...slug] produce the SAME red. Naming
 * the site in the test title means the failure says which mount regressed
 * before anyone opens the diff.
 */
for (const site of SITES) {
  for (const prop of REQUIRED_PROPS) {
    test(`${site.rel}:${site.line} — <${COMPONENT}> supplies \`${prop}\``, () => {
      assert.match(
        site.attrs,
        new RegExp(`\\b${prop}=\\{`),
        `the <${COMPONENT}> mount at ${site.rel}:${site.line} does not pass \`${prop}\`. ` +
          `The component defaults it to [], so this route would render the page ` +
          `WITHOUT that section and nothing would throw or log. ` +
          `Attributes seen: ${site.attrs.replace(/\s+/g, ' ').slice(0, 300)}`
      );
    });
  }
}

test('CONTROL: the matcher rejects a mount that omits a prop, and names THAT site', () => {
  // A hand-built site standing in for one route regressing. If this passed, the
  // per-site assertions above would be satisfied by anything.
  const planted = {
    rel: 'src/app/(public)/program/[slug]/page.jsx',
    line: 62,
    attrs: '<ProgramPageClient program={program} faqs={faqs} skillSlugs={s} />',
  };
  for (const prop of REQUIRED_PROPS) {
    assert.equal(
      new RegExp(`\\b${prop}=\\{`).test(planted.attrs), false,
      `the matcher failed to notice a missing \`${prop}\``
    );
  }
  // And the inverse: a complete mount satisfies it, so the check is not
  // vacuously failing on everything. Built FROM `REQUIRED_PROPS` rather than
  // written out, so adding a section's prop to that list cannot leave this
  // control asserting against a stale fixture — which is exactly what happened
  // when the articles section added three names to it.
  const complete = `<ProgramPageClient ${REQUIRED_PROPS.map((p) => `${p}={x}`).join(' ')} />`;
  for (const prop of REQUIRED_PROPS) {
    assert.ok(new RegExp(`\\b${prop}=\\{`).test(complete), `false negative on \`${prop}\``);
  }
});

test('CONTROL: membership resolves through the IMPORT MAP, not the component name', () => {
  // A file mounting a same-named component from somewhere else must not join
  // the class. Proven against the real resolver rather than asserted.
  const decoy = {
    rel: 'src/app/(public)/decoy/page.jsx',
    withImports: `import { ${COMPONENT} } from '@/components/somewhere/else';`,
  };
  assert.notEqual(
    importMap(decoy).get(COMPONENT), OWNER,
    'a same-named component imported from elsewhere must not map to the owner'
  );
  // And the real routes DO resolve to the owner — so the negative above is
  // about resolution, not about the resolver failing on everything.
  for (const rel of [
    'src/app/(public)/[...slug]/page.jsx',
    'src/app/(public)/program/[slug]/page.jsx',
  ]) {
    assert.equal(IMPORTS.get(rel)?.get(COMPONENT), OWNER, `${rel} should resolve to the owner`);
  }
});

test('the component declares every required prop, so a threaded prop is actually read', () => {
  const owner = BY_REL.get(OWNER);
  const signature = owner.raw.slice(
    owner.raw.indexOf(`export function ${COMPONENT}`),
    owner.raw.indexOf('}) {')
  );
  for (const prop of REQUIRED_PROPS) {
    assert.match(
      signature,
      new RegExp(`\\b${prop}\\b`),
      `${COMPONENT} does not destructure \`${prop}\` — the routes would be passing it into nothing`
    );
  }
});
