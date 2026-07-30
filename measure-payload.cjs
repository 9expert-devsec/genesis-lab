const { MongoClient } = require('mongodb');
const P = { slug:1, title:1, author:1, coverUrl:1, tags:1, articleType:1, active:1,
  featuredOnLanding:1, publishedAt:1, createdAt:1, isPinnedOnArticlePage:1,
  pinOrder:1, showPinBadge:1 };
(async () => {
  const c = await new MongoClient(process.env.MONGODB_URI).connect();
  const col = c.db().collection('articles');
  const all  = await col.find({}, { projection: P }).toArray();
  const full = await col.find({}, { limit: 200 }).toArray();
  const kb = (d) => (Buffer.byteLength(JSON.stringify(d)) / 1024).toFixed(0) + ' KB';
  console.log('projected, all rows :', all.length, kb(all));
  console.log('per row average     :', (Buffer.byteLength(JSON.stringify(all)) / all.length).toFixed(0), 'bytes');
  console.log('for comparison — 200 rows WITHOUT projection (pre-commit-2):', kb(full));
  await c.close();
})();
