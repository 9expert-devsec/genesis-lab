/**
 * Minimal HTML pretty-printer for the Source HTML textarea — mirrors
 * ArticleForm's own, separate copy. Tiptap emits single-line markup; this
 * indents it so an admin can hand-edit pasted iframe / Google-Form embeds
 * comfortably.
 *
 * A rawHtmlBlock's own markup (RawHtmlNode.js) is carved out and left
 * completely untouched — see `formatHTML`'s own comment for why re-indenting
 * it is not merely cosmetic.
 */
function formatHTMLFragment(html) {
  let indent = 0;
  const tab = '  ';
  return html
    .replace(/></g, '>\n<')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.match(/^<\/\w/)) indent = Math.max(0, indent - 1);
      const result = tab.repeat(indent) + trimmed;
      if (trimmed.match(/^<\w[^/]*[^/]>$/) && !trimmed.match(/^<(br|hr|img|input)/i)) {
        indent++;
      }
      return result;
    })
    .filter(Boolean)
    .join('\n');
}

// The exact literal RawHtmlNode's renderHTML always emits (see its own file
// comment on why it's `=""` and not bare). formatHTML only ever sees HTML
// that came out of THIS editor's own getHTML(), so this is the only shape to
// match.
const RAW_HTML_BLOCK_OPEN = '<div data-raw-html="">';

/**
 * Finds the end of the `<div data-raw-html="">…` element opened at
 * `searchFrom`, by counting nested <div>/</div> tags — a naive first-`</div>`
 * search would truncate early on a payload that itself contains a <div>
 * (exactly the case this node exists for). Returns -1 if unterminated.
 */
function findMatchingDivClose(html, searchFrom) {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = searchFrom;
  let depth = 1;
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = tagRe.exec(html))) {
    if (match[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return match.index + match[0].length;
    } else {
      depth += 1;
    }
  }
  return -1;
}

/**
 * Pulls every top-level rawHtmlBlock out of `html`, each replaced by a
 * placeholder tag `formatHTMLFragment`'s own rules leave untouched (matches
 * neither its "opening tag" nor "closing tag" pattern, so it passes through
 * as one flat, unindented line). Returns the placeholder-bearing string plus
 * the exact bytes each placeholder stands in for.
 */
function extractRawHtmlBlocks(html) {
  const blocks = [];
  let out = '';
  let cursor = 0;
  for (;;) {
    const openIdx = html.indexOf(RAW_HTML_BLOCK_OPEN, cursor);
    if (openIdx === -1) {
      out += html.slice(cursor);
      break;
    }
    out += html.slice(cursor, openIdx);
    const closeIdx = findMatchingDivClose(html, openIdx + RAW_HTML_BLOCK_OPEN.length);
    const blockEnd = closeIdx === -1 ? html.length : closeIdx;
    blocks.push(html.slice(openIdx, blockEnd));
    out += `<div data-raw-html-placeholder-${blocks.length - 1} />`;
    cursor = blockEnd;
  }
  return { out, blocks };
}

/**
 * `formatHTMLFragment`, except a rawHtmlBlock's markup is never touched.
 * Whitespace is significant inside it — a <pre> or a nested <style> in the
 * payload would otherwise be silently rewritten on the very first toggle,
 * not merely re-indented on a later one.
 */
export function formatHTML(html) {
  const { out, blocks } = extractRawHtmlBlocks(html);
  let formatted = formatHTMLFragment(out);
  blocks.forEach((verbatim, i) => {
    // A function replacer, not a string one — a string replacement value
    // treats `$&`/`$1`-shaped substrings specially, and the verbatim payload
    // is arbitrary admin-authored text that could contain them.
    formatted = formatted.replace(`<div data-raw-html-placeholder-${i} />`, () => verbatim);
  });
  return formatted;
}
