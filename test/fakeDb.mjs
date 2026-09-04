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

function rows(name) {
  if (!store.has(name)) store.set(name, []);
  return store.get(name);
}

/** Wipe every collection and reset the clock. Call in a beforeEach. */
export function resetFakeDb() {
  store.clear();
  cloudinaryDeleted.length = 0;
  clock = 1_700_000_000_000;
  idSeq = 0;
}

/** Insert a document directly, bypassing the action layer. Returns the raw row. */
export function seed(name, doc) {
  const stamp = now();
  const row = {
    _id: doc._id ?? nextId(),
    createdAt: doc.createdAt ?? stamp,
    updatedAt: doc.updatedAt ?? stamp,
    ...doc,
  };
  row._id = String(row._id);
  rows(name).push(row);
  return row;
}

/** What the Cloudinary stub was asked to delete, in call order. */
const cloudinaryDeleted = [];
export function recordCloudinaryDelete(publicId) { cloudinaryDeleted.push(publicId); }
export function cloudinaryDeletes() { return [...cloudinaryDeleted]; }

/** Every row in a collection, as plain objects. For assertions. */
export function all(name) {
  return rows(name).map((r) => clone(r));
}

export function count(name) {
  return rows(name).length;
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

export function makeModel(name) {
  return {
    modelName: name,

    findById(id) {
      return new Query(() => rows(name).find((r) => String(r._id) === String(id)) ?? null);
    },

    findOne(filter) {
      return new Query(() => rows(name).find((r) => matches(r, filter)) ?? null);
    },

    find(filter) {
      return new Query(() => rows(name).filter((r) => matches(r, filter ?? {})));
    },

    async countDocuments(filter) {
      return rows(name).filter((r) => matches(r, filter ?? {})).length;
    },

    /** Mongoose returns { _id } or null — slugGuard treats it as a boolean. */
    async exists(filter) {
      const hit = rows(name).find((r) => matches(r, filter ?? {}));
      return hit ? { _id: hit._id } : null;
    },

    async distinct(field) {
      return [...new Set(rows(name).map((r) => valueAt(r, field)).filter((v) => v != null))];
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
      rows(name).push(row);
      return hydrate(row);
    },

    async findByIdAndUpdate(id, update, options = {}) {
      const row = rows(name).find((r) => String(r._id) === String(id));
      if (!row) return null;
      /**
       * A BARE UPDATE OBJECT IS `$set`, WHICH IS WHAT MONGOOSE DOES.
       *
       * Added when the recruits actions became the first callers here that
       * write `findByIdAndUpdate(id, { title, headcount })` rather than
       * `{ $set: {...} }`. Both are real Mongoose: an update document with no
       * top-level operator is treated as $set. Until now this fake threw on
       * that shape and called it "unsupported", which would have made a
       * correctly-written action look broken.
       *
       * The keys are split on the `$` prefix rather than on an allow-list, so
       * an update mixing `{ $inc: {...}, title: 'x' }` still works and a genuine
       * unsupported operator ($unset, $push) still throws by name instead of
       * being silently written as a field called "$push".
       */
      const keys = Object.keys(update ?? {});
      const operators = keys.filter((k) => k.startsWith('$'));
      const bare = keys.filter((k) => !k.startsWith('$'));
      const unsupported = operators.filter((k) => k !== '$set' && k !== '$inc');
      if (unsupported.length) {
        throw new Error(`fakeDb: unsupported update operator(s) ${unsupported.join(', ')}`);
      }
      const set = { ...Object.fromEntries(bare.map((k) => [k, update[k]])), ...(update?.$set ?? {}) };
      const inc = update?.$inc ?? {};
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

    async findOneAndUpdate(filter, update) {
      const row = rows(name).find((r) => matches(r, filter));
      if (!row) return null;
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
      row.updatedAt = tick();
      return hydrate(row);
    },

    async deleteMany(filter) {
      const list = rows(name);
      const keep = list.filter((r) => !matches(r, filter));
      const removed = list.length - keep.length;
      store.set(name, keep);
      return { deletedCount: removed };
    },

    async findByIdAndDelete(id) {
      const list = rows(name);
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
