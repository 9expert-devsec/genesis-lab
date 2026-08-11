import Link from 'next/link';
import { PolicyLayout, PolicyDraftNotice } from '@/components/policies/PolicyLayout';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import { POLICY_HUB, findPolicy } from '@/config/policies';

const policy = findPolicy('cookie-policy');

export const metadata = {
  title: `${policy.title} (${policy.titleEn})`,
  description: policy.blurb,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/cookie-policy` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/cookie-policy` },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠ PLACEHOLDER COPY — NOT LEGAL TEXT, NOT APPROVED BY ANYONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every sentence of body copy on this page was written to fill the Figma's
 * structure so the layout could be built and reviewed. NOBODY IN LEGAL HAS
 * SEEN IT. It is scaffolding shaped like a cookie policy, which is the most
 * dangerous kind of placeholder: it reads as authoritative to anyone who does
 * not know where it came from.
 *
 * PolicyDraftNotice renders a matching banner at the top of the page, so the
 * warning reaches visitors and not only whoever opens this file. Do not remove
 * either half until real approved copy replaces the text below.
 *
 * ── THE COOKIE INVENTORY TABLE IS FABRICATED ────────────────────────────────
 * §3 lists named cookies with retention periods. THOSE ROWS ARE INVENTED. This
 * repo has no cookie inventory to read from and nobody audited what the site
 * actually sets. A cookie table is the one part of a cookie policy that is a
 * checkable factual claim, so it is labelled on the page as well as here.
 *
 * ── NO CONSENT MANAGER EXISTS ───────────────────────────────────────────────
 * §6 describes managing consent through the browser and nothing else, on
 * purpose. There is no cookie-consent manager anywhere in this repo. Every
 * control that mentions cookie settings — including the hub's shortcut tile —
 * points at §7 below, which explains the browser route. Nothing here may
 * pretend to open a preferences dialog that does not exist.
 *
 * §7's id is `browser-settings` and the hub links to it directly. Renaming it
 * silently breaks that shortcut.
 */

const COOKIE_TYPES = [
  {
    icon: 'shield',
    name: 'คุกกี้ที่จำเป็น',
    nameEn: 'Strictly Necessary',
    blurb: 'จำเป็นต่อการทำงานพื้นฐานของเว็บไซต์ เช่น การเข้าสู่ระบบและความปลอดภัย ไม่สามารถปิดได้',
  },
  {
    icon: 'settings',
    name: 'คุกกี้เพื่อการทำงาน',
    nameEn: 'Functional',
    blurb: 'จดจำการตั้งค่าของคุณ เช่น ภาษาและธีมที่เลือกไว้ เพื่อให้ใช้งานได้สะดวกขึ้น',
  },
  {
    icon: 'listChecks',
    name: 'คุกกี้เพื่อการวิเคราะห์',
    nameEn: 'Analytics',
    blurb: 'ช่วยให้เราเข้าใจภาพรวมการใช้งานเว็บไซต์ เพื่อนำไปปรับปรุงเนื้อหาและบริการ',
  },
  {
    icon: 'cookie',
    name: 'คุกกี้เพื่อการตลาด',
    nameEn: 'Marketing',
    blurb: 'ใช้เพื่อนำเสนอเนื้อหาและโฆษณาที่สอดคล้องกับความสนใจของคุณ',
  },
];

/**
 * FABRICATED. See the header comment — these rows are illustrative only and
 * were not derived from anything this site actually sets.
 */
const COOKIE_INVENTORY = [
  { name: '_ga', purpose: 'Google Analytics — จำแนกผู้ใช้งาน', type: 'การวิเคราะห์', retention: '2 ปี' },
  { name: '_gid', purpose: 'Google Analytics — จำแนกผู้ใช้งานรายวัน', type: 'การวิเคราะห์', retention: '24 ชั่วโมง' },
  { name: 'theme', purpose: 'จดจำธีมสว่าง/มืดที่ผู้ใช้เลือก', type: 'การทำงาน', retention: '1 ปี' },
  { name: 'session', purpose: 'รักษาสถานะการเข้าสู่ระบบ', type: 'จำเป็น', retention: 'สิ้นสุดเมื่อปิดเบราว์เซอร์' },
];

const TOC = [
  { id: 'about-cookies', title: 'คุกกี้คืออะไร' },
  { id: 'cookie-types', title: 'ประเภทของคุกกี้ที่เราใช้' },
  { id: 'cookie-inventory', title: 'รายละเอียดคุกกี้ที่เราใช้' },
  { id: 'third-party', title: 'คุกกี้จากบุคคลที่สาม' },
  { id: 'retention', title: 'ระยะเวลาการจัดเก็บคุกกี้' },
  { id: 'consent', title: 'การจัดการความยินยอม' },
  { id: 'browser-settings', title: 'การจัดการผ่านเบราว์เซอร์' },
  { id: 'changes', title: 'การเปลี่ยนแปลงนโยบาย' },
  { id: 'contact', title: 'ติดต่อเรา' },
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
      icon={policy.icon}
      title={policy.title}
      titleEn={policy.titleEn}
      lede="9EXPERT ใช้คุกกี้และเทคโนโลยีที่คล้ายกัน เพื่อให้เว็บไซต์ทำงานได้อย่างถูกต้อง จดจำการตั้งค่าของคุณ และช่วยให้เราปรับปรุงบริการได้ดียิ่งขึ้น"
      updated={policy.updated}
      toc={TOC}
      numbered={false}
      currentSlug={policy.slug}
      notice={
        <PolicyDraftNotice detail="รวมถึงตารางรายละเอียดคุกกี้ในหัวข้อ 03 ซึ่งเป็นตัวอย่างที่สมมติขึ้น ยังไม่ได้ตรวจสอบกับคุกกี้ที่เว็บไซต์ใช้งานจริง" />
      }
      help={{
        icon: 'settings',
        title: 'ปรับการตั้งค่าคุกกี้ได้ทุกเวลา',
        blurb: 'ดูวิธีจัดการคุกกี้ผ่านเบราว์เซอร์ที่คุณใช้งาน',
        href: '#browser-settings',
        cta: 'ไปที่วิธีตั้งค่า',
      }}
    >
      <div className="space-y-10">
        <Section id="about-cookies" number="01" title="คุกกี้คืออะไร">
          <p>
            คุกกี้ (Cookies) คือไฟล์ข้อความขนาดเล็กที่เว็บไซต์บันทึกไว้ในเบราว์เซอร์ของคุณ
            เมื่อคุณเข้าชมเว็บไซต์ ไฟล์เหล่านี้ช่วยให้เว็บไซต์จดจำอุปกรณ์และการตั้งค่าของคุณได้
            ทำให้การใช้งานครั้งถัดไปสะดวกและต่อเนื่องมากขึ้น
          </p>
        </Section>

        <Section id="cookie-types" number="02" title="ประเภทของคุกกี้ที่เราใช้">
          <ul className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {COOKIE_TYPES.map((type) => (
              <li
                key={type.name}
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
                <p className="mt-2 text-[13px] leading-[1.7]">{type.blurb}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="cookie-inventory" number="03" title="รายละเอียดคุกกี้ที่เราใช้">
          <p>
            ตารางด้านล่างแสดงตัวอย่างคุกกี้ที่อาจถูกใช้งานบนเว็บไซต์นี้
          </p>
          {/*
            THIS TABLE IS ILLUSTRATIVE AND FABRICATED — see the file header.
            The on-page note below says so too, because a cookie table is the
            one part of a cookie policy a visitor could act on, and an invented
            retention period is a factual claim we have not earned.
          */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--surface-border)]">
            <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[var(--surface-muted)]">
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">ชื่อคุกกี้</th>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">วัตถุประสงค์</th>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">ประเภท</th>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">ระยะเวลา</th>
                </tr>
              </thead>
              <tbody>
                {COOKIE_INVENTORY.map((row) => (
                  <tr key={row.name} className="border-t border-[var(--surface-border)]">
                    <th scope="row" className="px-4 py-3 align-top font-mono font-semibold text-[var(--text-primary)]">
                      {row.name}
                    </th>
                    <td className="px-4 py-3 align-top leading-[1.7]">{row.purpose}</td>
                    <td className="px-4 py-3 align-top">{row.type}</td>
                    <td className="px-4 py-3 align-top">{row.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] font-semibold text-[var(--text-muted)]">
            * ตารางนี้เป็นตัวอย่างประกอบการออกแบบ ยังไม่ได้ตรวจสอบกับคุกกี้ที่เว็บไซต์ใช้งานจริง
          </p>
        </Section>

        <PolicyAccordion
          items={[
            {
              id: 'third-party',
              icon: 'cookie',
              title: 'คุกกี้จากบุคคลที่สาม',
              body: (
                <p>
                  เว็บไซต์ของเราอาจมีคุกกี้จากผู้ให้บริการภายนอก เช่น Google Analytics
                  เพื่อช่วยวิเคราะห์ภาพรวมการใช้งาน
                  การเก็บและใช้ข้อมูลของผู้ให้บริการเหล่านั้นเป็นไปตามนโยบายของผู้ให้บริการเอง
                </p>
              ),
            },
            {
              id: 'retention',
              icon: 'calendar',
              title: 'ระยะเวลาการจัดเก็บคุกกี้',
              body: (
                <p>
                  คุกกี้ประเภทเซสชันจะถูกลบเมื่อคุณปิดเบราว์เซอร์
                  ส่วนคุกกี้ถาวรจะถูกเก็บไว้ตามระยะเวลาที่กำหนดไว้ในตารางข้างต้น
                  หรือจนกว่าคุณจะลบออกจากเบราว์เซอร์ด้วยตนเอง
                </p>
              ),
            },
            {
              id: 'consent',
              icon: 'check',
              title: 'การจัดการความยินยอม',
              body: (
                <p>
                  ปัจจุบันเว็บไซต์นี้ยังไม่มีระบบจัดการความยินยอมคุกกี้แบบรวมศูนย์
                  คุณสามารถควบคุมการใช้งานคุกกี้ทั้งหมดได้ผ่านการตั้งค่าเบราว์เซอร์ของคุณ
                  ตามวิธีในหัวข้อถัดไป
                </p>
              ),
            },
            {
              id: 'browser-settings',
              icon: 'settings',
              title: 'การจัดการผ่านเบราว์เซอร์',
              defaultOpen: true,
              body: (
                <>
                  <p>
                    เบราว์เซอร์ทุกตัวมีเมนูสำหรับดู ลบ และปิดกั้นคุกกี้
                    โดยทั่วไปจะอยู่ในหัวข้อการตั้งค่าความเป็นส่วนตัวและความปลอดภัย
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
                  <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-[13px]">
                    หมายเหตุ: การปิดกั้นคุกกี้ที่จำเป็นอาจทำให้บางฟังก์ชันของเว็บไซต์ทำงานไม่ถูกต้อง
                  </p>
                </>
              ),
            },
            {
              id: 'changes',
              icon: 'calendar',
              title: 'การเปลี่ยนแปลงนโยบาย',
              body: (
                <p>
                  เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว
                  โดยจะระบุวันที่ปรับปรุงล่าสุดและหมายเลขเวอร์ชันไว้ที่ด้านบนของหน้าเสมอ
                </p>
              ),
            },
            {
              id: 'contact',
              icon: 'mail',
              title: 'ติดต่อเรา',
              body: (
                <p>
                  หากมีคำถามเกี่ยวกับการใช้คุกกี้ของเรา สามารถ{' '}
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
      </div>
    </PolicyLayout>
  );
}
