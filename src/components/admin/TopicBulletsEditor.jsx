'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  Code as CodeIcon,
  Link as LinkIcon,
  List,
  IndentIncrease,
  IndentDecrease,
} from 'lucide-react';
import { topicEditorExtensions, canIndentSelection } from '@/components/admin/topicEditorExtensions';
import { MAX_TOPIC_DEPTH } from '@/lib/courses/topicHtml';

/**
 * ONE ROW's rich bullets. Bullet lists only, three levels, no source view.
 *
 * ══ WHY THIS IS NOT SimpleRichTextEditor WITH FEWER BUTTONS ════════════════
 *
 * SimpleRichTextEditor is the right BASE — same Tiptap shape, same
 * controlled-on-output contract, same re-seed-when-not-focused effect — and it
 * is what this was built from. It is not the right COMPONENT, because its
 * extension set is chosen for prose: headings, alignment, colour, ordered
 * lists. Every one of those is either dropped by `sanitizeTopicHtml` or
 * actively wrong inside an `<li>`, and an editor that offers a button whose
 * effect the store discards is a way to lose work by using the product as
 * designed.
 *
 * The extension set therefore lives in `topicEditorExtensions` and is checked
 * against the sanitiser allow-list by a test that runs.
 *
 * ══ THE TOOLBAR IS `{ editor }`-ONLY ═══════════════════════════════════════
 *
 * Borrowed from ArticleForm's `EditorToolbar` (ArticleForm.jsx:1866): the
 * toolbar takes the editor and nothing else, so it holds no state that could
 * disagree with the document. `onMouseDown` preventDefault is load-bearing and
 * is copied deliberately — without it, pressing a toolbar button blurs the
 * editor, the selection collapses, and the mark applies to nothing.
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

function TopicToolbar({ editor }) {
  if (!editor) {
    return (
      <div className="h-9 rounded-t-9e-md border-b border-[var(--surface-border)] bg-9e-ice/50 dark:bg-[#0D1B2A]/40" />
    );
  }
  const chain = () => editor.chain().focus();

  function handleSetLink() {
    const prev = editor.getAttributes('link')?.href ?? '';
    // eslint-disable-next-line no-alert
    const url = window.prompt('ลิงก์ URL (http, https หรือ mailto เท่านั้น)', prev);
    if (url === null) return;
    if (url === '') {
      chain().unsetLink().run();
      return;
    }
    chain().extendMarkRange('link').setLink({ href: url }).run();
  }

  /**
   * THE INDENT BUTTON READS THE SAME RULE THE TAB KEY DOES.
   *
   * `canIndentSelection` is the one the depth lock uses. A button that computed
   * its own idea of "too deep" would be a second cap, and the two would drift
   * the first time `MAX_TOPIC_DEPTH` moved. Disabled rather than hidden, so the
   * cap is visible as a cap rather than as a key that mysteriously stops
   * working.
   */
  const canIndent = canIndentSelection(editor);

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-9e-md border-b border-[var(--surface-border)] bg-9e-ice/50 px-2 py-1 dark:bg-[#0D1B2A]/40">
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

      <ToolbarButton title="หัวข้อย่อย" onClick={() => chain().toggleBulletList().run()} active={editor.isActive('bulletList')}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title={canIndent ? 'เพิ่มระดับ (Tab)' : `ลึกได้สูงสุด ${MAX_TOPIC_DEPTH} ระดับ`}
        onClick={() => chain().sinkListItem('listItem').run()}
        disabled={!canIndent}
      >
        <IndentIncrease className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="ลดระดับ (Shift+Tab)"
        onClick={() => chain().liftListItem('listItem').run()}
        disabled={!editor.isActive('listItem')}
      >
        <IndentDecrease className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

/**
 * @param {object}   props
 * @param {string}   props.value          this row's HTML ('' for a bullet-less row)
 * @param {Function} props.onChange       called with the editor's HTML on every edit
 * @param {string}   [props.placeholder]
 */
export function TopicBulletsEditor({ value = '', onChange, placeholder }) {
  const editor = useEditor({
    extensions: topicEditorExtensions(placeholder ? { placeholder } : undefined),
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'topic-editor-body min-h-[72px] focus:outline-none px-3 py-2 text-sm',
      },
    },
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    /**
     * REQUIRED. Tiptap renders to the DOM on creation and this component sits
     * inside a form Next renders on the server first; without it the editor
     * throws during SSR. The same setting SimpleRichTextEditor carries.
     */
    immediatelyRender: false,
  });

  /**
   * Re-seed only when the value changed EXTERNALLY and the editor is not
   * focused. Copied from SimpleRichTextEditor along with its reason: the editor
   * owns its document, and re-seeding on every render would delete whatever the
   * admin is in the middle of typing.
   *
   * `setContent(…, false)` — the `false` SUPPRESSES the update event. Omitted,
   * seeding would fire `onUpdate`, the parent state would change on mount, and
   * the unsaved-changes baseline (snapshotted a frame later) would make every
   * page load look edited. That is the exact false positive courseFormDirty
   * exists to prevent.
   */
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if ((value ?? '') !== current) editor.commands.setContent(value ?? '', false);
    // `value` only. Re-running on `onChange` identity would re-seed mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
      <TopicToolbar editor={editor} />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="px-3 py-2 text-sm text-9e-slate-dp-50">กำลังโหลดตัวแก้ไข…</div>
      )}
    </div>
  );
}
