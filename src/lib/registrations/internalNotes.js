/**
 * INTERNAL NOTES — the append-only record both registration screens share.
 *
 * ══ THE NAMING TRAP, AND WHY THIS FILE STATES IT FIRST ══════════════════════
 *
 * `register_public.notes` ALREADY EXISTS and holds THE CUSTOMER'S OWN NOTE —
 * non-empty on 31 of 39 documents, written by the public form, and SHOWN BACK
 * TO THE CUSTOMER in the confirmation email. An internal note must never be.
 *
 * So the internal field is NOT called `notes` on either model. It is
 * `adminNotes` on both, mirroring the name in-house already used:
 *
 *     model             CUSTOMER note (visible to them)   INTERNAL note (never)
 *     ───────────────   ──────────────────────────────    ─────────────────────
 *     RegisterPublic    `notes`     String(500)           `adminNotes`  Array
 *     RegisterInhouse   `message`   String(2000)          `adminNotes`  Array
 *
 * The two customer fields are spelled differently because they always were; the
 * two internal fields are spelled the same because they are now one mechanism.
 * test/fs/internalNotesSeparation asserts that no single code path reads or
 * writes both a customer field and an internal one.
 *
 * ══ APPEND-ONLY IS THE DESIGN, NOT A SHORTCUT ═══════════════════════════════
 *
 * There is no edit, no delete, and no per-note "•••". The reason belongs where
 * the action lives and is repeated at `addInternalNote`, but in short: a single
 * mutable text field lets the second writer silently overwrite the first, which
 * is the exact failure this replaces. Allowing edits reintroduces it one level
 * up — the note is still overwritable, just one click deeper. Internal notes are
 * a record to read back, not a document to revise.
 *
 * ══ EXPAND / MIGRATE / CONTRACT — THIS IS THE EXPAND PHASE ══════════════════
 *
 * In-house's `adminNotes` was a plain String. It becomes an ARRAY. `readNotes`
 * below TOLERATES BOTH while the code lands, which is what makes the deploy and
 * the migration independent of each other:
 *
 *   · undefined / null / ''   → []            (never written, or cleared)
 *   · a non-empty String      → one entry     (legacy, pre-migration)
 *   · an Array                → itself        (the target shape)
 *
 * THE NARROWING IS NOT IN THIS ROUND. Dropping the String branch is the contract
 * phase and must be last and alone, after --apply has run and been confirmed.
 * Deleting it here would be the classic expand/contract mistake of doing both
 * halves in one deploy and having no rollback.
 *
 * Pure — no imports, no mongoose, no React. Safe on both sides of the network
 * boundary, and drivable from the `pure` tier without a DOM or a database.
 */

/** The longest a single note may be. Matches the in-house String it replaces. */
export const NOTE_MAX_LENGTH = 2000;

/**
 * The synthesised author for a legacy String note.
 *
 * ── A DECISION ABOUT ZERO DOCUMENTS, STATED IN ONE LINE ───────────────────
 * `adminNotes` is ABSENT on all 8 in-house documents (measured, read-only), so
 * this label will never be rendered in production. It exists because the reader
 * must not produce an entry with no author at all — a note whose author is
 * `undefined` renders a blank byline, which reads as a bug rather than as "we
 * do not know".
 */
export const LEGACY_AUTHOR_NAME = 'ไม่ทราบผู้บันทึก (ก่อนระบบบันทึกภายใน)';

/**
 * Normalise ONE note body for storage.
 *
 * Returns `''` for anything that is not usable text, and the caller is expected
 * to refuse rather than store that — see `addInternalNote`. Trimming here rather
 * than at the action means the "is this empty" question is asked of the same
 * string that would have been stored, which is the only way the two can agree.
 */
export function normalizeNoteBody(body) {
  return String(body ?? '').trim().slice(0, NOTE_MAX_LENGTH);
}

/**
 * Build the entry that gets pushed.
 *
 * ── `authorName` IS DENORMALISED, DELIBERATELY, AND MUST STAY THAT WAY ─────
 *
 * It is WHO WROTE IT AT THE TIME. It must NOT be re-resolved from `authorId`
 * later, and a future reader WILL see the duplication and want to "fix" it by
 * joining on the user collection at render time. Do not.
 *
 * Three reasons, in order of how badly they bite:
 *   1. People leave. Resolving a departed admin's id yields nothing, and a note
 *      from 2024 would lose its author entirely — the record silently degrades
 *      as staff turn over, which is precisely when you need it.
 *   2. People are renamed. A note signed by the name someone had when they wrote
 *      it is a true statement about the past; re-resolving rewrites history to
 *      match the present, which is not what a record is for.
 *   3. The join is per-note, per-render, on a screen that already has the string.
 *
 * `authorId` is kept ALONGSIDE it, not instead of it, so the note can still be
 * attributed to an account when that is the question being asked.
 *
 * @param {object} args
 * @param {string} args.body   already normalised
 * @param {string} args.authorId
 * @param {string} args.authorName  the actor's name AT THE TIME OF WRITING
 * @param {Date}   [args.createdAt] injectable so a migration can be deterministic
 */
export function buildNoteEntry({ body, authorId, authorName, createdAt }) {
  return {
    body,
    authorId:   authorId   == null ? '' : String(authorId),
    authorName: authorName == null ? '' : String(authorName),
    createdAt:  createdAt ?? new Date(),
  };
}

/**
 * Read the stored value as an ARRAY OF ENTRIES, whatever shape it is in.
 *
 * THE EXPAND-PHASE READER. See the file header: it tolerates the legacy String
 * so the code can deploy before the migration runs, and so a rollback does not
 * strand documents in a shape nothing can read.
 *
 * @param {unknown} stored the raw `adminNotes` value off a `.lean()` document
 * @param {object}  [opts]
 * @param {Date}    [opts.legacyCreatedAt] the timestamp to give a synthesised
 *        legacy entry. The document's `updatedAt` is the honest choice — see
 *        the migration script — and `null` is passed through rather than
 *        replaced with "now", which would date a 2024 note to today.
 * @returns {Array<{body: string, authorId: string, authorName: string, createdAt: *}>}
 */
export function readNotes(stored, { legacyCreatedAt = null } = {}) {
  if (stored == null) return [];

  if (Array.isArray(stored)) {
    // Entries missing a body are dropped rather than rendered: a note with no
    // text is a byline attached to nothing, which is the empty-element defect
    // this codebase keeps finding one layer down.
    return stored
      .filter((n) => n && normalizeNoteBody(n.body))
      .map((n) => ({
        body:       normalizeNoteBody(n.body),
        authorId:   n.authorId   == null ? '' : String(n.authorId),
        authorName: n.authorName == null ? '' : String(n.authorName),
        createdAt:  n.createdAt ?? null,
      }));
  }

  // LEGACY: a plain String. One entry, no author id, a named placeholder rather
  // than a blank byline.
  const body = normalizeNoteBody(stored);
  if (!body) return [];
  return [{ body, authorId: '', authorName: LEGACY_AUTHOR_NAME, createdAt: legacyCreatedAt }];
}

/**
 * THE BYLINE STRING FOR ONE NOTE — or '' when there is nothing to say.
 *
 * ══ IT RETURNS '' RATHER THAN A DASH, AND THAT IS ROUND 5'S RULE ════════════
 *
 * `update — → —` was the instance that settled it: a dash asserts "we looked and
 * there is nothing there", and the caller renders NO ELEMENT rather than making
 * that claim on the screen's behalf. The same rule applies here for the opposite
 * reason — there the emptiness was deliberate (field diffs carry PII), here it
 * is never deliberate, because a byline is the whole point of an append-only
 * log. Either way the rendering is the same: nothing, not a placeholder.
 *
 * ── PARTIAL IS A REAL CASE AND IS NOT COLLAPSED ───────────────────────────
 * A name with no time, and a time with no name, both render what they have.
 * Joining on ' · ' after filtering means a missing half never leaves a dangling
 * separator, which is `detailHeading`'s trailing-colon defect in miniature.
 *
 * ── AND IT DOES NOT INVENT AN AUTHOR ──────────────────────────────────────
 * There is no "the current admin" fallback and there must not be. A note whose
 * author was never recorded is unattributed, and attributing it to whoever
 * happens to be looking would make the record say something false. The only
 * synthesised name in this module is `LEGACY_AUTHOR_NAME`, which is applied by
 * `readNotes` to the pre-migration STRING shape alone and says out loud that it
 * does not know.
 *
 * @param {{authorName?: string, createdAt?: *}} note
 * @param {(d: *) => string} formatDate the screen's own formatter, injected so
 *        this module learns nothing about locales or timezones
 */
export function noteByline(note, formatDate) {
  const who = String(note?.authorName ?? '').trim();
  const when = note?.createdAt ? String(formatDate(note.createdAt) ?? '').trim() : '';
  return [who, when].filter(Boolean).join(' · ');
}

/**
 * Is the stored value still in the pre-migration String shape?
 *
 * Used by the migration to decide what to touch, and by a test to prove the
 * reader's two branches are actually distinguishable rather than both falling
 * through to the same code.
 */
export function isLegacyStringNote(stored) {
  return typeof stored === 'string' && normalizeNoteBody(stored).length > 0;
}
