/**
 * ROUND 58 — READ-ONLY. Two questions in one connection:
 *
 *   E. How many stored `price_card` sections exist, and what `cardStyle` does
 *      each carry today?
 *   B. What are the ORIGINAL promotion pages' real values for the six style
 *      differences (ribbon, title size, price size, chip, two-column list,
 *      surface)?
 *
 * No writes. No updateOne, no bulkWrite, no $set in this file.
 *
 * ── ROUND 50's TWO FALSE ZEROS, PRE-EMPTED THE SAME WAY ROUND 57 DID ──────
 * 1. COLLECTION NAME. `pagebuilders` (mongoose's default pluralisation) does
 *    not exist; the real name is `page_builder_pages`. Every read goes through
 *    requireCollection, which ERRORS on a missing name rather than returning an
 *    empty cursor — "no documents" and "no collection" are the same number and
 *    only one of them means anything.
 * 2. VERSION PATH. Snapshots live at `snapshot.sections`, not
 *    `content.sections`. Asserted below: a non-empty page_versions that yields
 *    zero sections fails the run.
 * Plus the third control: a TYPE HISTOGRAM, so "no price_card carries a
 *    cardStyle" is distinguishable from "the walk never ran".
 *
 * Usage: node --env-file=.env.local scripts/_probe-round58-promo-card-style.mjs
 */
import mongoose from 'mongoose';

function die(msg) { console.error('✖ ' + msg); process.exit(1); }

const SLOTS = ['children', 'left', 'right'];

function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (s.type === 'price_card') {
      const cs = s?.style?.cardStyle;
      out.priceCards.push({ cardStyle: cs === undefined ? '<absent>' : JSON.stringify(cs) });
    }
    // every type that READS cardStyle
    if (['price_card', 'stat_card', 'icon_card'].includes(s.type)) {
      const cs = s?.style?.cardStyle;
      const key = `${s.type}:${cs === undefined ? '<absent>' : String(cs)}`;
      out.styleHist[key] = (out.styleHist[key] ?? 0) + 1;
    }
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ walked: 0, types: {}, priceCards: [], styleHist: {} });

// ── B: pull the declaration blocks the six differences live in ────────────
function cssRulesFor(css, needles) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    const body = m[2].replace(/\s+/g, ' ').trim();
    if (needles.some((n) => sel.toLowerCase().includes(n))) out.push(`${sel} { ${body} }`);
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // ── E ───────────────────────────────────────────────────────────────────
  const pages = await (await requireCollection(db, 'page_builder_pages'))
    .find({}, { projection: { slug: 1, status: 1, sections: 1, draft: 1 } }).toArray();
  const versions = await (await requireCollection(db, 'page_versions'))
    .find({}, { projection: { pageId: 1, versionNumber: 1, snapshot: 1 } }).toArray();

  const live = bucket(); const draft = bucket(); const versioned = bucket();
  for (const d of pages) { walk(d.sections, live); walk(d?.draft?.sections, draft); }
  for (const v of versions) walk(v?.snapshot?.sections, versioned);

  if (versions.length > 0 && versioned.walked === 0) {
    die(`page_versions has ${versions.length} docs but the walk found 0 sections — wrong path, not a real zero`);
  }

  console.log('=== E. stored cardStyle readers ===');
  console.log(`pages: ${pages.length}   versions: ${versions.length}`);
  for (const [name, b] of [['live', live], ['draft', draft], ['versions', versioned]]) {
    console.log(`\n-- ${name} -- walked ${b.walked} sections`);
    console.log('   type histogram:', JSON.stringify(b.types));
    console.log('   price_card count:', b.priceCards.length);
    console.log('   cardStyle histogram (the 3 readers):', JSON.stringify(b.styleHist));
  }

  // ── B ───────────────────────────────────────────────────────────────────
  const promos = await (await requireCollection(db, 'promotions'))
    .find({}, { projection: { title: 1, api_slug: 1, html_content: 1 } }).toArray();
  console.log(`\n=== B. promotion pages: ${promos.length} ===`);
  for (const p of promos) {
    const html = typeof p.html_content === 'string' ? p.html_content : '';
    console.log(`\n##### ${p.api_slug} — ${html.length} bytes`);
    if (!html) { console.log('   (no html_content)'); continue; }
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    console.log(`   <style> chars: ${styles.length}`);
    const NEEDLES = [
      'ribbon', 'badge', 'corner', 'price', 'title', 'chip', 'round', 'date',
      ':root', 'card', 'panel', 'detail-row', 'info', 'meta', 'promo',
    ];
    for (const rule of cssRulesFor(styles, NEEDLES)) console.log('   ' + rule);
  }

  await mongoose.disconnect();
}
main().catch((e) => die(e?.stack || String(e)));
