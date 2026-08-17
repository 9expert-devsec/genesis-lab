import Link from 'next/link';
import { PolicyLayout, PolicyStatusNotice } from '@/components/policies/PolicyLayout';
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
 *  ROUND T-B — APPROVED COPY, PORTED FROM THE SOURCE .DOCX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every section body below is the approved Terms & Conditions text, ported
 * verbatim. This is the real thing PolicyStatusNotice describes: reviewed and
 * signed off by the person who owns it, not yet reviewed by counsel, and not
 * yet in force because the site is not in production.
 *
 * Thirteen sections replace the previous nine placeholder ones. Two of the old
 * ids — `intro` and `scope` — are retired rather than reused: their content is
 * superseded by the sections below, not appended to them. Seven ids carry
 * straight over (`acceptance`, `accounts`, `payment`, `ip`, `liability`,
 * `suspension`, `contact`) because the approved copy has a section that maps
 * onto what was already there.
 */

const TOC = [
  { id: 'acceptance', title: 'คำนำและการยอมรับข้อกำหนด' },
  { id: 'definitions', title: 'คำนิยาม' },
  { id: 'eligibility', title: 'คุณสมบัติผู้ใช้บริการ' },
  { id: 'accounts', title: 'บัญชีผู้ใช้และความรับผิดชอบ' },
  { id: 'payment', title: 'การลงทะเบียนและการชำระเงิน' },
  { id: 'ip', title: 'สิทธิในทรัพย์สินทางปัญญา' },
  { id: 'service-types', title: 'การใช้งานตามประเภทหลักสูตร' },
  { id: 'certificate', title: 'ใบรับรอง (Certificate)' },
  { id: 'liability', title: 'ข้อจำกัดความรับผิด' },
  { id: 'suspension', title: 'การระงับหรือยกเลิกการให้บริการ' },
  { id: 'governing-law', title: 'กฎหมายที่ใช้บังคับ' },
  { id: 'amendments', title: 'การแก้ไขข้อกำหนด' },
  { id: 'contact', title: 'ช่องทางติดต่อ' },
];

/** §7's course-type breakdown — same inline two-column grid markup §3 used. */
const SERVICE_TYPES = [
  {
    icon: 'listChecks',
    label: 'Public Training และ Masterclass',
    body: 'การอบรมเป็นไปตามวัน เวลา และสถานที่ / ช่องทางที่บริษัทกำหนดไว้ในหน้ารายละเอียดหลักสูตร',
  },
  {
    icon: 'settings',
    label: 'In-House Training',
    body: 'การอบรมเป็นไปตามเงื่อนไข วัน เวลา และรูปแบบที่ตกลงกันระหว่างบริษัท กับองค์กรผู้ว่าจ้างในใบเสนอราคา หรือสัญญา',
  },
  {
    icon: 'shield',
    label: 'E-Learning Training',
    body: 'ผู้ใช้บริการได้รับสิทธิ์เข้าถึงเนื้อหาเป็นระยะเวลา 365 วันนับจากวันที่ได้รับสิทธิ์เข้าถึงคอร์ส เว้นแต่ระบุไว้เป็นอย่างอื่นในหน้ารายละเอียดคอร์ส ในกรณีชำระเงินด้วยการแนบหลักฐานการโอน (สลิป) ระบบจะใช้เวลาตรวจสอบและอนุมัติภายใน 3 วันทำการ ระยะเวลาการเข้าถึงจะเริ่มนับตั้งแต่วันที่ได้รับการอนุมัติ ไม่ใช่วันที่ชำระเงิน เมื่อครบกำหนดระยะเวลา สิทธิ์การเข้าถึงจะสิ้นสุดลง หากประสงค์จะเรียนต่อ ผู้ใช้บริการต้องชำระเงินเพื่อซื้อสิทธิ์การเข้าถึงใหม่ ทั้งนี้ ความก้าวหน้าในการเรียน (Progress) ที่ระบบบันทึกไว้จะยังคงอยู่ และผู้ใช้บริการสามารถเรียนต่อจากจุดเดิมได้ บัญชีผู้ใช้แต่ละบัญชีมีไว้สำหรับการใช้งานเฉพาะบุคคลเท่านั้น ห้ามใช้บัญชีร่วมกัน หรือแบ่งปันสิทธิ์การเข้าถึงให้บุคคลอื่น',
  },
  {
    icon: 'dpo',
    label: 'การให้คำปรึกษาและบริการที่เกี่ยวข้อง',
    body: 'บริการให้คำปรึกษา (Consulting) หรือบริการอื่นที่เกี่ยวเนื่องกับหลักสูตร เป็นไปตามขอบเขตงาน (Scope of Work) เงื่อนไขและระยะเวลาที่ตกลงกันเป็นการเฉพาะระหว่างบริษัทกับผู้ใช้บริการในแต่ละกรณี ทั้งนี้ ข้อมูล หรือคำแนะนำที่ได้รับเป็นไปเพื่อประกอบการตัดสินใจของผู้ใช้บริการเท่านั้น บริษัทไม่รับประกันผลลัพธ์ทางธุรกิจที่เกิดจากการนำคำปรึกษาไปใช้',
  },
  {
    icon: 'help',
    label: 'กิจกรรม สัมมนา และเนื้อหาบนเว็บไซต์',
    body: 'กิจกรรมส่งเสริมการตลาด สัมมนาแบบไม่มีค่าใช้จ่าย (Free Seminar / Webinar) บทความ และเนื้อหาอื่นที่เผยแพร่บนเว็บไซต์ของบริษัท จัดทำขึ้นเพื่อวัตถุประสงค์ในการให้ข้อมูลทั่วไปเท่านั้น มิใช่คำแนะนำเฉพาะเจาะจงสำหรับผู้ใช้บริการรายใดรายหนึ่ง และบริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลง ยกเลิก หรือจำกัดสิทธิ์การเข้าร่วมกิจกรรมดังกล่าวได้ตามความเหมาะสม',
  },
];

/** §2's three defined terms. */
const DEFINITIONS = [
  { term: '"บริษัท"', body: 'หมายถึง บริษัท นายน์เอ็กซ์เพิร์ท จำกัด' },
  {
    term: '"ผู้ใช้บริการ"',
    body: 'หมายถึง บุคคล หรือนิติบุคคล ที่เข้าใช้งานเว็บไซต์ หรือแพลตฟอร์มของบริษัท',
  },
  {
    term: '"บริการ"',
    body: 'หมายถึง หลักสูตรฝึกอบรมของบริษัททุกประเภท ได้แก่ Public Training, In-House Training, Masterclass และ E-Learning Training (หลักสูตรเรียนออนไลน์) รวมถึงเนื้อหา เอกสารประกอบการบรรยาย และใบรับรองที่เกี่ยวข้อง',
  },
];

export default function TermsPage() {
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
      lede={`ข้อกำหนดและเงื่อนไขนี้กำหนดข้อตกลงระหว่างผู้ใช้บริการกับ ${POLICY_ENTITY} (9EXPERT) ในการเข้าถึงและใช้งานเว็บไซต์ เนื้อหา และบริการทั้งหมดของเรา`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      notice={
        <PolicyStatusNotice detail="ข้อกำหนดฉบับนี้จะมีผลบังคับใช้เมื่อเว็บไซต์เปิดให้บริการอย่างเป็นทางการ" />
      }
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
            id: 'acceptance',
            number: '1',
            icon: 'check',
            title: 'คำนำและการยอมรับข้อกำหนด',
            defaultOpen: true,
            body: (
              <p>
                ข้อกำหนดและเงื่อนไขนี้ กำหนดข้อตกลงระหว่างผู้ใช้บริการกับบริษัท
                นายน์เอ็กซ์เพิร์ท จำกัด (&quot;บริษัท&quot;)
                ในการใช้บริการเว็บไซต์ของบริษัทในทุกช่องทาง การเข้าใช้งานเว็บไซต์
                หรือแพลตฟอร์มดังกล่าว ไม่ว่าจะเป็นการเรียกดูข้อมูล การลงทะเบียน
                หรือการซื้อบริการใด ๆ ถือว่าท่านได้อ่าน เข้าใจ
                และยอมรับที่จะปฏิบัติตามข้อกำหนดฉบับนี้ทุกประการ
              </p>
            ),
          },
          {
            id: 'definitions',
            number: '2',
            icon: 'info',
            title: 'คำนิยาม',
            body: (
              <ul className="space-y-2">
                {DEFINITIONS.map((d) => (
                  <li key={d.term} className="flex gap-2">
                    <PolicyIcon
                      name="check"
                      className="mt-1 h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                      strokeWidth={2.5}
                    />
                    <span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {d.term}
                      </span>{' '}
                      {d.body}
                    </span>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: 'eligibility',
            number: '3',
            icon: 'check',
            title: 'คุณสมบัติผู้ใช้บริการ',
            body: (
              <p>
                ผู้ใช้บริการต้องมีความสามารถตามกฎหมายในการทำนิติกรรม
                ในกรณีที่ผู้ใช้บริการเป็นผู้เยาว์ตามกฎหมาย
                จะต้องได้รับความยินยอมจากผู้ใช้อำนาจปกครองก่อนการลงทะเบียน
                หรือชำระเงินทุกครั้ง
              </p>
            ),
          },
          {
            id: 'accounts',
            number: '4',
            icon: 'dpo',
            title: 'บัญชีผู้ใช้และความรับผิดชอบ',
            body: (
              <p>
                ผู้ใช้บริการมีหน้าที่รักษาความลับของชื่อผู้ใช้ และรหัสผ่านของตนเอง
                และรับผิดชอบต่อการกระทำใด ๆ ที่เกิดขึ้นภายใต้บัญชีของตน
                หากพบการใช้งานโดยไม่ได้รับอนุญาต ผู้ใช้บริการต้องแจ้งบริษัททราบโดยทันที
                บริษัทขอสงวนสิทธิ์ในการระงับ หรือยกเลิกบัญชีที่มีการใช้งานผิดเงื่อนไข
              </p>
            ),
          },
          {
            id: 'payment',
            number: '5',
            icon: 'refund',
            title: 'การลงทะเบียนและการชำระเงิน',
            defaultOpen: true,
            body: (
              <p>
                ราคาหลักสูตรที่แสดงบนเว็บไซต์เป็นราคาปัจจุบัน ณ ขณะนั้น
                ซึ่งบริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงราคาโดยไม่ต้องแจ้งให้ทราบล่วงหน้า
                การลงทะเบียนจะสมบูรณ์เมื่อบริษัทได้รับการชำระเงินครบถ้วนตามช่องทางที่บริษัทกำหนด
                และผู้ใช้บริการจะได้รับการยืนยันผ่านอีเมล หรือช่องทางที่ลงทะเบียนไว้
                สำหรับหลักสูตร In-House Training
                เงื่อนไขการชำระเงินเป็นไปตามที่ระบุไว้ในใบเสนอราคา (Quotation)
                หรือสัญญาที่ตกลงกันเป็นเฉพาะ
              </p>
            ),
          },
          {
            id: 'ip',
            number: '6',
            icon: 'shield',
            title: 'สิทธิในทรัพย์สินทางปัญญา',
            body: (
              <p>
                เนื้อหา วิดีโอ เอกสารประกอบการบรรยาย เอกสารการนำเสนอ
                และสื่อการสอนทั้งหมดที่ปรากฏในบริการของบริษัทเป็นทรัพย์สินทางปัญญาของบริษัท
                หรือผู้ที่ได้รับอนุญาตให้ใช้สิทธิ ห้ามมิให้ผู้ใช้บริการทำซ้ำ ดัดแปลง เผยแพร่
                จำหน่าย หรือนำไปใช้เพื่อประโยชน์ทางการค้า
                โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากบริษัท
              </p>
            ),
          },
          {
            id: 'service-types',
            number: '7',
            icon: 'listChecks',
            title: 'การใช้งานตามประเภทหลักสูตร',
            defaultOpen: true,
            body: (
              <ul className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                {SERVICE_TYPES.map((service) => (
                  <li
                    key={service.label}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3"
                  >
                    <span className="flex items-center gap-3">
                      <PolicyIcon
                        name={service.icon}
                        className="h-4 w-4 shrink-0 text-9e-action dark:text-[#48B0FF]"
                      />
                      <span className="text-[13px] font-bold text-[var(--text-primary)]">
                        {service.label}
                      </span>
                    </span>
                    <span className="text-[13px] leading-[1.7]">{service.body}</span>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: 'certificate',
            number: '8',
            icon: 'arrowUpRight',
            title: 'ใบรับรอง (Certificate)',
            body: (
              <p>
                บริษัทจะออกใบรับรองการผ่านการอบรมให้แก่ผู้ใช้บริการที่ปฏิบัติตามเงื่อนไขของแต่ละหลักสูตร
                เช่น การเข้าเรียนครบตามเปอร์เซ็นต์ที่กำหนด หรือผ่านเกณฑ์การทดสอบ เป็นต้น
                ทั้งนี้ เป็นไปตามดุลยพินิจของบริษัทและเงื่อนไขเฉพาะของแต่ละหลักสูตร
              </p>
            ),
          },
          {
            id: 'liability',
            number: '9',
            icon: 'help',
            title: 'ข้อจำกัดความรับผิด',
            body: (
              <p>
                บริษัทจะใช้ความพยายามตามสมควร เพื่อให้บริการเป็นไปอย่างต่อเนื่อง
                และมีคุณภาพ แต่ไม่รับประกันว่า บริการจะปราศจากข้อผิดพลาด
                หรือการหยุดชะงักตลอดเวลา
                บริษัทไม่รับผิดชอบต่อความเสียหายทางอ้อมที่เกิดจากการใช้งานบริการ
                เว้นแต่ในกรณีที่เกิดจากความจงใจ หรือประมาทเลินเล่ออย่างร้ายแรงของบริษัท
              </p>
            ),
          },
          {
            id: 'suspension',
            number: '10',
            icon: 'settings',
            title: 'การระงับหรือยกเลิกการให้บริการ',
            body: (
              <p>
                บริษัทขอสงวนสิทธิ์ในการระงับ
                หรือยกเลิกการให้บริการแก่ผู้ใช้บริการที่ฝ่าฝืนข้อกำหนดฉบับนี้
                หรือมีพฤติกรรมที่ก่อให้เกิดความเสียหายต่อบริษัท หรือผู้ใช้บริการรายอื่น
                โดยไม่จำเป็นต้องแจ้งให้ทราบล่วงหน้า ทั้งนี้ เป็นไปตาม{' '}
                <Link
                  href="/refund-policy"
                  className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                >
                  นโยบายการยกเลิกและคืนเงิน
                </Link>{' '}
                (Cancellation &amp; Refund Policy) ของบริษัท
              </p>
            ),
          },
          {
            id: 'governing-law',
            number: '11',
            icon: 'terms',
            title: 'กฎหมายที่ใช้บังคับ',
            body: (
              <p>
                ข้อกำหนดฉบับนี้อยู่ภายใต้บังคับและตีความตามกฎหมายไทย
                ในกรณีมีข้อพิพาทเกิดขึ้น คู่กรณีตกลงให้ศาลไทยเป็นผู้มีอำนาจพิจารณาคดี
              </p>
            ),
          },
          {
            id: 'amendments',
            number: '12',
            icon: 'clock',
            title: 'การแก้ไขข้อกำหนด',
            body: (
              <p>
                บริษัทอาจปรับปรุงข้อกำหนดฉบับนี้เป็นครั้งคราว
                โดยจะแจ้งวันที่มีผลบังคับใช้ล่าสุดไว้ที่ด้านบนของเอกสาร
                การใช้บริการต่อไปภายหลังการปรับปรุงถือว่าท่านยอมรับข้อกำหนดฉบับปรับปรุงนั้นแล้ว
              </p>
            ),
          },
          {
            id: 'contact',
            number: '13',
            icon: 'mail',
            title: 'ช่องทางติดต่อ',
            body: (
              <div className="space-y-5">
                <div>
                  <p className="font-bold text-[var(--text-primary)]">
                    เรื่องบริการ หลักสูตร และการชำระเงิน
                  </p>
                  <p className="mt-2">อีเมล : training@9expert.co.th</p>
                  <p>โทรศัพท์ : 02-219-4304</p>
                  <p>
                    หรือ{' '}
                    <Link
                      href="/contact-us"
                      className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                    >
                      กรอกแบบฟอร์มติดต่อเรา
                    </Link>
                  </p>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">
                    เรื่องข้อมูลส่วนบุคคลและการใช้สิทธิตาม PDPA
                  </p>
                  <p className="mt-2">อีเมล : dpo@9expert.co.th</p>
                  <p>
                    รายละเอียดการใช้สิทธิ ดูที่{' '}
                    <Link
                      href="/privacy-policy"
                      className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                    >
                      นโยบายคุ้มครองข้อมูลส่วนบุคคล
                    </Link>
                  </p>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">ที่อยู่</p>
                  <p className="mt-2">
                    เลขที่ 318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B ซอยวรฤทธิ์ ถนนพญาไท
                    แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400
                  </p>
                </div>
              </div>
            ),
          },
        ]}
      />
    </PolicyLayout>
  );
}
