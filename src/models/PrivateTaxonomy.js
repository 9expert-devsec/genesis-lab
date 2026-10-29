import mongoose from 'mongoose';

/**
 * Custom PRIVATE programs and skills — a small reusable catalogue for private
 * courses only (collection `private_taxonomy`).
 *
 * Genesis-only, like PrivateCourse: never written to MSDB, and no public
 * listing reads this collection — the mega menu, program/skill pages, search,
 * sitemap, MCP and corpora all read MSDB's /programs and /skills, which have
 * never heard of it. The ONLY public reader is the private course page, which
 * reads the one program its course points at for the hero colour and logo.
 *
 * `color` is `#RRGGBB` — required for a program (it is the hero background),
 * optional for a skill (skill chips are hidden on the private page). The shape
 * rule lives in lib/courses/privateTaxonomyStore so the actions and the tests
 * share one definition; the schema repeats it as the last line of defence.
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

const PrivateTaxonomySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['program', 'skill'], required: true, index: true },
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: '', trim: true },
    color: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: (v) => v === '' || HEX6.test(v),
        message: 'color must be #RRGGBB',
      },
    },
  },
  { timestamps: true, collection: 'private_taxonomy' }
);

export const PrivateTaxonomy =
  mongoose.models.PrivateTaxonomy || mongoose.model('PrivateTaxonomy', PrivateTaxonomySchema);

export default PrivateTaxonomy;
