/**
 * The Masterclass corpus: the CONTENT of every published Masterclass course,
 * as plain-text fields, for the chat agent's corpus sync. Read-only. Serves
 * what docs/masterclass-corpus-phase-a.md measured (§3 field lengths, §4
 * rendered-vs-vestigial, §9 proposed shape). The chatbot repo composes the
 * .txt documents from these fields; nothing here is prose that was not
 * already in a model field.
 *
 * ── WHAT IS SERVED, AND FROM WHERE ─────────────────────────────────────────
 * One item per course with `is_published: true`, in `display_order` — the SAME
 * read `/masterclass` lists from (`getPublishedMasterclasses`, which the
 * sitemap also reuses for exactly this reason), so "published" here cannot
 * drift from what the hub shows. FAQs come through `getLocalFaqsForCourse`
 * (`is_active` + the display sort) and instructors through
 * `getInstructorsByIds`, the two joins the detail page itself makes.
 *
 * ── WHAT IS NOT SERVED, EACH FOR ITS OWN REASON ────────────────────────────
 *   price, batch dates, early-bird deadline, venue
 *       /api/corpus/promotions serves these live per request; a corpus
 *       document is a snapshot refreshed at sync time. Two clocks in one
 *       answer is the defect, so batches are dropped here entirely.
 *   seats / registered_count / availability
 *       the standing ruling (promotions-corpus-endpoint.md §1.3) stands, and
 *       M1 measured the counter wrong on a live batch.
 *   license_options.* (register-page terms)
 *       contractual wording; the bot links, never quotes.
 *   system_requirements{} (the object)
 *       vestigial, never rendered, and CONTRADICTS the rendered HTML on the
 *       Claude course. `system_requirements_html` is the only source.
 *   equipment_required[], tags, faq_category, is_active, gallery, hero_*,
 *   cover_image_*, batch course_slug
 *       unrendered, or not prose.
 *
 * ── PLAIN TEXT, ASSERTED ───────────────────────────────────────────────────
 * Every HTML field goes through htmlToText (one converter, not per-field
 * stripping); every plain field through plainText. Before the body is
 * returned, every string in it is checked for markup-shaped `<` and the build
 * THROWS if one is found — a corpus that leaks a tag is worse than a corpus
 * that is briefly unavailable, because the bot would quote the tag.
 *
 * Every read is injectable (`deps`) for the test tier, as promotions.js does;
 * production callers pass nothing.
 */
import { htmlToText, plainText } from '@/lib/corpus/htmlToText';
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';

const str = (v) => String(v ?? '').trim();
const text = (v) => (plainText(v) === '' ? null : plainText(v));
const rich = (v) => (htmlToText(v) === '' ? null : htmlToText(v));
const lines = (arr) => (Array.isArray(arr) ? arr.map(plainText).filter((s) => s !== '') : []);

/**
 * `course_outline_url` as the chatbot must receive it: ABSOLUTE.
 *
 * The site now stores the outline as a root-relative `/files/…` path (signed
 * upload to our own domain); a bare path handed to the bot would be pasted
 * into a chat as a link that resolves nowhere. Both shapes are live during the
 * transition — the two courses keep their full Cloudinary URLs until they are
 * re-uploaded by hand — so:
 *   starts with `/`     → CORPUS_PUBLIC_ORIGIN + path
 *   starts with `http`  → passed through untouched
 *   anything else       → null (a paste that was never a link is not one now)
 */
export function absoluteOutlineUrl(value, origin = CORPUS_PUBLIC_ORIGIN) {
  const v = str(value);
  if (!v) return null;
  if (v.startsWith('/')) return `${origin}${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  return null;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Any `<` that starts a tag, comment or declaration. A bare "x < 5" in prose is not markup. */
const MARKUP = /<[a-zA-Z!/?]/;

/** Walk every string in a JSON-shaped value; return the path of the first markup hit, else null. */
export function findMarkup(value, path = '$') {
  if (typeof value === 'string') return MARKUP.test(value) ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findMarkup(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findMarkup(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * One module of the outline. `topics_html` is what the detail page renders
 * when present; the plain `topics[]` array is its fallback there and here —
 * on the live rows it is populated on one module of thirteen, as a flattened
 * copy, so it is never preferred.
 */
function moduleItem(m = {}) {
  const topics = str(m.topics_html) !== ''
    ? rich(m.topics_html)
    : (lines(m.topics).map((t) => `- ${t}`).join('\n') || null);
  return {
    no:      num(m.module_no),
    title:   text(m.title),
    topics,
    // Empty on every live module (M1 §1a); carried so an admin who fills them
    // in does not need a new round here.
    workshop: text(m.workshop),
    output:   text(m.output),
    notes:    rich(m.content_html),
  };
}

/** Pure: course row + its FAQs + its instructors → one corpus item. */
export function masterclassCourseItem(course, { faqs = [], instructors = [] } = {}) {
  const c = course ?? {};
  const byId = new Map(instructors.map((i) => [str(i._id), i]));
  const ordered = (c.instructor_ids ?? []).map((id) => byId.get(str(id))).filter(Boolean);

  return {
    id:          `masterclass:${str(c._id)}`,
    slug:        str(c.slug),
    course_code: text(c.course_code),
    // The model has one title field. It is `title_th` by name and English by
    // content on both live rows; there is no `title_en` to pair it with.
    title:       text(c.title_th),
    subtitle:    text(c.subtitle_th),
    url:         `${CORPUS_PUBLIC_ORIGIN}/masterclass/${str(c.slug)}`,
    outline_pdf_url: absoluteOutlineUrl(c.course_outline_url),
    level:       text(c.level),
    duration:    { days: num(c.duration_days), hours: num(c.duration_hours) },
    schedule: {
      days: lines(c.schedule_days),
      time: c.time_start && c.time_end ? `${str(c.time_start)}–${str(c.time_end)}` : null,
    },
    description:   rich(c.description_html),
    objectives:    lines(c.objectives),
    benefits:      lines(c.benefits),
    audience:      lines((c.suitable_for ?? []).map((s) => s?.label)),
    prerequisites: lines(c.prerequisites),
    system_requirements: rich(c.system_requirements_html),
    curriculum: (c.curriculum ?? []).map((s) => ({
      session: text(s?.session_label),
      modules: (s?.modules ?? []).map(moduleItem),
    })),
    instructors: ordered.map((i) => ({
      name:    text(i.name),
      name_en: text(i.name_en),
      title:   text(i.title),
      bio:     text(i.bio),
    })),
    faqs: faqs.map((f) => ({
      question: text(f.question_th),
      answer:   rich(f.answer_html),
    })),
  };
}

// ── Default readers (the only code here that touches Mongo) ────────────────
// All three are the detail page's own readers, imported, so the published
// predicate, the FAQ activity/sort rule and the instructor join are single-
// sourced. `getPublishedMasterclasses` also attaches batches; they are dropped
// in the mapper and never reach the response.

async function readPublishedCourses() {
  const { getPublishedMasterclasses } = await import('@/lib/masterclass/getMasterclass');
  return getPublishedMasterclasses();
}

async function readFaqsForCourse(courseId) {
  const { getLocalFaqsForCourse } = await import('@/lib/local-faqs/getLocalFaqs');
  return getLocalFaqsForCourse('masterclass', String(courseId));
}

async function readInstructorRows(ids) {
  const { getInstructorsByIds } = await import('@/lib/masterclass/getMasterclass');
  return getInstructorsByIds(ids);
}

// ── The corpus ─────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {Date}     [deps.now]              stamped as `generated_at`; no predicate here reads it
 * @param {Function} [deps.readCourses]      () → published course rows (batches ignored)
 * @param {Function} [deps.readFaqs]         (courseId) → active FAQ rows in display order
 * @param {Function} [deps.readInstructors]  (ids) → instructor rows
 * @throws if any emitted string still contains markup — see the header
 */
export async function buildMasterclassCorpus({
  now = new Date(),
  readCourses = readPublishedCourses,
  readFaqs = readFaqsForCourse,
  readInstructors = readInstructorRows,
} = {}) {
  const at = new Date(Number.isNaN(new Date(now).getTime()) ? Date.now() : new Date(now).getTime());
  const rows = (await readCourses()) ?? [];

  const courses = [];
  for (const row of rows) {
    const [faqs, instructors] = await Promise.all([
      readFaqs(row._id),
      readInstructors(row.instructor_ids ?? []),
    ]);
    courses.push(masterclassCourseItem(row, { faqs: faqs ?? [], instructors: instructors ?? [] }));
  }

  const body = {
    generated_at: at.toISOString(),
    source_note:  'course content only; prices, batch dates, early-bird deadlines, venues and seats are served live by /api/corpus/promotions and are deliberately absent here',
    count:        courses.length,
    courses,
  };

  const leak = findMarkup(body);
  if (leak) throw new Error(`[corpus/masterclass] markup leaked into the response at ${leak}`);
  return body;
}

