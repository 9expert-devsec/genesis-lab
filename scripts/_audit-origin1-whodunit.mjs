/** ORIGIN-1 - READ-ONLY. Who created the localhost / preview signup_url rounds? */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;

const show = (l) => {
  const a = l.actor ?? {};
  console.log(`  ${new Date(l.createdAt).toISOString().slice(0,16).replace('T',' ')}  ${l.action}  ${l.recordLabel ?? l.recordId ?? '?'}`);
  console.log(`     actor: ${a.email ?? a.name ?? a.username ?? JSON.stringify(a).slice(0,120)}`);
  console.log(`     url  : ${l.after?.signup_url ?? l.before?.signup_url}`);
};

console.log('=== LOCALHOST signup_url in the audit log ===');
for (const l of await db.collection('admin_audit_logs').find({ $or: [{ 'after.signup_url': { $regex: 'localhost' } }, { 'before.signup_url': { $regex: 'localhost' } }] }).sort({ createdAt: 1 }).toArray()) show(l);

console.log('\n=== who wrote PREVIEW-origin signup_urls, by actor ===');
const prev = await db.collection('admin_audit_logs').find({ 'after.signup_url': { $regex: 'genesis-lab' } }).sort({ createdAt: 1 }).toArray();
const by = new Map();
for (const l of prev) {
  const a = l.actor ?? {};
  const who = a.email ?? a.name ?? JSON.stringify(a).slice(0, 60);
  by.set(who, (by.get(who) ?? 0) + 1);
}
for (const [who, n] of [...by].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${who}`);
if (prev.length) {
  console.log(`  window: ${new Date(prev[0].createdAt).toISOString().slice(0,10)} -> ${new Date(prev.at(-1).createdAt).toISOString().slice(0,10)}`);
}
await mongoose.disconnect();
