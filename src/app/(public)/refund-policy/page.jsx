import Link from 'next/link';
import { PolicyLayout, PolicyDraftNotice } from '@/components/policies/PolicyLayout';
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
 *  ⚠ PLACEHOLDER COPY — NOT LEGAL TEXT, NOT APPROVED BY ANYONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every sentence below was written to fill the Figma's structure so the layout
 * could be built and reviewed. NOBODY IN LEGAL HAS SEEN IT.
 *
 * This is the most dangerous of the three placeholder pages. THE NUMBERS ARE
 * INVENTED — the notice periods and the refund percentages in HIGHLIGHTS below
 * are not a policy anyone set. A visitor deciding whether to cancel a course
 * would act on them, and a customer who reads "คืนเงิน 100%" and then does not
 * get it has been told something false by the company. PolicyDraftNotice
 * renders a banner saying so at the top of the page.
 *
 * Do not remove the banner, and do not quietly firm up the numbers — they need
 * to come from whoever actually owns the refund terms.
 *
 * ── THE COMPANY NAME ────────────────────────────────────────────────────────
 * The Figma's hero for this page read "บริษัท เจเนซิสแล็บ จำกัด (9EXPERT)".
 * That is a WRONG LEGAL ENTITY on a page about people's money, not merely
 * off-brand naming. It is read from POLICY_ENTITY here like every other page.
 */

/** THE PERCENTAGES AND NOTICE PERIODS ARE INVENTED. See the file header. */
const HIGHLIGHTS = [
  {
    icon: 'check',
    window: 'ก่อนอบรม 15 วันขึ้นไป',
    outcome: 'คืนเงินเต็มจำนวน',
    detail: 'แจ้งล่วงหน้าอย่างน้อย 15 วันทำการก่อนวันเริ่มอบรม',
  },
  {
    icon: 'calendar',
    window: 'ก่อนอบรม 7-14 วัน',
    outcome: 'คืนเงิน 50%',
    detail: 'หรือเลื่อนไปรอบถัดไปได้โดยไม่มีค่าใช้จ่ายเพิ่มเติม',
  },
  {
    icon: 'clock',
    window: 'ก่อนอบรมน้อยกว่า 7 วัน',
    outcome: 'สงวนสิทธิ์การคืนเงิน',
    detail: 'สามารถเปลี่ยนผู้เข้าอบรมเป็นบุคคลอื่นแทนได้',
  },
  {
    icon: 'refund',
    window: 'กรณีบริษัทยกเลิกรอบอบรม',
    outcome: 'คืนเงินเต็มจำนวน',
    detail: 'หรือเลือกเลื่อนไปรอบถัดไปตามความสะดวกของท่าน',
  },
];

const TOC = [
  { id: 'intro', title: 'บทนำ' },
  { id: 'criteria', title: 'หลักเกณฑ์การยกเลิกและคืนเงิน' },
  { id: 'how-to', title: 'ขั้นตอนการขอยกเลิก' },
  { id: 'timeline', title: 'ระยะเวลาดำเนินการคืนเงิน' },
  { id: 'postpone', title: 'การเลื่อนวันอบรม' },
  { id: 'no-show', title: 'กรณีไม่มาเข้าอบรม' },
  { id: 'company-cancel', title: 'กรณีบริษัทยกเลิกการอบรม' },
  { id: 'contact', title: 'ติดต่อเรา' },
];

export default function RefundPolicyPage() {
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
      lede={`${POLICY_ENTITY} (9EXPERT) กำหนดหลักเกณฑ์และเงื่อนไขการยกเลิกการสมัครอบรม การเลื่อนวันอบรม และการขอคืนเงิน เพื่อความชัดเจนและเป็นธรรมกับผู้เข้าอบรมทุกท่าน`}
      updated={policy.updated}
      toc={TOC}
      currentSlug={policy.slug}
      /*
        The strongest wording of the three. This page states refund PERCENTAGES
        and NOTICE PERIODS — numbers a customer would act on and could later
        hold the company to. If this page ships before real terms exist, this
        banner is the only thing between us and having quoted refund figures we
        invented, so it names the fabricated numbers explicitly rather than
        warning about "content" in general.
      */
      notice={
        <PolicyDraftNotice detail="ตัวเลขทั้งหมดในหัวข้อ 02 — ระยะเวลาแจ้งล่วงหน้าและเปอร์เซ็นต์การคืนเงิน — เป็นตัวอย่างที่สมมติขึ้นทั้งหมด ไม่ใช่เงื่อนไขของบริษัท และไม่สามารถใช้อ้างอิงในการขอคืนเงินได้" />
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
            บทนำ
          </h2>
          <p className="mt-3 text-[14px] leading-[1.8] text-[var(--text-secondary)]">
            นโยบายนี้อธิบายหลักเกณฑ์การยกเลิกการสมัครอบรม การเลื่อนวันอบรม
            กรณีไม่มาเข้าอบรม และขั้นตอนการขอคืนเงิน
            โดยมีผลกับการสมัครอบรมทุกช่องทางของ 9EXPERT
          </p>
        </section>

        <section id="criteria" className="scroll-mt-24">
          <h2 className="flex items-center gap-3 text-[18px] font-bold text-[var(--text-primary)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-[12px] text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
              02
            </span>
            หลักเกณฑ์การยกเลิกและคืนเงิน
          </h2>

          {/*
            THESE FIGURES ARE INVENTED — see the file header. The on-page note
            below repeats it, because a visitor comparing these four cards is
            making a decision about money and must not take them as terms.
          */}
          <ul className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.window}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
                  <PolicyIcon name={item.icon} className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold text-[var(--text-muted)]">
                  {item.window}
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
          <p className="mt-3 text-[13px] font-semibold text-[var(--text-muted)]">
            * ตัวเลขและระยะเวลาข้างต้นเป็นตัวอย่างประกอบการออกแบบเท่านั้น
            ยังไม่ใช่เงื่อนไขที่บริษัทกำหนด กรุณาติดต่อทีมงานเพื่อยืนยันเงื่อนไขที่เป็นทางการ
          </p>
        </section>

        <PolicyAccordion
          items={[
            {
              id: 'how-to',
              icon: 'listChecks',
              title: 'ขั้นตอนการขอยกเลิก',
              defaultOpen: true,
              body: (
                <ol className="space-y-2">
                  {[
                    'แจ้งความประสงค์ผ่านช่องทางติดต่อของบริษัท พร้อมระบุชื่อหลักสูตรและรอบอบรม',
                    'ทีมงานตรวจสอบเงื่อนไขและยืนยันสิทธิ์การคืนเงินกลับไปยังท่าน',
                    'จัดส่งเอกสารประกอบการคืนเงินตามที่ทีมงานแจ้ง',
                    'บริษัทดำเนินการคืนเงินตามช่องทางที่ท่านชำระมา',
                  ].map((step, i) => (
                    <li key={step} className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-9e-action text-[11px] font-bold text-white dark:bg-[#48B0FF] dark:text-[#0D1B2A]">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ),
            },
            {
              id: 'timeline',
              icon: 'clock',
              title: 'ระยะเวลาดำเนินการคืนเงิน',
              body: (
                <p>
                  โดยทั่วไปบริษัทจะดำเนินการคืนเงินภายใน 30 วันทำการ
                  นับจากวันที่ได้รับเอกสารครบถ้วน
                  ทั้งนี้ระยะเวลาที่เงินเข้าบัญชีขึ้นอยู่กับรอบการทำงานของธนาคารหรือผู้ให้บริการชำระเงิน
                </p>
              ),
            },
            {
              id: 'postpone',
              icon: 'calendar',
              title: 'การเลื่อนวันอบรม',
              body: (
                <p>
                  ท่านสามารถขอเลื่อนไปรอบอบรมถัดไปได้ตามเงื่อนไขและที่นั่งว่าง
                  โดยแจ้งล่วงหน้าตามระยะเวลาที่กำหนด
                  การเลื่อนถือเป็นทางเลือกแทนการขอคืนเงิน
                </p>
              ),
            },
            {
              id: 'no-show',
              icon: 'help',
              title: 'กรณีไม่มาเข้าอบรม',
              body: (
                <p>
                  หากท่านไม่มาเข้าอบรมโดยไม่ได้แจ้งล่วงหน้า
                  บริษัทขอสงวนสิทธิ์ในการคืนเงินและการเลื่อนรอบอบรม
                  เนื่องจากที่นั่งได้ถูกจัดสรรไว้ให้ท่านแล้ว
                </p>
              ),
            },
            {
              id: 'company-cancel',
              icon: 'shield',
              title: 'กรณีบริษัทยกเลิกการอบรม',
              body: (
                <p>
                  หากบริษัทจำเป็นต้องยกเลิกหรือเลื่อนรอบอบรม
                  ท่านสามารถเลือกรับเงินคืนเต็มจำนวน
                  หรือเลื่อนไปรอบถัดไปตามความสะดวกของท่าน
                  โดยบริษัทจะแจ้งให้ทราบล่วงหน้าโดยเร็วที่สุด
                </p>
              ),
            },
            {
              id: 'contact',
              icon: 'mail',
              title: 'ติดต่อเรา',
              body: (
                <p>
                  หากมีข้อสงสัยเกี่ยวกับการยกเลิกหรือการคืนเงิน สามารถ{' '}
                  <Link
                    href="/contact-us"
                    className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    ติดต่อทีมงาน 9EXPERT
                  </Link>{' '}
                  เพื่อขอข้อมูลที่เป็นทางการ
                </p>
              ),
            },
          ]}
        />
      </div>
    </PolicyLayout>
  );
}
