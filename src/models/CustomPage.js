import mongoose from 'mongoose';
import { CUSTOM_PAGE_TYPES } from '@/lib/schemas/customPage';

/**
 * CustomPage — admin-authored standalone pages (e.g. a landing page that
 * embeds a Google Form) with full SEO control. Genesis-owned (no MSDB sync).
 *
 * `body` holds HTML from the Tiptap editor; it is sanitized at render time
 * in a later batch. The `jsonLd` sub-document mirrors Article's shape but
 * with page-appropriate schema types. `slugHistory` keeps previously-used
 * slugs so the public catch-all route can issue 301 redirects. `previewToken`
 * lets admins view a draft without publishing.
 */
const CustomPageSchema = new mongoose.Schema(
  {
    slug:   { type: String, required: true, unique: true, trim: true },
    title:  { type: String, required: true, trim: true },  // rendered as H1
    body:   { type: String, required: true },              // HTML from Tiptap; sanitized at render time
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },

    // Basic SEO
    metaTitle:       { type: String, trim: true, default: '' },
    metaDescription: { type: String, trim: true, default: '' },
    canonicalUrl:    { type: String, trim: true, default: '' },  // empty = derive from slug at render time
    noIndex:         { type: Boolean, default: false },

    // Open Graph
    ogTitle:         { type: String, trim: true, default: '' },
    ogDescription:   { type: String, trim: true, default: '' },
    ogImage:         { type: String, default: '' },  // Cloudinary secure_url
    ogImagePublicId: { type: String, default: '' },  // for deletion
    ogType:          { type: String, enum: ['website', 'article'], default: 'website' },

    // Twitter
    twitterCard:     { type: String, enum: ['summary', 'summary_large_image'], default: 'summary_large_image' },

    // Schema.org JSON-LD configuration. `overrides` lets the admin pin
    // specific JSON-LD fields without touching raw JSON; `rawOverride`
    // (gated by `rawOverrideEnabled`) lets a superadmin ship a hand-crafted
    // document straight through. `validation*` are scratch fields the admin
    // form writes after a Preview pass.
    jsonLd: {
      enabled:    { type: Boolean, default: true },
      schemaType: {
        type: String,
        enum: ['WebPage', 'FAQPage', 'Article', 'BreadcrumbList'],
        default: 'WebPage',
      },
      overrides: {
        name:          { type: String, default: '' },
        description:   { type: String, default: '' },
        image:         { type: String, default: '' },
        datePublished: { type: String, default: '' },
        dateModified:  { type: String, default: '' },
      },
      rawOverride:        { type: String, default: '' },
      rawOverrideEnabled: { type: Boolean, default: false },
      validationStatus: {
        type: String,
        enum: ['valid', 'warning', 'error', 'disabled', 'unchecked'],
        default: 'unchecked',
      },
      validationMessage: { type: String, default: '' },
    },

    // Slug history for 301 redirects (consumed by the public route later).
    slugHistory: [String],  // previously-used slugs

    // ── Promotion mode ────────────────────────────────────────────────
    // `pageType` is ROUTING: 'promotion' moves this page's public home to
    // /promotions/<slug>, puts a card on the /promotions grid, and turns the
    // bare slug into a 308 to that home. TWO values only, and
    // lib/schemas/customPage.js owns both the list and the measurement behind
    // it — including why there is deliberately no `promotionId` here and what
    // would have to change before a linked promotion could exist.
    //
    // NOT THE SAME FIELD AS PageAuditLog.pageType, which is a different
    // vocabulary ('builder' | 'advanced_html') on a different model. Both names
    // appear in lib/actions/customPages.js; the audit rows write AUDIT_TYPE,
    // never this.
    //
    // The enum is IMPORTED, not retyped, for the same reason PageBuilder imports
    // PAGE_TYPES: the schema module is the single source and mongoose must not
    // hold a second copy that can drift.
    pageType:       { type: String, enum: CUSTOM_PAGE_TYPES, default: 'general' },

    // Grid order, ascending (lower shows first). Only meaningful for
    // pageType === 'promotion'. Sorted ACROSS both collections — a builder
    // promotion and an Advanced HTML promotion with neighbouring values
    // interleave, because both are Genesis-owned pages on one admin-controlled
    // scale. See orderedPromotionCards in lib/pages/promotionMode.js.
    promotionOrder: { type: Number, default: 0 },

    // Card image for the /promotions grid. URL only — no publicId, matching the
    // builder's promotionCover, so nothing here owns a Cloudinary asset the way
    // ogImagePublicId does. DRAFTED (it is in CUSTOM_PAGE_DRAFT_KEYS): the live
    // card keeps the published cover until เผยแพร่.
    promotionCover: { type: String, default: '' },

    // Draft preview — random token lets admins view a draft without publishing.
    previewToken: { type: String, default: '' },

    // ── The unpublished draft ─────────────────────────────────────────
    // A published page must not change when the author edits it.
    // บันทึกฉบับร่าง writes the CONTENT surface here; pressing เผยแพร่ promotes
    // it onto the live fields above. It holds exactly CUSTOM_PAGE_DRAFT_KEYS —
    //
    //   title, body, metaTitle, metaDescription, canonicalUrl, noIndex,
    //   ogTitle, ogDescription, ogImage, ogImagePublicId, ogType,
    //   twitterCard, jsonLd, promotionCover
    //
    // — plus the server-set stamps savedAt/savedBy. Everything else in the
    // editable surface is LIVE-ONLY and keeps taking effect immediately —
    // slug, status, slugHistory, and now pageType and promotionOrder;
    // lib/schemas/customPage.js owns that partition and the reasoning.
    //
    // FOURTEEN KEYS, where PageBuilder's draft holds nine. The two page types
    // store different things; the SEMANTICS are shared through
    // lib/pages/draftState.js, which takes the key list as a parameter, and the
    // LIST is not.
    //
    // NULL MEANS "nothing unpublished here". Existing pages are NOT
    // backfilled — there is no migration — so a draft appears lazily on first
    // save and most documents will simply lack the key. Readers must treat
    // absent and null identically (lib/pages/draftState.js does).
    //
    // WHY Mixed, not a typed sub-schema: Zod is the authoritative validator —
    // customPageDraftContentSchema is PICKED from customPageSchema, so retyping
    // the fourteen fields here would duplicate that and let the two drift. The
    // model's job is to persist the validated blob.
    //
    // TWO EXCEPTIONS ON CREATE, and they are this schema's doing: `title` AND
    // `body` are both `required`, so a brand-new page cannot hold either only
    // inside the draft — create() would reject the document. createCustomPage
    // therefore seeds the live values from the authored ones (nothing is
    // published yet, so there is nothing for them to contradict) and every later
    // edit goes to the draft like the other twelve keys. PageBuilder has this
    // problem once, for `title`; here it is twice.
    //
    // NEVER in a public projection. The draft is unpublished by definition; a
    // public read that carries it leaks unreleased content, which is the one
    // failure this whole split exists to prevent. Reads that must not carry it
    // go through stripDraft().
    draft: { type: mongoose.Schema.Types.Mixed, default: null },

    // Audit
    createdBy: { id: { type: String }, name: { type: String } },
    updatedBy: { id: { type: String }, name: { type: String } },
  },
  { timestamps: true, collection: 'custom_pages' }
);

CustomPageSchema.index({ slugHistory: 1 });
CustomPageSchema.index({ status: 1 });
// The /promotions grid loader queries { pageType, status } and sorts on
// promotionOrder — the same shape, and the same index, PageBuilder declares for
// the builder half of that union.
CustomPageSchema.index({ status: 1, pageType: 1 });

export default mongoose.models.CustomPage || mongoose.model('CustomPage', CustomPageSchema);
