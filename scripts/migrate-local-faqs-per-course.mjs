/**
 * One-off migration: LocalFaq category-wide → per-course scoping.
 *
 * Old shape:  { category: 'public_inhouse' | 'career_path' | 'masterclass', ... }
 * New shape:  { course_type: 'public' | 'career_path' | 'masterclass',
 *               ref_id: <course reference string>, ... }
 *
 * Mapping:
 *   category 'masterclass'     → course_type 'masterclass',
 *                                ref_id = _id of the "Claude AI for Data Analyst"
 *                                MasterclassCourse (the only masterclass that had
 *                                FAQs when this system was category-wide).
 *   category 'public_inhouse'  → course_type 'public',      ref_id = '' (orphan)
 *   category 'career_path'     → course_type 'career_path',  ref_id = '' (orphan)
 *
 * Orphans (ref_id === '') intentionally match no course and stay hidden until an
 * admin reassigns them via the target course's own FAQ editor. This is the
 * desired "no fallback" behaviour, not a bug. No documents are deleted.
 *
 * Uses the raw MongoDB collection (not the Mongoose model) so it can still read
 * the legacy `category` field and write without tripping the new schema's
 * validators.
 *
 * Usage: `node --env-file=.env.local scripts/migrate-local-faqs-per-course.mjs`
 * (mirrors the connection setup in src/lib/db/connect.js — MONGODB_URI +
 * MONGODB_DB_NAME env vars; nothing is hardcoded.)
 */

import mongoose from 'mongoose';

const MASTERCLASS_MATCH = /claude\s*ai.*data\s*analyst/i;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('✖ MONGODB_URI not set — pass it via --env-file=.env.local');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const faqs = db.collection('local_faqs');
  const courses = db.collection('masterclass_courses');

  // 1) Resolve the target masterclass course for legacy 'masterclass' FAQs.
  const mcDoc = await courses.findOne({ title_th: { $regex: MASTERCLASS_MATCH } });

  const hasMasterclassFaqs =
    (await faqs.countDocuments({ category: 'masterclass' })) > 0;

  if (!mcDoc && hasMasterclassFaqs) {
    console.error(
      '✖ Could not find a MasterclassCourse whose title_th matches ' +
        `${MASTERCLASS_MATCH} — aborting so masterclass FAQs are not ` +
        'mis-assigned. Create/rename the course first, then re-run.'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const mcRefId = mcDoc ? String(mcDoc._id) : '';
  if (mcDoc) {
    console.log(`✓ Matched masterclass course "${mcDoc.title_th}" → _id ${mcRefId}`);
  }

  // 2) Migrate each doc. Only touch docs that still have the legacy `category`.
  const cursor = faqs.find({ category: { $exists: true } });
  const summary = { masterclass: 0, public: 0, career_path: 0, unknown: 0 };
  let orphanPublic = 0;
  let orphanCareerPath = 0;

  for await (const doc of cursor) {
    let course_type;
    let ref_id;

    switch (doc.category) {
      case 'masterclass':
        course_type = 'masterclass';
        ref_id = mcRefId;
        break;
      case 'public_inhouse':
        course_type = 'public';
        ref_id = '';
        orphanPublic += 1;
        break;
      case 'career_path':
        course_type = 'career_path';
        ref_id = '';
        orphanCareerPath += 1;
        break;
      default:
        console.warn(`⚠ Skipping doc ${doc._id} — unknown category "${doc.category}"`);
        summary.unknown += 1;
        continue;
    }

    await faqs.updateOne(
      { _id: doc._id },
      { $set: { course_type, ref_id }, $unset: { category: '' } }
    );
    summary[course_type] += 1;
  }

  // 3) Summary.
  console.log('\n── Migration summary ─────────────────────────────');
  console.log(`  masterclass  : ${summary.masterclass}`);
  console.log(`  public       : ${summary.public}`);
  console.log(`  career_path  : ${summary.career_path}`);
  if (summary.unknown) console.log(`  skipped      : ${summary.unknown} (unknown category)`);

  if (orphanPublic || orphanCareerPath) {
    console.log('\n──────────────────────────────────────────────────');
    console.warn(
      `⚠ ${orphanPublic} public FAQs and ${orphanCareerPath} career_path FAQs ` +
        'have no course assigned (ref_id = "") — reassign them in the admin ' +
        'panel or they will not be shown anywhere.'
    );
    console.log('──────────────────────────────────────────────────');
  } else {
    console.log('\n✓ No orphaned FAQs — every migrated doc has a course assigned.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
