import Link from 'next/link';
import { PolicyLayout, PolicyDraftNotice } from '@/components/policies/PolicyLayout';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import { POLICY_HUB, POLICY_ENTITY, findPolicy } from '@/config/policies';

const policy = findPolicy('cookie-policy');

export const metadata = {
  title: `${policy.title} (${policy.titleEn})`,
  description: policy.blurb,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/cookie-policy` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/cookie-policy` },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SOURCE: cookie-policy-9expert.docx  (4 sections, 1 table)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The document's four sections replace the whole previous body, and its
 * cookie-type table replaces the FABRICATED inventory table that stood at §03.
 * That table listed named cookies (_ga, _gid, theme, session) with invented
 * retention periods; none of it was derived from an audit. It is gone.
 *
 * The placeholder accordions that surrounded it — third-party, retention,
 * consent, contact — were also written by us to fill the Figma's shape. The
 * document does not cover them, and leaving invented prose interleaved with
 * real document text is worse than either alone, so they are gone too. What
 * remains is the document, plus a contact block pointing at channels that
 * genuinely exist.
 *
 * The source closes with the same note as the privacy document: a starting
 * point under PDPA, not legal advice, counsel to review before publication.
 * That is an instruction to us and is not rendered.
 *
 * ── WHAT WAS DROPPED, AND WHY ───────────────────────────────────────────────
 *
 * 1. THE EFFECTIVE DATE ([DD/MM/YYYY]). Same reasoning as the privacy page:
 *    the site is not in production, so the policy has never taken effect.
 *    `updated` is null and no stamp renders.
 *
 * 2. THE COOKIE BANNER SENTENCE. §3 of the document reads "ท่านสามารถจัดการ
 *    หรือปฏิเสธคุกกี้ที่ไม่จำเป็นได้ผ่านแบนเนอร์ตั้งค่าคุกกี้บนเว็บไซต์ในครั้งแรก
 *    ที่เข้าใช้งาน หรือผ่านการตั้งค่าเบราว์เซอร์ของท่านในภายหลัง."
 *
 *    THERE IS NO COOKIE BANNER IN THIS REPO. No consent manager, no preference
 *    centre, no toggle. The clause is cut to the browser route, which is the
 *    only one that works today.
 *
 *    TODO(cookie-banner): when a consent banner ships, restore the first half
 *    of that sentence — management "ผ่านแบนเนอร์ตั้งค่าคุกกี้ในครั้งแรกที่เข้า
 *    ใช้งาน" — to §3 below. The same edit is owed to the privacy page's §4
 *    marketing row; both are marked with this tag.
 *
 * 3. THE PROVIDER AND RETENTION CELLS THAT WERE BRACKETED. See COOKIE_TYPES.
 *
 * ── THE DOCUMENT'S OWN CAVEAT, WHICH IS NOT YET SATISFIED ───────────────────
 * The source is headed "[ร่างฉบับปรับปรุง — ต้องยืนยันรายชื่อ Cookie/Pixel ที่ใช้
 * จริงกับทีม IDev ก่อนเผยแพร่]" — the real cookie and pixel list must be
 * confirmed with the IDev team before publication. That has NOT happened. In
 * particular the Targeting/Advertising category is declared here without any
 * evidence that this site sets such a cookie; if it does not, the row should be
 * removed rather than left as a category we merely might use.
 */

/**
 * §2 — cookie categories.
 *
 * The document's table had four columns: ประเภท | วัตถุประสงค์ |
 * ตัวอย่างผู้ให้บริการ | อายุการเก็บ.
 *
 * THE RETENTION COLUMN IS NOT RENDERED. Three of its four cells were [ระบุ],
 * and the fourth ("ตลอดช่วง Session / [ระบุ]") was half a value. A retention
 * column that is three-quarters blank invites the reader to believe the blanks
 * mean something. The one real fact in it — that strictly-necessary cookies
 * last only for the session — is stated in that row's purpose text instead.
 *
 * THE PROVIDER COLUMN IS RENDERED, but only two of its cells hold a real value:
 * 9EXPERT's own system, and Google Analytics. The other two were "[ระบุถ้ามี]"
 * and "[ระบุ — เช่น Meta Pixel, TikTok Pixel ถ้ามีการใช้งานจริง]", i.e. the
 * document asking us a question, not answering one. Those render as an explicit
 * "ยังไม่ระบุ" rather than an empty cell: a blank reads as "none", which would
 * be a claim, and this is honestly an open question.
 */
const COOKIE_TYPES = [
  {
    icon: 'shield',
    name: 'จำเป็นต่อการทำงาน',
    nameEn: 'Strictly Necessary',
    purpose: 'ทำให้เว็บไซต์ทำงานได้ปกติ เช่น การเข้าสู่ระบบ ตะกร้าสินค้า โดยจัดเก็บเฉพาะช่วงที่ใช้งาน (Session)',
    provider: 'ระบบของ 9EXPERT เอง',
  },
  {
    icon: 'listChecks',
    name: 'วิเคราะห์การใช้งาน',
    nameEn: 'Analytics',
    purpose: 'วิเคราะห์พฤติกรรมผู้เข้าชมเพื่อปรับปรุงเว็บไซต์',
    provider: 'Google Analytics',
  },
  {
    icon: 'settings',
    name: 'ฟังก์ชันการใช้งาน',
    nameEn: 'Functional',
    purpose: 'จดจำการตั้งค่าที่ท่านเลือกไว้',
    provider: null,
  },
  {
    icon: 'cookie',
    name: 'การตลาด/โฆษณา',
    nameEn: 'Targeting-Advertising',
    purpose: 'นำเสนอโฆษณาที่ตรงกับความสนใจของท่าน',
    provider: null,
  },
];

const TOC = [
  { id: 'about-cookies', title: 'คุกกี้คืออะไร' },
  { id: 'cookie-types', title: 'ประเภทคุกกี้ที่เราใช้' },
  { id: 'manage', title: 'วิธีจัดการคุกกี้' },
  { id: 'changes', title: 'การปรับปรุงนโยบาย' },
  { id: 'contact', title: 'ช่องทางติดต่อ' },
];

function Section({ id, number, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="flex items-center gap-3 text-[18px] font-bold text-[var(--text-primary)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-[13px] text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-3 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

export default function CookiePolicyPage() {
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
      lede={`เอกสารนี้เป็นส่วนเสริมของนโยบายคุ้มครองข้อมูลส่วนบุคคลของ ${POLICY_ENTITY} (9EXPERT) อธิบายประเภทคุกกี้ที่เว็บไซต์ใช้งาน วัตถุประสงค์ และวิธีที่ท่านจัดการคุกกี้ได้`}
      updated={policy.updated}
      toc={TOC}
      numbered={false}
      currentSlug={policy.slug}
      notice={
        <PolicyDraftNotice detail="รวมถึงตารางรายละเอียดคุกกี้ในหัวข้อ 03 ซึ่งเป็นตัวอย่างที่สมมติขึ้น ยังไม่ได้ตรวจสอบกับคุกกี้ที่เว็บไซต์ใช้งานจริง" />
      }
      help={{
        icon: 'settings',
        title: 'จัดการคุกกี้ของท่าน',
        blurb: 'ดูวิธีปรับหรือปฏิเสธคุกกี้ผ่านการตั้งค่าเบราว์เซอร์',
        href: '#manage',
        cta: 'ไปที่วิธีจัดการคุกกี้',
      }}
    >
      <div className="space-y-10">
        <Section id="about-cookies" number="01" title="คุกกี้คืออะไร">
          <p>
            คุกกี้ (Cookies) คือ ไฟล์ข้อมูลขนาดเล็กที่เว็บไซต์บันทึกไว้บนอุปกรณ์ของท่าน
            เพื่อจดจำการตั้งค่า และพฤติกรรมการใช้งาน
            ช่วยให้เว็บไซต์ทำงานได้อย่างมีประสิทธิภาพ
            และมอบประสบการณ์การใช้งานที่เหมาะสมกับท่านมากขึ้น
          </p>
        </Section>

        <Section id="cookie-types" number="02" title="ประเภทคุกกี้ที่เราใช้">
          <ul className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {COOKIE_TYPES.map((type) => (
              <li
                key={type.nameEn}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
                  <PolicyIcon name={type.icon} className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[15px] font-bold text-[var(--text-primary)]">
                  {type.name}
                </p>
                <p className="text-[13px] font-semibold text-[var(--text-muted)]">
                  ({type.nameEn})
                </p>
                <p className="mt-2 text-[13px] leading-[1.7]">{type.purpose}</p>
                <p className="mt-3 border-t border-[var(--surface-border)] pt-3 text-[12px] text-[var(--text-muted)]">
                  ผู้ให้บริการ:{' '}
                  <span
                    className={
                      type.provider
                        ? 'font-semibold text-[var(--text-secondary)]'
                        : 'italic'
                    }
                  >
                    {type.provider ?? 'ยังไม่ระบุ'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <PolicyAccordion
          items={[
            {
              id: 'manage',
              icon: 'settings',
              title: 'วิธีจัดการคุกกี้',
              defaultOpen: true,
              /*
                The document offered two routes — a first-visit cookie banner
                and browser settings. Only the second exists. See the file
                header's TODO(cookie-banner).
              */
              body: (
                <>
                  <p>
                    ท่านสามารถจัดการ
                    หรือปฏิเสธคุกกี้ที่ไม่จำเป็นได้ผ่านการตั้งค่าเบราว์เซอร์ของท่าน
                    ทั้งนี้
                    การปิดใช้งานคุกกี้บางประเภทอาจส่งผลกระทบต่อการใช้งานฟังก์ชันบางส่วนของเว็บไซต์
                  </p>
                  <ul className="mt-4 space-y-2">
                    {[
                      'Google Chrome: การตั้งค่า → ความเป็นส่วนตัวและความปลอดภัย → คุกกี้และข้อมูลเว็บไซต์อื่นๆ',
                      'Microsoft Edge: การตั้งค่า → คุกกี้และสิทธิ์ของไซต์',
                      'Safari: การตั้งค่า → ความเป็นส่วนตัว → จัดการข้อมูลเว็บไซต์',
                      'Mozilla Firefox: การตั้งค่า → ความเป็นส่วนตัวและความปลอดภัย → คุกกี้และข้อมูลเว็บไซต์',
                    ].map((line) => (
                      <li key={line} className="flex gap-2">
                        <PolicyIcon
                          name="chevronRight"
                          className="mt-1 h-3.5 w-3.5 shrink-0 text-9e-action dark:text-[#48B0FF]"
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ),
            },
            {
              id: 'changes',
              icon: 'calendar',
              title: 'การปรับปรุงนโยบาย',
              body: (
                <p>
                  บริษัทอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราว
                  และจะแจ้งวันที่มีผลบังคับใช้ล่าสุดไว้ที่ด้านบนของเอกสาร
                </p>
              ),
            },
            {
              id: 'contact',
              icon: 'mail',
              title: 'ช่องทางติดต่อ',
              body: (
                <p>
                  หากมีคำถามเกี่ยวกับการใช้คุกกี้ของเรา
                  โปรดติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ที่{' '}
                  <a
                    href="mailto:dpo@9expert.co.th"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    dpo@9expert.co.th
                  </a>{' '}
                  หรือดูช่องทางทั้งหมดใน{' '}
                  <Link
                    href="/privacy-policy#section-14"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    นโยบายคุ้มครองข้อมูลส่วนบุคคล ข้อ 14
                  </Link>
                </p>
              ),
            },
          ]}
        />
      </div>
    </PolicyLayout>
  );
}
