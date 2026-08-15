/**
 * READ-ONLY probe: what `CourseExtension.urlAlias` actually contains.
 *
 * Answers the two questions the alias check's semantics turn on:
 *   · does any stored alias carry an uppercase character (so a case-sensitive
 *     comparison could differ from a case-insensitive one on real data);
 *   · would any two stored aliases COLLIDE if compared case-insensitively
 *     (which is the only way case-sensitivity could be hiding a live defect).
 *
 * Runs a find() and prints. There is no write in this file.
 *
 * Usage: node --env-file=.env.local scripts/_probe-url-alias-casing.mjs
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) throw new Error('MONGODB_URI missing');

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection('course_extensions');

const total = await col.countDocuments({});
const withAlias = await col
  .find({ urlAlias: { $nin: [null, ''] } }, { projection: { urlAlias: 1, courseId: 1, isPublished: 1 } })
  .toArray();

console.log(`collection: ${db.databaseName}.course_extensions`);
console.log(`TOTAL extension rows      : ${total}`);
console.log(`rows carrying a urlAlias  : ${withAlias.length}`);

const upper = withAlias.filter((d) => /[A-Z]/.test(d.urlAlias));
const trailing = withAlias.filter((d) => /\/$/.test(d.urlAlias));
const noLeading = withAlias.filter((d) => !String(d.urlAlias).startsWith('/'));

console.log(`  with an UPPERCASE char  : ${upper.length}`);
console.log(`  with a trailing slash   : ${trailing.length}`);
console.log(`  missing a leading slash : ${noLeading.length}`);

// Would any two collide if compared case-insensitively?
const byLower = new Map();
for (const d of withAlias) {
  const k = String(d.urlAlias).toLowerCase();
  byLower.set(k, [...(byLower.get(k) ?? []), d]);
}
const collisions = [...byLower.entries()].filter(([, v]) => v.length > 1);
console.log(`  case-insensitive collisions among stored aliases : ${collisions.length}`);
for (const [k, v] of collisions) {
  console.log(`    ${k} ← ${v.map((d) => `${d.courseId}:${d.urlAlias}`).join(' , ')}`);
}

const hidden = withAlias.filter((d) => d.isPublished === false);
console.log(`  aliases held by an UNPUBLISHED (hidden) course   : ${hidden.length}`);

console.log('\nevery stored alias:');
for (const d of withAlias.sort((a, b) => String(a.urlAlias).localeCompare(String(b.urlAlias)))) {
  const flag = /[A-Z]/.test(d.urlAlias) ? '  <-- has uppercase' : '';
  console.log(`  ${String(d.urlAlias).padEnd(44)} ${String(d.courseId).padEnd(22)} published=${d.isPublished !== false}${flag}`);
}

await client.close();
