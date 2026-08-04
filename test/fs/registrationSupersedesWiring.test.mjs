import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `supersedesRegistrationId` is a client-supplied string written to the
 * database unverified. That is safe ONLY while nothing resolves it. The value
 * of the annotation and its safety both rest on properties that no unit test
 * observes, because they are properties of code that must NOT exist:
 *
 *   • the route reads it off the RAW body, not the parsed data (the schema
 *     strips unknown keys, so reading `data.` would silently always be null);
 *   • it never becomes a query, a join, or a write target;
 *   • no behaviour branches on it.
 *
 * The obvious next edit — "while we're here, let's cancel the old one" — turns
 * it into a write target chosen by the browser. These pin it shut.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (...p) => readFileSync(path.join(ROOT, ...p), 'utf8');

const ROUTE = read('src', 'app', 'api', 'registration', 'public', 'charge', 'route.js');
const STEP = read('src', 'components', 'registration', 'ReviewAndPayStep.jsx');
const MODEL = read('src', 'models', 'RegisterPublic.js');
const SCHEMA = read('src', 'lib', 'schemas', 'register-public.js');

const flat = (s) => s.replace(/\s+/g, ' ');

test('the sources are readable (the checks can see something)', () => {
  for (const [name, src] of [['route', ROUTE], ['step', STEP], ['model', MODEL]]) {
    assert.ok(src.length > 500, `${name} looks empty (${src.length} chars)`);
  }
  assert.ok(ROUTE.includes('supersedesRegistrationId'), 'the route mentions the field at all');
});

// ── The model ───────────────────────────────────────────────────────────────

test('the model declares the field as a String defaulting to null', () => {
  assert.ok(
    flat(MODEL).includes('supersedesRegistrationId: { type: String, default: null }'),
    'expected `supersedesRegistrationId: { type: String, default: null }`',
  );
});

test('CONTROL: it is NOT an ObjectId ref, which would invite populate()', () => {
  assert.equal(flat(MODEL).includes("ref: 'RegisterPublic'"), false);
  assert.equal(
    /supersedesRegistrationId:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(flat(MODEL)),
    false,
  );
});

// ── The route reads the raw body ────────────────────────────────────────────

test('the route shape-checks the value off the RAW request body', () => {
  assert.ok(
    flat(ROUTE).includes('asRegistrationPointer(body?.supersedesRegistrationId)'),
    'expected `asRegistrationPointer(body?.supersedesRegistrationId)`',
  );
});

test('CONTROL: it does NOT read it off the zod-parsed data', () => {
  // publicRegistrationSchema does not declare the key and zod strips unknowns,
  // so `data.supersedesRegistrationId` would be permanently undefined — the
  // annotation would silently never be recorded and every test here would still
  // pass if it only checked that the route mentioned the name somewhere.
  assert.equal(ROUTE.includes('data.supersedesRegistrationId'), false);
  assert.equal(ROUTE.includes('parsed.data.supersedesRegistrationId'), false);
});

test('CONTROL: the schema still does not declare the key', () => {
  // If it were added, a malformed pointer would become a 400 on a payment.
  assert.equal(SCHEMA.includes('supersedesRegistrationId'), false);
});

test('the route passes it into createPaidRegistration', () => {
  assert.ok(flat(ROUTE).includes('supersedesRegistrationId, });'), 'passed to the create call');
});

// ── It is never resolved, joined to, or written through ─────────────────────

test('the route never resolves the pointer', () => {
  for (const forbidden of ['populate(', 'findById(supersedes', 'findOne({ _id: supersedes']) {
    assert.equal(ROUTE.includes(forbidden), false, `route must not contain \`${forbidden}\``);
  }
});

test('the route never writes to the document the pointer names', () => {
  // The route DOES call findByIdAndUpdate — on doc._id, the registration it
  // just created. Assert every such call targets that and never the pointer.
  const targets = [...ROUTE.matchAll(/findByIdAndUpdate\(\s*([A-Za-z0-9_.?]+)/g)].map((m) => m[1]);
  assert.ok(targets.length > 0, 'the route does update the doc it created');
  for (const t of targets) {
    assert.equal(t, 'doc._id', `findByIdAndUpdate must target doc._id, found ${t}`);
  }
});

test('CONTROL: that scan really finds the update targets', () => {
  // If the regex stopped matching, the loop above would be vacuous.
  const targets = [...ROUTE.matchAll(/findByIdAndUpdate\(\s*([A-Za-z0-9_.?]+)/g)].map((m) => m[1]);
  assert.ok(targets.includes('doc._id'), 'expected at least one doc._id update');
});

test('no behaviour branches on the pointer', () => {
  const f = flat(ROUTE);
  for (const forbidden of [
    'if (supersedesRegistrationId',
    'if (!supersedesRegistrationId',
    'supersedesRegistrationId ?',
    'supersedesRegistrationId &&',
  ]) {
    assert.equal(f.includes(forbidden), false, `route must not branch: \`${forbidden}\``);
  }
});

test('the write site carries the do-not-trust-this warning', () => {
  // The comment is the only thing standing between this and the next edit that
  // starts resolving the value. If it is removed, that is a decision someone
  // should make deliberately.
  assert.ok(
    ROUTE.includes('THIS IS NOT A FOREIGN KEY'),
    'the write site must keep its warning comment',
  );
});

// ── Only the regenerate path sends it ───────────────────────────────────────

test('createQr takes a supersedes argument and forwards it', () => {
  const f = flat(STEP);
  assert.ok(f.includes('async function createQr(supersedes = null)'), 'createQr accepts it');
  assert.ok(
    f.includes('...(supersedes ? { supersedesRegistrationId: supersedes } : {})'),
    'the key is added only when a pointer exists',
  );
});

test('the regenerate button supplies the id of the registration being replaced', () => {
  assert.ok(
    flat(STEP).includes('onRegenerate={() => createQr(pendingTarget?.id ?? null)}'),
    'expected the wrapped call passing pendingTarget.id',
  );
});

test('CONTROL: onRegenerate is NOT passed bare', () => {
  // QrPanelFull wires onRegenerate straight to onClick, so `onRegenerate={createQr}`
  // would hand createQr a MouseEvent as its `supersedes` argument — which is
  // truthy, so a DOM event would be posted as the pointer.
  assert.equal(flat(STEP).includes('onRegenerate={createQr}'), false);
});

test('CONTROL: the first charge of a session sends no pointer', () => {
  // handleConfirm's promptpay branch must call createQr with nothing.
  assert.ok(flat(STEP).includes('if (channel === "promptpay") return createQr();'));
});

test('the card path never sends a pointer', () => {
  // Only the QR regenerate is annotated; a retried card is not, and the audit
  // script says so rather than inferring from the absence.
  const cardCall = flat(STEP).match(/paymentMethod: "credit_card",[^}]*/)?.[0] ?? '';
  assert.ok(cardCall.length > 0, 'found the card charge call');
  assert.equal(cardCall.includes('supersedesRegistrationId'), false);
});
