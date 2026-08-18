/**
 * The browser tier's entry point.  `npm run test:browser`
 *
 * ── THIS TIER IS NOT PART OF `npm test`, ON PURPOSE ─────────────────────────
 * `npm test` must pass on a laptop with no dev server, no Chrome and no
 * network — that is what makes it worth running before every commit. These
 * scripts need all three. So they are enumerated HERE and nowhere else:
 * test/run.mjs walks only `pure`, `fs` and `render`, and its discovery guard
 * looks for `*.test.mjs`, which nothing in this directory is called. Neither
 * the file count nor the FLOOR moves when a script is added here.
 *
 * ── WHY IT IS IN THE REPO AT ALL ────────────────────────────────────────────
 * It was rebuilt from scratch three sessions running because it lived in a
 * temp directory that gets wiped, and the rebuild was the smaller half of the
 * cost: the assertion COUNTS changed each time (auto-slide 13→21, seam 12→15,
 * strip 46→60→63), so "no regression since last round" could not be compared
 * against anything. The counts in this directory are now the baseline, and
 * they only move when a commit says why.
 *
 * The load-bearing reason is coupling. Every script here asserts on
 * `data-fc-*` hooks, class names and layout numbers that the components own.
 * When a component changes, its guard has to change in the SAME commit, or the
 * two drift and you eventually get a green run against broken code. Living in
 * the repo is what makes that possible; living in a scratchpad made it
 * impossible.
 *
 * ── WHAT THIS RUNNER ADDS OVER RUNNING THE SIX BY HAND ──────────────────────
 * A preflight. Without it, a stopped dev server produces six scripts each
 * failing in its own confusing way — "the image card is not in the DOM" reads
 * as a product defect, not as ECONNREFUSED. It is checked once, up front, and
 * named.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ORIGIN, findChrome } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The guards, in the order a failure is most usefully read.
 *
 * `shot.mjs` is deliberately NOT here. It captures screenshots and asserts
 * nothing, so it is a tool for producing evidence rather than a guard, and
 * putting it in this list would report a count it does not have.
 */
const SCRIPTS = [
  ['strip', 'geometry of the control row, the strip and the two stages, at 1440 and 375'],
  ['autoslide', 'the timer, every pause reason, and what may resume it'],
  ['click', 'the image card is ONE anchor — 375 only, where the copy block exists'],
  ['youtube', 'the facade: nothing from the player until someone presses play'],
  ['seam', 'no band where the hero meets the section, and the hero stays clickable'],
  ['scrolly', 'the page does not move while the carousel does (slow: ~2 min)'],
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const chosen = only.length
  ? SCRIPTS.filter(([n]) => only.includes(n))
  : SCRIPTS;

if (only.length && chosen.length !== only.length) {
  const known = SCRIPTS.map(([n]) => n).join(', ');
  console.error(`Unknown script. Known: ${known}`);
  process.exit(2);
}

// ── PREFLIGHT ───────────────────────────────────────────────────────────────
console.log(`\n  origin  ${ORIGIN}`);
try {
  console.log(`  chrome  ${findChrome()}`);
} catch (e) {
  console.error(`\n✖ ${e.message}\n`);
  process.exit(2);
}

try {
  const res = await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(
    `\n✖ No dev server at ${ORIGIN} (${e.message}).\n\n`
    + '  This tier drives a REAL browser against a RUNNING app. Start one:\n\n'
    + '      npm run dev                       # defaults to :3000\n'
    + '      npm run test:browser\n\n'
    + '  or point it somewhere else:\n\n'
    + '      FC_PORT=3010 npm run test:browser\n'
    + '      FC_ORIGIN=https://preview.example npm run test:browser\n\n'
    + '  `npm test` does not need any of this and is unaffected.\n'
  );
  process.exit(2);
}

// The first request to a cold `next dev` compiles the route, which can take
// 20s; every script would otherwise spend its own settle budget waiting for
// that one compile. Warm it once here instead.
console.log('  warming the route…');
await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(120000) }).catch(() => {});

// ── RUN ─────────────────────────────────────────────────────────────────────
const results = [];
for (const [name, blurb] of chosen) {
  console.log(`\n${'─'.repeat(72)}\n▶ ${name} — ${blurb}\n`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, `${name}.mjs`)], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.on('close', (c) => {
      // The tape's closing line, which is the only contract between a script
      // and this runner.
      const m = /\[(.+?)\]\s+(\d+)\/(\d+)\s*$/m.exec(out.trimEnd());
      results.push({
        name,
        passed: m ? Number(m[2]) : 0,
        total: m ? Number(m[3]) : 0,
        reported: Boolean(m),
        code: c,
      });
      resolve(c);
    });
  });
  if (code === null) break;
}

// ── SUMMARY ─────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(72)}\n`);
let passed = 0;
let total = 0;
let bad = 0;
for (const r of results) {
  passed += r.passed;
  total += r.total;
  const green = r.code === 0 && r.reported && r.passed === r.total;
  if (!green) bad += 1;
  const note = r.reported ? '' : '   (no count reported — the script crashed)';
  console.log(
    `  ${green ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(11)} ${String(r.passed).padStart(3)}/${String(r.total).padEnd(3)}${note}`
  );
}
console.log(`\n[browser] ${passed}/${total} across ${results.length} scripts\n`);
process.exit(bad ? 1 : 0);
