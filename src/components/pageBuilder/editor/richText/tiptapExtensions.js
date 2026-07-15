'use client';

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
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
 * Youtube, Subscript, Superscript, TextStyle, Color, TextAlign. Every one of
 * them emits a node/mark the walker drops or degrades. TextAlign is the
 * sneakiest — it is neither a node nor a mark but an ATTRIBUTE on
 * paragraph/heading, so getSchema would NOT catch it: the schema still reads
 * `paragraph`, and alignment vanishes at publish with the contract check green.
 * It stays out by decision, not by test.
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
    Placeholder.configure({ placeholder }),
  ];
}
