'use client';

import { useEditor as useTiptap, EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useMemo } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  List, ListOrdered, Quote, Minus, Link2, Link2Off,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUrl } from '@/lib/pageBuilder/safeUrl';
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

function ToolButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded p-1 text-9e-slate-dp-50 transition-colors',
        'hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#0D1B2A] dark:hover:text-white',
        'disabled:pointer-events-none disabled:opacity-30',
        active && 'bg-9e-action/10 text-9e-action'
      )}
    >
      {children}
    </button>
  );
}

const HEADING_LEVELS = [2, 3, 4];

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
        class: 'prose prose-sm max-w-none focus:outline-none dark:prose-invert min-h-[8rem]',
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON()),
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

        <ToolButton label="รายการหัวข้อ" active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="รายการตัวเลข" active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="ยกคำพูด" active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></ToolButton>
        <ToolButton label="เส้นคั่น"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolButton>

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
