import { parseFragment, serialize, defaultTreeAdapter, html as parse5Html } from 'parse5';

/**
 * training_topics rich bullets — the pure conversion core.
 *
 * ══ THE SPLIT-STORE DECISION THIS MODULE SERVES ═════════════════════════════
 *
 * Rich HTML for a row's bullets is GENESIS-OWNED and lives in the
 * CourseExtension document. MSDB's `training_topics` keeps receiving the same
 * shape it has always received — `Array<{ title: string, bullets: string[] }>`
 * — as a PLAIN-TEXT PROJECTION of that HTML.
 *
 * That is not a preference. Measured in U5 against live MSDB:
 *   · MSDB's OWN admin form still edits this field, with plain <input>s
 *     (9exp-master-data PublicCourseForm.jsx:1235-1241), and re-saves whatever
 *     is in the box on submit (:744-748). Markup left in the field is markup an
 *     MSDB admin sees raw and can hand-delete.
 *   · GET /api/ai/public-course spreads the field VERBATIM into every API
 *     response AND into the `course.updated` webhook payload
 *     (shapeCourseForExternal.js:47-59), whose subscriber list is not knowable
 *     from this repo.
 *   · The field is clean today: 4,443 values across 79 courses carry ZERO HTML
 *     entities, ZERO newlines, ZERO markdown, and exactly one angle bracket —
 *     `List<mailmessage>` on UIPATH, a C# generic, not a tag.
 *
 * So MSDB's copy must stay readable as plain text. This module is the two
 * directions of that projection, and nothing else: no React, no I/O, no
 * 'use server'. It lives beside trainingTopics.js for the same reason that
 * module does — src/lib/actions/courses.js is `'use server'` and no test in
 * this suite can import it, so the logic that can silently destroy data has to
 * live somewhere a test can reach.
 *
 * ── WHY parse5, AND WHY NOT jsdom ───────────────────────────────────────────
 * ONE parser for every function here. parse5 is already a DIRECT RUNTIME
 * dependency (package.json `dependencies`, ^8.0.1) and already parses HTML in
 * production in src/lib/articles/wrapArticleTables.js, which measured it
 * against htmlparser2 and chose it.
 *
 * jsdom is a devDependency (27.0.1, used only by test/render/). Importing it
 * from src/ would put a devDependency ON THE RUNTIME PATH — `next build`
 * resolves it from src, and a production install (`npm ci --omit=dev`) would
 * not have it. That is a build break, not a style preference, so jsdom is not
 * used here.
 *
 * ── ESCAPING AND DECODING ARE THE SAME LIBRARY, DELIBERATELY ────────────────
 * `plainBulletsToHtml` does NOT hand-roll an escape table. It builds a parse5
 * tree and lets parse5's serializer escape, so the encode and the decode are
 * two directions of one implementation and cannot drift into disagreeing about
 * what `&` or `<` means. UIPATH's `List<mailmessage>` is the fixture that
 * proves it matters: unescaped, the browser reads `<mailmessage>` as an unknown
 * element and THE TEXT DISAPPEARS at author time.
 *
 * ── DEPTH IS CAPPED AT 3, AND OVER-DEEP CONTENT IS LIFTED, NOT DROPPED ──────
 * Losing a level of indentation is acceptable. Losing an admin's text is not.
 * See clampDepth.
 *
 * ── WHY PREFIXES AND NOT INDENTATION ───────────────────────────────────────
 * Both sides of the round trip trim: `toStr` here in genesis
 * (trainingTopics.js:41) and MSDB's own form on submit
 * (PublicCourseForm.jsx:745-748). Leading whitespace cannot survive a save on
 * either side, so nesting has to be carried by visible characters or not at
 * all.
 */

const HTML_NS = parse5Html.NS.HTML;

/** The hard nesting cap. Three levels: bullet, sub, sub-sub. */
export const MAX_TOPIC_DEPTH = 3;

/**
 * The flatten prefix per nesting level, indexed by level-1.
 *
 * U+2013 EN DASH plus a space, repeated. NOT a hyphen-minus: `-` is one of the
 * leading glyphs the bullet-marker convention already treats as noise
 * (bulletLines.js:36-46 — the public page draws its own marker and reads none
 * from the text), and `- ` in stored text is the shape that produces "• - item"
 * on the page. An en dash is visibly a continuation marker rather than a bullet.
 *
 * FROZEN so a caller cannot mutate the table that MSDB's stored bytes depend on.
 */
export const DEPTH_PREFIXES = Object.freeze(['', '– ', '– – ']);

/** Tags that open a nesting level. `ol` is included on READ only — see sanitizeTopicHtml. */
const LIST_TAGS = new Set(['ul', 'ol']);

const isElement = (node) => typeof node?.tagName === 'string';
const isList = (node) => isElement(node) && LIST_TAGS.has(node.tagName);

/**
 * Every <li> in the fragment, in DOCUMENT ORDER, with its 1-based nesting level.
 *
 * THE ONE WALKER. `htmlToProjection` and `clampDepth` both read the tree
 * through this rather than each recursing on their own — two walkers with two
 * ideas of what "depth" means is the drift this module exists to prevent.
 *
 * An <li> with no list ancestor at all is level 1, not level 0. That is not
 * hypothetical: sanitize-html UNWRAPS a disallowed list tag and leaves its <li>
 * children orphaned in place (verified — `<ol>` with `ol` disallowed yields a
 * bare `<li>` run), so an orphan is a real state and it is top level.
 */
function collectListItems(node, level = 0, out = []) {
  for (const child of node.childNodes ?? []) {
    if (isList(child)) {
      collectListItems(child, level + 1, out);
    } else if (isElement(child) && child.tagName === 'li') {
      out.push({ li: child, level: Math.max(1, level) });
      collectListItems(child, level, out);
    } else {
      collectListItems(child, level, out);
    }
  }
  return out;
}

/**
 * An <li>'s OWN text — its descendants MINUS any nested list subtree.
 *
 * The nested list's items are separate entries with their own prefixes, so
 * folding their text into the parent would emit each nested bullet twice: once
 * inside its parent's entry and once as its own.
 *
 * <br> becomes a space rather than a newline. MSDB stores one bullet per array
 * entry and the stored strings carry ZERO newlines today (measured, 4,443
 * values); emitting one would put a character into the field that nothing
 * upstream has ever had to handle.
 */
function ownText(li) {
  let out = '';
  (function walk(node) {
    for (const child of node.childNodes ?? []) {
      if (isList(child)) continue;
      if (isElement(child)) {
        if (child.tagName === 'br') out += ' ';
        else walk(child);
        continue;
      }
      if (typeof child.value === 'string') out += child.value;
    }
  })(li);
  return out;
}

/**
 * Flatten LINE STRUCTURE to single spaces, and trim. Nothing else is touched.
 *
 * ══ THIS RULE IS AS NARROW AS IT IS BECAUSE THE DATA WAS MEASURED ═══════════
 *
 * The obvious rule — `replace(/\s+/g, ' ')` — was written first and is WRONG
 * here. Measured across all 4,443 live titles and bullets (79 courses):
 *
 *     newline / carriage return  ....  0
 *     tab, form feed, vertical tab ..  0
 *     leading or trailing whitespace   0
 *     runs of 2+ PLAIN spaces ......  41   ← `\s+` would rewrite these
 *     U+00A0 NO-BREAK SPACE ........  35   ← `\s+` would rewrite these too
 *
 * So `\s+` would have silently normalised 60 stored values the first time an
 * admin opened and saved one of those courses — bytes that then travel to MSDB,
 * to its own admin form, and to every `course.updated` webhook subscriber.
 * Invisible on the page (HTML collapses whitespace when rendering either way)
 * and therefore invisible in review, which is what makes it the bad kind of
 * change rather than a harmless one.
 *
 * The rule kept here converts only what a plain-text field CANNOT carry and
 * what no live value contains — the characters that make a string multi-line —
 * so every one of the 4,443 measured values round-trips BYTE-IDENTICAL.
 *
 * ── WHAT IS DELIBERATELY PRESERVED, AND WHY ────────────────────────────────
 *   · runs of plain spaces — 41 live values have them, and they are authorial;
 *   · U+00A0 NO-BREAK SPACE — 35 live values have it;
 *   · U+200B ZERO WIDTH SPACE — 14 live bullets lead with one (GOO-ADK, MSP-L1,
 *     PYTHON-L1). Note `\s` never matched this one anyway: the class covers
 *     U+2000-U+200A and 200B sits outside it, so preserving it was accidental
 *     before and is a decision now.
 *
 * All three are things a data-cleaning pass might reasonably remove. This is a
 * FORMATTING function, and a formatting function that quietly edits content is
 * the defect, not the feature. Cleaning them is a separate, deliberate,
 * measured migration — not a side effect of turning an editor on.
 */
const collapse = (s) => s.replace(/[\r\n\t\f\v]+/g, ' ').trim();

/**
 * SEED — today's flat `bullets: string[]` → a single-level <ul>.
 *
 * Returns '' for an empty or non-array input, NOT an empty `<ul></ul>`: an
 * empty editor must serialise to nothing, or 125 legitimately bullet-less rows
 * (measured across 27 courses) would each gain an empty list on first open.
 *
 * Blank and whitespace-only entries are DROPPED, matching `normaliseTopicRow`
 * (trainingTopics.js:62), which already `.filter(Boolean)`s them out on every
 * save. A blank entry therefore cannot reach here from stored data.
 */
export function plainBulletsToHtml(bullets) {
  if (!Array.isArray(bullets)) return '';
  const items = bullets
    .map((b) => (typeof b === 'string' ? b : b == null ? '' : String(b)))
    .filter((b) => b.trim() !== '');
  if (items.length === 0) return '';

  const fragment = parseFragment('');
  const ul = defaultTreeAdapter.createElement('ul', HTML_NS, []);
  defaultTreeAdapter.appendChild(fragment, ul);
  for (const text of items) {
    const li = defaultTreeAdapter.createElement('li', HTML_NS, []);
    defaultTreeAdapter.appendChild(ul, li);
    // parse5 escapes on serialize. Nothing here builds an entity by hand.
    defaultTreeAdapter.insertText(li, text);
  }
  return serialize(fragment);
}

/**
 * FLATTEN — rich HTML → the plain `bullets: string[]` MSDB stores.
 *
 * Each <li>'s own text becomes one entry, in document order, prefixed by its
 * level. Inline marks are stripped to their text content, entities are decoded
 * by the parser, line-structure whitespace flattens to single spaces (see
 * `collapse` — plain-space runs, NBSP and U+200B are all preserved), and empty
 * entries are dropped.
 *
 * An <li> holding ONLY a nested list contributes no entry of its own — its own
 * text is empty and empties are dropped — while its children still contribute
 * theirs. That is a real authoring shape (a heading-less group), and the
 * alternative, emitting a bare prefix like "– " as an entry, would put a
 * meaningless line into the MSDB copy that its own admin form would then show.
 *
 * The prefix index is CLAMPED here as well as in clampDepth. Belt and braces on
 * purpose: this function is the last thing between an admin's paste and bytes
 * that leave for MSDB and its webhook subscribers, and it must not be able to
 * emit "– – – " because something upstream forgot to clamp.
 */
export function htmlToProjection(html) {
  if (!html) return [];
  const str = String(html);
  if (str.trim() === '') return [];

  let items;
  try {
    items = collectListItems(parseFragment(str));
  } catch {
    // A projection that throws would abort a save. Losing the rich copy is
    // recoverable; losing the admin's submit is not.
    return [];
  }

  const out = [];
  for (const { li, level } of items) {
    const text = collapse(ownText(li));
    if (text === '') continue;
    const prefix = DEPTH_PREFIXES[Math.min(level, DEPTH_PREFIXES.length) - 1];
    out.push(prefix + text);
  }
  return out;
}

/**
 * Enforce the nesting cap by LIFTING over-deep items, never deleting them.
 *
 * A list at level `max + 1` has its children spliced into the grandparent list
 * immediately after the <li> that held it, which puts them at level `max`. The
 * scan then repeats, because lifting one list can leave a deeper one still
 * violating.
 *
 * Whole child nodes are moved, not just <li> elements, so inline text a parser
 * left loose inside a list is carried across rather than dropped.
 *
 * Returns the input string UNCHANGED — the same bytes, not a re-serialisation —
 * when nothing violates. Same posture as wrapArticleTables: a body that needs
 * no work is not churned.
 *
 * The iteration guard is a backstop against a tree shape that does not converge,
 * not an expected path; each lift strictly reduces total nesting.
 */
export function clampDepth(html, max = MAX_TOPIC_DEPTH) {
  if (!html) return html ?? '';
  const str = String(html);
  const cap = Number.isFinite(max) && max >= 1 ? Math.floor(max) : MAX_TOPIC_DEPTH;

  // Cheap superset gate: fewer list openings than cap+1 cannot nest past cap.
  const opens = (str.match(/<(?:ul|ol)\b/gi) || []).length;
  if (opens <= cap) return str;

  try {
    const fragment = parseFragment(str);
    let lifted = 0;

    for (let guard = 0; guard < 1000; guard += 1) {
      const offender = findDeepList(fragment, 0, cap);
      if (!offender) break;
      liftList(offender);
      lifted += 1;
    }

    return lifted ? serialize(fragment) : str;
  } catch {
    return str;
  }
}

/** The first list, in document order, whose 1-based level exceeds `cap`. */
function findDeepList(node, level, cap) {
  for (const child of node.childNodes ?? []) {
    if (isList(child)) {
      if (level + 1 > cap) return child;
      const deeper = findDeepList(child, level + 1, cap);
      if (deeper) return deeper;
    } else {
      const deeper = findDeepList(child, level, cap);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** Move a list's children up one level and remove the now-empty list. */
function liftList(list) {
  const parent = list.parentNode;
  if (!parent) return;

  // The usual shape: <ul>…<li>text<ul>DEEP</ul></li>…</ul>. The deep items
  // belong beside their holder in the grandparent list.
  const target = isElement(parent) && parent.tagName === 'li' ? parent.parentNode : parent;
  const anchor = target === parent ? list : parent;
  if (!target) return;

  const at = target.childNodes.indexOf(anchor);
  const moved = list.childNodes.slice();
  for (const child of moved) child.parentNode = target;

  const removeAt = parent.childNodes.indexOf(list);
  if (removeAt !== -1) parent.childNodes.splice(removeAt, 1);

  const insertAt = target.childNodes.indexOf(anchor);
  const index = insertAt !== -1 ? insertAt + 1 : (at !== -1 ? at : target.childNodes.length);
  target.childNodes.splice(index, 0, ...moved);
  list.childNodes = [];
  list.parentNode = null;
}

/**
 * Are two `Array<{ title, bullets[] }>` values identical, in order?
 *
 * ══ WHOLE-ARRAY, NEVER PER-ROW ══════════════════════════════════════════════
 *
 * This is the staleness check the split store lives or dies by: genesis holds
 * rich HTML, MSDB holds the plain projection, and the rich copy may only be
 * rendered when the projection genesis last wrote still equals what MSDB
 * returns today.
 *
 * The tempting cheaper version — match row by row, keep the rich copy for the
 * rows that still agree — IS WRONG, and wrong in the direction that corrupts.
 * MSDB's own admin form can INSERT a row in the middle
 * (PublicCourseForm.jsx:1235-1241). Per-index matching would then compare row 3
 * against row 4, find them different, and quietly keep applying row 3's
 * formatting to row 4's text — the wrong bold on the wrong sentence, with
 * nothing red anywhere. An all-or-nothing comparison degrades to plain text
 * instead, which is the state every consumer already handles.
 *
 * Order-sensitive for the same reason: two arrays holding the same rows in a
 * different order are a REORDER, and a reorder moves formatting off its text
 * exactly as an insert does.
 *
 * Anything that is not an array of rows is `false`, never a throw and never a
 * lenient true. "I cannot tell" and "they match" must not be the same answer
 * when the difference decides whether markup is rendered.
 */
export function projectionEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return false;
    if (String(x.title ?? '') !== String(y.title ?? '')) return false;

    const bx = Array.isArray(x.bullets) ? x.bullets : null;
    const by = Array.isArray(y.bullets) ? y.bullets : null;
    if (bx === null || by === null) return false;
    if (bx.length !== by.length) return false;
    for (let j = 0; j < bx.length; j += 1) {
      if (String(bx[j] ?? '') !== String(by[j] ?? '')) return false;
    }
  }
  return true;
}
