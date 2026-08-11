import Link from 'next/link';
import { PolicyLayout } from '@/components/policies/PolicyLayout';
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
 *  THE ONLY POLICY PAGE WITH REAL CONTENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The body below is ported from the live site at
 * 9experttraining.com/privacy-policy. It is REAL, published text — the seven
 * sections, the four-row data-category table, the six rights, the thirty-day
 * response commitment and the DPO block are all as published. The sibling
 * pages (/cookie-policy, /terms, /refund-policy) carry mocked copy and say so
 * on the page; this one does not, because it must not.
 *
 * ── TWO THINGS CHANGED IN THE PORT, BOTH DELIBERATE ─────────────────────────
 *
 * 1. THE COMPANY NAME'S ENCODING. The live page writes it with the decomposed
 *    นิคหิต sequence U+0E4D + U+0E32 rather than the composed U+0E33. The two
 *    render near-identically, so the defect is invisible on screen and total in
 *    every string comparison. It is read here from POLICY_ENTITY —
 *    siteConfig.nameFull — which is composed, and test/fs/policyEncoding
 *    guards it. Do NOT re-copy this text from the live site without
 *    re-checking; see that test for why no normalisation call will save you.
 *
 * 2. THE DATE — AND THEN BACK AGAIN. The live page is stamped 9 กันยายน 2564,
 *    and this page shows that date. It briefly showed 11 สิงหาคม 2569, from a
 *    single shared date in config, and that was wrong in a way worth recording:
 *    the wording below is 2564's, unchanged, so a 2569 stamp told every visitor
 *    the privacy terms had been reviewed two years more recently than they had.
 *    A date on a legal page is a claim about the CONTENT, not about the build.
 *
 *    `updated` is now per page in config/policies.js. This one moves when
 *    somebody actually reviews the wording below — not when the site is
 *    rebuilt, and not when the sibling pages get new copy.
 */

/** The four data categories the live page publishes, as a table. */
const DATA_CATEGORIES = [
  {
    category: 'ข้อมูลระบุตัวตน',
    detail: 'ชื่อ-นามสกุล, เลขประจำตัวประชาชน, หมายเลขผู้เสียภาษี, ภาพถ่าย/วิดีโอโครงการ',
  },
  {
    category: 'ข้อมูลการติดต่อ',
    detail: 'ที่อยู่จัดส่ง, ที่อยู่ใบแจ้งหนี้, หมายเลขโทรศัพท์, อีเมล, LINE ID, Facebook ID',
  },
  {
    category: 'ข้อมูลธุรกรรมและการเงิน',
    detail: 'รายละเอียดการชำระเงิน, บัญชีธนาคาร, ข้อมูลบัตรเครดิต/เดบิต, ประวัติการสั่งซื้อ',
  },
  {
    category: 'ข้อมูลทางเทคนิค',
    detail: 'IP Address, ข้อมูลคุกกี้, ประวัติการเข้าชมเว็บไซต์, รุ่นอุปกรณ์และระบบปฏิบัติการ',
  },
];

/** §2's three definitions. */
const DEFINITIONS = [
  {
    term: 'ข้อมูลส่วนบุคคล',
    meaning:
      'ข้อมูลเกี่ยวกับบุคคลซึ่งทำให้สามารถระบุตัวบุคคลนั้นได้ไม่ว่าทางตรงหรือทางอ้อม',
  },
  {
    term: 'กฎหมายคุ้มครองข้อมูลส่วนบุคคล',
    meaning: 'พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และประกาศที่เกี่ยวข้อง',
  },
  {
    term: 'ข้อมูลที่เก็บรวบรวม',
    meaning:
      'ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บโดยอัตโนมัติหรือจากการให้ข้อมูลโดยสมัครใจของผู้ใช้บริการ',
  },
];

/** §4's four processing purposes. */
const PURPOSES = [
  {
    term: 'การให้บริการ',
    meaning: 'เพื่อการลงทะเบียน ยืนยันตัวตน และดำเนินการตามคำร้องขอของผู้ใช้บริการ',
  },
  {
    term: 'การพัฒนาบริการ',
    meaning:
      'วิเคราะห์ผลการเรียนเชิงสถิติ วิจัยการตลาด และปรับปรุงแพลตฟอร์มให้เหมาะสมกับพฤติกรรมผู้ใช้ (Personalization)',
  },
  {
    term: 'การสื่อสาร',
    meaning:
      'เพื่อแจ้งการเปลี่ยนแปลงระบบ นำเสนอคอร์สเรียนใหม่ และดำเนินการด้านโฆษณาตามความสนใจ (Interest-based advertising)',
  },
  {
    term: 'ความปลอดภัยและกฎหมาย',
    meaning:
      'เพื่อป้องกันการทุจริต ปฏิบัติตามภาระหน้าที่ตามสัญญา และปฏิบัติตามกฎหมายหรือกระบวนการทางกฎหมายที่เกี่ยวข้อง',
  },
];

/** §7's six statutory rights. */
const RIGHTS = [
  'สิทธิขอเข้าถึงข้อมูล',
  'สิทธิขอแก้ไขข้อมูลให้ถูกต้อง',
  'สิทธิขอเพิกถอนความยินยอม',
  'สิทธิขอให้ลบหรือทำลายข้อมูล',
  'สิทธิในการระงับการใช้ข้อมูล',
  'สิทธิในการยื่นเรื่องร้องเรียน',
];

const TOC = [
  { id: 'section-1', title: 'หลักการและขอบเขตการบังคับใช้' },
  { id: 'section-2', title: 'คำนิยาม' },
  { id: 'section-3', title: 'ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บ' },
  { id: 'section-4', title: 'วัตถุประสงค์ในการจัดเก็บและใช้ข้อมูล' },
  { id: 'section-5', title: 'การใช้เทคโนโลยีคุกกี้ (Cookies)' },
  { id: 'section-6', title: 'การเปิดเผยข้อมูลแก่บุคคลภายนอก' },
  { id: 'section-7', title: 'สิทธิของเจ้าของข้อมูลส่วนบุคคล' },
];

function DefinitionList({ items }) {
  return (
    <dl className="mt-4 space-y-3">
      {items.map((item) => (
        <div key={item.term} className="flex gap-3">
          <PolicyIcon
            name="check"
            className="mt-1 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
            strokeWidth={2.5}
          />
          <div>
            <dt className="inline text-[14px] font-bold text-[var(--text-primary)]">
              {item.term}:{' '}
            </dt>
            <dd className="inline text-[14px] leading-[1.8] text-[var(--text-secondary)]">
              {item.meaning}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

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
      icon={policy.icon}
      title={policy.title}
      titleEn={policy.titleEn}
      lede={`${POLICY_ENTITY} (9EXPERT) ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของผู้ใช้บริการทุกท่าน และดำเนินการตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      help={{
        icon: 'dpo',
        title: 'มีคำถามเกี่ยวกับข้อมูลส่วนบุคคล?',
        blurb: 'ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ของเราได้ทุกเวลา',
        href: '/contact-us',
        cta: 'ดูช่องทางการติดต่อ',
      }}
    >
      <div className="space-y-10">
        <Section id="section-1" number="1" title="หลักการและขอบเขตการบังคับใช้">
          <p>
            {POLICY_ENTITY} (ซึ่งต่อไปนี้จะเรียกว่า &ldquo;บริษัท&rdquo;)
            เคารพในสิทธิความเป็นส่วนตัวของผู้ใช้บริการทุกท่าน
            นโยบายนี้ถูกจัดทำขึ้นเพื่อชี้แจงรายละเอียดเกี่ยวกับการเก็บรวบรวม ใช้ เปิดเผย
            และรักษาความปลอดภัยของข้อมูลส่วนบุคคล
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
            โดยครอบคลุมทุกช่องทางการให้บริการของบริษัท
          </p>
        </Section>

        <Section id="section-2" number="2" title="คำนิยาม">
          <DefinitionList items={DEFINITIONS} />
        </Section>

        <Section id="section-3" number="3" title="ข้อมูลส่วนบุคคลที่บริษัทจัดเก็บ">
          <p>บริษัทอาจเก็บรวบรวมข้อมูลส่วนบุคคลของท่าน ดังต่อไปนี้:</p>
          {/* Wide content scrolls inside its own container — the page body
              must never scroll horizontally on a phone. */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--surface-border)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-[var(--surface-muted)]">
                  <th className="w-[30%] px-4 py-3 font-bold text-[var(--text-primary)]">
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
                    <td className="px-4 py-3 align-top leading-[1.7] text-[var(--text-secondary)]">
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <PolicyAccordion
          items={[
            {
              id: 'section-4',
              number: '4',
              icon: 'listChecks',
              title: 'วัตถุประสงค์ในการจัดเก็บและใช้ข้อมูล',
              defaultOpen: true,
              body: (
                <>
                  <p>
                    บริษัทดำเนินการประมวลผลข้อมูลภายใต้ฐานทางกฎหมาย
                    เพื่อวัตถุประสงค์ดังต่อไปนี้:
                  </p>
                  <DefinitionList items={PURPOSES} />
                </>
              ),
            },
            {
              id: 'section-5',
              number: '5',
              icon: 'cookie',
              title: 'การใช้เทคโนโลยีคุกกี้ (Cookies)',
              body: (
                <p>
                  บริษัทมีการใช้คุกกี้เพื่อจดจำอุปกรณ์และติดตามพฤติกรรมการใช้งาน
                  เพื่อมอบเนื้อหาที่เหมาะสมกับความสนใจของท่าน
                  ท่านสามารถตั้งค่าเพื่อปฏิเสธการใช้คุกกี้ได้ผ่านเบราว์เซอร์ของท่าน
                  แต่อาจส่งผลกระทบต่อการใช้งานฟังก์ชันบางประการบนเว็บไซต์
                  ทั้งนี้บริษัทมีการใช้งาน Google Analytics
                  เพื่อประเมินและสร้างรายงานกิจกรรมบนอินเทอร์เน็ตของผู้ใช้บริการ
                  รายละเอียดเพิ่มเติมอยู่ใน{' '}
                  <Link
                    href="/cookie-policy"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    นโยบายการใช้คุกกี้
                  </Link>
                </p>
              ),
            },
            {
              id: 'section-6',
              number: '6',
              icon: 'mail',
              title: 'การเปิดเผยข้อมูลแก่บุคคลภายนอก',
              body: (
                <p>
                  บริษัทอาจเปิดเผยข้อมูลส่วนบุคคลให้แก่ บริษัทในเครือ,
                  ผู้ให้บริการด้านเทคโนโลยี (Cloud/Data Analytics), สถาบันการเงิน
                  หรือหน่วยงานราชการตามที่กฎหมายกำหนด
                  โดยบริษัทจะรักษาข้อมูลเป็นความลับภายใต้เงื่อนไขที่กำหนดไว้เท่านั้น
                </p>
              ),
            },
            {
              id: 'section-7',
              number: '7',
              icon: 'shield',
              title: 'สิทธิของเจ้าของข้อมูลส่วนบุคคล',
              defaultOpen: true,
              body: (
                <>
                  <p>ท่านมีสิทธิตามกฎหมายที่สามารถดำเนินการได้ ดังนี้:</p>
                  <ul className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    {RIGHTS.map((right) => (
                      <li key={right} className="flex items-start gap-2">
                        <PolicyIcon
                          name="check"
                          className="mt-0.5 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                          strokeWidth={2.5}
                        />
                        <span>{right}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-[13px]">
                    * บริษัทจะดำเนินการตามคำร้องขอภายใน 30 วัน
                    นับจากวันที่ได้รับข้อมูลครบถ้วน
                  </p>
                </>
              ),
            },
          ]}
        />

        {/* DPO contact block — published on the live page, kept verbatim in
            substance. The address is the one the site already publishes in the
            footer; the live page obfuscates it behind an email-protection
            script, so it is written out here rather than copied. */}
        <section
          id="dpo"
          className="scroll-mt-24 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-6"
        >
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-[var(--text-primary)]">
            <PolicyIcon
              name="dpo"
              className="h-5 w-5 text-9e-action dark:text-[#48B0FF]"
            />
            ติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO)
          </h2>
          <p className="mt-2 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
            หากท่านมีข้อสงสัยหรือต้องการใช้สิทธิตามกฎหมาย โปรดติดต่อเราได้ที่:
          </p>
          <dl className="mt-4 space-y-2 text-[14px]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-primary)]">อีเมล:</dt>
              <dd>
                <a
                  href="mailto:training@9expert.co.th"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  training@9expert.co.th
                </a>
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
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-primary)]">ช่องทางอื่น:</dt>
              <dd>
                <Link
                  href="/contact-us"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  ดูช่องทางการติดต่อทั้งหมด
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </PolicyLayout>
  );
}
