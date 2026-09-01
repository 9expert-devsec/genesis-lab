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
 * `listItem` narrowed to `paragraph bulletList*`.
 *
 * Tiptap's default is `paragraph block*`, which admits a second paragraph in
 * one item. That matters because the sanitiser UNWRAPS `<p>`: `<li><p>a</p>
 * <p>b</p></li>` would sanitise to `<li>ab</li>` and the two lines would be
 * joined into one word-boundary-free string on the way to MSDB. Narrowing the
 * content spec means the shape cannot be authored — including by paste, which
 * ProseMirror coerces to the schema — rather than being repaired afterwards.
 *
 * `bulletList*` rather than `block*` for the second half: a nested list is the
 * only child a bullet may carry, which is the same "bullet lists only" rule the
 * disabled extensions above express, stated where the schema can enforce it.
 */
const TopicListItem = ListItem.extend({
  content: 'paragraph bulletList*',
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
