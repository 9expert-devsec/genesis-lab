import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
];

/**
 * The surfaces that gave the template up. Each must now CALL the builder and
 * hold no copy of the URL — otherwise the entry above is guarding a module that
 * nothing reaches, and the &class= invariant would rest on nothing for the
 * highest-traffic round lists in the app.
 *
 * ── CourseCard MOVED HERE FROM `ROUND_SPECIFIC` ─────────────────────────────
 * It used to build the URL inline, so it belonged in the list above: it held a
 * template, and that template had to carry `&class=`. It delegates now, which
 * means it holds no template for that test to inspect — and the reason it moved
 * is not tidiness. The inline version never consulted the STATUS, so a sold-out
 * round would have been a live link into the wizard. The shared builder returns
 * null for `full`, so routing through it is what closes that.
 *
 * ── course_schedule MOVED HERE FROM `ROUND_SPECIFIC` TOO (round 81) ─────────
 * Same move, same reason, one round later. The page-builder section held the
 * fifth copy of the template and it had drifted exactly the way CourseCard's
 * had: no status check, so a `full` round rendered the red เต็ม chip inside a
 * working registration link. It was left in `ROUND_SPECIFIC` while it held a
 * template of its own; it delegates now, so it is guarded here instead.
 *
 * The call EXPRESSION is per-file because the argument names are local: the
 * /schedule and /search rows call `(schedule, courseId)`, the catalog card calls
 * `(s, id)`, the builder section calls `(s, code)`. Asserting the call rather
 * than a bare import is what distinguishes "imports the builder" from "uses it".
 *
 * This list is also the ENTRY-POINT COUNT. One implementation
 * (src/lib/schedule/scheduleRegistrationHref.js, the sole member of
 * ROUND_SPECIFIC that is a round-list builder) and four call sites across these
 * three files plus the section — /schedule's table cell and mobile card both
 * read the ScheduleClient entry. A fifth surface may be added freely; a fifth
 * IMPLEMENTATION cannot, because the no-template assertion below is applied to
 * every file in this list and `no second implementation of the round-link rule`
 * sweeps the rest of src/.
 */
const DELEGATES = [
  ['src/app/(public)/schedule/_components/ScheduleClient.jsx', '/schedule rows',
    'scheduleRegistrationHref(schedule, courseId)'],
  ['src/app/(public)/search/_components/SearchClient.jsx', 'search results',
    'scheduleRegistrationHref(schedule, courseId)'],
  ['src/app/(public)/training-course/_components/CourseCard.jsx', 'catalog card rounds',
    'scheduleRegistrationHref(s, id)'],
  ['src/components/pageBuilder/sections/course_schedule.jsx', 'page-builder schedule section',
    'scheduleRegistrationHref(s, code)'],
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

for (const [file, what, call] of DELEGATES) {
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
    assert.ok(
      src.includes(call),
      `${what} must actually CALL it as ${call} — importing is not using`,
    );
  });
}

test('CONTROL: the delegation probes DO fire on a file that still inlines it', () => {
  /**
   * Two of the three assertions above are absences, and the third is an import
   * line — which on its own is satisfied by a file that imports the builder and
   * then ignores it. Run the matchers against a file that really does inline the
   * template.
   *
   * The subject was the page-builder section until round 81 folded it into
   * DELEGATES. It is now the detail page's "ลงทะเบียนรอบที่เลือก" CTA, which
   * still builds its own URL and legitimately so: it is a single chosen round
   * inside a component that already resolved the round itself, not a LIST of
   * rounds, so it is in ROUND_SPECIFIC rather than being a fifth caller of the
   * list builder. Repointing the control at another list surface would have
   * meant leaving a copy of the template in place to keep a test honest.
   */
  const inliner = read('src/app/(public)/[...slug]/_components/ScheduleSection.jsx');
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
  // `roundExists` became `roundSelectable` when upstream started releasing
  // `full` rounds to this page: membership is no longer sufficient, because a
  // sold-out round now DOES arrive in `schedules` and must not open the form.
  // The invariant this test exists for is unchanged — both arrival signals are
  // still resolved against the fetched rounds rather than merely tested for
  // presence — so the probes follow the rename instead of pinning the old name.
  const src = read('src/components/registration/RegisterWizard.jsx');
  assert.match(
    src,
    /const roundOf = \(id\) =>\s*\(id && \(schedules \?\? \[\]\)\.find\(\(s\) => s\._id === id\)\) \|\| null;/,
    'membership, not mere presence'
  );
  assert.match(
    src,
    /const roundSelectable = \(id\) => \{[\s\S]*?normalizeScheduleStatus\(round\.status\) !== "full";/,
    'and membership alone is not enough — a full round is not selectable'
  );
  assert.match(
    src,
    /useState\(\s*roundSelectable\(initialClassId\) \|\| roundSelectable\(initialValues\?\.classId\),\s*\)/,
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

// ── ONE IMPLEMENTATION, HOWEVER MANY ENTRY POINTS (round 81) ────────────────

/**
 * The per-file assertions above are an ALLOWLIST, and an allowlist only guards
 * the files someone remembered to list. That is exactly how the defect round 81
 * fixed survived: `course_schedule.jsx` was listed — in ROUND_SPECIFIC, as a
 * legitimate holder of a template — so every test in this file passed while it
 * quietly linked sold-out rounds. Nothing asked whether a SIXTH file had grown
 * a copy, and nothing would have.
 *
 * So the two lists are closed against the whole of src/. Any file that builds a
 * `?course=…&class=…` wizard URL and is not one of the four named holders is a
 * second implementation of the round-link rule, and the rule it will not have is
 * the `full` refusal — a template is four lines and copies cleanly; the status
 * check is a judgement and does not.
 *
 * Deliberately NOT a count. A count goes stale in the direction that hides the
 * problem: someone adds a surface, the number goes up, they bump the number.
 * Naming the holders means a new one has to be argued for in this file.
 */
const TEMPLATE_HOLDERS = new Set([...ROUND_SPECIFIC, ...GENERIC].map(([f]) => f));

/** Every .js/.jsx under src/, comments stripped — the standing rule here. */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** The files that BUILD the wizard URL, as opposed to calling something that does. */
const templateHolders = (files, readFile) =>
  // `matchAll`, not `LINKS.test` — LINKS carries the /g flag, so `.test` would
  // advance `lastIndex` and every second call would resume mid-file. That is a
  // sweep which silently skips half its subjects and reports a clean src/.
  files.filter((f) => [...stripComments(readFile(f)).matchAll(LINKS)].length > 0);

test('no second implementation of the round-link rule exists anywhere in src/', () => {
  const found = templateHolders(sourceFiles('src'), read);
  const unlisted = found.filter((f) => !TEMPLATE_HOLDERS.has(f));
  assert.deepEqual(
    unlisted, [],
    'these files build the public wizard URL themselves and are not declared '
    + 'above. A round LIST must call scheduleRegistrationHref, which is the only '
    + 'thing that refuses a `full` round; a single-round CTA that legitimately '
    + 'builds its own belongs in ROUND_SPECIFIC, argued for by name',
  );
  // And the allowlist has not outlived its subjects: every declared holder must
  // still hold one, or it is guarding nothing and hiding a name.
  for (const f of TEMPLATE_HOLDERS) {
    assert.ok(found.includes(f), `${f} is declared as a template holder but holds none`);
  }
});

test('CONTROL: the sweep catches a file that grows a second implementation', () => {
  /**
   * The assertion above is an empty-array check, which is what a matcher that
   * sees nothing also produces. Drive the same detector over a synthetic file
   * set: one file that inlines the template, one that only CALLS the builder.
   * The first must be reported and the second must not — a sweep that flagged
   * every caller would be unusable and would be silenced rather than fixed.
   */
  const fake = {
    'src/fake/CopiedIt.jsx':
      'const href = `/registration/public?course=${String(code).toLowerCase()}&class=${s._id}`;',
    'src/fake/DelegatesProperly.jsx':
      "import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';\n"
      + 'const href = scheduleRegistrationHref(s, code);',
    'src/fake/OnlyMentionsItInAComment.jsx':
      '// builds `/registration/public?course=${x}&class=${y}` — but only in prose\nexport const x = 1;',
  };
  const found = templateHolders(Object.keys(fake), (f) => fake[f]);
  assert.deepEqual(
    found, ['src/fake/CopiedIt.jsx'],
    'the sweep must flag the copy, spare the caller, and not be fooled by a comment',
  );
  assert.ok(!TEMPLATE_HOLDERS.has('src/fake/CopiedIt.jsx'),
    'and an undeclared copy is not on the allowlist, so the test above would fail',
  );
});

test('CONTROL: the src/ walk actually reaches the files it claims to', () => {
  // Without this the sweep passes because it enumerated nothing. Pin the two
  // ends: the builder itself, and the section that stopped holding a copy.
  const files = sourceFiles('src');
  assert.ok(files.length > 500, `the walk found only ${files.length} files under src/`);
  assert.ok(files.includes('src/lib/schedule/scheduleRegistrationHref.js'));
  assert.ok(files.includes('src/components/pageBuilder/sections/course_schedule.jsx'));
});
