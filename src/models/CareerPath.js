import mongoose from 'mongoose';

/**
 * CareerPath — local cache of an upstream /career-path item.
 *
 * Field-name mapping from the actual upstream payload (curl-verified):
 *   API `_id`               → career_path_id  (PK; stable upstream key)
 *   API `slug`              → api_slug        (e.g. "prompt-engineer-career-path"
 *                                              — already includes the suffix)
 *   API `title`             → title
 *   API `cardDetail`        → short_description
 *   API `status`            → upstream_status  ('active' / …)
 *   API `sortOrder`         → upstream_order
 *   API `coverImage.url`    → hero_image_url
 *   API `coverImage.alt`    → hero_image_alt
 *   API `roadmapImage.url`  → roadmap_image_url
 *   API `roadmapImage.alt`  → roadmap_image_alt
 *   API `detail.tagline`    → tagline
 *   API `detail.intro`      → intro
 *   API `detail.contentHtml`→ description_html
 *   API `detail.objectives` → objectives []
 *   API `detail.suitableFor`→ suitable_for []
 *   API `detail.prerequisites` → prerequisites []
 *   API `detail.benefits`   → benefits []
 *   API `links`             → links { detailUrl, signupUrl, outlineUrl }
 *   API `price`             → price { fullPrice, salePrice, discountPct, currency }
 *   API `curriculum`        → curriculum [{ kind, title, items[] }]
 *
 * `is_active` and `display_order` are admin-controlled and MUST survive
 * re-syncs (see syncCareerPaths.js — `$setOnInsert` on first insert and
 * never touched on update). Everything else is overwritten on each sync.
 */
const CareerPathSchema = new mongoose.Schema(
  {
    career_path_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    api_slug: { type: String, default: '', trim: true, index: true },

    title:             { type: String, default: '' },
    short_description: { type: String, default: '' },
    tagline:           { type: String, default: '' },
    intro:             { type: String, default: '' },
    description_html:  { type: String, default: '' },

    objectives:    { type: [String], default: [] },
    suitable_for:  { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    benefits:      { type: [String], default: [] },

    hero_image_url:    { type: String, default: '' },
    hero_image_alt:    { type: String, default: '' },
    roadmap_image_url: { type: String, default: '' },
    roadmap_image_alt: { type: String, default: '' },

    links: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Stored as raw JSON — shape: [{ kind, title, description,
    // chooseMin, chooseMax, items: [{ kind, snap: { code, name, … } }] }]
    curriculum: { type: mongoose.Schema.Types.Mixed, default: [] },

    upstream_status: { type: String, default: '' },
    upstream_order:  { type: Number, default: 0 },
    synced_at:       { type: Date, default: null },

    // Admin-controlled — preserved across syncs.
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'career_paths' }
);

CareerPathSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.CareerPath ||
  mongoose.model('CareerPath', CareerPathSchema);