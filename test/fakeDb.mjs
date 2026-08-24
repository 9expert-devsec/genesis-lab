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
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    const ops = Object.keys(expected);
    const unknown = ops.filter((o) => o !== '$in' && o !== '$ne');
    if (unknown.length) {
      throw new Error(`fakeDb: unsupported query operator(s) ${unknown.join(', ')} — add it deliberately`);
    }
    if ('$ne' in expected) return String(actual) !== String(expected.$ne);
    return expected.$in.map(String).includes(String(actual));
  }
  if (expected instanceof Date || actual instanceof Date) {
    return new Date(actual ?? 0).getTime() === new Date(expected ?? 0).getTime();
  }
  return String(actual) === String(expected);
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
      const [key, dir] = Object.entries(this._sort)[0];
      result = [...result].sort((a, b) => {
        const av = new Date(valueAt(a, key) ?? 0).getTime();
        const bv = new Date(valueAt(b, key) ?? 0).getTime();
        return dir < 0 ? bv - av : av - bv;
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
      const set = update?.$set ?? {};
      const unsupported = Object.keys(update ?? {}).filter((k) => k !== '$set');
      if (unsupported.length) {
        throw new Error(`fakeDb: unsupported update operator(s) ${unsupported.join(', ')}`);
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
