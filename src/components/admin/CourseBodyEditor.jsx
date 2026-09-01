'use client';

import { useEffect, useRef, useState } from 'react';
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

/**
 * The course rich body editor — a controlled Tiptap editor for
 * `CourseExtension.descriptionRich`.
 *
 * ══ THE CONTROLLED-ON-OUTPUT CONTRACT ═══════════════════════════════════════
 * Same shape as `TopicBulletsEditor`: `value` in, `onChange(html)` out, and a
 * re-seed effect that only fires when the value changed EXTERNALLY and the
 * editor is not focused — copied from that component along with its reason,
 * which is copied from `SimpleRichTextEditor` before it: the editor owns its
 * own document, and re-seeding on every render would delete whatever the
 * admin is mid-typing.
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

  const editor = useEditor({
    extensions: courseBodyEditorExtensions({
      placeholder,
      // Same contract as ArticleForm's onEditImage: opens the existing image's
      // properties. The node view selects the image itself before calling
      // this, so the modal's updateAttributes on confirm lands on it.
      onEditImage: (attrs) => {
        setImgAlt(attrs.alt ?? '');
        setImgWidth(attrs.width ?? '');
        setImgModal({ url: attrs.src, mode: 'edit' });
      },
    }),
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'course-body-editor article-content prose prose-sm dark:prose-invert max-w-none min-h-[300px] focus:outline-none px-4 py-3',
      },
      // Double-click reopens the properties modal for an already-inserted
      // image — the only way back into it besides the toolbar's own upload.
      // Copied from ArticleForm.jsx, same reasoning: a BubbleMenu would add a
      // second floating-position/z-index system for one control.
      handleDoubleClickOn: (view, pos, node, nodePos) => {
        if (node.type.name !== 'image') return false;
        view.dispatch(
          view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)),
        );
        setImgAlt(node.attrs.alt ?? '');
        setImgWidth(node.attrs.width ?? '');
        setImgModal({ url: node.attrs.src, mode: 'edit' });
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    // Required: this sits inside a form Next renders on the server first.
    immediatelyRender: false,
  });

  /**
   * Re-seed only when the value changed EXTERNALLY and the editor is not
   * focused — see the module header. `setContent(…, false)` suppresses the
   * update event so seeding does not fire `onChange` and false-dirty the
   * unsaved-changes guard on mount.
   */
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if ((value ?? '') !== current) editor.commands.setContent(value ?? '', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

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
