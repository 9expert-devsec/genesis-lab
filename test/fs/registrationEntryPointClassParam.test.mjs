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
  // /schedule's table + round row AND /search's schedule section, which used to
  // hold two byte-identical copies of this template, now share one builder.
  ['src/lib/schedule/scheduleRegistrationHref.js', 'the shared round-registration builder'],
  ['src/app/(public)/training-course/_components/CourseCard.jsx', 'catalog card rounds'],
  ['src/components/pageBuilder/sections/course_schedule.jsx', 'page-builder schedule section'],
];

/**
 * The two surfaces that gave the template up. Each must now CALL the builder and
 * hold no copy of the URL — otherwise the entry above is guarding a module that
 * nothing reaches, and the &class= invariant would rest on nothing for the two
 * highest-traffic round lists in the app.
 */
const DELEGATES = [
  ['src/app/(public)/schedule/_components/ScheduleClient.jsx', '/schedule rows'],
  ['src/app/(public)/search/_components/SearchClient.jsx', 'search results'],
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

for (const [file, what] of DELEGATES) {
  test(`${what} delegates to the shared builder instead of holding a copy`, () => {
    const src = read(file);
    assert.equal(
      [...src.matchAll(LINKS)].length, 0,
      `${what} must not write the wizard URL itself any more`,
    );
    assert.match(
      src,
      /import \{ scheduleRegistrationHref \} from ["']@\/lib\/schedule\/scheduleRegistrationHref["']/,
      `${what} must import the one builder`,
    );
    assert.match(
      src, /scheduleRegistrationHref\(schedule, courseId\)/,
      `${what} must actually call it`,
    );
  });
}

test('CONTROL: the delegation probes DO fire on a file that still inlines it', () => {
  /**
   * Two of the three assertions above are absences, and the third is an import
   * line — which on its own is satisfied by a file that imports the builder and
   * then ignores it. Run the matchers against a file that really does inline the
   * template (the page-builder section, which is not part of this refactor).
   */
  const inliner = read('src/components/pageBuilder/sections/course_schedule.jsx');
  assert.ok([...inliner.matchAll(LINKS)].length > 0, 'the probe sees an inlined template');
  assert.equal(
    /import \{ scheduleRegistrationHref \}/.test(inliner), false,
    'and that file does not import the builder',
  );
});

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

test('the reveal gate checks BOTH arrival signals for membership', () => {
  const src = read('src/components/registration/RegisterWizard.jsx');
  assert.match(
    src,
    /const roundExists = \(id\) =>\s*Boolean\(id\) && \(schedules \?\? \[\]\)\.some\(\(s\) => s\._id === id\);/,
    'membership, not mere presence'
  );
  assert.match(
    src,
    /useState\(\s*roundExists\(initialClassId\) \|\| roundExists\(initialValues\?\.classId\),\s*\)/,
    'URL round or draft round, either resolving is enough'
  );
});

test('the class-less publicRegistrationHref builder is gone', () => {
  // Deleted rather than guarded: a round-specific CTA built on it would have
  // silently restored the confirm click. The per-file assertions above are what
  // pin the invariant now.
  // Comments stripped first: the module's own header explains what was removed
  // and names both the function and the URL, which a raw scan would match.
  const code = read('src/lib/courseRegistrationHref.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  assert.ok(!/publicRegistrationHref/.test(code), 'the export is removed');
  assert.ok(!/\/registration\/public\?course=/.test(code), 'and so is the URL it built');
});

test('CONTROL: stripping comments did not blank the file', () => {
  // Without this, the assertions above pass against an empty string — which is
  // exactly what a slightly-wrong comment regex would produce.
  const code = read('src/lib/courseRegistrationHref.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  assert.match(code, /export function inhouseRegistrationHref/, 'real code survived the strip');
  assert.match(code, /\/registration\/in-house\?course=/, 'including the sibling URL');
});

test('CONTROL: its live sibling survived the deletion', () => {
  // Proves the file was pruned, not emptied — inhouseRegistrationHref has a real
  // caller ([...slug]/page.jsx) and isInhouseOnly is still exported alongside it.
  const mod = read('src/lib/courseRegistrationHref.js');
  assert.match(mod, /export function inhouseRegistrationHref/);
  assert.match(mod, /export function isInhouseOnly/);
  assert.match(
    read('src/app/(public)/[...slug]/page.jsx'),
    /import \{ inhouseRegistrationHref \} from '@\/lib\/courseRegistrationHref'/,
    'and its caller still imports it'
  );
});

// The `publicRegistrationHref is still unused` guard that used to live here is
// gone with the function it guarded — see src/lib/courseRegistrationHref.js. The
// per-file &class= assertions above pin the live invariant and stay.
