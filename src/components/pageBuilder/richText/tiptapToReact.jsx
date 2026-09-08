/**
 * tiptapToReact — render Tiptap JSON to React elements on the server.
 *
 * ┌─ THE NODE / MARK CONTRACT ────────────────────────────────────────────┐
 * │ The NAMES now live in lib/pageBuilder/richTextContract.js, as data,    │
 * │ because a contract written only in a comment is one nothing can check. │
 * │ The tables below are the IMPLEMENTATION of that list, and the assertion │
 * │ under them fails the build at module load if the two ever disagree.    │
 * │                                                                        │
 * │ Nodes: doc, paragraph, heading(1-6), text, bulletList, orderedList,    │
 * │        listItem, blockquote, horizontalRule, hardBreak, image          │
 * │ Marks: bold, italic, underline, strike, code, link                     │
 * │ Attrs: textAlign, on paragraph and heading                             │
 * │                                                                        │
 * │ The editor's Tiptap extensions are built to produce exactly this set   │
 * │ (editor/richText/tiptapExtensions.js). Adding a node/mark is additive: │
 * │ the contract, a renderer here, and an extension there — all three.     │
 * │                                                                        │
 * │ THE THIRD ROW IS NOT COVERED BY THE ASSERTION BELOW, and cannot be.    │
 * │ An attribute is not a NAME: `getSchema` reports `paragraph` whether or │
 * │ not TextAlign is installed, and the tables here have no entry for it.  │
 * │ Its check is a RENDER — test/render/richTextAlign.test.mjs.            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * The doc is UNTRUSTED input (a DB seed today, Tiptap output later): nodes
 * may be malformed, missing `type`, have non-array `content`, reference
 * unknown marks, or nest pathologically. The walk therefore:
 *   - never throws — one bad node degrades, it can't take down the page;
 *   - is bounded — MAX_DEPTH and MAX_NODES caps stop a hostile/corrupted doc
 *     from hanging the render;
 *   - fails closed on URLs — see safeUrl(): only http/https/mailto/tel and
 *     same-origin relative (`/…`, `#…`) survive; everything else is dropped.
 */

import { safeUrl } from '@/lib/pageBuilder/safeUrl';
import { RICH_TEXT_NODES, RICH_TEXT_MARKS, RICH_TEXT_NODE_ATTRS } from '@/lib/pageBuilder/richTextContract';

const MAX_DEPTH = 20;    // rich text nests a few levels (nested lists); 20 is slack
const MAX_NODES = 5000;  // total nodes processed before we stop

const warnedTypes = new Set();
function devWarn(kind, value) {
  if (process.env.NODE_ENV !== 'production' && !warnedTypes.has(`${kind}:${value}`)) {
    warnedTypes.add(`${kind}:${value}`);
    // eslint-disable-next-line no-console
    console.error(`[pageBuilder richText] unknown ${kind}: ${JSON.stringify(value)} — degraded`);
  }
}

// ── marks ────────────────────────────────────────────────────────────
const MARK_WRAPPERS = {
  bold:      (child, key) => <strong key={key}>{child}</strong>,
  italic:    (child, key) => <em key={key}>{child}</em>,
  underline: (child, key) => <u key={key}>{child}</u>,
  strike:    (child, key) => <s key={key}>{child}</s>,
  code:      (child, key) => <code key={key}>{child}</code>,
};

function applyMarks(text, marks, key) {
  if (!Array.isArray(marks) || marks.length === 0) return text;
  // Inline formatting first (inner), link last (outer) so the whole run links.
  let node = text;
  let linkMark = null;
  for (const mark of marks) {
    const type = mark?.type;
    if (type === 'link') { linkMark = mark; continue; }
    const wrap = MARK_WRAPPERS[type];
    if (wrap) node = wrap(node, `${key}-${type}`);
    else if (type) devWarn('mark', type);
  }
  if (linkMark) {
    const href = safeUrl(linkMark?.attrs?.href);
    if (href) {
      const external = /^https?:/i.test(href);
      node = (
        <a
          key={`${key}-link`}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        >
          {node}
        </a>
      );
    }
  }
  return node;
}

// ── node attributes ──────────────────────────────────────────────────
/**
 * ── ALIGNMENT: THE SAME THREE WORDS AND THE SAME THREE CLASSES THE
 *    `heading` SECTION USES ──────────────────────────────────────────────
 * Copied in VALUE from sections/heading.jsx's own ALIGN_CLASS, deliberately,
 * so the two surfaces cannot end up disagreeing about what "center" means —
 * an author who centres a heading SECTION and a paragraph INSIDE a rich_text
 * section is saying the same word twice and must get the same result.
 *
 * ── AN ABSENT VALUE MAPS TO NOTHING, WHICH IS NOT WHAT THE SECTION DOES ──
 * The section falls back to `text-left`, and it is right to: `content.align`
 * has a schema default of 'left' and every stored heading already carries one,
 * so a left class is what it has always emitted. A rich-text DOCUMENT has no
 * such default — every document stored before this round has no `textAlign` at
 * all — so emitting a class for an absent value would rewrite the markup of
 * every paragraph on every published page, invisibly. Absent renders exactly
 * what it rendered yesterday: no class, no wrapper, no attribute.
 *
 * It is also the whole of the safety story here. The map has three keys, so
 * the only three strings that can reach a class attribute are written on the
 * next line; an author's value is a lookup KEY and never an output.
 */
const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' };
const alignClass = (node) => ALIGN_CLASS[node?.attrs?.textAlign];

// ── nodes ────────────────────────────────────────────────────────────
const NODE_RENDERERS = {
  doc:            (_n, kids) => <>{kids}</>,
  paragraph:      (n, kids, key) => <p key={key} className={alignClass(n)}>{kids}</p>,
  bulletList:     (_n, kids, key) => <ul key={key}>{kids}</ul>,
  orderedList:    (_n, kids, key) => <ol key={key}>{kids}</ol>,
  listItem:       (_n, kids, key) => <li key={key}>{kids}</li>,
  blockquote:     (_n, kids, key) => <blockquote key={key}>{kids}</blockquote>,
  horizontalRule: (_n, _k, key) => <hr key={key} />,
  hardBreak:      (_n, _k, key) => <br key={key} />,
  heading: (n, kids, key) => {
    const lvl = Math.min(6, Math.max(1, Number(n?.attrs?.level) || 2));
    const Tag = `h${lvl}`;
    return <Tag key={key} className={alignClass(n)}>{kids}</Tag>;
  },
  image: (n, _k, key) => {
    const src = safeUrl(n?.attrs?.src);
    if (!src) return null;
    // Inline rich-text image — plain <img> (unknown intrinsic size); the
    // `image` SECTION uses next/image. Alt required, empty = decorative.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={key} src={src} alt={typeof n?.attrs?.alt === 'string' ? n.attrs.alt : ''} loading="lazy" className="h-auto max-w-full rounded-9e-md" />
    );
  },
};

// ── contract assertion (fail loudly at module load, as presets.js does) ──
// `text` is rendered inline by renderNode (it carries marks, not children) and
// `link` is applied outside MARK_WRAPPERS so it can wrap the whole run — both
// are implemented, just not via a table, so they're added back before compare.
(function assertContract() {
  const impl = { node: [...Object.keys(NODE_RENDERERS), 'text'], mark: [...Object.keys(MARK_WRAPPERS), 'link'] };
  const declared = { node: RICH_TEXT_NODES, mark: RICH_TEXT_MARKS };
  for (const kind of ['node', 'mark']) {
    const missing = declared[kind].filter((n) => !impl[kind].includes(n));
    const extra = impl[kind].filter((n) => !declared[kind].includes(n));
    if (missing.length || extra.length) {
      throw new Error(
        `[pageBuilder richText] ${kind} contract drift — ` +
        `declared-but-unimplemented: [${missing}]; implemented-but-undeclared: [${extra}]. ` +
        'Reconcile lib/pageBuilder/richTextContract.js with this file; the editor builds its Tiptap extensions from that list.'
      );
    }
  }
  /**
   * The THIRD list cannot be checked the same way, and saying so is the point.
   * An ATTRIBUTE has no entry in either table above, so there is nothing here
   * to compare it against — which is precisely why `textAlign` was excluded for
   * so long. What IS checkable at module load is that every node the contract
   * hangs an attribute on is a node this file actually renders; a stale entry
   * for a node nobody renders is a contract lying about its own coverage.
   *
   * That the attribute reaches the rendered page is a different claim needing a
   * different instrument, and it has one: test/render/richTextAlign.test.mjs.
   */
  for (const name of Object.keys(RICH_TEXT_NODE_ATTRS)) {
    if (!NODE_RENDERERS[name]) {
      throw new Error(
        `[pageBuilder richText] node-attribute contract drift — RICH_TEXT_NODE_ATTRS declares ` +
        `attributes on "${name}", which this file has no renderer for. An attribute on a node ` +
        'nobody renders is dead declaration; reconcile lib/pageBuilder/richTextContract.js.'
      );
    }
  }
})();

function renderNode(node, depth, ctx) {
  if (ctx.count >= MAX_NODES || depth > MAX_DEPTH) return null;
  ctx.count += 1;
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return null;

  const key = `n${ctx.count}`;

  if (node.type === 'text') {
    return applyMarks(typeof node.text === 'string' ? node.text : '', node.marks, key);
  }

  const kids = Array.isArray(node.content)
    ? node.content.map((c, i) => renderNodeSafe(c, depth + 1, ctx, i)).filter((x) => x !== null && x !== undefined)
    : null;

  const render = NODE_RENDERERS[node.type];
  if (render) return render(node, kids, key);

  // Unknown block node → unwrap its children so text survives, don't drop.
  devWarn('node', node.type);
  return kids && kids.length ? <span key={key}>{kids}</span> : null;
}

function renderNodeSafe(node, depth, ctx, i) {
  try {
    const out = renderNode(node, depth, ctx);
    if (out == null) return null;
    // Ensure array children carry a key.
    return typeof out === 'string' ? out : out;
  } catch {
    return null; // one bad node degrades to nothing
  }
}

/**
 * Render a Tiptap doc (or null). Returns React nodes, or null if there's
 * nothing renderable. Never throws.
 */
export function renderTiptap(doc) {
  if (!doc || typeof doc !== 'object') return null;
  try {
    const ctx = { count: 0 };
    const out = renderNode(doc, 0, ctx);
    return out ?? null;
  } catch {
    return null;
  }
}
