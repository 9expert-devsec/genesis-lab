import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canExecuteRename,
  tokenForPreview,
  aliasStepFor,
  GATE,
} from '@/lib/courses/renameExecuteGate';
import { buildRenamePreview, RENAME_STORES } from '@/lib/courses/renameCoursePreview';
import { previewFingerprint, countsFromPreview } from '@/lib/courses/renameCoursePlan';

/**
 * What must be true before the button does anything.
 *
 * Driven through the REAL preview builder, so the gate is judging the shape the
 * action returns rather than one invented here.
 */

const preview = (over = {}) => {
  const matches = Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));
  return buildRenamePreview({
    oldCode: 'ZZTEST-EXCEL-01',
    newCode: 'EXCEL-HR-01',
    msdbCodes: ['ZZTEST-EXCEL-01', 'MSE-L2'],
    extensionCodes: ['ZZTEST-EXCEL-01'],
    urlAlias: '',
    ...over,
    matches: { ...matches, courseExtension: [{ courseId: 'ZZTEST-EXCEL-01' }], ...(over.matches ?? {}) },
  });
};

const ok = (over = {}) => canExecuteRename({
  preview: preview(),
  typedCode: 'EXCEL-HR-01',
  ackUpstream: true,
  ...over,
});

// ── The gate ────────────────────────────────────────────────────────────────

test('everything satisfied → allowed', () => {
  const g = ok();
  assert.equal(g.allowed, true);
  assert.deepEqual(g.reasons, []);
});

test('NO TYPED CODE refuses', () => {
  const g = ok({ typedCode: '' });
  assert.equal(g.allowed, false);
  assert.ok(g.reasons.includes(GATE.NOT_TYPED));
});

test('A WRONG typed code refuses', () => {
  assert.equal(ok({ typedCode: 'EXCEL-HR-02' }).allowed, false);
  assert.equal(ok({ typedCode: 'EXCEL-HR-0' }).allowed, false);
});

/**
 * EXACT, not case-insensitive.
 *
 * A rename that differs only by case is a real and dangerous one — the
 * normalised stores no-op while every exact-match store changes. Accepting
 * `excel-hr-01` for `EXCEL-HR-01` would defeat the confirmation precisely
 * where it matters most.
 */
test('the typed code must match CASE-EXACTLY', () => {
  const g = ok({ typedCode: 'excel-hr-01' });
  assert.equal(g.allowed, false);
  assert.ok(g.reasons.includes(GATE.NOT_TYPED));
});

test('NO UPSTREAM-REACH ACKNOWLEDGEMENT refuses, separately from the typed code', () => {
  const g = ok({ ackUpstream: false });
  assert.equal(g.allowed, false);
  assert.ok(g.reasons.includes(GATE.NOT_ACKED));
  assert.ok(!g.reasons.includes(GATE.NOT_TYPED), 'the two consents are not independent');
});

test('the two consents are BOTH required — neither alone opens the gate', () => {
  assert.equal(ok({ typedCode: '', ackUpstream: true }).allowed, false);
  assert.equal(ok({ typedCode: 'EXCEL-HR-01', ackUpstream: false }).allowed, false);
});

test('NO PREVIEW refuses, whatever else is satisfied', () => {
  const g = canExecuteRename({ preview: null, typedCode: 'EXCEL-HR-01', ackUpstream: true });
  assert.equal(g.allowed, false);
  assert.ok(g.reasons.includes(GATE.NO_PREVIEW));
});

test('A BLOCKED preview refuses — a collision cannot be typed past', () => {
  const collided = preview({ newCode: 'MSE-L2' });
  assert.equal(collided.ok, false);
  const g = canExecuteRename({ preview: collided, typedCode: 'MSE-L2', ackUpstream: true });
  assert.equal(g.allowed, false);
  assert.ok(g.reasons.includes(GATE.BLOCKED));
});

// ── The token ───────────────────────────────────────────────────────────────

test('the token is derived from the preview ON SCREEN', () => {
  const p = preview();
  assert.equal(
    tokenForPreview(p),
    previewFingerprint({ oldCode: p.oldCode, newCode: p.newCode, counts: countsFromPreview(p) })
  );
});

test('a DIFFERENT preview produces a different token — that is the staleness check', () => {
  const a = tokenForPreview(preview());
  const b = tokenForPreview(preview({ matches: { article: [{ slug: 'x' }] } }));
  assert.notEqual(a, b);
});

test('no preview → no token', () => {
  assert.equal(tokenForPreview(null), '');
  assert.equal(canExecuteRename({ preview: null }).token, '');
});

// ── The alias step ──────────────────────────────────────────────────────────

test('a DERIVED url makes the alias step one', () => {
  const step = aliasStepFor(preview({ urlAlias: '' }));
  assert.ok(step, 'a course with no alias got no alias step');
  assert.equal(step.path, '/zztest-excel-01-training-course');
});

test('an ALIASED url has no alias step', () => {
  assert.equal(aliasStepFor(preview({ urlAlias: '/excel-hr' })), null);
});

test('no preview → no alias step', () => {
  assert.equal(aliasStepFor(null), null);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the gate is not a constant', () => {
  assert.notEqual(ok().allowed, ok({ ackUpstream: false }).allowed);
  assert.notEqual(ok().reasons.length, ok({ typedCode: '' }).reasons.length);
});

test('CONTROL: every GATE reason is reachable', () => {
  const seen = new Set([
    ...canExecuteRename({ preview: null }).reasons,
    ...canExecuteRename({ preview: preview({ newCode: 'MSE-L2' }), typedCode: 'MSE-L2', ackUpstream: true }).reasons,
    ...ok({ typedCode: '' }).reasons,
    ...ok({ ackUpstream: false }).reasons,
  ]);
  for (const reason of Object.values(GATE)) {
    assert.ok(seen.has(reason), `${reason} is unreachable — it can never be shown`);
  }
});
