'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_TYPES, PAGE_THEMES } from '@/lib/schemas/pageBuilder';
import { isReservedSlug } from '@/lib/pages/reservedSlugs';
import { isStandalonePromotion } from '@/lib/pageBuilder/promotionMode';
import { Field, Group, TextInput, TextArea, Warn, INPUT_CLASS } from './fields';
import { useEditor } from './EditorProvider';
import { VersionHistory } from './VersionHistory';
import { PreviewBody } from './PreviewDialog';

/**
 * Page-level settings (item 6). Edits the page envelope through PATCH_PAGE, so
 * it rides the same dirty/autosave path as every other edit — this dialog
 * writes nothing itself.
 *
 * ── Offered only if the published page HONOURS it ────────────────────────
 * Same rule as the section panel: the schema says what's VALID, the render
 * path says what's HONOURED, and a control for the gap is a lie the author
 * cannot detect. Three page fields are stored, tier-checked, preserved across
 * saves — and read by nothing:
 *
 *   showHeader / showFooter — PageBuilderView states outright that it "cannot
 *     act on them, and deliberately does not fake it": the chrome is rendered
 *     by (public)/layout.jsx as a SIBLING of the page, and in RSC a page cannot
 *     unrender its parent layout's siblings. A toggle here would be a switch
 *     wired to nothing.
 *   showStickyCta — no sticky-CTA component exists; the flag renders nothing.
 *   jsonLd.* — the catch-all route has a COMMENT where the generator will go.
 *     Nothing is emitted today, so a mode/types picker would configure output
 *     that does not exist.
 *
 * All four come back when their render path does. seo.* IS offered, because
 * generateMetadata in the catch-all reads every field of it.
 */

const PAGE_TYPE_LABELS = {
  promotion: 'โปรโมชัน', landing: 'แลนดิ้ง', course_landing: 'แลนดิ้งคอร์ส', bundle: 'แพ็กเกจ',
  masterclass: 'มาสเตอร์คลาส', event: 'อีเวนต์', general: 'ทั่วไป', thank_you: 'ขอบคุณ',
};

const THEME_LABELS = {
  default: '9Expert Blue (ค่าเริ่มต้น)', promotion_blue: 'โปรโมชัน (น้ำเงิน)',
  early_bird_orange: 'Early Bird (ส้ม)', ai_purple: 'AI (ม่วง)',
  corporate_navy: 'องค์กร (กรมท่า)', light_minimal: 'สว่างมินิมอล', dark_premium: 'ดาร์กพรีเมียม',
};

const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Promotion cover uploader (promotion mode, Phase 1). Reuses the shared admin
 * upload endpoint — no second upload path to secure — but stores ONLY the
 * returned secure URL into `promotionCover`. It DELIBERATELY discards any
 * `publicId` the endpoint returns: storing an ownership token would wake the
 * item-5 Cloudinary GC before it is ready (option B). Uploads to the
 * `promotion-covers` folder, a sibling of `page-builder` that sits OUTSIDE the
 * GC's scope, so an untracked cover is also a safe one.
 */
function PromoCoverField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const src = String(value ?? '').trim();

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'promotion-covers');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'อัปโหลดไม่สำเร็จ');
      // URL ONLY — json.publicId is intentionally ignored (option B, see above).
      onChange(json.url);
    } catch (e) {
      setErr(e?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="ภาพปกโปรโมชัน" hint="ใช้เป็นรูปการ์ดในหน้า /promotions (เฟสถัดไป)">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="mb-1.5 aspect-square w-24 rounded-9e-md object-cover" />
      )}
      <label className={cn(
        'flex cursor-pointer items-center justify-center gap-1.5 rounded-9e-md border border-dashed',
        'border-[var(--surface-border)] px-2 py-2 text-[11px] text-9e-slate-dp-50',
        'hover:border-9e-action/40 hover:text-9e-action',
        busy && 'pointer-events-none opacity-50'
      )}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {busy ? 'กำลังอัปโหลด…' : src ? 'เปลี่ยนภาพปก' : 'อัปโหลดภาพปก'}
        <input
          type="file" accept="image/*" className="sr-only" disabled={busy}
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
        />
      </label>
      {err && <Warn tone="red">{err}</Warn>}
    </Field>
  );
}

/**
 * The dialog's BODY, taking plain props.
 *
 * ── WHY IT IS SEPARATE, AND WHY THAT IS A TEST CONCERN ─────────────────────
 * Neither of these dialogs had any test coverage, and neither could have: the
 * component reads `useEditor()`, which THROWS outside a provider, and even
 * inside one a Radix `Dialog.Portal` renders NOTHING under
 * renderToStaticMarkup — measured, 0 bytes. So the whole dialog was
 * unreachable from the render tier in two independent ways.
 *
 * This is the same split, for the same reason, as `SettingsPanel`'s exported
 * tab bodies (round 15) and `SectionPickerBody` (rounds 9/13): the wrapper
 * keeps the context read and the portal; the body takes plain props and can be
 * rendered directly.
 *
 * IT IS A MOVE, NOT AN EDIT. Every field, warning, hint and dispatch below is
 * the JSX that was inline in the dialog, unchanged — which is what lets the
 * union check in test/render/pageDialogs assert the field set is the same one
 * that shipped before the split.
 */

/**
 * The menu, as data. One declaration, read by the nav and by the body's switch,
 * so a section cannot exist in one and not the other.
 *
 * `preview` is the odd one: every other section stages an edit for autosave,
 * and that one writes to the server the moment a button is pressed. It is in
 * the same menu because that is where an author looks for it, and it announces
 * the difference itself — see PreviewSection.
 */
export const PAGE_SETTINGS_SECTIONS = [
  { id: 'general', label: 'ข้อมูลหน้า' },
  { id: 'seo',     label: 'SEO' },
  { id: 'jsonld',  label: 'JSON-LD' },
  { id: 'preview', label: 'ลิงก์พรีวิว' },
  { id: 'history', label: 'ประวัติการเผยแพร่' },
];

/**
 * ── WHY THERE IS NO SAVE BUTTON, STATED WHERE THE BUTTON WOULD BE ──────────
 * The mockups put ยกเลิก / บันทึกการตั้งค่า at the dialog's foot. Both labels
 * would be false. Every field here dispatches into the editor's working tree,
 * and the editor autosaves it on a five-second debounce — so by the time either
 * button could be pressed the change is usually already on the server. "Save"
 * would duplicate a save that happened, and "Cancel" would cancel nothing.
 *
 * That is the same second-authority shape the width control had until round 25:
 * two layers each believing they own one concept. So the footer answers the
 * question the author actually has — is this safe yet — instead of offering a
 * second way to make it so.
 */
function SaveStateLine({ dirty, saving }) {
  const text = saving ? 'กำลังบันทึก…' : dirty ? 'ยังไม่ได้บันทึก — ระบบจะบันทึกให้อัตโนมัติ' : 'บันทึกแล้ว';
  return (
    <p data-testid="settings-save-state"
      className="mt-3 border-t border-[var(--surface-border)] pt-2 text-[11px] text-9e-slate-dp-50">
      {text}
    </p>
  );
}

/**
 * JSON-LD — a statement, deliberately not a status.
 *
 * ── WHAT THE MOCKUP ASKED FOR, AND WHY IT IS NOT HERE ──────────────────────
 * It drew an "Auto generated" badge, five green type chips and a card reading
 * "· 5 Types". Measured: NOTHING emits JSON-LD for a builder page. The
 * catch-all route carries a hook-point comment where the generator will go and
 * emits nothing at all. (Course pages do emit structured data, but that is a
 * different branch of the same route and not a builder page.)
 *
 * So every one of those chips would be a claim with no source — the same class
 * of lie as a control nothing reads, which is what this whole audit arc has
 * been about. A chip that cannot verify its own claim is worse than no chip.
 *
 * And it will not become verifiable for free: the emitted set will be a
 * function of the page's sections AND their resolved data, which is a
 * render-time fact. An authoring-tier chip could only be right by duplicating
 * the generator.
 *
 * The section still exists rather than being hidden, because an author looking
 * for JSON-LD deserves to find out where it is and that it is not on yet —
 * silence would read as "I could not find it", which is worse.
 *
 * The schema's `jsonLd` block (mode / types / rawOverride / validationStatus)
 * is stored, tier-preserved and read by nothing. Its controls belong here on
 * the day the generator lands, and not one day earlier.
 */
export function JsonLdSection() {
  return (
    <Group title="JSON-LD">
      <p className="mb-2 text-[11px] text-9e-slate-dp-50">
        ยังไม่มีการสร้าง JSON-LD ให้หน้าที่สร้างด้วย Page Builder — หน้านี้จึงยังไม่ส่งข้อมูล
        structured data ให้ Google
      </p>
      <p className="text-[11px] text-9e-slate-dp-50">
        เมื่อระบบสร้างให้ได้แล้ว ส่วนนี้จะมีตัวเลือกโหมดและชนิดข้อมูล
        พร้อมตัวอย่างที่ส่งออกจริง
      </p>
    </Group>
  );
}

/**
 * Preview Link — the ONE section that does not stage its edits.
 *
 * ── WHY IT IS ANNOUNCED RATHER THAN BLENDED IN ────────────────────────────
 * Its five actions write to the server the instant a button is pressed, and
 * that is their design rather than an oversight: the password is bcrypt-hashed
 * server-side and its hash must never enter the client working tree, so it
 * cannot ride autosave the way every other field here does.
 *
 * A menu makes five sections look alike. Four of them stage; this one commits,
 * and what it commits is credentials — the place where being wrong is most
 * expensive. So it says so at the top, before any control, and the save-state
 * footer is withheld here: a "saved" line under a section that already wrote
 * would be answering a question the author did not ask, about the wrong thing.
 *
 * The body is unchanged from when it was its own dialog, every action call
 * shape included. This commit changes where it is reached from, not what it
 * does.
 */
export function PreviewSection({ page, pageId, tier, open }) {
  return (
    <>
      <p
        data-testid="preview-immediate-write"
        className="mb-3 rounded-9e-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
      >
        ส่วนนี้บันทึกลงเซิร์ฟเวอร์ทันทีที่กดปุ่ม — ไม่รอการบันทึกอัตโนมัติเหมือนส่วนอื่น
      </p>
      <PreviewBody page={page} pageId={pageId} tier={tier} open={open} />
    </>
  );
}

export function HistorySection({ pageId, open }) {
  return (
    <Group title="ประวัติการเผยแพร่">
      <VersionHistory pageId={pageId} open={open} />
    </Group>
  );
}


/**
 * ── RELOCATION ONLY ───────────────────────────────────────────────────────
 * Every field below is the JSX that was inside the ทั่วไป group, unchanged and
 * in the same order, writing through the same dispatch. The promotion trio and
 * the cover uploader stay with it: they are three of the five fields the
 * mockups drop, and dropping a working control is not a redesign.
 */
export function GeneralSection({ page, patch }) {
  const slug = String(page?.slug ?? '');
  const slugBadFormat = slug !== '' && !SLUG_RE.test(slug);
  const slugReserved = slug !== '' && isReservedSlug(slug);
  const titleEmpty = !String(page?.title ?? '').trim();

  return (
    <>
        <Group title="ทั่วไป">
          <Field label="ชื่อหน้า" hint="ใช้ในระบบหลังบ้านและเป็นค่าตั้งต้นของ meta title">
            <TextInput value={page?.title} onChange={(v) => patch({ title: v })} invalid={titleEmpty} />
          </Field>
          {titleEmpty && <Warn tone="red">ต้องมีชื่อหน้า — บันทึกไม่ได้ถ้าเว้นว่าง</Warn>}

          <Field label="URL (slug)" hint="a-z, 0-9 และ - เท่านั้น">
            <TextInput value={page?.slug} onChange={(v) => patch({ slug: v })} invalid={slugBadFormat || slugReserved} />
          </Field>
          {slugBadFormat && <Warn tone="red">slug ต้องเป็น a-z, 0-9 และ - เท่านั้น</Warn>}
          {slugReserved && <Warn tone="red">slug นี้ถูกสงวนไว้สำหรับหน้าระบบ — ใช้ไม่ได้</Warn>}
          {/* Cross-collection collisions (PageBuilder ↔ CustomPage, including
              each one's slugHistory) can only be checked server-side —
              slugGuard imports both models. The save surfaces that as an
              error without dropping the draft; it is not knowable here. */}

          <Field label="ชนิดหน้า">
            <select className={INPUT_CLASS} value={page?.pageType ?? 'general'}
              onChange={(e) => patch({ pageType: e.target.value })}>
              {PAGE_TYPES.map((t) => <option key={t} value={t}>{PAGE_TYPE_LABELS[t] ?? t}</option>)}
            </select>
          </Field>

          {page?.pageType === 'promotion' && (
            <>
              <Field
                label="Promotion ID (MSDB)"
                hint={
                  isStandalonePromotion(page)
                    ? 'ว่างไว้ = โปรโมชันของ Genesis (มีการ์ดและ URL ของตัวเอง) — ใส่ promotion_id เพื่อผูกกับโปรโมชันใน MSDB แทน'
                    : 'ผูกกับ promotion_id ใน MSDB — ลบออกเพื่อทำเป็นโปรโมชันแบบสแตนด์อโลนของ Genesis'
                }
              >
                <TextInput value={page?.promotionId} onChange={(v) => patch({ promotionId: v })} />
              </Field>
              <Field label="ลำดับในหน้าโปรโมชัน" hint="ตัวเลขน้อยแสดงก่อน (ใช้เรียงการ์ดในหน้า /promotions)">
                <TextInput
                  value={page?.promotionOrder ?? 0}
                  onChange={(v) => patch({ promotionOrder: Number.parseInt(v, 10) || 0 })}
                />
              </Field>
              <PromoCoverField
                value={page?.promotionCover}
                onChange={(v) => patch({ promotionCover: v })}
              />
            </>
          )}

          <Field label="ธีม">
            <select className={INPUT_CLASS} value={page?.theme ?? 'default'}
              onChange={(e) => patch({ theme: e.target.value })}>
              {PAGE_THEMES.map((t) => <option key={t} value={t}>{THEME_LABELS[t] ?? t}</option>)}
            </select>
          </Field>
          {page?.theme === 'dark_premium' && (
            <Warn>ธีมนี้ยังแสดงผลเหมือน “ค่าเริ่มต้น” — ยังไม่มีการออกแบบเฉพาะ</Warn>
          )}
        </Group>
    </>
  );
}

/**
 * Same rule as GeneralSection: a move, not an edit. Canonical URL and OG image
 * URL are the other two of the five the mockups drop, and the note on the OG
 * field is load-bearing for the delete path — it travels with the field.
 */
export function SeoSection({ seo, patchSeo }) {
  return (
    <>
        <Group title="SEO">
          <Field label="Meta title" hint={`${String(seo.metaTitle ?? '').length}/60 — เว้นว่างเพื่อใช้ชื่อหน้า`}>
            <TextInput value={seo.metaTitle} onChange={(v) => patchSeo({ metaTitle: v })}
              invalid={String(seo.metaTitle ?? '').length > 60} />
          </Field>
          <Field label="Meta description" hint={`${String(seo.metaDescription ?? '').length}/160`}>
            <TextArea value={seo.metaDescription} onChange={(v) => patchSeo({ metaDescription: v })} rows={2} />
          </Field>
          <Field label="Canonical URL" hint="เว้นว่างเพื่อใช้ URL ของหน้านี้">
            <TextInput value={seo.canonicalUrl} onChange={(v) => patchSeo({ canonicalUrl: v })} />
          </Field>
          {/*
            OG image is a pasted URL, deliberately NOT an upload widget. That
            is load-bearing for a delete path (item 5): `seo.ogImagePublicId` is
            the ownership token deletePageBuilderPage destroys on delete. Because
            nothing here uploads, that token stays empty and the delete is inert.
            If you add an upload widget that SETS ogImagePublicId, you make the
            delete path live — it is safe ONLY as long as every copy path strips
            the token (duplicatePageBuilderPage does, as of item 5 Part 1). Wire
            the widget AND keep that strip in sync, or a delete of a copy will
            destroy the original's OG image. See docs/page-builder-status.md item 5.
          */}
          <Field label="OG image URL">
            <TextInput value={seo.ogImage} onChange={(v) => patchSeo({ ogImage: v })} />
          </Field>
          <label className="mb-2.5 flex items-center gap-1.5 text-[11px] text-9e-navy dark:text-white/90">
            <input type="checkbox" checked={Boolean(seo.noIndex)}
              onChange={(e) => patchSeo({ noIndex: e.target.checked })} />
            ไม่ให้ Google เก็บหน้านี้ (noindex)
          </label>
        </Group>
    </>
  );
}

export function PageSettingsBody({ page, pageId, dispatch, open, dirty, saving, tier, initialSection }) {
  const [section, setSection] = useState(initialSection ?? PAGE_SETTINGS_SECTIONS[0].id);
  const patch = (p) => dispatch({ type: 'PATCH_PAGE', patch: p });
  const patchSeo = (p) => dispatch({ type: 'PATCH_PAGE', patch: { seo: { ...(page?.seo ?? {}), ...p } } });

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <nav aria-label="ส่วนของการตั้งค่า" className="shrink-0 sm:w-44">
        <ul className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {PAGE_SETTINGS_SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={section === s.id ? 'true' : undefined}
                onClick={() => setSection(s.id)}
                className={cn(
                  'w-full whitespace-nowrap rounded-9e-md px-2.5 py-1.5 text-left text-xs',
                  section === s.id
                    ? 'bg-9e-ice font-bold text-9e-navy dark:bg-[#0D1B2A] dark:text-white'
                    : 'text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]'
                )}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {section === 'general' && <GeneralSection page={page} patch={patch} />}
        {section === 'seo' && <SeoSection seo={page?.seo ?? {}} patchSeo={patchSeo} />}
        {section === 'jsonld' && <JsonLdSection />}
        {section === 'preview' && <PreviewSection page={page} pageId={pageId} tier={tier} open={open} />}
        {section === 'history' && <HistorySection pageId={pageId} open={open} />}

        {/* Withheld on the section that writes immediately — see PreviewSection. */}
        {section !== 'preview' && <SaveStateLine dirty={dirty} saving={saving} />}
      </div>
    </div>
  );
}


export function PageSettingsDialog({ open, onClose, initialSection = null }) {
  const { page, pageId, dispatch, dirty, saving, tier } = useEditor();

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(52rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'max-h-[calc(100dvh-4rem)] overflow-y-auto'
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">ตั้งค่าหน้า</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">แก้ไขข้อมูลระดับหน้า เช่น ชื่อ, URL, ธีม และ SEO</Dialog.Description>

          {/*
            KEYED ON THE REQUESTED SECTION so that opening the dialog from a
            different trigger really lands there. Without it, whether the menu
            re-reads initialSection would depend on whether Radix unmounts the
            content on close — a library policy this behaviour has no business
            resting on. The key makes it a property of this file instead.
          */}
          <PageSettingsBody
            key={initialSection ?? 'general'}
            page={page} pageId={pageId} dispatch={dispatch} open={open}
            dirty={dirty} saving={saving} tier={tier} initialSection={initialSection}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
