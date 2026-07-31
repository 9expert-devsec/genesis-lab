/**
 * Banner `link_url` scheme audit — DRY-RUN, READ-ONLY.
 *
 * ── CONCLUSION (measured 2026-07-31 — DO NOT RE-RUN TO "CHECK") ─────────────
 * Every stored banner link is already https. NOTHING is refused by the
 * blocklist, so shipping src/lib/bannerLinkUrl.js removes NO link that exists
 * today. The guard is purely defensive — it bounds what a future admin can
 * paste into the field, it does not change what the homepage renders now.
 *
 *   banners            22 documents, 22 with a link_url, 22/22 https, 0 refused
 *   promotion_banners   5 documents,  5 with a link_url,  5/5 https, 0 refused
 *
 * READ THAT AS A MEASUREMENT, NOT A GUARANTEE. It says the blocklist is
 * currently inert; it does not say the field is safe, because the field is
 * free text an admin can change at any time — which is the whole reason the
 * guard ships. If you are here because a banner stopped linking, the answer is
 * NOT in this file: look for the `[banner] link_url refused` console.warn,
 * which names the offending _id.
 *
 * A note on the warning node prints when this runs: MODULE_TYPELESS_PACKAGE_JSON
 * for src/lib/bannerLinkUrl.js. The repo's package.json has no `"type"`, so Node
 * sniffs the file and reparses it as ESM. Cosmetic, and NOT worth "fixing" by
 * adding `"type": "module"` — that would change module resolution for the whole
 * Next app to satisfy one script.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * src/lib/bannerLinkUrl.js refuses `javascript:` / `data:` / `vbscript:` in a
 * banner's link_url. A blocklist that fires in production is a link that
 * DISAPPEARS from the homepage, so before shipping it somebody has to know
 * whether any stored banner would actually be refused — otherwise the change is
 * a guess wearing a safety justification.
 *
 * This script performs NO writes. Not behind a flag, not at all: two `find()`
 * calls and a report. There is no `updateOne`, no `bulkWrite`, no `$set`
 * anywhere in this file.
 *
 * ── WHAT IT LOOKS AT ────────────────────────────────────────────────────────
 * `banners` — the home hero carousel, rendered by
 * src/app/_components/home/HeroBannerCarousel.jsx. This is the collection the
 * fix touches.
 *
 * `promotion_banners` — reported in a SEPARATE section because
 * src/components/promotions/PromotionBannerCarousel.jsx renders the same field
 * name into an href and did NOT receive this fix. It is listed so the gap is a
 * known number rather than an unexamined assumption. Nothing here changes it.
 *
 * Usage:  node --env-file=.env.local scripts/audit-banner-link-urls.mjs
 */

import mongoose from 'mongoose';
import { isDangerousLinkUrl, resolveBannerLink } from '../src/lib/bannerLinkUrl.js';

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

/**
 * The scheme as a human would name it, for the distribution table. This is
 * deliberately NOT the module's classifier — a second, dumber reading of the
 * same value, so the table still describes reality if resolveBannerLink() is
 * wrong. The two are printed side by side for exactly that reason.
 */
function describeScheme(raw) {
  const v = String(raw).trim();
  if (!v) return '(empty)';
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (m) return `${m[1].toLowerCase()}:`;
  if (v.startsWith('//')) return '(protocol-relative)';
  if (v.startsWith('/')) return '(site-relative)';
  if (v.startsWith('#')) return '(fragment)';
  return '(no scheme)';
}

function report(label, docs, linkField, idFields) {
  const withLink = docs.filter((d) => typeof d[linkField] === 'string' && d[linkField].trim());

  const schemes = new Map();
  for (const d of withLink) {
    const k = describeScheme(d[linkField]);
    schemes.set(k, (schemes.get(k) ?? 0) + 1);
  }

  const refused = withLink.filter((d) => isDangerousLinkUrl(d[linkField]));

  console.log('');
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 66 - label.length))}`);
  console.log('');
  console.log(`  documents                   : ${docs.length}`);
  console.log(`  with a non-empty ${linkField.padEnd(11)}: ${withLink.length}`);
  console.log(`  WOULD BE REFUSED by the blocklist : ${refused.length}`);
  console.log('');

  if (schemes.size) {
    console.log('  scheme distribution:');
    const rows = [...schemes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [scheme, n] of rows) {
      console.log(`    ${String(scheme).padEnd(24)} ${String(n).padStart(4)}`);
    }
    console.log('');
  }

  // How the shipped module classifies each one. A count per kind, so a
  // surprise ('internal' for something that should be external) is visible
  // without dumping every row.
  const kinds = new Map();
  for (const d of withLink) {
    const k = resolveBannerLink(d[linkField]).kind;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  if (kinds.size) {
    console.log('  as classified by resolveBannerLink():');
    for (const [kind, n] of [...kinds.entries()].sort()) {
      console.log(`    ${String(kind).padEnd(24)} ${String(n).padStart(4)}`);
    }
    console.log('');
  }

  if (refused.length) {
    console.log('  ⚠ THESE LINKS WOULD STOP WORKING — each renders unlinked plus a console.warn:');
    for (const d of refused) {
      const who = idFields.map((f) => `${f}=${JSON.stringify(d[f] ?? null)}`).join(' ');
      console.log(`    _id=${d._id}  ${who}`);
      console.log(`      link_url: ${JSON.stringify(d[linkField])}`);
    }
    console.log('');
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // Raw collection access — no model import chain, and read-only find().
  const banners = await db.collection('banners')
    .find({}, { projection: { title: 1, type: 1, link_url: 1, active: 1 } })
    .toArray();

  const promoBanners = await db.collection('promotion_banners')
    .find({}, { projection: { alt_text: 1, link_url: 1, is_active: 1 } })
    .toArray();

  console.log('');
  console.log('══ banner link_url audit — DRY RUN, NOTHING WAS WRITTEN ═══════════════');

  report('banners (home hero carousel — THE SURFACE THIS FIX TOUCHES)',
    banners, 'link_url', ['type', 'title', 'active']);

  report('promotion_banners (NOT fixed — reported so the gap is a known number)',
    promoBanners, 'link_url', ['alt_text', 'is_active']);

  console.log('══ end of report. No documents were modified. ═════════════════════════');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
