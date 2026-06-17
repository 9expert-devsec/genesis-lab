'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapLink from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

/**
 * Stripped-down Tiptap editor for short rich-text fields (course
 * description, local FAQ answers). Same core extension set as the
 * Article editor but without Image/Table/Youtube/Sub/Sup/CharacterCount.
 *
 * Controlled-on-output: emits HTML through `onChange`. `value` seeds the
 * initial content; it is not re-synced on every keystroke (the editor
 * owns its own document) but is synced if it changes externally while
 * the editor is not focused — needed when an edit form loads async data.
 */
function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
        active
          ? 'bg-9e-action text-white'
          : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-[var(--surface-border)]" />;
}

export function SimpleRichTextEditor({ value = '', onChange, placeholder = 'พิมพ์เนื้อหา…' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[160px] focus:outline-none px-3 py-2',
      },
    },
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    immediatelyRender: false,
  });

  // Re-seed the editor when `value` changes externally (e.g. switching
  // which FAQ is being edited) and the editor isn't focused, so we don't
  // clobber the admin's in-progress typing.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if ((value ?? '') !== current) {
      editor.commands.setContent(value ?? '', false);
    }
  }, [value, editor]);

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes('link')?.href ?? '';
    const url = window.prompt('ลิงก์ URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  if (!editor) {
    return (
      <div className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-slate-dp-50 dark:bg-[#0D1B2A]">
        กำลังโหลดตัวแก้ไข…
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--surface-border)] px-2 py-1.5">
        <ToolbarButton title="Bold" onClick={() => chain().toggleBold().run()} active={editor.isActive('bold')}>
          <BoldIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => chain().toggleItalic().run()} active={editor.isActive('italic')}>
          <ItalicIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => chain().toggleUnderline().run()} active={editor.isActive('underline')}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="Heading 2" onClick={() => chain().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 3" onClick={() => chain().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="Bullet List" onClick={() => chain().toggleBulletList().run()} active={editor.isActive('bulletList')}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Ordered List" onClick={() => chain().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="Link" onClick={setLink} active={editor.isActive('link')}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="Align Left" onClick={() => chain().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align Center" onClick={() => chain().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align Right" onClick={() => chain().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}>
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
