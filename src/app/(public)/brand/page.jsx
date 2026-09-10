import Link from 'next/link';
import { BrandSection } from './_components/BrandSection';
import { ColorSwatchGrid } from './_components/ColorSwatchGrid';
import { LogoVariantGrid } from './_components/LogoVariantGrid';
import { GuidancePair, GuidancePanel } from './_components/GuidancePanels';
import { MinimumSizeTable } from './_components/MinimumSizeTable';
import { WallpaperPanel } from './_components/WallpaperPanel';
import {
  LOGO_SHAPES,
  COLOR_GUIDANCE,
  BACKGROUND_GUIDANCE,
  PROHIBITIONS,
  LOGO_MEANING,
  BRAND_KEYWORDS,
} from './brandContent';

/**
 * /brand — the 9Expert brand hub.
 *
 * A SERVER COMPONENT with no data access and no async work: every value on this
 * page is a constant in src/lib/brand/palette.js or ./brandContent.js, so the
 * route is fully static and ships no client JavaScript of its own.
 *
 * ── THIS STATIC ROUTE BEATS THE CATCH-ALL. SAY IT OUT LOUD ──────────────────
 * `src/app/(public)/[...slug]/page.jsx` resolves a CustomPage by slug, and a
 * CustomPage draft has existed at a slug this route later took. Precedence is
 * static > dynamic > catch-all, and `(public)` is a route group that
 * contributes nothing to the URL, so from the moment this file exists
 * /brand is THIS page and the catch-all is never reached for that segment.
 * The two do not collide and nothing 500s: the draft simply becomes
 * unreachable at its own URL — including through the `?preview=` token, which
 * is handled inside the catch-all. Publishing the draft would NOT take the URL
 * back. It has to be deleted through the admin UI.
 *
 * ── CONTENT SOURCE ──────────────────────────────────────────────────────────
 * prompts/brand-page-content-reference.md — reviewed and approved. Section
 * order, Thai copy, table values and asset paths all come from it. Its markup
 * does NOT: that file is inline-CSS written for a CMS field, light-mode only,
 * with fifteen hand-repeated logo cards and the palette hardcoded six times.
 * This route replaces it.
 */

/**
 * THE ONE STRING ON THIS PAGE THAT IS NOT IN THE CONTENT REFERENCE.
 *
 * The reference has no <h1>: it was written for a CMS body field, where the
 * page title came from chrome above it. A real route has no such chrome — the
 * site's convention is that the page owns its own heading (see /faq, and the
 * policy pages via PolicyHero) — so one had to be written. It is derived from
 * the reference's own opening sentence ("ศูนย์รวมโลโก้ ระบบสี และหลักการใช้งาน
 * อัตลักษณ์ของ 9Expert Training") rather than invented from nothing, and it is
 * pulled out here — one constant feeding both the <h1> and the metadata title —
 * so it is easy to find and change when it is signed off.
 */
const PAGE_TITLE = 'โลโก้และอัตลักษณ์องค์กร';

export const metadata = {
  title: PAGE_TITLE,
  description:
    'ศูนย์รวมโลโก้ ระบบสี และหลักการใช้งานอัตลักษณ์ของ 9Expert Training ดาวน์โหลดไฟล์ต้นฉบับ SVG และ PNG ได้ทุกรูปแบบ',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/brand` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/brand` },
};

const LEAD_PARAGRAPHS = [
  'ศูนย์รวมโลโก้ ระบบสี และหลักการใช้งานอัตลักษณ์ของ 9Expert Training สำหรับสื่อสิ่งพิมพ์ สื่อดิจิทัล และงานร่วมกับพาร์ตเนอร์ ดาวน์โหลดไฟล์ต้นฉบับได้ทุกรูปแบบจากหน้านี้',
  'อ้างอิงจาก Master Brand Guideline เวอร์ชัน 1.0 (21 กรกฎาคม 2026) กรุณาใช้ไฟล์มาตรฐานจากหน้านี้เท่านั้น ไม่สร้างเวอร์ชันใหม่ด้วยตนเอง',
];

export default function LogoPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-12 pt-8 sm:px-6">
      <header>
        <p className="inline-block rounded-full bg-9e-action/10 px-3 py-1 font-en text-xs font-bold uppercase tracking-wider text-9e-action dark:bg-9e-air/10 dark:text-9e-air">
          Brand Asset Package
        </p>
        <h1 className="mt-2.5 font-heading text-[32px] font-bold leading-tight text-[var(--text-primary)]">
          {PAGE_TITLE}
        </h1>
        {LEAD_PARAGRAPHS.map((paragraph) => (
          <p
            key={paragraph}
            className="mt-3 max-w-[840px] text-base leading-loose text-[var(--text-secondary)]"
          >
            {paragraph}
          </p>
        ))}
      </header>

      <BrandSection
        id="color-system"
        title="ระบบสีของแบรนด์"
        blurb="ระบบสีแบ่งเป็นสีหลัก สีพื้นหลัง และสีเน้น แต่ละสีมีบทบาทชัดเจน ใช้สีตามบทบาทที่กำหนดเพื่อให้งานทุกชิ้นสื่อสารไปในทางเดียวกัน"
      >
        <ColorSwatchGrid />
        <div className="mt-[18px]">
          <GuidancePair affirm={COLOR_GUIDANCE.do} avoid={COLOR_GUIDANCE.dont} />
        </div>
      </BrandSection>

      {/* Signature / Symbol / Square — three sections, one component, fifteen
          cards. The shapes are data (brandContent.LOGO_SHAPES) so adding a fourth
          lockup is one entry, not another copy of this block. */}
      {LOGO_SHAPES.map((shape) => (
        <BrandSection key={shape.key} id={shape.key} title={shape.title} blurb={shape.blurb}>
          <LogoVariantGrid shape={shape.key} alt={shape.alt} stageHeight={shape.stageHeight} />
        </BrandSection>
      ))}

      <BrandSection
        id="minimum-size"
        title="ขนาดเล็กที่สุดที่ใช้ได้"
        blurb="การใช้โลโก้เล็กกว่าค่าที่กำหนดจะทำให้รายละเอียดหาย อ่านไม่ออก และลดการจดจำแบรนด์ ควรทดสอบการอ่านจริงบนสื่อปลายทางทุกครั้ง"
      >
        <MinimumSizeTable />
      </BrandSection>

      <BrandSection
        id="on-backgrounds"
        title="การวางโลโก้บนพื้นหลัง"
        blurb="เลือกเวอร์ชันสีให้สอดคล้องกับความเข้มของพื้นหลัง พื้นหลังที่รบกวนสายตาจะทำให้โลโก้อ่านยากและลดความน่าเชื่อถือ"
      >
        <GuidancePair affirm={BACKGROUND_GUIDANCE.do} avoid={BACKGROUND_GUIDANCE.dont} />
      </BrandSection>

      <BrandSection
        id="incorrect-usage"
        title="การใช้โลโก้ที่ไม่ถูกต้อง"
        blurb="โลโก้ต้องคงรูปแบบเดิมทุกครั้ง ใช้เฉพาะไฟล์ที่ได้รับอนุมัติ และห้ามสร้างเวอร์ชันใหม่ด้วยตนเอง เมื่อไม่แน่ใจให้กลับมาตรวจสอบจากหน้านี้"
      >
        {/* One panel, full width, and no affirmative partner — the reference
            has none here and inventing eight "do" bullets to balance the column
            would be writing guideline copy, not porting it. The list keeps two
            columns from sm up so eight short prohibitions do not read as a
            column of single words. */}
        <GuidancePanel
          tone="avoid"
          title={PROHIBITIONS.title}
          items={PROHIBITIONS.items}
          columns={2}
          className="w-full"
        />
      </BrandSection>

      <BrandSection
        id="logo-meaning"
        title="ความหมายของโลโก้"
        blurb="โลโก้ออกแบบมาเพื่อสื่อถึงความเป็นผู้เชี่ยวชาญ การนำทาง และการก้าวไปข้างหน้าอย่างต่อเนื่อง"
      >
        <div className="flex flex-wrap gap-3.5">
          {LOGO_MEANING.map((element) => (
            <div
              key={element.key}
              className="min-w-0 flex-[1_1_240px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3.5"
            >
              <h3 className="text-base font-bold text-[var(--text-primary)]">{element.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-primary)]">
                {element.detail}
              </p>
            </div>
          ))}
        </div>

        {/* The four brand keywords. In the reference they are the tail of the
            section's sub-line, run together with a middot; as chips they are
            legible as the four separate words they are. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
            คำสำคัญของแบรนด์
          </span>
          {BRAND_KEYWORDS.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-9e-action/10 px-3 py-1 font-en text-xs font-bold tracking-wide text-9e-action dark:bg-9e-air/10 dark:text-9e-air"
            >
              {keyword}
            </span>
          ))}
        </div>
      </BrandSection>

      <BrandSection
        id="wallpaper"
        title="Wallpaper"
        blurb="วอลเปเปอร์เดสก์ท็อปลายอัตลักษณ์ 9Expert ความละเอียด 8000 × 4500 พิกเซล"
      >
        <WallpaperPanel />
      </BrandSection>

      {/* The closing note: the page's own caveat about what guideline v1.0 does
          and does not yet cover. Not a BrandSection — it has no heading and is
          not a section of the guideline.

          ── AND NOT A `Card` EITHER, WHICH IS A MEASURED CHOICE ─────────────
          It wants a tinted blue ground rather than the neutral surface, and
          `bg-9e-action/5` CANNOT be handed to Card through `className`. Card
          merges with `cn` (twMerge), and twMerge does not know the project's
          custom `9e-*` scales, so it cannot see `bg-9e-action/5` and Card's own
          `bg-[var(--surface)]` as one conflict group: BOTH would survive into
          the markup and the winner would be Tailwind's emission order, not this
          file. Same trap as the `rounded-9e-*` one documented in button.jsx.
          A plain <div> owns its classes outright and has nothing to merge. */}
      <div className="mt-8 rounded-9e-lg border border-9e-action/20 bg-9e-action/5 p-4 shadow-9e-sm sm:p-[18px]">
        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
          <strong className="font-bold">หมายเหตุเรื่องเนื้อหา</strong>{' '}
          ข้อมูลทั้งหมดในหน้านี้อ้างอิงจาก Master Brand Guideline เวอร์ชัน 1.0
          ยกเว้นหัวข้อสัดส่วนการใช้สีและการตรวจคอนทราสต์ ซึ่งเอกสารเวอร์ชันนี้ยังไม่ได้ระบุไว้
          ส่วนนั้นเรียบเรียงจากแนวปฏิบัติที่ใช้อยู่จริง และรอผู้ออกแบบยืนยันในเวอร์ชันถัดไป
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">
          ต้องการไฟล์รูปแบบอื่น เช่น EPS หรือ AI สำหรับงานพิมพ์ หรือมีข้อสงสัยเรื่องการใช้อัตลักษณ์
          ติดต่อทีมงาน 9Expert ได้ที่{' '}
          <Link
            href="/contact-us"
            className="font-semibold text-9e-action underline underline-offset-4 dark:text-9e-air"
          >
            หน้าติดต่อเรา
          </Link>
        </p>
      </div>
    </div>
  );
}
