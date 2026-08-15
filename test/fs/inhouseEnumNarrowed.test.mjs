import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import {
  INHOUSE_STATUS_VALUES,
  INHOUSE_LEGACY_STATUS_MAP,
} from '@/lib/registrations/statuses';

/**
 * THE STORED ENUM IS THE LIVE VOCABULARY, AND NOTHING ELSE.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 * This is the guard for the one change in this commit, and it ships with it
 * because an unguarded enum edit is precisely what the whole round was ordered
 * around. It asserts the model against the module rather than against a list
 * written here — the enum and `INHOUSE_STATUSES` are two spellings of one
 * decision, and a test that spelled it a third time would be the drift the
 * module exists to prevent.
 *
 * ── THE ORDERING THIS COMMIT DEPENDS ON, RESTATED ───────────────────────────
 * Narrowing this list while documents still held `new` or `contacted` was the
 * trap of round 2. Mongoose `enum` is a validator that runs on create/save and
 * never on reads, so a premature narrowing does not break anything you would
 * notice by looking — it breaks `RegisterInhouse.create` in the public in-house
 * API route, which is the ONE write on this model that validates.
 *
 * This file cannot check that the migration ran; no source scan can. What it
 * CAN do is make the two halves of the decision inseparable from here on, so
 * the enum and the vocabulary can never drift apart again.
 */

const MODEL = readSource('src/models/RegisterInhouse.js');

/** The `status` path's enum array, as written in the model. */
function statusEnum(code) {
  const at = code.indexOf('status: {');
  assert.notEqual(at, -1, 'the status path is gone from the model');
  const slice = code.slice(at, at + 400);
  const m = slice.match(/enum:\s*\[([^\]]*)\]/);
  assert.ok(m, 'the status path has no enum — a typo here removes the validation entirely');
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

const ENUM = statusEnum(MODEL.code);

test('the stored enum is exactly the live in-house vocabulary', () => {
  // Compared against the module, not against a literal. If a status is added to
  // INHOUSE_STATUSES the model must follow, and vice versa.
  assert.deepEqual(ENUM, INHOUSE_STATUS_VALUES,
    'the model enum and lib/registrations/statuses.js disagree about what may be stored');
});

test('no RETIRED value survives in the enum', () => {
  // The narrowing itself. Stated separately from the equality above because it
  // is the thing this commit did, and because the failure message should name
  // the value rather than print two arrays.
  for (const retired of Object.keys(INHOUSE_LEGACY_STATUS_MAP)) {
    assert.ok(!ENUM.includes(retired),
      `${retired} is still storable — the enum was not narrowed, or a value was re-added`);
  }
});

test('`paid` is not storable on an in-house document', () => {
  // The rule kept at the vocabulary level rather than at the transition table:
  // an in-house engagement is settled off-platform with no Omise charge, so
  // nothing in the system ever observes the money.
  assert.ok(!ENUM.includes('paid'), '`paid` reached the in-house enum');
});

test('the default is the entry state, and it is a member of the enum', () => {
  // A default outside its own enum fails validation on every create that does
  // not set the field explicitly — which is the shape that would have broken
  // the public in-house form had the enum been narrowed a commit earlier.
  const at = MODEL.code.indexOf('status: {');
  const slice = MODEL.code.slice(at, at + 400);
  const m = slice.match(/default:\s*'([^']+)'/);
  assert.ok(m, 'the status path has no default');
  assert.equal(m[1], 'pending', 'the entry state moved without the API route following');
  assert.ok(ENUM.includes(m[1]), 'the default is not a member of its own enum');
});

test('the API route writes a status the enum accepts', () => {
  // The two spellings of the entry state, pinned against each other. This is
  // the write that VALIDATES — the only one on this model — so a disagreement
  // here is a 500 on the public in-house form, not a quiet inconsistency.
  const ROUTE = readSource('src/app/api/registration/inhouse/route.js');
  const m = ROUTE.code.match(/status:\s*'([^']+)'/);
  assert.ok(m, 'the in-house create no longer sets a status explicitly');
  assert.ok(ENUM.includes(m[1]),
    `the route creates documents with status '${m[1]}', which the model would reject`);
});

test('CONTROL: the enum parser reads a real list, not an empty one', () => {
  // Every assertion above is "X is not in ENUM". If the parser had returned []
  // — a renamed path, a reformatted array, a regex that stopped matching — all
  // of them would pass on a model that stores anything at all.
  assert.ok(ENUM.length >= 3, `the parser found only ${ENUM.length} enum members`);
  assert.ok(ENUM.includes('pending'), 'the parser did not find a value known to be there');
});

test('CONTROL: the parser WOULD see a retired value if one were present', () => {
  // Proves the narrowing assertion is discriminating rather than blind: the
  // same parser, run over a model source that still holds the union, finds the
  // retired values. Built inline rather than read from git, so this control
  // does not depend on history staying reachable.
  const widened = "status: {\n  type: String,\n  enum: ['pending', 'quoted', 'cancelled', 'new', 'contacted'],\n  default: 'pending',\n},";
  const parsed = statusEnum(widened);
  assert.ok(parsed.includes('new'), 'the control is inert — the parser cannot see a retired value');
  assert.ok(parsed.includes('contacted'));
  assert.equal(parsed.length, 5);
});
