/**
 * ROUND 72 §F/§H — the reference pages' side padding, and the blast radius.
 *
 * §F: round 56 found the two hand-built promotion pages in `promotions` as
 * HTML+CSS blobs. They are the target, so the proposal needs THEIR number
 * rather than an impression — every horizontal padding their own CSS declares,
 * and specifically what applies inside a mobile media query.
 *
 * §H: how many pages and sections would move if the default padding changed,
 * split by whether they nest at all — a top-level-only page loses 16px a side,
 * a deeply nested one loses far more, and those are different conversations.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION NAME is `page_builder_pages`, not mongoose's default
 *    `pagebuilders`. Every read goes through `requireCollection`, which DIES on
 *    a missing name, because "no documents" and "no collection" print the same
 *    number and only one of them means anything.
 * 2. THE VERSION PATH is `snapshot.sections`, not `content.sections`. A
 *    non-empty `page_versions` yielding zero sections is a hard failure.
 * 3. A TYPE HISTOGRAM beyond both, SUMMED across buckets (round 70 found the
 *    spread-merge form is last-writer-wins and disagrees with its own totals).
 *
 * READ-ONLY. Three find()s and a walk. No updateOne, no bulkWrite, no $set.
 *
 * Run:
 *   node --env-file=.env.local scripts/_audit-round72-padding-reference.mjs
 */
import mongoose from 'mongoose';

function die(msg) { console.error('X ' + msg); process.exit(1); }

const SLOTS = ['children', 'left', 'right'];
const CONTAINERS = new Set(['container', 'full_width', 'two_column', 'card_grid', 'highlight_grid']);

/** Walk, recording each section's depth and whether it nests. */
function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.total += 1;
    out.byDepth[depth] = (out.byDepth[depth] ?? 0) + 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    out.maxDepth = Math.max(out.maxDepth, depth);
    if (CONTAINERS.has(s.type)) out.containers += 1;
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ total: 0, containers: 0, maxDepth: 0, byDepth: {}, types: {} });

const report = {};
try {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  // ── §F: the reference pages ────────────────────────────────────────────
  const promos = await (await requireCollection(db, 'promotions'))
    .find({}, { projection: { api_slug: 1, title: 1, html_content: 1 } }).toArray();

  /** Every horizontal padding declaration in a style blob, with its selector. */
  const HORIZ = /([^{}]+)\{([^}]*)\}/g;
  const PAD = /(?:^|;)\s*(padding(?:-left|-right|-inline[^:]*)?)\s*:\s*([^;]+)/gi;

  const refs = [];
  for (const p of promos) {
    const html = typeof p.html_content === 'string' ? p.html_content : '';
    if (!html) continue;
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((mm) => mm[1]).join('\n');
    const rules = [];
    let inMedia = null;
    // Crude but honest: split on media blocks first so a mobile rule is
    // labelled as one rather than silently merged with the desktop rule.
    const mediaBlocks = [...styles.matchAll(/@media([^{]+)\{([\s\S]*?)\n\s*\}/g)];
    const scan = (css, label) => {
      for (const m of css.matchAll(HORIZ)) {
        const sel = m[1].trim().replace(/\s+/g, ' ').slice(0, 60);
        const body = m[2];
        for (const pm of body.matchAll(PAD)) {
          const prop = pm[1].toLowerCase();
          const val = pm[2].trim();
          if (prop === 'padding') {
            const parts = val.split(/\s+/);
            const horiz = parts.length === 1 ? parts[0] : (parts.length === 2 ? parts[1] : (parts[3] ?? parts[1]));
            rules.push({ media: label, sel, prop, value: val, horizontal: horiz });
          } else {
            rules.push({ media: label, sel, prop, value: val, horizontal: val });
          }
        }
      }
    };
    scan(styles.replace(/@media[^{]+\{[\s\S]*?\n\s*\}/g, ''), null);
    for (const [, cond, inner] of mediaBlocks) { inMedia = cond.trim(); scan(inner, inMedia); }

    // The page WRAPPER's padding is what §F wants: the outermost rule whose
    // selector names a container/wrapper class.
    const wrapperish = rules.filter((r) => /wrap|container|section|body|main|page|inner/i.test(r.sel));
    refs.push({
      slug: p.api_slug,
      htmlBytes: html.length,
      styleBlocks: (html.match(/<style/gi) ?? []).length,
      horizontalPaddingRules: rules.length,
      mobileRules: rules.filter((r) => r.media && /max-width/i.test(r.media)).length,
      wrapperCandidates: wrapperish.slice(0, 12),
      mobileHorizontal: rules.filter((r) => r.media && /max-width/i.test(r.media)).slice(0, 12),
    });
  }
  report['-- F. THE REFERENCE PAGES --'] = '';
  report.promotionsScanned = promos.length;
  report.references = refs;

  // ── §H: the blast radius ───────────────────────────────────────────────
  const pages = await (await requireCollection(db, 'page_builder_pages'))
    .find({}, { projection: { slug: 1, status: 1, sections: 1, draft: 1 } }).toArray();
  const versions = await (await requireCollection(db, 'page_versions'))
    .find({}, { projection: { snapshot: 1 } }).toArray();

  const live = bucket(); const draft = bucket(); const versioned = bucket();
  const perPage = [];
  for (const d of pages) {
    const b = bucket();
    walk(d.sections, b);
    walk(d.sections, live);
    walk(d?.draft?.sections, draft);
    perPage.push({ slug: d.slug, status: d.status, sections: b.total, containers: b.containers, maxDepth: b.maxDepth });
  }
  for (const v of versions) walk(v?.snapshot?.sections, versioned);
  if (versions.length > 0 && versioned.total === 0) {
    die('page_versions holds documents but the walk found no sections — the snapshot path is wrong again');
  }

  const merged = {};
  for (const b of [live, draft, versioned]) {
    for (const [t, n] of Object.entries(b.types)) merged[t] = (merged[t] ?? 0) + n;
  }

  report['-- H. THE BLAST RADIUS --'] = '';
  report.database = mongoose.connection.name ?? '(default)';
  report.pagesStored = pages.length;
  report.versionsStored = versions.length;
  report.sectionsTotal = `${live.total} live / ${draft.total} draft / ${versioned.total} versions`;
  report.CONTROL_distinctTypesSeen = Object.keys(merged).length;
  report.CONTROL_typeHistogram = Object.fromEntries(Object.entries(merged).sort((a, b) => b[1] - a[1]));
  report.walkResolvedNothing = Object.keys(merged).length === 0;
  report.liveSectionsByDepth = live.byDepth;
  report.draftSectionsByDepth = draft.byDepth;
  report.versionSectionsByDepth = versioned.byDepth;
  report.liveContainers = live.containers;
  report.deepestLiveNesting = live.maxDepth;
  report.perPage = perPage;
  report.livePagesWithAnyNesting = perPage.filter((p) => p.maxDepth > 0).length;
  report.livePagesFlat = perPage.filter((p) => p.maxDepth === 0).length;
} finally {
  await mongoose.disconnect().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
