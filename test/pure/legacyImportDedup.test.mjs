import { test } from 'node:test';
import assert from 'node:assert/strict';

import RegisterPublic from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';

/**
 * THE DEDUP KEY FOR THE LEGACY IMPORT — the field, and the index that makes it
 * a guarantee rather than a label.
 *
 * ══ WHAT THIS PROVES, AND WHAT IT CANNOT ════════════════════════════════════
 *
 * There is no MongoDB in this runner, so nothing here observes a real server
 * rejecting a real insert. What it does instead is the same move
 * test/pure/dashboardQueue makes with its filter evaluator: read the DECLARATION
 * the application actually ships — `schema.indexes()`, not the text of the model
 * file — and run a small, honest enforcer over it.
 *
 * That splits the claim in two, and it is worth being precise about which half
 * lands where:
 *
 *   · THE DECLARATION IS REAL. `schema.indexes()` is what Mongoose hands the
 *     driver at index-build time. If the spec is wrong — not unique, not
 *     partial, over the wrong path — these assertions fail on the real thing.
 *   · THE ENFORCEMENT IS SIMULATED. The enforcer below is ~15 lines and is
 *     itself put under control: each half of the spec is deleted in turn and the
 *     outcome is shown to change. An enforcer that accepted everything would
 *     fail those.
 *
 * What remains uncovered, stated rather than implied: that MongoDB's actual
 * `$exists` partial-index semantics match the enforcer's. They are documented to
 * (a missing path and a null PARENT are both "does not exist"; an explicit null
 * AT the path exists and is indexed), and the model's own comment records the
 * one shape that surprises. Confirming it takes a server, and that belongs to
 * the import round, not this one.
 *
 * ══ WHY THE FIELD EXISTS AT ALL ═════════════════════════════════════════════
 * The import is RE-RUNNABLE — a bulk run, then a catch-up run on cutover night,
 * the same script over the same source table. `legacy.sid` (Drupal
 * `webform_submission.sid`) is the only thing that makes the second run insert
 * nothing the first already inserted. See the models for the full reasoning.
 */

const SID_PATH = 'legacy.sid';

/** The declared index over `legacy.sid`, as Mongoose will hand it to the driver. */
function sidIndex(schema) {
  const found = schema
    .indexes()
    .filter(([fields]) => Object.keys(fields).length === 1 && SID_PATH in fields);
  assert.equal(found.length, 1,
    `expected exactly one index over ${SID_PATH}, found ${found.length}`);
  return found[0];
}

/**
 * Walk a dotted path. A NULL INTERMEDIATE YIELDS `undefined`, not null, and that
 * distinction is the whole of the partial filter: `legacy: null` — the default,
 * held by every document this system has ever written — means `legacy.sid` DOES
 * NOT EXIST and must stay out of the index. `legacy: { sid: null }` is a
 * different thing: that path exists, holds null, and would be indexed.
 */
const at = (doc, path) =>
  path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), doc);

/**
 * A unique/partial index, enforced over documents in memory, BUILT FROM THE
 * DECLARED SPEC rather than from a restatement of it.
 *
 * It throws on any partial-filter operator it has not been taught, for the
 * reason dashboardQueue's evaluator does: an enforcer that silently ignored a
 * clause it did not understand would report "no collision" for the wrong reason.
 */
function enforcer([fields, options = {}]) {
  const key = Object.keys(fields)[0];
  const pfe = options.partialFilterExpression ?? null;
  const seen = new Set();

  const isIndexed = (doc) => {
    if (!pfe) return true;
    return Object.entries(pfe).every(([path, cond]) => {
      if (cond && typeof cond === 'object' && '$exists' in cond) {
        return (at(doc, path) !== undefined) === cond.$exists;
      }
      throw new Error(`the enforcer does not know ${JSON.stringify(cond)} — add it deliberately`);
    });
  };

  return function insert(doc) {
    if (!isIndexed(doc)) return { saved: true, why: 'not in the index' };
    // Mongo indexes a missing key as null; only reachable here when the index is
    // NOT partial, which is exactly what the control below exercises.
    const value = at(doc, key) ?? null;
    if (options.unique && seen.has(value)) return { saved: false, why: 'duplicate key' };
    seen.add(value);
    return { saved: true, why: 'indexed' };
  };
}

// The four documents every case below is built from.
const imported    = (sid) => ({ legacy: { sid, webformId: 'registration_public', importedAt: new Date() } });
const notImported = () => ({ legacy: null });

const MODELS = [
  ['RegisterPublic', RegisterPublic],
  ['RegisterInhouse', RegisterInhouse],
];

/**
 * The wizard's `notes` max, dug out of the zod tree.
 *
 * `publicRegistrationSchema` is `z.object({...}).superRefine(...)`, so it is a
 * ZodEffects wrapping the object, and `notes` is itself
 * `.max(500).optional().or(z.literal(''))` — a union over an optional over a
 * string. Both wrappers are unwrapped by SHAPE rather than by a fixed path, so
 * a harmless reformulation (dropping the `.or`, say) does not fail this while
 * the 500 is still there. It returns null when nothing is found, and the
 * assertion's `500` is what catches that.
 */
function wizardNotesMax() {
  let root = publicRegistrationSchema;
  for (let i = 0; i < 10 && root?._def?.typeName === 'ZodEffects'; i++) root = root._def.schema;
  let node = root?.shape?.notes ?? null;
  for (let i = 0; i < 10 && node && !node._def?.checks; i++) {
    node = node._def?.innerType ?? node._def?.options?.[0] ?? null;
  }
  return node?._def?.checks?.find((c) => c.kind === 'max')?.value ?? null;
}

// ── 1. THE FIELDS ARE DECLARED, ON BOTH COLLECTIONS ─────────────────────────

test('both models declare `legacy` as a subdocument defaulting to null', () => {
  for (const [name, Model] of MODELS) {
    const path = Model.schema.path('legacy');
    assert.ok(path, `${name} has no \`legacy\` path — an imported row has nowhere to record its origin`);
    assert.equal(path.instance, 'Embedded', `${name}.legacy is ${path.instance}, not a subdocument`);
    assert.equal(path.defaultValue, null,
      `${name}.legacy does not default to null — "not imported" must be a stated state, `
      + 'not an absent one, or the partial index has nothing to exclude');
    assert.equal(path.schema.options._id, false, `${name}.legacy gives each stamp its own _id`);
  }
});

test('the legacy subdocument carries the five fields the import writes', () => {
  const EXPECTED = { sid: 'Number', serial: 'Number', webformId: 'String', importedAt: 'Date', raw: 'Mixed' };
  for (const [name, Model] of MODELS) {
    const sub = Model.schema.path('legacy').schema;
    for (const [field, instance] of Object.entries(EXPECTED)) {
      const p = sub.path(field);
      assert.ok(p, `${name}.legacy.${field} is missing`);
      assert.equal(p.instance, instance, `${name}.legacy.${field} is ${p.instance}, expected ${instance}`);
    }
  }
});

test('both models declare `legacyInvoiceAddress` as a trimmed String', () => {
  for (const [name, Model] of MODELS) {
    const path = Model.schema.path('legacyInvoiceAddress');
    assert.ok(path, `${name} has no \`legacyInvoiceAddress\` — the legacy address blob has nowhere to go`);
    assert.equal(path.instance, 'String', `${name}.legacyInvoiceAddress is ${path.instance}`);
    assert.equal(path.options.trim, true, `${name}.legacyInvoiceAddress is not trimmed`);
  }
});

test('the customer\'s own text fields are UNTOUCHED — the address may not be merged into them', () => {
  /**
   * The ruling, asserted rather than only written down. `notes` (public) and
   * `message` (in-house) are quoted back to the customer, so an import that
   * appended an address to either would mail system-generated text to them as
   * though they had written it. This cannot catch a WRITER that concatenates —
   * it pins that the two fields still exist, separately, with their own limits,
   * so the destination for the blob is unambiguous.
   */
  const notes = RegisterPublic.schema.path('notes');
  assert.equal(notes.instance, 'String');
  /**
   * ── 500 → 2000 WHEN THE IMPORT BECAME A WRITER, AND THE ASYMMETRY IS PINNED
   *    IN BOTH DIRECTIONS ─────────────────────────────────────────────────
   *
   * The STORAGE FLOOR takes 2000: the legacy import carries customer `remark`
   * text up to 559 characters (measured across 275 rows, two of them over 500),
   * and a floor that refused them would drop a customer's words or fail a row
   * that is not wrong about anything.
   *
   * The WIZARD still takes 500, because that is a product decision about how
   * long a note a customer should type, not a fact about storage. Asserted here
   * TOGETHER, the way test/fs/rosterSeatLock pins the AttendeeSchema asymmetry —
   * so that "tidying" either side into agreement goes red rather than silently
   * changing the other decision.
   */
  assert.equal(notes.options.maxlength, 2000,
    'the storage floor no longer accepts what the legacy import writes (max 559 chars)');
  assert.equal(wizardNotesMax(), 500,
    "the WIZARD's 500-character rule was changed — that is a product decision and "
    + 'widening the storage floor was never a reason to touch it');

  const message = RegisterInhouse.schema.path('message');
  assert.equal(message.instance, 'String');
  assert.equal(message.options.maxlength, 2000, 'in-house `message` changed shape');

  for (const [name, Model] of MODELS) {
    assert.notEqual(Model.schema.path('legacyInvoiceAddress').path, 'notes', `${name} aliased the blob onto notes`);
  }
});

// ── 2. THE INDEX IS UNIQUE, AND PARTIAL ─────────────────────────────────────

test('both models declare a UNIQUE PARTIAL index over legacy.sid', () => {
  for (const [name, Model] of MODELS) {
    const [fields, options] = sidIndex(Model.schema);
    assert.equal(fields[SID_PATH], 1, `${name}: the index is not ascending over ${SID_PATH}`);
    assert.equal(options?.unique, true,
      `${name}: the index is not unique — then a catch-up run can insert a row it already imported`);
    assert.deepEqual(options?.partialFilterExpression, { [SID_PATH]: { $exists: true } },
      `${name}: the index is not restricted to imported documents — every non-imported row would `
      + 'collide with every other on a shared null, and the SECOND ordinary registration would fail to save');
  }
});

// ── 3. THE CONTROL: WHAT SAVES, AND WHAT COLLIDES ───────────────────────────

test('CONTROL: an imported row and a non-imported row both save; a REPEATED sid collides', () => {
  for (const [name, Model] of MODELS) {
    const insert = enforcer(sidIndex(Model.schema));

    assert.equal(insert(imported(8801)).saved, true, `${name}: the first imported row did not save`);
    assert.equal(insert(notImported()).saved, true, `${name}: a non-imported row did not save`);
    // A SECOND non-imported row. This is the one the partial clause buys: under
    // a plain unique index it would collide with the first on a shared null.
    assert.equal(insert(notImported()).saved, true,
      `${name}: a second non-imported row did not save — the index is not partial in effect`);
    assert.equal(insert(imported(9002)).saved, true, `${name}: a different sid did not save`);

    const repeat = insert(imported(8801));
    assert.equal(repeat.saved, false,
      `${name}: THE CATCH-UP RUN'S RE-INSERT WAS ACCEPTED — sid 8801 is already stored, and the `
      + 'second run would duplicate every row it re-reads');
    assert.equal(repeat.why, 'duplicate key');
  }
});

test('CONTROL: dropping `unique` from the spec lets the repeated sid through', () => {
  /**
   * The `saved === false` above passes for an enforcer that rejects everything
   * and for one that never gets that far. Both halves of the spec are therefore
   * deleted in turn and the outcome shown to change — if either deletion left
   * the result the same, the assertion above would be proving nothing.
   */
  const [fields, options] = sidIndex(RegisterPublic.schema);
  const insert = enforcer([fields, { ...options, unique: false }]);

  assert.equal(insert(imported(8801)).saved, true);
  assert.equal(insert(imported(8801)).saved, true,
    'the probe cannot see uniqueness at all — the collision assertion above proves nothing');
});

test('CONTROL: dropping `partialFilterExpression` makes ordinary registrations collide', () => {
  /**
   * The half that is easy to leave out, and whose absence would be found in
   * production rather than here: a plain unique index over `legacy.sid` indexes
   * every non-imported document under a shared null, so the SECOND ordinary
   * registration the site ever takes fails to save.
   */
  const [fields, options] = sidIndex(RegisterPublic.schema);
  const insert = enforcer([fields, { unique: options.unique }]); // partial clause removed

  assert.equal(insert(notImported()).saved, true, 'the first non-imported row');
  assert.equal(insert(notImported()).saved, false,
    'without the partial clause a second non-imported row would still save — then the partial '
    + 'assertion above is decorative, because nothing depends on it');
});

test('CONTROL: `legacy: null` is OUT of the index, and an explicit null sid is IN', () => {
  /**
   * The distinction the whole partial filter turns on, made visible. It is also
   * the one shape the model comment warns about: a subdocument written with an
   * explicit `sid: null` DOES exist at that path and IS indexed, so two of them
   * collide. The import never writes that shape — it writes the subdocument
   * whole, with a real sid — and this pins the behaviour rather than the hope.
   */
  const insert = enforcer(sidIndex(RegisterPublic.schema));

  assert.equal(insert({ legacy: null }).why, 'not in the index');
  assert.equal(insert({}).why, 'not in the index', 'an absent `legacy` is also out');
  assert.equal(insert({ legacy: { sid: 5 } }).why, 'indexed');

  assert.equal(insert({ legacy: { sid: null } }).saved, true, 'the first explicit-null sid');
  assert.equal(insert({ legacy: { sid: null } }).saved, false,
    'two explicit-null sids do NOT collide — then `at()` is not distinguishing a null parent '
    + 'from a null leaf, and the partial filter is being read wrongly');
});
