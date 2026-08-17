'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import * as LucideIcons from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { createBanner, updateBanner } from '@/lib/actions/banners';
import {
  ALL_TYPE_LABELS,
  BANNER_TYPE_HINTS,
  BANNER_TYPE_IDS,
  BANNER_TYPES,
  LEGACY_TYPE_HINTS,
  isLegacyBannerType,
  normaliseBannerType,
} from '@/lib/banners/bannerTypes';
import {
  BANNER_FIELDS,
  linkUrlRejectsYouTube,
  requiresField,
  showsField,
} from '@/lib/banners/bannerFormFields';
import { FEATURE_TAGS_INPUT, IMAGE_INPUTS } from '@/lib/banners/bannerFormPayload';
import { isYouTubeLinkUrl } from '@/lib/bannerLinkUrl';
import { toLocalInput } from '@/lib/articlePublishTime';
import { FEATURE_TAG_ICONS } from '@/lib/schemas/banner';
import { BannerArticlePicker } from './BannerArticlePicker';
import { BannerCoursePicker } from './BannerCoursePicker';

/**
 * ── WHAT CHANGED IN THIS SLICE, AND WHY IT HAD TO ──────────────────────────
 * The form used to derive its whole layout from three booleans:
 *
 *     const isYouTube = type === LEGACY_TYPES.YOUTUBE;
 *     const isImage   = type.startsWith(BANNER_TYPES.IMAGE);
 *     const hasButton = type.includes('button');
 *
 * Every one of them dies on the four new ids, and the last two were never
 * asking the right question in the first place: `startsWith` is a prefix match
 * on a naming convention, and `includes('button')` reads a WORD IN AN ID rather
 * than a field. All three are gone. Which controls a type renders is now a
 * complete literal table in src/lib/banners/bannerFormFields.js, keyed by the
 * NORMALISED type, and every branch below is an explicit `showsField(...)`
 * against it. The proof that the substring tests are really gone is a `course`
 * record: `'course'.startsWith('image')` is false today by accident, and the
 * table makes it false on purpose.
 *
 * ── THE DROPDOWN NOW OFFERS THE FOUR NEW TYPES ─────────────────────────────
 * It offered LEGACY_TYPE_IDS only, because the four new ones had no fields
 * behind them. They do now — course picker, article picker, per-type slots — so
 * the four are what an admin creates with. The five legacy ids are still
 * ACCEPTED (the schema takes both sets and all 22 stored documents carry one),
 * and a record already on a legacy id keeps its own option in the list so that
 * opening and saving it does not silently retype it. A NEW banner is never
 * offered one.
 *
 * ── EVERY CONDITIONAL CONTROL IS A FIELD THE ACTION MUST NOT BLANK ─────────
 * A control that is not rendered posts nothing, and the old parser read every
 * key unconditionally with `|| ''` — so saving a banner wrote empty strings over
 * fields that belong to a different type. That is now impossible by
 * construction: bannerFormPayload uses `FormData.has()`, so a field that was not
 * on screen is carried over from the stored document. It matters immediately:
 * six stored `youtube` records carry `link_text: "YouTube"` and six carry
 * 187–340 characters of `slide_text`, and `video` renders neither control.
 */

/**
 * The dropdown. Four new ids always; the record's own legacy id as well, when
 * it has one.
 *
 * Built rather than listed, so the option set cannot drift from BANNER_TYPE_IDS
 * — and so the legacy option appears for exactly the records that need it
 * instead of for everyone.
 */
function typeOptions(currentType) {
  const ids = [...BANNER_TYPE_IDS];
  if (isLegacyBannerType(currentType)) ids.push(currentType);
  return ids.map((value) => ({ value, label: ALL_TYPE_LABELS[value] }));
}

export function BannerForm({ banner, courseOptions, articleOptions }) {
  const isEdit = !!banner?._id;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A NEW banner starts on `image`: it is the only type whose required field is
  // an upload the admin already has in hand, and it is what 16 of the 22 stored
  // records are. An EDIT starts on whatever the record says, legacy id included.
  const [type, setType] = useState(banner?.type ?? BANNER_TYPES.IMAGE);
  const [imagePreview, setImagePreview] = useState(banner?.image_url ?? '');
  const [featureTags, setFeatureTags] = useState(banner?.feature_tags ?? []);
  const [courseRef, setCourseRef] = useState({
    upstreamId: banner?.course_ref?.upstreamId ?? '',
    courseId: banner?.course_ref?.courseId ?? '',
    // NO default to in-class on a NEW record. The namespace must be an explicit
    // choice — see BannerCoursePicker. A stored ref keeps whatever it was saved
    // with, so an existing record opens on its own namespace.
    kind: banner?.course_ref?.kind ?? '',
  });
  const [articleSlug, setArticleSlug] = useState(banner?.article_slug ?? '');
  const [linkUrl, setLinkUrl] = useState(banner?.link_url ?? '');
  const [errors, setErrors] = useState({});

  // ── THE ONE PLACE A TYPE DECIDES ANYTHING ────────────────────────────────
  // Normalised once; every branch is an equality test against the table. No
  // startsWith, no includes, no `type ===` against a raw string anywhere below.
  const shows = (field) => showsField(type, field);
  const required = (field) => requiresField(type, field);

  /**
   * The `link_url` rule the table cannot hold: on a video banner it must not be
   * a YouTube URL.
   *
   * ── WHY THIS BLOCKS THE SAVE RATHER THAN WARNING ──────────────────────────
   * The mapper already refuses such a link at render time, because
   * "ดูรายละเอียด" must lead somewhere other than the video the card is already
   * playing inline. Refusing it only there means the admin types a URL, saves
   * successfully, and gets a control that does nothing — the silent-dead-field
   * class this whole area keeps producing. Enforcing it here is the difference
   * between an error and silence.
   *
   * ── AND WHAT THAT COSTS, STATED PLAINLY ───────────────────────────────────
   * All SIX stored `youtube` records carry exactly this: a watch URL for the id
   * already in `youtube_id`. So all six now have to clear the field before they
   * can be saved again. That value is ALREADY inert — the mapper drops it — so
   * clearing it changes nothing on the home page, and the button below makes it
   * one click. The alternative was to keep six records saveable while leaving
   * the field silently dead for everyone, which is the thing being fixed.
   */
  const linkUrlIsRejectedYouTube =
    shows(BANNER_FIELDS.LINK_URL)
    && linkUrlRejectsYouTube(type)
    && isYouTubeLinkUrl(linkUrl);

  // The course namespace is required and is never defaulted, so "not chosen
  // yet" is a real state the submit has to refuse.
  const courseKindMissing =
    shows(BANNER_FIELDS.COURSE_REF) && !courseRef.kind;

  const blocked = linkUrlIsRejectedYouTube || courseKindMissing;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function addFeatureTag() {
    setFeatureTags((tags) =>
      tags.length >= 3 ? tags : [...tags, { icon: '', line1: '', line2: '' }]
    );
  }

  function updateFeatureTag(index, field, value) {
    setFeatureTags((tags) =>
      tags.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function removeFeatureTag(index) {
    setFeatureTags((tags) => tags.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (blocked) return;

    const formData = new FormData(e.target);
    // The checkbox rides as an explicit 'true'/'false' so the parser can tell
    // "unchecked" from "this control was not on screen" — the same normalisation
    // ArticleForm does, and the reason bannerFormPayload can use `has()`.
    formData.set(
      BANNER_FIELDS.ACTIVE,
      formData.get(BANNER_FIELDS.ACTIVE) === 'on' ? 'true' : 'false'
    );

    startTransition(async () => {
      const result = isEdit
        ? await updateBanner(banner._id, formData)
        : await createBanner(formData);

      if (result.ok) {
        router.push('/admin/banners');
        router.refresh();
      } else {
        setErrors(result.errors ?? {});
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* ── Type ─────────────────────────────────────────────────────────── */}
      <Field label="ประเภท Banner *" error={errors.type}>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={inputCls(errors.type)}
        >
          {typeOptions(banner?.type).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {isLegacyBannerType(type) && (
        <p className="-mt-3 rounded-9e-md border border-gray-200 bg-9e-ice/50 px-3 py-2 text-xs text-9e-slate-dp-50">
          ประเภทเดิม — จะถูกอ่านเป็น
          {' '}<strong>{ALL_TYPE_LABELS[normaliseBannerType(type)]}</strong>{' '}
          บนหน้าแรก และเห็นฟิลด์ชุดเดียวกัน เปลี่ยนเป็นประเภทใหม่ได้เมื่อพร้อม
        </p>
      )}

      {/* ── Headline: title / line 2 / highlight ─────────────────────────── */}
      {shows(BANNER_FIELDS.TITLE) && (
        <Field
          label={required(BANNER_FIELDS.TITLE) ? 'ชื่อ Banner *' : 'ชื่อ Banner'}
          error={errors.title}
          hint={
            required(BANNER_FIELDS.TITLE)
              ? undefined
              : 'ไม่บังคับ — ปล่อยว่างไว้จะใช้ชื่อจากคอร์ส/บทความที่เลือก และจะอัปเดตตามต้นทางเองเมื่อชื่อนั้นเปลี่ยน'
          }
        >
          <input
            name={BANNER_FIELDS.TITLE}
            defaultValue={banner?.title ?? ''}
            required={required(BANNER_FIELDS.TITLE)}
            className={inputCls(errors.title)}
            placeholder="ชื่อ Banner"
          />
        </Field>
      )}

      {shows(BANNER_FIELDS.TITLE_LINE2) && (
        <Field
          label="ชื่อ บรรทัดที่ 2"
          error={errors.title_line2}
          hint="บรรทัดที่สองของหัวเรื่อง — ไม่บังคับ"
        >
          <input
            name={BANNER_FIELDS.TITLE_LINE2}
            defaultValue={banner?.title_line2 ?? ''}
            className={inputCls(errors.title_line2)}
          />
        </Field>
      )}

      {shows(BANNER_FIELDS.TITLE_HIGHLIGHT) && (
        <Field
          label="ข้อความเน้นสี (Highlight)"
          error={errors.title_highlight}
          hint="ส่วนที่แสดงด้วยสีเน้นในหัวเรื่อง — ไม่บังคับ"
        >
          <input
            name={BANNER_FIELDS.TITLE_HIGHLIGHT}
            defaultValue={banner?.title_highlight ?? ''}
            className={inputCls(errors.title_highlight)}
          />
        </Field>
      )}

      {shows(BANNER_FIELDS.SUBTITLE) && (
        <Field
          label="ข้อความรอง (Subtitle)"
          error={errors.subtitle}
          hint={
            normaliseBannerType(type) === BANNER_TYPES.COURSE
              ? 'พิมพ์เอง — MSDB ไม่มีฟิลด์สำหรับข้อความรองของคอร์ส ถ้าเว้นว่างจะใช้ชื่อคอร์ส (course_name)'
              : 'ข้อความรองใต้หัวเรื่อง — ไม่บังคับ'
          }
        >
          <input
            name={BANNER_FIELDS.SUBTITLE}
            defaultValue={banner?.subtitle ?? ''}
            className={inputCls(errors.subtitle)}
          />
        </Field>
      )}

      {/* ── Description. Video/image only: course and article have a source ── */}
      {shows(BANNER_FIELDS.DESCRIPTION) && (
        <Field
          label="คำอธิบาย (Description)"
          error={errors.description}
          hint="ข้อความบรรยายใต้หัวเรื่อง (เดิมคือ Slide Text)"
        >
          <textarea
            name={BANNER_FIELDS.DESCRIPTION}
            /**
             * `description ?? slide_text`, the model's own stated rule, applied
             * to the FORM as well as to the reader.
             *
             * Six stored records hold 187–340 characters of live copy in
             * `slide_text` and nothing else can show it to an admin. Prefilling
             * from it means opening one of those records and saving copies the
             * text VERBATIM into `description` while `slide_text` is carried
             * forward untouched — and the mapper's `description ?? slide_text`
             * then reads the identical string out of the new field. The rendered
             * page does not change by one character, and the record has migrated
             * itself, one deliberate save at a time.
             */
            defaultValue={banner?.description ?? banner?.slide_text ?? ''}
            rows={4}
            className={inputCls(errors.description)}
          />
        </Field>
      )}

      {/* ── YouTube id — video only, required ────────────────────────────── */}
      {shows(BANNER_FIELDS.YOUTUBE_ID) && (
        <Field
          label="YouTube Video ID *"
          error={errors.youtube_id}
          hint="เช่น vZLIM8SQgdE (ส่วน ID ใน URL: youtube.com/watch?v=ID)"
        >
          <input
            name={BANNER_FIELDS.YOUTUBE_ID}
            defaultValue={banner?.youtube_id ?? ''}
            required={required(BANNER_FIELDS.YOUTUBE_ID)}
            className={inputCls(errors.youtube_id)}
            placeholder="vZLIM8SQgdE"
          />
        </Field>
      )}

      {/* ── Image upload — image only, required ──────────────────────────── */}
      {shows(BANNER_FIELDS.IMAGE) && (
        <Field
          label="รูปภาพ Banner *"
          error={errors.image_url}
          // UNTOUCHED IN THIS SLICE. The hint text and the upload-ratio warning
          // are S6b's, along with the focal-point control. Do not fold them in
          // here just because the field moved.
          hint={LEGACY_TYPE_HINTS[type] ?? BANNER_TYPE_HINTS[normaliseBannerType(type)]}
        >
          <input type="hidden" name={IMAGE_INPUTS.URL} value={banner?.image_url ?? ''} />
          <input
            type="hidden"
            name={IMAGE_INPUTS.PUBLIC_ID}
            value={banner?.image_public_id ?? ''}
          />
          <input
            type="file"
            name={IMAGE_INPUTS.FILE}
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:py-2 file:px-4
              file:rounded-9e-md file:border-0 file:text-sm file:font-bold
              file:bg-9e-action file:text-white hover:file:bg-9e-brand file:cursor-pointer"
          />
          {imagePreview && (
            <div className="mt-3 relative w-full h-40 rounded-9e-md overflow-hidden bg-9e-ice border border-[var(--surface-border)]">
              <Image src={imagePreview} alt="preview" fill className="object-cover" unoptimized />
            </div>
          )}
        </Field>
      )}

      {/* ── Course picker — course only, required ────────────────────────── */}
      {shows(BANNER_FIELDS.COURSE_REF) && (
        <Field label="คอร์สเรียน *" error={undefined}>
          <BannerCoursePicker
            value={courseRef}
            onChange={setCourseRef}
            options={courseOptions?.items ?? []}
            loadError={courseOptions?.error ?? null}
            error={errors.course_ref}
            inputClassName={inputCls(false)}
          />
        </Field>
      )}

      {/* ── Article picker — article only, required ──────────────────────── */}
      {shows(BANNER_FIELDS.ARTICLE_SLUG) && (
        <Field label="บทความ *" error={undefined}>
          <BannerArticlePicker
            value={articleSlug}
            onChange={setArticleSlug}
            options={articleOptions?.items ?? []}
            loadError={articleOptions?.error ?? null}
            error={errors.article_slug}
            inputClassName={inputCls(false)}
          />
        </Field>
      )}

      {/* ── Feature tags — video and image. Course/article derive theirs. ── */}
      {shows(BANNER_FIELDS.FEATURE_TAGS) && (
        <div>
          <label className="block text-sm font-bold text-9e-navy mb-1.5">
            Feature Tags (สูงสุด 3)
          </label>
          <p className="mb-3 text-xs text-9e-slate-dp-50">
            แถบข้อมูลสั้น ๆ ใต้ข้อความในแบนเนอร์ — ไม่บังคับ
          </p>

          <div className="space-y-3">
            {featureTags.map((tag, i) => {
              const Ico = tag.icon ? LucideIcons[tag.icon] : null;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-9e-md border border-gray-200 bg-9e-ice/40 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-9e-md bg-white border border-gray-200 text-9e-navy">
                      {Ico ? <Ico size={18} /> : <span className="text-xs text-9e-slate-dp-50">—</span>}
                    </span>
                    <select
                      value={tag.icon}
                      onChange={(e) => updateFeatureTag(i, 'icon', e.target.value)}
                      className={inputCls(false) + ' w-40'}
                    >
                      <option value="">— ไม่มีไอคอน —</option>
                      {FEATURE_TAG_ICONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      value={tag.line1}
                      onChange={(e) => updateFeatureTag(i, 'line1', e.target.value)}
                      className={inputCls(false)}
                      placeholder="บรรทัด 1 เช่น ผู้นำระดับโลก"
                      maxLength={60}
                    />
                    <input
                      value={tag.line2}
                      onChange={(e) => updateFeatureTag(i, 'line2', e.target.value)}
                      className={inputCls(false)}
                      placeholder="บรรทัด 2 เช่น ร่วมแบ่งปันมุมมอง"
                      maxLength={60}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFeatureTag(i)}
                    aria-label="ลบแท็ก"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-9e-md
                      text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addFeatureTag}
            disabled={featureTags.length >= 3}
            className="mt-3 px-4 py-2 text-sm font-bold rounded-9e-md border border-gray-300
              text-9e-navy hover:bg-9e-ice transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            เพิ่มแท็ก
          </button>

          <input type="hidden" name={FEATURE_TAGS_INPUT} value={JSON.stringify(featureTags)} />
        </div>
      )}

      {/* ── link_url — image and video. Course/article derive a destination. ── */}
      {shows(BANNER_FIELDS.LINK_URL) && (
        <Field
          label="URL ลิงก์"
          error={errors.link_url}
          hint={
            linkUrlRejectsYouTube(type)
              ? 'ไม่บังคับ — ปุ่ม "ดูรายละเอียด" ต้องพาไปหน้าอื่นที่ไม่ใช่วิดีโอ เพราะวิดีโอเล่นอยู่ในการ์ดอยู่แล้ว จึงใส่ลิงก์ YouTube ที่นี่ไม่ได้'
              : 'ลิงก์ที่เปิดเมื่อคลิกที่รูป — ไม่บังคับ'
          }
        >
          <input
            name={BANNER_FIELDS.LINK_URL}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className={inputCls(errors.link_url || linkUrlIsRejectedYouTube)}
            placeholder="https://..."
          />
          {linkUrlIsRejectedYouTube && (
            <div className="mt-2 rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              <p>
                <strong>ลิงก์นี้เป็น YouTube และไม่มีผลใด ๆ</strong> — หน้าแรกจะไม่ใช้ค่านี้
                เพราะวิดีโอเล่นอยู่ในการ์ดแล้ว ให้ล้างค่านี้ หรือใส่ลิงก์ไปหน้ารายละเอียดแทน
                จึงจะบันทึกได้
              </p>
              <button
                type="button"
                onClick={() => setLinkUrl('')}
                className="mt-2 rounded-9e-sm border border-red-400 px-2 py-1 font-bold
                  text-red-700 hover:bg-red-100 transition-colors"
              >
                ล้างลิงก์นี้
              </button>
            </div>
          )}
        </Field>
      )}

      {/* ── link_text — image only ───────────────────────────────────────── */}
      {shows(BANNER_FIELDS.LINK_TEXT) && (
        <Field
          label="ข้อความปุ่ม (Link Text)"
          error={errors.link_text}
          hint="เช่น ดูหลักสูตรทั้งหมดที่นี่"
        >
          <input
            name={BANNER_FIELDS.LINK_TEXT}
            defaultValue={banner?.link_text ?? ''}
            className={inputCls(errors.link_text)}
            placeholder="ดูหลักสูตรทั้งหมดที่นี่"
          />
        </Field>
      )}

      {/* ── Scheduling window — all four ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="เริ่มแสดง (Start)"
          error={errors.starts_at}
          hint="เว้นว่าง = แสดงทันที (เวลาไทย)"
        >
          <input
            name={BANNER_FIELDS.STARTS_AT}
            type="datetime-local"
            // `toLocalInput` renders the instant in Asia/Bangkok, NOT in the
            // runtime's zone — so the server-rendered value and the hydrated one
            // are the same string on a Bangkok laptop, a UTC lambda and a CI box
            // in Los Angeles. A `new Date(...)` here would differ between SSR and
            // hydration and React would patch it in without a warning.
            defaultValue={toLocalInput(banner?.starts_at)}
            className={inputCls(errors.starts_at)}
          />
        </Field>
        <Field
          label="หยุดแสดง (End)"
          error={errors.ends_at}
          hint="เว้นว่าง = แสดงตลอดไป (เวลาไทย)"
        >
          <input
            name={BANNER_FIELDS.ENDS_AT}
            type="datetime-local"
            defaultValue={toLocalInput(banner?.ends_at)}
            className={inputCls(errors.ends_at)}
          />
        </Field>
      </div>

      {/* ── Weight — all four ────────────────────────────────────────────── */}
      <Field
        label="ลำดับการแสดง (Weight)"
        error={errors.weight}
        hint="ตัวเลขน้อย = แสดงก่อน (ลบได้ เช่น -97 แสดงก่อนสุด)"
      >
        <input
          name={BANNER_FIELDS.WEIGHT}
          type="number"
          defaultValue={banner?.weight ?? 0}
          className={inputCls(errors.weight)}
        />
      </Field>

      {/* ── Active — all four ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          name={BANNER_FIELDS.ACTIVE}
          type="checkbox"
          id="active"
          defaultChecked={banner?.active ?? true}
          className="w-4 h-4 rounded accent-9e-action"
        />
        <label htmlFor="active" className="text-sm font-medium text-9e-navy">
          แสดง Banner นี้ (Active)
        </label>
      </div>

      {/* Anything the server rejected that has no field of its own. Without
          this, a superRefine issue on a path the form does not render would be
          swallowed and the save would look like it simply did nothing. */}
      {errors._ && (
        <p className="rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {Array.isArray(errors._) ? errors._[0] : String(errors._)}
        </p>
      )}

      <div className="flex gap-3 pt-2 items-center">
        <button
          type="submit"
          disabled={isPending || blocked}
          className="px-6 py-2.5 bg-9e-action hover:bg-9e-brand text-white font-bold
            rounded-9e-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isPending ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'สร้าง Banner'}
        </button>
        <a
          href="/admin/banners"
          className="px-6 py-2.5 border border-gray-300 text-9e-slate-dp-50 font-bold
            rounded-9e-md hover:bg-9e-ice transition-colors text-sm"
        >
          ยกเลิก
        </a>
        {courseKindMissing && (
          <span className="text-xs text-red-600">เลือกประเภทคอร์สก่อนจึงจะบันทึกได้</span>
        )}
      </div>
    </form>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-9e-navy mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-9e-slate-dp-50">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-500">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError) {
  return `w-full border rounded-9e-md px-4 py-2.5 text-sm text-9e-navy bg-white
    focus:outline-none focus:ring-2 transition-colors
    ${
      hasError
        ? 'border-red-400 focus:ring-red-200'
        : 'border-gray-200 hover:border-9e-air focus:ring-9e-action/20'
    }`;
}
