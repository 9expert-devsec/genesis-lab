import mongoose from 'mongoose';
import {
  WRITER_FEATURED_COURSE_LIMIT,
  WRITER_PLATFORMS,
  WRITER_SLUG_RE,
  WRITER_VIDEO_LIMIT,
  WRITER_TYPES,
  isHttpUrl,
} from '@/lib/writers/writerFields';

/**
 * Writer — Genesis-owned author profile (no MSDB sync, no link to admin
 * accounts).
 *
 * `slug` is the public address and is locked after creation: updateWriter
 * refuses a change server-side (src/lib/writers/writerPolicy.js).
 *
 * `avatarPublicId` stores the Cloudinary public_id, never a URL, for the reason
 * Admin.imagePublicId does: one image renders at several sizes, and a finished
 * URL cannot be resized at read time.
 *
 * `instructorId` is the Genesis `Instructor._id`, NOT `instructor_id`. The real
 * instructor rows have an empty `instructor_id`, and the sync only ever touches
 * rows by that field, so `_id` is the id that stays put.
 *
 * Reads use `.lean()`, so defaults do not reach an older document. Go through
 * normalizeWriter (src/lib/writers/writerFields.js) rather than assuming a field.
 */
const SocialLinkSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: WRITER_PLATFORMS, required: true },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: { validator: isHttpUrl, message: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' },
    },
  },
  { _id: false }
);

/**
 * A section row. `period` is the ปี column ("2013 – Present"), optional.
 *
 * Rows stored before 2026-11-09 are plain strings. Reads are `.lean()`, which
 * casts nothing, and normalizeSectionItem reads a string as `{ text }`, so those
 * rows keep rendering until scripts/split-writer-periods.mjs converts them. Every
 * save goes through writerSchema, which only ever produces this object shape.
 */
const SectionItemSchema = new mongoose.Schema(
  {
    period: { type: String, trim: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const YouTubeVideoSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, match: /^[A-Za-z0-9_-]{11}$/ },
    url: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const maxItems = (n) => ({ validator: (list) => !list || list.length <= n, message: `ใส่ได้ไม่เกิน ${n} รายการ` });

const WriterSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: WRITER_SLUG_RE,
    },
    displayName: { type: String, required: true, trim: true },
    type: { type: String, enum: WRITER_TYPES, default: 'person' },
    role: { type: String, trim: true, default: '' },
    bio: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },

    // Array order is the display order.
    socialLinks: { type: [SocialLinkSchema], default: [] },
    sections: {
      experience:     { type: [SectionItemSchema], default: [] },
      education:      { type: [SectionItemSchema], default: [] },
      certifications: { type: [SectionItemSchema], default: [] },
      recognition:    { type: [SectionItemSchema], default: [] },
    },

    // The online courses an admin picked for the profile card, by the stable
    // upstream `o_course_id`, in display order. Empty = fall back to the
    // courses matched by the linked instructor's name.
    featuredOnlineCourseIds: {
      type: [String],
      default: [],
      validate: maxItems(WRITER_FEATURED_COURSE_LIMIT),
    },
    // Display order. Titles are fetched once, at save (lib/writers/youtube).
    youtubeVideos: {
      type: [YouTubeVideoSchema],
      default: [],
      validate: maxItems(WRITER_VIDEO_LIMIT),
    },
    youtubeChannelUrl: { type: String, trim: true, default: '' },

    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null },

    isActive: { type: Boolean, default: true },
    // The default writer (9Expert Academy). Set only by
    // scripts/seed-default-writer.mjs: no action writes this field.
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'writers' }
);

// At most one default, held by the database: a partial index only covers the
// rows where the flag is true, so every other writer stays out of it.
WriterSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

export default mongoose.models.Writer || mongoose.model('Writer', WriterSchema);
