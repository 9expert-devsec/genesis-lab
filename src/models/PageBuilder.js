import mongoose from 'mongoose';
import {
  PAGE_TYPES,
  PAGE_STATUSES,
  PAGE_THEMES,
  JSONLD_TYPES,
} from '@/lib/schemas/pageBuilder';

/**
 * PageBuilder — a section-based, admin-authored page (collection
 * `page_builder_pages`). This is the `builder` page type that replaces the
 * raw-HTML `CustomPage` (`advanced_html`) as the default primitive: instead
 * of one free HTML blob, a page is an ordered list of preset-driven
 * `sections`, each a self-contained, CI-token-locked block.
 *
 * WHY the section blob is loose (Mixed): every section type carries a
 * different `content` shape, and re-declaring all of them in Mongoose would
 * duplicate the validation that already lives — authoritatively — in the Zod
 * discriminated union at `lib/schemas/pageBuilder.js` (MANIFESTO §4.6). The
 * model's job is only to persist the validated blob, so the sub-schema below
 * is `strict: false`: the action layer validates with Zod first, then stores.
 *
 * WHY promotionId lives here: Genesis owns the link to MSDB, not the other
 * way round. A `promotion` page points at an MSDB `Promotion.promotion_id`;
 * `/promotions` joins on it at render time. MSDB never learns Genesis exists.
 *
 * `preview.passwordHash` is a bcrypt hash — the plain password is NEVER
 * stored (hashing happens in the action layer). `slugHistory` mirrors
 * CustomPage so the future public route can 301 old slugs.
 */

// Model-level enum vocabularies (pageType/status/theme/JSON-LD @types) are
// imported from the Zod schema — the single source per §4.6. That module
// imports only `zod`, so this import never drags anything client-unsafe in,
// and the admin UI can pull the same vocabularies without touching mongoose.
// The section preset vocabularies live there too, since they only ever
// appear inside the loose `sections` blob below.

/**
 * One section. Loose on purpose (see file header): only the stable
 * envelope fields are typed; `settings/layout/style/content/advanced` are
 * Mixed so each section type's own shape survives a round-trip. Zod is the
 * real validator. `_id: false` — sections carry their own `id`.
 * `minimize: false` keeps empty preset objects (`{}`) instead of dropping
 * them, so the editor always gets a full shape back.
 */
const SectionSchema = new mongoose.Schema(
  {
    id:        { type: String, required: true }, // client-generated stable id
    type:      { type: String, required: true }, // one of the §5 section types
    name:      { type: String, default: '' },    // admin-facing label
    enabled:   { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    settings:  { type: mongoose.Schema.Types.Mixed, default: {} }, // containerWidth, spacing*, background, visibility
    layout:    { type: mongoose.Schema.Types.Mixed, default: {} }, // ratio, mobileBehavior, columns
    style:     { type: mongoose.Schema.Types.Mixed, default: {} }, // accentColor, cardStyle, buttonStyle
    content:   { type: mongoose.Schema.Types.Mixed, default: {} }, // per-type; shape varies
    advanced:  { type: mongoose.Schema.Types.Mixed, default: {} }, // sectionId, customClass, customCss, customHtml (developer tier)
  },
  { _id: false, strict: false, minimize: false }
);

const PageBuilderSchema = new mongoose.Schema(
  {
    slug:     { type: String, required: true, unique: true, trim: true },
    title:    { type: String, required: true, trim: true },  // rendered as H1
    pageType: { type: String, enum: PAGE_TYPES,    default: 'general' },
    status:   { type: String, enum: PAGE_STATUSES, default: 'draft' },

    // Chrome + theme presets. Booleans let a landing/thank-you page drop the
    // site header/footer; stickyCta is the mobile bottom bar.
    theme:         { type: String, enum: PAGE_THEMES, default: 'default' },
    showHeader:    { type: Boolean, default: true },
    showFooter:    { type: Boolean, default: true },
    showStickyCta: { type: Boolean, default: false },

    // Scheduling window. Null = unbounded on that side. Consumed by the
    // `scheduled` status + the future public visibility check.
    publishStartDate: { type: Date, default: null },
    publishEndDate:   { type: Date, default: null },

    // Link to an MSDB promotion (its `promotion_id`). Only meaningful when
    // pageType === 'promotion'; empty otherwise. Indexed for the
    // `/promotions` batch join (getPageBuilderPagesByPromotionIds).
    //
    // Promotion mode (Phase 1): pageType === 'promotion' with an EMPTY promotionId
    // is a Genesis-originated (standalone) promotion — it owns its own card + slug;
    // a NON-EMPTY promotionId is the MSDB-anchored detail link. See
    // lib/pageBuilder/promotionMode.js for the discriminator.
    promotionId: { type: String, default: '', trim: true, index: true },

    // Shared sort key for the Phase-3 /promotions grid union, so Genesis promos
    // and MSDB promos order by one scale (mirrors Promotion.display_order; lower
    // shows first). Only meaningful for pageType === 'promotion'.
    promotionOrder: { type: Number, default: 0 },

    // Uploaded cover image — its secure URL ONLY, deliberately NO publicId token.
    // Storing a publicId would wake the item-5 Cloudinary GC before it is ready
    // (option B): these covers are intentionally NOT GC-tracked yet, and are
    // uploaded to a subfolder OUTSIDE the GC's `page-builder/` scope so an
    // untracked asset can never look like an orphan. Revisit when 5b lands. See
    // docs/page-builder-status.md item 5.
    promotionCover: { type: String, default: '' },

    // The page body — ordered section blocks. Loose blob (see SectionSchema).
    sections: { type: [SectionSchema], default: [] },

    // SEO surface — mirrors CustomPage's fields, grouped under one sub-doc.
    seo: {
      metaTitle:       { type: String, trim: true, default: '' },
      metaDescription: { type: String, trim: true, default: '' },
      canonicalUrl:    { type: String, trim: true, default: '' }, // empty = derive from slug
      noIndex:         { type: Boolean, default: false },
      ogTitle:         { type: String, trim: true, default: '' },
      ogDescription:   { type: String, trim: true, default: '' },
      ogImage:         { type: String, default: '' },             // Cloudinary secure_url
      ogImagePublicId: { type: String, default: '' },             // for deletion
      ogType:          { type: String, enum: ['website', 'article'], default: 'website' },
      twitterCard:     { type: String, enum: ['summary', 'summary_large_image'], default: 'summary_large_image' },
    },

    // JSON-LD config. `mode: auto` derives structured data from the page;
    // `manual` uses the pinned `types`; `off` emits nothing. `rawOverride`
    // (gated by rawOverrideEnabled) is a developer-tier escape hatch that
    // ships a hand-crafted document straight through. `validation*` are
    // scratch fields the admin form writes after a Preview pass. Actual
    // JSON-LD GENERATION is a later phase — this only stores the config.
    jsonLd: {
      mode:  { type: String, enum: ['auto', 'manual', 'off'], default: 'auto' },
      types: { type: [String], enum: JSONLD_TYPES, default: [] }, // enum validates each element
      rawOverride:        { type: String, default: '' },
      rawOverrideEnabled: { type: Boolean, default: false },
      validationStatus: {
        type: String,
        enum: ['valid', 'warning', 'error', 'disabled', 'unchecked'],
        default: 'unchecked',
      },
      validationMessage: { type: String, default: '' },
    },

    // Password-protected preview of an unpublished page. `passwordHash` is
    // ALWAYS a bcrypt hash — the plain password never touches the DB
    // (hashing is done in the action layer). `failedAttempts`/`lockedUntil`
    // back the rate limiter on the public verify action (5 tries → 15-min
    // lock). `status` is derived: disabled until enabled, expired past
    // `expireDate`.
    preview: {
      enabled:           { type: Boolean, default: false },
      passwordHash:      { type: String, default: '' },
      passwordUpdatedAt: { type: Date, default: null },
      expireDate:        { type: Date, default: null },
      status:            { type: String, enum: ['active', 'expired', 'disabled'], default: 'disabled' },
      failedAttempts:    { type: Number, default: 0 },
      lockedUntil:       { type: Date, default: null },
    },

    // Slug history for 301 redirects (consumed by the public route later).
    slugHistory: [String],

    // ── The unpublished draft ─────────────────────────────────────────
    // A published page must not change when the author edits it. Autosave
    // writes the CONTENT surface here; pressing เผยแพร่ promotes it onto the
    // live fields above. It holds exactly DRAFT_CONTENT_KEYS —
    //
    //   title, sections, theme, showHeader, showFooter, showStickyCta,
    //   seo, jsonLd, promotionCover
    //
    // — plus the server-set stamps savedAt/savedBy. Everything else in the
    // editable surface is LIVE-ONLY and keeps taking effect immediately;
    // lib/schemas/pageBuilder.js owns that partition and the reasoning.
    //
    // NULL MEANS "nothing unpublished here". Existing pages are NOT
    // backfilled — there is no migration — so a draft appears lazily on
    // first edit and most documents will simply lack the key. Readers must
    // treat absent and null identically (lib/pageBuilder/draftState.js does).
    //
    // WHY Mixed, not a typed sub-schema: same reason as SectionSchema above.
    // Zod is the authoritative validator — draftContentSchema is PICKED from
    // pageBuilderSchema, so retyping the nine fields here would duplicate that
    // and let the two drift. The model's job is to persist the validated blob.
    //
    // ONE EXCEPTION ON CREATE, and it is this schema's doing: `title` is
    // `required`, so a brand-new page cannot hold its title only inside the
    // draft — create() would reject the document. createPageBuilderPage
    // therefore seeds the live title from the authored one (nothing is
    // published yet, so there is nothing for it to contradict) and every
    // later edit of it goes to the draft like the other eight keys.
    //
    // NEVER in a public projection. The draft is unpublished by definition;
    // a public read that carries it leaks unreleased content, which is the
    // one failure this whole split exists to prevent. Reads that must not
    // carry it go through stripDraft().
    //
    // NEVER inside a PageVersion snapshot. PageVersion is append-only
    // history, capped at 20 per page with a prune that DELETES rows; a draft
    // is a single mutable head that must never be pruned. Opposite
    // invariants — snapshotting a draft would archive unpublished content and
    // then quietly discard it.
    draft: { type: mongoose.Schema.Types.Mixed, default: null },

    // Audit — same shape as CustomPage.
    createdBy: { id: { type: String }, name: { type: String } },
    updatedBy: { id: { type: String }, name: { type: String } },
  },
  { timestamps: true, collection: 'page_builder_pages' }
);

// Indexes. `slug` unique is created by the field's `unique: true`; likewise
// `promotionId` by its field `index: true`. The rest are declared here.
// `slugHistory` powers 301 lookups; `status`/`pageType` power the admin
// list filters; the compound serves the common "published pages of type X"
// query for the public surfaces.
PageBuilderSchema.index({ slugHistory: 1 });
PageBuilderSchema.index({ status: 1 });
PageBuilderSchema.index({ pageType: 1 });
PageBuilderSchema.index({ status: 1, pageType: 1 });
// Promotion-grid sort key — mirrors Promotion's `{ display_order: 1 }` index
// (the Phase-3 union sorts both sources by their order scale). Phase 3 may add a
// compound `{ pageType, status, promotionOrder }` when it writes that query.
PageBuilderSchema.index({ promotionOrder: 1 });

export default mongoose.models.PageBuilder ||
  mongoose.model('PageBuilder', PageBuilderSchema);
