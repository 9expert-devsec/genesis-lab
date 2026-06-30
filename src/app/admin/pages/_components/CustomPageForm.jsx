'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
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
import { IframeNode } from './extensions/IframeNode';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Strikethrough,
  Underline as UnderlineIcon, Subscript as SubIcon,
  Superscript as SupIcon, RemoveFormatting,
  Heading1, Heading2, Heading3, Heading4, Pilcrow,
  List, ListOrdered, IndentIncrease, IndentDecrease,
  Quote, Code2, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Film as YoutubeIcon,
  Minus, Sigma, FileCode, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, ChevronLeft, ChevronDown, X, Upload, Copy, RefreshCw, Trash2,
} from 'lucide-react';

/**
 * Image extension with width/style/alt round-trip support — mirrors the
 * one in ArticleForm so pasted/inserted images keep their width on reload.
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

import { buildPageJsonLd, validatePageJsonLd } from '@/lib/customPages/buildPageJsonLd';
import {
  createCustomPage,
  updateCustomPage,
  regeneratePreviewToken,
} from '@/lib/actions/customPages';

const SITE_URL = 'https://9experttraining.com';

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

const SLUG_RE = /^[a-z0-9-]+$/;

// ── small utilities ──────────────────────────────────────────────

/**
 * ASCII kebab-case slugify. Unlike the Article slugify (which preserves
 * Thai), Custom Page slugs MUST satisfy the Batch-1 zod regex
 * /^[a-z0-9-]+$/ — so Thai/non-ASCII characters are dropped entirely.
 */
function asciiSlugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // drop anything that isn't ascii alnum / space / hyphen
    .replace(/\s+/g, '-')          // spaces → hyphens
    .replace(/-+/g, '-')           // collapse repeats
    .replace(/^-+|-+$/g, '');      // trim leading/trailing hyphens
}

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * Minimal HTML pretty-printer for the source-mode textarea — mirrors
 * ArticleForm. Tiptap emits single-line markup; this indents it so an
 * admin can hand-edit pasted iframe / Google-Form embeds comfortably.
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

// ── main component ───────────────────────────────────────────────

export function CustomPageForm({ page, isSuperAdmin = false }) {
  const router = useRouter();
  const isEdit = Boolean(page?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Content
  const [title,  setTitle]  = useState(page?.title ?? '');
  const [slug,   setSlug]   = useState(page?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(isEdit);
  const [status, setStatus] = useState(page?.status ?? 'draft');

  // Source-mode — the embed mechanism (raw HTML hand-editing).
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');

  // SEO
  const [metaTitle,       setMetaTitle]       = useState(page?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(page?.metaDescription ?? '');
  const [canonicalUrl,    setCanonicalUrl]    = useState(page?.canonicalUrl ?? '');
  const [noIndex,         setNoIndex]         = useState(page?.noIndex ?? false);

  // Open Graph
  const [ogTitle,         setOgTitle]         = useState(page?.ogTitle ?? '');
  const [ogDescription,   setOgDescription]   = useState(page?.ogDescription ?? '');
  const [ogType,          setOgType]          = useState(page?.ogType ?? 'website');
  const [ogImage,         setOgImage]         = useState(page?.ogImage ?? '');
  const [ogImagePublicId, setOgImagePublicId] = useState(page?.ogImagePublicId ?? '');
  const [twitterCard,     setTwitterCard]     = useState(page?.twitterCard ?? 'summary_large_image');

  // JSON-LD
  const [jsonLdEnabled,      setJsonLdEnabled]      = useState(page?.jsonLd?.enabled ?? true);
  const [schemaType,         setSchemaType]         = useState(page?.jsonLd?.schemaType ?? 'WebPage');
  const [jsonLdOverrides,    setJsonLdOverrides]    = useState(page?.jsonLd?.overrides ?? {});
  const [rawOverride,        setRawOverride]        = useState(page?.jsonLd?.rawOverride ?? '');
  const [rawOverrideEnabled, setRawOverrideEnabled] = useState(page?.jsonLd?.rawOverrideEnabled ?? false);
  const [jsonLdPreviewOpen,  setJsonLdPreviewOpen]  = useState(false);
  const [jsonLdStatus,       setJsonLdStatus]       = useState({ status: 'unchecked', message: '' });

  // Preview-token regeneration (edit mode only)
  const [previewToken, setPreviewToken] = useState(page?.previewToken ?? '');
  const [copied, setCopied] = useState(false);

  // ── Tiptap ────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'เริ่มเขียนเนื้อหา หรือวางโค้ด embed (เช่น Google Form) ในโหมด Source HTML…' }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
      IframeNode,
      CharacterCount,
    ],
    content: page?.body ?? '',
    editorProps: {
      attributes: {
        class:
          'page-content prose prose-sm dark:prose-invert max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
    immediatelyRender: false,
  });

  const titleRef = useRef(null);
  useEffect(() => autosize(titleRef.current), [title]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleTitleChange(v) {
    setTitle(v);
    if (!slugEdited) setSlug(asciiSlugify(v));
  }

  function toggleSourceMode() {
    if (!editor) return;
    if (sourceMode) {
      editor.commands.setContent(sourceHtml || '');
      setSourceMode(false);
    } else {
      setSourceHtml(formatHTML(editor.getHTML()));
      setSourceMode(true);
    }
  }

  /**
   * Build a page-shaped object from the unsaved form state, for the
   * JSON-LD preview. We force status:'published' so the builder doesn't
   * bail mid-edit; the production render still respects status because it
   * calls buildPageJsonLd against the saved document.
   */
  function buildJsonLdPreview() {
    return buildPageJsonLd({
      ...(page ?? {}),
      slug,
      title,
      metaDescription,
      ogImage,
      canonicalUrl,
      status: 'published',
      createdAt: page?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      jsonLd: {
        enabled:    jsonLdEnabled,
        schemaType,
        overrides:  jsonLdOverrides,
        rawOverride,
        rawOverrideEnabled: isSuperAdmin && rawOverrideEnabled,
      },
    }, SITE_URL);
  }

  const submit = useCallback(() => {
    setError(null);
    if (!editor) {
      setError('Editor ยังไม่พร้อม');
      return;
    }

    const html = sourceMode ? sourceHtml : editor.getHTML();
    const trimmed = html.replace(/<p>\s*<\/p>/g, '').trim();
    if (!title.trim())     { setError('กรุณาใส่ชื่อหน้าเพจ'); return; }
    if (!slug.trim())      { setError('กรุณาใส่ slug'); return; }
    if (!SLUG_RE.test(slug)) { setError('slug ต้องเป็น a-z, 0-9 และ - เท่านั้น'); return; }
    if (!trimmed)          { setError('กรุณาใส่เนื้อหา'); return; }

    const fd = new FormData();
    fd.set('title',           title);
    fd.set('slug',            slug);
    fd.set('status',          status);
    fd.set('body',            html);
    fd.set('metaTitle',       metaTitle);
    fd.set('metaDescription', metaDescription);
    fd.set('canonicalUrl',    canonicalUrl);
    fd.set('noIndex',         String(noIndex));
    fd.set('ogTitle',         ogTitle);
    fd.set('ogDescription',   ogDescription);
    fd.set('ogType',          ogType);
    fd.set('ogImage',         ogImage);
    fd.set('ogImagePublicId', ogImagePublicId);
    fd.set('twitterCard',     twitterCard);
    fd.set('jsonLd', JSON.stringify({
      enabled:    jsonLdEnabled,
      schemaType,
      overrides:  jsonLdOverrides,
      // Raw override is superadmin-only — strip it for everyone else even
      // if the flag is somehow on.
      rawOverride:        isSuperAdmin ? rawOverride : '',
      rawOverrideEnabled: isSuperAdmin && rawOverrideEnabled,
    }));
    // slugHistory / previewToken / audit fields are server-managed — not sent.

    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateCustomPage(page._id, fd)
          : await createCustomPage(fd);
        if (!res || res.ok === false) {
          setError(res?.error ?? 'บันทึกไม่สำเร็จ');
          return;
        }
        if (isEdit) {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
          router.refresh();
        } else {
          router.push('/admin/pages');
          router.refresh();
        }
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }, [
    editor, sourceMode, sourceHtml,
    title, slug, status,
    metaTitle, metaDescription, canonicalUrl, noIndex,
    ogTitle, ogDescription, ogType, ogImage, ogImagePublicId, twitterCard,
    jsonLdEnabled, schemaType, jsonLdOverrides, rawOverride, rawOverrideEnabled,
    isSuperAdmin, isEdit, page, router,
  ]);

  async function handleRegenerateToken() {
    if (!isEdit) return;
    const res = await regeneratePreviewToken(page._id);
    if (res?.ok && res.token) {
      setPreviewToken(res.token);
      setCopied(false);
    }
  }

  const draftPreviewUrl = previewToken ? `/${slug}?preview=${previewToken}` : '';

  async function copyPreviewUrl() {
    if (!draftPreviewUrl) return;
    try {
      await navigator.clipboard.writeText(`${SITE_URL}${draftPreviewUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked — silent fallback */
    }
  }

  // ── Derived UI bits ───────────────────────────────────────────
  const slugValid = !slug || SLUG_RE.test(slug);
  const statusBadge = status === 'published'
    ? { label: 'Published', cls: 'bg-green-50 text-green-700 border-green-100' }
    : { label: 'Draft',     cls: 'bg-amber-50 text-amber-700 border-amber-100' };

  return (
    <div className="flex h-[100dvh] flex-col bg-9e-ice/30 dark:bg-[#0D1B2A]/40">
      {/* ── Header bar ──────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <div className="flex items-center gap-3 px-6 py-3">
          <Link
            href="/admin/pages"
            className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> รายการหน้าเพจ
          </Link>

          <div className="mx-auto min-w-0 flex-1 px-4">
            <p className="truncate text-center text-sm font-semibold text-9e-navy dark:text-white">
              {title || (isEdit ? 'แก้ไขหน้าเพจ' : 'สร้างหน้าเพจใหม่')}
            </p>
          </div>

          {saved && (
            <span className="text-sm font-medium text-green-600">✓ บันทึกสำเร็จ</span>
          )}

          <span className={'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' + statusBadge.cls}>
            {statusBadge.label}
          </span>

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-9e-md bg-9e-action px-3 py-1.5 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {pending ? 'กำลังบันทึก…' : (isEdit ? 'บันทึกอัปเดต' : 'บันทึก')}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex-shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Main editor column (left) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#111d2c]">
          <div className="flex-shrink-0 border-b border-[var(--surface-border)] px-6 py-2">
            <EditorToolbar
              editor={editor}
              sourceMode={sourceMode}
              onToggleSource={toggleSourceMode}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="ชื่อหน้าเพจ (แสดงเป็น H1)..."
              rows={1}
              className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight text-9e-navy outline-none placeholder:text-9e-slate-dp-50 dark:text-white"
            />

            {/* Slug + live preview */}
            <div className="mt-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-9e-slate-dp-50">{SITE_URL}/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }}
                  placeholder="my-page-slug"
                  className={
                    'flex-1 rounded-9e-md border bg-white px-3 py-1.5 font-mono text-sm text-9e-navy focus:outline-none focus:ring-1 dark:bg-[#0D1B2A] dark:text-white ' +
                    (slugValid
                      ? 'border-[var(--surface-border)] focus:ring-9e-action'
                      : 'border-red-300 focus:ring-red-400')
                  }
                />
              </div>
              {!slugValid && (
                <p className="mt-1 text-xs text-red-600">
                  slug ต้องเป็นตัวอักษร a-z, ตัวเลข 0-9 และ - เท่านั้น (ห้ามเว้นวรรค/อักษรไทย)
                </p>
              )}
            </div>

            <hr className="my-4 border-[var(--surface-border)]" />

            {sourceMode ? (
              <textarea
                value={sourceHtml}
                onChange={(e) => setSourceHtml(e.target.value)}
                rows={20}
                spellCheck={false}
                placeholder='วางโค้ด embed ที่นี่ เช่น <iframe src="https://docs.google.com/forms/..."></iframe>'
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
        </div>

        {/* Sidebar (right) — independent scroll. */}
        <aside className="w-80 flex-shrink-0 space-y-4 overflow-y-auto border-l border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
          {/* Status */}
          <Section title="สถานะ" defaultOpen>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputCls}
            >
              <option value="draft">ฉบับร่าง (Draft)</option>
              <option value="published">เผยแพร่ (Published)</option>
            </select>
          </Section>

          {/* SEO */}
          <Section title="SEO">
            <Label text={`Meta Title (${metaTitle.length}/60)`}>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value.slice(0, 60))}
                className={inputCls}
              />
            </Label>
            <Label text={`Meta Description (${metaDescription.length}/160)`} className="mt-3">
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value.slice(0, 160))}
                rows={3}
                className={inputCls}
              />
            </Label>
            <Label text="Canonical URL" className="mt-3">
              <input
                type="text"
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                placeholder={`${SITE_URL}/${slug || '<slug>'}`}
                className={inputCls + ' font-mono text-xs'}
              />
            </Label>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={noIndex}
                onChange={(e) => setNoIndex(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs text-9e-navy dark:text-white">
                ไม่ให้ค้นหา (noindex,nofollow)
              </span>
            </label>
          </Section>

          {/* Open Graph */}
          <Section title="Open Graph / Social">
            <Label text="OG Title">
              <input
                type="text"
                value={ogTitle}
                onChange={(e) => setOgTitle(e.target.value)}
                placeholder="ถ้าว่างจะใช้ Meta Title"
                className={inputCls}
              />
            </Label>
            <Label text="OG Description" className="mt-3">
              <textarea
                value={ogDescription}
                onChange={(e) => setOgDescription(e.target.value)}
                rows={2}
                placeholder="ถ้าว่างจะใช้ Meta Description"
                className={inputCls}
              />
            </Label>
            <Label text="OG Type" className="mt-3">
              <select
                value={ogType}
                onChange={(e) => setOgType(e.target.value)}
                className={inputCls}
              >
                <option value="website">website</option>
                <option value="article">article</option>
              </select>
            </Label>

            <div className="mt-3">
              <span className="text-xs font-medium text-9e-navy dark:text-white">OG Image</span>
              <p className="mt-0.5 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
                แนะนำขนาด 1200×630 px
              </p>
              <OgImageField
                url={ogImage}
                onChange={(url, publicId) => {
                  setOgImage(url);
                  setOgImagePublicId(publicId ?? '');
                }}
              />
            </div>

            <Label text="Twitter Card" className="mt-3">
              <select
                value={twitterCard}
                onChange={(e) => setTwitterCard(e.target.value)}
                className={inputCls}
              >
                <option value="summary_large_image">summary_large_image</option>
                <option value="summary">summary</option>
              </select>
            </Label>
          </Section>

          {/* JSON-LD */}
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
              setJsonLdStatus(validatePageJsonLd(preview));
              setJsonLdPreviewOpen(true);
            }}
            onCopy={async () => {
              try {
                const preview = buildJsonLdPreview();
                await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
                setJsonLdStatus(validatePageJsonLd(preview));
              } catch {
                /* clipboard may be blocked — silent fallback */
              }
            }}
          />

          {/* Draft preview link — edit mode only */}
          {isEdit && previewToken && (
            <Section title="ลิงก์พรีวิวฉบับร่าง">
              <p className="text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
                ใช้ดูหน้าเพจก่อนเผยแพร่ — เส้นทางสาธารณะที่รองรับ token นี้
                จะเปิดใช้งานใน Batch 3 (ตอนนี้ลิงก์ยังเปิดไม่ได้)
              </p>
              <div className="mt-2 flex items-center gap-1">
                <input
                  type="text"
                  readOnly
                  value={draftPreviewUrl}
                  className="flex-1 truncate rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-2 py-1.5 font-mono text-[11px] text-9e-slate-dp-50 dark:bg-[#0D1B2A]"
                />
                <button
                  type="button"
                  onClick={copyPreviewUrl}
                  title="คัดลอกลิงก์"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-9e-md border border-[var(--surface-border)] text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {copied && <p className="mt-1 text-[11px] text-green-600">คัดลอกแล้ว</p>}
              <button
                type="button"
                onClick={handleRegenerateToken}
                className="mt-2 inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                <RefreshCw className="h-3 w-3" /> สร้าง token ใหม่
              </button>
            </Section>
          )}
        </aside>
      </div>

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

// ── OG image upload field (captures both url + publicId) ──────────

function OgImageField({ url, onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'custom-pages');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || `Upload failed (${res.status})`);
      onChange(data.url, data.publicId ?? '');
    } catch (e2) {
      setErr(e2?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="mt-1 space-y-2">
      {url ? (
        <div
          className="relative overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]"
          style={{ aspectRatio: '1200/630', maxWidth: 320 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="og preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange('', '')}
            aria-label="ลบรูป"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-9e-md border border-dashed border-[var(--surface-border)] bg-9e-ice text-9e-slate-dp-50 dark:bg-[#0D1B2A]"
          style={{ aspectRatio: '1200/630', maxWidth: 320 }}
        >
          <ImageIcon className="h-8 w-8 opacity-40" aria-hidden="true" />
        </div>
      )}

      <label
        className={
          'flex w-full cursor-pointer items-center justify-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium ' +
          (uploading ? 'opacity-50' : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
        }
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? 'กำลังอัปโหลด…' : url ? 'เปลี่ยนรูป' : 'อัปโหลด'}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={handleFile}
          className="hidden"
        />
      </label>

      <input
        type="text"
        value={url}
        onChange={(e) => onChange(e.target.value, '')}
        placeholder="หรือวาง URL ตรงนี้"
        className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1.5 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
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
    { key: 'name',          label: 'Name',          ph: 'ปล่อยว่าง = ใช้ชื่อหน้าเพจ' },
    { key: 'description',   label: 'Description',   ph: 'ปล่อยว่าง = ใช้ Meta Description' },
    { key: 'image',         label: 'Image URL',     ph: 'ปล่อยว่าง = ใช้ OG Image' },
    { key: 'datePublished', label: 'Date Published', ph: 'ISO date (ปล่อยว่าง = วันที่สร้าง)' },
    { key: 'dateModified',  label: 'Date Modified',  ph: 'ISO date (ปล่อยว่าง = วันที่แก้ไข)' },
  ];
  const statusStyle = JSONLD_STATUS_STYLE[status.status] ?? JSONLD_STATUS_STYLE.unchecked;

  return (
    <section className="space-y-3 rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-9e-navy dark:text-white">JSON-LD / Schema</h3>
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
              {['WebPage', 'FAQPage', 'Article', 'BreadcrumbList'].map((t) => (
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
              ตรวจสอบ JSON-LD
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#0D1B2A]"
            >
              Copy
            </button>
          </div>

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

// ── Collapsible sidebar section ──────────────────────────────────

function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <h3 className="text-sm font-bold text-9e-navy dark:text-white">{title}</h3>
        <ChevronDown
          className={'h-4 w-4 text-9e-slate-dp-50 transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
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

function EditorToolbar({ editor, sourceMode, onToggleSource }) {
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
    fd.append('folder', 'custom-pages');
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed');
      chain().setImage({ src: data.url }).run();
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
        <span>กำลังแก้ไข HTML ดิบ — วางโค้ด embed ได้ที่นี่ แล้วกดเพื่อกลับสู่โหมดปกติ</span>
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
      <ToolbarButton title="Source HTML (วาง embed)" onClick={onToggleSource} active={sourceMode}> <FileCode className="h-4 w-4" /> </ToolbarButton>

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
