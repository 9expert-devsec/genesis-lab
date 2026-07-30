const { MongoClient } = require('mongodb');
(async () => {
  const c = await new MongoClient(process.env.MONGODB_URI).connect();
  const col = c.db().collection('articles');
  const sort = { isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 };
  const rows = await col
    .find({}, { projection: { slug: 1, title: 1, publishedAt: 1, updatedAt: 1, active: 1, isPinnedOnArticlePage: 1 } })
    .sort(sort)
    .toArray();

  const outside = rows
    .map((d, i) => ({ rank: i + 1, ...d }))
    .filter((d) => d.rank > 200)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 10);

  console.log('total:', rows.length, '| outside admin window:', rows.length - 200);
  console.log('\n10 most recently EDITED articles that the admin list cannot see:');
  for (const d of outside) {
    console.log(
      String(d.rank).padStart(4),
      new Date(d.updatedAt).toISOString().slice(0, 16),
      '| pub', d.publishedAt ? new Date(d.publishedAt).toISOString().slice(0, 10) : 'null',
      '| active', d.active,
      '|', (d.title || '').slice(0, 45)
    );
  }
  await c.close();
})();