/**
 * READ-ONLY PROBE — what does the STORED HTML in every unsanitised
 * dangerouslySetInnerHTML render site actually contain?
 *
 * For each field: document count, tag-name union, attribute-name union,
 * a scan for already-dangerous constructs (script/iframe/object/embed,
 * on* handlers, javascript: URLs, style="...expression(...)"), and an
 * inline-colour count (color/background-color anywhere: style attr or
 * legacy <font color>).
 *
 * Parses with parse5 (already a direct dependency, used by
 * wrapArticleTables.js) rather than regex, so the tag/attribute union is
 * exact, not approximate.
 *
 * Connects with plain mongoose against raw collections (collection names
 * verified against each model's `collection:` schema option) rather than
 * through the app's `@/lib/db/connect` + custom ESM loader — that combo
 * left the connection on a different module realm than this script's own
 * `mongoose` import and every query timed out waiting on a connection that
 * had, in fact, connected. Plain mongoose + raw `.find()` on the named
 * collection sidesteps it entirely; this is read-only either way.
 *
 * WRITES: none. One `find()` per collection, via the read preference the
 * driver defaults to. No update, no delete, no upsert anywhere in this file.
 *
 * Usage: node --env-file=.env.local scripts/_probe-unsanitized-html-fields.mjs
 */

import mongoose from 'mongoose';
import { parseFragment } from 'parse5';

const DANGEROUS_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']);

function collectFromNode(node, acc) {
  if (node.tagName) {
    acc.tags.add(node.tagName);
    for (const a of node.attrs ?? []) {
      acc.attrs.add(a.name);
      if (/^on/i.test(a.name)) acc.dangerous.push(`on*-handler: <${node.tagName} ${a.name}="${a.value.slice(0, 60)}">`);
      if (/^(href|src|xlink:href|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) {
        acc.dangerous.push(`javascript: URL: <${node.tagName} ${a.name}="${a.value.slice(0, 60)}">`);
      }
      if (a.name === 'style' && /expression\s*\(/i.test(a.value)) {
        acc.dangerous.push(`style expression(): <${node.tagName} style="${a.value.slice(0, 60)}">`);
      }
      if (a.name === 'style' && /(?:^|;)\s*(color|background-color|background)\s*:/i.test(a.value)) {
        acc.colourDocs.add(acc.currentDocKey);
      }
      if (node.tagName === 'font' && a.name === 'color') acc.colourDocs.add(acc.currentDocKey);
    }
    if (DANGEROUS_TAGS.has(node.tagName)) {
      acc.dangerous.push(`<${node.tagName}> present`);
    }
  }
  for (const child of node.childNodes ?? []) collectFromNode(child, acc);
}

function scan(html, acc, docKey) {
  if (!html || typeof html !== 'string' || !html.trim()) return;
  acc.nonEmptyCount += 1;
  acc.currentDocKey = docKey;
  let fragment;
  try {
    fragment = parseFragment(html);
  } catch (err) {
    acc.parseFailures.push({ docKey, error: err?.message });
    return;
  }
  collectFromNode(fragment, acc);
}

function newAcc() {
  return {
    nonEmptyCount: 0,
    tags: new Set(),
    attrs: new Set(),
    dangerous: [],
    colourDocs: new Set(),
    parseFailures: [],
    currentDocKey: null,
  };
}

function report(label, totalDocs, acc) {
  console.log(`\n─── ${label} ───`);
  console.log(`  documents/rows in scope:        ${totalDocs}`);
  console.log(`  non-empty HTML values:          ${acc.nonEmptyCount}`);
  console.log(`  tag union (${acc.tags.size}): ${[...acc.tags].sort().join(', ') || '(none)'}`);
  console.log(`  attribute union (${acc.attrs.size}): ${[...acc.attrs].sort().join(', ') || '(none)'}`);
  console.log(`  values with inline colour:      ${acc.colourDocs.size}`);
  if (acc.dangerous.length) {
    console.log(`  ⚠ DANGEROUS CONSTRUCTS FOUND (${acc.dangerous.length}):`);
    for (const d of acc.dangerous.slice(0, 30)) console.log(`      - ${d}`);
    if (acc.dangerous.length > 30) console.log(`      ... and ${acc.dangerous.length - 30} more`);
  } else {
    console.log(`  dangerous constructs found:     none`);
  }
  if (acc.parseFailures.length) {
    console.log(`  ⚠ PARSE FAILURES (${acc.parseFailures.length}):`);
    for (const f of acc.parseFailures.slice(0, 10)) console.log(`      - ${f.docKey}: ${f.error}`);
  }
}

console.log('=== Stored-HTML measurement across every render site (READ-ONLY) ===');

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 10000,
});
const db = mongoose.connection.db;

async function scanField({ label, collection, project, extract, control = false }) {
  const docs = await db.collection(collection).find({}, { projection: project }).toArray();
  const acc = newAcc();
  let rowCount = 0;
  for (const d of docs) {
    for (const [key, html] of extract(d)) {
      rowCount += 1;
      scan(html, acc, key);
    }
  }
  report(`${label}${control ? ' (CONTROL — already sanitised)' : ''}`, rowCount || docs.length, acc);
}

await scanField({
  label: 'Article.content',
  collection: 'articles',
  project: { content: 1, slug: 1 },
  extract: (d) => [[`Article ${d.slug}`, d.content]],
});

await scanField({
  label: 'LocalFaq.answer_html',
  collection: 'local_faqs',
  project: { answer_html: 1, course_type: 1, ref_id: 1 },
  extract: (d) => [[`LocalFaq ${d.course_type}/${d.ref_id}/${d._id}`, d.answer_html]],
});

await scanField({
  label: 'MasterclassCourse.description_html',
  collection: 'masterclass_courses',
  project: { description_html: 1, slug: 1 },
  extract: (d) => [[`MasterclassCourse ${d.slug}`, d.description_html]],
});

await scanField({
  label: 'MasterclassCourse.system_requirements_html',
  collection: 'masterclass_courses',
  project: { system_requirements_html: 1, slug: 1 },
  extract: (d) => [[`MasterclassCourse ${d.slug}`, d.system_requirements_html]],
});

await scanField({
  label: 'MasterclassCourse.curriculum[].modules[].topics_html',
  collection: 'masterclass_courses',
  project: { curriculum: 1, slug: 1 },
  extract: (d) => (d.curriculum ?? []).flatMap((s) =>
    (s.modules ?? []).map((m) => [`MasterclassCourse ${d.slug} module`, m.topics_html])
  ),
});

await scanField({
  label: 'MasterclassCourse.curriculum[].modules[].content_html',
  collection: 'masterclass_courses',
  project: { curriculum: 1, slug: 1 },
  extract: (d) => (d.curriculum ?? []).flatMap((s) =>
    (s.modules ?? []).map((m) => [`MasterclassCourse ${d.slug} module`, m.content_html])
  ),
});

await scanField({
  label: 'MasterclassCourse.license_options.choices[].info_popup.html_content',
  collection: 'masterclass_courses',
  project: { license_options: 1, slug: 1 },
  extract: (d) => (d.license_options?.choices ?? []).map((c) =>
    [`MasterclassCourse ${d.slug} license choice`, c.info_popup?.html_content]
  ),
});

await scanField({
  label: 'MasterclassBatch.preparation_html',
  collection: 'masterclass_batches',
  project: { preparation_html: 1, course_slug: 1, batch_label: 1 },
  extract: (d) => [[`MasterclassBatch ${d.course_slug}/${d.batch_label}`, d.preparation_html]],
});

await scanField({
  label: 'CareerPath.description_html',
  collection: 'career_paths',
  project: { description_html: 1, slug: 1 },
  extract: (d) => [[`CareerPath ${d.slug}`, d.description_html]],
});

await scanField({
  label: 'Banner.slide_text',
  collection: 'banners',
  project: { slide_text: 1 },
  extract: (d) => [[`Banner ${d._id}`, d.slide_text]],
});

await scanField({
  label: 'Promotion.html_content (upstream-synced)',
  collection: 'promotions',
  project: { html_content: 1, promotion_id: 1 },
  extract: (d) => [[`Promotion ${d.promotion_id}`, d.html_content]],
});

await scanField({
  label: 'Faq.answer_html (upstream-synced)',
  collection: 'faqs',
  project: { answer_html: 1, faq_id: 1 },
  extract: (d) => [[`Faq ${d.faq_id}`, d.answer_html]],
});

await scanField({
  label: 'CustomPage.body',
  collection: 'custom_pages',
  project: { body: 1, slug: 1 },
  extract: (d) => [[`CustomPage ${d.slug}`, d.body]],
  control: true,
});

await scanField({
  label: 'CourseExtension.trainingTopicsRich',
  collection: 'course_extensions',
  project: { trainingTopicsRich: 1, courseId: 1 },
  extract: (d) => (d.trainingTopicsRich ?? []).map((html, i) => [`CourseExtension ${d.courseId}[${i}]`, html]),
  control: true,
});

console.log('\n=== Done. No writes were made. ===');
await mongoose.disconnect();
process.exit(0);
