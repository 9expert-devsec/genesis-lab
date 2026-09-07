import mongoose from 'mongoose';

/**
 * THE PROVENANCE STAMP ON AN IMPORTED DRUPAL REGISTRATION — for BOTH
 * registration collections.
 *
 * ══ WHY IT EXISTS: THE IMPORT IS RE-RUNNABLE, AND `sid` IS WHAT MAKES IT SO ══
 *
 * 2,427 registrations are coming across from the legacy Drupal site, and the
 * import that carries them is NOT a one-shot. It will be run at least twice by
 * plan: once ahead of time to move the bulk, and again on cutover night to catch
 * everything Drupal accepted in between. That second run is THE SAME SCRIPT over
 * THE SAME SOURCE TABLE, so it re-reads every row it already imported.
 *
 * `legacy.sid` is the Drupal `webform_submission.sid` — the source row's own
 * primary key — and it is the ONLY thing that makes the second run insert
 * nothing the first run already inserted. Without it, "have I seen this row?"
 * has no answer that is not a guess: a legacy submission carries no genesis id,
 * and matching on (email, course, date) would merge two colleagues who signed up
 * together from one address on one day, which is an ordinary thing to do.
 *
 * So the dedup key is stored, not derived, and the unique partial index on each
 * model is what enforces it — see the index declaration and its comment on both
 * RegisterPublic and RegisterInhouse.
 *
 * ══ ONE SCHEMA, NOT ONE PER MODEL ═══════════════════════════════════════════
 *
 * The same ruling `internalNoteSchema` records, for the same reason and on the
 * same pair of collections: two schema literals are two places for the field set
 * to drift, and Mongoose makes that drift INVISIBLE. It writes what it is given,
 * so a model whose copy had lost `sid` would simply stop persisting it, the
 * insert would succeed, the partial index would not see the document — and the
 * catch-up run would silently duplicate every row on that collection. The
 * failure would be a doubled registration count discovered by a customer.
 *
 * ── `legacy: null` MEANS "NOT IMPORTED", AND IS THE DEFAULT ────────────────
 * Every document this system has ever written, and every one it writes from the
 * web form tomorrow, holds null here. That is not a missing value to be
 * backfilled: a registration taken by genesis has no Drupal sid and never will.
 * The two states are "born here" and "carried across", and the null is the first
 * of them said out loud.
 *
 * ── `_id: false` ──────────────────────────────────────────────────────────
 * This is a stamp on its parent, not a record with an identity of its own. An
 * `_id` here would be a second key on a document that already has one, and the
 * only thing it could ever be used for is a lookup that should go through `sid`.
 */
export const LegacyImportSchema = new mongoose.Schema(
  {
    /**
     * THE DEDUP KEY. Drupal `webform_submission.sid`.
     *
     * Number, because that is what it is in MySQL — storing it as a string would
     * make `'0123'` and `123` two different keys for one row, and the uniqueness
     * this field exists for would then depend on every writer spelling it the
     * same way.
     *
     * No `required: true`, deliberately. This subdocument is only ever written
     * whole, by one script; a `required` here would fire on nothing that
     * actually happens and would instead make the field's absence a VALIDATION
     * ERROR rather than the "not indexed, not deduped" state the partial index
     * already describes correctly.
     */
    sid: { type: Number },

    /** Drupal `webform_submission.serial` — per-form sequence. Audit only. */
    serial: { type: Number },

    /**
     * Which Drupal webform the row came from:
     *   'registration_public'   → register_public
     *   'inhouse_registration'  → register_inhouse
     *
     * NOT an enum. The two collections are separate, so a wrong value here
     * cannot mis-route anything — and a `sid` is only unique WITHIN a webform,
     * which makes this the field a reader needs in order to interpret the key.
     */
    webformId: { type: String, trim: true },

    /** When THIS system wrote the row — not when Drupal received it. */
    importedAt: { type: Date },

    /**
     * THE LEGACY VALUES WITH NO HOME IN THIS SCHEMA.
     *
     * Mixed, and that is the point: the legacy forms collected fields genesis
     * does not model, and the alternative to keeping them here is discarding
     * them at import time — permanently, since the Drupal database is going
     * away. Nothing reads this; it exists so that a question asked in six months
     * has an answer.
     *
     * NOTHING MAY BRANCH ON IT. The moment behaviour depends on a key in here,
     * that key needs to be a real path with a real type, because Mixed is
     * unvalidated, unindexed, and invisible to every guard in this repo.
     */
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);
