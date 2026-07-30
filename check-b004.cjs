const { MongoClient } = require('mongodb');
(async () => {
  const c = await new MongoClient(process.env.MONGODB_URI).connect();
  const col = c.db().collection('articles');

  console.log('unpinned WITH non-zero pinOrder :',
    await col.countDocuments({ isPinnedOnArticlePage: { $ne: true }, pinOrder: { $nin: [0, null] } }));
  console.log('isPinnedOnArticlePage missing   :',
    await col.countDocuments({ isPinnedOnArticlePage: { $exists: false } }));
  console.log('isPinnedOnArticlePage null      :',
    await col.countDocuments({ isPinnedOnArticlePage: null }));
  console.log('pinOrder missing                :',
    await col.countDocuments({ pinOrder: { $exists: false } }));
  console.log('truly pinned                    :',
    await col.countDocuments({ isPinnedOnArticlePage: true }));

  console.log('\noffenders (unpinned but ordered):');
  const bad = await col.find(
    { isPinnedOnArticlePage: { $ne: true }, pinOrder: { $nin: [0, null] } },
    { projection: { slug: 1, title: 1, pinOrder: 1, isPinnedOnArticlePage: 1, publishedAt: 1 } }
  ).toArray();
  for (const d of bad) {
    console.log(' pinOrder', d.pinOrder, '| pinned', d.isPinnedOnArticlePage,
      '| pub', d.publishedAt && new Date(d.publishedAt).toISOString().slice(0, 10), '|', (d.title || '').slice(0, 40));
  }
  await c.close();
})();