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

export function PageSettingsDialog({ open, onClose }) {
  const { page, pageId, dispatch } = useEditor();
  const patch = (p) => dispatch({ type: 'PATCH_PAGE', patch: p });
  const patchSeo = (p) => dispatch({ type: 'PATCH_PAGE', patch: { seo: { ...(page?.seo ?? {}), ...p } } });

  const slug = String(page?.slug ?? '');
  const slugBadFormat = slug !== '' && !SLUG_RE.test(slug);
  const slugReserved = slug !== '' && isReservedSlug(slug);
  const titleEmpty = !String(page?.title ?? '').trim();
  const seo = page?.seo ?? {};

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))]',
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

          <Group title="ประวัติการเผยแพร่">
            <VersionHistory pageId={pageId} open={open} />
          </Group>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
