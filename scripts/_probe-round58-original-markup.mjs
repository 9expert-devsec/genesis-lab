/** ROUND 58 — READ-ONLY. Dump the price-panel markup + any media queries that
 * touch it. No writes.
 * Usage: node --env-file=.env.local scripts/_probe-round58-original-markup.mjs <slug> <needle>
 */
import mongoose from 'mongoose';
function die(m) { console.error('✖ ' + m); process.exit(1); }
async function main() {
  const [slug, needle] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const p = await db.collection('promotions').findOne({ api_slug: slug });
  if (!p) die(`no promotion ${slug}`);
  const html = p.html_content || '';
  const body = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const i = body.indexOf(needle);
  if (i < 0) die(`needle "${needle}" not in body`);
  console.log(body.slice(Math.max(0, i - 400), i + 3200));
  await mongoose.disconnect();
}
main().catch((e) => die(e?.stack || String(e)));
