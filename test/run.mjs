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

const FLOOR = 350; // minimum tests expected across pure/fs/render (see meta-control note). 126 after 2C.2b + 5b-audit + fail-loud hardening + promotion-mode Phases 1-3 + roadmap-svg scrub; 132 after webhook course-revalidate planner (6); 137 after CourseRoadmap dedup (5); 140 after roadmap intrinsic-aspect sizing (+3); 157 after OG image fallback-chain resolver (+17); 167 after course sticky CTA bar (+10); 174 after sticky-bar stacking-order fix + page-centering (net +7); 179 after public z-index scale audit (+5); 238 after the authored inline-colour classifier (+36: 26 pure in test/pure/authoredColors, 10 seam guards in test/fs/authoredColorTokens); 275 after the schedule-status unification (+37: 16 pure in test/pure/scheduleStatus, 21 five-surface render + unknown-status controls in test/render/scheduleStatus); 305 after the program/skill href consolidation (+30: 18 pure in test/pure/pageHrefs incl. the linkability three-state rule and the no-redirect control, 12 chip render in test/render/skillBreadcrumb); 325 after restoring true client-logo colours on a single panel (+20: 15 render in test/render/clientLogos incl. the seam/nesting and panel present-in-dark/absent-in-light controls, 5 marquee/source guards in test/fs/clientLogosMarquee); 349 after the hue-preserving per-theme colour adjustment (+24: 22 pure in test/pure/authoredColors incl. the hue-tolerance sweep and the conditional-adjustment control, 2 seam/token guards in test/fs/authoredColorTokens and test/render/clientLogos height parity); 350 after the monochrome logo wall replaced the light panel (net +1: clientLogos render tests rewritten to the knockout + keepColorOnDark exception, clientLogosMarquee guards re-pointed at the real defect).
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
