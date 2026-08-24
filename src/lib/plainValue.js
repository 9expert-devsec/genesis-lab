/**
 * IS THIS VALUE SAFE TO CROSS THE SERVER/CLIENT BOUNDARY?
 *
 * Round 66 wrote this walk and put it in `test/`, because at that point it only
 * had to answer a question about RETURN values and a test was the only consumer.
 * Round 67 found the boundary that actually matters is the other one — the
 * ARGUMENTS a Server Action receives — and that one needs the check at RUNTIME,
 * on the server, in the action. So the walk moved here and `test/plainValue.mjs`
 * re-exports it. One implementation, two entry points; there is deliberately not
 * a second walker.
 *
 * ── THE TWO QUESTIONS ARE NOT THE SAME, AND THAT IS THE POINT ─────────────
 *
 *   nonPlainValues        the BROAD, diagnostic question: is every value plain
 *                         JSON data? Reports Dates, Maps, class instances and
 *                         everything else. Used by tests and probes, where the
 *                         answer wanted is "tell me everything unusual".
 *
 *   unserialisableArguments  the NARROW, load-bearing question: is any value one
 *                         that CANNOT survive the client -> Server Action trip?
 *                         Used in production, at the entry of the actions that
 *                         take a client payload.
 *
 * The narrowness is not timidity, it is the blast radius. A Date, a Map and a
 * `.lean()` ObjectId all round-trip through React's reply encoding today, and
 * rejecting them at an action's door would break saves that currently work. The
 * three kinds below cannot round-trip under any circumstance, so refusing them
 * changes behaviour only for payloads that were already going to fail.
 *
 * ── WHAT A TEMPORARY REFERENCE IS, MEASURED RATHER THAN GUESSED ───────────
 * In react-server-dom-webpack's CLIENT encoder, a value it cannot serialise
 * becomes the string `"$T"` whenever a temporaryReferences set is present — and
 * Next always provides one. Its own two error strings name the cases:
 *
 *     "Client Functions cannot be passed directly to Server Functions."
 *     "Symbols cannot be passed to a Server Function without a temporary
 *      reference set."
 *
 * On the server, `"$T"` decodes into a Proxy whose `get` trap throws for every
 * property except a short allow-list. The message is verbatim:
 *
 *     Cannot access <name> on the server. You cannot dot into a temporary
 *     client reference from a server component. You can only pass the value
 *     through to the client.
 *
 * `<name>` is simply the FIRST property anything happened to read. When the
 * payload reaches Mongoose, that reader is `mongoose/lib/helpers/isBsonType`,
 * which is literally `obj._bsontype === typename` — so the message says
 * `_bsontype` and looks like a MongoDB problem. It is not. Three rounds were
 * spent on that word: rounds 62 and 66 both audited return values for stray
 * ObjectIds and correctly found none.
 *
 * ── DETECTING THE PROXY WITHOUT TRIPPING IT ──────────────────────────────
 * The `get` trap allows `$$typeof` through and answers with the target's tag, so
 * `value.$$typeof === Symbol.for('react.temporary.reference')` identifies one
 * with no risk of throwing. That is React's OWN test — the encoder uses the same
 * comparison when it refuses to re-serialise an opaque reference — rather than a
 * duck-type invented here.
 */

/** React's tag for a temporary client reference. Read, never created. */
const TEMPORARY_REFERENCE_TAG = Symbol.for('react.temporary.reference');

/** Values that are legal leaves. */
function isPrimitive(v) {
  return v === null || v === undefined
    || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * Is this the proxy React hands the server in place of a value the client could
 * not serialise?
 *
 * Guarded, because a getter on some other object could throw for its own
 * reasons and this must never be the thing that breaks a save.
 */
export function isTemporaryReference(v) {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return false;
  try { return v.$$typeof === TEMPORARY_REFERENCE_TAG; } catch { return false; }
}

/**
 * Every non-plain value in `root`, as `{ path, kind, detail }`.
 *
 * @param {unknown} root
 * @param {object} [opts]
 * @param {number} [opts.maxDepth=40]
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

    // FIRST, before anything dots into it. A temporary reference throws on
    // almost every property, so every check below would explode on one — and
    // the explosion would be the very error this walk exists to report.
    if (isTemporaryReference(v)) {
      found.push({ path, kind: 'temporary-client-reference', detail: 'a function or symbol sent from the client' });
      return;
    }

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

/** The three kinds that cannot survive the client -> Server Action trip. */
const UNSERIALISABLE = new Set(['temporary-client-reference', 'function', 'symbol']);

/**
 * Only the values that CANNOT have come from the client intact.
 *
 * Deliberately a filter over the one walk rather than a second traversal: two
 * definitions of "safe" that must agree is the shape this repo keeps being
 * bitten by, and a guard about drift should not itself be a drift risk.
 *
 * @returns {Array<{path: string, kind: string, detail: string}>}
 */
export function unserialisableArguments(root) {
  return nonPlainValues(root).filter((h) => UNSERIALISABLE.has(h.kind));
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

/**
 * The author-facing message for a payload that cannot be stored.
 *
 * It NAMES THE PATH, and that is the whole reason this exists. The message this
 * replaces — React's "Cannot access _bsontype on the server…" surfacing out of
 * `err?.message` — is true, unactionable, and points at MongoDB for a problem
 * that has nothing to do with MongoDB. It cost three rounds. An author seeing
 * `sections[3].content.doc` can find the section; an author seeing `_bsontype`
 * can only file a bug.
 *
 * Thai to match every other message these actions return.
 */
export function unserialisableMessage(hits) {
  const first = hits[0];
  const where = first?.path ? `\`${first.path}\`` : 'ข้อมูลที่ส่งมา';
  const more = hits.length > 1 ? ` (และอีก ${hits.length - 1} จุด)` : '';
  return `บันทึกไม่สำเร็จ: ${where} มีค่าที่ส่งข้ามไปยังเซิร์ฟเวอร์ไม่ได้ `
    + `(${first?.kind ?? 'unknown'})${more} — โปรดแจ้งผู้ดูแลระบบพร้อมข้อความนี้`;
}

/**
 * ── ROUND 68: THE OTHER HALF — MAKING A VALUE PLAIN ───────────────────────
 *
 * Everything above DETECTS. This one FIXES, and it exists because of a defect
 * whose whole substance is a prototype.
 *
 * ProseMirror builds a node's attributes with `Object.create(null)`, and
 * `Node.toJSON()` passes that same object straight through — so
 * `editor.getJSON()` returns a document whose `attrs` objects have a NULL
 * PROTOTYPE. React's client encoder refuses one: measured, a null-prototype
 * object encodes as `"$T"` where a plain `{}` encodes normally. That `"$T"` is
 * the temporary reference round 67 chased, and `_bsontype` is merely the first
 * property Mongoose read on the proxy it decodes into.
 *
 * Only three nodes in this editor's schema declare attributes at all — heading
 * (`level`), image (`src`/`alt`/`title`) and orderedList (`start`/`type`) — and
 * a node with none omits the key entirely. That is why a document of paragraphs
 * saved fine for months and the first heading broke it.
 *
 * ── WHY HERE AND NOT IN THE EXTENSION DECLARATION ────────────────────────
 * Because no declaration is wrong. Measured across the whole generated schema:
 * ZERO attributes have a non-plain default. The null prototype comes from
 * ProseMirror's own `computeAttrs`, below every extension, so there is nothing
 * in tiptapExtensions.js or richTextContract.js that could state it away.
 *
 * ── AND WHY THIS IS NOT A SECOND AUTHORITY OVER CONTENT ──────────────────
 * A sanitiser that decided which nodes or attributes a document may contain
 * WOULD be one, and `richTextContract.js` already holds that job. This decides
 * nothing: it adds no key, removes no key, changes no value, and preserves
 * `undefined` (which `JSON.parse(JSON.stringify(x))` would silently drop). It
 * rewrites one thing — the prototype — so that data ProseMirror produced can
 * cross a boundary React guards. An object with a prototype it does NOT own is
 * returned untouched, so it cannot quietly flatten a Date or a class instance
 * into an object either.
 *
 * @param {unknown} value
 * @param {number} [depth] internal; bounded so a cycle degrades to a
 *   returned-as-is value instead of a stack overflow. Tiptap JSON has no
 *   cycles, and a guard that only holds for well-formed input is not a guard.
 * @returns {unknown} the same data, with plain prototypes throughout.
 */
export function toPlainJson(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 100) return value;
  if (Array.isArray(value)) return value.map((item) => toPlainJson(item, depth + 1));

  const proto = Object.getPrototypeOf(value);
  // Not a plain-shaped object (a Date, a Map, a class instance). Not this
  // function's business, and rewriting it would be the sanitising this is not.
  if (proto !== Object.prototype && proto !== null) return value;

  const out = {};
  // Object.keys, so `undefined` values survive as keys — JSON round-tripping
  // drops them, and a document that loses a key on save is the failure this is
  // meant to prevent, not cause.
  for (const key of Object.keys(value)) out[key] = toPlainJson(value[key], depth + 1);
  return out;
}
