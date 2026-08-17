import mongoose from 'mongoose';

import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';
import { rootDocumentKey } from '@/lib/rootDocuments.mjs';

/**
 * RootDocument — the registry of files published at the SITE ROOT.
 *
 * ══ CURRENT STATE ONLY. EXACTLY ONE ROW PER PUBLISHED PATH. ═════════════════
 *
 * READ THIS BEFORE BUILDING ON IT, because the limitation is deliberate and it
 * is the opposite of the model next door:
 *
 *   THIS ROUND DOES NOT BUILD REPLACEMENT, VERSIONING, OR RESTORE FOR NEW ROOT
 *   FILES. There is no `version`, no `archivePathname`, no `restoredFrom`, and
 *   no history. Publishing over an existing path is not a supported operation
 *   and nothing here makes it safe.
 *
 * WebrootDocumentFile is append-only, one row per REPLACEMENT, because the three
 * frozen PDFs are replaced constantly and an overwrite destroys its own history.
 * This collection is the other shape — one row per PATH, describing what is live
 * now — because a NEW file is published once. When replacement arrives it will
 * need the archive-before-overwrite machinery in src/lib/webroot/, and it will
 * need it deliberately; it must not be reached by adding a `version` field to
 * this model and hoping.
 *
 * ── NOT A DELIVERY LOOKUP FOR THE FROZEN THREE ──────────────────────────────
 * Same rule as WebrootDocumentFile, LegacyFileMigration and CourseOutlineFile.
 * The three frozen URLs resolve through static rewrites in next.config.mjs with
 * no database in the request path, and nothing here may change that.
 *
 * ── .js AND NOT .mjs, FOR A MEASURED REASON ─────────────────────────────────
 * test/fs/auditCoverage.test.mjs walks named imports out of the action modules
 * to classify which exports mutate, and its `resolveSpec` follows only
 * `.js`/`.jsx`. Anything that writes to Mongo from behind a `.mjs` file is
 * invisible to that walk and keeps reading as NON-MUTATING — a hole in the
 * audit-coverage guard, dressed as a file-extension preference. The trap is
 * already documented on src/lib/webroot/receiptStore.js. The policy module this
 * imports is `.mjs` for the opposite and equally measured reason: next.config.mjs
 * loads it outside the app's module resolution. Extension follows the READER.
 */

/** The frozen three, as lookup keys — derived, never re-typed. */
const FROZEN_KEYS = new Set(WEBROOT_DOCUMENTS.map((f) => rootDocumentKey(f)));

/**
 * Is this key one of the frozen three? Case-folded here as well as in the
 * derivation, because the validator below is reached on write paths where the
 * derivation hook does not run — see both comments on `pathKey`.
 */
const isFrozenKey = (key) => FROZEN_KEYS.has(String(key ?? '').trim().toLowerCase());

const RootDocumentSchema = new mongoose.Schema(
  {
    /**
     * The public URL path AS PUBLISHED, case preserved. For DISPLAY.
     *
     * This is what an operator sees and copies. It is NOT what is looked up or
     * indexed — see `pathKey`, and see the case rule below for why the two are
     * separate fields rather than one field normalised.
     */
    publicPath: { type: String, required: true, trim: true },

    /**
     * THE LOOKUP KEY: `publicPath` lowercased. The unique index is on THIS.
     *
     * ══ THE CASE RULE ═══════════════════════════════════════════════════════
     *
     * routes-manifest `caseSensitive` is false, so `/Foo.pdf` and `/foo.pdf` are
     * THE SAME URL. Two rows differing only in case would be two rows claiming
     * one address, with rule order deciding which answers.
     *
     * The lowercasing is done in APPLICATION CODE — `rootDocumentKey` in
     * src/lib/rootDocuments.mjs, called from the pre-validate hook below — and
     * NOT by a Mongo collation. Whether this deployment carries a
     * case-insensitive collation is NOT ESTABLISHED: collation belongs to the
     * index and the query, it is invisible here, and a unique index that
     * silently compared case-sensitively would admit the colliding pair while
     * looking exactly like a working guard.
     */
    pathKey: {
      type: String,
      required: true,
      trim: true,

      // NO `lowercase: true` HERE, AND THAT IS DELIBERATE.
      //
      // MEASURED while proving these tests redden: with the schema option in
      // place, breaking `rootDocumentKey`'s lowercasing changed NOTHING — the
      // mongoose setter quietly did the work instead, and the control that
      // feeds mixed case could not be made to fail. A rule with two
      // implementations where one masks the other is a rule whose real
      // implementation nobody can identify.
      //
      // So there is exactly ONE lowercasing, in `rootDocumentKey`, shared with
      // every other consumer of the rule — including the publish-time collision
      // check — and the hook below is the only thing that applies it.

      /**
       * THE FROZEN-THREE REFUSAL, AS A VALIDATOR AND NOT AS A HOOK.
       *
       * MEASURED, and it is why this is not in `pre('validate')` with the
       * derivation: a copy of this check in the hook could not be made to
       * redden a single test, because the validator already caught every case.
       * A branch no test can distinguish from its absence is not a second layer,
       * it is an unprovable one.
       *
       * A VALIDATOR is also the stronger placement. Mongoose runs
       * `pre('validate')` middleware on `.save()`/`.create()` and NOT on
       * `validateSync()` or `insertMany()`; a validator runs on those too. This
       * is the highest-stakes rule in the model — it protects three live public
       * URLs — so it does not rest on the write path being the expected one.
       *
       * MEASURED reason it matters (M4): a document-extension rule placed ABOVE
       * the three webroot rewrite rules once STOLE a published PDF. This
       * registry serves root paths from a function, so a row claiming
       * `/9expert-company-profile.pdf` is that incident with a database behind
       * it. This is the WRITE-side half of the protection; the read-side half is
       * the route handler refusing to serve those three, next round. Neither is
       * sufficient alone, and this one is written first because a row that never
       * exists cannot be served by a mistake.
       */
      validate: {
        validator: (v) => !isFrozenKey(v),
        message: (props) => `${props.value} เป็นหนึ่งในเอกสารสามไฟล์ที่ถูกตรึงไว้ `
          + `(${WEBROOT_DOCUMENTS.join(', ')}) — แก้ไขได้ผ่านหน้าแทนที่เอกสารเท่านั้น `
          + 'ห้ามลงทะเบียนซ้ำที่นี่',
      },
    },

    /** Where the object lives in the Blob store. Derived server-side, never sent. */
    blobPathname: { type: String, required: true, trim: true },

    bytes: { type: Number, default: 0 },
    /** Content hash of the published bytes. */
    sha256: { type: String, default: '' },
    contentType: { type: String, default: 'application/pdf' },

    /**
     * THE NAME OF THE FILE THE ADMIN ACTUALLY PICKED. A LABEL, NOTHING ELSE.
     *
     * Same rule, and the same reason, as `sourceFilename` on WebrootDocumentFile:
     * `File.name` comes from the browser, is not validated, not sanitised into a
     * key, and MUST NEVER REACH A PATH. The boundary is structural — `pathKey`
     * and `blobPathname` on this same row are derived server-side and this value
     * is never an input to either.
     *
     * '' MEANS UNKNOWN and is not backfilled. There is no honest way to invent a
     * name nobody recorded, and rendering the published path in its place would
     * recreate exactly the confusion the field exists to remove.
     */
    sourceFilename: { type: String, default: '' },

    uploadedAt: { type: Date, default: Date.now },
    /** From the session. Never from the request body. */
    uploadedBy: { type: String, default: '' },

    /**
     * ══ WITHDRAWAL SHIPS WITH PUBLISHING, ON PURPOSE ════════════════════════
     *
     * The withdraw ACTION is a later round. These fields are here now anyway,
     * because shipping a way to mint a permanent public URL with no way to take
     * it down is worse than shipping no replace path: a wrong file at a root URL
     * that cannot be withdrawn is an incident with no lever, and the lever has
     * to exist in the DATA before any surface can pull it.
     */
    status: { type: String, enum: ['published', 'withdrawn'], default: 'published' },
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'root_documents' },
);

/**
 * Derive the lookup key from the published path. THE ONLY LOWERCASING.
 *
 * ══ WHY A HOOK RATHER THAN TRUSTING THE CALLER ══════════════════════════════
 *
 * `pathKey` is the field the uniqueness of the whole registry rests on. A caller
 * that forgot to lowercase it would not fail — it would insert a second row for
 * an address that already had one, and the unique index would not object,
 * because the two strings genuinely differ. Deriving it here means there is one
 * place it can be wrong, and a test drives that place with mixed case.
 *
 * It is derived UNCONDITIONALLY, overwriting anything supplied: a caller-chosen
 * key would let one row claim an address its `publicPath` does not name.
 *
 * ══ WHAT A HOOK DOES NOT COVER — AND IT IS ENFORCED, NOT DOCUMENTED ═════════
 *
 * Mongoose runs `pre('validate')` on `.save()`, `.create()` and `.validate()`
 * and NOT on the query-level writers, which talk to the driver and never build a
 * document at all. On those, `pathKey` IS NEVER DERIVED — so a row lands with
 * whatever key the caller happened to pass, or with none.
 *
 * THE PUBLISH PATH MUST USE `.save()` OR `.create()`. Every one of these is
 * BANNED on this model:
 *
 *     updateOne  updateMany  findOneAndUpdate  findByIdAndUpdate
 *     replaceOne  bulkWrite  insertMany
 *
 * That ban is not left to this comment. test/fs/rootDocumentWrites.test.mjs
 * scans src/ and scripts/ and fails if any of them is called on a binding
 * imported from this file — and asserts this very list matches the one it
 * enforces, so the two cannot drift. A comment stating a rule nobody enforces
 * has burned this repo twice; this is the same rule with a guard under it.
 *
 * THE BAN IS SCOPED TO THIS MODEL. Those methods are correct and widely used
 * elsewhere in the repo; a repo-wide ban would be wrong. What makes them wrong
 * HERE is that this model's key is derived by middleware.
 *
 * The asymmetry is also why the frozen-three refusal above is a VALIDATOR and
 * not part of this hook. Uniqueness degrades on a bypass. The protection of
 * three live public URLs does not.
 */
RootDocumentSchema.pre('validate', function deriveLookupKey(next) {
  if (this.publicPath) this.pathKey = rootDocumentKey(this.publicPath);
  next();
});

/**
 * Unique on the LOWERCASED key.
 *
 * ══ STATED HONESTLY: THIS IS DEFENCE IN DEPTH, NOT THE GUARD ════════════════
 *
 * `autoIndex` is INFERRED to be on — src/lib/db/connect.js does not pass it, so
 * mongoose's default applies — and this index HAS NEVER BEEN OBSERVED BUILDING
 * on this deployment. Nobody has read `getIndexes()` and seen it. So it may or
 * may not exist in production, and a guard whose existence is unverified is not
 * a guard.
 *
 * THE REAL COLLISION CHECK IS AT PUBLISH TIME, in application code, against
 * every surface that can already answer a root path — static routes, public/
 * entries, existing rewrites and stored slugs — via
 * `findRootPathCollisions` in src/lib/rootPathCollision.mjs. That check knows
 * about things this index cannot see: a row unique in this collection can still
 * collide with `/schedule`.
 */
RootDocumentSchema.index({ pathKey: 1 }, { unique: true });

/** Newest first — the listing an admin surface will make. */
RootDocumentSchema.index({ uploadedAt: -1 });

/**
 * Exported so a test can drive the refusal against the SAME derived set the
 * hook uses, rather than against its own re-typed copy of the three names — a
 * second copy would go green if the derivation broke.
 */
export { FROZEN_KEYS };

export default mongoose.models.RootDocument
  || mongoose.model('RootDocument', RootDocumentSchema);
