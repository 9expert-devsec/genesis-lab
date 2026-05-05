/**
 * One-shot seeder for the Instructor collection.
 *
 * Scans public/Instructors and upserts one document per image file
 * matched on `image_url` (so re-running is safe). Uses $setOnInsert
 * for editable fields — admin edits are NEVER overwritten.
 *
 * Usage: `node --env-file=.env.local scripts/seed-instructors.js`
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const IMG_EXT = /\.(png|jpe?g|webp|avif)$/i;
const DIR_REL = 'public/Instructors';

// Inline schema — no path-alias resolution from a plain Node script.
const InstructorSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    title:           { type: String, default: '', trim: true },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'instructors' }
);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set — pass it via --env-file=.env.local');
    process.exit(1);
  }

  const dirAbs = path.resolve(process.cwd(), DIR_REL);
  if (!fs.existsSync(dirAbs)) {
    console.error('Directory not found:', dirAbs);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dirAbs)
    .filter((f) => IMG_EXT.test(f))
    .sort();

  if (files.length === 0) {
    console.warn('No image files found in', dirAbs);
    process.exit(0);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const Instructor =
    mongoose.models.Instructor || mongoose.model('Instructor', InstructorSchema);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const image_url = `/Instructors/${filename}`;

    // Placeholder name from the filename so the row passes the `required`
    // validator on first insert. Admin will edit via /admin/about.
    const placeholder = filename.replace(IMG_EXT, '').replace(/[-_]/g, ' ');

    const result = await Instructor.updateOne(
      { image_url },
      {
        $setOnInsert: {
          name:          placeholder,
          title:         '',
          image_url,
          display_order: i,
          is_active:     true,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount) {
      inserted += 1;
      console.log('  + inserted', image_url);
    } else {
      skipped += 1;
    }
  }

  console.log(
    `\nSeed complete: ${inserted} inserted, ${skipped} already existed (untouched).`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
