import { parseFragment, serialize, defaultTreeAdapter, html as parse5Html } from 'parse5';

/**
 * Render-time wrapper for tables in article bodies.
 *
 * THE PROBLEM. Article bodies are Tiptap HTML stored in Mongo. A table with
 * more columns than the content column can seat overflows it, and the page
 * does NOT gain a horizontal scrollbar to compensate: `body { overflow-x:
 * clip }` (globals.css, with its own reason — `hidden` would promote overflow-y
 * to `auto`, create a scroll container and break the sticky header). `clip`
 * creates no scroll container at all, so the overflowing columns are not merely
 * off-screen, they are UNREACHABLE — no scrollbar, no touch-drag, not even
 * programmatic scrollLeft. In the current corpus that is 10 of 103 tables: the
 * three 5-column and seven 6-column ones. 4 columns and under fit.
 *
 * WHY NOT CSS ALONE. `table { display: block; overflow-x: auto }` does scroll,
 * but a `<table>` with `display: block` is no longer a table box: its
 * `table-row-group` children force an ANONYMOUS table box (CSS 2.1 §17.2.1)
 * whose width is shrink-to-fit (§17.5.2) and which no selector can reach —
 * `width` does not even apply to row groups. So every narrow table would stop
 * stretching to the column. That regresses 93 tables to rescue 10. The table
 * has to stay a real table, inside a block that scrolls: hence a wrapper, and
 * hence a parser, because a parent element cannot be added any other way.
 *
 * WHY A SEPARATE MODULE, NOT normalizeAuthoredColors. That module runs
 * sanitize-html in pass-through mode, and `transformTags` can rename a tag and
 * edit its attributes but CANNOT add a parent — verified, not assumed:
 * returning markup in `tagName` emits malformed output (`</div>` closing a
 * `<table>`), and the `text` field is escaped AND discards the element's
 * children. It also documents a checkable guarantee — 458 of 484 bodies come
 * back byte-identical — which splitting its `applied` flag to host unrelated
 * work would spend. So this runs after it, in the page's render path.
 *
 * WHY parse5 AND NOT htmlparser2. Measured on the 72 table-bearing bodies in
 * the corpus rather than argued: parse5 round-trips 71 of 72 BYTE-IDENTICAL,
 * htmlparser2 + dom-serializer only 34 of 72 (it drops empty attribute values,
 * so `data-youtube-video=""` becomes `data-youtube-video` — still valid, still
 * matched by the CSS, but churn on 38 bodies for nothing). parse5 is also one
 * dependency instead of three. Declared as a DIRECT dependency rather than
 * leaned on transitively, following the sucrase precedent.
 *
 * The single parse5 divergence is HTML5's mandated newline preprocessing
 * (CRLF -> LF, 28 occurrences in one body inside a <pre><code>); the output is
 * byte-identical to the CRLF-normalised source and renders the same, since a
 * CRLF and an LF are one line break either way.
 *
 * DETERMINISM. Same input always yields the same output — no clock, no
 * randomness, no environment reads — so the server render the client hydrates
 * against is stable. The accessible name is derived from the table's index in
 * the body, which is a property of the input.
 *
 * NOTHING IS WRITTEN BACK. Stored HTML is untouched, as with the authored
 * colours: article bodies are fixed at render time, never migrated.
 */

/** The wrapper's class. globals.css styles `.article-content .{this}`. */
export const TABLE_WRAPPER_CLASS = 'article-table-scroll';

/**
 * The accessible name, 1-based within the body: "ตารางที่ 1", "ตารางที่ 2", …
 *
 * A scroll container has to be focusable to be scrollable by keyboard, and a
 * focusable region needs a name or it is announced as an unlabelled region.
 * The name is numbered rather than a bare "ตาราง" because an article with
 * three tables would otherwise present three identically-named regions, which
 * is worse than useless for navigating between them. Thai, because the body
 * copy is Thai. The subject of a table is not knowable on the server, so an
 * ordinal is the most specific honest name available.
 */
export const tableLabel = (index) => `ตารางที่ ${index + 1}`;

const HTML_NS = parse5Html.NS.HTML;

/** Depth-first list of every <table> element, in document order. */
function findTables(node, out = []) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName === 'table') out.push(child);
    findTables(child, out);
  }
  return out;
}

const attr = (el, name) => el.attrs?.find((a) => a.name === name)?.value ?? null;

/** Is this table already inside a wrapper we produced? Keeps the pass idempotent. */
function alreadyWrapped(table) {
  const parent = table.parentNode;
  if (!parent || parent.tagName !== 'div') return false;
  return (attr(parent, 'class') ?? '').split(/\s+/).includes(TABLE_WRAPPER_CLASS);
}

/**
 * Wrap tables in an article body so wide ones scroll inside the content column.
 *
 * Returns the input string unchanged — the same bytes, not an equivalent
 * re-serialisation — when there is no table to wrap. 416 of the 488 bodies in
 * the corpus contain no table at all and never reach the parser, which is the
 * same shape of cheap superset guard normalizeAuthoredColors uses.
 */
export function wrapArticleTables(html) {
  if (!html) return html ?? '';
  const str = String(html);
  // Case-insensitive because the guard must not be the thing that decides
  // whether a body is handled; `<TABLE` is valid HTML even if Tiptap emits
  // lowercase. Cheap enough to run on every body.
  if (!/<table/i.test(str)) return str;

  try {
    const fragment = parseFragment(str);
    const tables = findTables(fragment);
    let wrapped = 0;

    for (const table of tables) {
      if (alreadyWrapped(table)) continue;
      const parent = table.parentNode;
      if (!parent) continue;

      const wrapper = defaultTreeAdapter.createElement('div', HTML_NS, [
        { name: 'class', value: TABLE_WRAPPER_CLASS },
        // Focusable, or a keyboard user cannot scroll it and the columns stay
        // exactly as unreachable for them as they are for everyone today.
        { name: 'tabindex', value: '0' },
        { name: 'role', value: 'region' },
        { name: 'aria-label', value: tableLabel(wrapped) },
      ]);

      const at = parent.childNodes.indexOf(table);
      if (at === -1) continue;
      parent.childNodes[at] = wrapper;
      wrapper.parentNode = parent;
      table.parentNode = wrapper;
      wrapper.childNodes = [table];
      wrapped += 1;
    }

    // A body whose only <table> match was inside a comment or an attribute
    // value, or one already wrapped, is handed back as its ORIGINAL bytes
    // rather than a re-serialised equivalent.
    return wrapped ? serialize(fragment) : str;
  } catch {
    // Never lose the article over a presentation concern — the same posture
    // normalizeAuthoredColors takes.
    return str;
  }
}
