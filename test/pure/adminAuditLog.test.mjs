import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { AUDIT_CONTRACT_ENTRIES } from '@/lib/audit/auditContract';
import { MENU_ENUM, UNKNOWN_MENU } from '@/models/AdminAuditLog';
import {
  normalizeMenu,
  capPayload,
  buildAuditRow,
  recordAdminAction,
  recordAdminActionAfter,
  reducePayload,
  MAX_PAYLOAD_CHARS,
  TRUNCATED_PREVIEW_CHARS,
} from '@/lib/audit/recordAdminAction';

// The admin action history writer. Everything here is exercised WITHOUT a Mongo
// connection: the model is imported only for its exported vocabulary, and the
// writer takes a `deps` seam (the same test seam shape as
// webhooks/handlers.js::collectCourseAliasPaths) so a fake model can throw on
// demand.
//
// WHAT THIS FILE CANNOT SEE: that the schema's enum actually rejects a bad
// `menu` at write time, that the four indexes are created, or that a real
// Mongoose `create()` accepts these shapes — all of those need a live
// connection and belong to the smoke tier, not here. What it CAN see is that
// nothing reaches the model in a shape the schema would reject, which is the
// half that fails silently.

// A key taken from the live registry rather than hardcoded, so these tests
// cannot drift into asserting a string this file made up.
const REAL_KEY = ALL_PAGE_KEYS[0];
const FAKE_KEY = `${REAL_KEY}X`; // one character off — a plausible typo

// A real (menu, entity) PAIR, likewise taken at runtime.
//
// REAL_KEY alone is not enough any more. It is ALL_PAGE_KEYS[0] — `dashboard` —
// which is read-only and deliberately has NO contract entry, so since the
// writer began enforcing the diff policy every payload sent under it is
// correctly reduced to act_only and warned about. Tests that are about payload
// handling need a pair the contract actually knows, and tests that are about
// the MENU vocabulary keep using REAL_KEY, because that is what they are about.
const FULL_PAIR = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'full');
const STATUS_PAIR = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'status_only');

// ── menu vocabulary ────────────────────────────────────────────────

test('MENU_ENUM is exactly the RBAC registry plus the catch-all', () => {
  assert.deepEqual(
    new Set(MENU_ENUM),
    new Set([...ALL_PAGE_KEYS, UNKNOWN_MENU]),
    'the enum must be derived from ALL_PAGE_KEYS, not a second hand-kept list'
  );
  assert.equal(MENU_ENUM.length, ALL_PAGE_KEYS.length + 1);
});

test('CONTROL: the catch-all is NOT already a registry key', () => {
  // If UNKNOWN_MENU happened to be a real page key, every fallback assertion
  // below would pass for the wrong reason — the "unknown" branch would be
  // indistinguishable from a successful lookup.
  assert.ok(
    !ALL_PAGE_KEYS.includes(UNKNOWN_MENU),
    `${UNKNOWN_MENU} must not be a real page key`
  );
});

test('a registry key is stored as-is and carries no raw', () => {
  const r = normalizeMenu(REAL_KEY);
  assert.equal(r.menu, REAL_KEY);
  assert.equal(r.menuRaw, '');
  assert.equal(r.ok, true);
});

test('CONTROL: a one-character typo of that SAME key does not pass', () => {
  // Pairs with the test above. Together they prove normalizeMenu consults the
  // registry rather than echoing its input — a pass-through implementation
  // reddens here, and a hardcoded-reject implementation reddens above.
  const r = normalizeMenu(FAKE_KEY);
  assert.equal(r.menu, UNKNOWN_MENU);
  assert.equal(r.ok, false);
});

test('an unknown key is FILED, not dropped — the raw value is preserved', () => {
  const r = normalizeMenu('  totally-made-up  ');
  assert.equal(r.menu, UNKNOWN_MENU);
  assert.equal(r.menuRaw, 'totally-made-up', 'trimmed, but kept verbatim');
});

test('CONTROL: menuRaw is conditional — a good key leaves it empty', () => {
  assert.equal(normalizeMenu(REAL_KEY).menuRaw, '');
});

test('a missing / non-string menu falls back without throwing', () => {
  for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
    const r = normalizeMenu(bad);
    assert.equal(r.menu, UNKNOWN_MENU, `menu for ${JSON.stringify(bad)}`);
    assert.equal(r.ok, false);
  }
});

// ── payload ceiling ────────────────────────────────────────────────

test('an oversized payload is TRUNCATED, not dropped', () => {
  const big = { html: 'y'.repeat(MAX_PAYLOAD_CHARS * 3) };
  const out = capPayload(big);
  assert.equal(out.__truncated, true);
  assert.equal(out.chars, JSON.stringify(big).length, 'reports the real size');
  assert.equal(out.preview.length, TRUNCATED_PREVIEW_CHARS);
  assert.ok(
    JSON.stringify(big).startsWith(out.preview),
    'the preview is a genuine prefix, so it is evidence of what was there'
  );
});

test('CONTROL: a small payload passes through untouched, same reference', () => {
  // Without this, an unconditional `return { __truncated: true }` would satisfy
  // the test above.
  const small = { status: 'cancelled' };
  assert.equal(capPayload(small), small, 'identity — not a re-serialised copy');
});

test('the ceiling is a real boundary, not a vibe', () => {
  // JSON of a bare string is the string plus two quotes.
  const atLimit = 'x'.repeat(MAX_PAYLOAD_CHARS - 2);
  const overLimit = 'x'.repeat(MAX_PAYLOAD_CHARS - 1);
  assert.equal(JSON.stringify(atLimit).length, MAX_PAYLOAD_CHARS);
  assert.equal(capPayload(atLimit), atLimit, 'exactly at the ceiling is kept');
  assert.equal(capPayload(overLimit).__truncated, true, 'one char over is capped');
});

test('an unserialisable payload becomes a marker instead of throwing', () => {
  const circular = { name: 'loop' };
  circular.self = circular;
  const out = capPayload(circular);
  assert.equal(out.__unserialisable, true);
  assert.ok(typeof out.reason === 'string' && out.reason.length > 0);
});

test('CONTROL: an equivalent NON-circular object gets no marker', () => {
  const plain = { name: 'loop', self: { name: 'loop' } };
  assert.equal(capPayload(plain), plain);
  assert.equal(plain.__unserialisable, undefined);
});

test('null and undefined normalise to null, not to a marker', () => {
  assert.equal(capPayload(null), null);
  assert.equal(capPayload(undefined), null);
});

// ── row building ───────────────────────────────────────────────────

test('buildAuditRow produces every field the schema requires', () => {
  // MOVED to a real contract pair. Under the unregistered pair this used, the
  // `before`/`after` null assertions below were true because the fail-closed
  // reduction nulled them — not because the caller passed nothing, which is
  // what the test means to say.
  const row = buildAuditRow({
    menu: FULL_PAIR.menu,
    action: 'delete',
    entity: FULL_PAIR.entity,
    recordId: 'abc123',
    recordLabel: 'Excel L1 — รุ่น 12',
    actor: { id: 'admin-1', name: 'Pim' },
  });
  assert.equal(row.menu, FULL_PAIR.menu);
  assert.equal(row.action, 'delete');
  assert.equal(row.entity, FULL_PAIR.entity);
  assert.equal(row.recordId, 'abc123');
  assert.equal(row.actor.id, 'admin-1');
  assert.equal(row.actor.name, 'Pim');
  assert.equal(row.before, null);
  assert.equal(row.after, null);
});

test('ids are coerced to strings — an ObjectId or a number must not leak through', () => {
  const row = buildAuditRow({ menu: REAL_KEY, recordId: 42, actor: { id: 7 } });
  assert.equal(row.recordId, '42');
  assert.equal(row.actor.id, '7');
});

test('CONTROL: coercion is real — the raw number would not be equal', () => {
  const row = buildAuditRow({ menu: REAL_KEY, recordId: 42 });
  assert.notEqual(row.recordId, 42, 'strict-equal against the number must fail');
});

test('action defaults to update when absent, and is preserved when given', () => {
  assert.equal(buildAuditRow({ menu: REAL_KEY }).action, 'update');
  assert.equal(buildAuditRow({ menu: REAL_KEY, action: 'reorder' }).action, 'reorder');
});

test('buildAuditRow applies the ceiling to before, after AND meta', () => {
  // MOVED to a `full` pair. Under any other policy `before`/`after` are reduced
  // to null before the cap is reached, so this would have asserted the ceiling
  // on fields the policy had already emptied.
  const big = 'z'.repeat(MAX_PAYLOAD_CHARS * 2);
  const row = buildAuditRow({
    menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, before: big, after: big, meta: big,
  });
  for (const field of ['before', 'after', 'meta']) {
    assert.equal(row[field].__truncated, true, `${field} is capped`);
  }
});

// ── the writer: never throws, never silently does nothing ──────────

function fakeModel() {
  const created = [];
  return {
    created,
    create: async (row) => { created.push(row); return row; },
  };
}
function throwingModel() {
  return { create: async () => { throw new Error('E11000 or the DB is down'); } };
}
function collectWarnings() {
  const lines = [];
  return { lines, warn: (...args) => lines.push(args.join(' ')) };
}

test('a throwing database does NOT surface to the caller', async () => {
  const { warn } = collectWarnings();
  const ok = await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'delete', recordId: 'x' },
    { AdminAuditLog: throwingModel(), warn }
  );
  assert.equal(ok, false, 'reports failure by return value only');
});

test('CONTROL: a working database writes exactly one row with the real content', async () => {
  // Without this, a writer that did nothing at all would pass the test above.
  const model = fakeModel();
  const { warn } = collectWarnings();
  const ok = await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'delete', recordId: 'x', actor: { id: 'a1', name: 'Pim' } },
    { AdminAuditLog: model, warn }
  );
  assert.equal(ok, true);
  assert.equal(model.created.length, 1);
  assert.equal(model.created[0].menu, FULL_PAIR.menu);
  assert.equal(model.created[0].action, 'delete');
  assert.equal(model.created[0].recordId, 'x');
  assert.equal(model.created[0].actor.name, 'Pim');
});

test('a failed write leaves a warning — this trail is not silent', async () => {
  const { lines, warn } = collectWarnings();
  await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'update' },
    { AdminAuditLog: throwingModel(), warn }
  );
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('[audit]'), 'tagged so it is greppable in platform logs');
});

test('CONTROL: a successful write warns about nothing', async () => {
  const { lines, warn } = collectWarnings();
  await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'update' },
    { AdminAuditLog: fakeModel(), warn }
  );
  assert.deepEqual(lines, [], 'no noise on the happy path');
});

test('an unknown menu key still WRITES the row — the event is never lost', async () => {
  const model = fakeModel();
  const { lines, warn } = collectWarnings();
  const ok = await recordAdminAction(
    { menu: FAKE_KEY, entity: FULL_PAIR.entity, action: 'toggle', recordId: 'r-9' },
    { AdminAuditLog: model, warn }
  );
  assert.equal(ok, true, 'the row is written, not rejected');
  assert.equal(model.created.length, 1);
  assert.equal(model.created[0].menu, UNKNOWN_MENU);
  assert.equal(model.created[0].menuRaw, FAKE_KEY, 'the bad key is preserved for repair');
  assert.equal(model.created[0].action, 'toggle');
  assert.equal(model.created[0].recordId, 'r-9', 'the WHAT survives the bad menu');
  // TWO warnings now, not one. The bad key is reported, and then the pair
  // (UNKNOWN_MENU, entity) has no contract — so the fail-closed reduction
  // reports that too. Both are correct and both are worth saying: the first
  // names the offending caller, the second says the payload was stripped.
  assert.equal(lines.length, 2, 'and both problems are reported');
  assert.ok(lines.some((l) => l.includes(FAKE_KEY)), 'the bad key is named');
  assert.ok(lines.some((l) => l.includes('no contract')), 'as is the reduction');
});

test('CONTROL: a good menu key produces no menuRaw and no warning', async () => {
  const model = fakeModel();
  const { lines, warn } = collectWarnings();
  await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'toggle', recordId: 'r-9' },
    { AdminAuditLog: model, warn }
  );
  assert.equal(model.created[0].menuRaw, '');
  assert.deepEqual(lines, []);
});

test('an oversized before/after reaches the model already capped', async () => {
  const model = fakeModel();
  const { warn } = collectWarnings();
  await recordAdminAction(
    { menu: FULL_PAIR.menu, entity: FULL_PAIR.entity, action: 'update', before: { body: 'q'.repeat(50_000) } },
    { AdminAuditLog: model, warn }
  );
  assert.equal(model.created[0].before.__truncated, true);
  assert.ok(
    JSON.stringify(model.created[0]).length < 5000,
    'the whole row stays small — this is the backstop against a caller handing over a document'
  );
});

// ── the diff policy, enforced by the writer ────────────────────────

test('CONTROL: the pairs these tests rely on exist and differ', () => {
  // Everything below is meaningless if the contract has no `full` pair or no
  // `status_only` pair — the `find()` would return undefined and every
  // assertion would throw on property access rather than fail on its claim.
  assert.ok(FULL_PAIR, 'the contract must declare at least one full pair');
  assert.ok(STATUS_PAIR, 'and at least one status_only pair');
  assert.notEqual(FULL_PAIR.diff, STATUS_PAIR.diff, 'and they must differ');
});

test('status_only STRIPS a PII payload down to the status enum', () => {
  // The assertion §5.2 exists for. A careless sweep edit that hands over the
  // whole registration must not put a customer's name, email and phone into an
  // append-only collection whose entire premise is that rows are never
  // modified — a deletion request could not redact them.
  const wholeRegistration = {
    status: 'cancelled',
    firstName: 'Somchai', lastName: 'P.',
    email: 'somchai@example.com', phone: '0812345678',
    companyName: 'ACME', taxId: '0105500000000',
    attendees: [{ firstName: 'A', email: 'a@example.com' }],
  };
  const out = reducePayload(wholeRegistration, 'status_only');
  assert.deepEqual(out, { status: 'cancelled' }, 'only the status survives');
  for (const leaked of ['email', 'phone', 'firstName', 'lastName', 'companyName', 'taxId', 'attendees']) {
    assert.equal(leaked in out, false, `${leaked} must not survive`);
  }
});

test('CONTROL: the SAME payload under `full` is untouched', () => {
  // Without this, a reduction that emptied everything would satisfy the test
  // above while destroying the trail's value on every content menu.
  const payload = { title: 'Excel L1', email: 'not-pii-here@example.com' };
  assert.equal(reducePayload(payload, 'full'), payload, 'identity, not a copy');
});

test('every policy reduces to exactly what the contract promises', () => {
  const rich = { status: 'paid', orderedIds: ['a', 'b'], email: 'x@example.com', n: 3 };
  assert.deepEqual(reducePayload(rich, 'status_only'), { status: 'paid' });
  assert.deepEqual(reducePayload(rich, 'ordered_ids'), { orderedIds: ['a', 'b'] });
  assert.equal(reducePayload(rich, 'count_only'), null, 'the count belongs in meta');
  assert.equal(reducePayload(rich, 'act_only'), null);
  assert.equal(reducePayload(rich, 'full'), rich);
});

test('a policy-shaped key that is ABSENT reduces to null, not to a partial object', () => {
  // `{}` would read as "there was a diff and it was empty", which is a
  // different claim from "this policy permits nothing here".
  assert.equal(reducePayload({ email: 'x@example.com' }, 'status_only'), null);
  assert.equal(reducePayload({ email: 'x@example.com' }, 'ordered_ids'), null);
  assert.equal(reducePayload('a bare string', 'status_only'), null);
  assert.equal(reducePayload([1, 2, 3], 'status_only'), null, 'an array is not a status pair');
});

test('an UNREGISTERED pair fails closed to act_only, and says so', () => {
  // `entity` is free-form in the schema, so a typo has no symptom today: the
  // row is written, looks right in the central list, and is permanently
  // invisible to the inline widget's {menu, entity, recordId} query. Failing
  // closed gives it one, and stops the typo smuggling a payload past the
  // policy it was supposed to have.
  const lines = [];
  const row = buildAuditRow(
    { menu: STATUS_PAIR.menu, entity: 'registrationz', before: { status: 'a', email: 'x@example.com' } },
    { warn: (...args) => lines.push(args.join(' ')) }
  );
  assert.equal(row.before, null, 'reduced to act_only, not to the typo pair policy');
  assert.equal(row.entity, 'registrationz', 'but the row is still WRITTEN — never rejected');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('registrationz'), 'and the offending pair is named');
});

test('CONTROL: the REGISTERED sibling of that pair does not warn', () => {
  // Pairs with the test above: a lookup that always missed would warn on every
  // row and reduce the whole trail to act_only, which is exactly the failure
  // that looks like "the policy is working".
  const lines = [];
  const row = buildAuditRow(
    { menu: STATUS_PAIR.menu, entity: STATUS_PAIR.entity, before: { status: 'a', email: 'x@example.com' } },
    { warn: (...args) => lines.push(args.join(' ')) }
  );
  assert.deepEqual(lines, [], 'a registered pair is silent');
  assert.deepEqual(row.before, { status: 'a' }, 'and gets its real policy, not act_only');
});

test('the reduction runs BEFORE the size cap', () => {
  // Order matters. Capping first would turn an oversized status_only payload
  // into a truncation marker carrying 200 characters of whatever the caller
  // handed over — which is exactly the personal data the policy exists to keep
  // out, preserved as "evidence".
  const huge = { status: 'cancelled', notes: 'z'.repeat(MAX_PAYLOAD_CHARS * 3) };
  const row = buildAuditRow(
    { menu: STATUS_PAIR.menu, entity: STATUS_PAIR.entity, before: huge },
    { warn() {} }
  );
  assert.deepEqual(row.before, { status: 'cancelled' });
  assert.equal(row.before.__truncated, undefined, 'no marker, because nothing was oversized');
});

test('meta is NOT reduced — count_only depends on it surviving', () => {
  // `meta` is outside the diff scale by design: it holds structured extras that
  // are not a field diff, and it is already bounded by capPayload.
  const row = buildAuditRow(
    { menu: STATUS_PAIR.menu, entity: STATUS_PAIR.entity, before: { status: 'x' }, meta: { attendees: 12 } },
    { warn() {} }
  );
  assert.deepEqual(row.meta, { attendees: 12 }, 'the count reaches the row');
});

// ── recordAdminActionAfter: the one call sites use ─────────────────

test('recordAdminActionAfter schedules the write and does not await it', () => {
  const model = fakeModel();
  const scheduled = [];
  const out = recordAdminActionAfter(
    { menu: REAL_KEY, action: 'delete', recordId: 'r-1' },
    {
      after: (cb) => { scheduled.push(cb); },
      record: async (entry) => { await recordAdminAction(entry, { AdminAuditLog: model, warn() {} }); },
    }
  );
  assert.equal(out, undefined, 'returns nothing — there is no boolean to check');
  assert.equal(scheduled.length, 1, 'exactly one callback handed to after()');
  assert.equal(model.created.length, 0, 'and NOTHING is written until it runs');
});

test('the scheduled callback really writes the row when it runs', async () => {
  // CONTROL for the test above: without this, a scheduler that captured the
  // callback and dropped it would pass, and the trail would be permanently
  // empty while every assertion stayed green.
  const model = fakeModel();
  let captured = null;
  recordAdminActionAfter(
    { menu: REAL_KEY, action: 'delete', recordId: 'r-1' },
    {
      after: (cb) => { captured = cb; },
      record: (entry) => recordAdminAction(entry, { AdminAuditLog: model, warn() {} }),
    }
  );
  await captured();
  assert.equal(model.created.length, 1);
  assert.equal(model.created[0].recordId, 'r-1');
  assert.equal(model.created[0].action, 'delete');
});

test('a throwing after() warns and DROPS the row — no floating promise', () => {
  // The only way to reach this branch is an action invoked outside a request
  // context (a script, a seed, a test), where a lost row is the correct
  // outcome: nothing a human did in the admin happened. The tempting fallback
  // — call the writer without awaiting — is a real hazard in a serverless
  // runtime for a row nobody wants, so it is deliberately absent.
  const model = fakeModel();
  const { lines, warn } = collectWarnings();
  let recordCalled = 0;
  const out = recordAdminActionAfter(
    { menu: REAL_KEY, action: 'update' },
    {
      after: () => { throw new Error('after() called outside a request scope'); },
      record: () => { recordCalled += 1; return recordAdminAction({}, { AdminAuditLog: model, warn() {} }); },
      warn,
    }
  );
  assert.equal(out, undefined, 'still returns nothing');
  assert.equal(recordCalled, 0, 'the writer is NOT called as a fallback');
  assert.equal(model.created.length, 0, 'so no row is written');
  assert.equal(lines.length, 1, 'but it is not silent');
  assert.ok(lines[0].includes('[audit]'), 'tagged so it is greppable in platform logs');
});

test('CONTROL: a working after() warns about nothing', () => {
  // Pairs with the test above — proves the warning is conditional on the throw
  // rather than emitted on every call.
  const { lines, warn } = collectWarnings();
  recordAdminActionAfter(
    { menu: REAL_KEY, action: 'update' },
    { after: (cb) => cb(), record: () => {}, warn }
  );
  assert.deepEqual(lines, [], 'no noise on the happy path');
});

test('recordAdminActionAfter never throws, whatever the scheduler does', () => {
  // Rule 1 of this writer's contract, at the new entry point: a lost audit row
  // must never cost a save. A call site does not wrap this in try/catch — that
  // is the whole reason the helper exists — so it must absorb everything.
  for (const hostile of [
    () => { throw new Error('boom'); },
    () => { throw 'a string, not an Error'; },
    undefined,
  ]) {
    assert.doesNotThrow(() => recordAdminActionAfter(
      { menu: REAL_KEY, action: 'update' },
      { after: hostile, record: () => {}, warn() {} }
    ));
  }
});

test('a pathological entry cannot escape as an exception', async () => {
  // A getter that throws is the one shape buildAuditRow cannot defend against
  // field by field; the writer must still absorb it.
  const hostile = { menu: REAL_KEY, action: 'update' };
  Object.defineProperty(hostile, 'recordId', {
    get() { throw new Error('hostile getter'); },
    enumerable: true,
  });
  const { lines, warn } = collectWarnings();
  const ok = await recordAdminAction(hostile, { AdminAuditLog: fakeModel(), warn });
  assert.equal(ok, false);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('[audit]'));
});
