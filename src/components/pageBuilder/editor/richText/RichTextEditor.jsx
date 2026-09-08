'use client';

import { useEditor as useTiptap, EditorContent } from '@tiptap/react';
import { toPlainJson } from '@/lib/plainValue';
import { useCallback, useEffect, useMemo } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  List, ListOrdered, Quote, Minus, Link2, Link2Off,
  // Round B commit 1 — ADDED beside the names above rather than folded into
  // them, the standing rule in this directory.
  AlignLeft, AlignCenter, AlignRight, Eraser,
  // Round B commit 2 — likewise added rather than folded in.
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUrl } from '@/lib/pageBuilder/safeUrl';
// ADDED beside the statement above rather than folded into it. The picker's
// starting position is DERIVED from the pinned navy triple, never typed here —
// round 30's ban is on a colour decided in source, and this file decides none.
import { COLOR_INPUT_FALLBACK } from '@/lib/pageBuilder/customColor';
import { richTextExtensions } from './tiptapExtensions';

/**
 * The rich_text content editor.
 *
 * It takes its extension list from tiptapExtensions.js and does NOT assemble
 * one here. That indirection is the whole safety property: the extension set is
 * verified against the server walker's node/mark contract
 * (lib/pageBuilder/richTextContract.js), and a toolbar that reached for an
 * extension directly would author content the walker silently degrades — an
 * unknown block unwrapped to naked text, an unknown mark dropped. Every button
 * below commands a node/mark that is already in the contract; adding a button
 * for anything else means adding it to the contract and the walker first.
 *
 * Tiptap's own hook is `useEditor`, which collides with this project's
 * EditorProvider hook of the same name — aliased to `useTiptap` so a reader
 * never has to wonder which editor is meant.
 */

/**
 * ── onMouseDown preventDefault IS NOT OPTIONAL ON A TIPTAP TOOLBAR ────────
 * Round 55, and a SEPARATE finding from the bug that round fixed — the label
 * capture in SectionContentEditor was the cause of the reported symptoms; this
 * is a second defect found while tracing it, and it is stated separately rather
 * than folded in.
 *
 * Pressing a toolbar button moves focus out of the contenteditable, and the
 * browser collapses the selection when it does. `onClick` then runs against an
 * editor that no longer has the range the author had selected, so
 * `chain().focus().toggleBold()` re-focuses and applies the mark to a collapsed
 * cursor instead of to the words that were highlighted.
 *
 * Cancelling the default action of MOUSEDOWN is what keeps the selection: the
 * button never takes focus, so nothing is stolen, and the click still fires.
 * This is the standard requirement for a ProseMirror/Tiptap toolbar and it was
 * missing here.
 */
function ToolButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'rounded p-1 text-9e-slate-dp-50 transition-colors',
        'hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-9e-navy dark:hover:text-white',
        'disabled:pointer-events-none disabled:opacity-30',
        active && 'bg-9e-action/10 text-9e-action'
      )}
    >
      {children}
    </button>
  );
}

const HEADING_LEVELS = [2, 3, 4];

/**
 * ── ROUND B: THE ALIGNMENT BUTTONS ──────────────────────────────────────
 * The three values the walker has a class for and the extension is configured
 * to accept — no `justify`, because the walker would drop it and the author
 * would get a button that publishes nothing.
 *
 * The fourth control is a CLEAR, not a fourth value, and that distinction is
 * the round's whole byte-identity property: `unsetTextAlign` removes the
 * attribute, so a paragraph the author aligned and then cleared renders exactly
 * like one they never touched. A "left" button cannot do that — it stores
 * `left`, which is a decision, and the walker emits `text-left` for it.
 */
const ALIGN_BUTTONS = [
  { value: 'left', label: 'ชิดซ้าย', Icon: AlignLeft },
  { value: 'center', label: 'กึ่งกลาง', Icon: AlignCenter },
  { value: 'right', label: 'ชิดขวา', Icon: AlignRight },
];

export function RichTextEditor({ doc, onChange, placeholder }) {
  const extensions = useMemo(() => richTextExtensions({ placeholder }), [placeholder]);

  const editor = useTiptap({
    extensions,
    content: doc ?? { type: 'doc', content: [] },
    // Next SSRs client components; without this Tiptap warns about a hydration
    // mismatch it causes itself.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        /**
         * ── ROUND 60: THE SAME SPACING SET AS THE RENDERER ────────────────
         * The input keeps `prose-sm` — a compact editing box is deliberate and
         * this round is spacing, not size — but it must not disagree with the
         * published page about how far apart paragraphs and bullets sit, or the
         * author is composing against the wrong rhythm.
         *
         * Measured before the change, the input had the same list defect for the
         * same reason as the renderer: Tiptap wraps each item's text in a `<p>`
         * that is both :first-child and :last-child, so typography's
         * `> ul > li > p:first-child` and `:last-child` rules both fired and
         * every bullet sat a full paragraph apart (16px at prose-sm, matching
         * the paragraph gap exactly). See sections/rich_text.jsx for the full
         * cascade and scripts/_probe-round60-prose-spacing.mjs for the numbers.
         *
         * The utilities are identical to the renderer's, so the two surfaces are
         * changed by one decision rather than two that have to be kept in step.
         */
        /**
         * ── ROUND 65: THE INPUT KEEPS prose-sm, AND NOW IT MEANS SOMETHING ─
         * The renderer moved to `prose-sm md:prose-base` — 14px below 768px,
         * 16px above. This input does NOT follow it up, and the reason is a
         * measurement rather than a preference:
         *
         *   EditorShell  lg:grid-cols-[276px_1fr_330px]
         *
         * The settings panel is a FIXED 330px column. Its width does not track
         * the viewport, so a `md:` query — which reads the BROWSER's width —
         * would put 16px body text in a 330px box on every desktop, and would
         * drop it back to 14px if the author narrowed the window even though
         * the panel had not moved at all. It would be responsive to the wrong
         * thing. The canvas can carry the query honestly because it is an
         * iframe whose own width IS the previewed viewport; a side panel is not
         * a viewport.
         *
         * What this round DOES fix is the thing round 60 could only note: the
         * input was 14px against an 18px canvas, and now it is 14px against a
         * canvas whose narrow half is also 14px. The compact box is no longer a
         * compromise — it is exactly the mobile rendering.
         *
         * So the spacing follows the MOBILE half of the renderer's set: `my-3`,
         * with no `md:` overrides, because this surface has no wide mode to
         * override into. The two lists are checked against each other in
         * test/render/richTextSpacing.
         */
        class: 'prose prose-sm max-w-none focus:outline-none dark:prose-invert min-h-[8rem] '
          + 'prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 [&_li>p]:my-0 '
          + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      },
    },
    /**
     * ── ROUND 68: getJSON() IS NOT PLAIN JSON, DESPITE THE NAME ──────────
     *
     * ProseMirror builds every node's attributes with `Object.create(null)`,
     * and `Node.toJSON()` hands that same object straight out — so a document
     * from `getJSON()` carries NULL-PROTOTYPE `attrs` objects. React's client
     * encoder refuses one: measured, a null-prototype object encodes as `"$T"`
     * (a temporary reference) where a plain `{}` encodes normally. The server
     * then decodes `"$T"` into a Proxy that throws on almost any property, and
     * the first thing to read it is Mongoose's `isBsonType` — which is why
     * three rounds chased the word `_bsontype` for a problem that has nothing
     * to do with MongoDB.
     *
     * Only three nodes in this schema declared attributes — heading, image and
     * orderedList — and a node with none omits the key entirely. That is why
     * documents of paragraphs and bullet lists saved for months and the first
     * heading broke it. Measured: 10 stored rich_text documents, ZERO nodes
     * carrying an `attrs` key.
     *
     * THAT IS NOW FOUR, AND THE FOURTH IS `paragraph` (round B). TextAlign
     * hangs `textAlign` on paragraph and heading, so the commonest node in
     * every document is attrs-bearing from this round on and the sentence above
     * describes a window that has closed. Nothing about the fix changes —
     * `toPlainJson` normalises whatever it is handed, so it covered this before
     * the extension arrived — but the reassurance did, and a stale one next to
     * a bug this expensive is worse than none. test/pure/richTextPlainJson
     * reads the attrs-bearing set off the generated schema rather than a hand
     * list, which is why it turned red here and got considered.
     *
     * `toPlainJson` rewrites the prototype and NOTHING else — no key added or
     * removed, no value changed, `undefined` preserved (which a JSON round trip
     * would drop). It is deliberately not in the extension declarations: the
     * whole generated schema has ZERO non-plain attribute defaults, so no
     * declaration is wrong — the prototype comes from ProseMirror core, below
     * every extension. And it is not a content sanitiser; richTextContract.js
     * owns what a document may contain, and this changes none of it.
     */
    onUpdate: ({ editor: ed }) => onChange(toPlainJson(ed.getJSON())),
  });

  // The section tree is the source of truth: selecting a different rich_text
  // section must re-seed this editor. Guard on identity — writing the doc back
  // while the user is typing would fight the caret on every keystroke.
  useEffect(() => {
    if (!editor || !doc) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(doc)) {
      editor.commands.setContent(doc, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link')?.href ?? '';
    const input = window.prompt('URL (http/https/mailto/tel, /path หรือ #anchor)', prev);
    if (input === null) return;             // cancelled
    if (input === '') { editor.chain().focus().unsetLink().run(); return; }
    // Same allowlist the walker enforces at render. Without this the author
    // would set a link that renders as unlinked text and never learn why.
    if (!safeUrl(input)) {
      window.alert('URL นี้ใช้ไม่ได้ — รองรับ http, https, mailto, tel, /path และ #anchor เท่านั้น');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: input }).run();
  }, [editor]);

  if (!editor) return null;

  const can = editor.can().chain().focus();

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--surface-border)] p-1">
        <ToolButton label="ตัวหนา" active={editor.isActive('bold')} disabled={!can.toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="ตัวเอียง" active={editor.isActive('italic')} disabled={!can.toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="ขีดเส้นใต้" active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="ขีดฆ่า" active={editor.isActive('strike')} disabled={!can.toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="โค้ด" active={editor.isActive('code')} disabled={!can.toggleCode().run()}
          onClick={() => editor.chain().focus().toggleCode().run()}><Code className="h-3.5 w-3.5" /></ToolButton>

        <span className="mx-1 h-4 w-px bg-[var(--surface-border)]" />

        {HEADING_LEVELS.map((level) => (
          <ToolButton key={level} label={`หัวข้อ H${level}`} active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}>
            <span className="px-0.5 text-[10px] font-bold">H{level}</span>
          </ToolButton>
        ))}

        <span className="mx-1 h-4 w-px bg-[var(--surface-border)]" />

        {ALIGN_BUTTONS.map(({ value, label, Icon }) => (
          <ToolButton key={value} label={label} active={editor.isActive({ textAlign: value })}
            onClick={() => editor.chain().focus().setTextAlign(value).run()}>
            <Icon className="h-3.5 w-3.5" />
          </ToolButton>
        ))}
        {/**
          * ล้างการจัดวาง — removes the attribute rather than setting it to
          * 'left'. Disabled when there is nothing to clear, so the button says
          * whether the block carries an alignment at all; `isActive` with no
          * value is not a thing, so the three values are asked one by one.
          */}
        <ToolButton label="ล้างการจัดวาง"
          disabled={!ALIGN_BUTTONS.some(({ value }) => editor.isActive({ textAlign: value }))}
          onClick={() => editor.chain().focus().unsetTextAlign().run()}>
          <Eraser className="h-3.5 w-3.5" />
        </ToolButton>

        <span className="mx-1 h-4 w-px bg-[var(--surface-border)]" />

        <ToolButton label="รายการหัวข้อ" active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="รายการตัวเลข" active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="ยกคำพูด" active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="เส้นคั่น"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolButton>

        <span className="mx-1 h-4 w-px bg-[var(--surface-border)]" />

        {/**
          * ── THE ONE CONTROL ON THIS TOOLBAR THAT MUST NOT preventDefault ──
          * Every button above cancels mousedown to keep the author's selection
          * (see the block at the top of this file). An `<input type="color">`
          * cannot: cancelling its mousedown is exactly what stops the native
          * picker opening, so the control would be inert. It takes focus, and
          * the selection is restored from ProseMirror's own state by
          * `chain().focus()` when the value comes back — which is Tiptap's
          * documented pattern for this element, not a workaround invented here.
          * Stated rather than left as an inconsistency a reader would "fix".
          *
          * ── THE HINT IS THE DARK-MODE DECISION, IN THAI, HERE ─────────────
          * An author's ink is used VERBATIM in both themes and no dark
          * counterpart is derived — round 79's derivation is for a SURFACE,
          * where the theme owns the text on top of it; deriving an author's
          * text colour would repaint the exact thing they chose. A control that
          * behaves differently in one theme without saying so is the defect
          * this repo keeps removing, so it says so at the point of choosing.
          */}
        <input
          type="color"
          aria-label="สีตัวอักษร"
          title="สีตัวอักษร — ใช้สีนี้เหมือนกันทั้งโหมดสว่างและโหมดมืด"
          value={editor.getAttributes('textStyle')?.color || COLOR_INPUT_FALLBACK}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="h-6 w-7 shrink-0 cursor-pointer rounded border border-[var(--surface-border)] bg-[var(--surface)] p-0.5"
        />
        <ToolButton label="ล้างสี" disabled={!editor.getAttributes('textStyle')?.color}
          onClick={() => editor.chain().focus().unsetColor().run()}><Ban className="h-3.5 w-3.5" /></ToolButton>

        <span className="mx-1 h-4 w-px bg-[var(--surface-border)]" />

        <ToolButton label="ลิงก์" active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="ลบลิงก์" disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}><Link2Off className="h-3.5 w-3.5" /></ToolButton>
      </div>

      <div className="p-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
