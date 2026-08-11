import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProbe,
  composeProgramList,
  PROBE_HAS,
  PROBE_EMPTY,
  PROBE_UNKNOWN,
} from '@/lib/landing/programProbeOutcome';

/**
 * "No public courses" and "we could not find out" must not be the same answer.
 *
 * Every "unknown is preserved" assertion below is paired with the control that
 * a naive fix fails: a CONFIRMED-empty program must still be dropped. Without
 * it, "never drop anything" — which reintroduces dead cards pointing at empty
 * pages — passes the whole file.
 */

const prog = (id) => ({ program_id: id, program_name: id });
const row = (id, outcome, reason) => ({ id, program: prog(id), outcome, reason });

// ── classifying one probe ───────────────────────────────────────────────────

test('a probe that returned courses is HAS', () => {
  assert.equal(classifyProbe({ rejected: false, itemCount: 7 }), PROBE_HAS);
});

test('a REJECTED probe is UNKNOWN, never empty', () => {
  assert.equal(classifyProbe({ rejected: true }), PROBE_UNKNOWN);
});

test('a zero CONTRADICTED by the course list is UNKNOWN', () => {
  // The silent path: unwrap() returns `{items: []}` for any response it cannot
  // read, so a zero can arrive with nothing thrown. The course list is the
  // second opinion that catches it.
  assert.equal(
    classifyProbe({ rejected: false, itemCount: 0, referencedByCourses: true }),
    PROBE_UNKNOWN
  );
});

test('CONTROL: a zero the course list AGREES with is EMPTY', () => {
  // The case that must still be excluded — a genuinely online-only program.
  assert.equal(
    classifyProbe({ rejected: false, itemCount: 0, referencedByCourses: false }),
    PROBE_EMPTY
  );
});

// ── composing the list ──────────────────────────────────────────────────────

test('a probe error PRESERVES the program the previous snapshot listed', () => {
  const out = composeProgramList({
    rows: [row('DEV', PROBE_UNKNOWN, 'timeout')],
    previousIds: ['DEV'],
  });
  assert.deepEqual(out.programs.map((p) => p.program_id), ['DEV']);
  assert.equal(out.counts.restored, 1);
});

test('CONTROL: a CONFIRMED-empty program is dropped even if it was listed before', () => {
  // The control that stops "never drop anything" passing. A program that has
  // genuinely lost its public courses must leave the tab.
  const out = composeProgramList({
    rows: [row('OLD', PROBE_EMPTY)],
    previousIds: ['OLD'],
  });
  assert.deepEqual(out.programs, []);
  assert.equal(out.counts.empty, 1);
});

test('an unknown program NOT in the previous snapshot is not invented', () => {
  // Not fail-open: never include a program on the strength of not knowing.
  const out = composeProgramList({
    rows: [row('NEW', PROBE_UNKNOWN, 'timeout')],
    previousIds: [],
  });
  assert.deepEqual(out.programs, []);
  assert.match(out.errors[0], /not in previous snapshot, omitted/);
});

test('a mixed run keeps the good, drops the empty, restores the unknown', () => {
  const out = composeProgramList({
    rows: [
      row('DEV', PROBE_HAS),
      row('GONE', PROBE_EMPTY),
      row('FLAKY', PROBE_UNKNOWN, 'ECONNRESET'),
    ],
    previousIds: ['DEV', 'GONE', 'FLAKY'],
  });
  assert.deepEqual(out.programs.map((p) => p.program_id), ['DEV', 'FLAKY']);
  assert.deepEqual(out.counts, { has: 1, empty: 1, unknown: 1, restored: 1 });
});

// ── total failure ───────────────────────────────────────────────────────────

test('every probe unknown reports allUnknown, so the caller can publish nothing', () => {
  const out = composeProgramList({
    rows: [row('A', PROBE_UNKNOWN, 'x'), row('B', PROBE_UNKNOWN, 'x')],
    previousIds: ['A'],
  });
  assert.equal(out.allUnknown, true);
});

test('CONTROL: a healthy run does NOT report allUnknown', () => {
  // Without this, always-true would satisfy the test above and every sync
  // would refuse to publish.
  const out = composeProgramList({ rows: [row('A', PROBE_HAS)], previousIds: [] });
  assert.equal(out.allUnknown, false);
});

test('CONTROL: no programs at all is not a total failure', () => {
  // An empty upstream is an answer. Reporting allUnknown here would freeze the
  // snapshot forever on a site that genuinely has no programs.
  assert.equal(composeProgramList({ rows: [], previousIds: [] }).allUnknown, false);
});

// ── saying what happened ────────────────────────────────────────────────────

test('every unknown is reported, naming the program and the reason', () => {
  // A run that drops programs while reporting `syncErrors: []` is what made
  // this invisible for hours.
  const out = composeProgramList({
    rows: [row('DEV', PROBE_UNKNOWN, 'fetch timed out')],
    previousIds: ['DEV'],
  });
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /DEV/);
  assert.match(out.errors[0], /fetch timed out/);
  assert.match(out.errors[0], /kept from previous snapshot/);
});

test('CONTROL: a clean run reports NO errors', () => {
  // Otherwise every run would look degraded and the signal would be worthless.
  const out = composeProgramList({
    rows: [row('DEV', PROBE_HAS), row('GONE', PROBE_EMPTY)],
    previousIds: [],
  });
  assert.deepEqual(out.errors, []);
});
