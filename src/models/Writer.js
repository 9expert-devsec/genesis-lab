import mongoose from 'mongoose';
import {
  WRITER_PLATFORMS,
  WRITER_SLUG_RE,
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
      experience:     { type: [String], default: [] },
      education:      { type: [String], default: [] },
      certifications: { type: [String], default: [] },
      recognition:    { type: [String], default: [] },
    },

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
