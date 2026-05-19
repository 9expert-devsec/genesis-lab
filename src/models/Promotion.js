import mongoose from 'mongoose';

/**
 * Promotion — local cache of an upstream /promotions item.
 *
 * Field-name mapping from the upstream payload:
 *   API `_id`         → promotion_id   (PK; stable upstream key)
 *   API `name`        → title
 *   API `image_url`   → thumbnail_url
 *   API `detail_html` → html_content
 *   API `start_at`    → start_date
 *   API `end_at`      → end_date
 *
 * `is_active` and `display_order` are admin-controlled and MUST survive
 * re-syncs (see syncPromotions.js — it `$setOnInsert`s these and never
 * touches them on update). Everything else is overwritten on each sync.
 */
const PromotionSchema = new mongoose.Schema(
  {
    promotion_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    title:         { type: String, default: '' },
    // MSDB-aligned aliases. `name` and `label` are the canonical
    // upstream fields; `title` is kept in lock-step with `name` (handler
    // + actions write both) so existing readers don't break.
    name:          { type: String, default: '' },
    label:         { type: String, default: '' },
    thumbnail_url: { type: String, default: '' },
    image_alt:     { type: String, default: '' },
    api_slug:      { type: String, default: '' },
    external_url:  { type: String, default: '' },

    start_date: { type: Date, default: null },
    end_date:   { type: Date, default: null },

    // MSDB-aligned naming. `detail_html` is the canonical field; the
    // older `html_content` is kept in sync (via syncPromotions and the
    // server actions) so existing readers don't break.
    detail_html:   { type: String, default: '' },
    html_content:  { type: String, default: '' },
    detail_plain:  { type: String, default: '' },

    tags: {
      type: [{ label: String, color: String, _id: false }],
      default: [],
    },

    // Upstream-linked public course IDs (course_id strings, e.g. ["MSE-AI", "MANUS-EXC"])
    // Synced from upstream API's related_courses array. Empty = applies to all courses.
    related_course_ids: { type: [String], default: [] },

    // Upstream publish/status flags, mirrored for filtering convenience.
    is_published:   { type: Boolean, default: true },
    is_pinned:      { type: Boolean, default: false },
    publish_status: { type: String, default: '' },
    time_status:    { type: String, default: '' },

    // Admin-controlled — preserved across syncs.
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number,  default: 0 },

    // Dual-write provenance:
    //   'msdb'    → owned upstream; we only mirror.
    //   'genesis' → admin created it from this app; we write through to MSDB
    //               and ignore loop-back webhooks (see handlers.handlePromotion).
    // `msdb_id` is the upstream Mongo `_id` once MSDB acknowledges the write,
    // needed for PUT/DELETE write-back. Empty until acknowledged.
    source:  { type: String, enum: ['msdb', 'genesis'], default: 'msdb' },
    msdb_id: { type: String, default: '' },

    synced_at: { type: Date, default: null },
  },
  { timestamps: true, collection: 'promotions' }
);

PromotionSchema.index({ display_order: 1 });
PromotionSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.Promotion ||
  mongoose.model('Promotion', PromotionSchema);
