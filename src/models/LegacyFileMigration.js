import mongoose from 'mongoose';

/**
 * LegacyFileMigration — one row per legacy source file copied to Cloudinary.
 *
 * ══ THIS COLLECTION IS FOR MIGRATION TRACKING. IT IS NOT A DELIVERY LOOKUP. ══
 *
 * DO NOT wire a route, a resolver, a middleware or a page to this collection.
 * If you are here because you need to turn a legacy URL into a Cloudinary URL
 * at request time, STOP — that mapping is derived by PATTERN, not by lookup:
 *
 *   legacy   /sites/default/files/articles/images/foo.png
 *   image →  https://res.cloudinary.com/<cloud>/image/upload/<PREFIX>/sites/default/files/articles/images/foo.png
 *   raw   →  https://res.cloudinary.com/<cloud>/raw/upload/<PREFIX>/sites/default/files/files/x.pdf
 *
 * The public_id IS the legacy path (minus the extension for images, which
 * Cloudinary carries as the format instead). That is the whole reason the
 * migration sets an explicit public_id rather than letting Cloudinary derive
 * one — a derived id is mangled and can collide, and a mangled id would force
 * every request through a database read.
 *
 * Why that matters enough for a shouting header: a delivery path that depends
 * on this collection is a delivery path that breaks when this collection is
 * dropped, slow when Mongo is slow, and unavailable when Mongo is down — for
 * static files that a CDN should be serving without any of our infrastructure
 * in the request path. The rows below exist so a human can answer "did that
 * file copy across, and was it byte-identical", and for nothing else.
 *
 * ── WHAT A ROW MEANS ────────────────────────────────────────────────────────
 * status:
 *   pending      planned, not yet attempted
 *   uploaded     copied AND the byte count Cloudinary reported matched source
 *   failed       download error, upload error, or a SIZE MISMATCH. A size
 *                mismatch is deliberately NOT 'uploaded': the asset exists but
 *                we cannot say it is the same file, and a migration that
 *                records unverified copies as done is worse than one that
 *                records nothing.
 *   exists       the public_id was already present and `overwrite: false`
 *                declined to touch it. After the collision pre-flight this
 *                should never happen; if it does, an assumption is wrong and
 *                the run surfaces it instead of resolving it.
 *   skipped-dead the source is a confirmed 404 on the legacy server. Recorded
 *                rather than omitted, so "we chose not to copy this" is
 *                distinguishable from "we never looked at it".
 *   superseded   the file exists and is fine, but a HUMAN decided another file
 *                replaces it — two encodings of one screenshot embedded twice
 *                in one article, say. NOT uploaded. `publicId` carries the
 *                WINNER's id and `supersededBy` its source path, so the rewrite
 *                phase can point this file's references at the winner and
 *                nothing 404s.
 *
 *                This is the one status that is a judgement rather than an
 *                observation, which is why `note` exists: a future reader must
 *                be able to see WHY a file was not copied without re-deriving
 *                the decision. Nothing here is ever renamed or suffixed —
 *                every file that IS uploaded keeps "public_id is the path".
 *
 * `sourcePath` is the unique key — it is what the legacy web refers to and the
 * only identifier that exists on both sides of the move.
 */
const LegacyFileMigrationSchema = new mongoose.Schema(
  {
    // The path on the legacy Drupal box, e.g. /sites/default/files/…/foo.png.
    // Leading slash, no host, no query. Unique: one row per source file.
    sourcePath:   { type: String, required: true, unique: true, trim: true },

    // Where it went. publicId omits the extension for images (Cloudinary
    // carries it as `format`) and keeps it for raw.
    publicId:     { type: String, default: '' },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    format:       { type: String, default: '' },

    // ── IS THE public_id STILL THE PATH? ────────────────────────────────────
    // FALSE for almost everything: the id is the legacy path verbatim, so
    // delivery derives one from the other by pattern with no lookup.
    //
    // TRUE only where Cloudinary refused the literal path — currently the six
    // files containing `&`, which becomes `and` (src/lib/legacyPublicId.js).
    // For those the mapping is LOSSY and cannot be inverted: `Build and Manage`
    // is an ordinary filename indistinguishable from the substituted form of
    // `Build & Manage`. So the fallback resolver and the handover list must
    // find these by QUERY, not by re-deriving them — which is why this is an
    // indexed boolean and not a sentence in `note`.
    //
    //   db.legacy_file_migrations.find({ publicIdSubstituted: true })
    publicIdSubstituted: { type: Boolean, default: false, index: true },

    // WHICH rules ran, as an ARRAY — a path can need more than one.
    // "Sales & Marketing .png" trips ampersand-to-and and then
    // trailing-whitespace-trim. A scalar field would record whichever ran last
    // and silently lose the other, leaving the resolver reasoning from an
    // incomplete account of what happened to the id. Values come from
    // src/lib/legacyPublicId.js; [] means the identity mapping.
    substitutionRule:    { type: [String], default: [] },

    // ── RULING 3: the extension disagrees with the stored format ────────────
    // Five files are PNGs named .jpg on the legacy server. Cloudinary sniffs
    // the real content and stores `format: png`, so the derived delivery URL —
    // which ends .jpg because the legacy PATH does — asks for a TRANSCODE.
    // Storage is correct and byte-exact; it is delivery that converts.
    //
    // Recorded as two queryable fields rather than inferred, so the delivery
    // design can find them with a query instead of re-deriving the comparison:
    //   db.legacy_file_migrations.find({ $expr: { $ne: ['$storedFormat', '$pathExtension'] } })
    storedFormat:  { type: String, default: '' },
    pathExtension: { type: String, default: '' },

    // The two fields above are the raw, auditable truth, but comparing them
    // directly is MISLEADING: Cloudinary reports `jpg` for a file named
    // `.jpeg`, so a naive $expr inequality returns 32 rows of which 27 are that
    // harmless alias and only 5 are a real disagreement. This boolean is the
    // one to query — it treats jpg/jpeg as the same format and is true only
    // where the bytes really are a different format from what the path claims.
    formatDisagrees: { type: Boolean, default: false, index: true },

    // ── RULING 2: an accepted size difference ───────────────────────────────
    // Non-empty ONLY where a byte difference was examined and accepted, with
    // the reason. Both sizes stay on the row (sourceBytes / uploadedBytes) so
    // the delta remains auditable rather than being rounded away into "match".
    // An empty string means the sizes matched exactly — the normal case.
    sizeExceptionReason: { type: String, default: '' },

    // As returned by Cloudinary, and as this migration will construct it from
    // the legacy path. Stored side by side ON PURPOSE: if they ever disagree,
    // the pattern-derivation assumption in the header is broken and delivery
    // would silently 404. Cheap insurance against the one failure that would
    // not show up until customers hit it.
    secureUrl:    { type: String, default: '' },
    derivedUrl:   { type: String, default: '' },

    sourceBytes:  { type: Number, default: null },
    uploadedBytes:{ type: Number, default: null },

    // sha256 of the bytes we fetched; etag as Cloudinary reported it. The
    // authoritative check is the byte count — the etag is advisory, because
    // Cloudinary does not promise it is an MD5 of the original for every
    // resource type.
    sha256:       { type: String, default: '' },
    etag:         { type: String, default: '' },

    status:       {
      type: String,
      enum: ['pending', 'uploaded', 'failed', 'exists', 'skipped-dead', 'superseded'],
      default: 'pending',
      index: true,
    },
    error:        { type: String, default: '' },

    // Set only for `superseded`: the source path of the file that replaces
    // this one. `publicId` above holds that file's id, so a rewrite can be
    // driven off either field.
    supersededBy: { type: String, default: '' },

    // Why a human made a decision about this row. Distinct from `error`, which
    // is what a machine reported going wrong.
    note:         { type: String, default: '' },

    // Carried from the audit so this collection can be read on its own.
    refCount:     { type: Number, default: 0 },
    directory:    { type: String, default: '' },

    attemptedAt:  { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'legacy_file_migrations',
    // Index creation is a WRITE. The migration script runs in dry-run mode by
    // default and must not alter the database just by being started, so
    // indexes are built explicitly under --apply instead of on model use.
    autoIndex: false,
    // …and so is creating the collection. `autoIndex: false` alone is NOT
    // enough: Mongoose's separate `autoCreate` (default TRUE) issues a
    // createCollection the first time the model is used, so merely READING
    // through this model in a dry run left an empty collection behind. Both
    // flags are needed for "dry run changes nothing" to actually hold. The
    // collection is created under --apply, by createIndexes().
    autoCreate: false,
  },
);

LegacyFileMigrationSchema.index({ status: 1, sourcePath: 1 });
LegacyFileMigrationSchema.index({ publicId: 1 });

export default mongoose.models.LegacyFileMigration ||
  mongoose.model('LegacyFileMigration', LegacyFileMigrationSchema);
