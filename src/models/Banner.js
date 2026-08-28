import mongoose from 'mongoose';
import {
  ALL_TYPE_IDS,
  COURSE_KIND_IDS,
  COURSE_KINDS,
} from '@/lib/banners/bannerTypes';
import { isRefBackedBannerType } from '@/lib/banners/bannerFormFields';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      // ── REQUIRED ONLY WHERE IT IS THE ONLY SOURCE OF A HEADLINE ─────────
      // `video` and `image` have no other name to fall back on, so an empty
      // title on one of those is a card with a blank headline. `course` and
      // `article` DO have one — the mapper reads
      // `text(banner.title) ?? courseName ?? article.title` — so on those two
      // an empty title means "use the referenced record's own name", and
      // demanding a value would force the admin to copy a name that already
      // exists upstream and will go stale the moment it is renamed there.
      //
      // A FUNCTION, and mongoose calls it with `this` bound to the document,
      // so it can read `this.type`. It runs on `create()` and `save()`;
      // `findByIdAndUpdate` does not run validators unless asked, which is
      // why the same rule is ALSO in the zod schema — that one runs on every
      // path into this collection.
      required: function required() {
        return !isRefBackedBannerType(this.type);
      },
      trim: true,
      maxlength: 200,
    },

    // Banner type — determines which fields are used.
    //
    // ACCEPTS BOTH SETS AT ONCE, and that is the point of ALL_TYPE_IDS: the
    // four new ids (video/image/course/article) so new records can be written,
    // AND the five legacy ids so all 22 existing documents keep validating on
    // save. Neither set is removed until the migration has moved the data —
    // narrowing this enum first would reject every stored record.
    // See src/lib/banners/bannerTypes.js for the ids and what they map to.
    type: {
      type: String,
      required: true,
      enum: ALL_TYPE_IDS,
    },

    // YouTube type fields
    youtube_id:      { type: String, default: '' },

    // ── slide_text: LIVE DATA. DO NOT RENAME. ────────────────────────────────
    // SIX stored youtube records hold 187–340 characters here (measured; an
    // earlier note said five).
    // write to every one of them, which is a migration, not a schema edit. The
    // replacement is `description` below; readers use `description ?? slide_text`
    // until the migration copies the values across. Both fields coexist on
    // purpose, and slide_text is dropped in the same slice that empties it.
    slide_text:      { type: String, default: '' },

    // ── ADDITIVE FIELDS FOR THE FOUR-TYPE REWORK ─────────────────────────────
    // Every one of these is nullable with NO default, and that is deliberate
    // rather than incidental: a `default` would not touch stored documents
    // either (mongoose applies defaults on write, and these reads are `.lean()`
    // which skips them entirely), but it WOULD make "never set" and "set to the
    // default" indistinguishable the moment anything saves. Undefined stays
    // answerable — see the same reasoning on Article.sortKey.
    //
    // Nothing reads these yet. They exist so the admin form and the migration
    // have somewhere to put values in later slices.

    // The designed headline is three coloured parts; `title` is only the first.
    // No stored field supplies lines 2 and 3 on ANY of the four sources, so
    // they are authored per record.
    title_line2:     { type: String, trim: true, maxlength: 200 },
    title_highlight: { type: String, trim: true, maxlength: 200 },

    // ── subtitle: NO UPSTREAM SOURCE ON ANY OF THE FOUR TYPES ──────────────
    // An earlier note here said a course's equivalent lived in
    // `course_teaser` / "MSDB's `title`". THERE IS NO `title` FIELD ON AN MSDB
    // COURSE. Measured: the union of keys across all 79 live public-course rows
    // is 39 names and `title` is not among them. `course_name` is the short
    // name (~36 characters) and `course_teaser` is the description (~363).
    //
    // So a course has no upstream subtitle at all, and the ruling is that the
    // ADMIN TYPES IT — BannerForm gives course records a real subtitle input
    // rather than hiding the slot. `description` stays hidden on course and
    // article, because those two DO have a source (`course_teaser` / `excerpt`)
    // and an admin-typed one would shadow it permanently and silently.
    description:     { type: String, trim: true, maxlength: 2000 },

    // ── course type ──
    // BOTH identifiers, because a course code MOVES. `upstreamId` is MSDB's
    // `_id` and is stable; `courseId` is the human code and is what breaks —
    // upstream `?course_id=` is exact-match case-sensitive. MEASURED against
    // the live feed rather than remembered: FOUR public ids are mixed-case —
    // SQL-PG-Query, SQL-ADM-Tuning, MS-SQL-19-Prov, SQL-ADM-Secure — and
    // `Power-Apps`, which every older note in this repo lists as a fifth, has
    // been fixed upstream to POWER-APPS. TWO online ids ship with a LEADING
    // SPACE, not one: " ONL-CYS" and " ONL-MSE-PQ-PM". Both counts are derived
    // by scripts/audit-course-id-casing and by the S6a probe; do not re-copy
    // either list from a comment.
    //
    // Resolution goes upstreamId first, then the trimmed + case-folded code —
    // and a miss must drop the item, never render a card with a dead link.
    // Same two-key shape as CourseExtension, and for the same reason.
    //
    // `default: undefined` on the subdocument: without it mongoose materialises
    // `course_ref: {}` on every new save, including video and image records
    // that have no course at all.
    course_ref: {
      type: new mongoose.Schema(
        {
          upstreamId: { type: String, default: '', trim: true },
          courseId:   { type: String, default: '', trim: true },
          // The list, not a copy of it. The same two strings are spelled by the
          // zod enum and by the admin picker; COURSE_KIND_IDS is what stops the
          // three drifting into a `kind` this enum rejects.
          //
          // `default` STAYS, and it is not in tension with the zod enum having
          // none: this default only fires for a document written without a kind
          // at all, which the form can no longer produce. It is the reading for
          // any pre-existing subdocument, and it matches what `collectFeatureRefs`
          // already assumes when `ref.kind` is absent (`=== ONLINE ? online : inclass`).
          kind: {
            type: String,
            enum: COURSE_KIND_IDS,
            default: COURSE_KINDS.INCLASS,
          },
        },
        { _id: false }
      ),
      default: undefined,
    },

    // ── article type ──
    // The slug, not the ObjectId: it is the public identity (`/articles/<slug>`),
    // it is `unique` on Article, and it survives a re-import that would mint a
    // new _id.
    article_slug:    { type: String, trim: true },

    // Used by youtube banners to show up to 3 feature highlights below the text
    feature_tags: {
      type: [
        new mongoose.Schema(
          {
            icon:  { type: String, default: '' },
            line1: { type: String, default: '', trim: true, maxlength: 60 },
            line2: { type: String, default: '', trim: true, maxlength: 60 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Image type fields
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },

    // ── WHERE THE PICTURE'S SUBJECT IS, IN PERCENT ───────────────────────────
    // One uploaded banner is shown in three frames of two different shapes —
    // the desktop stage at 12:5, the mobile stage at 16:9 and the strip card at
    // 16:9 — and `object-fit: cover` has to throw away whatever does not fit.
    // A CENTRE crop is only right when the subject is centred, and on these
    // records it is not: cropping the live "EARLY Bird! … Masterclass" art to
    // 16:9 takes 35% off the width and leaves "APLY … asterclass".
    //
    // So the record carries the point that must survive: `{x, y}` in percent of
    // the image's own box, exactly the coordinate space `object-position` uses,
    // so rendering is `object-position: ${x}% ${y}%` with no conversion step in
    // between. A conversion is a place for the two ends to disagree.
    //
    // ── ABSENT IS THE NORMAL STATE, AND IT IS NOT WRITTEN HERE ──────────────
    // No mongoose `default` and `default: undefined` on the subdocument, the
    // same shape and the same reason as `course_ref` above: a default would
    // materialise `image_focal: {}` on every save, including video records that
    // have no uploaded image at all, and it would make "never set" and "set to
    // the default" indistinguishable the moment anything saves.
    //
    // The READER supplies the fallback instead — focalPosition() in
    // src/lib/home/featureContentFromBanners.js, the ONE place that rule is
    // written down. Note before assuming it: that fallback is NOT the centre.
    // It is 40% 50%, because this corpus sets its headline against the left
    // margin and a centred 16:9 crop decapitates all five. The measurement and
    // the sweep behind that number are on DEFAULT_FOCAL in the same file.
    //
    // NOTHING WRITES THIS YET. The admin control that sets it is a later slice;
    // this is the column it will write into, added first so the renderer can be
    // built and proven against the absent case, which is the case every one of
    // the 22 stored documents is in today.
    image_focal: {
      type: new mongoose.Schema(
        {
          x: { type: Number, min: 0, max: 100 },
          y: { type: Number, min: 0, max: 100 },
        },
        { _id: false }
      ),
      default: undefined,
    },

    // Shared link fields (used by all types)
    link_url:        { type: String, default: '', trim: true },
    link_text:       { type: String, default: '', trim: true, maxlength: 100 },

    // Display control — lower weight shows first (matches legacy Drupal "weight")
    weight:          { type: Number, default: 0 },
    active:          { type: Boolean, default: true },
    starts_at:       { type: Date, default: null },
    ends_at:         { type: Date, default: null },
  },
  { timestamps: true, collection: 'banners' }
);

bannerSchema.index({ active: 1, weight: 1 });

export const Banner =
  mongoose.models.Banner || mongoose.model('Banner', bannerSchema);

export default Banner;
