import { safeUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * ── THE BUNDLE BLURB (คำโปรย), IN TWO FIELDS THAT MUST AGREE ───────────────
 *
 * `blurb` is a PLAIN STRING and always will be. `blurbDoc` is the Tiptap
 * document the staging editor writes beside it. Every save writes both.
 *
 * ── WHY TWO FIELDS AND NOT ONE TIPTAP DOC ─────────────────────────────────
 * This was going to be a type change on `blurb` itself — the Page Builder's own
 * rich-text convention, which is what `rich_text` stores. It cannot be, and the
 * reason is operational rather than aesthetic: STAGING AND PRODUCTION SHARE ONE
 * MONGODB, and the production branch (`dev`) reads `content.blurb` in five
 * places that were measured against an object value:
 *
 *   BundlePageContent.jsx:191-193   {content.blurb} as a React child → THROWS
 *                                   ("Objects are not valid as a React child"),
 *                                   so the quotation page 500s
 *   SectionContentEditor.jsx:1602   <TextArea value={object}> → "[object Object]",
 *                                   and its onChange writes that back — the doc
 *                                   is destroyed by an admin who merely looked
 *   corpus/promotions.js:230        text(v) = String(v ?? '').trim() →
 *                                   description: "[object Object]" in the corpus
 *   promotion_bundle.jsx:333        typeof === 'string' ? … : '' → silently gone
 *   sectionLabels.js:322            String(object) is non-empty → wrong verdict
 *
 * And worse than any of those: `updateSection` re-parses the WHOLE merged
 * section against `blurb: z.string()`, so once a doc were stored, a production
 * admin could no longer save ANY edit to that bundle section — not the price,
 * not the items, not the rounds.
 *
 * So `blurb` keeps its type forever and `blurbDoc` rides alongside. Production
 * cannot see `blurbDoc` (nothing on `dev` reads it) and cannot be hurt by it:
 * that branch's bundle content schema is `.passthrough()`, so a production save
 * carries the key through untouched rather than dropping it.
 *
 * ── THE DRIFT RULE IS THE WHOLE DESIGN ────────────────────────────────────
 * Two fields holding one fact will come apart, and here the ways are known
 * rather than hypothetical:
 *
 *   · a section authored before `blurbDoc` existed has a string and no doc
 *   · a PRODUCTION admin edits the คำโปรย textarea on `dev`: `blurb` changes
 *     and the stale `blurbDoc` survives `.passthrough()` untouched
 *   · a hand-edited document, a restored version, an import
 *
 * `resolveBlurbForRender` settles every one of them the same way: the doc is
 * used ONLY if its own plain text still equals `blurb`. The string is the
 * authority, always — it is the field both branches write, so it is the field
 * that cannot be stale. A doc that disagrees with it is a doc describing an
 * older edit, and it is ignored rather than trusted.
 *
 * That makes the rich text a PROGRESSIVE ENHANCEMENT over a value production
 * owns, which is the only arrangement that is safe while the two branches are
 * live against one database.
 *
 * ── NO MIGRATION ──────────────────────────────────────────────────────────
 * Nothing rewrites stored data. A string-only section renders exactly as it does
 * today and gains a `blurbDoc` the next time an admin saves it on staging.
 */

/** The only marks a blurb may carry. */
export const BLURB_MARKS = Object.freeze(['bold', 'italic', 'link']);

/** The only nodes a blurb may contain, besides the `doc` root. */
export const BLURB_NODES = Object.freeze(['paragraph', 'text', 'hardBreak']);

const EMPTY_DOC = Object.freeze({ type: 'doc', content: [] });

/** A fresh empty doc. Frozen module state would be shared mutable data. */
export const emptyBlurbDoc = () => ({ type: 'doc', content: [] });

/**
 * ── THE RESTRICTION, APPLIED HERE AND NOT TRUSTED TO THE WALKER ───────────
 * `renderTiptap` already fails closed on URLs and degrades a node it does not
 * know — but it DOES know headings, lists, images and blockquotes, because
 * `rich_text` sections legitimately contain them. A blurb is a one-line
 * sub-heading under a package name; a heading or a bullet list in it would
 * render perfectly and be wrong.
 *
 * So the narrowing is this function's job, and it runs on the way IN to the
 * renderer as well as on the way in to storage. Anything undeclared is dropped
 * and its text kept, which is the same posture the walker takes: content
 * survives, formatting that cannot be honoured does not.
 */
export function sanitizeBlurbDoc(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyBlurbDoc();
  if (value.type !== 'doc') return emptyBlurbDoc();

  const paragraphs = [];
  for (const block of Array.isArray(value.content) ? value.content : []) {
    const inline = inlineOf(block);
    // A block that contributed nothing is dropped rather than kept as an empty
    // paragraph — an empty paragraph is a blank line nobody authored.
    if (inline.length) paragraphs.push({ type: 'paragraph', content: inline });
  }
  return { type: 'doc', content: paragraphs };
}

/**
 * The inline children of one block, flattened.
 *
 * A block that is not a paragraph is UNWRAPPED rather than discarded: a heading
 * an author pasted in still has words in it, and losing the words is a worse
 * outcome than losing the heading. Nested blocks (a list, a blockquote) are
 * walked for the same reason.
 */
function inlineOf(block) {
  if (!block || typeof block !== 'object') return [];
  if (block.type === 'hardBreak') return [{ type: 'hardBreak' }];
  if (block.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : '';
    if (text === '') return [];
    const marks = marksOf(block.marks);
    return [marks.length ? { type: 'text', text, marks } : { type: 'text', text }];
  }
  const out = [];
  for (const child of Array.isArray(block.content) ? block.content : []) {
    out.push(...inlineOf(child));
  }
  return out;
}

/** Only the three allowed marks, and a link only if its href survives safeUrl. */
function marksOf(marks) {
  const out = [];
  const seen = new Set();
  for (const mark of Array.isArray(marks) ? marks : []) {
    const type = mark?.type;
    if (!BLURB_MARKS.includes(type) || seen.has(type)) continue;
    if (type === 'link') {
      /*
        THE SAME ALLOWLIST THE WALKER AND THE EDITOR USE — http / https /
        mailto / tel, plus `/path` and `#anchor`. `javascript:` and
        protocol-relative `//` are refused here, so a doc carrying one is
        stripped of the MARK and keeps its text rather than reaching the
        renderer and being silently unlinked there.
      */
      const href = safeUrl(mark?.attrs?.href);
      if (!href) continue;
      out.push({ type: 'link', attrs: { href } });
      seen.add(type);
      continue;
    }
    out.push({ type });
    seen.add(type);
  }
  return out;
}

/**
 * The doc's plain text — the value that gets written to `blurb`.
 *
 * `\n` between paragraphs and for a hard break, so the string is exactly what
 * `docFromPlainText` would turn back into this doc. Trimmed, because `blurb`
 * is compared for equality by the drift rule and a trailing newline nobody can
 * see would make a matching pair look stale.
 *
 * Accepts a STRING too, and returns it trimmed. Callers hold "the blurb",
 * which is a string on a legacy section and a doc on a saved one; a helper that
 * refused one of them would push the shape test back out to every call site.
 */
export function blurbPlainText(value) {
  if (typeof value === 'string') return value.trim();
  const doc = sanitizeBlurbDoc(value);
  return doc.content
    .map((p) => (p.content ?? [])
      .map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? '')))
      .join(''))
    .join('\n')
    .trim();
}

/**
 * A legacy string, as a doc — one paragraph per line.
 *
 * This is how a blurb authored before `blurbDoc` existed opens in the editor.
 * The text is escaped BY CONSTRUCTION: it becomes a `text` node's `text`
 * property, never markup, so a stored `<b>x</b>` opens as the five visible
 * characters it has always rendered as rather than turning into formatting.
 */
export function docFromPlainText(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.trim() === '') return emptyBlurbDoc();
  return {
    type: 'doc',
    content: text
      .split(/\r?\n/)
      .map((line) => line.trim())
      // A blank line between two paragraphs is a separator, not a paragraph.
      .filter((line) => line !== '')
      .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  };
}

/** Nothing an author would see. */
export function isBlurbDocEmpty(value) {
  return blurbPlainText(value) === '';
}

/**
 * Whitespace-insensitive comparison, which is the tolerance the drift rule
 * needs rather than a looser one.
 *
 * A doc and its string twin are written together and agree exactly. They come
 * apart only when something edits ONE of them, and the something is a human
 * typing into a textarea — so the difference to forgive is a double space or a
 * stray newline, not a changed word. Runs of whitespace collapse to one space;
 * anything else counts as drift.
 */
const normalise = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * ── WHICH OF THE TWO FIELDS THIS RENDER USES ──────────────────────────────
 *
 * Returns `{ kind: 'doc', doc }` when the rich text is still a faithful
 * description of `blurb`, and `{ kind: 'text', text }` otherwise — including
 * when there is no doc at all, which is every section nobody has saved on
 * staging yet.
 *
 * `{ kind: 'text', text: '' }` for an empty blurb, so a caller can treat
 * "nothing to draw" as one case regardless of which field it came from.
 *
 * THE STRING WINS EVERY TIE. See the header: it is the field both branches
 * write, so it is the one that cannot be stale.
 */
export function resolveBlurbForRender(content) {
  const text = typeof content?.blurb === 'string' ? content.blurb.trim() : '';
  const raw = content?.blurbDoc;
  if (!raw || typeof raw !== 'object') return { kind: 'text', text };

  const doc = sanitizeBlurbDoc(raw);
  const fromDoc = blurbPlainText(doc);
  if (fromDoc === '') return { kind: 'text', text };
  if (normalise(fromDoc) !== normalise(text)) return { kind: 'text', text };
  return { kind: 'doc', doc };
}

/**
 * The patch the editor saves: BOTH fields, together, every time.
 *
 * `blurb` is produced from the doc rather than carried alongside it, so there
 * is no path on which a caller supplies the two independently and they start
 * out disagreeing. It is `String(...)` by construction — `blurbPlainText`
 * returns a string for every input — which is the invariant the whole two-field
 * arrangement rests on.
 *
 * An EMPTIED editor writes `blurb: ''` and an empty doc rather than deleting
 * the key: `undefined` does not survive a JSON round trip, so a removal
 * expressed that way would leave the previous value in the document.
 */
export function blurbPatch(doc) {
  const clean = sanitizeBlurbDoc(doc);
  const text = blurbPlainText(clean);
  if (text === '') return { blurb: '', blurbDoc: emptyBlurbDoc() };
  return { blurb: text, blurbDoc: clean };
}

export { EMPTY_DOC as BLURB_EMPTY_DOC };
