import { PolicyLayout, PolicyStatusNotice } from '@/components/policies/PolicyLayout';
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
 * Every section body below is the approved Cancellation & Refund Policy text.
 * This is the real thing PolicyStatusNotice describes: reviewed and signed off
 * by the person who owns it, not yet reviewed by counsel, and not yet in force
 * because the site is not in production. The previous copy — invented refund
 * percentages and notice-period tiers behind PolicyDraftNotice — is dropped
 * wholesale, not edited; the source policy is a flat no-refund rule per course
 * type, not a percentage schedule.
 *
 * §1 (intro) and §2 (highlight cards) are not accordions, matching how §1/§2
 * render on every other detail page. §3–§8 are the six accordions, one per
 * course type plus the two exception sections — six real topics fill the six
 * slots exactly. The source docx numbered ข้อยกเว้น and ช่องทางติดต่อ both "5";
 * ช่องทางติดต่อ is dropped as a dedicated section (see below) and ข้อยกเว้น is
 * renumbered §8 rather than porting the collision.
 *
 * No dedicated "contact" accordion: the sidebar help card every policy page
 * already renders ("ต้องการความช่วยเหลือ?" → /contact-us) covers this, so the
 * docx's contact details are not duplicated inline here.
 */

const HIGHLIGHTS = [
  {
    icon: 'listChecks',
    course: 'Public Training',
    outcome: 'ไม่คืนเงินทุกกรณี',
    detail: 'ไม่ว่าจะเข้าร่วมอบรมหรือไม่',
  },
  {
    icon: 'settings',
    course: 'In-House Training',
    outcome: 'ไม่คืนเงินทุกกรณี',
    detail: 'เมื่อยืนยันการจอง/ชำระเงินตามใบเสนอราคาหรือสัญญาแล้ว',
  },
  {
    icon: 'check',
    course: 'Masterclass',
    outcome: 'ไม่คืนเงินทุกกรณี',
    detail: 'เช่นเดียวกับ Public Training',
  },
  {
    icon: 'shield',
    course: 'E-Learning',
    outcome: 'ไม่คืนเงินทุกกรณี',
    detail: 'เมื่อได้รับสิทธิ์เข้าถึงเนื้อหาแล้ว ไม่ว่าจะเข้าเรียนหรือไม่',
  },
];

const TOC = [
  { id: 'intro', title: 'หลักการทั่วไป' },
  { id: 'highlights', title: 'สรุปตามประเภทหลักสูตร' },
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
      lede={`${POLICY_ENTITY} (9EXPERT) กำหนดหลักเกณฑ์และเงื่อนไขการยกเลิกการสมัครอบรม การเลื่อนวันอบรม และการขอคืนเงิน เพื่อความชัดเจนและเป็นธรรมกับผู้เข้าอบรมทุกท่าน`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      notice={
        <PolicyStatusNotice detail="เนื้อหาในหน้านี้จะมีผลบังคับใช้เมื่อเว็บไซต์เปิดให้บริการอย่างเป็นทางการ หากมีข้อสงสัยติดต่อ training@9expert.co.th" />
      }
      help={{
        icon: 'help',
        title: 'ต้องการความช่วยเหลือ?',
        blurb: 'เราพร้อมให้คำแนะนำและช่วยเหลือในทุกขั้นตอน',
        href: '/contact-us',
        cta: 'ติดต่อทีมงาน',
      }}
    >
      <div className="space-y-10">
        <section id="intro" className="scroll-mt-24">
          <h2 className="flex items-center gap-3 text-[18px] font-bold text-[var(--text-primary)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-[12px] text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
              01
            </span>
            หลักการทั่วไป
          </h2>
          <p className="mt-3 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
            เมื่อผู้ใช้บริการชำระเงินค่าบริการหลักสูตรฝึกอบรมกับ{POLICY_ENTITY}{' '}
            (&quot;บริษัท&quot;) เรียบร้อยแล้ว บริษัทจะไม่คืนเงินไม่ว่ากรณีใด ๆ
            ทั้งสิ้น ไม่ว่าจะเป็นหลักสูตรประเภท Public Training, In-House Training,
            Masterclass หรือ E-Learning Training (หลักสูตรเรียนออนไลน์)
            และไม่ว่าผู้ใช้บริการจะเป็นฝ่ายยกเลิก
            หรือบริษัทเป็นฝ่ายยกเลิก/เลื่อนการอบรมเองก็ตาม
            ขอให้ผู้ใช้บริการพิจารณาและตรวจสอบรายละเอียดหลักสูตร วันเวลาอบรม
            และความพร้อมของตนเองอย่างรอบคอบก่อนทำการชำระเงินทุกครั้ง
          </p>
        </section>

        <section id="highlights" className="scroll-mt-24">
          <h2 className="flex items-center gap-3 text-[18px] font-bold text-[var(--text-primary)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-[12px] text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
              02
            </span>
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

        <PolicyAccordion
          items={[
            {
              id: 'public-training',
              number: '3',
              icon: 'listChecks',
              title: 'Public Training',
              defaultOpen: true,
              body: (
                <p>
                  เมื่อชำระเงินและลงทะเบียนแล้ว บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าร่วมการอบรมหรือไม่ก็ตาม
                </p>
              ),
            },
            {
              id: 'inhouse-training',
              number: '4',
              icon: 'settings',
              title: 'In-House Training',
              body: (
                <p>
                  หลักสูตร In-House Training เป็นการอบรมเฉพาะสำหรับองค์กรผู้ว่าจ้าง
                  เมื่อองค์กรยืนยันการจองและ/หรือชำระเงินตามใบเสนอราคา (Quotation)
                  หรือสัญญาที่ตกลงกันแล้ว บริษัทจะไม่คืนเงินไม่ว่ากรณีใด
                  เงื่อนไขการชำระเงินและกำหนดการอบรมเป็นไปตามที่ระบุไว้ในใบเสนอราคาหรือสัญญาฉบับนั้น
                </p>
              ),
            },
            {
              id: 'masterclass',
              number: '5',
              icon: 'check',
              title: 'Masterclass',
              body: (
                <p>
                  เมื่อชำระเงินและลงทะเบียนหลักสูตร Masterclass แล้ว
                  บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าร่วมการอบรมหรือไม่ก็ตาม เช่นเดียวกับหลักสูตร
                  Public Training
                </p>
              ),
            },
            {
              id: 'elearning',
              number: '6',
              icon: 'shield',
              title: 'E-Learning',
              body: (
                <p>
                  เมื่อชำระเงินแล้ว ถือว่าผู้ใช้บริการได้รับสิทธิ์เข้าถึงเนื้อหาทันที
                  บริษัทจะไม่คืนเงินในทุกกรณี
                  ไม่ว่าผู้ใช้บริการจะเข้าเรียนหรือเปิดดูเนื้อหาแล้วหรือไม่ก็ตาม
                </p>
              ),
            },
            {
              id: 'company-cancellation',
              number: '7',
              icon: 'refund',
              title: 'กรณีบริษัทเป็นผู้ยกเลิกหรือเลื่อนหลักสูตร',
              body: (
                <p>
                  ในกรณีที่บริษัทจำเป็นต้องยกเลิกหรือเลื่อนการอบรม เช่น
                  จำนวนผู้เข้าอบรมไม่ครบตามเกณฑ์ หรือเหตุสุดวิสัย
                  บริษัทจะไม่คืนเงินเช่นกัน
                  ทั้งนี้บริษัทอาจพิจารณาเสนอที่นั่งในรอบอบรมถัดไปให้แก่ผู้ใช้บริการตามความเหมาะสม
                  ซึ่งเป็นดุลยพินิจของบริษัทเป็นกรณีไป
                  มิใช่สิทธิที่ผู้ใช้บริการเรียกร้องได้
                </p>
              ),
            },
            {
              id: 'exceptions',
              number: '8',
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
      </div>
    </PolicyLayout>
  );
}
