import mongoose from 'mongoose';
import { ALL_TYPE_IDS } from '@/lib/banners/bannerTypes';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
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
    // Five active youtube records hold 187–340 characters here. A rename is a
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

    // Designed slots with no source on video/image/article (only `course` has
    // an upstream equivalent, in course_teaser / MSDB's `title`).
    subtitle:        { type: String, trim: true, maxlength: 300 },
    description:     { type: String, trim: true, maxlength: 2000 },

    // ── course type ──
    // BOTH identifiers, because a course code MOVES. `upstreamId` is MSDB's
    // `_id` and is stable; `courseId` is the human code and is what breaks —
    // upstream `?course_id=` is exact-match case-sensitive and five public
    // courses carry mixed-case ids (Power-Apps, SQL-PG-Query, SQL-ADM-Tuning,
    // MS-SQL-19-Prov, SQL-ADM-Secure), plus one online id ships with a LEADING
    // SPACE (" ONL-MSE-PQ-PM"). Resolution goes upstreamId first, then the
    // trimmed + case-folded code — and a miss must drop the item, never render
    // a card with a dead link. Same two-key shape as CourseExtension, and for
    // the same reason.
    //
    // `default: undefined` on the subdocument: without it mongoose materialises
    // `course_ref: {}` on every new save, including video and image records
    // that have no course at all.
    course_ref: {
      type: new mongoose.Schema(
        {
          upstreamId: { type: String, default: '', trim: true },
          courseId:   { type: String, default: '', trim: true },
          kind:       { type: String, enum: ['inclass', 'online'], default: 'inclass' },
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
