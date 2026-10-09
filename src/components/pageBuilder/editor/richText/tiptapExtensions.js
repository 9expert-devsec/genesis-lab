'use client';

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { safeUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * The editor's Tiptap extension set — built to produce EXACTLY the node/mark
 * contract in lib/pageBuilder/richTextContract.js, which is the same set the
 * server walker renders (richText/tiptapToReact.jsx).
 *
 * "Exactly", not "close to". The walker never errors on a node it doesn't know:
 * an unknown block is unwrapped into a <span> so its text survives, an unknown
 * mark is dropped and its text survives. So any extension that can emit
 * something the walker doesn't handle is a way to author content that looks
 * right in the editor and publishes wrong — a table as a run of naked text, a
 * code block as an unformatted line — with no error anywhere.
 *
 * That is why the verification runs in the direction that breaks: the
 * ProseMirror schema these extensions generate (getSchema) is checked against
 * the contract, asking "can Tiptap produce something undeclared", not "can the
 * walker render what Tiptap produces".
 *
 * ── What is switched OFF, and why ────────────────────────────────────────
 * codeBlock: StarterKit ships it ON. The walker has no renderer for it, so a
 * code block would publish as unformatted text. Off.
 *
 * Installed but deliberately NOT included (see RICH_TEXT_EXCLUDED): Table*,
 * Youtube, Subscript, Superscript. Every one of them emits a node/mark the
 * walker drops or degrades.
 *
 * ── TextStyle AND Color ARE IN, AND THE OLD REASON WAS WRONG ─────────────
 * They were excluded as "a raw-hex route into the page, which MANIFESTO §7
 * forbids". §7 forbids a colour DECIDED IN SOURCE — a hex in a class or a
 * style opts that surface out of dark mode — and an author's hex arriving from
 * the database at render time is DATA, which is the distinction customColor.js
 * has drawn since round 39. The correction is written out in full in
 * RICH_TEXT_EXCLUDED rather than left as a deletion.
 *
 * `Color` is configured `types: ['textStyle']` so it decorates exactly one
 * mark. It contributes no name of its own — `color` is an ATTRIBUTE on
 * textStyle — which is why the schema check sees `textStyle` and nothing else,
 * and why the attribute's safety is `hexOrNull` at the walker rather than a
 * name in a list. That is not the TextAlign problem in disguise: a mark
 * attribute cannot arrive without its mark, and the mark IS in the schema.
 *
 * ── TextAlign IS IN NOW, AND getSchema STILL CANNOT SEE IT ───────────────
 * It was the sneakiest of that set and it was kept out for a reason that has
 * not stopped being true: it is neither a node nor a mark but an ATTRIBUTE on
 * paragraph/heading, so the schema check would NOT catch it — the schema still
 * reads `paragraph`, and alignment would vanish at publish with the contract
 * assertion green.
 *
 * Admitting it therefore means CLOSING that hole rather than inheriting it, in
 * three parts: the attribute is DECLARED in RICH_TEXT_NODE_ATTRS, the walker
 * READS `node.attrs.textAlign` and maps it to the `heading` section's own
 * class strings, and the check with teeth is a RENDER —
 * test/render/richTextAlign.test.mjs puts the attribute on a document and
 * asserts the class comes out, with a control fixture proving an absent value
 * still renders the bytes it rendered before. The verification DIRECTION is
 * unchanged for names; an attribute simply needs a different instrument, and
 * now it has one.
 *
 * Placeholder and CharacterCount are safe by contrast — they contribute no
 * nodes or marks at all, which the schema check confirms rather than assumes.
 */
export function richTextExtensions({ placeholder = 'เริ่มพิมพ์ที่นี่…' } = {}) {
  return [
    StarterKit.configure({
      // No walker renderer — see above. Everything else StarterKit provides
      // (doc/paragraph/text/heading/lists/blockquote/hr/hardBreak + bold/
      // italic/strike/code) is in the contract.
      codeBlock: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false, // the editor is for editing; a click must not navigate
      // ONE allowlist, shared with the walker. Without this the editor would
      // happily accept an ftp:// link that safeUrl silently drops at render —
      // the author sees a link, the page has none.
      isAllowedUri: (url) => Boolean(safeUrl(url)),
      shouldAutoLink: (url) => Boolean(safeUrl(url)),
    }),
    Image,
    TextAlign.configure({
      // The two nodes RICH_TEXT_NODE_ATTRS declares, and the reason the
      // declaration is a list rather than a comment: this option is the only
      // thing deciding which nodes can carry the attribute, and nothing in the
      // generated schema's NAMES would show it changing.
      types: ['paragraph', 'heading'],
      /**
       * THREE, not TextAlign's own four. Its default list ends with `justify`,
       * for which the walker has no class and the `heading` section has no
       * value — so a fourth button would author a value the renderer drops,
       * which is the "looks right in the editor, publishes wrong" failure this
       * whole file exists to prevent, arriving through an option default rather
       * than through an extension anyone meant to install.
       */
      alignments: ['left', 'center', 'right'],
      /**
       * `null` is the extension's own default and it is restated here because
       * it is load-bearing, not incidental: a non-null default would stamp an
       * alignment onto every paragraph the author never touched, and the walker
       * would then emit a class for all of them. Absent must stay absent.
       */
      defaultAlignment: null,
    }),
    TextStyle,
    // `types` is the extension's own default and is restated for the same
    // reason `defaultAlignment` is above: it is the line that keeps `color` to
    // one mark, and a default nobody wrote down is a default nobody defends.
    Color.configure({ types: ['textStyle'] }),
    Placeholder.configure({ placeholder }),
  ];
}

/**
 * ── THE BLURB'S SET: PARAGRAPH, HARD BREAK, BOLD, ITALIC, LINK ────────────
 *
 * A SECOND factory rather than an option on the one above, because the two
 * answer different questions. `richTextExtensions` answers "what may a
 * rich_text SECTION contain", and its answer is broad on purpose — headings,
 * lists, alignment, colour. This answers "what may a bundle's one-line
 * คำโปรย contain", and its answer is narrow: the field sits directly under a
 * package name on a card roughly 230px wide, so a heading or a bullet list in
 * it would render perfectly and be wrong.
 *
 * Folding both into one parameterised factory would put a mode switch in front
 * of the file whose whole subject is "exactly the contract, nothing more" — and
 * the contract differs between the two, so there would be two contracts behind
 * one name.
 *
 * ── WHAT IS SWITCHED OFF, AND WHY EACH ────────────────────────────────────
 * heading / bulletList / orderedList / listItem / blockquote / horizontalRule:
 *   block furniture with nowhere to go in a one-line sub-heading.
 * codeBlock: off here for the same reason it is off above — no walker renderer.
 * strike / code: NOT in the allowed mark set. They are switched off at the
 *   EXTENSION rather than merely left off the toolbar, because StarterKit binds
 *   keyboard shortcuts for them (Mod-Shift-S, Mod-e) — a toolbar that does not
 *   offer a mark an author can still type is the "looks right in the editor,
 *   publishes wrong" failure this file exists to prevent.
 *
 * Not installed at all: Underline, Image, TextAlign, TextStyle, Color. Each
 * emits something `lib/bundle/blurb.js`'s sanitiser would strip, so offering
 * them would be offering a formatting choice that silently does not survive.
 *
 * `Link` is configured EXACTLY as above — the same `safeUrl` allowlist, shared
 * with the walker and with the sanitiser, so the editor cannot accept a link
 * that renders as unlinked text.
 *
 * The sanitiser is still the authority on what gets stored. This set is what
 * stops an author authoring something it would throw away.
 */
export function blurbRichTextExtensions({ placeholder = 'คำโปรยสั้น ๆ ใต้ชื่อแพ็กเกจ' } = {}) {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      horizontalRule: false,
      codeBlock: false,
      strike: false,
      code: false,
    }),
    Link.configure({
      openOnClick: false,
      isAllowedUri: (url) => Boolean(safeUrl(url)),
      shouldAutoLink: (url) => Boolean(safeUrl(url)),
    }),
    Placeholder.configure({ placeholder }),
  ];
}
