/**
 * ROUND 58 — READ-ONLY. Dump the two promotion pages' <style> blocks verbatim,
 * plus the markup around the price panel, so §B reports MEASURED values.
 * No writes.
 * Usage: node --env-file=.env.local scripts/_probe-round58-original-css.mjs [slug]
 */
import mongoose from 'mongoose';
function die(m) { console.error('✖ ' + m); process.exit(1); }
const SLUGS = [
  'promotion-claude-ai-bundle',
  'promotion-build-business-apps-with-claude-code',
];
const only = process.argv[2];
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const found = await db.listCollections({ name: 'promotions' }).toArray();
  if (!found.length) die('collection "promotions" does not exist');
  for (const slug of only ? [only] : SLUGS) {
    const p = await db.collection('promotions').findOne({ api_slug: slug });
    if (!p) die(`no promotion with api_slug=${slug}`);
    const html = p.html_content || '';
    console.log(`\n=================== ${slug} — ${html.length} bytes ===================`);
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) console.log(m[1]);
  }
  await mongoose.disconnect();
}
main().catch((e) => die(e?.stack || String(e)));
