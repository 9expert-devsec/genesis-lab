/**
 * Round 38 F — READ-ONLY. What the projection costs and what it drops.
 */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const c = mongoose.connection.db.collection('page_audit_logs');
console.log('rows with a non-empty sectionId:', await c.countDocuments({ sectionId: { $nin: ['', null] } }));
console.log('rows with a non-empty field    :', await c.countDocuments({ field: { $nin: ['', null] } }));
console.log('rows with before != null       :', await c.countDocuments({ before: { $ne: null } }));
console.log('rows with after  != null       :', await c.countDocuments({ after: { $ne: null } }));
// distinct before/after shapes, to show they are presence flags
const shapes = new Map();
for (const r of await c.find({}).toArray()) {
  const k = `${r.action}  before=${JSON.stringify(r.before)}  after=${JSON.stringify(r.after)}`;
  shapes.set(k, (shapes.get(k) ?? 0) + 1);
}
console.log('--- distinct (action, before, after) triples ---');
for (const [k, n] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x  ${k}`);
// payload
const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');
const full = await c.find({}).toArray();
const proj = await c.find({}).project({ action: 1, actor: 1, createdAt: 1 }).toArray();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log('full row  JSON bytes: median', med(full.map(bytes)), 'max', Math.max(...full.map(bytes)));
console.log('projected JSON bytes: median', med(proj.map(bytes)), 'max', Math.max(...proj.map(bytes)));
// how many 'update' rows actually changed the slug?
const upd = full.filter((r) => r.action === 'update');
console.log(`'update' rows: ${upd.length}; with before.slug !== after.slug:`,
  upd.filter((r) => r.before?.slug !== r.after?.slug).length,
  '; with before.status !== after.status:', upd.filter((r) => r.before?.status !== r.after?.status).length);
console.log('publish rows:', full.filter((r) => r.action === 'publish').length,
            '| page_versions rows:', await mongoose.connection.db.collection('page_versions').countDocuments({}));
await mongoose.disconnect();
