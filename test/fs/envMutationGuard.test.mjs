import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 54 — a process-global may be written in ONE place, and the walk says so.
 *
 * ── WHY A GUARD AND NOT A FIX ─────────────────────────────────────────────
 * test/run.mjs drives the runner with `isolation: 'none'` and
 * `concurrency: true`: ONE process for all 515 files. `process.env` is
 * therefore shared mutable state, and the two keys below are read by code the
 * suite renders. A file that writes either one has changed what a hundred other
 * files are testing against, and the failure lands somewhere with nothing
 * pointing back.
 *
 * That could not be fixed by editing anything, because on the day this was
 * written NOTHING was broken for NODE_ENV — the value is set once and never
 * moves. What was missing is the property that it CANNOT move. So this is a
 * guard on a latent hazard, and it says so rather than implying it repaired
 * something.
 *
 * TZ was the other half and was NOT latent: two files restored it with a
 * delete, which does not restore, and round 54 measured one of them leaving the
 * process in Pacific/Kiritimati. Those are fixed (see test/pure/envRestore),
 * and this guard is what stops the third copy being written.
 *
 * ── THE SHAPE IS ROUND 30's ───────────────────────────────────────────────
 * A DIRECTORY WALK, not a hand-kept file list a new file joins unnoticed. Round
 * 30 widened the hex ban this way for exactly that reason, and its control
 * planted a violation in a file the ban was not written around. Both are copied
 * here, nouns changed.
 */

const TEST_DIR = 'test';

/**
 * Every write to a shared `process.env` key, in the forms that actually occur:
 * plain assignment, compound assignment, delete, and bracket access. A ban that
 * catches only the shape it looked for is the false green this suite has hit
 * before.
 *
 * NOT MATCHED, deliberately: a READ (`=== 'production'`), and `env:` inside a
 * spawn options object — naming a child's environment explicitly is the
 * opposite of this defect and is what round 45 correctly did.
 */
const GUARDED_KEYS = ['NODE_ENV', 'TZ'];

const envWrites = (code, key) => [...new Set([
  ...(code.match(new RegExp(`process\\.env\\.${key}\\s*(?:\\|\\|=|\\?\\?=|=)(?!=)`, 'g')) ?? []),
  ...(code.match(new RegExp(`delete\\s+process\\.env\\.${key}\\b`, 'g')) ?? []),
  ...(code.match(new RegExp(`process\\.env\\[\\s*['"\`]${key}['"\`]\\s*\\]\\s*(?:\\|\\|=|\\?\\?=|=)(?!=)`, 'g')) ?? []),
])].sort();

/**
 * The files allowed to write each key, and why each is the ONE place.
 *
 *   NODE_ENV
 *     run.mjs   — sets it once, at module scope, before the loader is
 *                 registered and before `run()` imports a single file. That
 *                 ordering is what makes every reader agree.
 *     smoke.mjs — a separate entry point that `npm test` never loads.
 *
 *   TZ
 *     withTZ.mjs   — the shared helper. Its restore is the part that took a bug
 *                    to get right, and a second copy is a second chance to get
 *                    it wrong in a way that lands in an unrelated file.
 *     envRestore   — round 54's control REPRODUCES the naive restore in order
 *                    to prove it is broken, and repairs it synchronously in a
 *                    finally. A control that cannot perform the defect proves
 *                    nothing, so it is named here rather than weakened.
 *
 * articlePublishTime is NOT on the list, and that is a measurement rather than
 * an omission: it is where withTZ was worked out, but it now uses the helper
 * and mentions TZ only in prose. The last control below is what said so — an
 * allow-list entry for a file that no longer writes the key is a hole, because
 * it would silently permit a future write.
 */
const ALLOWED = {
  NODE_ENV: new Set([
    'test/run.mjs',
    'test/smoke.mjs',
  ]),
  TZ: new Set([
    'test/withTZ.mjs',
    'test/pure/envRestore.test.mjs',
  ]),
};

test('the walk reaches the whole test tree', () => {
  // A guard over an empty set passes forever. This is the number that stops
  // "nothing violates the ban" from meaning "nothing was read".
  const files = walkSources(TEST_DIR);
  assert.ok(files.length >= 400,
    `the walk reached only ${files.length} files — it is not covering test/`);
});

for (const key of GUARDED_KEYS) {
  test(`only the named files write process.env.${key}`, () => {
    const offenders = [];
    for (const f of walkSources(TEST_DIR)) {
      if (ALLOWED[key].has(f.rel)) continue;
      if (envWrites(f.code, key).length) offenders.push(f.rel);
    }
    assert.deepEqual(offenders, [],
      `these files write process.env.${key}, which every other file in the run shares. `
      + (key === 'TZ'
        ? 'Use withTZ from test/withTZ.mjs — its restore assigns the ambient zone back, '
          + 'because deleting TZ does not restore it.'
        : 'Set it once in test/run.mjs, or name it in the child\'s env if you are spawning.'));
  });
}

/**
 * The fixtures are ASSEMBLED, never written out.
 *
 * `readSource`'s scrubber removes comments but deliberately PRESERVES string
 * bodies, so a control that spelled out the banned shape inside a quoted string
 * would be flagged by its own guard — measured: the first draft of this file
 * put itself on the offender list for both keys. Concatenating around the `.`
 * keeps the runtime fixture identical while leaving no matchable shape in this
 * file, so the walk still covers the guard itself.
 */
const ENV = 'process.env' + '.';
const IDX = 'process.env' + '[';

test('CONTROL: the scanner catches every write form, and reads a READ as innocent', () => {
  assert.deepEqual(envWrites(`${ENV}NODE_ENV = 'production';`, 'NODE_ENV'), [`${ENV}NODE_ENV =`]);
  assert.deepEqual(envWrites(`${ENV}NODE_ENV ||= 'x';`, 'NODE_ENV'), [`${ENV}NODE_ENV ||=`]);
  assert.deepEqual(envWrites(`${ENV}NODE_ENV ??= 'x';`, 'NODE_ENV'), [`${ENV}NODE_ENV ??=`]);
  assert.deepEqual(envWrites(`${IDX}'NODE_ENV'] = 'x';`, 'NODE_ENV'), [`${IDX}'NODE_ENV'] =`]);
  assert.deepEqual(envWrites(`delete ${ENV}TZ;`, 'TZ'), [`delete ${ENV}TZ`]);

  // Reads, comparisons and an explicitly-named child environment are NOT writes.
  assert.deepEqual(envWrites(`if (${ENV}NODE_ENV === 'production') {}`, 'NODE_ENV'), []);
  assert.deepEqual(envWrites(`const x = ${ENV}NODE_ENV;`, 'NODE_ENV'), []);
  assert.deepEqual(envWrites(`spawnSync(p, a, { env: { ...process.env, NODE_ENV: 'development' } });`, 'NODE_ENV'), [],
    'naming a child environment was read as a mutation — that is the correct pattern, not the defect');
});

test('CONTROL: the sweep fails and NAMES a file the guard was not written around', () => {
  /**
   * Round 30's control, nouns changed. `test/render/coursePicker.test.mjs` is
   * not in either allow-list and has nothing to do with environment variables —
   * so a failure here proves the WALK carries the ban, not a list of the files
   * someone happened to think of.
   */
  const f = 'test/render/coursePicker.test.mjs';
  const poisoned = `${readSource(f).code}
${ENV}NODE_ENV = 'development';`;
  assert.deepEqual(envWrites(poisoned, 'NODE_ENV'), [`${ENV}NODE_ENV =`],
    'the scanner did not see the spliced write, so the naming below would prove nothing');
  assert.throws(
    () => assert.deepEqual(envWrites(poisoned, 'NODE_ENV'), [], `${f} writes process.env.NODE_ENV`),
    (e) => e.message.includes('coursePicker.test.mjs'),
    'the failure must name the offending file');
});

test('CONTROL: the allow-lists name files that exist and really do write the key', () => {
  /**
   * An allow-list entry for a file that no longer writes the key is a hole:
   * it would silently permit a future write. Each entry must still be earning
   * its exemption.
   */
  for (const key of GUARDED_KEYS) {
    for (const rel of ALLOWED[key]) {
      const { code } = readSource(rel);
      assert.ok(code.length > 0, `${rel} is allow-listed but unreadable`);
      assert.ok(envWrites(code, key).length > 0,
        `${rel} is allow-listed for ${key} but no longer writes it — drop the exemption`);
    }
  }
});

/**
 * ── WHAT THIS DOES NOT COVER, STATED RATHER THAN IMPLIED ──────────────────
 * It is a SOURCE guard. It cannot see a write performed through an alias
 * (`const e = process.env; e.TZ = …`), through `Object.assign(process.env, …)`,
 * or from inside node_modules. Those are not hypothetical-but-equal: they are
 * shapes nobody in this repo writes, and a guard that tried to catch them by
 * regex would produce false positives on ordinary code. The walk covers the
 * shapes that actually occur, and this note is here so the next person knows
 * where the edge is rather than assuming there is none.
 *
 * It also says nothing about `scripts/`. Those are standalone probes that each
 * own their whole process, so a write there is correct and is what round 45's
 * pin does. The ban is about SHARED state, and `test/` is where the sharing is.
 */
test('the guard does not reach outside test/, and that is deliberate', () => {
  // scripts/ probes each own their process; a write there mutates nothing
  // shared. Asserted so the scope is a decision on record, not an oversight.
  const probeWrites = readSource('scripts/_probe-list-column-widths.mjs');
  assert.ok(envWrites(probeWrites.code, 'NODE_ENV').length > 0,
    'the exemplar probe stopped writing NODE_ENV — pick another, or narrow this note');
  const guarded = walkSources(TEST_DIR).map((f) => f.rel);
  assert.ok(!guarded.some((r) => r.startsWith('scripts/')), 'the walk escaped test/');
});
