import mongoose from 'mongoose';
import { NOTE_MAX_LENGTH } from '@/lib/registrations/internalNotes';

/**
 * ONE internal note, for BOTH registration collections.
 *
 * ══ ONE SCHEMA, NOT ONE PER MODEL ═══════════════════════════════════════════
 *
 * The whole instruction for this feature was "one notes mechanism, not two".
 * Two schema literals would be two places for the field set to drift, and the
 * drift would be invisible: Mongoose writes what it is given, so a model whose
 * subdocument had lost `authorName` would simply stop persisting it, the push
 * would succeed, and the note would render with a blank byline.
 *
 * ── `_id: false` ──────────────────────────────────────────────────────────
 * A note is identified by its POSITION in an append-only list and by nothing
 * else. Giving each one an id would be the first half of an edit/delete API
 * that is deliberately not being built — and the second half would then look
 * like an obvious completion of an unfinished feature rather than the
 * reintroduction of the overwrite defect this replaces.
 *
 * ── `authorName` IS DENORMALISED AND MUST NOT BE JOINED AWAY ───────────────
 * It is who wrote the note AT THE TIME. See the reasoning at length in
 * lib/registrations/internalNotes — people leave, people are renamed, and a
 * re-resolved byline rewrites the past to match the present. `authorId` sits
 * beside it, not instead of it.
 *
 * String rather than ObjectId for `authorId`, deliberately: the type makes
 * `.populate()` impossible, so the denormalisation cannot quietly become a
 * lookup one refactor later.
 */
export const InternalNoteSchema = new mongoose.Schema(
  {
    body:       { type: String, trim: true, required: true, maxlength: NOTE_MAX_LENGTH },
    authorId:   { type: String, default: '' },
    authorName: { type: String, trim: true, default: '' },
    createdAt:  { type: Date, default: Date.now },
  },
  { _id: false },
);
