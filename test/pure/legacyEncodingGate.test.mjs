import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS, ENCODING_GATE, encodingGate,
} from '../../scripts/lib/legacy-reference-rewrite.mjs';

/**
 * THE ENCODING GUARANTEE, AND WHERE IT BELONGS.
 *
 * `superseded` is the only class that writes back a DECODED path — taken from
 * the migration record rather than from the reference — so it is the only class
 * whose replacement must be plain ASCII. The guarantee used to be a startup
 * assertion over the whole superseded map, and that made a row which can never
 * produce a rewrite able to halt every run. One does: a course cover whose
 * replacement contains literal spaces, referenced nowhere except inside
 * legacy_file_migrations, which the rewrite excludes.
 *
 * The split is the subject of this file:
 *
 *   at LOAD  — warn, name the row, keep going
 *   at WRITE — die, because the value is about to be stored
 *
 * ══ WHY EACH ASSERTION HERE NEEDS A CONTROL ═════════════════════════════════
 *
 * "Unencodable at load warns" and "unencodable at write dies" are both
 * satisfied by a gate that has no encodability check in it at all — one that
 * simply warns on load and dies on write for EVERYTHING superseded. The
 * encodable cases are what separate the real gate from that one, and the
 * alternative implementations at the bottom are what prove the separation is
 * real rather than asserted.
 */

const SPACES = '/sites/default/files/course/cover/Build AI Multi-Agent with Claude Code.png';
const ASCII = '/sites/default/files/articles/images/cloudflare-published-application-routes.png';

// Both are real rows from legacy_file_migrations, and their difference is the
// whole point: SPACES is the row that was halting the run, ASCII is the only
// superseded row actually referenced in rewritable content.

test('sanity: the two fixtures really do differ in encodability', () => {
  // If this ever stopped holding, every case below would be testing one input
  // twice and the file would be green for the wrong reason.
  assert.notEqual(encodeURI(SPACES), SPACES, 'the spaced path must need encoding');
  assert.equal(encodeURI(ASCII), ASCII, 'the ASCII path must not');
});

// ── the two ruled behaviours ────────────────────────────────────────────────

test('unreachable + unencodable → WARN, and the run is allowed to proceed', () => {
  const gate = encodingGate({ phase: 'load', cls: CLASS.SUPERSEDED, replacement: SPACES });
  assert.equal(gate, ENCODING_GATE.WARN);
  assert.notEqual(gate, ENCODING_GATE.DIE,
    'a row that can never produce a rewrite must not halt the run — this is the '
    + 'defect the split exists to fix');
});

test('reachable + unencodable → DIE, at the point the value would be written', () => {
  assert.equal(
    encodingGate({ phase: 'write', cls: CLASS.SUPERSEDED, replacement: SPACES }),
    ENCODING_GATE.DIE,
    'storing a path with literal spaces produces a URL that quietly 404s and '
    + 'nothing downstream reports it',
  );
});

// ── THE CONTROL THAT MAKES THE TWO ABOVE MEAN ANYTHING ─────────────────────

test('CONTROL: reachable + encodable → neither warns nor dies', () => {
  // Without this, both assertions above are satisfied by a gate that ignores
  // encodability entirely and keys only on `phase`. This is the case that
  // separates them, and it is the case the real run actually takes: the one
  // superseded row referenced in content is this one.
  assert.equal(
    encodingGate({ phase: 'write', cls: CLASS.SUPERSEDED, replacement: ASCII }),
    ENCODING_GATE.OK,
  );
  assert.equal(
    encodingGate({ phase: 'load', cls: CLASS.SUPERSEDED, replacement: ASCII }),
    ENCODING_GATE.OK,
    'and it must not warn either — a warning on every healthy row is how an '
    + 'operator learns to skip the warnings',
  );
});

test('CONTROL: the gate is specific to `superseded`, not a blanket encodability check', () => {
  // The other rewriting classes preserve the reference's own encoding rather
  // than constructing a path, so an unencodable value there is not this gate's
  // business. If it fired for them, the run would die on ordinary Thai and
  // percent-encoded filenames, which are the majority of the corpus.
  for (const cls of [CLASS.DIRECT, CLASS.DERIVATIVE, CLASS.AMPERSAND, CLASS.MANIFEST_RESOLVED]) {
    assert.equal(
      encodingGate({ phase: 'write', cls, replacement: SPACES }),
      ENCODING_GATE.OK,
      `${cls} must not be governed by the superseded encoding gate`,
    );
  }
});

test('a non-string replacement is not the encoding gate\'s problem', () => {
  assert.equal(encodingGate({ phase: 'write', cls: CLASS.SUPERSEDED, replacement: null }), ENCODING_GATE.OK);
});

// ── THE BATTERY, AND THE IMPLEMENTATIONS IT MUST REJECT ────────────────────

/**
 * Every ruled behaviour as one table, so the SAME cases can be run against a
 * different implementation. Building a control by filtering these would be
 * worthless — a control that fails whenever its subject fails is measuring the
 * subject, which is the lesson from the rbacNavParity work.
 */
const CASES = [
  { name: 'load + unencodable', phase: 'load', cls: CLASS.SUPERSEDED, replacement: SPACES, want: ENCODING_GATE.WARN },
  { name: 'write + unencodable', phase: 'write', cls: CLASS.SUPERSEDED, replacement: SPACES, want: ENCODING_GATE.DIE },
  { name: 'load + encodable', phase: 'load', cls: CLASS.SUPERSEDED, replacement: ASCII, want: ENCODING_GATE.OK },
  { name: 'write + encodable', phase: 'write', cls: CLASS.SUPERSEDED, replacement: ASCII, want: ENCODING_GATE.OK },
  { name: 'write + other class', phase: 'write', cls: CLASS.DIRECT, replacement: SPACES, want: ENCODING_GATE.OK },
];

const battery = (gate) => CASES.filter((c) => gate(c) !== c.want).map((c) => c.name);

test('the shipped gate satisfies every case in the table', () => {
  assert.deepEqual(battery(encodingGate), []);
});

test('CONTROL: a gate that warns in BOTH cases fails the table', () => {
  // The specific wrong fix §4 names: soften the die into a warning everywhere,
  // so nothing ever halts. It would let an unencodable value be WRITTEN, which
  // is the one outcome the original assertion existed to prevent.
  const alwaysWarn = ({ cls, replacement }) => (
    cls === CLASS.SUPERSEDED && typeof replacement === 'string' && encodeURI(replacement) !== replacement
      ? ENCODING_GATE.WARN
      : ENCODING_GATE.OK
  );
  assert.deepEqual(battery(alwaysWarn), ['write + unencodable'],
    'softening the write-point die must redden exactly the write case — if this '
    + 'comes back empty the table cannot tell the fix from the wrong fix');
});

test('CONTROL: the ORIGINAL always-die gate also fails the table', () => {
  // The other direction: the code as it stood before this change. It is the
  // reason the dry run could not complete, and the table must reject it too —
  // otherwise "the fix works" would be indistinguishable from "nothing changed".
  const alwaysDie = ({ cls, replacement }) => (
    cls === CLASS.SUPERSEDED && typeof replacement === 'string' && encodeURI(replacement) !== replacement
      ? ENCODING_GATE.DIE
      : ENCODING_GATE.OK
  );
  assert.deepEqual(battery(alwaysDie), ['load + unencodable'],
    'the pre-fix behaviour must redden exactly the load case');
});

test('CONTROL: a gate keyed ONLY on phase, ignoring encodability, fails the table', () => {
  // The failure the "reachable + encodable" control is really guarding against.
  const phaseOnly = ({ phase, cls }) => {
    if (cls !== CLASS.SUPERSEDED) return ENCODING_GATE.OK;
    return phase === 'write' ? ENCODING_GATE.DIE : ENCODING_GATE.WARN;
  };
  assert.deepEqual(battery(phaseOnly).sort(), ['load + encodable', 'write + encodable'],
    'a phase-only gate must redden exactly the two encodable cases — those are '
    + 'the only ones that distinguish it from the real gate');
});
