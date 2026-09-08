import Link from 'next/link';
import { SiYoutube, SiGoogleanalytics, SiGoogleads } from 'react-icons/si';
import { PolicyLayout } from '@/components/policies/PolicyLayout';
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
 * 9Expert's own system, and Google Analytics. The other two were "[ระบุถ้ามี]"
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
    provider: 'ระบบของ 9Expert เอง',
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
    purpose: 'จดจำการตั้งค่าที่ท่านเลือกไว้ เช่น โหมดสีสว่าง/มืด',
    /*
     * ── FILLED IN CB-B FROM A MEASUREMENT, NOT A GUESS ────────────────────
     * This sat as `null` → "ยังไม่ระบุ" because nobody had established whether
     * the site sets a functional cookie at all. It does: the dark-mode toggle
     * persists through next-themes, which writes localStorage['theme']
     * (storageKey defaults to "theme" and is not overridden in
     * src/components/layout/ThemeProvider.jsx). Also ours: the dismissed-popup
     * and dismissed-topbar keys.
     *
     * Every one of those is first-party, so the provider is us. The ruling
     * that produced this line was: if the category had turned out to be empty,
     * DELETE the card — never fill it with a plausible-sounding third party.
     * It is not empty, so the card stays and names the real owner.
     */
    provider: 'ระบบของ 9Expert เอง',
  },
  {
    icon: 'cookie',
    name: 'การตลาด/โฆษณา',
    nameEn: 'Targeting-Advertising',
    purpose: 'นำเสนอโฆษณาที่ตรงกับความสนใจของท่าน',
    provider: 'Google Ads',
  },
];

/**
 * §3 — third-party services whose code runs on our pages.
 *
 * ── WHAT IS ACTUALLY LOADED, MEASURED FROM THIS CODEBASE ────────────────────
 * Re-verified against src/ in round C-A: the difference between "we link to
 * them" and "their code runs on our page" is exactly what decides whether a
 * cookie gets set.
 *
 *   YouTube            IN USE. youtube.com/iframe_api is injected as a script
 *                      and youtube.com/embed/ iframes are rendered on the
 *                      masterclass and course pages. Note the embeds use
 *                      youtube.com, NOT youtube-nocookie.com, so they do set
 *                      cookies.
 *   Google Analytics   IN USE. Analytics.jsx loads gtag.js and configures
 *                      G-6043WVS74D; it is rendered site-wide from
 *                      src/app/layout.jsx. Confirmed, not pending — an
 *                      earlier pass here missed this loader entirely.
 *   Google Ads         IN USE. The same Analytics.jsx call also configures
 *                      AW-1060453366 for conversion tracking — a distinct
 *                      product from Analytics, sharing the same gtag.js load.
 *                      Named generically here: this AW- id doesn't match the
 *                      one Ads account formally linked to the GA4 property, so
 *                      its exact ownership is unconfirmed. No account or
 *                      conversion ID is stated on the page for that reason.
 *   Google Tag Manager NOT FOUND. Not rendered at all — a different product
 *                      from the gtag.js loader above; confirmed absent.
 *   Meta / Facebook    NO PIXEL. There is no fbq( and no connect.facebook.
 *                      siteConfig has a link to the Facebook page; an outbound
 *                      link is not a pixel and sets no cookie here.
 *   LINE               NO SDK. line.me appears only as outbound href links and
 *                      a social-plugins share URL the visitor clicks. No LINE
 *                      code executes on our pages.
 *
 * Meta, LINE and GTM are therefore not rendered. Listing a tracker we do not
 * run is the same class of error as omitting one we do — it is a false
 * statement about what happens on the visitor's device, just in the flattering
 * direction.
 *
 * The trademarks are rendered from react-icons/si rather than committed image
 * files: the monochrome set inherits currentColor, so one icon works on both
 * themes, and we avoid holding copies of other companies' marks in public/.
 */
const THIRD_PARTY = [
  {
    Icon: SiYoutube,
    name: 'YouTube',
    purpose: 'ฝังวิดีโอประกอบหลักสูตรและ Masterclass บนหน้าเว็บไซต์',
    confirmed: true,
  },
  {
    Icon: SiGoogleanalytics,
    name: 'Google Analytics',
    purpose: 'วิเคราะห์ภาพรวมการใช้งานเว็บไซต์',
    confirmed: true,
  },
  {
    Icon: SiGoogleads,
    name: 'Google Ads',
    purpose: 'ติดตามผลลัพธ์จากโฆษณาและวัดผล conversion',
    confirmed: true,
  },
];

const TOC = [
  { id: 'about-cookies', title: 'คุกกี้คืออะไร' },
  { id: 'cookie-types', title: 'ประเภทคุกกี้ที่เราใช้' },
  { id: 'third-party', title: 'คุกกี้จากบุคคลที่สาม' },
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
      lede={`เอกสารนี้เป็นส่วนเสริมของนโยบายคุ้มครองข้อมูลส่วนบุคคลของ ${POLICY_ENTITY} (9Expert) อธิบายประเภทคุกกี้ที่เว็บไซต์ใช้งาน วัตถุประสงค์ และวิธีที่ท่านจัดการคุกกี้ได้`}
      updated={policy.updated}
      toc={TOC}
      numbered={false}
      currentSlug={policy.slug}
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

        <Section id="third-party" number="03" title="คุกกี้จากบุคคลที่สาม">
          <p>
            เว็บไซต์ของเรามีการฝังบริการจากผู้ให้บริการภายนอกบางราย
            ซึ่งอาจตั้งคุกกี้บนอุปกรณ์ของท่านตามนโยบายของผู้ให้บริการนั้นเอง
          </p>
          <ul className="mt-4 space-y-3">
            {THIRD_PARTY.map((svc) => (
              <li
                key={svc.name}
                className="flex items-start gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-4"
              >
                {/* Trademarks, coloured with the body text token so the same
                    glyph works on both themes. Decorative — the name is
                    written out beside it. */}
                <svc.Icon
                  aria-hidden="true"
                  className="mt-0.5 h-6 w-6 shrink-0 text-[var(--text-secondary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-[var(--text-primary)]">
                    {svc.name}
                  </p>
                  <p className="text-[13px] leading-[1.7]">{svc.purpose}</p>
                </div>
                {!svc.confirmed && (
                  <span className="shrink-0 rounded-full border border-[var(--surface-border)] px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)]">
                    รอการยืนยัน
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/*
            ── THE FOOTNOTE NOW REPORTS A COMPLETED REVIEW, NOT A PENDING ONE ──
            ROUND C-A/C-B resolved YouTube, Google Analytics and Google Ads by
            code search. The one row it could not resolve was §02's
            "ฟังก์ชันการใช้งาน", so the footnote narrowed to saying that row's
            provider was "ยังไม่ได้ระบุ และยังไม่ได้ตรวจสอบกับทีมพัฒนาระบบ".

            CB-B resolved it: next-themes writes localStorage['theme'] when the
            dark-mode toggle is used, which is first-party functional storage,
            so the row now names 9Expert. That made the old sentence false in
            the same way the blanket "ยังไม่ได้ตรวจสอบ" before it was false —
            it claimed a review was outstanding after the review had happened.

            THE RULE, TWICE LEARNED: never claim a review that is not
            happening, and never keep claiming one is pending once it is done.
            A date and a method is a statement that can be checked; "อยู่ระหว่าง
            การตรวจสอบ" is one that quietly never expires.
          */}
          <p className="mt-3 text-[13px] font-semibold text-[var(--text-muted)]">
            * ตรวจสอบรายชื่อคุกกี้และสคริปต์ที่ทำงานจริงบนเว็บไซต์นี้แล้วเมื่อ 9 กันยายน 2569
            โดยตรวจจากซอร์สโค้ดของระบบโดยตรง
          </p>
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
