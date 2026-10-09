import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSource } from '../sourceScan.mjs';

/**
 * The bundle wizard reads LIVE round status, and nothing else was made live
 * with it.
 *
 * ── WHY THIS IS A SOURCE SCAN AND NOT A BEHAVIOUR TEST ───────────────────
 * Both halves are framework-level declarations: a `dynamic` export Next reads,
 * and an ISR number inside a fetch wrapper. Neither is observable from a
 * rendered DOM, and a test that mocked the cache would be asserting the mock.
 * So the claim is pinned where it is actually made — and the SCOPE half is the
 * more valuable one, because making the whole site uncached is the easy way to
 * satisfy "the wizard must be live" and would be a quiet performance
 * regression nobody would attribute to this round.
 */

const STEPS = [1, 2, 3].map((n) => `src/app/(public)/registration/bundle/step-${n}/page.jsx`);
const CONTENT = 'src/app/(public)/registration/bundle/BundlePageContent.jsx';
const ROUTE = 'src/app/api/registration/bundle/route.js';
const ADAPTER = 'src/lib/api/schedules.js';
const RESOLVER = 'src/lib/pageBuilder/resolveSectionData.js';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Every page under the public registration tree that DECLARES force-dynamic.
 *
 * Comments are stripped before matching, via `readSource` — the standing rule
 * in this suite, and it bit this very test: BundlePageContent's own note
 * EXPLAINS the declaration and quotes it verbatim, so a raw-text scan counted
 * the explanation as a fourth dynamic page.
 */
function dynamicPagesUnderRegistration() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.jsx') && !name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (/export const dynamic = ['"]force-dynamic['"]/.test(readSource(rel).code)) {
        out.push(rel);
      }
    }
  };
  walk(path.join(ROOT, 'src/app/(public)/registration'));
  return out;
}

test('every wizard step opts out of page caching', () => {
  for (const rel of STEPS) {
    const { code } = readSource(rel);
    assert.match(
      code, /export const dynamic = ['"]force-dynamic['"]/,
      `${rel} can still be served from a cached render`,
    );
  }
});

test('the wizard asks for a LIVE schedules fetch, not just a live render', () => {
  // `dynamic` alone would re-render every request and keep serving the
  // adapter's own 1800s-cached round list — the trap this pins.
  const { code } = readSource(CONTENT);
  assert.match(code, /resolveSectionData\(\s*\[cheap\.section\]\s*,\s*\{\s*revalidate:\s*0\s*\}\s*\)/);
});

test('the adapter HONOURS an override and still defaults to 1800', () => {
  const { code } = readSource(ADAPTER);
  assert.match(
    code, /revalidate:\s*options\.revalidate\s*\?\?\s*1800/,
    'listSchedulesByCourse either ignores the override or changed its default',
  );
});

test('the resolver threads revalidate to the SCHEDULES fetch only', () => {
  const { code } = readSource(RESOLVER);
  // The schedules call takes it...
  assert.match(code, /listSchedulesByCourse\(oid,\s*\{\s*limit:\s*20,\s*revalidate:\s*opts\.revalidate\s*\}\)/);
  // ...and the course/instructor/filter calls do not. Asserted as an exact
  // count of the identifier so a fourth consumer cannot appear unnoticed.
  assert.equal(
    (code.match(/opts\.revalidate/g) ?? []).length, 1,
    'revalidate reached a second fetch — courses and instructors must keep their own window',
  );
});

test('SCOPE: the promotion page and the other surfaces are NOT made live', () => {
  // The promotion page keeps its hour. This is the regression the round could
  // easily have shipped, and it is invisible in any behaviour test.
  const { code } = readSource('src/app/(public)/[...slug]/page.jsx');
  assert.match(code, /export const revalidate = 3600/, 'the promotion page lost its ISR window');
  assert.doesNotMatch(code, /force-dynamic/, 'the promotion page was made dynamic');
});

test('SCOPE: force-dynamic reaches the bundle wizard and no other route', () => {
  // A directory walk rather than a list, so a step-4 added later is covered
  // and a `force-dynamic` dropped somewhere else is caught.
  assert.deepEqual(
    dynamicPagesUnderRegistration().sort(),
    STEPS.slice().sort(),
    'force-dynamic appears outside the bundle wizard steps',
  );
});


test('the wizard and the ROUTE share one live-status assembler', () => {
  // Two callers deciding pickability from two differently-built status maps is
  // how the wizard comes to offer a round the server refuses. One module.
  for (const rel of [CONTENT, ROUTE]) {
    const { code } = readSource(rel);
    assert.match(
      code, /bundleLiveStatusById/,
      `${rel} does not use the shared live-status assembler`,
    );
  }
});
