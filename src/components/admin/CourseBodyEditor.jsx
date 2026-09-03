'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  Strikethrough, Code as CodeIcon, Link as LinkIcon,
  Heading2, Heading3, Heading4, Pilcrow,
  List, ListOrdered, Quote, Minus,
  Image as ImageIcon, Table as TableIcon, Film as YoutubeIcon,
  Undo2, Redo2,
} from 'lucide-react';
import { imageModalAttrs } from '@/lib/editor/resizableImage';
import { courseBodyEditorExtensions } from './courseBodyEditorExtensions';

/** Static — `editorProps.attributes.class` never varies with props/state. */
const EDITOR_CONTENT_CLASS =
  'course-body-editor article-content prose prose-sm dark:prose-invert max-w-none min-h-[300px] focus:outline-none px-4 py-3';

/**
 * The course rich body editor — a controlled Tiptap editor for
 * `CourseExtension.descriptionRich`.
 *
 * ══ ONE-WAY DATA FLOW: `value` SEEDS, IT NEVER RE-SEEDS ════════════════════
 * `value` in, `onChange(html)` out — but `value` is only ever READ ONCE, at
 * editor creation (`content: value ?? ''`, below). This editor never
 * compares a later `value` against its own live document and never calls
 * `setContent` after mount.
 *
 * That used to be different: a `useEffect` re-seeded the document whenever
 * `value` changed and the editor was not focused. REPORTED BUG: type several
 * lines, click the empty area below the text, and the typed content
 * reverted — as if undone, every time.
 *
 * `editor.isFocused` was standing in for a claim it cannot actually prove —
 * "this incoming value is not what I myself just produced". A React prop
 * update from `setState` is not synchronous with the DOM transaction that
 * triggered it (React schedules the re-render; the transaction — and this
 * editor's own `onUpdate` — happens synchronously, in the same tick as the
 * keystroke). So `value` can legitimately still be reporting the PREVIOUS
 * line for the brief window before React commits. If focus is lost anywhere
 * in that window, the old guard read the still-catching-up prop as
 * "genuinely different" and overwrote the live document with it — discarding
 * whatever was typed after that prop's snapshot. `test/pure/
 * courseBodyEditorRevertBug.test.mjs` reproduces this exact input
 * combination against an independent transcription of the removed code and
 * shows it reverts; a value-vs-"what did I last emit" comparison was tried
 * first and is proven, in that same test file, to still revert in this
 * exact case — a stale prop does not equal EITHER the live document or the
 * last thing this editor emitted, so no value comparison closes the gap.
 *
 * The actual fix is not a smarter comparison, it is not needing one: the
 * document is seeded once, and a genuine external change (a different
 * course's rich body loading) is handled by giving `<CourseBodyEditor>` a
 * `key` in CourseForm.jsx — `key={initial?.course_id ?? 'create'}` — so
 * React fully remounts (a fresh editor, fresh document) rather than trying
 * to reconcile a live one. Every other CourseExtension rail field
 * (`urlAlias`, `metaTitle`, `gallery`, …) already assumes exactly this: each
 * is seeded once via `useState(extension?.field ?? …)`, relying on
 * CourseForm getting a fresh mount per course. This gives the rich body
 * editor the same guarantee explicitly, since it — unlike a plain
 * `<input>` — owns a live document a naive prop comparison cannot safely
 * reconcile against.
 *
 * `extensions`, `editorProps` and the image-edit callback are memoised
 * (`useMemo`/`useCallback`) rather than rebuilt inline on every render. Not
 * cosmetic, and not what fixes the revert, but a real, independently-worth-
 * fixing defect found while diagnosing it: Tiptap's `useEditor` re-checks
 * `compareOptions()` on every render regardless of its `deps` array, does a
 * per-element identity compare specifically for `extensions`, and calls
 * `editor.setOptions()` — which reapplies `editorProps` to the live DOM via
 * `view.setProps()` — whenever anything compares unequal. A fresh array/
 * object every render made that true on every keystroke: reapplying
 * attributes to a focused contenteditable on every render (verified against
 * the installed `@tiptap/react` source, `EditorInstanceManager.
 * compareOptions`/`onRender`) is unnecessary churn and a plausible
 * contributor to the reported focus loss in the first place, even though it
 * is not, on its own, what turns a focus loss into data loss — the removed
 * re-seed effect was.
 *
 * ══ THE TOOLBAR AND IMAGE MODAL ARE NEW JSX, NOT AN IMPORT — STATED WHY ═════
 * `docs/audit/course-rich-body.md`'s brief asked to reuse the article
 * editor's components rather than build a third editor from scratch.
 * ArticleForm's `EditorToolbar` and its image-properties modal are real
 * reusable PIECES — `ResizableImage`/`imageModalAttrs` (schema + attribute
 * contract), the `/api/admin/upload` endpoint, the Tiptap extension
 * packages — every one of them IS imported here rather than re-implemented.
 * What is not reusable is the JSX shell around them: `EditorToolbar` is a
 * ~150-line function local to ArticleForm.jsx, not exported, closed over
 * that form's own state (JSON-LD, character count, source-mode); the image
 * modal is inline JSX in the same file, not a component. Extracting either
 * into something both forms could import would mean refactoring a
 * currently-shipping, just-resanitised admin screen for a task that does not
 * otherwise touch it — out of scope here. So the toolbar button/divider and
 * the modal markup below are new, following the same precedent
 * `topicEditorExtensions.js`'s own toolbar set when it forked FROM
 * ArticleForm's toolbar a first time ("borrowed from ArticleForm's
 * EditorToolbar... the toolbar takes the editor and nothing else").
 */

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={
        'inline-flex h-7 w-7 items-center justify-center rounded-9e-sm transition-colors disabled:opacity-30 '
        + (active
          ? 'bg-9e-action text-white'
          : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
      }
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-[var(--surface-border)]" aria-hidden="true" />;
}

function CourseBodyToolbar({ editor, onImageUploaded }) {
  const imageInputRef = useRef(null);

  if (!editor) {
    return (
      <div className="h-10 rounded-t-9e-md border-b border-[var(--surface-border)] bg-9e-ice/50 dark:bg-[#0D1B2A]/40" />
    );
  }
  const chain = () => editor.chain().focus();

  async function handleImageUpload(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    // Its own subfolder, allowlisted alongside 'courses/covers' and
    // 'courses/galleries' — a course body image is neither of those.
    fd.append('folder', 'courses/body');
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed');
      onImageUploaded?.(data.url);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.message ?? 'อัปโหลดรูปไม่สำเร็จ');
    }
  }

  function handleSetLink() {
    const prev = editor.getAttributes('link')?.href ?? '';
    // eslint-disable-next-line no-alert
    const url = window.prompt('URL (http, https, mailto หรือ tel เท่านั้น)', prev);
    if (url === null) return;
    if (url === '') { chain().unsetLink().run(); return; }
    chain().extendMarkRange('link').setLink({ href: url }).run();
  }

  function handleInsertYoutube() {
    // eslint-disable-next-line no-alert
    const url = window.prompt('YouTube URL');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  }

  function handleInsertTable() {
    chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-9e-md border-b border-[var(--surface-border)] bg-9e-ice/50 px-2 py-1 dark:bg-[#0D1B2A]/40">
      <ToolbarButton title="Undo" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="ตัวหนา" onClick={() => chain().toggleBold().run()} active={editor.isActive('bold')}>
        <BoldIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="ตัวเอียง" onClick={() => chain().toggleItalic().run()} active={editor.isActive('italic')}>
        <ItalicIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="ขีดเส้นใต้" onClick={() => chain().toggleUnderline().run()} active={editor.isActive('underline')}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="ขีดฆ่า" onClick={() => chain().toggleStrike().run()} active={editor.isActive('strike')}>
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="โค้ด" onClick={() => chain().toggleCode().run()} active={editor.isActive('code')}>
        <CodeIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="ลิงก์" onClick={handleSetLink} active={editor.isActive('link')}>
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="ย่อหน้าปกติ" onClick={() => chain().setParagraph().run()} active={editor.isActive('paragraph')}>
        <Pilcrow className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="หัวข้อ 2" onClick={() => chain().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="หัวข้อ 3" onClick={() => chain().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="หัวข้อ 4" onClick={() => chain().toggleHeading({ level: 4 }).run()} active={editor.isActive('heading', { level: 4 })}>
        <Heading4 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="หัวข้อย่อย" onClick={() => chain().toggleBulletList().run()} active={editor.isActive('bulletList')}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="รายการลำดับเลข" onClick={() => chain().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Blockquote" onClick={() => chain().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="เส้นคั่น" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="แทรกรูปภาพ" onClick={() => imageInputRef.current?.click()}>
        <ImageIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // same file re-selected twice must still fire onChange
          handleImageUpload(file);
        }}
      />
      <ToolbarButton title="แทรกตาราง 3×3" onClick={handleInsertTable}>
        <TableIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="แทรก YouTube" onClick={handleInsertYoutube}>
        <YoutubeIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

/**
 * @param {object}   props
 * @param {string}   props.value      the stored HTML ('' for no rich body)
 * @param {Function} props.onChange   called with the editor's HTML on every edit
 * @param {string}   [props.placeholder]
 */
export function CourseBodyEditor({ value = '', onChange, placeholder }) {
  const [imgModal, setImgModal] = useState(null); // { url, mode: 'insert'|'edit' }
  const [imgAlt, setImgAlt] = useState('');
  const [imgWidth, setImgWidth] = useState('');

  // Stable across renders — only ever touches useState setters, which are
  // themselves stable. Memoised so `courseBodyEditorExtensions()` below does
  // not have to rebuild the whole extensions array (and every extension
  // instance in it) on every render — see the module header.
  const onEditImage = useCallback((attrs) => {
    setImgAlt(attrs.alt ?? '');
    setImgWidth(attrs.width ?? '');
    setImgModal({ url: attrs.src, mode: 'edit' });
  }, []);

  const extensions = useMemo(
    () => courseBodyEditorExtensions({ placeholder, onEditImage }),
    [placeholder, onEditImage]
  );

  // Double-click reopens the properties modal for an already-inserted image —
  // the only way back into it besides the toolbar's own upload. Copied from
  // ArticleForm.jsx, same reasoning: a BubbleMenu would add a second
  // floating-position/z-index system for one control.
  const handleDoubleClickOn = useCallback((view, pos, node, nodePos) => {
    if (node.type.name !== 'image') return false;
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)),
    );
    setImgAlt(node.attrs.alt ?? '');
    setImgWidth(node.attrs.width ?? '');
    setImgModal({ url: node.attrs.src, mode: 'edit' });
    return true;
  }, []);

  const editorProps = useMemo(
    () => ({
      attributes: { class: EDITOR_CONTENT_CLASS },
      handleDoubleClickOn,
    }),
    [handleDoubleClickOn]
  );

  const editor = useEditor({
    extensions,
    // Seeds the document ONCE, at creation — see the module header for why
    // this editor no longer tries to reconcile a live document against this
    // prop on every render. `value` is read again only by the caller, via
    // `onChange`; this editor never reads it back a second time.
    content: value ?? '',
    editorProps,
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    // Required: this sits inside a form Next renders on the server first.
    immediatelyRender: false,
  });

  function confirmImageModal() {
    if (!editor || !imgModal) return;
    const attrs = imageModalAttrs({
      mode: imgModal.mode,
      src: imgModal.url,
      alt: imgAlt,
      width: imgWidth,
    });
    if (imgModal.mode === 'edit') {
      editor.chain().focus().updateAttributes('image', attrs).run();
    } else {
      editor.chain().focus().setImage(attrs).run();
    }
    setImgModal(null);
  }

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
      <CourseBodyToolbar
        editor={editor}
        onImageUploaded={(url) => {
          setImgAlt('');
          setImgWidth('');
          setImgModal({ url, mode: 'insert' });
        }}
      />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="px-4 py-3 text-sm text-9e-slate-dp-50">กำลังโหลดตัวแก้ไข…</div>
      )}

      {imgModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-9e-md bg-white p-4 shadow-lg dark:bg-[#111d2c]">
            <h3 className="mb-3 text-sm font-bold text-9e-navy dark:text-white">
              {imgModal.mode === 'edit' ? 'แก้ไขรูปภาพ' : 'คุณสมบัติรูปภาพ'}
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgModal.url}
              alt=""
              className="mb-3 max-h-40 w-full rounded-9e-sm object-contain"
            />
            <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              Alt text
              <input
                type="text"
                value={imgAlt}
                onChange={(e) => setImgAlt(e.target.value)}
                className="mt-1 w-full rounded-9e-sm border border-[var(--surface-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="mb-4 block text-xs font-medium text-[var(--text-secondary)]">
              ความกว้าง (เช่น 400px หรือ 100%)
              <input
                type="text"
                value={imgWidth}
                onChange={(e) => setImgWidth(e.target.value)}
                placeholder="ปล่อยว่างเพื่อใช้ขนาดต้นฉบับ"
                className="mt-1 w-full rounded-9e-sm border border-[var(--surface-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImgModal(null)}
                className="rounded-9e-sm px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmImageModal}
                className="rounded-9e-sm bg-9e-action px-3 py-1.5 text-sm font-bold text-white hover:bg-9e-brand"
              >
                {imgModal.mode === 'edit' ? 'บันทึกการแก้ไข' : 'แทรกรูปภาพ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
