/**
 * READ-ONLY — the GENESIS half of the ZZTEST-CANVA-01 restore material.
 *
 * The upstream capture (_probe-canva-topics-capture.mjs) saves what MSDB holds.
 * This saves what genesis holds: the `course_extensions` document, and the
 * exact `training_topics` array on its own so the read-back diffs against a
 * file that contains nothing else.
 *
 * ABSENCE IS RECORDED EXPLICITLY, not as a missing file. `null` and "no
 * document" are different states here — buildExtensionUpdate reads an absent
 * KEY as leave-alone, so "the extension did not exist" and "the extension
 * existed with no trainingTopicsRich" produce different expectations for what
 * stage 1 should write. A capture that cannot tell them apart cannot verify.
 *
 * Reads only. No write helper is imported by this file.
 *
 * Usage: node --env-file=.env.local scripts/_probe-canva-extension-capture.mjs
 */

import { register } from 'node:module';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

/** Pinned. Never an argument. */
const SUBJECT = 'ZZTEST-CANVA-01';
const SUBJECT_ID = '6a7d86e0cdf728240d601257';

const DIR = process.env.PROBE_DIR ?? '.';
const SNAP = path.resolve(DIR, 'zztest-canva-01.upstream.json');
const EXT_OUT = path.resolve(DIR, 'zztest-canva-01.extension.json');
const TOPICS_OUT = path.resolve(DIR, 'zztest-canva-01.training_topics.json');

if (!existsSync(SNAP)) {
  console.error(`\nX no upstream capture at ${SNAP} - run _probe-canva-topics-capture.mjs first.\n`);
  process.exit(1);
}

const snap = JSON.parse(readFileSync(SNAP, 'utf8'));

console.log('');
console.log('== ZZTEST-CANVA-01 - GENESIS-SIDE CAPTURE (read only) ======================');
console.log('');

/* -- the training_topics array, alone, verbatim -------------------------- */
const topics = Array.isArray(snap.training_topics) ? snap.training_topics : null;
writeFileSync(TOPICS_OUT, JSON.stringify(topics, null, 2), 'utf8');
console.log(`   training_topics written : ${TOPICS_OUT}`);
console.log(`   rows                    : ${topics === null ? 'NOT AN ARRAY' : topics.length}`);
console.log('');

/* -- the course_extensions document -------------------------------------- */
const { dbConnect } = await import('@/lib/db/connect');
const { default: CourseExtension } = await import('@/models/CourseExtension');
await dbConnect();

/**
 * Looked up BOTH ways deliberately. The document is keyed by the course_id
 * CODE, and separately carries the backfilled upstream `_id` anchor. If those
 * two ever disagree for this subject, the read-back would be verifying a
 * different row than the one the form wrote, so the disagreement has to be
 * visible here rather than discovered later.
 */
const byCode = await CourseExtension.findOne({ courseId: SUBJECT }).lean();
const byAnchor = await CourseExtension.findOne({ upstreamId: SUBJECT_ID }).lean();

console.log('-- course_extensions ------------------------------------------------------');
console.log(`   by courseId=${SUBJECT}  : ${byCode ? `found _id=${byCode._id}` : 'ABSENT'}`);
console.log(`   by upstreamId anchor    : ${byAnchor ? `found _id=${byAnchor._id}` : 'ABSENT'}`);

if (byCode && byAnchor && String(byCode._id) !== String(byAnchor._id)) {
  console.error('');
  console.error('   X THE TWO LOOKUPS DISAGREE. Two documents claim this course.');
  console.error('     STOP - the read-back cannot know which one the form wrote.');
  process.exit(1);
}

const doc = byCode ?? byAnchor ?? null;

const record = {
  capturedFor: SUBJECT,
  upstreamId: SUBJECT_ID,
  documentExists: doc !== null,
  document: doc,
  /* The one field stage 1 is about, stated as its own answer so the read-back
   * compares against a recorded fact rather than re-deriving it. */
  trainingTopicsRich: doc
    ? (Object.prototype.hasOwnProperty.call(doc, 'trainingTopicsRich')
      ? { present: true, value: doc.trainingTopicsRich }
      : { present: false, value: null })
    : { present: false, value: null },
};

writeFileSync(EXT_OUT, JSON.stringify(record, null, 2), 'utf8');
console.log('');
console.log(`   extension written       : ${EXT_OUT}`);
console.log(`   trainingTopicsRich      : ${record.trainingTopicsRich.present
  ? JSON.stringify(record.trainingTopicsRich.value)
  : 'KEY ABSENT'}`);
console.log('');

/* -- how many courses carry the field at all, so "the FIRST" is measured -- */
const withField = await CourseExtension.countDocuments({
  trainingTopicsRich: { $exists: true, $ne: [] },
});
const total = await CourseExtension.countDocuments({});
console.log('-- IS THIS THE FIRST NON-ABSENT VALUE IN THE COLLECTION? ------------------');
console.log(`   course_extensions docs            : ${total}`);
console.log(`   with a NON-EMPTY trainingTopicsRich: ${withField}`);
console.log('');
console.log(withField === 0
  ? '   YES - no document carries a non-empty value. Stage 1 would be the first.'
  : `   NO - ${withField} document(s) already carry one. Name them before proceeding.`);

if (withField > 0) {
  const rows = await CourseExtension.find({ trainingTopicsRich: { $exists: true, $ne: [] } })
    .select('courseId trainingTopicsRich').limit(10).lean();
  rows.forEach((r) => console.log(`     - ${r.courseId}: ${JSON.stringify(r.trainingTopicsRich).slice(0, 120)}`));
}
console.log('');
process.exit(0);
