/**
 * Legacy path → Cloudinary public_id. THE ONLY IMPLEMENTATION OF THIS RULE.
 *
 * ══ DO NOT REIMPLEMENT ANY OF THIS AT THE DELIVERY END. ═════════════════════
 *
 * The migration uploader uses these functions to decide where a file goes; the
 * delivery resolver will use the SAME functions to decide where to look for it.
 * Two copies of this rule drifting apart does not fail loudly — it fails as a
 * handful of dead images somebody notices two years later, with no way to tell
 * which side was wrong. If you need this logic somewhere new, import it.
 *
 * ── THE BASE MAPPING: THE public_id IS THE PATH ─────────────────────────────
 *   /sites/default/files/articles/images/foo.png
 *     → image, public_id `9exp-genesis/legacy/sites/default/files/articles/images/foo`
 *       (Cloudinary carries `png` as the FORMAT and re-appends it in the URL)
 *   /files/document/x.xlsx
 *     → raw,   public_id `9exp-genesis/legacy/files/document/x.xlsx`
 *       (raw keeps the extension — there is no format concept)
 *
 * Spaces, parentheses, `@`, Thai script and letter case all survive verbatim.
 * That was measured, not assumed: a 50-file pass uploaded and then FETCHED each
 * delivery URL, and all of those characters round-tripped byte-identically.
 *
 * ── THE EXCEPTIONS: `&` AND `#` ─────────────────────────────────────────────
 * Cloudinary refuses a public_id containing `&` outright — `public_id (…) is
 * invalid`, measured, two real files in that same pass. So for those files, and
 * ONLY those, the id cannot be the path.
 *
 * The sanctioned substitution is `&` → `and`, and it is deliberately the
 * smallest rule that could work: a single documented character, replaced with
 * three letters a human would have typed anyway.
 *
 * `#` is the SECOND reviewed substitution, `#` → `sharp`, and it arrived the way
 * this file intends: it THREW. The full-tree backfill (scripts/backfill-legacy-
 * tree.mjs) found 13 deliverable files carrying it — the C# course covers in
 * course/cover and course/images, plus one certificate PDF — and
 * assertNoUnreviewedInvalidChars refused them rather than inventing a mapping.
 * `sharp` is chosen for the same reason `and` was: it is what a human writing
 * the name in ASCII would have typed. `C#` becomes `Csharp`.
 *
 * ── `#` HAS A SECOND PROBLEM THAT `&` DOES NOT ──────────────────────────────
 * Over HTTP a literal `#` is the FRAGMENT DELIMITER. Everything after it is
 * stripped by the client and never sent, so `…/Programming in C#.png` reaches
 * the server as `…/Programming in C` — a path that matches nothing. The
 * reachable form is the percent-encoded `%23`, which is why the resolver-trigger
 * rewrite in next.config.mjs matches BOTH spellings. For `&` that dual match was
 * belt-and-braces; for `#` the encoded form is the only one that can ever
 * arrive, and matching solely the literal would resolve 0 of 13.
 *
 * ── WHY NOTHING ELSE IS SUBSTITUTED ─────────────────────────────────────────
 * `? % < > \` are also invalid in a public_id and are NOT handled here. They
 * do not occur anywhere in the live legacy set — that was scanned, not guessed.
 * If one ever appears, `assertNoUnreviewedInvalidChars` THROWS.
 *
 * That is on purpose. A generic "sanitise the id" helper would quietly invent a
 * mapping nobody reviewed, for a character whose replacement has real
 * consequences, at the exact moment no one is watching. A loud failure costs
 * one conversation; a silent transformation costs a dead URL that no longer
 * resembles anything anyone can search for.
 *
 * ── THE SUBSTITUTIONS ARE NOT REVERSIBLE, WHICH IS WHY THEY ARE RECORDED ────
 * `and` → `&` cannot be undone by rule: `Build and Manage` is a perfectly
 * ordinary filename that was never substituted. `sharp` → `#` is the same shape
 * of problem — `sharp` is an ordinary English word, and `Csharp` is a name
 * somebody could have typed deliberately. So the resolver CANNOT recover
 * the legacy path from a substituted id, and must not try. The migration record
 * carries a queryable `publicIdSubstituted` flag for exactly this reason — see
 * src/models/LegacyFileMigration.js.
 */

/** Everything the migration writes lives under this. Changing it breaks every URL. */
export const LEGACY_PUBLIC_ID_PREFIX = '9exp-genesis/legacy';

/** The characters this project substitutes, and what they become. */
export const AMPERSAND = '&';
export const AMPERSAND_REPLACEMENT = 'and';
export const HASH = '#';
export const HASH_REPLACEMENT = 'sharp';

/**
 * Rule names recorded on a row. A file can need MORE THAN ONE — a name ending
 * `& .png` needs both — which is why the record holds an ARRAY. A scalar field
 * would keep whichever rule ran last and silently lose the other, and the
 * resolver would then be reasoning from an incomplete account of what happened
 * to the id.
 */
export const SUBSTITUTION_RULE = 'ampersand-to-and';
export const HASH_RULE = 'hash-to-sharp';
export const TRIM_RULE = 'trailing-whitespace-trim';

/**
 * Invalid in a Cloudinary public_id and deliberately NOT substituted. Absent
 * from the live legacy set; if one appears, it must reach a human.
 *
 * `#` used to be here and has GRADUATED to a reviewed rule (see the header).
 * That is the intended lifecycle for this list, and the only sanctioned way off
 * it: a character leaves only when a human has chosen its replacement and
 * written the tests. Nothing else has graduated — `?`, `%`, `<`, `>` and `\`
 * still throw.
 */
export const UNREVIEWED_INVALID_CHARS = Object.freeze(['?', '%', '<', '>', '\\']);

/** True when `value` contains `&`, the first substituted character. */
export function needsAmpersandSubstitution(value) {
  return String(value).includes(AMPERSAND);
}

/**
 * THE SUBSTITUTION. Replace every literal `&` with `and`. Nothing else is
 * touched — not spaces, not `@`, not parentheses, not Thai script, not case.
 *
 * This is the function the uploader and the resolver must both call. It is
 * intentionally tiny and intentionally exported on its own, so neither end can
 * "just inline it".
 */
export function substituteAmpersands(value) {
  return String(value).split(AMPERSAND).join(AMPERSAND_REPLACEMENT);
}

/** True when `value` contains `#`, the second substituted character. */
export function needsHashSubstitution(value) {
  return String(value).includes(HASH);
}

/**
 * THE SECOND SUBSTITUTION. Replace every literal `#` with `sharp`.
 *
 * Deliberately identical in shape to substituteAmpersands — same split/join,
 * same "nothing else is touched" guarantee, separately exported so neither the
 * uploader nor the resolver can inline it. `C#` becomes `Csharp`: no separator
 * is inserted, because inserting one would be a second, unreviewed decision
 * about the name.
 */
export function substituteHash(value) {
  return String(value).split(HASH).join(HASH_REPLACEMENT);
}

/** True when the value ends in whitespace, which Cloudinary refuses. */
export function needsTrailingWhitespaceTrim(value) {
  return /\s$/.test(String(value));
}

/**
 * THE SECOND RULE. Remove trailing whitespace from the END of the id only.
 *
 * Cloudinary rejects `public_id must not end with a whitespace`, which bites
 * six real files whose name carries a space before the extension
 * (`custom-prompt .png` → id `custom-prompt `). INTERNAL spaces are untouched
 * and must stay that way: they are legitimate, they were measured working, and
 * hundreds of files depend on them surviving verbatim.
 *
 * Like the ampersand rule this is LOSSY — `custom-prompt` and
 * `custom-prompt ` map to the same id — so a trimmed row is flagged for the
 * same reason, and the resolver must not attempt to invert it.
 */
export function trimTrailingWhitespace(value) {
  return String(value).replace(/\s+$/, '');
}

/**
 * Throw if `value` holds an invalid character this project has NOT reviewed a
 * substitution for. Called before every upload; the throw is the point.
 */
export function assertNoUnreviewedInvalidChars(value) {
  const s = String(value);
  const found = UNREVIEWED_INVALID_CHARS.filter((c) => s.includes(c));
  if (found.length) {
    throw new Error(
      `public_id would contain ${found.map((c) => JSON.stringify(c)).join(', ')}, which Cloudinary rejects `
      + 'and this project has no reviewed substitution for. Refusing to invent one — see '
      + 'src/lib/legacyPublicId.js.',
    );
  }
  return true;
}

/** Extension of a path, lowercased, or '' when there is none. */
export function extensionOfPath(sourcePath) {
  const last = String(sourcePath).slice(String(sourcePath).lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1);
}

/**
 * The full mapping, base rule plus substitution.
 *
 * Returns `{ publicId, substituted, rule, ext }`. `substituted` is the flag the
 * migration record persists — a caller that ignores it is a caller that will
 * later be unable to tell an identity mapping from a lossy one.
 *
 * `resourceType` decides whether the extension stays in the id: 'image' drops
 * it (Cloudinary holds it as `format`), 'raw' keeps it.
 */
export function legacyPathToPublicId(sourcePath, resourceType, prefix = LEGACY_PUBLIC_ID_PREFIX) {
  const p = String(sourcePath);
  const ext = extensionOfPath(p);
  const rest = p.replace(/^\//, '');

  const base = resourceType === 'raw' || !ext
    ? rest
    : rest.slice(0, rest.length - ext.length - 1);

  assertNoUnreviewedInvalidChars(base);

  // Composed, in this order, and ANY COMBINATION may fire on one path:
  // `foo & .png` becomes `foo and ` after the ampersand rule and `foo and`
  // after the trim. Each rule records itself, so the row shows everything that
  // happened rather than only the last thing.
  //
  // The character substitutions run BEFORE the trim, and that ordering is
  // load-bearing rather than incidental: both of them can leave a trailing
  // space that was not there before (`foo &.png` → `foo and.png` does not, but
  // `foo & .png` → `foo and .png` does), so the trim has to see their output.
  // Reversing it would emit an id ending in whitespace, which is the exact
  // thing Cloudinary rejects.
  const rules = [];
  let id = base;

  if (needsAmpersandSubstitution(id)) {
    id = substituteAmpersands(id);
    rules.push(SUBSTITUTION_RULE);
  }
  if (needsHashSubstitution(id)) {
    id = substituteHash(id);
    rules.push(HASH_RULE);
  }
  if (needsTrailingWhitespaceTrim(id)) {
    id = trimTrailingWhitespace(id);
    rules.push(TRIM_RULE);
  }

  return {
    publicId: `${prefix}/${id}`,
    substituted: rules.length > 0,
    // ALWAYS an array — see the note on SUBSTITUTION_RULE. Empty when the id
    // is the identity mapping.
    rules,
    ext,
  };
}
