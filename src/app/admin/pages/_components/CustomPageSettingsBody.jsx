'use client';

import { useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon, Copy, RefreshCw } from 'lucide-react';
import { isReservedSlug } from '@/lib/pages/reservedSlugs';
import {
  PAGE_SETTINGS_SECTIONS, SettingsNav, SettingsFooterBand,
} from '@/components/admin/pageSettings/SettingsShell';
/**
 * The ชนิดหน้า labels and the promotion cover uploader — THE SAME ONES the
 * builder's dialog uses, not a second pair. ADDED beside the statement above
 * rather than folded into it — the standing rule.
 *
 * PAGE_TYPE_LABELS is a superset keyed by value; this editor maps over
 * CUSTOM_PAGE_TYPES (two) and looks up only those.
 */
import {
  PAGE_TYPE_LABELS, PromoCoverField,
} from '@/components/admin/pageSettings/SettingsShell';
import { CUSTOM_PAGE_TYPES } from '@/lib/schemas/customPage';
import {
  Field, Group, TextInput, TextArea, Warn, INPUT_CLASS,
} from '@/components/pageBuilder/editor/fields';
/**
 * The builder's activity list, reused rather than reimplemented. ADDED beside
 * the statements above rather than folded into any — the standing rule.
 *
 * `getPageAuditLog` filters on pageId alone, so this component renders a
 * CustomPage's rows with no change to either side. See ActivitySection.
 */
import { ActivityTrail } from '@/components/pageBuilder/editor/ActivityTrail';

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
 * Every value below is CustomPageForm's existing `useState` handed down. A
 * second state here would be the classic two-authorities defect: the dialog and
 * the editor column each believing they own the value.
 *
 * ── THE TITLE IS STILL IN TWO PLACES; THE SLUG IS NOT ANY MORE ─────────────
 * This note used to say "the H1 title textarea and the slug bar stay in the
 * editor column and edit the SAME title / slug — two inputs over one piece of
 * state". Half of that is now false, and the half that changed is the half a
 * reader would act on.
 *
 * `title` is still two inputs over one state: the H1 textarea in the main column
 * and the ชื่อหน้า field here. That is fine precisely BECAUSE they share the
 * state — they cannot disagree.
 *
 * `slug` is now edited HERE AND NOWHERE ELSE. The main column's row was removed,
 * so this field is the only way to type one by hand, and two things depend on
 * that being true: the title → slug cascade in CustomPageForm (which is what
 * fills the slug on a new page without anyone opening this dialog), and
 * `onSlugChange` setting `slugEdited` (which is what stops the cascade once an
 * author claims the slug). Re-adding an input elsewhere would put that pair back
 * into two places.
 */

/**
 * ── ชนิดหน้า IS HERE NOW; ธีม STILL IS NOT ─────────────────────────────────
 * This note used to say both were absent "because `CustomPage` has NEITHER
 * field". That was true when it was written and half of it is now false:
 * CustomPage stores `pageType`, and three things read it — the /promotions grid
 * query, the catch-all's bare-slug redirect, and the promotion slug guard. So
 * the control ships, with the two fields that are only meaningful beside it.
 *
 * ธีม IS STILL ABSENT, and the original reasoning is what keeps it out rather
 * than an oversight: `CustomPageView` reads no theme at all — it renders one
 * sanitised body inside a fixed `prose` wrapper. A ธีม select here would be a
 * control wired to a value nothing renders, which is exactly the
 * claim-with-no-source this dialog's own JSON-LD note refuses. It ships when a
 * render path reads it, not before.
 *
 * ── THE PROMOTION FIELDS ARE CONDITIONAL, MATCHING THE BUILDER ────────────
 * ลำดับในหน้าโปรโมชัน and ภาพปกโปรโมชัน appear only while ชนิดหน้า is
 * โปรโมชัน — the same shape as PageSettingsDialog's own promotion block, so an
 * admin who knows one editor knows this one. The VALUES are kept when the type
 * flips back (the actions store them unconditionally), so hiding the controls
 * never destroys an arrangement; only the display is conditional.
 *
 * There is deliberately no Promotion ID (MSDB) field. An Advanced HTML promotion
 * is always standalone, and lib/schemas/customPage.js holds the reason — the
 * one-page-per-promotion invariant `setPromotionPageLink` enforces with a
 * collection-wide updateMany — plus what would have to change first.
 *
 * ── THE TWO FIELDS SIT ON OPPOSITE SIDES OF THE DRAFT PARTITION ───────────
 * ชนิดหน้า and ลำดับ are LIVE-ONLY: บันทึกฉบับร่าง writes them straight to the
 * live document, so a published page flipped to โปรโมชัน starts redirecting at
 * once. ภาพปก is DRAFTED like the body. The warning below says so, because an
 * author pressing one button and getting two different timings deserves to be
 * told rather than to discover it on the live site.
 */
function GeneralSection({
  title, onTitleChange, slug, onSlugChange, status, setStatus,
  isEdit, onUnpublish,
  pageType, setPageType, promotionOrder, setPromotionOrder,
  promotionCover, setPromotionCover,
  slugErrorAt = 0, slugError = '',
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

      {/*
        ── THIS IS NOW THE ONLY SLUG INPUT IN THE EDITOR ────────────────────
        The main column's row — the https://9experttraining.com/ prefix, the
        input, the red ring and the error line — was REMOVED, not duplicated:
        the two were always views of one `slug` state, and one view stopped
        being drawn. Everything that depended on being able to SEE the field
        while saving now depends on this one, which is why the two additions
        below exist.

        `autoFocus` fires because a refused save REMOUNTS this body (the dialog
        keys on slugErrorAt), so it lands on the field rather than merely on the
        section. Gated on the nonce: an ordinary open must not steal focus.
      */}
      <Field label="URL (slug)" hint="a-z, 0-9 และ - เท่านั้น">
        <TextInput
          value={slug}
          onChange={onSlugChange}
          invalid={slugBadFormat || slugReserved || Boolean(slugError)}
          autoFocus={slugErrorAt > 0}
          data-testid="custom-page-slug-input"
        />
      </Field>
      {slugBadFormat && <Warn tone="red">slug ต้องเป็น a-z, 0-9 และ - เท่านั้น</Warn>}
      {slugReserved && <Warn tone="red">slug นี้ถูกสงวนไว้สำหรับหน้าระบบ — ใช้ไม่ได้</Warn>}
      {/*
        THE SERVER'S REFUSAL, SHOWN WHERE THE FIELD IS.
        Cross-collection collisions (PageBuilder ↔ CustomPage, including each
        one's slugHistory) and MSDB promotion collisions can only be checked
        server-side — slugGuard imports four models — so they are not knowable
        from here and the two local warnings above cannot cover them.

        Before the main-column input was removed, a refusal like "Slug นี้ถูกใช้แล้ว"
        was readable in the header band NEXT TO the field it was about. Now the
        field is behind a dialog that is shut when บันทึกฉบับร่าง is pressed, so
        the message is carried in and rendered here as well. The header band
        still shows it too — this is an addition, not a relocation, and both read
        the same `error` state so they cannot disagree.
      */}
      {/*
        No data-testid: `Warn` does not spread unknown props onto its <p>, so one
        would be dropped silently and a test hunting for it would fail for a
        reason that has nothing to do with this field. It already renders
        role="alert", which is both the accessible answer and the honest hook.
      */}
      {slugError && <Warn tone="red">{slugError}</Warn>}

      {/*
        ── สถานะ IS A TAKEDOWN CONTROL, NOT A SECOND PUBLISH PATH ─────────────
        The draft split made exactly one thing able to publish: the เผยแพร่
        button, which promotes the pending draft. If this select could also
        publish, it would publish the STALE live content while the new content
        sat in the draft — the precise defect the split removes.
        `saveCustomPageDraft` refuses to write `status` at all, so the defect is
        already impossible server-side; this is the UI half saying so.

        IT IS NOT DELETED, AND THAT IS THE POINT. The Page Builder can drop its
        status control because PublishDialog is that concept's home. This form
        has no such home, so removing the select would silently delete the only
        way to take a published page back DOWN — the button pair offers no way
        down, only up. Losing a working capability is worse than the defect.

        So: taking it to ฉบับร่าง unpublishes IMMEDIATELY (a takedown that waits
        for a publish step is a takedown that does not work), and it does NOT
        touch the draft — a page taken down keeps its pending work, and
        discarding that is ทิ้งฉบับร่าง's job and nothing else's.

        The เผยแพร่ option is DISABLED rather than removed while the page is not
        published, with a hint naming the button that does it. A disabled option
        with a reason teaches the model; a removed one just puzzles.

        CREATE MODE keeps the plain two-way control: there is no live page to
        protect and no document to unpublish, so `status` simply rides along in
        the create payload as it always did.
      */}
      <Field label="สถานะ">
        <select
          className={INPUT_CLASS}
          value={status}
          data-testid="custom-page-status-select"
          onChange={(e) => {
            const next = e.target.value;
            if (!isEdit) { setStatus(next); return; }
            if (next === 'draft' && status === 'published') onUnpublish();
          }}
        >
          <option value="draft">ฉบับร่าง (Draft)</option>
          <option value="published" disabled={isEdit && status !== 'published'}>
            เผยแพร่ (Published)
          </option>
        </select>
      </Field>
      {isEdit && status !== 'published' && (
        <Warn>
          การเผยแพร่ทำได้จากปุ่ม “เผยแพร่” ด้านบนเท่านั้น — เพื่อให้หน้าจริงได้เนื้อหาฉบับร่างล่าสุด
          ไม่ใช่เนื้อหาเดิมที่ค้างอยู่
        </Warn>
      )}
      {isEdit && status === 'published' && (
        <Warn>เลือก “ฉบับร่าง” เพื่อนำหน้านี้ออกจากการเผยแพร่ทันที — ฉบับร่างที่ค้างอยู่จะไม่ถูกลบ</Warn>
      )}

      <Field label="ชนิดหน้า" hint="โปรโมชัน = ย้ายหน้านี้ไปอยู่ที่ /promotions/<slug> และแสดงการ์ดในหน้าโปรโมชัน">
        <select
          className={INPUT_CLASS}
          value={pageType ?? 'general'}
          data-testid="custom-page-type-select"
          onChange={(e) => setPageType(e.target.value)}
        >
          {CUSTOM_PAGE_TYPES.map((t) => (
            <option key={t} value={t}>{PAGE_TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>
      </Field>

      {pageType === 'promotion' && (
        <>
          {/*
            LIVE-ONLY, and the author is told so here rather than finding out on
            the live site. ชนิดหน้า and ลำดับ are written straight to the live
            document by บันทึกฉบับร่าง — that is what makes the grid query and the
            redirect able to see them at all — while ภาพปก drafts like the body.
            One button, two timings, said out loud.
          */}
          {isEdit && status === 'published' && (
            <Warn>
              ชนิดหน้าและลำดับมีผลทันทีที่กดบันทึกฉบับร่าง — URL เดิม (/{String(slug ?? '')})
              จะเปลี่ยนเส้นทางไปที่ /promotions/{String(slug ?? '')} และการ์ดจะขึ้นหน้าโปรโมชันเลย
              ส่วน “ภาพปกโปรโมชัน” จะยังไม่เปลี่ยนบนหน้าจริงจนกว่าจะกดเผยแพร่
            </Warn>
          )}

          <Field label="ลำดับในหน้าโปรโมชัน" hint="ตัวเลขน้อยแสดงก่อน (เรียงรวมกับโปรโมชันจาก Page Builder)">
            <TextInput
              value={promotionOrder ?? 0}
              onChange={(v) => setPromotionOrder(Number.parseInt(v, 10) || 0)}
            />
          </Field>

          <PromoCoverField value={promotionCover} onChange={setPromotionCover} />
        </>
      )}
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
 * ประวัติการเผยแพร่ — STILL RENDERED, TRUTHFUL, AND EMPTY.
 *
 * ── WHY THE ITEM IS NOT HIDDEN ────────────────────────────────────────────
 * No version history is recorded for this page type. `PageVersion` snapshots
 * PageBuilder pages only and there is no CustomPage equivalent anywhere in the
 * repo.
 *
 * The honest response is the one the builder's JSON-LD section already
 * establishes: keep the menu item, and say in words what is not there. Hiding
 * it would read as "I could not find it", which is worse than "there is none
 * yet" — and an author who goes looking for history deserves to learn which of
 * the two it is. Never a list, never a spinner, never a fabricated row, and
 * never a control that would imply the data exists.
 *
 * ── ITS SIBLING BELOW NO LONGER SAYS THIS, AND THAT IS THE POINT ───────────
 * ประวัติการดำเนินการ carried the same paragraph until this round, for the same
 * good reason: nothing wrote rows for it. That is now false — customPages.js
 * records a PageAuditLog row per mutation — so the placeholder was replaced by
 * the real list rather than left to become the kind of stale sentence this
 * work has had to correct three times. THIS section keeps its paragraph
 * because ITS claim is still true.
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

/**
 * ประวัติการดำเนินการ — the placeholder becomes the real list.
 *
 * ── THE READER FOR THE ROWS THIS ROUND STARTED WRITING ────────────────────
 * customPages.js now records a PageAuditLog row for every mutation, tagged
 * `pageType: 'advanced_html'` — the half of that enum that was modelled from
 * the start and had never been written to. This section is what reads them.
 *
 * IT IS THE BUILDER'S COMPONENT, NOT A SECOND ONE. `getPageAuditLog` filters on
 * `pageId` alone with no pageType clause, so `ActivityTrail` renders a
 * CustomPage's rows unchanged — no fork, no parallel reader, and one
 * vocabulary across the two page editors. The same reasoning that made the
 * settings shell shared last round.
 *
 * NO `editor` PROP, exactly as the builder's ActivitySection takes none: this
 * list writes nothing and decides nothing from local state. It renders server
 * rows and stops.
 *
 * AN UNSAVED PAGE passes `pageId: ''`, and ActivityTrail answers that itself —
 * it tells the author there is nothing yet BECAUSE the page has not been saved,
 * rather than rendering an empty trail that looks like a page nobody has
 * touched.
 */
function ActivitySection({ pageId, open }) {
  return (
    <Group title="ประวัติการดำเนินการ">
      <ActivityTrail pageId={pageId} open={open} />
    </Group>
  );
}

/**
 * The footer band's sentence for THIS editor.
 *
 * The builder's band says the system saves automatically, because it does. This
 * one does not, because this form persists nothing until a button in its header
 * bar is pressed. Same band, same geometry, opposite fact — which is the whole
 * reason the band takes its text as children.
 *
 * ── IT NAMES BOTH BUTTONS NOW, BECAUSE THERE ARE TWO ──────────────────────
 * It used to name บันทึกอัปเดต, which was the single save button. The draft
 * split replaced that button with a pair, and a band still naming it would send
 * an author looking for a control that no longer exists — and, worse, would
 * imply that saving is what makes a change public. It is not: บันทึกฉบับร่าง
 * stores the work and เผยแพร่ is the only thing that moves the live page. The
 * band says both, in that order, because that is the order they are used in.
 *
 * CREATE mode keeps one sentence and one button: there is no draft to save on a
 * document that does not exist yet, so บันทึก writes the live fields and there
 * is nothing to publish separately.
 */
export function customPageSaveStateText(isEdit) {
  if (!isEdit) {
    return 'การตั้งค่าจะถูกบันทึกเมื่อกดปุ่ม “บันทึก” — หน้านี้ไม่มีการบันทึกอัตโนมัติ';
  }
  return 'กด “บันทึกฉบับร่าง” เพื่อเก็บการตั้งค่าไว้ก่อน หรือ “เผยแพร่” เพื่อให้มีผลกับหน้าจริง'
    + ' — หน้านี้ไม่มีการบันทึกอัตโนมัติ';
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
  const { initialSection, isEdit, pageId = '', open = false } = props;
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
          {section === 'activity' && <ActivitySection pageId={pageId} open={open} />}
        </div>
      </div>

      <SettingsFooterBand>{customPageSaveStateText(isEdit)}</SettingsFooterBand>
    </div>
  );
}
