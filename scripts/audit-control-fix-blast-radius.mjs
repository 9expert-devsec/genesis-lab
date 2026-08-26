/**
 * Round 21 — BLAST RADIUS for the three round-18 control findings. READ-ONLY.
 *
 * ── WHAT THIS ANSWERS ──────────────────────────────────────────────────────
 * Every one of the three fixes turns a control that currently does NOTHING
 * into one that does something. That is the dangerous direction: an author may
 * have set the value hopefully, seen no change, and moved on — and their page
 * has carried that value ever since. Shipping the fix would then change a live
 * page nobody touched.
 *
 * So before proposing anything, count. Not "probably rare": the number of live
 * sections carrying a non-default value of the affected control on an affected
 * type.
 *
 * ── IT PERFORMS NO WRITES ──────────────────────────────────────────────────
 * Not behind a flag, not at all. One `find()` with a lean projection and a
 * walk. There is no updateOne, no bulkWrite, no $set, no save() anywhere in
 * this file.
 *
 * ── LIVE vs DRAFT, COUNTED APART ───────────────────────────────────────────
 * `sections` is what the public renders NOW. `draft.sections` is what an author
 * has typed and not published. They are reported separately because they carry
 * different risk: a live hit changes a page the moment the fix ships, a draft
 * hit changes it the next time that author presses publish — which is later,
 * and with them watching.
 *
 * Run: node --env-file=.env.local scripts/audit-control-fix-blast-radius.mjs
 */
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI is not set — run with --env-file=.env.local');
  process.exit(1);
}

// ── the three findings, as predicates over one section ─────────────────────

/** F1 — the two card types that clamp themselves to a fixed width. */
const F1_TYPES = new Set(['course_card', 'instructor_card']);

/** F3 — the one container type whose own clamp swallows three of four values. */
const F3_TYPES = new Set(['container']);

/**
 * F2 — the fourteen types that set an accent variable nothing under them
 * reads. Written out rather than derived from a scan, because this script must
 * keep reporting the round-18 set even after a fix starts moving types out of
 * it: a list that re-derived itself would silently shrink and report a smaller
 * blast radius than the decision was made against.
 */
const F2_TYPES = new Set([
  'heading', 'image', 'notice', 'accordion',
  'custom_html', 'custom_css', 'embed', 'debug_json',
  'course_card', 'instructor_card', 'course_selector', 'bundle_courses',
  'course_list', 'course_schedule',
]);

/** The schema default. Anything else is a value an author chose. */
const CONTAINER_WIDTH_DEFAULT = 'large';

// ── the walk ───────────────────────────────────────────────────────────────

const SLOTS = ['children', 'left', 'right'];

function* walk(sections, depth = 0) {
  for (const s of Array.isArray(sections) ? sections : []) {
    if (!s || typeof s !== 'object') continue;
    yield { section: s, depth };
    for (const slot of SLOTS) {
      if (Array.isArray(s?.content?.[slot])) yield* walk(s.content[slot], depth + 1);
    }
  }
}

const blank = () => ({
  sections: 0,
  byType: new Map(),
  f1: [], f3: [], f2: [],
  widthValues: new Map(),
  accentValues: new Map(),
});

function tally(into, sections, pageLabel) {
  for (const { section } of walk(sections)) {
    into.sections += 1;
    const type = String(section.type ?? '(none)');
    into.byType.set(type, (into.byType.get(type) ?? 0) + 1);

    const width = section?.settings?.containerWidth;
    const accent = section?.style?.accentColor;

    if (width && width !== CONTAINER_WIDTH_DEFAULT) {
      into.widthValues.set(width, (into.widthValues.get(width) ?? 0) + 1);
      if (F1_TYPES.has(type)) into.f1.push({ page: pageLabel, type, width });
      if (F3_TYPES.has(type)) into.f3.push({ page: pageLabel, type, width });
    }
    if (accent) {
      into.accentValues.set(accent, (into.accentValues.get(accent) ?? 0) + 1);
      if (F2_TYPES.has(type)) into.f2.push({ page: pageLabel, type, accent });
    }
  }
}

const countBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const show = (pairs) => (pairs.length ? pairs.map(([k, n]) => `${k}=${n}`).join(', ') : '(none)');

// ── run ────────────────────────────────────────────────────────────────────

await mongoose.connect(URI);

const pages = await mongoose.connection.db
  .collection('page_builder_pages')
  .find({}, {
    projection: { slug: 1, status: 1, title: 1, sections: 1, 'draft.sections': 1 },
  })
  .toArray();

const live = blank();
const draft = blank();
const statuses = new Map();
let withDraft = 0;

for (const p of pages) {
  statuses.set(p.status ?? '(none)', (statuses.get(p.status ?? '(none)') ?? 0) + 1);
  const label = `${p.slug ?? '(no slug)'} [${p.status ?? '?'}]`;
  tally(live, p.sections, label);
  if (Array.isArray(p?.draft?.sections)) {
    withDraft += 1;
    tally(draft, p.draft.sections, label);
  }
}

const PUBLIC_STATUSES = new Set(['published', 'scheduled']);
const publicPages = pages.filter((p) => PUBLIC_STATUSES.has(p.status));
const publicLive = blank();
for (const p of publicPages) tally(publicLive, p.sections, `${p.slug} [${p.status}]`);

const line = (s) => console.log(s);

line('══ page_builder_pages ═════════════════════════════════════════════════');
line(`documents:            ${pages.length}`);
line(`by status:            ${show([...statuses.entries()].sort())}`);
line(`documents with draft: ${withDraft}`);
line('');
line(`LIVE sections (all documents):        ${live.sections}`);
line(`LIVE sections (published/scheduled):  ${publicLive.sections}`);
line(`DRAFT sections (unpublished):         ${draft.sections}`);
line('');

line('── section types present, live ─────────────────────────────────────────');
line(show([...live.byType.entries()].sort((a, b) => b[1] - a[1])));
line('');

line('── every non-default containerWidth in the corpus (live) ───────────────');
line(show([...live.widthValues.entries()].sort()));
line('── every accentColor in the corpus (live) ──────────────────────────────');
line(show([...live.accentValues.entries()].sort()));
line('');

for (const [name, set] of [['LIVE (all)', live], ['LIVE (published/scheduled)', publicLive], ['DRAFT', draft]]) {
  line(`══ ${name} ════════════════════════════════════════════════════════════`);
  line(`F1  containerWidth set on course_card / instructor_card : ${set.f1.length}`);
  if (set.f1.length) {
    line(`      by type:  ${show(countBy(set.f1, 'type'))}`);
    line(`      by value: ${show(countBy(set.f1, 'width'))}`);
    for (const r of set.f1) line(`      · ${r.page} → ${r.type} width=${r.width}`);
  }
  line(`F3  containerWidth set on container                     : ${set.f3.length}`);
  if (set.f3.length) {
    line(`      by value: ${show(countBy(set.f3, 'width'))}`);
    for (const r of set.f3) line(`      · ${r.page} → width=${r.width}`);
  }
  line(`F2  accentColor set on one of the 14 unaffected types    : ${set.f2.length}`);
  if (set.f2.length) {
    line(`      by type:   ${show(countBy(set.f2, 'type'))}`);
    line(`      by accent: ${show(countBy(set.f2, 'accent'))}`);
    for (const r of set.f2) line(`      · ${r.page} → ${r.type} accent=${r.accent}`);
  }
  line('');
}

// ── where the few non-default values actually sit ──────────────────────────
//
// The counts above are all zero, which is a finding rather than an absence of
// one — but a zero is only trustworthy if the corpus contains anything at all.
// So: name every non-default value in it, and say whether the type carrying it
// is one a fix would touch.
line('══ every authored non-default value, located ═════════════════════════');
for (const p of pages) {
  for (const { section } of walk(p.sections)) {
    const w = section?.settings?.containerWidth;
    const a2 = section?.style?.accentColor;
    const where = `${p.slug ?? '(no slug)'} [${p.status ?? '?'}] → ${section.type}`;
    const touched = (set) => (set.has(String(section.type)) ? 'AFFECTED BY A FIX' : 'not affected');
    if (w && w !== CONTAINER_WIDTH_DEFAULT) {
      const hit = F1_TYPES.has(String(section.type)) || F3_TYPES.has(String(section.type));
      line(`  width   ${where} = ${w}   (${hit ? 'AFFECTED BY A FIX' : 'not affected'})`);
    }
    if (a2) line(`  accent  ${where} = ${a2}   (${touched(F2_TYPES)})`);
  }
}
line('');

// ── version history: a restore could reintroduce a value ───────────────────
//
// page_versions is capped at 20 per page. A value that is absent from every
// live and draft tree can still come back through a rollback, so it is counted
// rather than assumed away.
const versions = await mongoose.connection.db.collection('page_versions')
  .find({}, { projection: { pageId: 1, sections: 1 } }).toArray();
const vers = blank();
for (const v of versions) tally(vers, v.sections, String(v.pageId));
line('══ page_versions (rollback surface) ═══════════════════════════════════');
line(`documents: ${versions.length} · sections: ${vers.sections}`);
line(`F1: ${vers.f1.length} · F3: ${vers.f3.length} · F2: ${vers.f2.length}`);
line(`widths:  ${show([...vers.widthValues.entries()].sort())}`);
line(`accents: ${show([...vers.accentValues.entries()].sort())}`);
line('');

await mongoose.disconnect();
