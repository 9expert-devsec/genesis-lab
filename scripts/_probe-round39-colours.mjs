/**
 * Round 39 L — READ-ONLY census of authored background / accent values across
 * the real corpus. Nothing is written.
 */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
console.log('database:', db.databaseName);

const bg = new Map();
const ac = new Map();
let pages = 0, sections = 0, live = 0, draftSections = 0;
const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

for (const p of await db.collection('page_builder_pages').find({}).toArray()) {
  pages += 1;
  for (const s of p.sections ?? []) {
    sections += 1; live += 1;
    bump(bg, JSON.stringify(s?.settings?.background ?? null));
    bump(ac, JSON.stringify(s?.style?.accentColor ?? null));
  }
  for (const s of p.draft?.sections ?? []) draftSections += 1;
}
console.log(`pages: ${pages}  LIVE sections: ${live}  (draft sections, not counted: ${draftSections})`);
console.log('settings.background, by value:', JSON.stringify([...bg].sort((a,b)=>b[1]-a[1])));
console.log('style.accentColor,  by value:', JSON.stringify([...ac].sort((a,b)=>b[1]-a[1])));
const nonDefaultBg = [...bg].filter(([k]) => k !== '"default"' && k !== 'null').reduce((n,[,v])=>n+v,0);
const nonDefaultAc = [...ac].filter(([k]) => k !== 'null').reduce((n,[,v])=>n+v,0);
console.log('NON-DEFAULT background sections:', nonDefaultBg);
console.log('NON-DEFAULT accent sections   :', nonDefaultAc);
// The stored snapshots carry sections too — a restore would reintroduce them.
let snapSections = 0;
for (const v of await db.collection('page_versions').find({}).toArray()) {
  snapSections += (v.snapshot?.sections ?? []).length;
}
console.log('sections inside stored page_versions snapshots:', snapSections);
await mongoose.disconnect();
