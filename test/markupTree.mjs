/**
 * Walking a `renderToStaticMarkup` string as a TREE.
 *
 * ── WHY THIS IS A MODULE NOW ────────────────────────────────────────────────
 * Every function here was local to test/render/menuEscapesClip.test.mjs, which
 * was right while that file was the only reader: it needed a real ancestor
 * chain to ask "is this sheet inside somebody's scrollport", and a regex over
 * the markup cannot answer that.
 *
 * test/render/adminListCardScroll is now a second reader, asking the same SHAPE
 * of question about a different thing — "is the pagination bar a descendant of
 * the rows scroller, or a sibling of it". Both claims are about CONTAINMENT,
 * which is the one thing a class-name match can never see, and both are the
 * kind of claim a broken walk answers plausibly and wrongly.
 *
 * So it moved here rather than being copied, for the reason this repo moved
 * FULL_HEIGHT_ROUTES out of AdminContentWrapper when the layout became its
 * second reader: two copies of an instrument are two instruments, and the one
 * that is not being looked at is the one that drifts. Nothing about HOW the
 * walk works changed in the move; the reasoning behind each piece came with it,
 * including the bug the VOID list caused, which is the whole argument for not
 * having a second copy of that list.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * Not a parser. It has no error recovery, no namespace handling and no opinion
 * about malformed input — it walks what React emitted, which is well-formed by
 * construction. `unmatched`/`leftover` are how a caller checks that assumption
 * held before believing anything the walk says.
 */

/**
 * HTML void elements ONLY.
 *
 * This list was wrong once, in the probe menuEscapesClip grew out of, and the
 * failure is worth recording because it looked like a finding: `path`, `rect`
 * and the other SVG leaves were in here, React emits them with explicit close
 * tags, and every `</path>` therefore popped somebody else's element. The walk
 * reported the row menu as having THREE ancestors and no clip — a true-looking
 * answer arrived at by a broken instrument. `unmatched`/`leftover` below is the
 * guard that would have caught it immediately.
 */
export const VOID = new Set([
  'br', 'img', 'input', 'hr', 'meta', 'link', 'col',
  'source', 'area', 'base', 'embed', 'track', 'wbr', 'param',
]);

/** Tags in document order, quote-aware so a `>` inside an attribute is safe. */
export function* tagsOf(html) {
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return;
    if (html.startsWith('<!', lt)) { i = html.indexOf('>', lt) + 1; continue; }
    let j = lt + 1;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j += 1;
    }
    yield html.slice(lt, j + 1);
    i = j + 1;
  }
}

/** One double-quoted attribute off a raw tag string, or `''`. */
export const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

/**
 * Every element matching `match`, with its ANCESTOR class strings — outermost
 * first, excluding the element itself.
 *
 * `match` is called as `(node, stack)` where `node` is `{ tag, cls, raw }` and
 * `stack` is the live ancestor array (outermost first), so a caller can select
 * on a parent as well as on the element.
 *
 * Returns `{ found, unmatched, leftover }` so a caller can prove the walk was
 * balanced before believing anything it says about depth. See VOID above.
 */
export function chainsTo(html, match) {
  const stack = [];
  const found = [];
  let unmatched = 0;
  for (const raw of tagsOf(html)) {
    if (raw[1] === '/') {
      if (stack.length === 0) unmatched += 1; else stack.pop();
      continue;
    }
    const tag = /^<([a-zA-Z0-9]+)/.exec(raw)?.[1];
    if (!tag) continue;
    if (VOID.has(tag.toLowerCase()) || raw.endsWith('/>')) continue;
    const node = { tag, cls: attr(raw, 'class'), raw };
    if (match(node, stack)) {
      found.push({
        node,
        ancestors: stack.map((n) => ({ tag: n.tag, cls: n.cls, raw: n.raw })),
      });
    }
    stack.push(node);
  }
  return { found, unmatched, leftover: stack.length };
}
