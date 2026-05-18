import mongoose from 'mongoose';

/**
 * Faq — local cache of an upstream /faqs item.
 *
 * Field-name mapping from the upstream payload:
 *   API `_id`          → faq_id           (PK; stable upstream key)
 *   API `question`     → question
 *   API `answer_html`  → answer_html
 *   API `answer_plain` → answer_plain
 *   API `category`     → upstream_category
 *   API `is_published` → is_published
 *   API `order`        → upstream_order
 *
 * `is_active`, `display_order`, and `category_override` are admin-controlled
 * and MUST survive re-syncs (see syncFaqs.js — `$setOnInsert`s these and
 * never touches them on update). Everything else is overwritten on each sync.
 *
 * `category_override`: null = use upstream_category; non-null string = use this
 * value instead. Lets admins re-group FAQs without editing upstream.
 */
const FaqSchema = new mongoose.Schema(
  {
    faq_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    question:          { type: String, default: '' },
    answer_html:       { type: String, default: '' },
    answer_plain:      { type: String, default: '' },
    upstream_category: { type: String, default: '' },
    is_published:      { type: Boolean, default: false },
    upstream_order:    { type: Number, default: 0 },
    synced_at:         { type: Date, default: null },

    // Admin-controlled — preserved across syncs.
    is_active:         { type: Boolean, default: true },
    display_order:     { type: Number, default: 0 },
    category_override: { type: String, default: null },
  },
  { timestamps: true, collection: 'faqs' }
);

FaqSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.Faq ||
  mongoose.model('Faq', FaqSchema);