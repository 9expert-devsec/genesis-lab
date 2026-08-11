import Link from 'next/link';
import { PolicyLayout, PolicyDraftNotice } from '@/components/policies/PolicyLayout';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import { POLICY_HUB, POLICY_ENTITY, findPolicy } from '@/config/policies';

const policy = findPolicy('terms');

export const metadata = {
  title: `${policy.title} (${policy.titleEn})`,
  description: policy.blurb,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/terms` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/terms` },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠ PLACEHOLDER COPY — NOT LEGAL TEXT, NOT APPROVED BY ANYONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every sentence below was written to fill the Figma's structure so the layout
 * could be built and reviewed. NOBODY IN LEGAL HAS SEEN IT.
 *
 * Terms and conditions are the page a dispute gets argued from, so the risk
 * here is not cosmetic: §7's limitation of liability and §8's suspension
 * clause read as binding and are not. PolicyDraftNotice renders a matching
 * banner at the top of the page so a visitor is told the same thing. Do not
 * remove either half until approved copy replaces this text.
 *
 * ── THIS PAGE IS ALL ACCORDION, AND THAT IS THE DESIGN ──────────────────────
 * The other three detail pages open with a few expanded sections before their
 * accordions. The Figma drew this one as nine accordion cards and nothing else,
 * which PolicyLayout supports for free: pass only accordions and no open
 * sections, and the shell renders exactly that.
 *
 * ── THE DATE ────────────────────────────────────────────────────────────────
 * The Figma stamped this page 11 มิถุนายน 2569 while stamping the other four
 * 11 สิงหาคม 2569. That is a design-file inconsistency, not two real review
 * dates. The page takes POLICY_UPDATED like every other, so it reads สิงหาคม.
 */

const TOC = [
  { id: 'intro', title: 'บทนำ' },
  { id: 'acceptance', title: 'การยอมรับข้อกำหนด' },
  { id: 'scope', title: 'ขอบเขตการให้บริการ' },
  { id: 'accounts', title: 'การลงทะเบียนและบัญชีผู้ใช้งาน' },
  { id: 'payment', title: 'การชำระเงินและค่าธรรมเนียม' },
  { id: 'ip', title: 'ทรัพย์สินทางปัญญา' },
  { id: 'liability', title: 'ข้อจำกัดความรับผิด' },
  { id: 'suspension', title: 'การยกเลิกหรือระงับการให้บริการ' },
  { id: 'contact', title: 'ติดต่อเรา' },
];

/** §3's service pillars — the Figma's five-item ValuesGrid. */
const SERVICES = [
  { icon: 'listChecks', label: 'หลักสูตรฝึกอบรมในห้องเรียน' },
  { icon: 'settings', label: 'หลักสูตรอบรมภายในองค์กร (In-House)' },
  { icon: 'shield', label: 'หลักสูตรออนไลน์และสื่อการเรียนรู้' },
  { icon: 'dpo', label: 'การให้คำปรึกษาและบริการที่เกี่ยวข้อง' },
  { icon: 'help', label: 'กิจกรรม สัมมนา และเนื้อหาบนเว็บไซต์' },
];

const ACCOUNT_RULES = [
  'ให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบันในการลงทะเบียน',
  'เก็บรักษาชื่อผู้ใช้และรหัสผ่านไว้เป็นความลับ',
  'รับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของท่าน',
  'แจ้งให้เราทราบทันทีเมื่อพบการเข้าใช้งานบัญชีโดยไม่ได้รับอนุญาต',
  'ไม่โอนหรือให้ผู้อื่นใช้บัญชีของท่านโดยไม่ได้รับความยินยอมจากเรา',
];

export default function TermsPage() {
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
      lede={`ข้อกำหนดและเงื่อนไขนี้กำหนดข้อตกลงระหว่างผู้ใช้บริการกับ ${POLICY_ENTITY} (9EXPERT) ในการเข้าถึงและใช้งานเว็บไซต์ เนื้อหา และบริการทั้งหมดของเรา`}
      toc={TOC}
      currentSlug={policy.slug}
      notice={<PolicyDraftNotice />}
      help={{
        icon: 'help',
        title: 'ต้องการความช่วยเหลือ?',
        blurb: 'ทีมงานของเราพร้อมตอบทุกข้อสงสัยเกี่ยวกับการใช้บริการ',
        href: '/contact-us',
        cta: 'ติดต่อทีมงาน 9EXPERT',
      }}
    >
      <PolicyAccordion
        items={[
          {
            id: 'intro',
            number: '1',
            icon: 'terms',
            title: 'บทนำ',
            defaultOpen: true,
            body: (
              <p>
                ข้อกำหนดนี้ใช้บังคับกับการเข้าถึงและการใช้งานเว็บไซต์ เนื้อหา
                และบริการทั้งหมดของ 9EXPERT
                กรุณาอ่านโดยละเอียดก่อนเริ่มใช้บริการ
                เนื่องจากข้อกำหนดนี้มีผลผูกพันตามกฎหมายเมื่อท่านเริ่มใช้บริการ
              </p>
            ),
          },
          {
            id: 'acceptance',
            number: '2',
            icon: 'check',
            title: 'การยอมรับข้อกำหนด',
            body: (
              <p>
                เมื่อท่านเข้าใช้งานเว็บไซต์หรือลงทะเบียนเรียนกับเรา
                ถือว่าท่านได้อ่าน เข้าใจ และตกลงผูกพันตามข้อกำหนดฉบับนี้แล้ว
                หากท่านไม่เห็นด้วยกับข้อกำหนดข้อใด กรุณาหยุดใช้บริการ
              </p>
            ),
          },
          {
            id: 'scope',
            number: '3',
            icon: 'listChecks',
            title: 'ขอบเขตการให้บริการ',
            defaultOpen: true,
            body: (
              <>
                <p>
                  เราให้บริการด้านการฝึกอบรม สัมมนา
                  และแพลตฟอร์มการเรียนรู้ในรูปแบบต่อไปนี้:
                </p>
                <ul className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  {SERVICES.map((service) => (
                    <li
                      key={service.label}
                      className="flex items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3"
                    >
                      <PolicyIcon
                        name={service.icon}
                        className="h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                      />
                      <span className="text-[13px]">{service.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            id: 'accounts',
            number: '4',
            icon: 'dpo',
            title: 'การลงทะเบียนและบัญชีผู้ใช้งาน',
            defaultOpen: true,
            body: (
              <>
                <p>
                  การใช้บริการบางประเภทจำเป็นต้องลงทะเบียนและสร้างบัญชีผู้ใช้งาน
                  ท่านตกลงที่จะ:
                </p>
                <ul className="mt-4 space-y-2">
                  {ACCOUNT_RULES.map((rule) => (
                    <li key={rule} className="flex gap-2">
                      <PolicyIcon
                        name="check"
                        className="mt-1 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                        strokeWidth={2.5}
                      />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            id: 'payment',
            number: '5',
            icon: 'refund',
            title: 'การชำระเงินและค่าธรรมเนียม',
            body: (
              <p>
                ค่าบริการเป็นไปตามอัตราที่ประกาศไว้ในแต่ละหลักสูตร ณ
                วันที่ลงทะเบียน การยกเลิกและการขอคืนเงินเป็นไปตาม{' '}
                <Link
                  href="/refund-policy"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  นโยบายการยกเลิกและคืนเงิน
                </Link>
              </p>
            ),
          },
          {
            id: 'ip',
            number: '6',
            icon: 'shield',
            title: 'ทรัพย์สินทางปัญญา',
            body: (
              <p>
                เนื้อหา เอกสารประกอบการอบรม สื่อการสอน โลโก้ และเครื่องหมายการค้าทั้งหมด
                เป็นทรัพย์สินทางปัญญาของบริษัทหรือผู้ให้อนุญาต
                ห้ามทำซ้ำ ดัดแปลง เผยแพร่ หรือใช้เพื่อการค้าโดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร
              </p>
            ),
          },
          {
            id: 'liability',
            number: '7',
            icon: 'help',
            title: 'ข้อจำกัดความรับผิด',
            body: (
              <p>
                เรามุ่งมั่นให้บริการอย่างดีที่สุด
                แต่ไม่รับประกันว่าเว็บไซต์จะปราศจากข้อผิดพลาดหรือหยุดชะงัก
                และไม่รับผิดต่อความเสียหายทางอ้อมที่เกิดจากการใช้หรือไม่สามารถใช้บริการได้
                เว้นแต่เป็นกรณีที่กฎหมายกำหนดไว้เป็นอย่างอื่น
              </p>
            ),
          },
          {
            id: 'suspension',
            number: '8',
            icon: 'settings',
            title: 'การยกเลิกหรือระงับการให้บริการ',
            body: (
              <p>
                เราขอสงวนสิทธิ์ในการระงับหรือยกเลิกการให้บริการแก่ผู้ใช้งานที่ละเมิดข้อกำหนดนี้
                ใช้บริการในทางที่ผิดกฎหมาย
                หรือก่อให้เกิดความเสียหายต่อผู้ใช้งานรายอื่นหรือต่อระบบ
              </p>
            ),
          },
          {
            id: 'contact',
            number: '9',
            icon: 'mail',
            title: 'ติดต่อเรา',
            body: (
              <p>
                หากมีข้อสงสัยเกี่ยวกับข้อกำหนดฉบับนี้ สามารถ{' '}
                <Link
                  href="/contact-us"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  ติดต่อทีมงาน 9EXPERT
                </Link>{' '}
                ได้ทุกช่องทาง
              </p>
            ),
          },
        ]}
      />
    </PolicyLayout>
  );
}
