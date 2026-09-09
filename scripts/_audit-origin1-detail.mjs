/** ORIGIN-1 - READ-ONLY detail on the Mongo shapes. No writes. */
import mongoose from 'mongoose';
const PREVIEW = 'genesis-lab.9expert.app';
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;

console.log('=== banners (Feature Content) ===');
for (const b of await db.collection('banners').find({}).toArray()) {
  const bad = String(b.link_url ?? '').includes(PREVIEW);
  console.log(`  ${bad ? 'PREVIEW ' : '        '}_id=${b._id} active=${b.is_active ?? b.isActive ?? '(unset)'} kind=${b.link_kind ?? b.linkKind ?? '(unset)'} placement=${b.placement ?? '(unset)'}`);
  if (bad) console.log(`            link_url=${b.link_url}`);
}

console.log('\n=== promotion_banners ===');
for (const b of await db.collection('promotion_banners').find({}).toArray()) {
  if (String(b.link_url ?? '').includes(PREVIEW)) console.log(`  _id=${b._id} active=${b.is_active ?? b.isActive ?? '(unset)'} link_url=${b.link_url}`);
}

console.log('\n=== site_notifications ===');
for (const n of await db.collection('site_notifications').find({}).toArray()) {
  if (String(n.click_href ?? '').includes(PREVIEW)) console.log(`  _id=${n._id} active=${n.is_active ?? n.isActive ?? '(unset)'} click_href=${n.click_href}`);
}

console.log('\n=== articles.content inline links ===');
for (const a of await db.collection('articles').find({ content: { $regex: PREVIEW } }).project({ slug: 1, status: 1, content: 1 }).toArray()) {
  const n = (a.content.match(new RegExp(PREVIEW, 'g')) ?? []).length;
  console.log(`  ${a.slug}  status=${a.status ?? '(unset)'}  occurrences=${n}`);
}

console.log('\n=== local_faqs.answer_html inline links ===');
for (const f of await db.collection('local_faqs').find({ answer_html: { $regex: PREVIEW } }).project({ answer_html: 1, question: 1 }).toArray()) {
  const n = (f.answer_html.match(new RegExp(PREVIEW, 'g')) ?? []).length;
  console.log(`  _id=${f._id}  occurrences=${n}  q="${String(f.question ?? '').slice(0, 50)}"`);
}

console.log('\n=== page_builder_pages ===');
for (const p of await db.collection('page_builder_pages').find({}).project({ slug: 1, status: 1 }).toArray()) console.log(`  ${p.slug} status=${p.status ?? '(unset)'}`);

console.log('\n=== not_found_hits: is the preview host STILL taking traffic? ===');
const nf = await db.collection('not_found_hits').find({ host: { $regex: PREVIEW } }).project({ host: 1, path: 1, createdAt: 1, ts: 1 }).toArray();
const stamps = nf.map((h) => h.createdAt ?? h.ts).filter(Boolean).map((d) => new Date(d).toISOString().slice(0, 10)).sort();
console.log(`  ${nf.length} recorded 404s on the preview host; first=${stamps[0] ?? '?'} last=${stamps.at(-1) ?? '?'}`);
await mongoose.disconnect();
