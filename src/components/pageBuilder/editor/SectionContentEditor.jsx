'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUrl } from '@/lib/pageBuilder/safeUrl';
import { isContainer } from '@/lib/pageBuilder/containerSlots';
import { isValidSectionId } from '@/lib/pageBuilder/scopeCss';
import { isKnownIconName } from '@/lib/pageBuilder/lucideIcon';
import { embedSrc } from '@/lib/pageBuilder/embedSrc';
import { moveInArray } from './pagePath';
// Round 47, ADDED beside the line above rather than folded into it. Editor-side
// and plain JS on purpose — see duplicateCodes.js for why it is not in
// lib/pageBuilder/sectionLabels.js with the other content predicate.
import { duplicateCourseCodes } from './duplicateCodes';
// Round 48, ADDED beside the line above. The picker that replaces this file's
// course textarea; see CoursePicker.jsx for the rule it must not break.
import { CourseIdsPicker, CourseSelectPicker } from './CoursePicker';
import { IconPicker } from './IconPicker';
import { Field, Select, TextInput, TextArea, Warn, INPUT_CLASS, Toggle } from './fields';
import { RichTextEditor } from './richText/RichTextEditor';

/**
 * Per-type content editors (5b).
 *
 * Keyed by section type; a type with no entry has no content to edit. That is
 * the honest answer for containers — their content IS their children, and those
 * are managed in the structure tree, not here.
 *
 * ── Why this file is mostly warnings ─────────────────────────────────────
 * Each section component decides silently whether to render at all:
 *   cta      → no button unless safeUrl(buttonHref) AND a non-empty label
 *   image    → renders NOTHING without a src
 *   heading  → nothing without text
 * The renderer is right to fail closed, but the author is the one who has to
 * find out, and a dev-console warning is not a way to tell them. So every place
 * a component would quietly drop something, the editor says so here, while the
 * author is looking at the field.
 */

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const LEVEL_LABELS = { h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6' };
const ALIGNS = ['left', 'center', 'right'];
const ALIGN_LABELS = { left: 'ซ้าย', center: 'กลาง', right: 'ขวา' };
const NOTICE_VARIANTS = ['info', 'success', 'warning', 'error'];
const NOTICE_LABELS = { info: 'ข้อมูล', success: 'สำเร็จ', warning: 'คำเตือน', error: 'ข้อผิดพลาด' };
const EMBED_PROVIDERS = ['youtube', 'vimeo', 'iframe'];
const EMBED_PROVIDER_LABELS = { youtube: 'YouTube', vimeo: 'Vimeo', iframe: 'iframe (โค้ดฝัง)' };
const ICON_HINT = 'ค้นหาด้วยชื่อภาษาอังกฤษ เช่น rocket, users';

// ── heading ──────────────────────────────────────────────────────────
function HeadingEditor({ content, patch }) {
  const empty = !String(content?.text ?? '').trim();
  return (
    <>
      <Field label="ข้อความ">
        <TextInput value={content?.text} onChange={(v) => patch({ text: v })} invalid={empty} />
      </Field>
      {empty && <Warn>หัวข้อว่างจะไม่แสดงผลบนหน้าเว็บ</Warn>}
      <Field label="ระดับหัวข้อ" hint="H1 ควรมีเพียงหัวข้อเดียวต่อหนึ่งหน้า">
        <Select value={content?.level} options={HEADING_LEVELS} labels={LEVEL_LABELS}
          onChange={(v) => patch({ level: v })} />
      </Field>
      <Field label="จัดวาง">
        <Select value={content?.align} options={ALIGNS} labels={ALIGN_LABELS}
          onChange={(v) => patch({ align: v })} />
      </Field>
    </>
  );
}

// ── rich_text ────────────────────────────────────────────────────────
function RichTextSectionEditor({ content, patch }) {
  return (
    <Field label="เนื้อหา">
      <RichTextEditor doc={content?.doc} onChange={(doc) => patch({ doc })} />
    </Field>
  );
}

// ── image ────────────────────────────────────────────────────────────
function ImageEditor({ content, patch }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const src = String(content?.src ?? '').trim();
  const altEmpty = !String(content?.alt ?? '').trim();

  // Reuses the existing admin endpoint — no second upload path to secure.
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'page-builder');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'อัปโหลดไม่สำเร็จ');
      patch({ src: json.url, publicId: json.publicId });
    } catch (e) {
      setErr(e?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="รูปภาพ">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="mb-1.5 h-24 w-full rounded-9e-md object-cover" />
        )}
        <label className={cn(
          'flex cursor-pointer items-center justify-center gap-1.5 rounded-9e-md border border-dashed',
          'border-[var(--surface-border)] px-2 py-2 text-[11px] text-9e-slate-dp-50',
          'hover:border-9e-action/40 hover:text-9e-action',
          busy && 'pointer-events-none opacity-50'
        )}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {busy ? 'กำลังอัปโหลด…' : src ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
          <input
            type="file" accept="image/*" className="sr-only" disabled={busy}
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
      </Field>
      {err && <Warn tone="red">{err}</Warn>}
      {!src && <Warn>ยังไม่มีรูป — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}

      <Field label="Alt text" hint="คำอธิบายรูปสำหรับผู้ใช้ screen reader">
        <TextInput value={content?.alt} onChange={(v) => patch({ alt: v })} />
      </Field>
      {src && altEmpty && (
        <Warn>
          ไม่มี alt — รูปนี้จะถูกถือว่าเป็นรูปประดับ (decorative) และ screen reader จะข้ามไป
          ถ้ารูปสื่อความหมาย ควรใส่คำอธิบาย
        </Warn>
      )}

      <Field label="คำบรรยายใต้รูป">
        <TextInput value={content?.caption} onChange={(v) => patch({ caption: v })} />
      </Field>
    </>
  );
}

// ── cta ──────────────────────────────────────────────────────────────
function CtaEditor({ content, patch }) {
  const href = String(content?.buttonHref ?? '').trim();
  const label = String(content?.buttonLabel ?? '').trim();
  const hrefUnsafe = href !== '' && !safeUrl(href);
  // The component renders the button only with BOTH a label and a safe href —
  // otherwise it silently renders no button at all.
  const noButton = (label === '') !== (href === '');

  return (
    <>
      <Field label="หัวข้อ">
        <TextInput value={content?.heading} onChange={(v) => patch({ heading: v })} />
      </Field>
      <Field label="คำอธิบาย">
        <TextArea value={content?.description} onChange={(v) => patch({ description: v })} />
      </Field>
      <Field label="ข้อความบนปุ่ม">
        <TextInput value={content?.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
      </Field>
      <Field label="ลิงก์ปุ่ม" hint="http, https, mailto, tel, /path หรือ #anchor">
        <TextInput value={content?.buttonHref} onChange={(v) => patch({ buttonHref: v })} invalid={hrefUnsafe} />
      </Field>
      {hrefUnsafe && (
        <Warn tone="red">
          ลิงก์นี้ใช้ไม่ได้ — ปุ่มจะไม่แสดงผลเลย (รองรับ http, https, mailto, tel, /path และ #anchor)
        </Warn>
      )}
      {!hrefUnsafe && noButton && (
        <Warn>
          ปุ่มจะแสดงก็ต่อเมื่อมีทั้งข้อความบนปุ่มและลิงก์ — ตอนนี้ยังขาด
          {label === '' ? ' ข้อความบนปุ่ม' : ' ลิงก์'}
        </Warn>
      )}
    </>
  );
}

// ── notice ───────────────────────────────────────────────────────────
function NoticeEditor({ content, patch }) {
  return (
    <>
      <Field label="ชนิด">
        <Select value={content?.variant} options={NOTICE_VARIANTS} labels={NOTICE_LABELS}
          onChange={(v) => patch({ variant: v })} />
      </Field>
      <Field label="ข้อความ">
        <TextArea value={content?.text} onChange={(v) => patch({ text: v })} />
      </Field>
    </>
  );
}

// ── price_card ─────────────────────────────────────────────────────────
function PriceCardEditor({ content, patch }) {
  const title = String(content?.title ?? '').trim();
  const price = String(content?.price ?? '').trim();
  const features = Array.isArray(content?.features) ? content.features : [];
  const hasFeature = features.some((f) => String(f ?? '').trim());
  // Mirrors PriceCardSection's fail-closed guard exactly.
  const empty = !title && !price && !hasFeature;

  const href = String(content?.buttonHref ?? '').trim();
  const label = String(content?.buttonLabel ?? '').trim();
  const hrefUnsafe = href !== '' && !safeUrl(href);
  const noButton = (label === '') !== (href === '');

  return (
    <>
      <Field label="หัวข้อ">
        <TextInput value={content?.title} onChange={(v) => patch({ title: v })} />
      </Field>
      <Field label="ราคา" hint={'ข้อความอิสระได้ เช่น "฿12,900" หรือ "สอบถาม"'}>
        <TextInput value={content?.price} onChange={(v) => patch({ price: v })} />
      </Field>
      <Field label="ต่อรอบ" hint={'เช่น "/ คน" หรือ "/ เดือน"'}>
        <TextInput value={content?.period} onChange={(v) => patch({ period: v })} />
      </Field>
      <Field label="รายการ (บรรทัดละ 1 รายการ)">
        <TextArea value={features.join('\n')} onChange={(v) => patch({ features: v.split('\n') })} rows={4} />
      </Field>
      {empty && <Warn>ยังไม่มีหัวข้อ ราคา หรือรายการ — การ์ดนี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      <label className="mb-2.5 flex items-center gap-1.5 text-[11px] text-9e-navy dark:text-white/90">
        <input type="checkbox" checked={content?.highlighted === true}
          onChange={(e) => patch({ highlighted: e.target.checked })} />
        เน้นการ์ดนี้ (ขอบสีเน้น)
      </label>
      <Field label="ข้อความบนปุ่ม">
        <TextInput value={content?.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
      </Field>
      <Field label="ลิงก์ปุ่ม" hint="http, https, mailto, tel, /path หรือ #anchor">
        <TextInput value={content?.buttonHref} onChange={(v) => patch({ buttonHref: v })} invalid={hrefUnsafe} />
      </Field>
      {hrefUnsafe && (
        <Warn tone="red">ลิงก์นี้ใช้ไม่ได้ — ปุ่มจะไม่แสดงผลเลย (รองรับ http, https, mailto, tel, /path และ #anchor)</Warn>
      )}
      {!hrefUnsafe && noButton && (
        <Warn>ปุ่มจะแสดงเมื่อมีทั้งข้อความบนปุ่มและลิงก์ — ตอนนี้ยังขาด{label === '' ? ' ข้อความบนปุ่ม' : ' ลิงก์'}</Warn>
      )}
    </>
  );
}

// ── stat_card ──────────────────────────────────────────────────────────
function StatCardEditor({ content, patch }) {
  const value = String(content?.value ?? '').trim();
  const label = String(content?.label ?? '').trim();
  const icon = String(content?.icon ?? '').trim();
  const empty = !value && !label; // mirrors StatCardSection's guard (icon alone is not a stat)
  const iconBad = icon !== '' && !isKnownIconName(icon);
  return (
    <>
      <Field label="ตัวเลข/ค่า" hint={'เช่น "1,200+" หรือ "98%"'}>
        <TextInput value={content?.value} onChange={(v) => patch({ value: v })} invalid={empty} />
      </Field>
      <Field label="คำอธิบาย">
        <TextInput value={content?.label} onChange={(v) => patch({ label: v })} />
      </Field>
      {empty && <Warn>ต้องมีตัวเลขหรือคำอธิบายอย่างน้อยหนึ่งอย่าง — ไม่งั้นการ์ดนี้จะไม่แสดงผล</Warn>}
      <Field label="ไอคอน (ไม่บังคับ)" hint={ICON_HINT}>
        <IconPicker value={content?.icon} onChange={(v) => patch({ icon: v })} invalid={iconBad} />
      </Field>
      {iconBad && <Warn>ไม่รู้จักไอคอนชื่อนี้ — การ์ดจะแสดงโดยไม่มีไอคอน</Warn>}
    </>
  );
}

// ── icon_card ──────────────────────────────────────────────────────────
function IconCardEditor({ content, patch }) {
  const title = String(content?.title ?? '').trim();
  const description = String(content?.description ?? '').trim();
  const icon = String(content?.icon ?? '').trim();
  const empty = !title && !description && !icon; // mirrors IconCardSection's raw-content guard
  const iconBad = icon !== '' && !isKnownIconName(icon);
  return (
    <>
      <Field label="ไอคอน" hint={ICON_HINT}>
        <IconPicker value={content?.icon} onChange={(v) => patch({ icon: v })} invalid={iconBad} />
      </Field>
      {iconBad && <Warn>ไม่รู้จักไอคอนชื่อนี้ — การ์ดจะแสดงโดยไม่มีไอคอน</Warn>}
      <Field label="หัวข้อ">
        <TextInput value={content?.title} onChange={(v) => patch({ title: v })} />
      </Field>
      <Field label="คำอธิบาย">
        <TextArea value={content?.description} onChange={(v) => patch({ description: v })} />
      </Field>
      {empty && <Warn>ยังไม่มีไอคอน หัวข้อ หรือคำอธิบาย — การ์ดนี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
    </>
  );
}

// ── custom_html (developer-tier) ───────────────────────────────────────
function CustomHtmlEditor({ content, patch }) {
  const empty = !String(content?.html ?? '').trim();
  return (
    <>
      <Field label="HTML" hint="ถูก sanitize ทุกครั้งที่แสดงผล — script และ event handler จะถูกตัดออก">
        <TextArea value={content?.html} onChange={(v) => patch({ html: v })} rows={6} mono />
      </Field>
      {empty && <Warn>ยังไม่มีเนื้อหา — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
    </>
  );
}

// ── custom_css (developer-tier) — scoped to this section's Section ID ────
function CustomCssEditor({ content, patch, advanced }) {
  const css = String(content?.css ?? '').trim();
  const sectionId = String(advanced?.sectionId ?? '');
  const idValid = sectionId !== '' && isValidSectionId(sectionId);
  return (
    <>
      <Field label="CSS" hint="ถูก scope ด้วย Section ID ของ section นี้ — มีผลเฉพาะภายใน section นี้เท่านั้น">
        <TextArea value={content?.css} onChange={(v) => patch({ css: v })} rows={6} mono />
      </Field>
      {css !== '' && !idValid && (
        <Warn>ต้องตั้ง Section ID ที่กลุ่ม “ขั้นสูง (developer)” ด้านล่างก่อน CSS ถึงจะทำงาน — ตอนนี้จะไม่ถูกใช้เลย</Warn>
      )}
    </>
  );
}

// ── debug_json (developer-tier) — canvas-only inspection block ──────────
function DebugJsonEditor({ content, patch }) {
  const raw = String(content?.json ?? '');
  let jsonBad = false;
  if (raw.trim()) {
    try { JSON.parse(raw); } catch { jsonBad = true; }
  }
  return (
    <>
      <Field label="JSON" hint="แสดงเฉพาะในหน้าแก้ไข (canvas) เท่านั้น — จะไม่แสดงบนหน้าที่เผยแพร่หรือพรีวิว">
        <TextArea value={content?.json} onChange={(v) => patch({ json: v })} rows={6} mono />
      </Field>
      {jsonBad && <Warn>JSON ไม่ถูกต้อง — จะแสดงเป็นข้อความดิบตามที่พิมพ์</Warn>}
    </>
  );
}

// ── embed (developer-tier) ─────────────────────────────────────────────
function EmbedEditor({ content, patch }) {
  const provider = content?.provider ?? 'youtube';
  const providerField = (
    <Field label="ผู้ให้บริการ">
      <Select value={provider} options={EMBED_PROVIDERS} labels={EMBED_PROVIDER_LABELS}
        onChange={(v) => patch({ provider: v })} />
    </Field>
  );

  if (provider === 'iframe') {
    const empty = !String(content?.html ?? '').trim();
    return (
      <>
        {providerField}
        <Field label="โค้ด iframe" hint="อนุญาตเฉพาะโฮสต์ที่ปลอดภัย (YouTube, Vimeo, Google, Facebook) — อื่น ๆ จะถูกตัดทิ้ง">
          <TextArea value={content?.html} onChange={(v) => patch({ html: v })} rows={5} mono />
        </Field>
        {empty && <Warn>ยังไม่มีโค้ด — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      </>
    );
  }

  const url = String(content?.url ?? '').trim();
  const src = embedSrc(provider, url);
  return (
    <>
      {providerField}
      <Field
        label="ลิงก์วิดีโอ"
        hint={provider === 'youtube' ? 'เช่น https://youtu.be/… หรือ https://www.youtube.com/watch?v=…' : 'เช่น https://vimeo.com/…'}
      >
        <TextInput value={content?.url} onChange={(v) => patch({ url: v })} invalid={url !== '' && !src} />
      </Field>
      {url === '' && <Warn>ยังไม่มีลิงก์ — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      {url !== '' && !src && <Warn tone="red">อ่านรหัสวิดีโอจากลิงก์นี้ไม่ได้ — section นี้จะไม่แสดงผล</Warn>}
    </>
  );
}

// ── 2C.2a / 2C.2b data-backed editors ──────────────────────────────────
// `resolved` is a TRI-STATE, not a boolean, and the distinction is load-bearing:
//   undefined → not fetched yet (the debounced refetch is in flight)
//   null / [] → fetched, found nothing (a bad id)
//   entity / non-empty array → found
// Only `null`/`[]` may warn. Collapsing to "falsy → warn" would flash "not
// found" on every keystroke's refetch, before the fetch returns. That is not a
// cosmetic bug: an author who sees a warning fire on correct input learns to
// ignore it — and a warning authors ignore erodes EVERY editor warning, not just
// this one (the whole point of the fail-closed warnings is that authors trust
// them). The `undefined` guard below is what keeps that trust intact.

/**
 * The authored course list — a picker since round 48, a newline-per-id textarea
 * before it. ONE component serving course_selector, bundle_courses and
 * course_list[manual], which is why replacing it reaches three of the five
 * course-referencing section types at once.
 *
 * `courses` is the catalogue round 47 threaded down from the route: a
 * projection, {course_id, course_name}, and authoritative for NOTHING. It
 * supplies rows to choose from and names to show. It defaults to empty, and an
 * empty catalogue is still a working control — every stored code keeps its row,
 * and a code can still be typed.
 */
function CourseIdsField({ value, onChange, hint, courses }) {
  return <CourseIdsPicker value={value} onChange={onChange} courses={courses} hint={hint} />;
}

/**
 * TWO WARNINGS, AND ONLY ONE OF THEM WAITS FOR THE FETCH.
 *
 * ── WHY THE `resolved === undefined` GUARD MOVED ───────────────────────────
 * It used to be an early `return null` covering the whole component. That was
 * right when there was one warning and it was about resolution. It is wrong the
 * moment a second warning is about the LOCAL ARRAY: a duplicate is knowable
 * synchronously, with no fetch, so gating it on `resolved` would blank it for
 * the 350ms debounce after every keystroke — the flashing this block's own
 * header calls out, arrived at from the other direction. The guard now narrows
 * `missing` instead of short-circuiting the render.
 *
 * ── THE TWO COUNTS ARE INDEPENDENT, WHICH IS WHY BOTH CAN SHOW ─────────────
 * `missing` is `wanted.length - resolved.length`, and the fetch DE-DUPES
 * (`collectRefs` builds a Set) — so it would be reasonable to fear that a
 * duplicate inflates the missing count and the two warnings contradict each
 * other. It does not: `assembleResolved` maps POSITIONALLY
 * (`ids.map((id) => courseMap.get(id)).filter(Boolean)`), so four authored
 * resolvable codes give four resolved entries even when two of them are the
 * same code. Measured live, driven through the real resolver:
 * docs/course-picker-proposal.md §D.4.
 *
 * So a list can be simultaneously "has a repeat" and "has a code that resolves
 * to nothing", and both lines are true at once and say different things.
 *
 * ── WARN, NEVER EDIT ───────────────────────────────────────────────────────
 * Nothing here de-duplicates, reorders or rejects, and nothing downstream does
 * either — `publishBlockers` checks title, slug and section count and nothing
 * else. Duplicates RENDER, deliberately: the same course twice in a list is a
 * layout an author can want. Silently rewriting a stored array to mean
 * something the author did not write is a larger defect than the one being
 * reported (§F.4).
 */
function CourseIdsWarnings({ ids, resolved }) {
  const wanted = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!wanted.length) return <Warn>ยังไม่ได้เลือกคอร์ส — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>;

  // Synchronous — no fetch, so no tri-state. Amber, not red: a repeat renders
  // exactly what it says it will, so this reports a SURPRISE, not a breakage.
  const repeated = duplicateCourseCodes(ids);

  // `undefined` = not resolved yet (loading); only warn about missing once
  // fetched. Zero rather than an early return, so the line above still shows.
  const missing = resolved === undefined
    ? 0
    : wanted.length - (Array.isArray(resolved) ? resolved.length : 0);

  return (
    <>
      {repeated.length > 0 && (
        <Warn>รหัสซ้ำ: {repeated.join(', ')} — คอร์สเดิมจะแสดงซ้ำตามจำนวนที่ใส่ไว้</Warn>
      )}
      {missing > 0 && (
        <Warn tone="red">มี {missing} รหัสที่ไม่พบคอร์ส — จะไม่แสดงในรายการ</Warn>
      )}
    </>
  );
}

/**
 * Round 50 added the price switch BESIDE the course code, in this tab, because
 * the price is a fact about what this card SAYS — not about how it looks — and
 * the author reaching for it has a page problem, not a styling one.
 *
 * `content?.showPrice !== false` here is the SAME expression the renderer uses,
 * and it has to be: the field is absent on every card stored before this
 * commit, and a `=== true` check would show the box unticked while the page
 * showed the price. The panel would be lying about the page.
 *
 * The hint says WHAT IT IS FOR, not what it does — the box's own text already
 * says what it does. An author arrives here because their page shows ฿12,900 in
 * a การ์ดคอร์ส next to “ราคาพิเศษ 4,900 บาท” in a การ์ดราคา and nothing says
 * which applies; the hint is what tells them this is the control for that.
 */
function CourseCardEditor({ content, patch, resolved, courses }) {
  const courseId = String(content?.courseId ?? '').trim();
  const notFound = courseId !== '' && resolved === null;
  return (
    <>
      <CourseSelectPicker
        value={content?.courseId}
        onChange={(courseId) => patch({ courseId })}
        courses={courses}
        label="คอร์ส (course_id)"
        hint="เลือกจากรายการ หรือพิมพ์รหัสเองถ้ายังไม่มีในรายการ"
        invalid={notFound}
      />
      {/* Round 50's price switch, unmoved and unchanged: it stays BELOW the
          course reference, because the code is what the card is and the price
          is a fact about what that card says. Its own tests still drive it. */}
      {/**
        * Round 52 changed this control's SHAPE and nothing else. The expression
        * below is round 50's, byte for byte, and it has to be: the key is
        * ABSENT on every card stored before round 50 — `.lean()` applies no
        * Mongoose defaults and serialisation drops undefined keys — so a
        * truthiness check here would show an off switch over a page that shows
        * the price. The panel would be lying about the page, for every card.
        *
        * The COPY moved with the shape. A checkbox's box text says what ticking
        * it means (“แสดงราคาคอร์สบนการ์ดนี้”); a switch's label says what the
        * setting IS, so that sentence became the label and the old label
        * “ราคาบนการ์ด” — a topic, not a setting — is gone.
        *
        * ── ROUND 53 MADE IT LEGIBLE, AND CHANGED NOTHING ELSE ─────────────
        * A screenshot of the shipped control: a grey circle, no colour
        * difference between its two states, and a three-line hint. Reading it
        * required knowing that knob-left means off. Three fixes, all
        * presentation:
        *
        *   · A STATE WORD — แสดง / ไม่แสดง — so the control says what it is
        *     doing rather than only showing it. Round 52 left this out because
        *     ไม่แสดง CONTAINS แสดง and that breaks substring matchers; the
        *     answer is to match element text in the tests, not to withhold a
        *     word from the author.
        *   · COLOUR on the track when on, so the two states differ at a glance.
        *   · A SHORTER HINT. It ran to three lines. Its JOB is unchanged — it
        *     says WHEN to reach for this, never what the control mechanically
        *     does — and the switch plus its state word now say the rest.
        *
        * The expression below is still round 50's, byte for byte, and what the
        * toggle dispatches is still round 52's.
        */}
      <Field
        label="แสดงราคาบนการ์ด"
        hint="ปิดเมื่อหน้านี้มีการ์ดราคาอยู่แล้ว"
      >
        <Toggle
          checked={content?.showPrice !== false}
          onChange={(next) => patch({ showPrice: next })}
          onLabel="แสดง"
          offLabel="ไม่แสดง"
        />
      </Field>
      {courseId === '' && <Warn>ยังไม่ได้ระบุคอร์ส — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      {notFound && <Warn tone="red">ไม่พบคอร์สรหัสนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
    </>
  );
}

function InstructorCardEditor({ content, patch, resolved }) {
  const instructorId = String(content?.instructorId ?? '').trim();
  const notFound = instructorId !== '' && resolved === null;
  return (
    <>
      <Field label="รหัสผู้สอน (instructor_id)" hint="ใช้รหัสผู้สอนจากระบบผู้สอน">
        <TextInput value={content?.instructorId} onChange={(v) => patch({ instructorId: v })} invalid={notFound} />
      </Field>
      {instructorId === '' && <Warn>ยังไม่ได้ระบุผู้สอน — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      {notFound && <Warn tone="red">ไม่พบผู้สอนรหัสนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
    </>
  );
}

function CourseSelectorEditor({ content, patch, resolved, courses }) {
  return (
    <>
      <Field label="หัวข้อ (ไม่บังคับ)">
        <TextInput value={content?.heading} onChange={(v) => patch({ heading: v })} />
      </Field>
      <CourseIdsField value={content?.courseIds} onChange={(courseIds) => patch({ courseIds })} courses={courses} />
      <CourseIdsWarnings ids={content?.courseIds} resolved={resolved} />
    </>
  );
}

function BundleCoursesEditor({ content, patch, resolved, courses }) {
  return (
    <>
      <CourseIdsField value={content?.courseIds} onChange={(courseIds) => patch({ courseIds })} courses={courses} />
      <CourseIdsWarnings ids={content?.courseIds} resolved={resolved} />
    </>
  );
}

// ── 2C.2b sample label ─────────────────────────────────────────────────
// THE feature of 2C.2b, not an afterthought (docs/page-builder-status.md §2C.2b).
// The derived/time-varying sections show the author an edit-time SAMPLE of
// content the published page will re-fetch and may differ from. Browser pass #2
// REJECTED a silent canvas placeholder on exactly this; the labelled exception is
// only honest because the label is present. It uses the informational `info` tone
// — NOT the red "broken" tone — so "this is a sample" is never read as "this is
// not found". Both CAN show at once: a filter can resolve to a sample now (info)
// whose contents will still vary at publish (also info), or resolve to nothing
// (red) — the two say different things.
function SampleLabel() {
  return (
    <Warn tone="info">
      ตัวอย่าง ณ เวลาแก้ไข — หน้าที่เผยแพร่จริงจะดึงข้อมูลใหม่ตามเวลาที่ผู้เข้าชมเปิดหน้า จำนวนและรายการที่แสดงจริงอาจต่างจากนี้
    </Warn>
  );
}

const COURSE_LIST_SOURCES = ['manual', 'skill', 'program'];
const COURSE_LIST_SOURCE_LABELS = {
  manual:  'เลือกเอง (ระบุรหัสคอร์ส)',
  skill:   'ตามสกิล (Skill)',
  program: 'ตามโปรแกรม (Program)',
};

function CourseListEditor({ content, patch, resolved, courses }) {
  const source = content?.source ?? 'manual';
  const isDerived = source === 'skill' || source === 'program';
  const filter = String(content?.filter ?? '').trim();
  // For a derived source, `resolved` is the fetched SAMPLE list. Same tri-state
  // discipline as the authored warnings (see the block comment above): undefined
  // = fetch in flight (never warn), [] = fetched and empty (a bad/empty filter),
  // array = found. Only warn "not found" once fetched — never while undefined.
  const emptySample = isDerived && filter !== '' && Array.isArray(resolved) && resolved.length === 0;

  return (
    <>
      <Field label="แหล่งข้อมูล">
        <Select value={source} options={COURSE_LIST_SOURCES} labels={COURSE_LIST_SOURCE_LABELS}
          onChange={(v) => patch({ source: v })} />
      </Field>

      {isDerived ? (
        <>
          <Field
            label={source === 'skill' ? 'รหัสสกิล (skill id)' : 'รหัสโปรแกรม (program id)'}
            hint="ใช้ id จากระบบคอร์ส — จะดึงคอร์สทั้งหมดในกลุ่มนี้โดยอัตโนมัติ"
          >
            <TextInput value={content?.filter} onChange={(v) => patch({ filter: v })} invalid={emptySample} />
          </Field>
          {filter === '' && (
            <Warn>ยังไม่ได้ระบุ{source === 'skill' ? 'สกิล' : 'โปรแกรม'} — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>
          )}
          {emptySample && (
            <Warn tone="red">ไม่พบคอร์สในกลุ่มนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>
          )}
          <SampleLabel />
        </>
      ) : (
        <>
          <CourseIdsField value={content?.courseIds} onChange={(courseIds) => patch({ courseIds })} courses={courses} />
          <CourseIdsWarnings ids={content?.courseIds} resolved={resolved} />
        </>
      )}

      <Field label="จำกัดจำนวน (0 = ไม่จำกัด)">
        <TextInput
          value={content?.limit ?? 0}
          onChange={(v) => patch({ limit: Number.parseInt(v, 10) || 0 })}
        />
      </Field>
    </>
  );
}

function CourseScheduleEditor({ content, patch, resolved, courses }) {
  const courseId = String(content?.courseId ?? '').trim();
  // `resolved` is the schedules SAMPLE (tri-state): undefined = fetching, [] =
  // fetched with no upcoming rounds (bad code, or a real course with none open),
  // array = found. The empty case is genuinely ambiguous and both render nothing,
  // so the warning states the observable ("no open rounds") rather than guessing.
  const emptySample = courseId !== '' && Array.isArray(resolved) && resolved.length === 0;
  return (
    <>
      <CourseSelectPicker
        value={content?.courseId}
        onChange={(courseId) => patch({ courseId })}
        courses={courses}
        label="คอร์ส (course_id)"
        hint="เลือกจากรายการ หรือพิมพ์รหัสเองถ้ายังไม่มีในรายการ — จะดึงรอบที่เปิดรับสมัครของคอร์สนี้"
        invalid={emptySample}
      />
      {courseId === '' && <Warn>ยังไม่ได้ระบุคอร์ส — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>}
      {emptySample && (
        <Warn tone="red">ไม่พบรอบที่เปิดรับสมัครของคอร์สนี้ตอนนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ</Warn>
      )}
      <Field label="จำกัดจำนวนรอบ (0 = ไม่จำกัด)">
        <TextInput
          value={content?.limit ?? 0}
          onChange={(v) => patch({ limit: Number.parseInt(v, 10) || 0 })}
        />
      </Field>
      {courseId !== '' && <SampleLabel />}
    </>
  );
}

/**
 * Editing an array of items in place. `set` replaces the whole array — the
 * reducer's PATCH_SECTION_KEY merges at the KEY level, so handing it a mutated
 * copy of the array is the only way to change one item without a bespoke action.
 */
function ItemList({ items, set, fields, addLabel, emptyWarn }) {
  const list = Array.isArray(items) ? items : [];
  const update = (i, patch) => set(list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i) => set(list.filter((_, j) => j !== i));
  const add = () => set([...list, Object.fromEntries(fields.map((f) => [f.key, f.type === 'check' ? true : '']))]);

  /**
   * ── KEEPING THE KEYBOARD ON THE ITEM, NOT ON THE ROW ────────────────────
   * Pressing ขึ้น moves the item away from the button that was pressed, and
   * because the rows are keyed by position that button now belongs to a
   * DIFFERENT item. Without this, a second press would move a different item —
   * so holding the key to walk an item up a list would shuffle the list
   * instead. The move records where the item landed, and the effect puts focus
   * on the same control in its new row, so repeat presses keep moving the one
   * item the author started with.
   *
   * At the ends the same-direction button is disabled and cannot take focus,
   * so focus falls to the opposite one — the row keeps the keyboard either way
   * rather than dropping it to the document.
   */
  const containerRef = useRef(null);
  const pendingFocus = useRef(null);
  useEffect(() => {
    const want = pendingFocus.current;
    pendingFocus.current = null;
    if (!want || !containerRef.current) return;
    const at = (dir) => containerRef.current.querySelector(`[data-move="${dir}"][data-row="${want.index}"]`);
    const target = at(want.dir);
    const fallback = at(want.dir === 'up' ? 'down' : 'up');
    const el = target && !target.disabled ? target : fallback;
    if (el && !el.disabled) el.focus();
  });

  const move = (i, dir) => {
    const to = dir === 'up' ? i - 1 : i + 1;
    // The ends are refused HERE, not in moveInArray. That helper clamps a
    // destination rather than rejecting it, so asking it to move item 0 to -1
    // hands back a NEW array in the SAME order — which would pass an identity
    // check and dirty the page for a press that changed nothing. The buttons at
    // the ends are disabled, so this is the second line of defence; it is also
    // what keeps the shared helper a pure extraction, unchanged for the tree.
    if (to < 0 || to >= list.length) return;
    pendingFocus.current = { index: to, dir };
    const next = moveInArray(list, i, to);
    if (next === list) return;
    set(next);
  };

  return (
    <div ref={containerRef}>
      {/* ── THE INDEX KEY, AND WHY REORDERING DOES NOT BREAK IT ─────────────
          Index keys plus mutable order is a known way to carry an input's
          state to the wrong row, so it was checked rather than left standing.
          It is safe HERE, and for a reason that can stop being true:

          the hazard needs state that React PRESERVES because the key matched.
          These rows have none. Every field is fully controlled — TextInput and
          TextArea render `value` straight from `item[f.key]`, there is no
          defaultValue and no uncontrolled input anywhere in fields.jsx, and
          neither the row nor the field components hold any state of their own.
          After a move, row i re-renders with the next item's props and every
          value is re-derived from those props rather than retained.

          The one thing a matched key DOES retain is focus, which is why the
          move handler above moves focus to where the item went.

          SO: give a row local state, or an uncontrolled input, and this stops
          being safe and the rows need a stable identity instead. The items
          carry no id to key on today, so that would mean adding one. */}
      {list.map((item, i) => (
        <div key={i} className="mb-2 rounded-9e-md border border-[var(--surface-border)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-9e-slate-dp-50">#{i + 1}</span>
            <span className="flex items-center gap-0.5">
              {/* Buttons rather than drag-and-drop, and the keyboard is the
                  reason. Native HTML5 dragging has no keyboard path at all, so
                  a drag build would need a second mechanism next to it for
                  keyboard users — and that second mechanism is this one. The
                  ends are disabled rather than wrapping: an author walking an
                  item up stops at the top instead of finding it at the bottom. */}
              <button
                type="button" data-move="up" data-row={i} disabled={i === 0}
                aria-label={`ย้ายรายการที่ ${i + 1} ขึ้น`} onClick={() => move(i, 'up')}
                className="rounded p-0.5 text-9e-slate-dp-50 enabled:hover:bg-9e-ice enabled:hover:text-9e-action disabled:opacity-30 dark:enabled:hover:bg-9e-navy"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button" data-move="down" data-row={i} disabled={i === list.length - 1}
                aria-label={`ย้ายรายการที่ ${i + 1} ลง`} onClick={() => move(i, 'down')}
                className="rounded p-0.5 text-9e-slate-dp-50 enabled:hover:bg-9e-ice enabled:hover:text-9e-action disabled:opacity-30 dark:enabled:hover:bg-9e-navy"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                type="button" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => remove(i)}
                className="rounded p-0.5 text-9e-slate-dp-50 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          </div>
          {fields.map((f) => (
            f.type === 'check' ? (
              <label key={f.key} className="mb-1 flex items-center gap-1.5 text-[11px] text-9e-navy dark:text-white/90">
                <input type="checkbox" checked={item?.[f.key] !== false}
                  onChange={(e) => update(i, { [f.key]: e.target.checked })} />
                {f.label}
              </label>
            ) : f.type === 'area' ? (
              <Field key={f.key} label={f.label}>
                <TextArea value={item?.[f.key]} onChange={(v) => update(i, { [f.key]: v })} rows={2} />
              </Field>
            ) : (
              <Field key={f.key} label={f.label}>
                <TextInput value={item?.[f.key]} onChange={(v) => update(i, { [f.key]: v })} />
              </Field>
            )
          ))}
        </div>
      ))}
      {!list.length && emptyWarn && <Warn>{emptyWarn}</Warn>}
      <button
        type="button" onClick={add}
        className={cn(
          'flex w-full items-center justify-center gap-1 rounded-9e-md border border-dashed',
          'border-[var(--surface-border)] px-2 py-1 text-[11px] text-9e-slate-dp-50',
          'hover:border-9e-action/40 hover:text-9e-action'
        )}
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

const CHECKLIST_FIELDS = [{ key: 'text', label: 'ข้อความ' }, { key: 'checked', label: 'ติ๊กถูก', type: 'check' }];
const ITEM_FIELDS = [{ key: 'title', label: 'หัวข้อ' }, { key: 'body', label: 'เนื้อหา', type: 'area' }];

const CONTENT_EDITORS = {
  heading: HeadingEditor,
  rich_text: RichTextSectionEditor,
  image: ImageEditor,
  cta: CtaEditor,
  notice: NoticeEditor,
  price_card: PriceCardEditor,
  stat_card: StatCardEditor,
  icon_card: IconCardEditor,
  custom_html: CustomHtmlEditor,
  custom_css: CustomCssEditor,
  debug_json: DebugJsonEditor,
  embed: EmbedEditor,
  course_card: CourseCardEditor,
  instructor_card: InstructorCardEditor,
  course_selector: CourseSelectorEditor,
  bundle_courses: BundleCoursesEditor,
  course_list: CourseListEditor,
  course_schedule: CourseScheduleEditor,
  checklist: ({ content, patch }) => (
    <ItemList
      items={content?.items} set={(items) => patch({ items })} fields={CHECKLIST_FIELDS}
      addLabel="เพิ่มรายการ" emptyWarn="ยังไม่มีรายการ — section นี้จะว่างเปล่า"
    />
  ),
  timeline: ({ content, patch }) => (
    <ItemList items={content?.items} set={(items) => patch({ items })} fields={ITEM_FIELDS}
      addLabel="เพิ่มขั้นตอน" emptyWarn="ยังไม่มีขั้นตอน — section นี้จะว่างเปล่า" />
  ),
  accordion: ({ content, patch }) => (
    <ItemList items={content?.items} set={(items) => patch({ items })} fields={ITEM_FIELDS}
      addLabel="เพิ่มหัวข้อ" emptyWarn="ยังไม่มีหัวข้อ — section นี้จะว่างเปล่า" />
  ),
  tabs: ({ content, patch }) => (
    <ItemList items={content?.tabs} set={(tabs) => patch({ tabs })} fields={ITEM_FIELDS}
      addLabel="เพิ่มแท็บ" emptyWarn="ยังไม่มีแท็บ — section นี้จะว่างเปล่า" />
  ),
};

export function SectionContentEditor({ type, content, patch, advanced, resolved, courses = [] }) {
  const Editor = CONTENT_EDITORS[type];
  if (!Editor) {
    // Containers hold child sections, not content — the tree edits those.
    return isContainer(type) ? (
      <p className="text-[11px] text-9e-slate-dp-50">
        section นี้เป็นตัวจัดวาง — เพิ่มหรือย้าย section ที่อยู่ข้างในได้ที่แผง “โครงสร้างหน้า”
      </p>
    ) : null;
  }
  // `advanced` is read only by CustomCssEditor; `resolved` (the fetched
  // course/instructor, or list) only by the 2C.2a data-backed editors — it is
  // what turns the edit-time fetch into a fail-closed warning instead of a
  // placeholder. The rest ignore both.
  return <Editor content={content ?? {}} patch={patch} advanced={advanced} resolved={resolved} courses={courses} />;
}
