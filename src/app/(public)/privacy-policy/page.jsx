import Link from 'next/link';
import { PolicyLayout, PolicyStatusNotice } from '@/components/policies/PolicyLayout';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import { POLICY_HUB, POLICY_ENTITY, findPolicy } from '@/config/policies';

const policy = findPolicy('privacy-policy');

export const metadata = {
  title: `${policy.title} (${policy.titleEn})`,
  description: policy.blurb,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/privacy-policy` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/privacy-policy` },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SOURCE: privacy-policy-9expert-revised.docx  (14 sections, 3 tables)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This page is a wholesale replacement of the 7-section text previously ported
 * from 9experttraining.com. It is a genuine rewrite, not an extension: the old
 * structure is gone, and the substantive additions are the legal-basis column
 * in §4, the eight rights in §12, overseas transfer (§7), breach notification
 * (§10) and minors (§11) — none of which the old text had.
 *
 * The source document closes with: "เอกสารนี้จัดทำขึ้นเพื่อเป็นแนวทางเบื้องต้น
 * ตาม PDPA ไม่ถือเป็นคำแนะนำทางกฎหมาย ควรให้ที่ปรึกษากฎหมายตรวจสอบก่อนเผยแพร่
 * ใช้งานจริง" — it is a starting point under PDPA, not legal advice, and
 * counsel should review it before publication. That note lives HERE and is not
 * rendered: it is an instruction to us, not a statement to a visitor.
 *
 * ── WHAT WAS DROPPED FROM THE DOCUMENT, AND WHY ─────────────────────────────
 *
 * 1. THE EFFECTIVE DATE. The document is stamped [DD/MM/YYYY]. The site is not
 *    in production, so the policy has never taken effect and there is no honest
 *    date to print. `updated` is null; PolicyHero renders no stamp rather than
 *    an empty one. The launch date becomes the effective date.
 *
 * 2. ALL FIVE ROWS OF §5's RETENTION TABLE. Every one read [ระบุจำนวนปี] or
 *    similar. A retention period is the single most checkable promise in a
 *    privacy policy, and a bracketed blank beside "ข้อมูลการชำระเงิน" is worse
 *    than no table — it looks like a commitment while committing to nothing.
 *    The table is omitted entirely; the closing paragraph about deletion when
 *    the purpose expires is real and stays. THE FIVE PERIODS ARE STILL OWED.
 *
 * 3. เลขประจำตัวประชาชน from §3. Confirmed with the user: not collected. No
 *    such field exists in register-public.js or RegisterPublic.js either.
 *
 * 4. บัญชีธนาคาร and ข้อมูลบัตรเครดิต/เดบิต from §3. We do not hold either.
 *    RegisterPublic's PaymentSchema stores `method`, `omiseChargeId`,
 *    `omiseStatus`, `paidAt` and failure codes — a reference to a charge held
 *    by Omise, never card or account numbers. §3 and §9 now say that instead
 *    of implying we store and encrypt card data ourselves.
 *
 * 5. LINE ID and Facebook ID from §3's contact row. `lineId` was removed from
 *    the public registration form (see the comment at register-public.js:252)
 *    and no Facebook ID field exists anywhere. Claiming to collect identifiers
 *    we do not collect is the same class of error as the national ID.
 *
 * ── ROWS KEPT THAT THIS REPO CANNOT CONFIRM ─────────────────────────────────
 * Reported rather than silently trimmed, because they are plausible for the
 * COMPANY even though nothing in this codebase evidences them:
 *   · ภาพถ่าย/วิดีโอโครงการ — plausible (training sessions are photographed),
 *     but no upload path in this repo collects it during registration.
 *   · ข้อมูลการเรียน — explicitly scoped "(เฉพาะแพลตฟอร์มออนไลน์)", i.e. the
 *     external academy at academy.9experttraining.com, which is not built here.
 */

/**
 * §3 — data categories.
 *
 * Verified against src/lib/schemas/register-public.js and
 * src/models/RegisterPublic.js. See the header for the five removals.
 */
const DATA_CATEGORIES = [
  {
    category: 'ข้อมูลระบุตัวตน',
    detail: 'ชื่อ-นามสกุล, ชื่อบริษัท/หน่วยงาน, หมายเลขผู้เสียภาษี (สำหรับออกใบกำกับภาษี), ภาพถ่าย/วิดีโอโครงการ',
  },
  {
    category: 'ข้อมูลการติดต่อ',
    detail: 'อีเมล, หมายเลขโทรศัพท์, ที่อยู่จัดส่ง, ที่อยู่ใบแจ้งหนี้',
  },
  {
    category: 'ข้อมูลธุรกรรมและการชำระเงิน',
    detail: 'ประวัติการสั่งซื้อ, วิธีการชำระเงิน และรหัสอ้างอิงรายการชำระเงินจากผู้ให้บริการ โดยบริษัทไม่จัดเก็บหมายเลขบัตรเครดิต/เดบิต หรือเลขที่บัญชีธนาคารของท่าน',
  },
  {
    category: 'ข้อมูลทางเทคนิค',
    detail: 'IP Address, ข้อมูลคุกกี้, ประวัติการเข้าชมเว็บไซต์, รุ่นอุปกรณ์และระบบปฏิบัติการ',
  },
  {
    category: 'ข้อมูลการเรียน (เฉพาะแพลตฟอร์มออนไลน์)',
    detail: 'ความคืบหน้าการเรียน, ผลการทดสอบ, ใบรับรอง/Certificate ที่ออกให้',
  },
];

/**
 * §4 — purpose and LEGAL BASIS.
 *
 * The ฐานทางกฎหมาย column is the most valuable thing in the rewrite; the old
 * text had no equivalent. Kept in full.
 *
 * ── ONE ROW WAS ALTERED: การตลาดและโฆษณาตามความสนใจ ─────────────────────────
 * The document reads "ความยินยอม (Consent) — ท่านสามารถถอนความยินยอมได้ทุกเมื่อ".
 * There is NO consent UI on this site: no cookie banner, no preference centre,
 * no toggle anywhere in this repo. "Withdraw at any time" with nothing to
 * withdraw through is a promise the page cannot keep, and under PDPA a consent
 * basis whose withdrawal is impractical is worse than no claim at all.
 *
 * So the row names the channels that DO exist — browser settings, and the DPO
 * address in §14, both of which are real today.
 *
 * TODO(cookie-banner): when a consent banner ships, restore the document's
 * original wording — "ท่านสามารถถอนความยินยอมได้ทุกเมื่อ" — and point it at the
 * banner. Same sentence, same row. It comes back the day the UI exists.
 */
const PROCESSING_PURPOSES = [
  {
    purpose: 'การให้บริการ',
    detail: 'การลงทะเบียน ยืนยันตัวตน และดำเนินการตามคำร้องขอของผู้ใช้บริการ',
    basis: 'การปฏิบัติตามสัญญา',
  },
  {
    purpose: 'การพัฒนาบริการ',
    detail: 'วิเคราะห์ผลการเรียนเชิงสถิติและปรับปรุงแพลตฟอร์ม',
    basis: 'ประโยชน์โดยชอบด้วยกฎหมาย',
  },
  {
    purpose: 'การสื่อสาร / แจ้งเตือนระบบ',
    detail: 'แจ้งการเปลี่ยนแปลงระบบ และการให้บริการที่จำเป็น',
    basis: 'การปฏิบัติตามสัญญา',
  },
  {
    purpose: 'การตลาดและโฆษณาตามความสนใจ',
    detail: 'นำเสนอคอร์สเรียนใหม่ และโฆษณาตามความสนใจ (Interest-based advertising)',
    basis: 'ความยินยอม (Consent) — ท่านสามารถจัดการคุกกี้เพื่อการโฆษณาได้ผ่านการตั้งค่าเบราว์เซอร์ หรือติดต่อ DPO ตามข้อ 14',
  },
  {
    purpose: 'ความปลอดภัยและการปฏิบัติตามกฎหมาย',
    detail: 'ป้องกันการทุจริต ปฏิบัติตามภาระหน้าที่ตามสัญญา และกฎหมาย',
    basis: 'การปฏิบัติตามกฎหมาย',
  },
];

/** §2 — definitions. */
const DEFINITIONS = [
  {
    term: 'ข้อมูลส่วนบุคคล',
    meaning: 'ข้อมูลเกี่ยวกับบุคคล ซึ่งทำให้สามารถระบุตัวบุคคลนั้นได้ ไม่ว่าทางตรง หรือทางอ้อม',
  },
  {
    term: 'กฎหมายคุ้มครองข้อมูลส่วนบุคคล',
    meaning: 'พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และประกาศที่เกี่ยวข้อง',
  },
  {
    term: 'ข้อมูลที่เก็บรวบรวม',
    meaning: 'ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บโดยอัตโนมัติ หรือจากการให้ข้อมูลโดยสมัครใจของผู้ใช้บริการ',
  },
];

/** §12 — EIGHT rights, not the old text's six. Portability and สคส. are new. */
const RIGHTS = [
  'สิทธิขอเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคล',
  'สิทธิขอแก้ไขข้อมูลให้ถูกต้องเป็นปัจจุบัน',
  'สิทธิขอเพิกถอนความยินยอม',
  'สิทธิขอให้ลบหรือทำลายข้อมูล',
  'สิทธิขอให้ระงับการใช้ข้อมูล',
  'สิทธิคัดค้านการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูล',
  'สิทธิขอให้โอนย้ายข้อมูลไปยังผู้ควบคุมข้อมูลรายอื่น (Data Portability) ในกรณีที่สามารถดำเนินการได้ทางเทคนิค',
  'สิทธิยื่นเรื่องร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)',
];

const TOC = [
  { id: 'section-1', title: 'หลักการและขอบเขตการบังคับใช้' },
  { id: 'section-2', title: 'คำนิยาม' },
  { id: 'section-3', title: 'ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บ' },
  { id: 'section-4', title: 'วัตถุประสงค์และฐานทางกฎหมาย' },
  { id: 'section-5', title: 'ระยะเวลาการเก็บรักษาข้อมูล' },
  { id: 'section-6', title: 'การเปิดเผยข้อมูลแก่บุคคลภายนอก' },
  { id: 'section-7', title: 'การโอนข้อมูลไปต่างประเทศ' },
  { id: 'section-8', title: 'การใช้เทคโนโลยีคุกกี้' },
  { id: 'section-9', title: 'มาตรการรักษาความปลอดภัยของข้อมูล' },
  { id: 'section-10', title: 'การแจ้งเหตุการละเมิดข้อมูลส่วนบุคคล' },
  { id: 'section-11', title: 'ข้อมูลของผู้เยาว์' },
  { id: 'section-12', title: 'สิทธิของเจ้าของข้อมูลส่วนบุคคล' },
  { id: 'section-13', title: 'การปรับปรุงนโยบาย' },
  { id: 'section-14', title: 'ช่องทางติดต่อ' },
];

function Section({ id, number, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
        <span className="mr-2 text-9e-action dark:text-[#48B0FF]">{number}.</span>
        {title}
      </h2>
      <div className="mt-3 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
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
      lede={`${POLICY_ENTITY} (9EXPERT) เคารพในสิทธิความเป็นส่วนตัวของผู้ใช้บริการทุกท่าน นโยบายนี้อธิบายการเก็บรวบรวม ใช้ เปิดเผย และรักษาความปลอดภัยของข้อมูลส่วนบุคคล ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      /*
        This page never carried a banner, because its content was real and the
        amber draft warning would have been false. But "real" was never the
        same as "in force": the site is not in production, the policy has never
        taken effect, and counsel has not reviewed the rewrite. A visitor had no
        way to know any of that.

        The detail line names the one substantive gap — §5's retention periods,
        which were dropped because every row in the source was [ระบุจำนวนปี].
        Phrased as "ยังไม่ได้กำหนด", not "อยู่ระหว่างการกำหนด": nobody is
        currently determining them.
      */
      notice={
        <PolicyStatusNotice detail="ระยะเวลาการเก็บรักษาข้อมูลแต่ละประเภทในข้อ 5 ยังไม่ได้กำหนด และจะระบุเพิ่มเติมเมื่อนโยบายฉบับนี้เริ่มมีผลบังคับใช้" />
      }
      help={{
        icon: 'dpo',
        title: 'มีคำถามเกี่ยวกับข้อมูลส่วนบุคคล?',
        blurb: 'ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ของเราได้ทุกเวลา',
        href: '#section-14',
        cta: 'ดูช่องทางการติดต่อ',
      }}
    >
      <div className="space-y-10">
        <Section id="section-1" number="1" title="หลักการและขอบเขตการบังคับใช้">
          <p>
            {POLICY_ENTITY} (ซึ่งต่อไปนี้จะเรียกว่า &ldquo;บริษัท&rdquo;)
            เคารพในสิทธิความเป็นส่วนตัวของผู้ใช้บริการทุกท่าน นโยบายนี้ถูกจัดทำขึ้น
            เพื่อชี้แจงรายละเอียดเกี่ยวกับการเก็บรวบรวม ใช้ เปิดเผย
            และรักษาความปลอดภัยของข้อมูลส่วนบุคคล
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
            โดยครอบคลุมทุกช่องทางให้บริการของบริษัท
          </p>
        </Section>

        <Section id="section-2" number="2" title="คำนิยาม">
          <dl className="mt-4 space-y-3">
            {DEFINITIONS.map((item) => (
              <div key={item.term} className="flex gap-3">
                <PolicyIcon
                  name="check"
                  className="mt-1 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                  strokeWidth={2.5}
                />
                <div>
                  <dt className="inline font-bold text-[var(--text-primary)]">
                    {item.term} :{' '}
                  </dt>
                  <dd className="inline">{item.meaning}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="section-3" number="3" title="ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บ">
          <p>บริษัทอาจเก็บรวบรวมข้อมูลส่วนบุคคลของท่าน ดังต่อไปนี้:</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--surface-border)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-[var(--surface-muted)]">
                  <th className="w-[32%] px-4 py-3 font-bold text-[var(--text-primary)]">
                    หมวดหมู่
                  </th>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">
                    รายละเอียด
                  </th>
                </tr>
              </thead>
              <tbody>
                {DATA_CATEGORIES.map((row) => (
                  <tr
                    key={row.category}
                    className="border-t border-[var(--surface-border)]"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 align-top font-semibold text-[var(--text-primary)]"
                    >
                      {row.category}
                    </th>
                    <td className="px-4 py-3 align-top leading-[1.7]">
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            บริษัทไม่มีนโยบายจัดเก็บข้อมูลอ่อนไหว (Sensitive Data) เช่น เชื้อชาติ ศาสนา
            ความเชื่อ ประวัติสุขภาพ หรือข้อมูลชีวภาพ
            เว้นแต่จะได้รับความยินยอมโดยชัดแจ้งจากท่านเป็นการเฉพาะกรณี
          </p>
        </Section>

        <Section
          id="section-4"
          number="4"
          title="วัตถุประสงค์และฐานทางกฎหมายในการประมวลผลข้อมูล"
        >
          <p>
            บริษัทประมวลผลข้อมูลส่วนบุคคลของท่านภายใต้ฐานทางกฎหมายที่แตกต่างกันไปตามวัตถุประสงค์
            ดังนี้ :
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--surface-border)]">
            <table className="w-full min-w-[680px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-[var(--surface-muted)]">
                  <th className="w-[24%] px-4 py-3 font-bold text-[var(--text-primary)]">
                    วัตถุประสงค์
                  </th>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">
                    รายละเอียด
                  </th>
                  <th className="w-[28%] px-4 py-3 font-bold text-[var(--text-primary)]">
                    ฐานทางกฎหมาย
                  </th>
                </tr>
              </thead>
              <tbody>
                {PROCESSING_PURPOSES.map((row) => (
                  <tr
                    key={row.purpose}
                    className="border-t border-[var(--surface-border)]"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 align-top font-semibold text-[var(--text-primary)]"
                    >
                      {row.purpose}
                    </th>
                    <td className="px-4 py-3 align-top leading-[1.7]">{row.detail}</td>
                    <td className="px-4 py-3 align-top leading-[1.7]">{row.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="section-5" number="5" title="ระยะเวลาการเก็บรักษาข้อมูล">
          {/*
            The document's retention table had five rows and every single one
            was [ระบุจำนวนปี]. Omitted entirely rather than rendered with
            blanks — see the file header. The paragraph below is the document's
            own and is a real commitment.
          */}
          <p>
            เมื่อพ้นระยะเวลาที่จำเป็น หรือเมื่อหมดความจำเป็นตามวัตถุประสงค์ที่เก็บรวบรวม
            บริษัทจะดำเนินการลบ ทำลาย
            หรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้ (Anonymization) ตามความเหมาะสม
          </p>
        </Section>

        <PolicyAccordion
          items={[
            {
              id: 'section-6',
              number: '6',
              icon: 'mail',
              title: 'การเปิดเผยข้อมูลแก่บุคคลภายนอก',
              defaultOpen: true,
              body: (
                <p>
                  บริษัทอาจเปิดเผยข้อมูลส่วนบุคคลให้แก่บริษัทในเครือ
                  ผู้ให้บริการด้านเทคโนโลยี เช่น ผู้ให้บริการ Cloud, ระบบชำระเงิน,
                  Google Analytics เป็นต้น สถาบันการเงิน
                  หรือหน่วยงานราชการตามที่กฎหมายกำหนด
                  โดยบริษัทจะกำหนดให้ผู้ให้บริการดังกล่าวรักษาความลับและความปลอดภัย
                  ใช้ข้อมูลเท่าที่จำเป็นตามขอบเขตที่บริษัทมอบหมายเท่านั้น
                </p>
              ),
            },
            {
              id: 'section-7',
              number: '7',
              icon: 'shield',
              title: 'การโอนข้อมูลไปต่างประเทศ',
              body: (
                <p>
                  การใช้บริการบางส่วนของบริษัท เช่น Google Analytics และผู้ให้บริการ
                  Cloud อาจมีการประมวลผล
                  หรือจัดเก็บข้อมูลบนเซิร์ฟเวอร์ที่ตั้งอยู่ต่างประเทศ
                  บริษัทจะดำเนินการให้การโอนข้อมูลดังกล่าวเป็นไปตามมาตรฐานการคุ้มครองข้อมูลที่กฎหมายกำหนด
                  โดยเลือกใช้ผู้ให้บริการที่มีมาตรการคุ้มครองข้อมูลที่เพียงพอ
                  หรือได้รับการรับรองตามมาตรฐานสากล
                </p>
              ),
            },
            {
              id: 'section-8',
              number: '8',
              icon: 'cookie',
              title: 'การใช้เทคโนโลยีคุกกี้ (Cookies)',
              body: (
                <p>
                  บริษัทมีการใช้คุกกี้บนเว็บไซต์
                  เพื่อจดจำอุปกรณ์และปรับปรุงประสบการณ์การใช้งาน รายละเอียดประเภทคุกกี้
                  ผู้ให้บริการ และวิธีการจัดการคุกกี้ ระบุไว้ใน{' '}
                  <Link
                    href="/cookie-policy"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    นโยบายการใช้คุกกี้ (Cookie Policy)
                  </Link>{' '}
                  ซึ่งเป็นเอกสารแยกต่างหาก
                </p>
              ),
            },
            {
              id: 'section-9',
              number: '9',
              icon: 'settings',
              title: 'มาตรการรักษาความปลอดภัยของข้อมูล',
              /*
                F4 — the document's wording implied the company encrypts
                "ข้อมูลการชำระเงิน" itself. It does not hold that data to
                encrypt: card details go directly to Omise and only a charge
                reference comes back. Rewritten to describe the provider's role
                accurately rather than borrowing credit for it, and the
                document's unverifiable "ทบทวน...อย่างสม่ำเสมอ" claim is stated
                as intent rather than as an established practice.
              */
              body: (
                <p>
                  บริษัทกำหนดมาตรการรักษาความปลอดภัย ทั้งด้านเทคนิค
                  และการบริหารจัดการที่เหมาะสม เพื่อป้องกันการสูญหาย เข้าถึง ใช้
                  เปลี่ยนแปลง แก้ไข หรือเปิดเผยข้อมูลโดยไม่มีอำนาจ
                  หรือโดยไม่ชอบด้วยกฎหมาย ได้แก่
                  การจำกัดสิทธิ์การเข้าถึงข้อมูลเฉพาะผู้ที่เกี่ยวข้อง
                  สำหรับการชำระเงิน
                  บริษัทใช้ผู้ให้บริการรับชำระเงินที่ได้มาตรฐานเป็นผู้ดำเนินการ
                  ข้อมูลบัตรของท่านจะถูกส่งไปยังผู้ให้บริการดังกล่าวโดยตรง
                  บริษัทไม่ได้จัดเก็บหมายเลขบัตรไว้ในระบบของบริษัท
                </p>
              ),
            },
            {
              id: 'section-10',
              number: '10',
              icon: 'alert',
              title: 'การแจ้งเหตุการละเมิดข้อมูลส่วนบุคคล',
              body: (
                <p>
                  ในกรณีที่เกิดเหตุการละเมิดข้อมูลส่วนบุคคล
                  บริษัทจะดำเนินการแจ้งเหตุไปยังสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล
                  (สคส.) โดยไม่ชักช้าตามระยะเวลาที่กฎหมายกำหนด
                  และหากเหตุการละเมิดดังกล่าวมีความเสี่ยงสูงที่จะกระทบต่อสิทธิและเสรีภาพของท่าน
                  บริษัทจะแจ้งให้ท่านทราบพร้อมแนวทางเยียวยาโดยไม่ชักช้าเช่นกัน
                </p>
              ),
            },
            {
              id: 'section-11',
              number: '11',
              icon: 'dpo',
              title: 'ข้อมูลของผู้เยาว์',
              body: (
                <p>
                  บริการของบริษัทมีผู้ใช้บริการที่อาจมีอายุต่ำกว่า 20 ปีบริบูรณ์
                  ในกรณีที่ผู้เยาว์มีอายุไม่เกิน 10 ปี
                  บริษัทจะขอความยินยอมจากผู้ใช้อำนาจปกครองก่อนเก็บรวบรวมข้อมูล
                  ในกรณีที่ผู้เยาว์มีอายุระหว่าง 10 – 20 ปี
                  และการให้ความยินยอมมิใช่สิ่งที่ผู้เยาว์สามารถให้ได้เองตามกฎหมาย
                  บริษัทจะขอความยินยอมจากผู้ใช้อำนาจปกครองเพิ่มเติมตามที่กฎหมายกำหนด
                </p>
              ),
            },
            {
              id: 'section-12',
              number: '12',
              icon: 'listChecks',
              title: 'สิทธิของเจ้าของข้อมูลส่วนบุคคล',
              defaultOpen: true,
              body: (
                <>
                  <p>ท่านมีสิทธิตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล ดังนี้ :</p>
                  <ul className="mt-4 space-y-2">
                    {RIGHTS.map((right) => (
                      <li key={right} className="flex items-start gap-2">
                        <PolicyIcon
                          name="check"
                          className="mt-1 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                          strokeWidth={2.5}
                        />
                        <span>{right}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-[13px]">
                    บริษัทจะดำเนินการตามคำร้องขอภายใน 30 วัน
                    นับจากวันที่ได้รับข้อมูลครบถ้วน
                    ท่านสามารถใช้สิทธิดังกล่าวผ่านช่องทางติดต่อในข้อ 14
                  </p>
                </>
              ),
            },
            {
              id: 'section-13',
              number: '13',
              icon: 'calendar',
              title: 'การปรับปรุงนโยบาย',
              body: (
                <p>
                  บริษัทอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราว
                  เพื่อให้สอดคล้องกับการเปลี่ยนแปลงของกฎหมาย หรือการให้บริการ
                  โดยจะแจ้งวันที่ปรับปรุงล่าสุดไว้ที่ด้านบนของเอกสาร
                  และหากมีการเปลี่ยนแปลงที่มีนัยสำคัญ
                  บริษัทจะแจ้งให้ท่านทราบผ่านช่องทางที่เหมาะสม เช่น ประกาศบนเว็บไซต์
                  หรืออีเมล
                </p>
              ),
            },
          ]}
        />

        {/* §14 — the document's contact block, kept in full. */}
        <section
          id="section-14"
          className="scroll-mt-24 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-6"
        >
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-[var(--text-primary)]">
            <PolicyIcon
              name="dpo"
              className="h-5 w-5 text-9e-action dark:text-[#48B0FF]"
            />
            <span>
              <span className="mr-2 text-9e-action dark:text-[#48B0FF]">14.</span>
              ช่องทางติดต่อ
            </span>
          </h2>
          <p className="mt-2 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
            หากท่านมีข้อสงสัยหรือต้องการใช้สิทธิตามกฎหมาย โปรดติดต่อ :
          </p>
          <dl className="mt-4 space-y-3 text-[14px] text-[var(--text-secondary)]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-primary)]">
                เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO):
              </dt>
              <dd>
                <a
                  href="mailto:dpo@9expert.co.th"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  dpo@9expert.co.th
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-primary)]">ที่อยู่:</dt>
              <dd className="leading-[1.8]">
                เลขที่ 318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B ซอยวรฤทธิ์ ถนนพญาไท
                แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-primary)]">โทรศัพท์:</dt>
              <dd>
                <a
                  href="tel:022194304"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  02-219-4304
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </PolicyLayout>
  );
}
