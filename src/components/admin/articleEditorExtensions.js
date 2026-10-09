import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapLink from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import CharacterCount from '@tiptap/extension-character-count';
import { ResizableImage } from '@/lib/editor/resizableImage';
import { YoutubeEmbed } from '@/lib/editor/youtubeEmbed';

/**
 * The article body editor's Tiptap extension set.
 *
 * ── WHY THIS IS A MODULE AND NOT A LITERAL INSIDE ArticleForm ──────────────
 * It was a literal inside `useEditor({ extensions: [...] })` in
 * ArticleForm.jsx, which made the editor's SCHEMA unreachable from a test: the
 * list lived inside a React hook call in a `'use client'` component, so the
 * only way to ask "does this editor keep a stored video?" was to open the
 * screen in a browser and look. It did not keep it, for six weeks, and nothing
 * went red — see lib/editor/youtubeEmbed.js for the full diagnosis.
 *
 * Extracted verbatim, in the same order, with the same configuration. The ONE
 * substantive change in the extraction is `YoutubeEmbed` in place of stock
 * `Youtube` (same `configure` arguments); everything else is the same objects
 * with the same options. The two siblings this now sits beside —
 * `courseBodyEditorExtensions.js` and `topicEditorExtensions.js` — exist for
 * exactly this reason, and this file is the third.
 *
 * `getSchema(articleEditorExtensions())` is now a callable question, and
 * test/pure/articleEditorEmbedRoundTrip.test.mjs asks it of every embed shape
 * the stored corpus actually holds.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ───────────────────────────────────────
 * `editorProps` (the `article-content prose …` class string and
 * `handleDoubleClickOn` for the image modal) stays in ArticleForm: it is DOM
 * and React-state wiring, not schema, and nothing about it can be asked of a
 * schema. The split is "what the document may contain" here, "how the editing
 * surface behaves" there.
 *
 * ── HEADING LEVELS STAY [1, 2, 3, 4] ──────────────────────────────────────
 * Not widened and not narrowed by this extraction. `sanitizeRichHtml`'s `rich`
 * profile allows h2/h3/h4 only, so an h1 authored here is unwrapped at save —
 * a pre-existing mismatch that `courseBodyEditorExtensions.js` already
 * documents and resolves the other way (`levels: [2, 3, 4]`). Changing it is a
 * decision about this editor's toolbar (which offers an H1 button) and belongs
 * to whoever takes that decision, not to a commit about embedded video.
 *
 * @param {object}   [opts]
 * @param {string}   [opts.placeholder]
 * @param {Function} [opts.onEditImage] wired to `ResizableImage`'s node-view
 *   edit button — called with `{ src, alt, width }` when the admin opens an
 *   already-inserted image's properties. Supplying no opener is what keeps the
 *   button out of an editor that has no image modal, so this stays optional.
 */
export function articleEditorExtensions({
  placeholder = 'เริ่มเขียนเนื้อหาที่นี่…',
  onEditImage,
} = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
    }),
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    // openOnClick: false stops the editor from following links on
    // single-click — admins expect clicks to place the cursor.
    TiptapLink.configure({ openOnClick: false, autolink: true }),
    ResizableImage.configure({
      inline: false,
      allowBase64: false,
      onEditImage,
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    YoutubeEmbed.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
    CharacterCount,
  ];
}
