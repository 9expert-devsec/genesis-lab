/**
 * Rich-text HTML → plain text, for the corpus endpoints.
 *
 * The chatbot corpus is .txt: every string a corpus route emits must be plain
 * text, and this module is the ONE place HTML becomes text — a route that
 * strips tags inline per field would be a second converter with its own
 * failure modes (a list that loses its bullets, a `<p>` inside an `<li>` that
 * becomes a blank line, an entity left encoded).
 *
 * ── WHAT THE OUTPUT LOOKS LIKE ─────────────────────────────────────────────
 *   · block elements (p, headings, div, blockquote, pre, tr) become paragraphs
 *     separated by ONE blank line;
 *   · `<li>` becomes a line beginning "- ", in source order; a nested list is
 *     indented two spaces per level ("  - ") so the hierarchy survives —
 *     the masterclass outlines nest a `<ul>` inside an `<li>`;
 *   · block elements INSIDE an `<li>` do not break the line: TipTap wraps every
 *     list item's text in `<p>`, and honouring that as a paragraph would put a
 *     blank line after every bullet;
 *   · `<br>` is a line break; inline tags (strong, em, a, span…) vanish without
 *     inserting a space, so "มี<strong>X</strong>" stays "มีX";
 *   · `<script>` / `<style>` bodies are dropped, not rendered as text;
 *   · entities are decoded (named set below + numeric), then runs of whitespace
 *     collapse to one space inside a line; lines are trimmed; three or more
 *     newlines collapse to a blank line; the whole is trimmed.
 *
 * Tag names are matched case-insensitively; attributes are ignored. Comments
 * and CDATA are dropped. The input has already passed sanitizeRichHtml on its
 * way in, so this is a renderer for the allow-listed vocabulary and a
 * best-effort stripper for anything else — it never THROWS on odd markup.
 *
 * Pure: string in, string out; no DOM, no dependency.
 */

const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'pre', 'tr', 'section', 'article', 'header', 'footer', 'table', 'figure', 'figcaption', 'dd', 'dt']);
const LIST = new Set(['ul', 'ol']);
const SKIP = new Set(['script', 'style', 'template']);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', times: '×', deg: '°',
};

/** Decode HTML character references. Unknown named references are left as-is. */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()];
    return named ?? m;
  });
}

/** Whitespace-normalise a PLAIN string: trim, collapse runs of spaces/tabs, keep single newlines. */
export function plainText(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim();
}

/**
 * @param {unknown} html  the stored rich-text field (null/undefined/'' → '')
 * @returns {string} plain text as described in the header; never contains markup
 */
export function htmlToText(html) {
  const src = String(html ?? '');
  if (src.trim() === '') return '';

  const lines = [];
  let prefix = '';   // the "- " (indented) for the list item being built, else ''
  let text = '';     // text of the line being built
  let depth = 0;     // list nesting
  let skipping = null; // tag name whose body is being dropped

  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t !== '') lines.push(prefix + t);
    prefix = '';
    text = '';
  };
  const blank = () => {
    flush();
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
  };

  // Comments and CDATA first, so a `<` inside them cannot be read as a tag.
  const cleaned = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const tokens = cleaned.split(/(<\/?[a-zA-Z][^>]*>)/);

  for (const tok of tokens) {
    if (tok === '') continue;
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(tok);
    if (!m) {
      if (skipping) continue;
      text += decodeEntities(tok);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();

    if (skipping) {
      if (closing && tag === skipping) skipping = null;
      continue;
    }
    if (SKIP.has(tag)) {
      if (!closing && !/\/\s*>$/.test(tok)) skipping = tag;
      continue;
    }

    if (LIST.has(tag)) {
      flush();
      if (closing) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) blank();
      } else {
        depth += 1;
      }
      continue;
    }
    if (tag === 'li') {
      flush();
      if (!closing) prefix = `${'  '.repeat(Math.max(0, depth - 1))}- `;
      continue;
    }
    if (tag === 'br') {
      if (depth > 0) text += ' ';
      else flush();
      continue;
    }
    if (BLOCK.has(tag)) {
      if (depth > 0) {
        // Inside a list item a block boundary is a word boundary, not a line.
        text += ' ';
      } else if (closing) {
        blank();
      } else {
        flush();
      }
      continue;
    }
    // Inline tag (strong, em, a, span, …): contributes nothing.
  }
  flush();

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
