/**
 * ROUND 75 §B (part 1) — dump the three published pages, as the renderer will
 * see them, for _measure-round75-dark.mjs to render. Read-only, one find().
 *
 * IT WRITES scripts/_round75-pages.json AND THAT FILE IS NOT COMMITTED. It is
 * live page content out of Mongo, and a copy of it in git would be a second,
 * silently stale source for what the corpus contains — which is the same class
 * of mistake round 50's two false zeros came from. Re-run this before the
 * measurement rather than trusting an old dump.
 *
 * Run: node --env-file=.env.local scripts/_probe-round75-real-page.mjs
 */
import mongoose from 'mongoose';
import { writeFileSync } from 'node:fs';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('X MONGODB_URI missing'); process.exit(1); }
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
const db = mongoose.connection.db;
const found = await db.listCollections({ name: 'page_builder_pages' }).toArray();
if (!found.length) { console.error('X page_builder_pages missing'); process.exit(1); }
const col = db.collection('page_builder_pages');

const slugs = (process.env.SLUGS ?? 'expo002,early-bird-claude-code,ex-pro-1').split(',');
const pages = await col.find({ slug: { $in: slugs } }).toArray();
if (pages.length !== slugs.length) { console.error('X expected ' + slugs.length + ' pages, got ' + pages.length); process.exit(1); }

const out = pages.map((p) => ({
  slug: p.slug, status: p.status, theme: p.theme ?? null,
  sections: p.sections,
}));
writeFileSync('scripts/_round75-pages.json', JSON.stringify(out, null, 2), 'utf8');

// A compact outline, so the shape is readable without the blob.
const line = (s, d) => {
  const st = s.settings ?? {}; const sy = s.style ?? {};
  const bits = [
    `${'  '.repeat(d)}${s.type}`,
    st.background && st.background !== 'default' ? `bg=${st.background}` : null,
    st.backgroundMode === 'custom' ? `bgCUSTOM=${JSON.stringify(st.backgroundCustom)}` : null,
    sy.accentColor ? `accent=${sy.accentColor}` : null,
    sy.accentMode === 'custom' ? `accentCUSTOM=${sy.accentCustom}` : null,
    sy.cardStyle ? `card=${sy.cardStyle}` : null,
    s.enabled === false ? 'DISABLED' : null,
  ].filter(Boolean);
  return bits.join('  ');
};
const KEYS = ['children', 'left', 'right', 'items', 'cards', 'columns'];
function outline(nodes, d, acc) {
  for (const s of nodes ?? []) {
    if (!s || typeof s !== 'object') continue;
    acc.push(line(s, d));
    const c = s.content ?? {};
    for (const k of KEYS) if (Array.isArray(c[k])) outline(c[k], d + 1, acc);
    if (Array.isArray(c.tabs)) for (const t of c.tabs) outline(t?.children ?? [], d + 1, acc);
  }
}
for (const p of out) {
  const acc = [];
  outline(p.sections, 0, acc);
  console.log(`\n=== ${p.slug}  (${p.status}, theme=${p.theme ?? 'default'}) — ${acc.length} nodes ===`);
  console.log(acc.join('\n'));
}
await mongoose.disconnect();
