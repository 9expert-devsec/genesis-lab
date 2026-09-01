import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Youtube from '@tiptap/extension-youtube';
import { ResizableImage } from '@/lib/editor/resizableImage';

/**
 * The course rich body editor's Tiptap extension set.
 *
 * ══ THE CAPABILITY LIST WAS GIVEN, NOT DERIVED ═════════════════════════════
 * Images, tables, YouTube, headings, lists, links, marks — settled, not
 * re-opened here. That is `docs/audit/course-rich-body.md` §4's Option B
 * (the article editor's shape, minus what it does not ask for) WITH YouTube
 * added back, which Option B had dropped for being outside "images and
 * tables" — this round's brief names it explicitly.
 *
 * ══ NOT INSTALLED, AND WHY EACH ONE IS ABSENT ═══════════════════════════════
 *
 *   Color, TextStyle, TextAlign, Subscript, Superscript, CharacterCount —
 *   not in the capability list. Dropping Color/TextStyle also removes
 *   `docs/audit/course-rich-body.md` §2.1's entire hazard at the root — no
 *   admin-authored inline colour, no dark-mode illegibility case, no need
 *   for a render-time mitigation this field would otherwise have to carry
 *   the way `Article.content` does with `normalizeAuthoredColors`. TextAlign
 *   is the audit's flagged one: an ATTRIBUTE on `paragraph`, not a node or a
 *   mark, so a schema check cannot catch its absence being relied on.
 *
 *   A source view (raw-HTML paste) — ArticleForm has one; this does not,
 *   same reasoning `topicEditorExtensions.js` states for its own editor: a
 *   raw-HTML box is a way to put bytes into the field that the editor's own
 *   schema never approved, and `sanitizeRichHtml` is the only thing that
 *   would then stand between an admin's paste and the sanitiser allow-list.
 *
 * ══ HEADING LEVELS ARE CAPPED AT [2, 3, 4], NOT STARTERKIT'S DEFAULT [1-6] ══
 * `sanitizeRichHtml`'s `rich` profile allows h2/h3/h4 only (RICH_TAGS, no h1,
 * h5 or h6) — same restriction ArticleForm itself applies, for the same
 * reason: h1 is the page's own title. Left at the default, the editor could
 * author an h1/h5/h6 that types correctly, saves, and then silently loses
 * its heading-ness the moment the sanitiser unwraps it — a real instance of
 * "what the editor can emit that the sanitiser strips," reported rather than
 * fixed by widening the sanitiser's allow-list.
 *
 * ══ LISTS ARE NOT NARROWED THE WAY topicEditorExtensions.js NARROWS THEM ════
 * `TopicListItem`'s single-paragraph content spec and `TopicDepthLock` exist
 * because bullets there render inside an accordion `<li>` that cannot host a
 * second block. A course body has no such container — StarterKit's stock
 * `orderedList`/`blockquote`/`horizontalRule`/`codeBlock` are prose, and
 * `sanitizeRichHtml`'s `rich` profile allows every tag they can emit
 * (`ol`, `blockquote`, `hr`, `pre`/`code`), so none of them are switched off.
 *
 * ══ IMAGES, TABLES, YOUTUBE — THE SAME EXTENSIONS ARTICLEFORM USES ═════════
 * `ResizableImage` is the module already shared between ArticleForm and
 * CustomPageForm (`lib/editor/resizableImage.js`) — imported here as a third
 * consumer, not re-implemented. `Table`/`TableRow`/`TableHeader`/`TableCell`
 * and `Youtube` are the exact same npm packages and configuration ArticleForm
 * passes — `sanitizeRichHtml`'s `rich` profile allows `table`/`thead`/`tbody`/
 * `tfoot`/`tr`/`th`/`td` and a host-restricted `iframe`
 * (`youtube-nocookie.com`, which `Youtube.configure({ nocookie: true })` is
 * what makes the extension emit).
 *
 * @param {object}   [opts]
 * @param {string}   [opts.placeholder]
 * @param {Function} [opts.onEditImage] wired to `ResizableImage`'s node-view
 *   edit button, same contract as ArticleForm's own `onEditImage` — called
 *   with `{ src, alt, width }` when the admin opens an already-inserted
 *   image's properties.
 */
export function courseBodyEditorExtensions({ placeholder = 'เริ่มเขียนเนื้อหาที่นี่…', onEditImage } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      // Matches sanitizeRichHtml's HREF_SCHEMES exactly, so the editor cannot
      // autolink a scheme the sanitiser then strips the href from.
      protocols: ['http', 'https', 'mailto', 'tel'],
    }),
    Placeholder.configure({ placeholder }),
    ResizableImage.configure({
      inline: false,
      allowBase64: false,
      onEditImage,
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
  ];
}
