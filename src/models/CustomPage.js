import mongoose from 'mongoose';

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

    // Draft preview — random token lets admins view a draft without publishing.
    previewToken: { type: String, default: '' },

    // Audit
    createdBy: { id: { type: String }, name: { type: String } },
    updatedBy: { id: { type: String }, name: { type: String } },
  },
  { timestamps: true, collection: 'custom_pages' }
);

CustomPageSchema.index({ slugHistory: 1 });
CustomPageSchema.index({ status: 1 });

export default mongoose.models.CustomPage || mongoose.model('CustomPage', CustomPageSchema);
