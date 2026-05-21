'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Youtube from '@tiptap/extension-youtube';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import CharacterCount from '@tiptap/extension-character-count';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Strikethrough,
  Underline as UnderlineIcon, Subscript as SubIcon,
  Superscript as SupIcon, RemoveFormatting,
  Heading1, Heading2, Heading3, Heading4, Pilcrow,
  List, ListOrdered, IndentIncrease, IndentDecrease,
  Quote, Code2, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Film as YoutubeIcon,
  Minus, Sigma, FileCode, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, ChevronLeft, X, Search, Trash2, Eye,
} from 'lucide-react';

/**
 * Image extension with width/style/alt round-trip support.
 *
 * The bundled @tiptap/extension-image only persists `src` and `alt`, so
 * any width the admin sets in the ImagePropertiesModal would vanish on
 * save / reload. We extend it with `width` (mirrors into both the HTML
 * attribute and inline `style`) and `style` (raw inline style so future
 * editors can keep custom styling intact through a round-trip).
 */
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {},
        parseHTML: (el) => el.getAttribute('width') || el.style.width || null,
      },
      alt: {
        default: '',
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
        parseHTML: (el) => el.getAttribute('alt') || '',
      },
      style: {
        default: null,
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
        parseHTML: (el) => el.getAttribute('style') || null,
      },
    };
  },
});
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import {
  createArticle,
  updateArticle,
  searchArticles,
  getArticlesByIds,
} from '@/lib/actions/articles';
import { buildJsonLd, validateJsonLd } from '@/lib/articles/buildJsonLd';

const MAX_TAGS = 20;

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

// ── small utilities ──────────────────────────────────────────────

function toLocalDateTimeInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function slugify(input) {
  // Preserve Thai characters and the admin's original casing — slugs
  // are no longer ASCII-only since the public site URL-encodes Thai.
  // We only collapse whitespace into hyphens and strip characters
  // that would break a URL path segment.
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^฀-๿a-zA-Z0-9\-_.~]/g, '');
}

function parseTagsText(text) {
  // Preserve original casing — the admin's "PowerBI" stays "PowerBI".
  // Dedupe is case-sensitive too so "PowerBI" and "powerbi" can coexist
  // if the admin really wants them.
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').split(/[,\n]+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * Minimal HTML pretty-printer for the source-mode textarea.
 *
 * Tiptap emits everything on a single line — readable for the browser,
 * unreadable for a human reviewing the markup. We split on tag
 * boundaries and indent based on depth. Void elements (br, hr, img,
 * input) don't push the indent level. Not a full HTML parser by design;
 * just enough formatting that an admin can hand-edit comfortably.
 */
function formatHTML(html) {
  let indent = 0;
  const tab = '  ';
  return html
    .replace(/></g, '>\n<')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.match(/^<\/\w/)) indent = Math.max(0, indent - 1);
      const result = tab.repeat(indent) + trimmed;
      if (trimmed.match(/^<\w[^/]*[^/]>$/) && !trimmed.match(/^<(br|hr|img|input)/i)) {
        indent++;
      }
      return result;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * SEO score — same heuristic as the design artifact. Each criterion
 * contributes independently so the bar nudges up as the admin fills
 * each field.
 */
function calcSeoScore({ title, seoTitle, seoDescription, focusKeyword, articleType }) {
  let s = 0;
  if (String(title).length > 10) s += 20;
  if (seoTitle.length >= 30 && seoTitle.length <= 60) s += 25;
  if (seoDescription.length >= 80 && seoDescription.length <= 160) s += 25;
  if (focusKeyword.length > 2) s += 15;
  if (articleType) s += 15;
  return s;
}

// ── main component ───────────────────────────────────────────────

export function ArticleForm({
  article,
  programs = [],
  skills = [],
  courses = [],
  isSuperAdmin = false,
}) {
  const router = useRouter();
  const isEdit = Boolean(article?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Sidebar — Cover
  const [coverUrl,      setCoverUrl]      = useState(article?.coverUrl      ?? '');
  const [coverPublicId, _setCoverPublicId] = useState(article?.coverPublicId ?? '');

  // Sidebar — Article Info
  const [slug,        setSlug]        = useState(article?.slug   ?? '');
  const [slugEdited,  setSlugEdited]  = useState(isEdit);
  const [author,      setAuthor]      = useState(article?.author ?? '');
  const [articleType, setArticleType] = useState(article?.articleType ?? 'article');
  const [active,      setActive]      = useState(article?.active !== false);

  // Sidebar — Tags (textarea, live-preview chips)
  const [tagsText, setTagsText] = useState(
    Array.isArray(article?.tags) ? article.tags.join(', ') : ''
  );
  const parsedTags = useMemo(() => parseTagsText(tagsText), [tagsText]);

  // Sidebar — Programs / Skills
  const [selectedPrograms, setSelectedPrograms] = useState(
    Array.isArray(article?.programs) ? article.programs : []
  );
  const [selectedSkills,   setSelectedSkills]   = useState(
    Array.isArray(article?.skills) ? article.skills : []
  );

  // Sidebar — Related courses / articles
  const [relatedCourses,  setRelatedCourses]  = useState(
    Array.isArray(article?.relatedCourses) ? article.relatedCourses : []
  );
  const [relatedArticles, setRelatedArticles] = useState(
    Array.isArray(article?.relatedArticles)
      ? article.relatedArticles.map((x) => String(x))
      : []
  );
  // Resolved relatedArticles → { _id, title } pairs for the chip UI in
  // edit mode. We seed this from the article doc; lookups for newly
  // added ones come from the async search response.
  const [relatedArticlesIndex, setRelatedArticlesIndex] = useState({});

  useEffect(() => {
    if (!isEdit || relatedArticles.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        // Call the server action directly — no REST shim needed.
        const items = await getArticlesByIds(relatedArticles);
        if (cancelled) return;
        const map = {};
        for (const a of items ?? []) {
          map[String(a._id)] = { _id: a._id, title: a.title };
        }
        setRelatedArticlesIndex((cur) => ({ ...map, ...cur }));
      } catch {
        /* non-critical — chips just show id-only fallback */
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sidebar — Schedule
  const [publishedAt, setPublishedAt] = useState(
    toLocalDateTimeInputValue(article?.publishedAt)
  );

  // Sidebar — SEO
  const [seoTitle,       setSeoTitle]       = useState(article?.seoTitle       ?? '');
  const [seoDescription, setSeoDescription] = useState(article?.seoDescription ?? '');
  const [focusKeyword,   setFocusKeyword]   = useState(article?.focusKeyword   ?? '');

  // Main — Title / Excerpt
  const [title,   setTitle]   = useState(article?.title   ?? '');
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');

  // Source-mode toggle: keep raw HTML in a separate state so the admin
  // can hand-edit and we can round-trip back to WYSIWYG cleanly.
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');

  // Image-properties modal — opened by the toolbar after a successful
  // upload. `imgModal` is the open/close flag (carries the uploaded
  // url); imgAlt/imgWidth are the admin's in-progress edits to the
  // image's alt/width before insertion.
  const [imgModal, setImgModal] = useState(null);
  const [imgAlt,   setImgAlt]   = useState('');
  const [imgWidth, setImgWidth] = useState('');

  // Preview modal — full-screen overlay rendering the article as it
  // will look on the public detail page (live, against the current
  // unsaved form state).
  const [showPreview, setShowPreview] = useState(false);

  // Transient "saved" confirmation, shown in the header after a
  // successful update. We stay on the edit page (admins typically
  // tweak-save-tweak), so a toast-style indicator stands in for the
  // usual list-redirect feedback.
  const [saved, setSaved] = useState(false);

  // JSON-LD — seeded from the existing doc on edit. `jsonLdStatus` is
  // the result of the last Preview pass (or 'unchecked' before the
  // admin has clicked Preview at least once).
  const [jsonLdEnabled,      setJsonLdEnabled]      = useState(article?.jsonLd?.enabled ?? true);
  const [schemaType,         setSchemaType]         = useState(article?.jsonLd?.schemaType ?? 'Article');
  const [jsonLdOverrides,    setJsonLdOverrides]    = useState(article?.jsonLd?.overrides ?? {});
  const [rawOverride,        setRawOverride]        = useState(article?.jsonLd?.rawOverride ?? '');
  const [rawOverrideEnabled, setRawOverrideEnabled] = useState(article?.jsonLd?.rawOverrideEnabled ?? false);
  const [jsonLdPreviewOpen,  setJsonLdPreviewOpen]  = useState(false);
  const [jsonLdStatus,       setJsonLdStatus]       = useState({ status: 'unchecked', message: '' });

  // ── Tiptap ────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'เริ่มเขียนเนื้อหาที่นี่…' }),
      // openOnClick: false stops the editor from following links on
      // single-click — admins expect clicks to place the cursor.
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
      CharacterCount,
    ],
    content: article?.content ?? '',
    editorProps: {
      attributes: {
        class:
          'article-content prose prose-sm dark:prose-invert max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
    immediatelyRender: false,
  });

  // Auto-grow the title / excerpt textareas as their content grows.
  const titleRef = useRef(null);
  const excerptRef = useRef(null);
  useEffect(() => autosize(titleRef.current),   [title]);
  useEffect(() => autosize(excerptRef.current), [excerpt]);

  // ── Action handlers ───────────────────────────────────────────

  function handleTitleChange(v) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function toggleSourceMode() {
    if (!editor) return;
    if (sourceMode) {
      // Returning to WYSIWYG: load whatever the admin edited.
      editor.commands.setContent(sourceHtml || '');
      setSourceMode(false);
    } else {
      // Pretty-print the markup before showing it in the textarea —
      // raw Tiptap output is single-line and hard to scan.
      setSourceHtml(formatHTML(editor.getHTML()));
      setSourceMode(true);
    }
  }

  // Two call paths:
  //   { asDraft: true } — explicit Save-as-Draft on new articles
  //                       (forces active=false regardless of the toggle).
  //   default           — honor the current `active` toggle. When the
  //                       admin flips publish on for the first time we
  //                       stamp publishedAt=now so the public page has
  //                       a date to render.
  const submit = useCallback(({ asDraft } = {}) => {
    setError(null);
    if (!editor) {
      setError('Editor ยังไม่พร้อม');
      return;
    }

    // If the admin is currently in raw-HTML mode, pull from the source
    // textarea — that's the authoritative state right now.
    const html = sourceMode ? sourceHtml : editor.getHTML();
    const trimmed = html.replace(/<p>\s*<\/p>/g, '').trim();
    if (!trimmed)             { setError('กรุณาใส่เนื้อหา');         return; }
    if (!title.trim())        { setError('กรุณาใส่ชื่อบทความ');       return; }
    if (!slug.trim())         { setError('กรุณาใส่ slug');             return; }

    let finalActive      = active;
    let finalPublishedAt = publishedAt;
    if (asDraft) {
      finalActive = false;
    } else if (finalActive && !finalPublishedAt) {
      finalPublishedAt = toLocalDateTimeInputValue(new Date().toISOString());
    }

    const fd = new FormData();
    fd.set('title',         title);
    fd.set('excerpt',       excerpt);
    fd.set('slug',          slug);
    fd.set('content',       html);
    fd.set('coverUrl',      coverUrl);
    fd.set('coverPublicId', coverPublicId);
    fd.set('tags',            JSON.stringify(parsedTags));
    fd.set('programs',        JSON.stringify(selectedPrograms));
    fd.set('skills',          JSON.stringify(selectedSkills));
    fd.set('relatedArticles', JSON.stringify(relatedArticles));
    fd.set('relatedCourses',  JSON.stringify(relatedCourses));
    fd.set('articleType',    articleType);
    fd.set('seoTitle',       seoTitle);
    fd.set('seoDescription', seoDescription);
    fd.set('focusKeyword',   focusKeyword);
    fd.set('author',         author);
    fd.set('publishedAt',    finalPublishedAt);
    fd.set('active',         String(finalActive));
    fd.set('jsonLd', JSON.stringify({
      enabled:    jsonLdEnabled,
      schemaType,
      overrides:  jsonLdOverrides,
      // Raw override is a superadmin-only feature — strip the
      // payload even if the toggle is somehow on for a non-super.
      rawOverride:        isSuperAdmin ? rawOverride : '',
      rawOverrideEnabled: isSuperAdmin && rawOverrideEnabled,
    }));

    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateArticle(article._id, fd)
          : await createArticle(fd);
        if (!res || res.ok === false) {
          setError(res?.error ?? 'บันทึกไม่สำเร็จ');
          return;
        }
        if (isEdit) {
          // Stay on the edit page — admins typically iterate. Show a
          // transient ✓ in the header for feedback.
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
          router.refresh();
        } else {
          router.push('/admin/articles');
          router.refresh();
        }
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }, [
    editor, sourceMode, sourceHtml,
    title, excerpt, slug, coverUrl, coverPublicId,
    parsedTags, selectedPrograms, selectedSkills,
    relatedArticles, relatedCourses, articleType,
    seoTitle, seoDescription, focusKeyword,
    author, publishedAt, active,
    jsonLdEnabled, schemaType, jsonLdOverrides,
    rawOverride, rawOverrideEnabled, isSuperAdmin,
    isEdit, article, router,
  ]);

  /**
   * Build a JSON-LD object from the unsaved form state — used by the
   * Preview / Copy buttons in the sidebar. We force `active: true` so
   * the builder doesn't bail on drafts mid-edit; the production
   * render still respects active/publishedAt because it calls
   * buildJsonLd against the saved document.
   */
  function buildJsonLdPreview() {
    return buildJsonLd({
      ...(article ?? {}),
      slug,
      title,
      excerpt,
      coverUrl,
      author,
      publishedAt: publishedAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      active: true,
      jsonLd: {
        enabled:    jsonLdEnabled,
        schemaType,
        overrides:  jsonLdOverrides,
        rawOverride,
        rawOverrideEnabled: isSuperAdmin && rawOverrideEnabled,
      },
    });
  }

  // ── Derived UI bits ───────────────────────────────────────────

  const seoScore = calcSeoScore({
    title, seoTitle, seoDescription, focusKeyword, articleType,
  });
  const isPublished = Boolean(
    active &&
    publishedAt &&
    new Date(publishedAt).getTime() <= Date.now()
  );
  const statusBadge = isPublished
    ? { label: 'Published', cls: 'bg-green-50 text-green-700 border-green-100' }
    : { label: 'Draft',     cls: 'bg-amber-50 text-amber-700 border-amber-100' };

  const charCount = editor?.storage.characterCount?.characters?.() ?? 0;
  const wordCount = editor?.storage.characterCount?.words?.()      ?? 0;
  const minutes   = Math.max(1, Math.ceil(wordCount / 200));
  const paragraphs = useMemo(() => {
    if (!editor) return 0;
    let n = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' && node.textContent.trim()) n++;
    });
    return n;
  }, [editor, charCount]);

  return (
    // Root takes the full viewport height so the editor and sidebar
    // can each scroll independently. The admin layout's <main> is
    // already `flex-1` of a `min-h-dvh` flex row, so h-[100dvh] here
    // matches its height exactly without subtracting a header offset.
    <div className="flex h-[100dvh] flex-col bg-9e-ice/30 dark:bg-[#0D1B2A]/40">
      {/* ── Header bar ──────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <div className="flex items-center gap-3 px-6 py-3">
          <Link
            href="/admin/articles"
            className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> รายการบทความ
          </Link>

          <div className="mx-auto min-w-0 flex-1 px-4">
            <p className="truncate text-center text-sm font-semibold text-9e-navy dark:text-white">
              {title || (isEdit ? 'แก้ไขบทความ' : 'สร้างบทความใหม่')}
            </p>
          </div>

          {saved && (
            <span className="text-sm font-medium text-green-600">
              ✓ บันทึกสำเร็จ
            </span>
          )}

          <span className={'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' + statusBadge.cls}>
            {statusBadge.label}
          </span>

          {!isEdit && (
            <button
              type="button"
              onClick={() => submit({ asDraft: true })}
              disabled={pending}
              className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              บันทึก Draft
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            <Eye className="h-4 w-4" /> Preview
          </button>
          {/* Publish toggle — mutates `active` state directly so the
              save button can read it. Stamping publishedAt happens at
              submit time when active goes on for the first time. */}
          <div className="flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5">
            <span className="text-xs text-gray-500 dark:text-[#94a3b8]">เผยแพร่</span>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive((v) => !v)}
              className={
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ' +
                (active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')
              }
            >
              <span
                className={
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ' +
                  (active ? 'translate-x-4' : 'translate-x-1')
                }
              />
            </button>
          </div>
          <button
            type="button"
            onClick={() => submit({})}
            disabled={pending}
            className="rounded-9e-md bg-9e-action px-3 py-1.5 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึกอัปเดต'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex-shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────
          flex-1 + min-h-0 lets each column own its own scroll
          context (without `min-h-0`, flex children expand to fit
          their content and override the parent's height). */}
      <div className="flex min-h-0 flex-1">
        {/* Main editor column (left) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#111d2c]">
          {/* Toolbar — sticky at the top of the editor column. */}
          <div className="flex-shrink-0 border-b border-[var(--surface-border)] px-6 py-2">
            <EditorToolbar
              editor={editor}
              sourceMode={sourceMode}
              onToggleSource={toggleSourceMode}
              onImageUploaded={(url) => {
                setImgAlt('');
                setImgWidth('');
                setImgModal({ url });
              }}
            />
          </div>

          {/* Scrollable editor body — title, excerpt, Tiptap. */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="ชื่อบทความ..."
              rows={1}
              className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight text-9e-navy outline-none placeholder:text-9e-slate-dp-50 dark:text-white"
            />
            <textarea
              ref={excerptRef}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="สรุปสั้นๆ..."
              rows={1}
              className="mt-3 w-full resize-none border-0 bg-transparent p-0 text-lg leading-relaxed text-9e-slate-dp-50 outline-none placeholder:text-9e-slate-dp-50 dark:text-[#94a3b8]"
            />

            <hr className="my-4 border-[var(--surface-border)]" />

            {sourceMode ? (
              <textarea
                value={sourceHtml}
                onChange={(e) => setSourceHtml(e.target.value)}
                rows={20}
                spellCheck={false}
                className="w-full rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-3 py-2 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
              />
            ) : (
              <div className="rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
                <EditorContent editor={editor} />
                {editor && editor.isActive('table') && (
                  <TableControls editor={editor} />
                )}
              </div>
            )}
          </div>

          {/* Footer stats — sticky at the bottom of the editor column. */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--surface-border)] px-6 py-2 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
            <span>{wordCount} คำ</span>
            <span>{charCount} ตัวอักษร</span>
            <span>~{minutes} นาที</span>
            <span>{paragraphs} ย่อหน้า</span>
          </div>
        </div>

        {/* Sidebar (right) — independent scroll. */}
        <aside className="w-72 flex-shrink-0 space-y-5 overflow-y-auto border-l border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
          {/* 1. Cover */}
          <Section title="รูปปก">
            <ImageUploadField
              name="coverUrl"
              currentUrl={coverUrl}
              folder="articles"
              hint="แนะนำ 1200×630px"
              onChange={setCoverUrl}
            />
          </Section>

          {/* 2. Article Info */}
          <Section title="ข้อมูลบทความ">
            <Label text="Slug *">
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }}
                placeholder="my-article-slug"
                className={inputCls + ' font-mono'}
              />
            </Label>
            <Label text="ผู้เขียน" className="mt-3">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="9Expert Team"
                className={inputCls}
              />
            </Label>
            <div className="mt-3">
              <span className="text-xs font-medium text-9e-navy dark:text-white">ประเภทบทความ</span>
              <div className="mt-1 inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
                {[
                  { v: 'article', label: 'บทความ' },
                  { v: 'video',   label: 'วิดีโอ' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setArticleType(opt.v)}
                    className={
                      'rounded-9e-sm px-2.5 py-1 text-xs font-medium ' +
                      (articleType === opt.v
                        ? 'bg-9e-action text-white'
                        : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs text-9e-navy dark:text-white">เผยแพร่ (active)</span>
            </label>
          </Section>

          {/* 3. Tags */}
          <Section title="Tags">
            <p className="mb-1 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
              คั่นด้วย comma หรือขึ้นบรรทัดใหม่
            </p>
            <textarea
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              rows={2}
              placeholder={'9Expert, PowerBI, Data\nMicrosoft'}
              className={inputCls}
            />
            {parsedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parsedTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#0D1B2A]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-9e-slate-dp-50">
              รวม {parsedTags.length} แท็ก (สูงสุด {MAX_TAGS})
            </p>
          </Section>

          {/* 4. Programs */}
          <Section title="Programs">
            <ProgramPicker
              programs={programs}
              value={selectedPrograms}
              onChange={setSelectedPrograms}
            />
          </Section>

          {/* 5. Skills */}
          <Section title="Skills (ไม่บังคับ)">
            <CheckboxList
              items={skills.map((s) => ({ value: s.skill_id, label: s.skill_name || s.skill_id }))}
              value={selectedSkills}
              onChange={setSelectedSkills}
            />
          </Section>

          {/* 6. Related courses */}
          <Section title="หลักสูตรที่เกี่ยวข้อง">
            <RelatedCoursePicker
              courses={courses}
              value={relatedCourses}
              onChange={setRelatedCourses}
            />
          </Section>

          {/* 7. Related articles */}
          <Section title="บทความที่เกี่ยวข้อง">
            <RelatedArticlePicker
              value={relatedArticles}
              index={relatedArticlesIndex}
              onChange={(next, indexUpdate) => {
                setRelatedArticles(next);
                if (indexUpdate) {
                  setRelatedArticlesIndex((cur) => ({ ...cur, ...indexUpdate }));
                }
              }}
              currentId={article?._id}
            />
          </Section>

          {/* 8. Schedule */}
          <Section title="วันที่เผยแพร่">
            <input
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
              เว้นว่าง = draft
            </p>
          </Section>

          {/* 9. SEO */}
          <Section title="SEO">
            <Label text={`SEO Title (${seoTitle.length}/60)`}>
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value.slice(0, 60))}
                className={inputCls}
              />
            </Label>
            <Label text={`SEO Description (${seoDescription.length}/160)`} className="mt-3">
              <textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value.slice(0, 160))}
                rows={3}
                className={inputCls}
              />
            </Label>
            <Label text="Focus Keyword" className="mt-3">
              <input
                type="text"
                value={focusKeyword}
                onChange={(e) => setFocusKeyword(e.target.value)}
                className={inputCls}
              />
            </Label>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
                <span>คะแนน SEO</span>
                <span className="font-semibold text-9e-navy dark:text-white">{seoScore}/100</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-9e-ice dark:bg-[#0D1B2A]">
                <div
                  className={
                    'h-full transition-all ' +
                    (seoScore >= 80 ? 'bg-green-500' : seoScore >= 50 ? 'bg-amber-500' : 'bg-red-500')
                  }
                  style={{ width: `${seoScore}%` }}
                />
              </div>
            </div>
          </Section>

          {/* ── JSON-LD / Schema ──────────────────────────── */}
          <JsonLdSection
            enabled={jsonLdEnabled}                setEnabled={setJsonLdEnabled}
            schemaType={schemaType}                setSchemaType={setSchemaType}
            overrides={jsonLdOverrides}            setOverrides={setJsonLdOverrides}
            rawOverride={rawOverride}              setRawOverride={setRawOverride}
            rawOverrideEnabled={rawOverrideEnabled} setRawOverrideEnabled={setRawOverrideEnabled}
            status={jsonLdStatus}
            isSuperAdmin={isSuperAdmin}
            onPreview={() => {
              const preview = buildJsonLdPreview();
              setJsonLdStatus(validateJsonLd(preview));
              setJsonLdPreviewOpen(true);
            }}
            onCopy={async () => {
              try {
                const preview = buildJsonLdPreview();
                await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
                setJsonLdStatus(validateJsonLd(preview));
              } catch {
                /* clipboard may be blocked — silent fallback */
              }
            }}
          />
        </aside>
      </div>

      {/* ── Image properties modal ──────────────────────────── */}
      {imgModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--surface-border)] bg-white shadow-2xl dark:bg-[#111d2c]">
            <div className="border-b border-[var(--surface-border)] px-5 py-4">
              <h3 className="font-semibold text-9e-navy dark:text-white">ตั้งค่ารูปภาพ</h3>
            </div>
            <div className="space-y-4 p-5">
              {/* Preview */}
              <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-[var(--surface-border)] bg-gray-50 dark:bg-[#0D1B2A]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgModal.url}
                  alt="preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              {/* URL — read-only, truncated */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">URL</label>
                <input
                  type="text"
                  readOnly
                  value={imgModal.url}
                  className="w-full truncate rounded-lg border border-[var(--surface-border)] bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500 dark:bg-[#0D1B2A] dark:text-gray-400"
                />
              </div>
              {/* Alt */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Alt Text <span className="font-normal text-gray-400">(SEO)</span>
                </label>
                <input
                  type="text"
                  value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)}
                  placeholder="คำอธิบายรูปภาพ (สำหรับ SEO)"
                  className="w-full rounded-lg border border-[var(--surface-border)] px-3 py-2 text-sm outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/10 dark:bg-[#0D1B2A] dark:text-white"
                />
              </div>
              {/* Width */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  ขนาดรูป <span className="font-normal text-gray-400">(ว่าง = ขนาดเต็ม)</span>
                </label>
                <input
                  type="text"
                  value={imgWidth}
                  onChange={(e) => setImgWidth(e.target.value)}
                  placeholder="เช่น 100%, 600px, 800px"
                  className="w-full rounded-lg border border-[var(--surface-border)] px-3 py-2 text-sm outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/10 dark:bg-[#0D1B2A] dark:text-white"
                />
                <div className="mt-2 flex gap-2">
                  {['25%', '50%', '75%', '100%'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setImgWidth(s)}
                      className={
                        'rounded border px-2 py-1 text-xs transition-colors ' +
                        (imgWidth === s
                          ? 'border-9e-action bg-9e-action text-white'
                          : 'border-[var(--surface-border)] text-gray-500 hover:border-9e-action hover:text-9e-action')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--surface-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => { setImgModal(null); setImgAlt(''); setImgWidth(''); }}
                className="rounded-lg border border-[var(--surface-border)] px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editor) return;
                  editor.chain().focus().setImage({
                    src:   imgModal.url,
                    alt:   imgAlt.trim() || undefined,
                    width: imgWidth.trim() || undefined,
                  }).run();
                  setImgModal(null);
                  setImgAlt('');
                  setImgWidth('');
                }}
                className="rounded-lg bg-9e-action px-4 py-2 text-sm font-semibold text-white hover:bg-9e-brand"
              >
                แทรกรูปภาพ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview modal ───────────────────────────────────── */}
      {showPreview && (
        <ArticlePreviewOverlay
          previewData={{
            title,
            excerpt,
            content: editor?.getHTML() ?? '',
            coverUrl,
            author,
            tags: parsedTags,
            publishedAt: publishedAt || new Date().toISOString(),
          }}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── JSON-LD preview modal ───────────────────────────── */}
      {jsonLdPreviewOpen && (
        <JsonLdPreviewOverlay
          jsonLd={buildJsonLdPreview()}
          status={jsonLdStatus}
          onClose={() => setJsonLdPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ── Preview overlay ──────────────────────────────────────────────

/**
 * Full-screen modal that renders the current form state the way the
 * public detail page will, so admins can sanity-check formatting
 * before publishing. Lives at z-[70] to sit above the image-props
 * modal in case both happen to be open during a hot reload.
 */
function ArticlePreviewOverlay({ previewData, onClose }) {
  // Word-based reading time, mirrored from the public detail page
  // helper so the preview matches what readers will see.
  const wordCount = previewData.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-white dark:bg-[#0D1B2A]">
      {/* Sticky preview-mode chrome */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--surface-border)] bg-white/95 px-6 py-3 backdrop-blur dark:bg-[#0D1B2A]/95">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-yellow-200 bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
            PREVIEW MODE
          </span>
          <span className="text-sm text-gray-400">
            นี่คือตัวอย่างเนื้อหาบทความ — ยังไม่ได้เผยแพร่
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#111d2c]"
        >
          <X className="h-3.5 w-3.5" /> ปิด Preview
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-10">
        {previewData.coverUrl && (
          <div className="mb-8 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewData.coverUrl}
              alt={previewData.title}
              className="aspect-video w-full object-cover"
            />
          </div>
        )}

        <h1 className="text-4xl font-bold leading-tight text-gray-900 dark:text-white">
          {previewData.title || '(ยังไม่มีชื่อบทความ)'}
        </h1>

        {previewData.excerpt && (
          <p className="mt-3 text-lg leading-relaxed text-gray-500 dark:text-gray-400">
            {previewData.excerpt}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
          {previewData.author && (
            <span className="flex items-center gap-1">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {previewData.author}
            </span>
          )}
          <span>
            {new Date(previewData.publishedAt).toLocaleDateString('th-TH', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>
          <span>อ่าน ~{minutes} นาที</span>
        </div>

        {previewData.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previewData.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <div
          className="prose prose-lg max-w-none prose-h2:border-l-4 prose-h2:border-blue-500 prose-h2:pl-4 prose-a:text-blue-600 prose-a:underline prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:px-4 prose-blockquote:py-2 prose-code:rounded prose-code:bg-blue-50 prose-code:px-1 prose-code:text-blue-700 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-ol:list-decimal prose-ol:pl-6 prose-ul:list-disc prose-ul:pl-6 prose-li:my-1 prose-img:rounded-xl prose-img:shadow-md dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: previewData.content }}
        />
      </div>
    </div>
  );
}

// ── JSON-LD section ──────────────────────────────────────────────

const JSONLD_STATUS_STYLE = {
  valid:     { chip: 'bg-green-100 text-green-700',  text: 'text-green-600',  label: '✓ Valid' },
  warning:   { chip: 'bg-yellow-100 text-yellow-700', text: 'text-yellow-600', label: '⚠ Warning' },
  error:     { chip: 'bg-red-100 text-red-700',     text: 'text-red-600',    label: '✕ Error' },
  disabled:  { chip: 'bg-gray-100 text-gray-500',   text: 'text-gray-500',   label: 'Disabled' },
  unchecked: { chip: 'bg-gray-100 text-gray-500',   text: 'text-gray-500',   label: 'Unchecked' },
};

function StatusChip({ status }) {
  const style = JSONLD_STATUS_STYLE[status] ?? JSONLD_STATUS_STYLE.unchecked;
  return (
    <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' + style.chip}>
      {style.label}
    </span>
  );
}

function JsonLdSection({
  enabled, setEnabled,
  schemaType, setSchemaType,
  overrides, setOverrides,
  rawOverride, setRawOverride,
  rawOverrideEnabled, setRawOverrideEnabled,
  status,
  isSuperAdmin,
  onPreview,
  onCopy,
}) {
  const overrideFields = [
    { key: 'headline',    label: 'Headline',    ph: 'ปล่อยว่าง = ใช้ชื่อบทความ' },
    { key: 'description', label: 'Description', ph: 'ปล่อยว่าง = ใช้ excerpt' },
    { key: 'image',       label: 'Image URL',   ph: 'ปล่อยว่าง = ใช้รูปปก' },
    { key: 'authorName',  label: 'Author',      ph: 'ปล่อยว่าง = ใช้ผู้เขียน' },
  ];
  const statusStyle = JSONLD_STATUS_STYLE[status.status] ?? JSONLD_STATUS_STYLE.unchecked;

  return (
    <section className="space-y-3 rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-9e-navy dark:text-white">
          JSON-LD / Schema
        </h3>
        <StatusChip status={status.status} />
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">เปิดใช้ JSON-LD</span>
      </label>

      {enabled && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#94a3b8]">
              ประเภท Schema
            </label>
            <select
              value={schemaType}
              onChange={(e) => setSchemaType(e.target.value)}
              className="w-full rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-sm dark:bg-[#0D1B2A] dark:text-white"
            >
              {['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {overrideFields.map(({ key, label, ph }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#94a3b8]">
                {label}
              </label>
              <input
                type="text"
                value={overrides?.[key] ?? ''}
                onChange={(e) =>
                  setOverrides((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={ph}
                className="w-full rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs dark:bg-[#0D1B2A] dark:text-white"
              />
            </div>
          ))}

          {status.message && (
            <p className={'text-xs ' + statusStyle.text}>{status.message}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPreview}
              className="flex-1 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#0D1B2A]"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#0D1B2A]"
            >
              Copy
            </button>
          </div>

          {/* Raw-JSON escape hatch — superadmin only. We gate the UI
              here and re-gate on submit, so toggling the flag client
              side without the role can't sneak past. */}
          {isSuperAdmin && (
            <div className="border-t border-[var(--surface-border)] pt-2">
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rawOverrideEnabled}
                  onChange={(e) => setRawOverrideEnabled(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-xs font-semibold text-orange-600">
                  Advanced: Raw JSON Override
                </span>
              </label>
              {rawOverrideEnabled && (
                <textarea
                  value={rawOverride}
                  onChange={(e) => setRawOverride(e.target.value)}
                  rows={6}
                  placeholder='{"@context":"https://schema.org",...}'
                  className="w-full rounded-lg border border-orange-300 px-3 py-2 font-mono text-xs dark:bg-[#0D1B2A] dark:text-white"
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── JSON-LD preview modal ────────────────────────────────────────

function JsonLdPreviewOverlay({ jsonLd, status, onClose }) {
  const statusStyle = JSONLD_STATUS_STYLE[status.status] ?? JSONLD_STATUS_STYLE.unchecked;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--surface-border)] bg-white shadow-2xl dark:bg-[#111d2c]">
        <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-9e-navy dark:text-white">JSON-LD Preview</h3>
            <StatusChip status={status.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-gray-400 hover:text-gray-600"
            aria-label="ปิด"
          >
            ×
          </button>
        </div>
        {status.message && (
          <div className={'px-5 py-2 text-sm ' + statusStyle.chip}>
            {status.message}
          </div>
        )}
        <pre className="flex-1 overflow-auto rounded-b-xl bg-gray-50 p-5 font-mono text-xs text-gray-800 dark:bg-[#0D1B2A] dark:text-gray-200">
{jsonLd ? JSON.stringify(jsonLd, null, 2) : '// JSON-LD ถูกปิดใช้งานหรือยังไม่ครบเงื่อนไข'}
        </pre>
      </div>
    </div>
  );
}

// ── Sidebar helper components ────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
      <h3 className="mb-3 text-sm font-bold text-9e-navy dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

function Label({ text, className = '', children }) {
  return (
    <label className={'block ' + className}>
      <span className="text-xs font-medium text-9e-navy dark:text-white">{text}</span>
      {children}
    </label>
  );
}

function CheckboxList({ items, value, onChange }) {
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
      {items.length === 0 && (
        <p className="text-[11px] text-9e-slate-dp-50">ไม่มีข้อมูล</p>
      )}
      {items.map((it) => {
        const checked = value.includes(it.value);
        return (
          <label key={it.value} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, it.value]
                    : value.filter((v) => v !== it.value)
                )
              }
              className="h-3.5 w-3.5"
            />
            <span className="text-9e-navy dark:text-white">{it.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function ProgramPicker({ programs, value, onChange }) {
  const isNone = value.length === 0;
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isNone}
          onChange={(e) => { if (e.target.checked) onChange([]); }}
          className="h-3.5 w-3.5"
        />
        <span className="font-medium text-9e-navy dark:text-white">None (ไม่ระบุ)</span>
      </label>
      {programs.map((p) => {
        const checked = value.includes(p.program_id);
        return (
          <label key={p.program_id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value.filter((v) => v), p.program_id]
                    : value.filter((v) => v !== p.program_id)
                )
              }
              className="h-3.5 w-3.5"
            />
            <span className="text-9e-navy dark:text-white">
              {p.program_name || p.program_id}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function RelatedCoursePicker({ courses, value, onChange }) {
  const [query, setQuery] = useState('');
  const selected = value
    .map((id) => courses.find((c) => c.course_id === id))
    .filter(Boolean);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return courses
      .filter((c) => !value.includes(c.course_id))
      .filter((c) =>
        String(c.course_id).toLowerCase().includes(q) ||
        String(c.course_name).toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [courses, value, query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา course_id หรือชื่อคอร์ส…"
          className={inputCls + ' pl-7'}
        />
      </div>
      {filtered.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
          {filtered.map((c) => (
            <button
              key={c.course_id}
              type="button"
              onClick={() => { onChange([...value, c.course_id]); setQuery(''); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#111d2c]"
            >
              <span className="font-mono text-9e-action">{c.course_id}</span>
              <span className="flex-1 truncate text-9e-navy dark:text-white">
                {c.course_name || '—'}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((c) => (
            <span
              key={c.course_id}
              className="inline-flex items-center gap-1 rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c]"
            >
              <span className="font-mono">{c.course_id}</span>
              <span className="truncate max-w-[120px]">{c.course_name}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== c.course_id))}
                className="rounded-full p-0.5 hover:bg-red-100 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RelatedArticlePicker({ value, index, onChange, currentId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // 400ms debounce — busy-typing shouldn't fire a server action per
  // keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const hits = await searchArticles(q);
        if (cancelled) return;
        setResults((hits || []).filter((a) => String(a._id) !== String(currentId)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, currentId]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="พิมพ์เพื่อค้นหาบทความ…"
          className={inputCls + ' pl-7'}
        />
      </div>
      {loading && (
        <p className="mt-1 text-[11px] text-9e-slate-dp-50">กำลังค้นหา…</p>
      )}
      {results.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
          {results.map((a) => {
            const id = String(a._id);
            const already = value.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={already}
                onClick={() => {
                  onChange([...value, id], { [id]: { _id: id, title: a.title } });
                  setQuery('');
                  setResults([]);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-9e-ice disabled:opacity-50 dark:hover:bg-[#111d2c]"
              >
                <span className="line-clamp-1 flex-1 text-9e-navy dark:text-white">
                  {a.title}
                </span>
                {already && <span className="text-[10px] text-9e-slate-dp-50">เลือกแล้ว</span>}
              </button>
            );
          })}
        </div>
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {value.map((id) => {
            const entry = index?.[id];
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c]"
              >
                <span className="line-clamp-1 max-w-[160px]">{entry?.title ?? id}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="rounded-full p-0.5 hover:bg-red-100 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────

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
        'inline-flex h-8 w-8 items-center justify-center rounded-9e-sm transition-colors disabled:opacity-30 ' +
        (active
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

function EditorToolbar({ editor, sourceMode, onToggleSource, onImageUploaded }) {
  const imageInputRef = useRef(null);

  if (!editor) {
    return (
      <div className="flex h-10 items-center rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/50 px-2 dark:bg-[#0D1B2A]/40" />
    );
  }
  const chain = () => editor.chain().focus();

  async function handleImageUpload(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'articles');
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed');
      // Defer insertion — the parent opens an ImagePropertiesModal so
      // the admin can set alt + width before the image lands in the
      // editor. If no callback is wired, fall back to the legacy
      // direct-insert behavior.
      if (onImageUploaded) onImageUploaded(data.url);
      else chain().setImage({ src: data.url }).run();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.message ?? 'อัปโหลดรูปไม่สำเร็จ');
    }
  }

  function handleSetLink() {
    const prev = editor.getAttributes('link')?.href ?? '';
    // eslint-disable-next-line no-alert
    const url = window.prompt('URL', prev);
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

  function handleInsertSpecial() {
    // eslint-disable-next-line no-alert
    const ch = window.prompt('Special character (วาง emoji หรือสัญลักษณ์)');
    if (!ch) return;
    chain().insertContent(ch).run();
  }

  if (sourceMode) {
    return (
      <div className="flex items-center justify-between rounded-9e-md border border-[var(--surface-border)] bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
        <span>กำลังแก้ไข HTML ดิบ — กดปุ่มเพื่อกลับสู่โหมดปกติ</span>
        <button
          type="button"
          onClick={onToggleSource}
          className="rounded-9e-sm border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100"
        >
          กลับสู่โหมดปกติ
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/50 px-2 py-1 dark:bg-[#0D1B2A]/40">
      <ToolbarButton title="Undo" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="Bold"          onClick={() => chain().toggleBold().run()}        active={editor.isActive('bold')}>          <BoldIcon className="h-4 w-4" />     </ToolbarButton>
      <ToolbarButton title="Italic"        onClick={() => chain().toggleItalic().run()}      active={editor.isActive('italic')}>        <ItalicIcon className="h-4 w-4" />   </ToolbarButton>
      <ToolbarButton title="Underline"     onClick={() => chain().toggleUnderline().run()}   active={editor.isActive('underline')}>     <UnderlineIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Strikethrough" onClick={() => chain().toggleStrike().run()}      active={editor.isActive('strike')}>        <Strikethrough className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Subscript"     onClick={() => chain().toggleSubscript().run()}   active={editor.isActive('subscript')}>     <SubIcon className="h-4 w-4" />      </ToolbarButton>
      <ToolbarButton title="Superscript"   onClick={() => chain().toggleSuperscript().run()} active={editor.isActive('superscript')}>   <SupIcon className="h-4 w-4" />      </ToolbarButton>
      <ToolbarButton title="Clear format"  onClick={() => chain().unsetAllMarks().clearNodes().run()}>                                    <RemoveFormatting className="h-4 w-4" /></ToolbarButton>

      <ToolbarDivider />

      <ColorPicker editor={editor} />

      <ToolbarDivider />

      <HeadingMenu editor={editor} />

      <ToolbarDivider />

      <ToolbarButton title="Bullet list"  onClick={() => chain().toggleBulletList().run()}  active={editor.isActive('bulletList')}>  <List className="h-4 w-4" />        </ToolbarButton>
      <ToolbarButton title="Numbered list" onClick={() => chain().toggleOrderedList().run()} active={editor.isActive('orderedList')}> <ListOrdered className="h-4 w-4" /> </ToolbarButton>
      <ToolbarButton title="Outdent"      onClick={() => editor.chain().focus().liftListItem('listItem').run()}>                       <IndentDecrease className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Indent"       onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>                       <IndentIncrease className="h-4 w-4" /></ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="Align left"    onClick={() => chain().setTextAlign('left').run()}    active={editor.isActive({ textAlign: 'left' })}>    <AlignLeft className="h-4 w-4" />    </ToolbarButton>
      <ToolbarButton title="Align center"  onClick={() => chain().setTextAlign('center').run()}  active={editor.isActive({ textAlign: 'center' })}>  <AlignCenter className="h-4 w-4" />  </ToolbarButton>
      <ToolbarButton title="Align right"   onClick={() => chain().setTextAlign('right').run()}   active={editor.isActive({ textAlign: 'right' })}>   <AlignRight className="h-4 w-4" />   </ToolbarButton>
      <ToolbarButton title="Justify"       onClick={() => chain().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })}> <AlignJustify className="h-4 w-4" /> </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="Blockquote" onClick={() => chain().toggleBlockquote().run()} active={editor.isActive('blockquote')}> <Quote className="h-4 w-4" /> </ToolbarButton>
      <ToolbarButton title="Code block" onClick={() => chain().toggleCodeBlock().run()}  active={editor.isActive('codeBlock')}>  <Code2 className="h-4 w-4" /> </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="Link"      onClick={handleSetLink}                  active={editor.isActive('link')}> <LinkIcon className="h-4 w-4" /> </ToolbarButton>
      <ToolbarButton title="Image"     onClick={() => imageInputRef.current?.click()}>                              <ImageIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Table"     onClick={handleInsertTable}>                                                 <TableIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Divider"   onClick={() => chain().setHorizontalRule().run()}>                            <Minus className="h-4 w-4" />    </ToolbarButton>
      <ToolbarButton title="Special character" onClick={handleInsertSpecial}>                                        <Sigma className="h-4 w-4" />    </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton title="YouTube" onClick={handleInsertYoutube}> <YoutubeIcon className="h-4 w-4" /> </ToolbarButton>
      <ToolbarButton title="Source HTML" onClick={onToggleSource} active={sourceMode}> <FileCode className="h-4 w-4" /> </ToolbarButton>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function HeadingMenu({ editor }) {
  const [open, setOpen] = useState(false);
  const current = (() => {
    if (editor.isActive('heading', { level: 1 })) return 'H1';
    if (editor.isActive('heading', { level: 2 })) return 'H2';
    if (editor.isActive('heading', { level: 3 })) return 'H3';
    if (editor.isActive('heading', { level: 4 })) return 'H4';
    return 'P';
  })();
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1 rounded-9e-sm px-2 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
      >
        {current === 'P' ? <Pilcrow className="h-4 w-4" /> :
         current === 'H1' ? <Heading1 className="h-4 w-4" /> :
         current === 'H2' ? <Heading2 className="h-4 w-4" /> :
         current === 'H3' ? <Heading3 className="h-4 w-4" /> :
                            <Heading4 className="h-4 w-4" />}
        <span>{current}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-32 rounded-9e-md border border-[var(--surface-border)] bg-white p-1 shadow-9e-lg dark:bg-[#111d2c]">
          {[
            { label: 'Paragraph', cmd: () => editor.chain().focus().setParagraph().run() },
            { label: 'Heading 1', cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
            { label: 'Heading 2', cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
            { label: 'Heading 3', cmd: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
            { label: 'Heading 4', cmd: () => editor.chain().focus().toggleHeading({ level: 4 }).run() },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => { opt.cmd(); setOpen(false); }}
              className="block w-full rounded-9e-sm px-2 py-1 text-left text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPicker({ editor }) {
  const colors = ['#0D1B2A', '#005CFF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#94A3B8'];
  return (
    <div className="relative inline-flex items-center">
      <input
        type="color"
        value={editor.getAttributes('textStyle')?.color || '#000000'}
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        className="h-7 w-7 cursor-pointer rounded border border-[var(--surface-border)] bg-transparent p-0.5"
        title="สีตัวอักษร"
      />
      <div className="ml-1 hidden gap-0.5 md:flex">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setColor(c).run()}
            title={c}
            className="h-4 w-4 rounded-sm border border-[var(--surface-border)]"
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().unsetColor().run()}
          title="ล้างสี"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-[var(--surface-border)] text-[9px] text-9e-slate-dp-50"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function TableControls({ editor }) {
  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-[var(--surface-border)] bg-9e-ice/50 px-3 py-1.5 text-[11px] dark:bg-[#0D1B2A]/40">
      <span className="text-9e-slate-dp-50">Table:</span>
      <button type="button" onClick={() => chain().addColumnBefore().run()} className="rounded-9e-sm px-2 py-0.5 hover:bg-white dark:hover:bg-[#111d2c]">+Col ◀</button>
      <button type="button" onClick={() => chain().addColumnAfter().run()}  className="rounded-9e-sm px-2 py-0.5 hover:bg-white dark:hover:bg-[#111d2c]">+Col ▶</button>
      <button type="button" onClick={() => chain().addRowBefore().run()}    className="rounded-9e-sm px-2 py-0.5 hover:bg-white dark:hover:bg-[#111d2c]">+Row ▲</button>
      <button type="button" onClick={() => chain().addRowAfter().run()}     className="rounded-9e-sm px-2 py-0.5 hover:bg-white dark:hover:bg-[#111d2c]">+Row ▼</button>
      <span className="mx-1 h-3 w-px bg-[var(--surface-border)]" />
      <button type="button" onClick={() => chain().deleteColumn().run()} className="rounded-9e-sm px-2 py-0.5 text-red-600 hover:bg-red-50">-Col</button>
      <button type="button" onClick={() => chain().deleteRow().run()}    className="rounded-9e-sm px-2 py-0.5 text-red-600 hover:bg-red-50">-Row</button>
      <button type="button" onClick={() => chain().deleteTable().run()}  className="rounded-9e-sm px-2 py-0.5 text-red-600 hover:bg-red-50">
        <Trash2 className="inline h-3 w-3" /> Table
      </button>
    </div>
  );
}