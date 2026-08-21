import { slotsOf } from '@/lib/pageBuilder/containerSlots';

/**
 * Immutable path helpers for the editor's working page tree.
 *
 * Sections are addressed by PATH, not id: a path is the key sequence into the
 * page object, e.g.
 *   ['sections', 0]                                  → top-level section 0
 *   ['sections', 0, 'content', 'children', 1]        → its 2nd child
 *   ['sections', 2, 'content', 'left', 0]            → two_column left slot
 *
 * Why paths and not ids: section ids are NOT guaranteed unique across the tree
 * (duplicating a container copies its children's ids verbatim — see the note
 * on duplicateSection in lib/actions/pageBuilder.js). An id-keyed editor would
 * silently edit the wrong node. A path is unambiguous by construction.
 *
 * Everything here is pure and immutable — the reducer stays a plain function.
 */

// Section-id minting and duplication live in lib/pageBuilder/reidSection.js —
// ONE definition shared with the server's duplicateSection. `reidSubtree` is
// kept as the editor-facing name.
export { newSectionId, reidSection as reidSubtree } from '@/lib/pageBuilder/reidSection';

/** Read the value at `path` (undefined when the path doesn't resolve). */
export function getAt(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Immutably set `path` to `value`, cloning only along the path. */
export function setAt(obj, path, value) {
  if (path.length === 0) return value;
  const [k, ...rest] = path;
  if (Array.isArray(obj)) {
    const next = obj.slice();
    next[k] = setAt(obj[k], rest, value);
    return next;
  }
  const base = obj ?? {};
  return { ...base, [k]: setAt(base[k], rest, value) };
}

/** Immutably replace the value at `path` with fn(current). */
export function updateAt(obj, path, fn) {
  return setAt(obj, path, fn(getAt(obj, path)));
}

/** Remove the array element addressed by `path` (last key must be an index). */
export function removeAt(obj, path) {
  const parent = path.slice(0, -1);
  const index = path[path.length - 1];
  const arr = getAt(obj, parent);
  if (!Array.isArray(arr)) return obj;
  return setAt(obj, parent, arr.filter((_, i) => i !== index));
}

/** Insert `value` into the array at `parentPath` at `index` (clamped). */
export function insertAt(obj, parentPath, index, value) {
  const arr = getAt(obj, parentPath);
  const base = Array.isArray(arr) ? arr : [];
  const at = Math.max(0, Math.min(index ?? base.length, base.length));
  const next = base.slice();
  next.splice(at, 0, value);
  return setAt(obj, parentPath, next);
}

/**
 * Move one element of a BARE ARRAY, returning a new array.
 *
 * Extracted from `moveWithin` below, which is where this logic has always
 * lived, when the section content editor needed to reorder the items inside a
 * timeline / tabs / accordion / checklist. Those items are not sections and
 * have no path — they are a plain array on `content` — so `moveWithin`'s
 * signature does not fit them, but its ARITHMETIC is exactly what they need.
 *
 * Extracted rather than copied: two implementations of "move index from to
 * index to" would have to agree forever, and the off-by-one they would
 * eventually disagree about is the one below — `to` is clamped AFTER the
 * removal, so a downward move lands where the caller means it to.
 *
 * Out-of-range or no-op moves return the ORIGINAL array, not a copy, so a
 * caller can use identity to tell whether anything happened.
 */
export function moveInArray(arr, from, to) {
  if (!Array.isArray(arr)) return arr;
  if (from === to || from < 0 || from >= arr.length) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** Move an element within one array at a path (sibling-scoped section reorder). */
export function moveWithin(obj, parentPath, from, to) {
  const arr = getAt(obj, parentPath);
  if (!Array.isArray(arr)) return obj;
  const next = moveInArray(arr, from, to);
  if (next === arr) return obj; // refused or no-op — same object, same answer as before
  return setAt(obj, parentPath, next);
}

/**
 * Serialize a path for a DOM data attribute or a React key.
 *
 * The canvas puts these on rendered sections (data-pb-path) and reads them back
 * on click, so the two directions MUST round-trip: keyToPath restores numeric
 * segments as numbers, because a path is indexed into arrays and `arr['0']`
 * working is an accident of JS, not a contract we want the editor resting on.
 */
export function pathToKey(path) {
  return path.join('.');
}

export function keyToPath(key) {
  return String(key).split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * The path of the SECTION CONTAINING the one at `path`, or null when it is
 * top-level.
 *
 * A path is `['sections', i]` then repeats of `['content', slot, i]` — three
 * keys per level of nesting, which is the same shape `depthOfPath` below
 * divides by. So the parent section is three keys back, and a path of length 2
 * has no parent at all.
 *
 * Returns NULL rather than an empty array for a top-level section: `[]` is a
 * valid path (it addresses the page itself), so returning it would hand a
 * caller something `getAt` resolves to the whole page — which would then be
 * rendered as though it were the parent section. The null is what makes the
 * no-parent case impossible to use by accident.
 */
export function parentSectionPath(path) {
  if (!Array.isArray(path) || path.length <= 2) return null;
  return path.slice(0, -3);
}

/** A section's depth: ['sections',0] → 0; each nested slot adds 1. */
export function depthOfPath(path) {
  // path = ['sections', i] then repeats of ['content', slot, i]
  return Math.max(0, Math.floor((path.length - 2) / 3));
}

/** Walk every section in the tree (depth-first), yielding { section, path }. */
export function walkSections(page, visit) {
  const list = Array.isArray(page?.sections) ? page.sections : [];
  const rec = (sections, basePath) => {
    sections.forEach((section, i) => {
      const path = [...basePath, i];
      visit(section, path);
      const slots = slotsOf(section?.type);
      if (!slots) return;
      for (const slot of slots) {
        const kids = section?.content?.[slot];
        if (Array.isArray(kids)) rec(kids, [...path, 'content', slot]);
      }
    });
  };
  rec(list, ['sections']);
}
