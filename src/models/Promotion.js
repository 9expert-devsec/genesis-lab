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
    thumbnail_url: { type: String, default: '' },
    image_alt:     { type: String, default: '' },
    api_slug:      { type: String, default: '' },
    external_url:  { type: String, default: '' },

    start_date: { type: Date, default: null },
    end_date:   { type: Date, default: null },

    html_content:  { type: String, default: '' },
    detail_plain:  { type: String, default: '' },

    tags: {
      type: [{ label: String, color: String, _id: false }],
      default: [],
    },

    // Upstream publish/status flags, mirrored for filtering convenience.
    is_published:   { type: Boolean, default: true },
    is_pinned:      { type: Boolean, default: false },
    publish_status: { type: String, default: '' },
    time_status:    { type: String, default: '' },

    // Admin-controlled — preserved across syncs.
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number,  default: 0 },

    synced_at: { type: Date, default: null },
  },
  { timestamps: true, collection: 'promotions' }
);

PromotionSchema.index({ display_order: 1 });
PromotionSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.Promotion ||
  mongoose.model('Promotion', PromotionSchema);
