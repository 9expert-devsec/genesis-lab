import { parseFragment, serialize } from 'parse5';

/**
 * Render-time pass: every `<img>` in an article body that does not already
 * declare `loading` gets `loading="lazy"` and, unless it declares its own,
 * `decoding="async"`.
 *
 * Bodies are long and image-heavy, and Tiptap emits bare `<img src>` — so the
 * browser fetched every image in the article on first paint, well below the
 * fold. An author-set `loading` (e.g. `eager` on a lead image) is respected.
 * `src`, `width`, `height` and every other attribute are left alone; the
 * cover image is not in the body and never reaches this.
 *
 * Runs AFTER wrapArticleTables in the page's render path, with the same parser
 * (parse5) for the same reason recorded there: it round-trips the corpus
 * byte-identically, so the only bytes that change are the ones added here.
 *
 * Same posture as that pass, too: a body with no `<img` never reaches the
 * parser, a body with nothing to change comes back as its ORIGINAL bytes, a
 * parse failure returns the input, and nothing is written back to Mongo.
 */

function findImages(node, out = []) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName === 'img') out.push(child);
    // <template> content lives on .content, not childNodes; Tiptap emits none.
    findImages(child, out);
  }
  return out;
}

const hasAttr = (el, name) => (el.attrs ?? []).some((a) => a.name === name);

export function lazyLoadArticleImages(html) {
  if (!html) return html ?? '';
  const str = String(html);
  if (!/<img/i.test(str)) return str;

  try {
    const fragment = parseFragment(str);
    let changed = 0;
    for (const img of findImages(fragment)) {
      if (hasAttr(img, 'loading')) continue;
      img.attrs.push({ name: 'loading', value: 'lazy' });
      if (!hasAttr(img, 'decoding')) img.attrs.push({ name: 'decoding', value: 'async' });
      changed += 1;
    }
    return changed ? serialize(fragment) : str;
  } catch {
    return str;
  }
}
