/**
 * An in-memory stand-in for the three Mongoose models the PageBuilder actions
 * write through, so a test can CALL a server action instead of reading its
 * source.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Until now nothing in this repo executed a server action. Every action was
 * guarded by source-scanning — walking the real source text and asserting its
 * shape. That catches a wrong shape and cannot catch wrong behaviour, which is
 * the failure round 0 was fixed to make visible. The draft/published split
 * turns on behaviour a shape cannot express: that a publish promotes the draft
 * EXACTLY once, that a snapshot never carries one, that a non-publish target
 * leaves the draft alone.
 *
 * ── WHY THE STATE LIVES HERE AND NOT IN THE STUBS ───────────────────────────
 * test/fs/stubExportParity asserts each `@/`-mapped stub exports EXACTLY what
 * the real module exports — no extras, deliberately, so a stub can never keep a
 * function the real module dropped. A stub carrying `__reset`/`__seed` would be
 * a stale extra by that rule. So the stubs export only the real names and get
 * their behaviour from here.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 * Not a Mongo emulator. It implements exactly the query surface the PageBuilder
 * actions use, and throws on anything else rather than silently returning an
 * empty result — a fake that answers every question is its own false green.
 */

let clock = 1_700_000_000_000; // fixed base; every write advances it
let idSeq = 0;

/** Advance the write clock so the next write gets a strictly later updatedAt. */
export function tick(ms = 1000) {
  clock += ms;
  return new Date(clock);
}

export function now() {
  return new Date(clock);
}

function nextId() {
  idSeq += 1;
  return `fakeid${String(idSeq).padStart(18, '0')}`;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Collections, by the name the model stub asks for. */
const store = new Map();

/**
 * A PRIVATE set of collections, immune to `resetFakeDb()`.
 *
 * ── WHY THIS EXISTS, MEASURED ───────────────────────────────────────────────
 * The suite runs `run({ isolation: 'none', concurrency: true })` — ONE process,
 * files interleaved at every `await`. `store` above is module-global and
 * `resetFakeDb()` clears ALL of it, so any two files that both own fakeDb state
 * can wipe each other mid-test. The header's "single fakeDb owner" convention
 * is what keeps that from happening, and it is a convention, not a mechanism.
 *
 * This was not theoretical: the fakeDb mechanics tests added alongside upsert
 * passed alone and failed inside `npm test`, cleared by another file's reset
 * while awaiting an async model method.
 *
 * A test that hands `makeModel` its own store is unaffected by every other
 * file, and needs no reset of its own. Callers that pass nothing keep the
 * global store and behave exactly as before — this widens nothing.
 *
 * NOTE, deliberately not fixed here: the two pre-existing owners
 * (test/fs/pageBuilderDraftActions, test/fs/customPageDraftActions) still share
 * the global store and are still ordered only by luck. Migrating them is a
 * separate change with its own blast radius, not a rider on this one.
 */
export function makeStore() {
  return new Map();
}

function rowsIn(targetStore, name) {
  if (!targetStore.has(name)) targetStore.set(name, []);
  return targetStore.get(name);
}

function rows(name) {
  return rowsIn(store, name);
}

/** Wipe every collection and reset the clock. Call in a beforeEach. */
export function resetFakeDb() {
  store.clear();
  cloudinaryDeleted.length = 0;
  clock = 1_700_000_000_000;
  idSeq = 0;
}

/**
 * Insert a document directly, bypassing the action layer. Returns the raw row.
 *
 * Deliberately does NOT check unique constraints: this is the test author's own
 * hand placing a fixture, and a fixture that needs to violate an index (to
 * prove the reader copes with data that predates it) must stay possible.
 */
export function seed(name, doc, targetStore = store) {
  const stamp = now();
  const row = {
    _id: doc._id ?? nextId(),
    createdAt: doc.createdAt ?? stamp,
    updatedAt: doc.updatedAt ?? stamp,
    ...doc,
  };
  row._id = String(row._id);
  rowsIn(targetStore, name).push(row);
  return row;
}

/** What the Cloudinary stub was asked to delete, in call order. */
const cloudinaryDeleted = [];
export function recordCloudinaryDelete(publicId) { cloudinaryDeleted.push(publicId); }
export function cloudinaryDeletes() { return [...cloudinaryDeleted]; }

/** Every row in a collection, as plain objects. For assertions. */
export function all(name, targetStore = store) {
  return rowsIn(targetStore, name).map((r) => clone(r));
}

export function count(name, targetStore = store) {
  return rowsIn(targetStore, name).length;
}

// ── matching ────────────────────────────────────────────────────────────────

function valueAt(doc, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), doc);
}

function matchOne(actual, expected) {
  /**
   * A Date is `typeof 'object'`, so it reached the operator branch below and
   * crashed on `expected.$in.map` — round 38 found this by passing one. Nothing
   * had filtered on a bare Date before (the equality branch further down only
   * ever fired with a Date on the ACTUAL side), so the bug was latent rather
   * than newly introduced. Handled here, ahead of the operator branch, because
   * a Date is a VALUE and never a set of operators.
   */
  if (expected instanceof Date) {
    return new Date(actual ?? 0).getTime() === expected.getTime();
  }
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    const ops = Object.keys(expected);
    const unknown = ops.filter((o) => o !== '$in' && o !== '$ne' && o !== '$lt');
    if (unknown.length) {
      throw new Error(`fakeDb: unsupported query operator(s) ${unknown.join(', ')} — add it deliberately`);
    }
    if ('$ne' in expected) return String(actual) !== String(expected.$ne);
    /**
     * `$lt` — ADDED DELIBERATELY in round 38, for the audit trail's cursor.
     *
     * getPageAuditLog pages on the compound key `(createdAt, _id)`, so its
     * filter is `{ $or: [ {createdAt:{$lt:c}}, {createdAt:c, _id:{$lt:id}} ] }`
     * and BOTH halves have to evaluate here or the fake answers a query the
     * database would answer differently — which is the false green this file's
     * own note ("a fake that answers every question is its own false green")
     * exists to refuse.
     *
     * Dates compare as instants and everything else as strings, matching the
     * equality branch below. The fake's ids are zero-padded (`fakeid…0007`), so
     * a string comparison orders them the way Mongo orders ObjectIds — which is
     * what makes the tie-break testable at all.
     */
    if ('$lt' in expected) {
      const bound = expected.$lt;
      if (actual instanceof Date || bound instanceof Date) {
        return new Date(actual ?? 0).getTime() < new Date(bound ?? 0).getTime();
      }
      return String(actual) < String(bound);
    }
    return expected.$in.map(String).includes(String(actual));
  }
  if (expected instanceof Date || actual instanceof Date) {
    return new Date(actual ?? 0).getTime() === new Date(expected ?? 0).getTime();
  }
  return String(actual) === String(expected);
}

/**
 * Order two stored values the way the sort above needs them.
 *
 * Dates (and date-shaped strings) compare as instants; anything else compares
 * as a string. Same split as matchOne's `$lt`, so a cursor and the sort it
 * pages against cannot disagree inside the fake.
 */
function compareValues(a, b) {
  if (a instanceof Date || b instanceof Date) {
    const at = new Date(a ?? 0).getTime();
    const bt = new Date(b ?? 0).getTime();
    return at === bt ? 0 : at < bt ? -1 : 1;
  }
  const as = String(a ?? '');
  const bs = String(b ?? '');
  return as === bs ? 0 : as < bs ? -1 : 1;
}

function matches(doc, filter) {
  return Object.entries(filter ?? {}).every(([key, expected]) => {
    // slugGuard asks with { $or: [{slug}, {slugHistory}] }.
    if (key === '$or') return expected.some((sub) => matches(doc, sub));
    if (key === 'slugHistory') {
      const list = Array.isArray(doc.slugHistory) ? doc.slugHistory : [];
      return list.map(String).includes(String(expected));
    }
    return matchOne(valueAt(doc, key), expected);
  });
}

// ── projection ──────────────────────────────────────────────────────────────

function project(doc, selection) {
  if (!selection) return doc;
  const fields = String(selection).split(/\s+/).filter(Boolean);
  if (!fields.length) return doc;
  const excluding = fields.every((f) => f.startsWith('-'));
  const mixed = fields.some((f) => f.startsWith('-')) && !excluding;
  if (mixed) throw new Error('fakeDb: mixed inclusion/exclusion projection');

  if (excluding) {
    const out = { ...doc };
    for (const f of fields) delete out[f.slice(1)];
    return out;
  }
  const out = { _id: doc._id };
  for (const f of fields) if (f in doc) out[f] = doc[f];
  return out;
}

// ── a chainable query, resolving to lean plain objects ──────────────────────

class Query {
  constructor(resolve) {
    this._resolve = resolve;
    this._selection = null;
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._lean = false;
  }

  select(sel) { this._selection = sel; return this; }
  sort(spec) { this._sort = spec; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }
  lean() { this._lean = true; return this; }

  _apply() {
    let out = this._resolve();
    if (out == null) return out;
    const list = Array.isArray(out) ? out : [out];
    let result = list;
    if (this._sort) {
      /**
       * EVERY key, in order — round 38. This read only the FIRST key until the
       * audit trail arrived sorting on `(createdAt, _id)`, and a fake that
       * ignored the tie-break would order same-millisecond rows by insertion
       * while Mongo ordered them by `_id`. The pagination test would then have
       * been asserting the fake's accident rather than the query's rule.
       *
       * `compare` is Date-aware first, so the existing `createdAt`/`updatedAt`
       * sorts behave exactly as they did, and falls back to a string compare
       * for keys like `_id` that `new Date()` turns into NaN.
       */
      const entries = Object.entries(this._sort);
      result = [...result].sort((a, b) => {
        for (const [key, dir] of entries) {
          const cmp = compareValues(valueAt(a, key), valueAt(b, key));
          if (cmp !== 0) return dir < 0 ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (this._skip) result = result.slice(this._skip);
    if (this._limit != null) result = result.slice(0, this._limit);
    result = result.map((d) => project(clone(d), this._selection));
    return Array.isArray(out) ? result : result[0] ?? null;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this._apply()).then(onFulfilled, onRejected);
  }
}

// ── the model stand-in ──────────────────────────────────────────────────────

/**
 * A document as an action sees it back from a write: plain fields plus the
 * `toObject()` the snapshot path calls. Mongoose returns a hydrated doc there,
 * and `snapshotVersion` relies on `.toObject()` existing.
 */
function hydrate(row) {
  const doc = clone(row);
  doc.createdAt = new Date(row.createdAt);
  doc.updatedAt = new Date(row.updatedAt);
  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    value: () => clone(row),
  });
  return doc;
}

/**
 * The error Mongo raises when an insert collides with a unique index.
 *
 * `code === 11000` is the whole contract callers use — `createCoursePromoLink`
 * already branches on it, and `saveEarlyBird` now does too. The message is
 * shaped like the real one so a test that prints it is not misleading.
 */
function duplicateKeyError(name, field, value) {
  const err = new Error(
    `E11000 duplicate key error collection: test.${name} index: ${field}_1 ` +
      `dup key: { ${field}: "${String(value)}" }`
  );
  err.code = 11000;
  err.keyPattern = { [field]: 1 };
  err.keyValue = { [field]: value };
  return err;
}

/**
 * @param {string} name
 * @param {object} [options]
 * @param {string[]} [options.unique] — fields carrying a unique index.
 *
 * ── WHY UNIQUENESS IS OPT-IN AND NOT INFERRED ───────────────────────────────
 * A fake that enforced uniqueness on every field it happened to see would be
 * guessing, and a fake that enforced none of it cannot exercise the branch that
 * makes a claim RULE rather than a claim CHECK: `saveEarlyBird` is race-proof
 * only because a losing insert hits `course_id`'s unique index and throws
 * E11000. With no index in the fake that catch block is unreachable, and an
 * unreachable branch ships unproven.
 *
 * Opt-in also bounds the blast radius. Every existing caller passes no options,
 * so every existing collection behaves exactly as before.
 */
export function makeModel(name, { unique = [], store: ownStore = null } = {}) {
  /**
   * Every row access in this model goes through here, so a model handed its own
   * store never touches the global one — including on the paths that `resetFakeDb`
   * would otherwise clear out from under it.
   */
  const rowsFor = () => rowsIn(ownStore ?? store, name);

  /** Throw if `doc` would collide with an existing row on a unique field. */
  function assertUnique(doc, exceptId = null) {
    for (const field of unique) {
      const value = doc[field];
      if (value === undefined) continue;
      const clash = rowsFor().find(
        (r) => String(r._id) !== String(exceptId) &&
          String(valueAt(r, field)) === String(value)
      );
      if (clash) throw duplicateKeyError(name, field, value);
    }
  }

  return {
    modelName: name,

    findById(id) {
      return new Query(() => rowsFor().find((r) => String(r._id) === String(id)) ?? null);
    },

    findOne(filter) {
      return new Query(() => rowsFor().find((r) => matches(r, filter)) ?? null);
    },

    find(filter) {
      return new Query(() => rowsFor().filter((r) => matches(r, filter ?? {})));
    },

    async countDocuments(filter) {
      return rowsFor().filter((r) => matches(r, filter ?? {})).length;
    },

    /** Mongoose returns { _id } or null — slugGuard treats it as a boolean. */
    async exists(filter) {
      const hit = rowsFor().find((r) => matches(r, filter ?? {}));
      return hit ? { _id: hit._id } : null;
    },

    async distinct(field) {
      return [...new Set(rowsFor().map((r) => valueAt(r, field)).filter((v) => v != null))];
    },

    async create(doc) {
      const stamp = tick();
      const row = {
        _id: doc._id ?? nextId(),
        ...clone(doc),
        createdAt: stamp,
        updatedAt: stamp,
      };
      row._id = String(row._id);
      assertUnique(row);
      rowsFor().push(row);
      return hydrate(row);
    },

    async findByIdAndUpdate(id, update, options = {}) {
      const row = rowsFor().find((r) => String(r._id) === String(id));
      if (!row) return null;
      const set = update?.$set ?? {};
      const inc = update?.$inc ?? {};
      const unsupported = Object.keys(update ?? {}).filter((k) => k !== '$set' && k !== '$inc');
      if (unsupported.length) {
        throw new Error(`fakeDb: unsupported update operator(s) ${unsupported.join(', ')}`);
      }
      /**
       * `$inc` — round 35's publish counter.
       *
       * Applied here, synchronously, with no await between the read and the
       * write, which is what makes it a faithful stand-in for Mongo's
       * DOCUMENT-LEVEL atomicity rather than a convenience. That property is
       * the whole point of the operator: publishPageStatus reads `existing` in
       * a separate query, so two publishes can both clear the conflict check
       * and both arrive here, and each must leave with a DIFFERENT number.
       * A version of this that read the field, awaited, and then wrote would
       * hand them the same one and quietly agree with a count()+1 design.
       *
       * A missing field starts at 0, as Mongo does.
       */
      for (const [k, delta] of Object.entries(inc)) {
        if (k.includes('.')) throw new Error('fakeDb: $inc on a nested path is not supported');
        row[k] = (typeof row[k] === 'number' ? row[k] : 0) + delta;
      }
      for (const [k, v] of Object.entries(set)) {
        if (k.includes('.')) {
          const parts = k.split('.');
          let target = row;
          for (const p of parts.slice(0, -1)) {
            target[p] = target[p] ?? {};
            target = target[p];
          }
          target[parts.at(-1)] = clone(v);
        } else {
          row[k] = clone(v);
        }
      }
      row.updatedAt = tick();
      return options.new === false ? hydrate(row) : hydrate(row);
    },

    /**
     * ── `upsert` IS HONOURED HERE, AND USED TO BE IGNORED ───────────────────
     * This returned `null` and inserted nothing whenever the filter missed, no
     * matter what `options` said. Every caller passing `{upsert:true}` was
     * therefore testing against a fake that silently declined to create — the
     * exact "fake that answers every question" this file's own header refuses,
     * inverted: a fake that quietly answers NO.
     *
     * That matters for more than tidiness. `saveEarlyBird`'s rule is carried by
     * ONE atomic call whose filter names both the course and the promotions
     * allowed to own it, so:
     *   · no row            → filter misses → upsert INSERTS         (create)
     *   · row owned by us
     *     or owned by nobody→ filter matches → $set applies          (edit)
     *   · row owned by ANOTHER promotion
     *                       → filter misses → insert hits course_id's
     *                         unique index → E11000                  (REFUSED)
     * The third line is the rule. Against the old fake it could not run at all:
     * the insert never happened, so the collision never happened, so the catch
     * block that turns it into a refusal was dead code under test.
     *
     * `$setOnInsert` is supported for the same reason — it is how the insert
     * branch gets the key fields the `$set` does not carry.
     */
    async findOneAndUpdate(filter, update, options = {}) {
      const unsupported = Object.keys(update ?? {}).filter(
        (k) => k !== '$set' && k !== '$setOnInsert'
      );
      if (unsupported.length) {
        throw new Error(
          `fakeDb: unsupported update operator(s) ${unsupported.join(', ')} — add it deliberately`
        );
      }

      const row = rowsFor().find((r) => matches(r, filter));
      if (!row) {
        if (!options.upsert) return null;
        /**
         * Mongo seeds an upsert-insert from the filter's EQUALITY fields only.
         * `$or` and operator objects (`$in`, `$ne`, `$lt`) constrain which row
         * would have matched and say nothing about what to create, so they are
         * skipped here exactly as the database skips them — a fake that folded
         * `$or` into the new document would invent a row Mongo would not.
         */
        const seedDoc = {};
        for (const [k, v] of Object.entries(filter ?? {})) {
          if (k.startsWith('$')) continue;
          if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
            continue;
          }
          seedDoc[k] = clone(v);
        }
        const stamp = tick();
        const created = {
          _id: nextId(),
          ...seedDoc,
          ...clone(update?.$setOnInsert ?? {}),
          ...clone(update?.$set ?? {}),
          createdAt: stamp,
          updatedAt: stamp,
        };
        assertUnique(created);
        rowsFor().push(created);
        return options.new === false ? null : hydrate(created);
      }
      for (const [k, v] of Object.entries(update?.$set ?? {})) {
        if (k.includes('.')) {
          const parts = k.split('.');
          let target = row;
          for (const p of parts.slice(0, -1)) {
            target[p] = target[p] ?? {};
            target = target[p];
          }
          target[parts.at(-1)] = clone(v);
        } else {
          row[k] = clone(v);
        }
      }
      // An update that moves a unique field ONTO another row's value collides
      // in Mongo exactly as an insert does. Enforced here too, so the fake does
      // not hold uniqueness on one write path and drop it on the other.
      assertUnique(row, row._id);
      row.updatedAt = tick();
      return hydrate(row);
    },

    async deleteMany(filter) {
      const list = rowsFor();
      const keep = list.filter((r) => !matches(r, filter));
      const removed = list.length - keep.length;
      (ownStore ?? store).set(name, keep);
      return { deletedCount: removed };
    },

    async findByIdAndDelete(id) {
      const list = rowsFor();
      const idx = list.findIndex((r) => String(r._id) === String(id));
      if (idx < 0) return null;
      const [row] = list.splice(idx, 1);
      return hydrate(row);
    },
  };
}

// ── the session the auth stub hands back ────────────────────────────────────

let session = { user: { id: 'u-test', name: 'Test Admin', tier: 'developer' } };

/** Set the actor every subsequent requireAdmin() returns. */
export function setSessionUser(user) {
  session = { user };
}

export function currentSession() {
  return session;
}
