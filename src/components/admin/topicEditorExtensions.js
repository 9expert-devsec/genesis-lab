import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import ListItem from '@tiptap/extension-list-item';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { bulletListDepthAt, canNestDeeper } from '@/lib/courses/topicEditorContract';

/**
 * The section-7 bullet editor's Tiptap extension set.
 *
 * Built to produce EXACTLY the node/mark contract in
 * lib/courses/topicEditorContract.js, which is checked — by a test that runs,
 * not by this comment — against `sanitizeTopicHtml`'s allow-list. Anything this
 * set can emit that the sanitiser strips is a way to author a bullet that looks
 * right in the form and reaches the page as something else.
 *
 * ══ WHAT IS SWITCHED OFF, AND WHY ══════════════════════════════════════════
 *
 * StarterKit ships all of these ON. Each is off for a stated reason, not for
 * tidiness:
 *
 *   orderedList   THE ROWS ARE ALREADY NUMBERED. CourseOutline renders each
 *                 row's heading as `{i + 1}. {title}`, and EXCEL-HR-02 already
 *                 reads "1. 1. …" on the live site because three of its titles
 *                 were hand-numbered on top of that. An ordered list inside the
 *                 panel would add a third numbering scheme to a section that
 *                 cannot keep two straight. Also settled for this round.
 *   heading       `<h2>`/`<h3>` open a block box inside an `<li>` — invalid
 *                 nesting the browser reflows out of the list, and the
 *                 accordion body is a grid track that would simply grow.
 *                 sanitizeTopicHtml's header has the full reasoning.
 *   blockquote    same block-box problem.
 *   horizontalRule same, and meaningless inside a bullet.
 *   codeBlock     same. The `code` MARK stays — inline code in a bullet is
 *                 real (`List<mailmessage>` is the kind of thing it is for).
 *
 * NOT INSTALLED AT ALL, and deliberately: Image, Table*, Youtube, TextAlign,
 * TextStyle, Color, Subscript, Superscript. The sanitiser would drop every one
 * of them, and TextAlign is the one that would slip past a schema check —
 * it is an ATTRIBUTE on paragraph, not a node or a mark, so `getSchema` still
 * reads `paragraph` and the alignment vanishes at save with the contract green.
 * It stays out by decision, and that decision is written here because no test
 * can catch it.
 *
 * NO SOURCE VIEW. ArticleForm has one; this must not. A raw-HTML box is a way
 * to put bytes into the field that the editor's own schema never approved,
 * which is the single thing this contract exists to prevent.
 */

/**
 * `listItem` narrowed to `paragraph+ bulletList*` — one or more paragraphs,
 * then nested lists only. NOT `paragraph block*` (Tiptap's default, which
 * additionally admits headings, code blocks and the like); this editor has
 * none of those registered anyway, but `bulletList*` still states "a nested
 * list is the only child a bullet may carry" where the schema can enforce it,
 * the same "bullet lists only" rule the disabled extensions above express.
 *
 * ══ WAS `paragraph` (EXACTLY ONE) — WIDENED TO `paragraph+`, ON EVIDENCE ═══
 * A single required paragraph reads as the obviously-correct guard against
 * `<li><p>a</p><p>b</p></li>` sanitising to `<li>ab</li>` (the sanitiser
 * UNWRAPS `<p>` — see sanitizeTopicHtml.js). It also broke
 * `toggleBulletList` on a MULTI-paragraph selection: selecting three lines
 * and pressing the bullet button wrapped only the first, silently. Measured
 * directly (not inferred) against the real extension set, in a real
 * ProseMirror document, before this was touched — `editor.chain().focus()
 * .toggleBulletList().run()` returned `false` and changed NOTHING for a
 * 2-or-3-paragraph selection under the single-paragraph spec, and correctly
 * wrapped every paragraph into its own `<li>` once relaxed to `paragraph+`,
 * matching CourseBodyEditor's stock-`ListItem` behaviour exactly. The cause:
 * ProseMirror's wrap-then-split algorithm for a multi-block wrap
 * (`doWrapInList`, prosemirror-schema-list) wraps the whole selection in ONE
 * `<li>` first, then SPLITS it back apart at each paragraph boundary — and a
 * split only succeeds when every resulting fragment independently satisfies
 * the content expression. A one-paragraph-only spec can never validate a
 * remainder holding two or more, so the whole command aborted.
 *
 * The `<li><p>a</p><p>b</p></li>`-from-paste hazard this used to block at
 * the schema is PROVABLY not closable there without reopening the same bug:
 * any content expression permissive enough to let the split above succeed is
 * — being the same expression — also permissive enough to accept that shape
 * verbatim from `setContent`/paste (measured against both `paragraph+
 * bulletList*` and stock `paragraph block*`; both accept it unchanged).
 * `topicHtml.js`'s `separateAdjacentParagraphs`, run inside
 * `sanitizeTopicHtml` before the `<p>`-unwrap, is what replaces the
 * protection now — see its header for the full reasoning and
 * test/pure/sanitizeTopicHtml.test.mjs's "glue" tests for the proof it still
 * cannot happen.
 *
 * Ordinary typing is UNCHANGED: pressing Enter inside a bullet runs
 * `splitListItem`, a dedicated command that creates a sibling `<li>`
 * directly rather than a second paragraph in the same one — true with or
 * without this relaxation, and measured on both.
 */
const TopicListItem = ListItem.extend({
  content: 'paragraph+ bulletList*',
});

/**
 * THE DEPTH LOCK — the level past MAX_TOPIC_DEPTH cannot be authored.
 *
 * `priority` is above ListItem's default (100) so this Tab binding wins:
 * ListItem binds Tab to `sinkListItem` itself, and Tiptap resolves competing
 * shortcuts by extension priority. Without the bump this handler would be
 * shadowed by the very command it exists to gate, and nothing would look wrong.
 *
 * Returning TRUE on refusal is what swallows the keystroke. Returning false
 * would let the event fall through to ListItem's own Tab handler, which sinks
 * unconditionally — so the "safe" return value is the one that breaks the lock.
 *
 * The rule itself lives in topicEditorContract so it can be exercised against
 * real ProseMirror documents in a plain-node test; this extension is the wiring.
 */
const TopicDepthLock = Extension.create({
  name: 'topicDepthLock',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (!editor.isActive('listItem')) return false;
        if (!canNestDeeper(bulletListDepthAt(editor.state.selection.$from))) return true;
        return editor.commands.sinkListItem('listItem');
      },
    };
  },
});

/**
 * May the current selection be nested one level deeper?
 *
 * Exported so the toolbar's indent button reads the SAME rule the Tab key does
 * rather than re-deriving it — two ideas of "too deep" is the drift the single
 * `MAX_TOPIC_DEPTH` constant exists to prevent.
 */
export function canIndentSelection(editor) {
  if (!editor?.isActive?.('listItem')) return false;
  return canNestDeeper(bulletListDepthAt(editor.state.selection.$from));
}

export function topicEditorExtensions({ placeholder = 'พิมพ์หัวข้อย่อย…' } = {}) {
  return [
    StarterKit.configure({
      // Every one of these is off for a reason stated in the module header.
      orderedList: false,
      heading: false,
      blockquote: false,
      horizontalRule: false,
      codeBlock: false,
      // Replaced below with the narrowed content spec.
      listItem: false,
    }),
    TopicListItem,
    Underline,
    Link.configure({
      // The editor is for editing; a click must not navigate away from a form
      // holding unsaved work.
      openOnClick: false,
      // The sanitiser accepts http, https and mailto ONLY. Left to its default
      // the editor would autolink an `ftp://` the sanitiser then drops — the
      // admin sees a link, the page has none.
      protocols: ['http', 'https', 'mailto'],
    }),
    Placeholder.configure({ placeholder }),
    TopicDepthLock,
  ];
}
