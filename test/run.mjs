// npm test entry point (item 1). Runs the gated tiers — pure / fs / render — in
// ONE process so the loader (registered below) applies; `node --test` isolates
// each file into a child the loader never reaches (verified: it does not
// propagate --import), so we drive the programmatic runner with isolation:'none'
// instead.
//
// smoke/ (live MSDB, needs a key + network) is NOT enumerated here and is never
// part of `npm test` — see test/smoke.mjs.
//
// META-CONTROL (the runner's own control, per item 1's "every check needs a
// control proving it CAN fail"): assert the run discovered at least FLOOR tests.
// This is the one guard against the runner-level false-green — a loader that
// silently skips files, a tier dir that stops being enumerated, a glob that
// matches nothing — where zero tests run and the suite reports green. It
// terminates (a number a human set here vs a number the runner reports) rather
// than regressing into a check-checking-a-check. Raise FLOOR when you add tests;
// a drop below it means tests VANISHED, which is exactly what must go red.
//
// The CANARY (test/canary.mjs) is the other half and is deliberately NOT run
// here: it is a manual affordance a human invokes to watch the suite go red
// before trusting a green. Wiring it into an automated pipeline would just move
// the unread-badge problem down a level (see the CI row in the status doc).

process.env.NODE_ENV = 'production'; // match component runtime branches (fail-closed, no dev blocks)

import { register } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register(new URL('./loader.mjs', import.meta.url));
const { run } = await import('node:test');
const { spec } = await import('node:test/reporters');

const FLOOR = 422; // minimum tests expected across pure/fs/render (see meta-control note). 126 after 2C.2b + 5b-audit + fail-loud hardening + promotion-mode Phases 1-3 + roadmap-svg scrub; 132 after webhook course-revalidate planner (6); 137 after CourseRoadmap dedup (5); 140 after roadmap intrinsic-aspect sizing (+3); 157 after OG image fallback-chain resolver (+17); 167 after course sticky CTA bar (+10); 174 after sticky-bar stacking-order fix + page-centering (net +7); 179 after public z-index scale audit (+5); 238 after the authored inline-colour classifier (+36: 26 pure in test/pure/authoredColors, 10 seam guards in test/fs/authoredColorTokens); 275 after the schedule-status unification (+37: 16 pure in test/pure/scheduleStatus, 21 five-surface render + unknown-status controls in test/render/scheduleStatus); 305 after the program/skill href consolidation (+30: 18 pure in test/pure/pageHrefs incl. the linkability three-state rule and the no-redirect control, 12 chip render in test/render/skillBreadcrumb); 325 after restoring true client-logo colours on a single panel (+20: 15 render in test/render/clientLogos incl. the seam/nesting and panel present-in-dark/absent-in-light controls, 5 marquee/source guards in test/fs/clientLogosMarquee); 349 after the hue-preserving per-theme colour adjustment (+24: 22 pure in test/pure/authoredColors incl. the hue-tolerance sweep and the conditional-adjustment control, 2 seam/token guards in test/fs/authoredColorTokens and test/render/clientLogos height parity); 350 after the monochrome logo wall replaced the light panel (net +1: clientLogos render tests rewritten to the knockout + keepColorOnDark exception, clientLogosMarquee guards re-pointed at the real defect); 373 after removing the /universe route (+23, and NOTHING removed: 7 render in test/render/headerActions pinning the action cluster the deleted Orbit button left behind plus the no-link control, 16 seam guards in test/fs/headerImports — one per lucide specifier — catching the dead import the removal leaves. The route's own deletion cost zero tests: it had none, and the three tests that named it in test/pure/pageHrefs only did so in prose, so the floor did not drop); 382 after extracting the public /schedule course↔schedule join into a pure module (+9 in test/pure/joinCourseSchedules, incl. the PYTHON-L1 regression guard for the incident where 45 of 77 courses were dropped silently, and TWO controls — one replicating the pre-fix no-accounting join, one pinning that `orphans` being empty in production is a measurement and not a literal); 397 after the schedule-webhook visibility assessment (+15 in test/pure/schedulePublicVisibility, incl. the incident row 6931505831d45afebddb77d7 with its real `signup_url: ""`, the `>=` same-day boundary, and the three-way status outcome — exact match passes, a trim/case-folded-only match is reported UNCERTAIN rather than passed because upstream's own casing comparison is unverified and resolving it as "visible" would reproduce the silence the module exists to break, and an unmatched status hard-fails. THREE independent controls: `failures` is measured rather than a constant `[]`, `visible` is derived rather than a constant `true`, and the ambiguity branch is real rather than collapsing back to a case-insensitive compare. Verified independent — each survives the other two's stubs, and the CATEGORY CONTROL on status "full" keeps the fact/doubt categories from merging); 399 after repairing the sticky-bar stacking guard (+2 net in test/render/stickyBarButtonCoordination: the ancestor model is now DERIVED from page.jsx/layout.jsx instead of transcribed — the transcribed copy went stale when be78611 swapped <article> from bg-white to bg-[var(--page-bg)], a colour-only change creating no stacking context, and a missing anchor now THROWS naming the element instead of silently dropping an unchecked ancestor. The single misnamed test was split into the two pairings it actually asserts (sidebar-vs-bar, which only the ancestors BETWEEN aside and article decide, and article-vs-layout-UI), plus a NEW structural tripwire on the aside→article nesting depth that catches an inserted wrapper — the real hole, since the ancestor list had no completeness check and a <div className="isolate"> around the grid traps the sidebar while every class assertion stays green); 401 after the Tailwind content-glob coverage guard (+2 in test/pure/tailwindContentCoverage, closing a gap NOTHING in the suite could see: the JIT only emits classes it can scan, so centralising the schedule-status maps into src/lib/scheduleStatus.js — outside a `content` array that named src/lib/pageBuilder specifically — silently dropped all four status hexes from the CSS while every test stayed green. The guard walks src/ for arbitrary-value literals and asserts each holding file matches a glob, plus a CONTROL that the walker/matcher are live so zero-offenders-of-zero-files cannot pass vacuously. Glob matching is hand-rolled (~20 lines) rather than minimatch/picomatch, which exist only as TRANSITIVE deps — building the guard on a package nobody declared is the same defect it guards against); 422 after single-sourcing the admin schedule horizon (+9 in test/pure/adminScheduleHorizon, raising the grid from 4 months to 12 so whoever manages schedules can see what the public /schedule page already shows). The horizon was ONE concept written as the literal `4` in THREE places that had to agree — the MSDB `to` bound, the column loop, the Thai subtitle — and they did not: `to` was `today + 4 months` (2026-07-29 → 2026-11-29) while the last column was October, so November rows were fetched and then dropped by `monthKey(s.dates[0])` matching no column. Over-fetch plus a silent client-side drop, the same shape as the /schedule join incident above. The bound is now DERIVED from the last rendered column (its last day) in src/lib/adminScheduleHorizon.js, so the two cannot diverge without one being rewritten, and the tests confirm a structural property rather than policing two parallel computations: NONE of the agreement assertions hardcodes 12, so flipping the constant leaves them green (verified at 8) and reddens only the single test that pins the value, deliberately kept separate. A FOURTH `4` — `calendarMonths`, the modal date picker's scroll window — is a FALSE FRIEND, equal by coincidence, and one test pins that it keeps its OWN numeric literal and names nothing from the horizon module, because the plausible next edit here is a "cleanup" unifying all four that would render a 12-month day grid inside a max-h-80 box. Verified red three ways: hardcoding the bound back to `+ 4` months, pointing calendarMonths at the shared constant, and restoring the literal column loop).
const TIERS = ['pure', 'fs', 'render'];
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const files = TIERS.flatMap((tier) => {
  const dir = path.join(TEST_DIR, tier);
  let entries = [];
  try { entries = readdirSync(dir); } catch { /* tier dir may not exist yet */ }
  return entries.filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(dir, f));
});

// CANARY=1 injects the deliberately-failing case (test/canary.case.mjs). A human
// runs `CANARY=1 npm test`, expects EXACTLY ONE failure, and if the run is green
// the runner is not reporting failures. Manual by design — see the case file.
if (process.env.CANARY) files.push(path.join(TEST_DIR, 'canary.case.mjs'));

let pass = 0, fail = 0;
const stream = run({ files, isolation: 'none', concurrency: true });
stream.on('test:pass', () => { pass += 1; });
stream.on('test:fail', () => { fail += 1; });
stream.compose(spec).pipe(process.stdout);

stream.on('close', () => {
  const total = pass + fail;
  const belowFloor = total < FLOOR;
  console.log(`\n[suite] ${pass} passed, ${fail} failed, ${total} total across ${files.length} files (floor ${FLOOR})`);
  if (belowFloor) {
    console.log(`[meta-control] FAIL: only ${total} tests ran, below floor ${FLOOR} — tests may have silently vanished.`);
  }
  process.exit(fail > 0 || belowFloor ? 1 : 0);
});
