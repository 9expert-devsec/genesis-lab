import Link from 'next/link';
import { PolicyLayout } from '@/components/policies/PolicyLayout';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import { POLICY_HUB, POLICY_ENTITY, findPolicy } from '@/config/policies';

const policy = findPolicy('refund-policy');

export const metadata = {
  title: `${policy.title} (${policy.titleEn})`,
  description: policy.blurb,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/refund-policy` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/refund-policy` },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROUND R-B — APPROVED COPY, PORTED FROM นโยบายการยกเลิกและคืนเงิน.docx
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every section body below is the approved Cancellation & Refund Policy text:
 * reviewed and signed off by the person who owns it, though not reviewed by
 * counsel. The pre-force notice that used to say so above the content was
 * removed when the legal centre went live. The previous copy — invented refund
 * percentages and notice-period tiers behind PolicyDraftNotice — is dropped
 * wholesale, not edited; the source policy is a flat no-refund rule per course
 * type, not a percentage schedule.
 *
 * §1 (intro) is not an accordion; §2–§7 are the six accordions, one per course
 * type plus the two exception sections — six real topics fill the six slots
 * exactly. The source docx numbered ข้อยกเว้น and ช่องทางติดต่อ both "5";
 * ช่องทางติดต่อ is dropped as a dedicated section (see below) and ข้อยกเว้น is
 * renumbered §7 rather than porting the collision.
 *
 * ── THE SUMMARY GRID IS UNNUMBERED AND LAST ────────────────────────────────
 * It used to be §2, which made the page read as eight sections when only seven
 * carry a rule: the cards restate the four course-type sections rather than
 * adding anything. It now renders after ข้อยกเว้น, with no number badge and no
 * สารบัญ entry, and every "ข้อ N" reference counts the numbered sections only.
 *
 * ⚠ "ข้อ 7" IN THE E-LEARNING SECTION IS NOT THIS PAGE'S §7. It points at
 * /terms — a different document with its own numbering. When the company-
 * cancellation section moved from §7 to §6, four references followed it and
 * that one deliberately did NOT. A find-and-replace across "ข้อ 7" corrupts it.
 *
 * No dedicated "contact" accordion: the footer on every page carries the
 * contact details (phone, email, the chat channels), so the docx's contact
 * details are not duplicated inline here. The sidebar help card that used to
 * be cited for this was itself a duplicate of the footer and is gone.
 */

const HIGHLIGHTS = [
  {
    icon: 'listChecks',
    course: 'Public Training',
    outcome: 'ไม่คืนเงินหากผู้ใช้บริการยกเลิก',
    detail: 'ไม่ว่าจะเข้าร่วมอบรมหรือไม่',
  },
  {
    icon: 'settings',
    course: 'In-House Training',
    outcome: 'ไม่คืนเงินหากผู้ใช้บริการยกเลิก',
    detail: 'เมื่อยืนยันการจอง/ชำระเงินตามใบเสนอราคาหรือสัญญาแล้ว',
  },
  {
    icon: 'check',
    course: 'Masterclass',
    outcome: 'ไม่คืนเงินหากผู้ใช้บริการยกเลิก',
    detail: 'เช่นเดียวกับ Public Training',
  },
  {
    icon: 'shield',
    course: 'E-Learning',
    outcome: 'ไม่คืนเงินหากผู้ใช้บริการยกเลิก',
    detail: 'เมื่อได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว ไม่ว่าจะเข้าเรียนหรือไม่',
  },
];

// `highlights` is deliberately NOT here. The summary grid moved below the
// numbered sections and lost its number, so listing it in a สารบัญ of numbered
// items would promise an eighth section that no longer exists. Its `id` is kept
// on the section itself, so a /refund-policy#highlights link already shared
// still lands on it.
const TOC = [
  { id: 'intro', title: 'หลักการทั่วไป' },
  { id: 'public-training', title: 'Public Training' },
  { id: 'inhouse-training', title: 'In-House Training' },
  { id: 'masterclass', title: 'Masterclass' },
  { id: 'elearning', title: 'E-Learning' },
  { id: 'company-cancellation', title: 'กรณีบริษัทเป็นผู้ยกเลิกหรือเลื่อนหลักสูตร' },
  { id: 'exceptions', title: 'ข้อยกเว้น' },
];

export default function RefundPolicyPage() {
  return (
    <PolicyLayout
      breadcrumb={[
        { label: 'หน้าหลัก', href: '/' },
        { label: POLICY_HUB.title, href: POLICY_HUB.href },
        { label: policy.title },
      ]}
      illustration={policy.illustration}
      title={policy.title}
      titleEn={policy.titleEn}
      lede={`${POLICY_ENTITY} (9Expert) กำหนดหลักเกณฑ์และเงื่อนไขการยกเลิกการสมัครอบรม การเลื่อนวันอบรม และการขอคืนเงิน เพื่อความชัดเจนและเป็นธรรมกับผู้เข้าอบรมทุกท่าน`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      /* NO help card — see /terms: a generic "ต้องการความช่วยเหลือ?" card
         repeats the footer on the same page. test/render/policyHelpCard pins
         the absence. */
    >
      <div className="space-y-10">
        <section id="intro" className="scroll-mt-24">
          <h2 className="flex items-center gap-3 text-[18px] font-bold text-[var(--text-primary)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-[12px] text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
              1
            </span>
            หลักการทั่วไป
          </h2>
          <p className="mt-3 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
            เมื่อผู้ใช้บริการชำระเงินค่าบริการหลักสูตรฝึกอบรมกับ{POLICY_ENTITY}{' '}
            (&quot;บริษัท&quot;) เรียบร้อยแล้ว
            บริษัทจะไม่คืนเงินในกรณีที่ผู้ใช้บริการเป็นฝ่ายยกเลิก
            ไม่ว่าจะเป็นหลักสูตรประเภท Public Training, In-House Training,
            Masterclass หรือ E-Learning Training (หลักสูตรเรียนออนไลน์)
            เว้นแต่กรณีที่บริษัทเป็นฝ่ายยกเลิกหรือเลื่อนการอบรมเอง
            ซึ่งผู้ใช้บริการมีสิทธิตามข้อ 6
            ขอให้ผู้ใช้บริการพิจารณาและตรวจสอบรายละเอียดหลักสูตร วันเวลาอบรม
            และความพร้อมของตนเองอย่างรอบคอบก่อนทำการชำระเงินทุกครั้ง
          </p>
        </section>

        <PolicyAccordion
          items={[
            {
              id: 'public-training',
              number: '2',
              icon: 'listChecks',
              title: 'Public Training',
              defaultOpen: true,
              body: (
                <p>
                  เมื่อชำระเงินและลงทะเบียนแล้ว บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าร่วมการอบรมหรือไม่ก็ตาม เว้นแต่กรณีตามข้อ 6
                </p>
              ),
            },
            {
              id: 'inhouse-training',
              number: '3',
              icon: 'settings',
              title: 'In-House Training',
              body: (
                <p>
                  หลักสูตร In-House Training เป็นการอบรมเฉพาะสำหรับองค์กรผู้ว่าจ้าง
                  เมื่อองค์กรยืนยันการจองและ/หรือชำระเงินตามใบเสนอราคา (Quotation)
                  หรือสัญญาที่ตกลงกันแล้ว บริษัทจะไม่คืนเงินไม่ว่ากรณีใด
                  เว้นแต่กรณีตามข้อ 6
                  เงื่อนไขการชำระเงินและกำหนดการอบรมเป็นไปตามที่ระบุไว้ในใบเสนอราคาหรือสัญญาฉบับนั้น
                </p>
              ),
            },
            {
              id: 'masterclass',
              number: '4',
              icon: 'check',
              title: 'Masterclass',
              body: (
                <p>
                  เมื่อชำระเงินและลงทะเบียนหลักสูตร Masterclass แล้ว
                  บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าร่วมการอบรมหรือไม่ก็ตาม เช่นเดียวกับหลักสูตร
                  Public Training เว้นแต่กรณีตามข้อ 6
                </p>
              ),
            },
            {
              id: 'elearning',
              number: '5',
              icon: 'shield',
              title: 'E-Learning',
              body: (
                <p>
                  สิทธิ์เข้าถึงเนื้อหาเริ่มนับเมื่อระบบตรวจสอบและยืนยันการชำระเงินสำเร็จ
                  ตามที่ระบุใน{' '}
                  <Link
                    href="/terms#service-types"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    ข้อกำหนดและเงื่อนไข
                  </Link>{' '}
                  (Terms &amp; Conditions) ข้อ 7
                  เมื่อระบบเปิดสิทธิ์เข้าถึงเนื้อหาให้แล้ว บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าเรียนหรือเปิดดูเนื้อหาแล้วหรือไม่ก็ตาม
                </p>
              ),
            },
            {
              id: 'company-cancellation',
              number: '6',
              icon: 'refund',
              title: 'กรณีบริษัทเป็นผู้ยกเลิกหรือเลื่อนหลักสูตร',
              body: (
                <p>
                  ในกรณีที่บริษัทจำเป็นต้องยกเลิกหรือเลื่อนการอบรม เช่น
                  จำนวนผู้เข้าอบรมไม่ครบตามเกณฑ์ หรือเหตุสุดวิสัย
                  ผู้ใช้บริการมีสิทธิเลือกอย่างใดอย่างหนึ่ง ดังนี้ (1)
                  ย้ายไปยังรอบอบรมถัดไปที่ตกลงร่วมกันโดยไม่มีค่าใช้จ่ายเพิ่มเติม หรือ (2)
                  ขอรับเงินคืนเต็มจำนวนสำหรับบริการที่ไม่สามารถเปิดอบรมได้เลย ทั้งนี้
                  บริษัทจะแจ้งขั้นตอนและกำหนดเวลาดำเนินการให้ทราบ
                </p>
              ),
            },
            {
              id: 'exceptions',
              number: '7',
              icon: 'help',
              title: 'ข้อยกเว้น',
              body: (
                <p>
                  บริษัทขอสงวนสิทธิ์ในการพิจารณาเป็นกรณีพิเศษ
                  เฉพาะกรณีที่เนื้อหาหรือระบบของหลักสูตรออนไลน์มีความบกพร่องทางเทคนิคจนไม่สามารถเข้าถึงบริการได้ทั้งหมด
                  โดยผู้ใช้บริการต้องแจ้งบริษัททราบภายในระยะเวลาที่บริษัทกำหนด
                  และการพิจารณาเป็นไปตามดุลยพินิจของบริษัท
                </p>
              ),
            },
          ]}
        />

        {/*
          THE SUMMARY IS UNNUMBERED, AND SITS AFTER THE NUMBERED SECTIONS.
          It restates §2–§5 in four cards rather than adding a rule of its own,
          so a number would make the page claim eight sections when it has
          seven — and every "ข้อ N" reference in the copy counts the numbered
          ones. Reading order follows: the rules first, the summary of them
          last. The `id` survives the move so an existing #highlights link does
          not 404 into nothing.
        */}
        <section id="highlights" className="scroll-mt-24">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
            สรุปตามประเภทหลักสูตร
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.course}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
                  <PolicyIcon name={item.icon} className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold text-[var(--text-muted)]">
                  {item.course}
                </p>
                <p className="text-[16px] font-bold text-[var(--text-primary)]">
                  {item.outcome}
                </p>
                <p className="mt-1 text-[13px] leading-[1.7] text-[var(--text-secondary)]">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PolicyLayout>
  );
}
