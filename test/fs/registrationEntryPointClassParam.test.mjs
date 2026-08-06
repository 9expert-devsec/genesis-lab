import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The invariant the "skip the confirm step" behaviour rests on.
 *
 * StepForm reveals the form immediately when ?class= is present, on the premise
 * that every ROUND-SPECIFIC entry point appends it and only the generic hero CTA
 * omits it. If a round-specific link ever drops `&class=`, nothing breaks
 * loudly — the user just silently gets the old extra click back on that path.
 * That is exactly the kind of regression no one notices, so the split is pinned
 * here file by file.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// Every link builder that targets the public wizard, and whether the user has
// chosen a round by the time they follow it.
const ROUND_SPECIFIC = [
  ['src/app/(public)/[...slug]/_components/ScheduleSection.jsx', 'detail-page "ลงทะเบียนรอบที่เลือก"'],
  ['src/app/(public)/[...slug]/_components/EarlyBirdBanner.jsx', 'early-bird banner'],
  ['src/app/(public)/schedule/_components/ScheduleClient.jsx', '/schedule rows'],
  ['src/app/(public)/search/_components/SearchClient.jsx', 'search results'],
  ['src/app/(public)/training-course/_components/CourseCard.jsx', 'catalog card rounds'],
  ['src/components/pageBuilder/sections/course_schedule.jsx', 'page-builder schedule section'],
];

const GENERIC = [
  ['src/app/(public)/[...slug]/_components/CourseHero.jsx', 'hero "ขอใบเสนอราคา Public"'],
];

// Any `/registration/public?course=…` template literal, up to the closing quote.
const LINKS = /`\/registration\/public\?course=\$\{[\s\S]*?`/g;

for (const [file, what] of ROUND_SPECIFIC) {
  test(`${what} still passes &class=`, () => {
    const links = [...read(file).matchAll(LINKS)].map((m) => m[0]);
    assert.ok(links.length > 0, 'the link builder is still in this file');
    for (const link of links) {
      assert.ok(link.includes('&class=$'), `${what} must carry the chosen round: ${link}`);
    }
  });
}

for (const [file, what] of GENERIC) {
  test(`${what} deliberately passes NO class`, () => {
    const links = [...read(file).matchAll(LINKS)].map((m) => m[0]);
    assert.ok(links.length > 0, 'the link builder is still in this file');
    for (const link of links) {
      assert.ok(!link.includes('&class='), `${what} is the confirm-step path: ${link}`);
    }
  });
}

test('CONTROL: the matcher finds real links, and tells the two shapes apart', () => {
  // Without this, every assertion above is satisfiable by a regex that matches
  // nothing (the length check would fail) or one that cannot see `&class=`.
  const withClass = [...read(ROUND_SPECIFIC[0][0]).matchAll(LINKS)].map((m) => m[0]);
  const without = [...read(GENERIC[0][0]).matchAll(LINKS)].map((m) => m[0]);
  assert.equal(withClass.length, 1);
  assert.equal(without.length, 1);
  assert.ok(withClass[0].includes('&class=$'), 'the round-specific shape is detected');
  assert.ok(!without[0].includes('&class='), 'and is distinguishable from the generic one');
});

test('the reveal gate reads initialClassId, not just the draft', () => {
  const src = read('src/components/registration/RegisterWizard.jsx');
  assert.match(
    src,
    /useState\(\s*Boolean\(initialValues\) \|\| Boolean\(initialClassId\),\s*\)/,
    'both arrival signals open the form'
  );
});

// ── Dead code found while enumerating ──────────────────────────────────────

test('publicRegistrationHref is still unused — if that changes, it needs &class=', () => {
  // src/lib/courseRegistrationHref.js exports a builder that omits `class`. It
  // has no callers today, so it cannot weaken the invariant above. If someone
  // wires it into a round-specific CTA this goes red and they have to decide
  // whether that entry point should carry a round.
  const files = [
    'src/app/(public)/[...slug]/_components/CourseStickyCTA.jsx',
    'src/app/(public)/[...slug]/page.jsx',
    ...ROUND_SPECIFIC.map(([f]) => f),
    ...GENERIC.map(([f]) => f),
  ];
  for (const f of files) {
    assert.ok(!read(f).includes('publicRegistrationHref'), `${f} does not use the class-less builder`);
  }
});

test('CONTROL: that probe DOES match the module which defines it', () => {
  assert.ok(read('src/lib/courseRegistrationHref.js').includes('publicRegistrationHref'));
});
