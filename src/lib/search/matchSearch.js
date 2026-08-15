/**
 * /search — the MATCHER. Corpus in, results out. Nothing else.
 *
 * Kept dependency-free ON PURPOSE: no `next/*`, no db, no models, no React, no
 * fetch. That is what lets every matching rule be checked in the `pure` tier
 * against hand-built fixtures — same rationale as joinCourseSchedules.js and
 * schedule/monthWindow.js. The route handler does fetch → call → serialise and
 * owns no rules.
 *
 * ── WHY SUBSTRING AND NOT WORD MATCHING ─────────────────────────────────────
 * THAI HAS NO WORD BOUNDARIES. A Thai sentence is written without spaces, so
 * `\b`, `split(/\s+/)`, and MongoDB's `$text` tokenizer all see one enormous
 * token: searching `วิเคราะห์` against `การวิเคราะห์ข้อมูลด้วย Power BI` finds
 * nothing under any of them, because the term is in the MIDDLE of the only
 * token there is. Every haystack here is therefore matched with a plain
 * `includes`, and a pure test pins exactly that case with a Thai term.
 *
 * The cost is that a substring can match across a conceptual boundary — `ai`
 * matches "Thail<b>ai</b>nd". That is the accepted trade: over-matching is
 * visible and recoverable, silently returning nothing for half the site's
 * content is neither.
 *
 * ── WHY EACH TYPE HAS ITS OWN EXPLICIT FIELD LIST ───────────────────────────
 * A generic "walk every string on the object" haystack would be shorter and
 * wrong in two directions at once: it would match on ids, URLs and colour hexes
 * nobody searches for, and — the specific hazard here — the public-course feed
 * uses `course_*` while the online-course feed uses `o_course_*`, so a generic
 * walker makes the two corpora indistinguishable. The extractors below read
 * ONLY their own feed's field names, which is what makes "a `course_*` term
 * cannot match the `o_` corpus" a property rather than a hope. A pure test
 * asserts it in both directions.
 */

/** Below this many characters the page shows suggestions instead of searching. */
export const SEARCH_MIN_CHARS = 2;

/**
 * The result buckets, in the order the page presents them.
 *
 * `onlineCourses` sits directly after `courses`: it is the same question
 * ("which course teaches this?") answered by a different delivery mode, so the
 * two belong adjacent rather than with the Career Path / schedule material.
 */
export const SEARCH_TYPES = [
  'courses',
  'onlineCourses',
  'careerPaths',
  'schedules',
  'promotions',
  'articles',
];

/** `'  Power BI '` → `'power bi'`. The one place case and padding are decided. */
export function normalizeSearchTerm(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** Flatten a field list into one lowercase blob, dropping nullish entries. */
function haystack(parts) {
  const out = [];
  for (const p of parts) {
    if (p == null) continue;
    if (typeof p === 'number') { out.push(String(p)); continue; }
    if (typeof p !== 'string') continue;
    out.push(p.toLowerCase());
  }
  // `\n` rather than ' ' so two adjacent fields cannot form a phrase that is in
  // neither of them — "Power" + "BI Desktop" must not match "power bi".
  return out.join('\n');
}

const topicStrings = (topics) =>
  Array.isArray(topics)
    ? topics.flatMap((t) => [t?.title, ...(Array.isArray(t?.bullets) ? t.bullets : [])])
    : [];

/**
 * A PUBLIC course's searchable text: name, code, program, teaser. NOTHING ELSE.
 *
 * ── THIS IS A DELIBERATE NARROWING, AND IT REVERSES AN EARLIER CALL ─────────
 * `course_objectives` and `training_topics` used to be in here, on the argument
 * that they are structured, editor-written curriculum text rather than prose,
 * so a term appearing there really is about the course. In use that judgement
 * was wrong — not because the matches were false, but because THE VISITOR
 * COULD NOT SEE WHY. A course surfaced by a bullet twelve items down its
 * outline reads as a stray result, and the "why it matched" snippet added to
 * explain it made every card longer without making any of them convincing.
 *
 * What is left is the set a card can actually show: the name and code are the
 * heading, the teaser is the body. `program.program_name` is the one exception
 * and it is kept on purpose — a search for `Power BI` should return every
 * course in that program even when its own title does not repeat the words.
 * That one is searchable-but-not-displayed; see the course card.
 *
 * `course_teaser` is still a DETAIL-response field, so it is still the reason
 * this search has to run on the server. Reads `course_*` only — never
 * `o_course_*`.
 */
export function courseHaystack(c) {
  return haystack([
    c?.course_name,
    c?.course_id,
    /**
     * CODES THIS COURSE USED TO HAVE — one of exactly two sites that consult
     * `CourseExtension.formerCodes`, the other being `resolveCourse`.
     *
     * The code is customer-facing: it is the first column of /schedule, and
     * customers quote courses by it. After a rename the code on somebody's
     * quotation matches nothing — `urlAlias` saves the URL and nothing saved
     * the CODE. This is what makes an old quotation still findable.
     *
     * Searchable but NOT displayed, like `program.program_name` above: the
     * card shows the current code, because showing a retired one would read as
     * the course having two codes rather than as a redirect.
     */
    ...(Array.isArray(c?.formerCodes) ? c.formerCodes : []),
    c?.program?.program_name,
    c?.course_teaser,
  ]);
}

/**
 * An ONLINE course's searchable text. Reads `o_course_*` only.
 *
 * No teaser fan-out is needed for these — see the corpus builder's docstring.
 */
export function onlineCourseHaystack(o) {
  return haystack([
    o?.o_course_name,
    o?.o_course_id,
    o?.o_course_teaser,
    o?.program?.program_name,
  ]);
}

/**
 * The course names and codes INSIDE a career path.
 *
 * ── TWO INDEPENDENT SOURCES, AND BOTH MUST BE READ ──────────────────────────
 * `curriculum` is the upstream-synced structure, where course identity lives
 * under `items[].snap`. `localCourses` is admin-edited and never synced from
 * upstream at all. A path can carry courses in either, or both — so reading
 * only one makes paths findable INCONSISTENTLY: the same query finds the path
 * whose courses happen to be synced and misses the one whose courses were added
 * by hand, with nothing to indicate which case you are in.
 *
 * ── WHY EVERY STEP IS GUARDED ───────────────────────────────────────────────
 * Both fields are `Mixed` on the model, so the schema guarantees NOTHING about
 * their shape: an entry may be null, a string, or an object with no `snap`. A
 * throw here would take down the whole search — every type, not just career
 * paths — for one malformed row an editor saved months ago. A bad entry skips;
 * the entries after it still match.
 */
export function careerPathCourseStrings(cp) {
  const out = [];

  const curriculum = Array.isArray(cp?.curriculum) ? cp.curriculum : [];
  for (const section of curriculum) {
    if (!section || typeof section !== 'object') continue;
    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const snap = item.snap;
      if (!snap || typeof snap !== 'object') continue;
      out.push(snap.name, snap.code);
    }
  }

  const local = Array.isArray(cp?.localCourses) ? cp.localCourses : [];
  for (const course of local) {
    if (!course || typeof course !== 'object') continue;
    out.push(course.courseName);
  }

  // `haystack` drops every non-string, so pushing an absent field is safe.
  return out;
}

/**
 * A career path's searchable text — its own copy, plus what it TEACHES.
 *
 * ── `description_html` IS DELIBERATELY ABSENT ───────────────────────────────
 * It is HTML. Matching it means `div`, `span`, `strong` and `href` hit every
 * path that has any formatting at all — a query returning the entire career
 * path corpus, for a reason no visitor could guess. Long-form plain text would
 * need a stripped field, which is a different change.
 *
 * ── `objectives` AND `suitable_for` LEFT WITH THE COURSE ONES ───────────────
 * Same reversal, same reason: a path surfaced by an item in a bulleted list
 * nobody can see on the card is a result the visitor cannot evaluate. The
 * courses INSIDE the path stay, because they are the one invisible field with
 * a visible explanation — the card renders a `หลักสูตรในเส้นทาง` snippet
 * naming the course that matched.
 */
export function careerPathHaystack(cp) {
  return haystack([
    cp?.title,
    cp?.tagline,
    cp?.short_description,
    ...careerPathCourseStrings(cp),
  ]);
}

/**
 * A round matches on the NAME OF ITS COURSE, unchanged from the shipped
 * behaviour. The corpus resolves that name once at build time into
 * `course_ref`, so this is a field read rather than a map lookup per keystroke.
 */
export function scheduleHaystack(s) {
  return haystack([s?.course_ref?.course_name, s?.course_name]);
}

export function promotionHaystack(p) {
  return haystack([
    p?.title,
    p?.detail_plain,
    ...(Array.isArray(p?.tags) ? p.tags.map((t) => t?.label) : []),
  ]);
}

/**
 * An article's searchable text — title, excerpt and tags. NOT THE BODY.
 *
 * ── THE BODY WAS MATCHED, AND IT WAS THE WRONG CALL ─────────────────────────
 * Matching full article bodies technically worked and produced bad results: an
 * article that mentions "Power BI" once in a sentence about something else came
 * back as a result "about" Power BI. Long prose is exactly where incidental
 * mentions live, and an incidental mention is not a result.
 *
 * NOTE THE ASYMMETRY WITH COURSES, which is the whole point rather than an
 * inconsistency: `course_teaser` / `course_objectives` / `training_topics` are
 * NOT prose. They are structured, editor-written, curriculum-level text where
 * every line is a claim about what the course covers — so a term appearing
 * there IS about the course. Recall is kept where the text is structured and
 * dropped where it is narrative.
 *
 * The body is not down-weighted, it is GONE — removed from the corpus, not
 * merely unread here. An unused field in a corpus is a payload and a
 * temptation.
 */
export function articleHaystack(a) {
  return haystack([
    a?.title,
    a?.excerpt,
    ...(Array.isArray(a?.tags) ? a.tags : []),
  ]);
}

const HAYSTACKS = {
  courses: courseHaystack,
  onlineCourses: onlineCourseHaystack,
  careerPaths: careerPathHaystack,
  schedules: scheduleHaystack,
  promotions: promotionHaystack,
  articles: articleHaystack,
};

// ── Projection ──────────────────────────────────────────────────────────────
//
// What crosses the wire. Trimmed to the fields the result cards actually
// render, so the response cannot quietly grow back into "the whole corpus, but
// filtered" — and so `contentText` in particular never leaves the server.

const pickCourse = (c) => ({
  _id: c?._id ?? null,
  course_id: c?.course_id ?? null,
  course_name: c?.course_name ?? null,
  course_price: c?.course_price ?? null,
  course_trainingdays: c?.course_trainingdays ?? null,
  course_teaser: c?.course_teaser ?? null,
  // DETAIL-response field: it only exists on a corpus row because the builder
  // runs enrich-courses. If it is ever dropped from this allowlist the course
  // card silently falls back to its icon on every result, with no error.
  course_cover_url: c?.course_cover_url ?? null,
  program: c?.program
    ? { program_name: c.program.program_name ?? null, programiconurl: c.program.programiconurl ?? null }
    : null,
});

const pickOnlineCourse = (o) => ({
  _id: o?._id ?? null,
  o_course_id: o?.o_course_id ?? null,
  o_course_name: o?.o_course_name ?? null,
  o_course_teaser: o?.o_course_teaser ?? null,
  o_course_cover_url: o?.o_course_cover_url ?? null,
  o_course_price: o?.o_course_price ?? null,
  o_course_netprice: o?.o_course_netprice ?? null,
  o_number_lessons: o?.o_number_lessons ?? null,
  o_course_traininghours: o?.o_course_traininghours ?? null,
  o_course_levels: o?.o_course_levels ?? null,
  website_urls: Array.isArray(o?.website_urls) ? o.website_urls : [],
  program: o?.program
    ? { program_name: o.program.program_name ?? null, programiconurl: o.program.programiconurl ?? null }
    : null,
});

const pickCareerPath = (cp) => ({
  _id: cp?._id ?? null,
  career_path_id: cp?.career_path_id ?? null,
  api_slug: cp?.api_slug ?? null,
  slug: cp?.slug ?? null,
  title: cp?.title ?? null,
  short_description: cp?.short_description ?? null,
  icon_url: cp?.icon_url ?? null,
  hero_image_url: cp?.hero_image_url ?? null,
});

const pickSchedule = (s) => ({
  _id: s?._id ?? null,
  dates: Array.isArray(s?.dates) ? s.dates : [],
  type: s?.type ?? null,
  status: s?.status ?? null,
  signup_url: s?.signup_url ?? null,
  course_ref: s?.course_ref ?? null,
});

const pickPromotion = (p) => ({
  _id: p?._id ?? null,
  promotion_id: p?.promotion_id ?? null,
  api_slug: p?.api_slug ?? null,
  title: p?.title ?? null,
  thumbnail_url: p?.thumbnail_url ?? null,
  image_alt: p?.image_alt ?? null,
  start_date: p?.start_date ?? null,
  end_date: p?.end_date ?? null,
  tags: Array.isArray(p?.tags) ? p.tags : [],
});

/** NOTE the absence of `contentText` — that is the field this exists to drop. */
const pickArticle = (a) => ({
  _id: a?._id ?? null,
  slug: a?.slug ?? null,
  title: a?.title ?? null,
  excerpt: a?.excerpt ?? null,
  coverUrl: a?.coverUrl ?? null,
  /**
   * `tags` IS RENDERED NOW — the card's bottom row is a chip row, and it is
   * what replaced the date. Omitting it from this allowlist costs no error:
   * the row would simply never appear, on every article, silently. Exactly the
   * failure mode `course_cover_url` had, so it is pinned the same way.
   *
   * `publishedAt` went the other way. Nothing renders it any more, and a field
   * in the response with no reader is payload plus temptation.
   */
  tags: Array.isArray(a?.tags) ? a.tags : [],
});

const PROJECTIONS = {
  courses: pickCourse,
  onlineCourses: pickOnlineCourse,
  careerPaths: pickCareerPath,
  schedules: pickSchedule,
  promotions: pickPromotion,
  articles: pickArticle,
};

// ── Why-it-matched snippets ─────────────────────────────────────────────────
//
// Keeping curriculum-level recall creates a second problem: a course that
// matched on a bullet in its outline renders as a title with NO highlight in
// it, which reads as a wrong result even when it is a good one. The visitor
// cannot tell a precise match from a stray one, so the honest fix is to show
// WHERE the term was found.
//
// Computed HERE, on the server, and shipped as a short `{ label, text }` —
// not by sending the objectives and topic lists to the browser so the card can
// search them again. That would re-open the payload problem this whole rework
// closed, and would be a second matching implementation besides.

/** Roughly how much text to keep on each side of the hit. */
export const SNIPPET_RADIUS = 48;

/** The field each type shows as its heading — a match here needs no snippet. */
const TITLE_OF = {
  courses: (c) => c?.course_name,
  onlineCourses: (o) => o?.o_course_name,
  careerPaths: (cp) => cp?.title,
  schedules: (s) => s?.course_ref?.course_name,
  promotions: (p) => p?.title,
  articles: (a) => a?.title,
};

/**
 * Where else to look, in priority order, with a label naming the field.
 *
 * The label is what makes the line read as an EXCERPT rather than as the item's
 * own summary — without it a topic bullet looks like a badly-written teaser.
 */
/**
 * `field` is the machine-readable half and it is load-bearing, not decoration.
 *
 * A card that also prints the teaser needs to know whether the snippet CAME
 * from the teaser, so it does not print the same sentence twice. Branching on
 * `label` would mean comparing a Thai display string in a component — which
 * breaks the moment the wording is edited, silently, into a duplicated
 * paragraph. `field` is the key; `label` is only ever rendered.
 */
/**
 * ── ONLY THE TYPES WHOSE MATCH CAN BE INVISIBLE ─────────────────────────────
 * A snippet earns its line only when the matched field is NOT already on the
 * card. After the narrowing above that is two types, not six:
 *
 *   · careerPaths — the match may be a course name INSIDE the path, and the
 *     card has no other way to say so;
 *   · promotions  — `detail_plain` is matched and is not rendered anywhere on
 *     the card.
 *
 * Courses, online courses and articles are gone from this map because every
 * field they now match on is printed on their own card: the name is the
 * heading, the code sits above it, the teaser/excerpt is the body, and article
 * tags are a chip row. Explaining a match the visitor can already see is noise,
 * and it was making the cards long.
 */
const SNIPPET_FIELDS = {
  courses: [],
  onlineCourses: [],
  careerPaths: [
    { label: 'รายละเอียด', get: (cp) => [cp?.tagline, cp?.short_description] },
    { label: 'หลักสูตรในเส้นทาง', get: (cp) => careerPathCourseStrings(cp) },
  ],
  schedules: [],
  promotions: [
    { label: 'รายละเอียด', get: (p) => [p?.detail_plain] },
    { label: 'แท็ก', get: (p) => (Array.isArray(p?.tags) ? p.tags.map((t) => t?.label) : []) },
  ],
  articles: [],
};

/**
 * An article's tags, with any tag that MATCHED the query moved to the front.
 *
 * The article card shows a capped, single-line chip row. If the query matched a
 * tag, that tag is the reason the card is a result — hiding it behind `+N` is
 * the same failure the snippet existed to fix, on a field that is already on
 * the card. Sorting is stable within each group, so an unmatched row keeps its
 * authored order untouched.
 *
 * Pure and exported so the ordering is testable without a DOM; the CAP is a
 * presentation decision and lives with the card.
 */
export function orderTagsByMatch(tags, rawTerm) {
  const list = (Array.isArray(tags) ? tags : []).filter(
    (t) => typeof t === 'string' && t.trim() !== '',
  );
  const term = normalizeSearchTerm(rawTerm);
  if (!term) return list;
  const matched = [];
  const rest = [];
  for (const tag of list) {
    (tag.toLowerCase().includes(term) ? matched : rest).push(tag);
  }
  return [...matched, ...rest];
}

/**
 * A window of `text` around the first occurrence of `term`, ellipsised.
 *
 * Exported for its own test: an off-by-one here truncates the term itself, and
 * a truncated string is a SUBSTRING of the correct one — so a test written with
 * `includes` would pass on the broken output. Its test compares whole strings.
 */
export function snippetAround(text, term, radius = SNIPPET_RADIUS) {
  const src = String(text ?? '');
  const at = src.toLowerCase().indexOf(term);
  if (at === -1) return src.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(src.length, at + term.length + radius);
  return (
    (start > 0 ? '…' : '') +
    src.slice(start, end).trim() +
    (end < src.length ? '…' : '')
  );
}

/**
 * `{ label, text }` for a match found OUTSIDE the item's title, or `null`.
 *
 * Null when the title already contains the term: the card highlights the title
 * itself, and repeating it underneath is noise.
 */
export function matchSnippet(type, row, rawTerm) {
  const term = normalizeSearchTerm(rawTerm);
  if (!term) return null;

  const title = TITLE_OF[type]?.(row);
  if (typeof title === 'string' && title.toLowerCase().includes(term)) return null;

  for (const { label, get } of SNIPPET_FIELDS[type] ?? []) {
    const values = get(row);
    const list = Array.isArray(values) ? values : [];
    const hit = list.find((v) => typeof v === 'string' && v.toLowerCase().includes(term));
    if (hit) return { label, text: snippetAround(hit, term) };
  }
  return null;
}

/** Every type present, every value 0. See `searchCorpusFor`'s counts contract. */
export function emptySearchCounts() {
  return Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0]));
}

const emptyResults = () => Object.fromEntries(SEARCH_TYPES.map((t) => [t, []]));

/**
 * THE ENTRY POINT. `(corpus, term)` → matches, projected, plus counts.
 *
 * ── THE COUNTS CONTRACT ─────────────────────────────────────────────────────
 * `counts` ALWAYS carries every key in SEARCH_TYPES, with 0 for an empty
 * bucket. Not "absent when zero": an absent key forces every consumer to write
 * `?? 0` and makes "this type found nothing" indistinguishable from "this build
 * forgot to include this type". Hiding a zero tab is a RENDER decision made
 * from the value (see lib/search/searchTabs.js), not a hole in the data.
 *
 * A term below SEARCH_MIN_CHARS returns the empty shape with `active: false` —
 * the page shows its suggestions rather than "no results", which are different
 * things.
 *
 * @param {object} corpus  `{ courses, onlineCourses, careerPaths, schedules, promotions, articles }`
 * @param {string} rawTerm
 */
export function searchCorpusFor(corpus, rawTerm) {
  const term = normalizeSearchTerm(rawTerm);
  if (term.length < SEARCH_MIN_CHARS) {
    return { term, active: false, results: emptyResults(), counts: emptySearchCounts(), total: 0 };
  }

  const results = {};
  const counts = {};
  let total = 0;
  for (const type of SEARCH_TYPES) {
    const rows = Array.isArray(corpus?.[type]) ? corpus[type] : [];
    const hit = rows.filter((row) => HAYSTACKS[type](row).includes(term));
    // The snippet is computed from the FULL corpus row and attached to the
    // projected one — the fields it reads (objectives, topic lists, curriculum)
    // never cross the wire themselves.
    results[type] = hit.map((row) => ({
      ...PROJECTIONS[type](row),
      snippet: matchSnippet(type, row, term),
    }));
    counts[type] = hit.length;
    total += hit.length;
  }
  return { term, active: true, results, counts, total };
}
