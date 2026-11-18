import mongoose from 'mongoose';

/**
 * ProgramPageConfig — admin-managed pretty-URL + SEO layer for the
 * public /program/[slug] route. Mirrors the CourseExtension pattern.
 *
 * `programId` matches `program_id` (short upstream code, e.g. "DEV") or
 * `_id` from /programs — the resolver in /program/[slug]/page.jsx
 * accepts both.
 */
const ProgramPageConfigSchema = new mongoose.Schema(
  {
    programId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Custom URL slug (no leading slash). Empty/null → fall back to the
    // program_name → kebab-case slug at resolve time.
    urlSlug: { type: String, default: null, trim: true },

    // The page's own H1 and hero description, separate from the meta tags and
    // from the short upstream name the menu shows. Empty → see lib/pageHero.
    heroTitle:       { type: String, default: '' },
    heroDescription: { type: String, default: '' },

    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    ogImage:         { type: String, default: '' },

    isPublished: { type: Boolean, default: true },

    /**
     * THE PROGRAM COPY — two content sections on the public program page
     * (ProgramPageClient): "intro" under the hero, "why + benefit" before the
     * FAQ. All optional; empty renders neither section. Shaped by
     * lib/pageConfigUpdate.shapeProgramCopy (trim, empty rows dropped, ≤ 8
     * rows, icon from lib/programCopyIcons). introHtml is sanitised on save
     * AND at render. Rows carry no _id so a raw seed write and an admin save
     * store the same shape.
     */
    introHeading:   { type: String, default: '' },
    introHtml:      { type: String, default: '' },
    whyHeading:     { type: String, default: '' },
    whyLead:        { type: String, default: '' },
    whyItems: {
      type: [
        new mongoose.Schema(
          {
            title:       { type: String, default: '' },
            description: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    benefitHeading: { type: String, default: '' },
    benefitLead:    { type: String, default: '' },
    benefitCards: {
      type: [
        new mongoose.Schema(
          {
            icon:        { type: String, default: '' },
            title:       { type: String, default: '' },
            description: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    /**
     * THE CATALOG PDF, one per program, Thai only — see lib/pageCatalog.
     *
     * `path` is the root-relative `/files/catalog/…` string derived from the
     * KEY of this row, never typed; the button on the public page renders on
     * hasCatalog() and on nothing else. The rest mirrors what
     * CourseOutlineFile keeps about an outline: the upload overwrites in
     * place at a fixed Cloudinary id, so `version` is the only record that
     * the bytes were ever replaced. Written by lib/actions/page-catalogs only;
     * saveProgramConfig $sets its own fields and leaves this one alone.
     */
    catalogPdf: {
      path:       { type: String, default: '' },
      bytes:      { type: Number, default: 0 },
      uploadedAt: { type: Date, default: null },
      uploadedBy: { type: String, default: '' },
      version:    { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'program_page_configs' }
);

// Empty-string urlSlug would conflict on the unique sparse index across
// rows; coerce to null so the index just ignores them.
ProgramPageConfigSchema.pre('save', function preSave(next) {
  if (typeof this.urlSlug === 'string' && this.urlSlug.trim() === '') {
    this.urlSlug = null;
  }
  next();
});

ProgramPageConfigSchema.index({ urlSlug: 1 }, { sparse: true });

export default mongoose.models.ProgramPageConfig ||
  mongoose.model('ProgramPageConfig', ProgramPageConfigSchema);
