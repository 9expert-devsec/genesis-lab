const { MongoClient } = require('mongodb');
(async () => {
  const c = await new MongoClient(process.env.MONGODB_URI).connect();
  const rows = await c.db().collection('articles')
    .find({ publishedAt: { $ne: null } }, { projection: { publishedAt: 1 } }).toArray();

  const hour = Array(24).fill(0);
  const min = {};
  for (const r of rows) {
    const d = new Date(r.publishedAt);
    hour[d.getUTCHours()]++;
    min[d.getUTCMinutes()] = (min[d.getUTCMinutes()] || 0) + 1;
  }

  console.log('rows:', rows.length, '\n');
  console.log('UTC hr → BKK hr | count');
  hour.forEach((n, h) => console.log(
    String(h).padStart(2, '0'), '   →', String((h + 7) % 24).padStart(2, '0'), '     |',
    '█'.repeat(Math.round(n / 2)), n
  ));

  console.log('\nminutes (non-zero minutes = candidate human picks):');
  Object.entries(min).sort((a, b) => b[1] - a[1])
    .forEach(([m, n]) => console.log('  :' + String(m).padStart(2, '0'), n));
  await c.close();
})();