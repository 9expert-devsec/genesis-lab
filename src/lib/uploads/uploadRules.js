/**
 * What /api/admin/upload will accept, PER FOLDER.
 *
 * ══ WHY A LOOKUP AND NOT AN `if (folder === 'avatars')` ═════════════════════
 * The route had one rule for everything: any `image/*` plus `application/pdf`,
 * up to 5 MB. Avatars need a narrower rule, and the obvious way to add one is a
 * conditional in the middle of the handler. That shape is why this is a table
 * instead: the SECOND folder that needs its own rule gets appended to the
 * conditional by whoever is in a hurry, the branches start overlapping, and
 * nobody can answer "what does this endpoint accept?" without simulating the
 * function. A table can be read, and it can be tested without a request.
 *
 * ── THE DEFAULT IS THE OLD BEHAVIOUR, BYTE FOR BYTE ─────────────────────────
 * Every folder that is not named below gets exactly what it got before this
 * module existed, including the two error strings. That is asserted, not
 * assumed — test/pure/uploadRules keeps `courses/covers` accepting a 4 MB PDF,
 * because the failure this refactor could plausibly cause is not "avatars are
 * wrong", it is "the course cover upload everyone uses quietly stopped taking
 * PDFs".
 *
 * NOT WIDENED, and named because it looks like an oversight: the default rule
 * still accepts `image/svg+xml`, since SVG matches `image/*`. That is
 * pre-existing behaviour for every folder that had it, and this round does not
 * change it — but SVG is script-bearing, so `avatars` refuses it explicitly
 * below rather than relying on an allowlist to exclude it by omission.
 *
 * PURE: no imports, no I/O, no NextResponse. The route turns a verdict into a
 * response; this decides the verdict.
 */

const MB = 1024 * 1024;

/**
 * The rule that applied to everything before per-folder rules existed.
 * `accept` is a predicate rather than a list precisely because that is what the
 * old code was — `type.startsWith('image/') || type === 'application/pdf'` —
 * and reproducing it as an enumerated list would silently narrow it.
 */
export const DEFAULT_RULE = Object.freeze({
  maxBytes: 5 * MB,
  accept: (type) => typeof type === 'string'
    && (type.startsWith('image/') || type === 'application/pdf'),
  // Kept identical to the strings the route returned before, so anything
  // matching on them (a client, a log filter) is unaffected.
  typeError: 'Only image or PDF files allowed',
  sizeError: `File too large (max ${(5 * MB) / MB} MB)`,
});

/**
 * Folders that deviate. One entry today; the shape is what matters.
 *
 * `avatars` is the strictest surface on this endpoint and deliberately so — it
 * is the only one whose output is rendered inside the admin panel's own chrome,
 * on every page, for every admin.
 *
 *   · THREE raster types, enumerated. Not `image/*` minus exclusions: an
 *     allowlist cannot be widened by a browser inventing a new image MIME.
 *   · SVG IS REFUSED, and it is the reason this rule exists. An SVG can carry
 *     <script>; a profile image is displayed in the admin chrome on every admin
 *     page; the two must never meet. It is named in the refusal rather than
 *     merely absent from the allowlist, so a future reader sees a decision.
 *   · PDF is refused for the same "it is not a photograph" reason, and because
 *     the default rule's PDF allowance exists for course documents.
 *   · 2 MB, not 5. A 2 MB photograph is already far larger than a 512px avatar
 *     needs, and the cap is the only backstop — there is no `sharp` in this
 *     repo and nothing resizes server-side.
 */
export const FOLDER_RULES = Object.freeze({
  avatars: Object.freeze({
    maxBytes: 2 * MB,
    accept: (type) => type === 'image/jpeg' || type === 'image/png' || type === 'image/webp',
    typeError: 'รูปโปรไฟล์รองรับเฉพาะ JPG, PNG หรือ WebP',
    sizeError: 'ไฟล์ใหญ่เกินไป (สูงสุด 2 MB)',
  }),
});

/** The rule for a folder — its own, or the pre-existing default. */
export function rulesForFolder(folder) {
  return FOLDER_RULES[folder] ?? DEFAULT_RULE;
}

/**
 * Decide whether a file may be uploaded into `folder`.
 *
 * Takes the two properties of a File the decision depends on rather than a File
 * — so the table can be exercised over a matrix of types and sizes without
 * constructing Blobs, and so this module never touches a web API.
 *
 * @param {string} folder             the RESOLVED folder (already allowlisted)
 * @param {{type?: string, size?: number}} file
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function checkUpload(folder, file) {
  const rule = rulesForFolder(folder);
  const type = file?.type;
  const size = file?.size;

  // Type before size, matching the order the route already refused in — so a
  // file that is both wrong-typed and oversized reports the same reason it used
  // to, and a client showing the message does not appear to change its mind.
  if (!rule.accept(type)) return { ok: false, error: rule.typeError };
  if (typeof size !== 'number' || size > rule.maxBytes) {
    return { ok: false, error: rule.sizeError };
  }
  return { ok: true };
}
