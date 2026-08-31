/**
 * IS THIS VALUE SAFE TO HAND ACROSS THE SERVER/CLIENT BOUNDARY?
 *
 * A Server Action's return value, and anything a server component passes into
 * client context, must be plain JSON-shaped data. React serialises it through
 * the Flight protocol, which accepts objects with a null or Object prototype,
 * arrays, strings, numbers, booleans, null and undefined — and refuses
 * everything else. A Mongoose document, a `.lean()` row that still carries an
 * ObjectId, a `Date`, a `Buffer`, a `Map` — each of these fails, and the way it
 * fails is the reason this file exists.
 *
 * ── WHY THIS IS A SHARED HELPER AND NOT A SCRIPT ──────────────────────────
 * Round 62 wrote a walk of exactly this shape as a one-off probe, used it to
 * clear all 32 exported actions, and deleted it afterwards. The audit was
 * right and the deletion is why round 66 had to start over. A guard against a
 * whole CLASS of defect belongs where it runs every time, so this is a module
 * the suite imports rather than a script somebody has to remember.
 *
 * ── WHAT "PLAIN" MEANS HERE, EXACTLY ──────────────────────────────────────
 * `Object.getPrototypeOf(v)` is `Object.prototype` or `null`, or the value is
 * an Array, or it is a primitive. Anything else is reported with its
 * constructor name and the path it sits at, because "something in the response
 * is not serialisable" is not an actionable message and `page.draft.sections[3]
 * .content.doc` is.
 *
 * `Date` is reported even though Next can sometimes carry one: this codebase's
 * own convention is `toISOString()` at the boundary (saveDraftContent returns
 * `updated.updatedAt?.toISOString()`, backupDraftVersion returns
 * `{id: String(row._id)}`), and a Date that survives one Next version and not
 * the next is exactly the kind of thing a guard should refuse rather than
 * tolerate.
 *
 * ── `_bsontype` IS CHECKED BY NAME, AND THAT IS THE POINT ─────────────────
 * BSON marks every one of its values — ObjectId, Decimal128, Long, Binary —
 * with a `_bsontype` string, and `mongoose/lib/helpers/isBsonType.js` duck-types
 * by reading it. So `_bsontype` is both the marker this walk looks for AND the
 * property name that appears in the error when something goes wrong at this
 * boundary. Naming it explicitly means the guard's message and the runtime's
 * message use the same word.
 */

/** Values that are legal leaves. */
function isPrimitive(v) {
  return v === null || v === undefined
    || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * Every non-plain value in `root`, as `{ path, kind, detail }`.
 *
 * @param {unknown} root
 * @param {object} [opts]
 * @param {number} [opts.maxDepth=40] guards against a cycle in a shape that
 *   should not have one; a hit is reported rather than thrown, because a cycle
 *   is itself a boundary defect.
 * @returns {Array<{path: string, kind: string, detail: string}>} empty when the
 *   value is safe to cross the boundary.
 */
export function nonPlainValues(root, { maxDepth = 40 } = {}) {
  const found = [];
  /**
   * ── ANCESTORS, NOT "EVERYTHING SEEN" ────────────────────────────────────
   * The first version of this kept one WeakSet of every object it had visited
   * and reported the second visit as a cycle. That is wrong, and it was caught
   * by its own first real subject: `chooseRounds` hands a round's `dates` array
   * through as both `row.dates` and `row.live.dates` — the SAME array on two
   * branches. A shared reference is not a cycle and serialises perfectly; React
   * dedupes it. Only a node that appears in its OWN ancestor chain is a cycle,
   * so the set is pushed and popped with the walk.
   *
   * A heavily shared graph can then be walked more than once per node, so a
   * visit budget bounds it. Exhausting the budget is REPORTED rather than
   * silently truncating: a structure that big at this boundary is itself worth
   * knowing about.
   */
  const ancestors = new Set();
  let budget = 20000;

  const visit = (v, path, depth) => {
    if (isPrimitive(v)) return;

    if (depth > maxDepth) {
      found.push({ path, kind: 'too-deep', detail: `deeper than ${maxDepth}` });
      return;
    }

    if (typeof v === 'function') {
      found.push({ path, kind: 'function', detail: v.name || '(anonymous)' });
      return;
    }
    if (typeof v === 'symbol' || typeof v === 'bigint') {
      found.push({ path, kind: typeof v, detail: String(v) });
      return;
    }

    // A BSON value is checked BEFORE the prototype test, so the report names
    // `_bsontype` — the same word the runtime error uses — rather than the
    // less specific "not a plain object".
    let bson;
    try { bson = v._bsontype; } catch { bson = '(threw on access)'; }
    if (bson !== undefined) {
      found.push({ path, kind: '_bsontype', detail: String(bson) });
      return;
    }

    if (ancestors.has(v)) {
      found.push({ path, kind: 'cycle', detail: 'contains itself' });
      return;
    }
    if (budget-- <= 0) {
      found.push({ path, kind: 'too-wide', detail: 'walk budget exhausted' });
      return;
    }
    ancestors.add(v);

    if (Array.isArray(v)) {
      v.forEach((item, i) => visit(item, `${path}[${i}]`, depth + 1));
      ancestors.delete(v);
      return;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      found.push({
        path,
        kind: 'non-plain-prototype',
        detail: v?.constructor?.name ?? String(proto),
      });
      ancestors.delete(v);
      return;
    }

    for (const key of Object.keys(v)) visit(v[key], path ? `${path}.${key}` : key, depth + 1);
    ancestors.delete(v);
  };

  visit(root, '', 0);
  return found;
}

/** Convenience: true when nothing in `root` would break the boundary. */
export function isBoundarySafe(root) {
  return nonPlainValues(root).length === 0;
}

/** A one-line report, for an assertion message. */
export function describeNonPlain(hits) {
  return hits
    .map((h) => `  ${h.path || '(root)'} — ${h.kind}: ${h.detail}`)
    .join('\n');
}
