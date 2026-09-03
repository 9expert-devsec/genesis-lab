'use client';

import { useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon, Copy, RefreshCw } from 'lucide-react';
import { isReservedSlug } from '@/lib/pages/reservedSlugs';
import {
  PAGE_SETTINGS_SECTIONS, SettingsNav, SettingsFooterBand,
} from '@/components/admin/pageSettings/SettingsShell';
import {
  Field, Group, TextInput, TextArea, Warn, INPUT_CLASS,
} from '@/components/pageBuilder/editor/fields';

/**
 * The Advanced HTML editor's page settings — THE SAME DIALOG as the Page
 * Builder's, not a second one that resembles it.
 *
 * ── WHAT "THE SAME" MEANS MECHANICALLY ─────────────────────────────────────
 * The frame, the 93px header band, the menu and the 66px footer band are
 * imported from src/components/admin/pageSettings/SettingsShell.jsx — the same
 * module the builder's dialog imports. The six menu items come from
 * PAGE_SETTINGS_SECTIONS, imported rather than retyped, so the two menus cannot
 * drift apart: renaming a label in the shell renames it in both, and there is no
 * second array anyone could edit alone. Every field uses the shared `./fields`
 * primitives, so a field here looks and behaves like a field there.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM CustomPageForm ────────────────────────
 * Two walls, both measured rather than assumed, and both the same ones that
 * made the builder's dialog untestable:
 *
 *   · a Radix `Dialog.Portal` renders ZERO BYTES under renderToStaticMarkup, so
 *     anything inside the portal is unreachable from the render tier;
 *   · CustomPageForm itself cannot be rendered in that tier AT ALL — it calls
 *     `useEditor()` from @tiptap/react at the top of its body, and importing the
 *     module drags the whole Tiptap graph in with it.
 *
 * So the BODY is here, exported, and takes plain props. The thin Radix wrapper
 * is in CustomPageSettingsDialog.jsx. That is the same split, for the same
 * reason, as PageSettingsBody (round 27) and SectionPickerBody (rounds 9/13).
 *
 * ── NO STATE OF ITS OWN, DELIBERATELY ──────────────────────────────────────
 * Every value below is CustomPageForm's existing `useState` handed down. The H1
 * title textarea and the slug bar stay in the editor column and edit the SAME
 * `title` / `slug` — two inputs over one piece of state, not two copies that can
 * disagree. A second state here would be the classic two-authorities defect: the
 * dialog and the editor column each believing they own the title.
 */

/**
 * ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────
 * ชนิดหน้า and ธีม. The builder's ข้อมูลหน้า group carries both because
 * PageBuilder stores `pageType` and `theme` and the render path reads them.
 * `CustomPage` has NEITHER field. A disabled control, or one wired to a value
 * nothing stores, would be exactly the claim-with-no-source this dialog's own
 * JSON-LD note refuses. So the group has three fields and says nothing about
 * the two it does not have.
 */
function GeneralSection({
  title, onTitleChange, slug, onSlugChange, status, setStatus,
}) {
  const slugStr = String(slug ?? '');
  const slugBadFormat = slugStr !== '' && !/^[a-z0-9-]+$/.test(slugStr);
  const slugReserved = slugStr !== '' && isReservedSlug(slugStr);
  const titleEmpty = !String(title ?? '').trim();

  return (
    <Group title="ทั่วไป">
      <Field label="ชื่อหน้า" hint="ใช้ในระบบหลังบ้านและแสดงเป็น H1 บนหน้าเพจ">
        <TextInput value={title} onChange={onTitleChange} invalid={titleEmpty} />
      </Field>
      {titleEmpty && <Warn tone="red">ต้องมีชื่อหน้า — บันทึกไม่ได้ถ้าเว้นว่าง</Warn>}

      <Field label="URL (slug)" hint="a-z, 0-9 และ - เท่านั้น">
        <TextInput value={slug} onChange={onSlugChange} invalid={slugBadFormat || slugReserved} />
      </Field>
      {slugBadFormat && <Warn tone="red">slug ต้องเป็น a-z, 0-9 และ - เท่านั้น</Warn>}
      {slugReserved && <Warn tone="red">slug นี้ถูกสงวนไว้สำหรับหน้าระบบ — ใช้ไม่ได้</Warn>}
      {/* Cross-collection collisions (PageBuilder ↔ CustomPage, including each
          one's slugHistory) can only be checked server-side — slugGuard imports
          both models. The save surfaces that as an error without dropping the
          draft; it is not knowable here. */}

      <Field label="สถานะ">
        <select className={INPUT_CLASS} value={status}
          onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">ฉบับร่าง (Draft)</option>
          <option value="published">เผยแพร่ (Published)</option>
        </select>
      </Field>
    </Group>
  );
}

/**
 * SEO, as TWO groups under one menu item.
 *
 * ── WHY OPEN GRAPH IS NOT A SEVENTH MENU ITEM ─────────────────────────────
 * `CustomPage` stores five OG fields the builder does not — ogTitle,
 * ogDescription, ogType, ogImage/ogImagePublicId and twitterCard — so this
 * editor genuinely has one more group's worth of settings than the builder.
 * That is a reason for a second `<Group>`, not for a second menu item: the menu
 * is the part that must stay identical across the two dialogs, and adding an
 * item to one of them is precisely the drift the shared PAGE_SETTINGS_SECTIONS
 * exists to prevent.
 */
function SeoSection({
  metaTitle, setMetaTitle, metaDescription, setMetaDescription,
  canonicalUrl, setCanonicalUrl, noIndex, setNoIndex,
  ogTitle, setOgTitle, ogDescription, setOgDescription, ogType, setOgType,
  ogImage, onOgImageChange, twitterCard, setTwitterCard,
}) {
  return (
    <>
      <Group title="SEO">
        <Field label="Meta title" hint={`${String(metaTitle ?? '').length}/60 — เว้นว่างเพื่อใช้ชื่อหน้า`}>
          {/* The .slice(0, 60) is the form's existing hard cap and travels with
              the field: this input has never allowed a 61st character, so a
              counter that could read 61 would be describing a state the control
              cannot reach. */}
          <TextInput value={metaTitle} onChange={(v) => setMetaTitle(v.slice(0, 60))} />
        </Field>
        <Field label="Meta description" hint={`${String(metaDescription ?? '').length}/160`}>
          <TextArea value={metaDescription} onChange={(v) => setMetaDescription(v.slice(0, 160))} rows={2} />
        </Field>
        <Field label="Canonical URL" hint="เว้นว่างเพื่อใช้ URL ของหน้านี้">
          <TextInput value={canonicalUrl} onChange={setCanonicalUrl} />
        </Field>
        <label className="mb-2.5 flex items-center gap-1.5 text-xs text-9e-navy dark:text-white/90">
          <input type="checkbox" checked={Boolean(noIndex)}
            onChange={(e) => setNoIndex(e.target.checked)} />
          ไม่ให้ Google เก็บหน้านี้ (noindex)
        </label>
      </Group>

      <Group title="Open Graph / Social">
        <Field label="OG title" hint="เว้นว่างเพื่อใช้ Meta title">
          <TextInput value={ogTitle} onChange={setOgTitle} />
        </Field>
        <Field label="OG description" hint="เว้นว่างเพื่อใช้ Meta description">
          <TextArea value={ogDescription} onChange={setOgDescription} rows={2} />
        </Field>
        <Field label="OG type">
          <select className={INPUT_CLASS} value={ogType}
            onChange={(e) => setOgType(e.target.value)}>
            <option value="website">website</option>
            <option value="article">article</option>
          </select>
        </Field>
        {/*
          UNLIKE the builder's SEO group, this OG image IS an uploader, and that
          difference is load-bearing rather than cosmetic. `ogImagePublicId` is
          the Cloudinary ownership token, and deleteCustomPage destroys the asset
          it names — so the uploader must keep writing BOTH halves. It always has;
          `onOgImageChange(url, publicId)` is the form's existing two-value setter
          and is passed straight through. Pasting a URL by hand clears the token,
          which is correct: a pasted URL is not ours to delete.
        */}
        <Field label="OG image" hint="แนะนำขนาด 1200×630 px">
          <OgImageField url={ogImage} onChange={onOgImageChange} />
        </Field>
        <Field label="Twitter card">
          <select className={INPUT_CLASS} value={twitterCard}
            onChange={(e) => setTwitterCard(e.target.value)}>
            <option value="summary_large_image">summary_large_image</option>
            <option value="summary">summary</option>
          </select>
        </Field>
      </Group>
    </>
  );
}

// ── OG image upload field (captures both url + publicId) ──────────
//
// MOVED from CustomPageForm.jsx unchanged — every className, the 1200/630 frame,
// the upload folder and the two-value onChange included. It is here rather than
// there because this module must not import CustomPageForm (Tiptap), and the
// dependency has to point one way.

export function OgImageField({ url, onChange }) {
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
//
// MOVED from CustomPageForm.jsx unchanged: the enable toggle, the schema type,
// the five overrides, the status badge, the preview and copy buttons and the
// superadmin raw-override gate.
//
// ── THIS IS THE OPPOSITE OF THE BUILDER'S JSON-LD TAB, ON PURPOSE ─────────
// The builder's is a placeholder that says in words that nothing emits JSON-LD
// for a Page Builder page, because measurably nothing does. A CustomPage has a
// REAL generator — lib/customPages/buildPageJsonLd, called by the public
// catch-all route — so the real controls belong here and the builder's
// placeholder text emphatically does not travel with them. Two sections, one
// menu item, each telling the truth about its own page type.

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

/**
 * ── THE PROP NAMES ARE QUALIFIED, AND THAT IS THE ONE THING THAT CHANGED ──
 * Every control below is the JSX that was in the sidebar. What could not survive
 * verbatim is four prop NAMES: the sections all read from one flat prop bag, and
 * `status` is already the page's draft/published state while `onCopy` is already
 * the preview link's copy button. Two sections silently sharing one prop is the
 * defect this rename removes, so `status` → `jsonLdStatus`, `enabled` →
 * `jsonLdEnabled`, `overrides` → `jsonLdOverrides`, and the two handlers take a
 * `JsonLd` qualifier. No control, label, placeholder or behaviour moved with it.
 */
export function JsonLdSection({
  jsonLdEnabled, setJsonLdEnabled,
  schemaType, setSchemaType,
  jsonLdOverrides, setJsonLdOverrides,
  rawOverride, setRawOverride,
  rawOverrideEnabled, setRawOverrideEnabled,
  jsonLdStatus,
  isSuperAdmin,
  onJsonLdPreview,
  onJsonLdCopy,
}) {
  const enabled = jsonLdEnabled;
  const setEnabled = setJsonLdEnabled;
  const overrides = jsonLdOverrides;
  const setOverrides = setJsonLdOverrides;
  const status = jsonLdStatus;
  const onPreview = onJsonLdPreview;
  const onCopy = onJsonLdCopy;
  const overrideFields = [
    { key: 'name',          label: 'Name',          ph: 'ปล่อยว่าง = ใช้ชื่อหน้าเพจ' },
    { key: 'description',   label: 'Description',   ph: 'ปล่อยว่าง = ใช้ Meta Description' },
    { key: 'image',         label: 'Image URL',     ph: 'ปล่อยว่าง = ใช้ OG Image' },
    { key: 'datePublished', label: 'Date Published', ph: 'ISO date (ปล่อยว่าง = วันที่สร้าง)' },
    { key: 'dateModified',  label: 'Date Modified',  ph: 'ISO date (ปล่อยว่าง = วันที่แก้ไข)' },
  ];
  const statusStyle = JSONLD_STATUS_STYLE[status.status] ?? JSONLD_STATUS_STYLE.unchecked;

  return (
    <Group title="JSON-LD / Schema">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-xs text-9e-navy dark:text-white/90">เปิดใช้ JSON-LD</span>
        </label>
        <StatusChip status={status.status} />
      </div>

      {enabled && (
        <>
          <Field label="ประเภท Schema">
            <select
              className={INPUT_CLASS}
              value={schemaType}
              onChange={(e) => setSchemaType(e.target.value)}
            >
              {['WebPage', 'FAQPage', 'Article', 'BreadcrumbList'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          {overrideFields.map(({ key, label, ph }) => (
            <Field key={key} label={label}>
              <TextInput
                value={overrides?.[key] ?? ''}
                onChange={(v) => setOverrides((prev) => ({ ...prev, [key]: v }))}
                placeholder={ph}
              />
            </Field>
          ))}

          {status.message && (
            <p className={'mb-2 text-xs ' + statusStyle.text}>{status.message}</p>
          )}

          <div className="mb-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPreview}
              className="flex-1 rounded-9e-sm border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
            >
              ตรวจสอบ JSON-LD
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 rounded-9e-sm border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
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
                <TextArea
                  value={rawOverride}
                  onChange={setRawOverride}
                  rows={6}
                  mono
                  placeholder='{"@context":"https://schema.org",...}'
                />
              )}
            </div>
          )}
        </>
      )}
    </Group>
  );
}

export function JsonLdPreviewOverlay({ jsonLd, status, onClose }) {
  const statusStyle = JSONLD_STATUS_STYLE[status.status] ?? JSONLD_STATUS_STYLE.unchecked;
  return (
    // z-[80] sits ABOVE the settings dialog's z-50 content, so the preview opens
    // over the dialog that launched it rather than behind it.
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

/**
 * ลิงก์พรีวิว — the draft preview link.
 *
 * ── IT IS NOT THE BUILDER'S PREVIEW, AND IT CANNOT BE ─────────────────────
 * The builder's `PreviewBody` manages a bcrypt-hashed password and an expiry
 * date through five server actions that read and write `PageBuilder.preview`.
 * `CustomPage` has one field — `previewToken`, a randomUUID string — and one
 * action, `regeneratePreviewToken`. Nothing about those five actions applies, so
 * this section is the form's existing block rather than a reuse.
 *
 * ── THE COPY IS CORRECTED IN THIS MOVE, AND THAT IS DELIBERATE ────────────
 * The sidebar said the link "จะเปิดใช้งานใน Batch 3 (ตอนนี้ลิงก์ยังเปิดไม่ได้)".
 * That has been false since the public catch-all route learned to honour the
 * token: (public)/[...slug]/page.jsx reads `?preview=<token>` and returns the
 * draft when it matches. Carrying a known-false sentence into a new surface
 * would be the same class of defect as a control wired to nothing, so the claim
 * is dropped and replaced with what the route actually does.
 */
function PreviewSection({
  isEdit, previewToken, draftPreviewUrl, copied,
  onCopyPreviewUrl, onRegenerateToken,
}) {
  if (!isEdit || !previewToken) {
    return (
      <Group title="ลิงก์พรีวิว">
        <p className="mb-2.5 text-xs text-9e-slate-dp-50">
          ลิงก์พรีวิวจะถูกสร้างขึ้นเมื่อบันทึกหน้านี้ครั้งแรก — หลังจากนั้นจะแสดงที่นี่
          พร้อมปุ่มคัดลอกและปุ่มสร้าง token ใหม่
        </p>
      </Group>
    );
  }

  return (
    <Group title="ลิงก์พรีวิว">
      <p className="mb-2.5 text-xs text-9e-slate-dp-50">
        เปิดดูหน้านี้ได้โดยไม่ต้องเผยแพร่ — ใครก็ตามที่มีลิงก์นี้จะเห็นเนื้อหาฉบับร่าง
        กด “สร้าง token ใหม่” เพื่อยกเลิกลิงก์เดิมทั้งหมด
      </p>
      <Field label="ลิงก์">
        <input
          type="text"
          readOnly
          value={draftPreviewUrl}
          className={INPUT_CLASS + ' font-mono'}
        />
      </Field>
      <div className="mb-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopyPreviewUrl}
          className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
        </button>
        <button
          type="button"
          onClick={onRegenerateToken}
          className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> สร้าง token ใหม่
        </button>
      </div>
    </Group>
  );
}

/**
 * ประวัติการเผยแพร่ and ประวัติการดำเนินการ — RENDERED, TRUTHFUL, AND EMPTY.
 *
 * ── WHY THE ITEMS ARE NOT HIDDEN ──────────────────────────────────────────
 * Neither history is recorded for this page type. `PageVersion` snapshots
 * PageBuilder pages only and there is no CustomPage equivalent anywhere in the
 * repo; `lib/actions/customPages.js` has five mutating actions and calls
 * `recordAdminAction` zero times, against an audit-contract pair
 * (auditContract.js, 'pages'/'custom') that has existed for rounds with nothing
 * writing rows for it.
 *
 * The honest response is the one the builder's JSON-LD section already
 * establishes: keep the menu item, and say in words what is not there. Hiding
 * it would read as "I could not find it", which is worse than "there is none
 * yet" — and an author who goes looking for history deserves to learn which of
 * the two it is. Never a list, never a spinner, never a fabricated row, and
 * never a control that would imply the data exists.
 */
function HistorySection() {
  return (
    <Group title="ประวัติการเผยแพร่">
      <p className="mb-2 text-xs text-9e-slate-dp-50">
        ยังไม่มีการเก็บประวัติเวอร์ชันสำหรับหน้าเพจแบบ HTML ขั้นสูง — การบันทึกแต่ละครั้ง
        เขียนทับเนื้อหาเดิม และไม่มีสำเนาเก่าให้ย้อนกลับ
      </p>
      <p className="text-xs text-9e-slate-dp-50">
        เมื่อระบบเก็บเวอร์ชันให้แล้ว ส่วนนี้จะแสดงรายการเวอร์ชันที่เคยเผยแพร่
        พร้อมวันที่และผู้บันทึก
      </p>
    </Group>
  );
}

function ActivitySection() {
  return (
    <Group title="ประวัติการดำเนินการ">
      <p className="mb-2 text-xs text-9e-slate-dp-50">
        ยังไม่มีการบันทึกประวัติการดำเนินการสำหรับหน้าเพจแบบ HTML ขั้นสูง — การสร้าง
        แก้ไข ลบ และเปลี่ยนสถานะของหน้านี้ยังไม่ถูกเขียนลงบันทึกการใช้งาน
      </p>
      <p className="text-xs text-9e-slate-dp-50">
        เมื่อระบบบันทึกให้แล้ว ส่วนนี้จะแสดงว่าใครทำอะไรกับหน้านี้เมื่อไร
        แบบเดียวกับหน้าที่สร้างด้วย Page Builder
      </p>
    </Group>
  );
}

/**
 * The footer band's sentence for THIS editor.
 *
 * The builder's band says the system saves automatically, because it does. This
 * one does not, because this form persists nothing until the save button in its
 * header bar is pressed. Same band, same geometry, opposite fact — which is the
 * whole reason the band takes its text as children.
 */
export function customPageSaveStateText(isEdit) {
  return `การตั้งค่าจะถูกบันทึกเมื่อกดปุ่ม “${isEdit ? 'บันทึกอัปเดต' : 'บันทึก'}” — หน้านี้ไม่มีการบันทึกอัตโนมัติ`;
}

/**
 * ── THE JSON-LD PREVIEW MODAL IS MOUNTED BY THE FORM, NOT BY THIS BODY ─────
 * Its button lives in the JSON-LD section here, but the overlay itself is
 * rendered at CustomPageForm's root. Two reasons, and neither is style:
 *
 *   · it is `fixed inset-0 z-[80]`, above the dialog's `z-50` content, so where
 *     it sits in the DOM changes nothing about where it appears;
 *   · mounting it inside the dialog would make it unreachable the moment the
 *     dialog closed, and the sidebar's copy of the same button (which exists
 *     until the sidebar is removed) would have opened a modal that renders
 *     nowhere. One overlay, one mount point, either opener.
 */
export function CustomPageSettingsBody(props) {
  const { initialSection, isEdit } = props;
  const [section, setSection] = useState(initialSection ?? PAGE_SETTINGS_SECTIONS[0].id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/*
          THE SAME NAV COMPONENT the builder renders, given the SAME array.
          `previewStatus` is null and stays null: that dot reports a builder
          preview-access state read from the server by getPreviewState, and
          CustomPage has no such state to report. An unknown shown as "on" would
          be a claim; null renders no dot, which is the honest answer.
        */}
        <SettingsNav
          section={section}
          onSelect={setSection}
          previewStatus={null}
          sections={PAGE_SETTINGS_SECTIONS}
        />

        <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-7 pt-5">
          {section === 'general' && <GeneralSection {...props} />}
          {section === 'seo' && <SeoSection {...props} />}
          {section === 'jsonld' && <JsonLdSection {...props} />}
          {section === 'preview' && <PreviewSection {...props} />}
          {section === 'history' && <HistorySection />}
          {section === 'activity' && <ActivitySection />}
        </div>
      </div>

      <SettingsFooterBand>{customPageSaveStateText(isEdit)}</SettingsFooterBand>
    </div>
  );
}
