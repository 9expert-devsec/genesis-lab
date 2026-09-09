/** ORIGIN-1 - READ-ONLY. Is the preview origin still being MINTED, or only carried? */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 15000, maxPoolSize: 3 });
const db = mongoose.connection.db;
const rows = await db.collection('admin_audit_logs')
  .find({ 'after.signup_url': { $regex: 'genesis-lab' } }).sort({ createdAt: -1 }).limit(3).toArray();
for (const l of rows) {
  console.log('='.repeat(70));
  console.log(`${new Date(l.createdAt).toISOString().slice(0,16).replace('T',' ')}  ${l.action}  by ${l.actor?.name}`);
  console.log('BEFORE keys:', l.before ? Object.keys(l.before).join(', ') : '(before is null/absent entirely)');
  console.log('AFTER  keys:', l.after ? Object.keys(l.after).join(', ') : '(absent)');
  console.log('before.signup_url:', JSON.stringify(l.before?.signup_url));
  console.log('after.signup_url :', JSON.stringify(l.after?.signup_url));
}
console.log('\n' + '='.repeat(70));
console.log('CONTROL: do any audit rows carry a PRODUCTION-host signup_url in `after`?');
const prod = await db.collection('admin_audit_logs')
  .find({ 'after.signup_url': { $regex: '9experttraining' } }).sort({ createdAt: -1 }).limit(3).toArray();
console.log(`  ${prod.length} found (most recent first):`);
for (const l of prod) console.log(`   ${new Date(l.createdAt).toISOString().slice(0,16).replace('T',' ')}  by ${l.actor?.name}  ${l.after.signup_url}`);
await mongoose.disconnect();
