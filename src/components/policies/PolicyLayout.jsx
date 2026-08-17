import Link from 'next/link';
import { PolicyHero } from './PolicyHero';
import { PolicyTocSidebar } from './PolicyTocSidebar';
import { PolicyIcon } from './PolicyIcon';
import { POLICY_PAGES, POLICY_HUB } from '@/config/policies';

/**
 * The shell every detail policy page renders into.
 *
 * ── ONE LAYOUT, FOUR PAGES ──────────────────────────────────────────────────
 * The Figma drew four variations on one skeleton: breadcrumb, hero, a 280 rail
 * of contents beside the body, then an optional strip of links to sibling
 * policies. The differences between them were incidental — privacy numbered its
 * contents and cookie did not, terms ended in a promo bar and cookie ended in
 * nothing — so they are unified here rather than reproduced.
 *
 * The terms page has no "open sections" region at all; it is entirely
 * accordions. That falls out for free: `sections` is optional, and a page that
 * passes only `accordion` renders as an all-accordion list.
 *
 * Column math inside the mandatory 1200 container: 280 rail + 40 gap + 880
 * body. Below lg the rail stacks above the body full-width.
 */
export function PolicyLayout({
  breadcrumb,
  illustration,
  title,
  titleEn,
  lede,
  updated,
  toc,
  numbered = true,
  help,
  notice,
  children,
  currentSlug,
}) {
  return (
    <>
      <PolicyHero
        breadcrumb={breadcrumb}
        illustration={illustration}
        title={title}
        titleEn={titleEn}
        lede={lede}
        updated={updated}
      />

      {/* The draft banner sits BETWEEN the hero and the content, full-bleed
          and outside the content container. It used to render inside the
          column, above the body — which put it in the same visual class as a
          callout and let it read as part of the article. A warning that the
          whole page is unapproved is not a callout within the page. */}
      {notice}

      <div className="bg-[var(--page-bg)]">
        <div className="mx-auto w-full max-w-[1200px] px-0 py-12 max-md:px-4">
          <div className="flex gap-10 max-lg:flex-col">
            <PolicyTocSidebar items={toc} numbered={numbered} help={help} />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </div>

      <PolicyRelatedStrip currentSlug={currentSlug} />
    </>
  );
}

/**
 * The strip of sibling policies at the foot of every detail page.
 *
 * Shows the other three policies plus the hub — never a link to the page you
 * are already on, which is the same rule the hub's card grid follows.
 */
function PolicyRelatedStrip({ currentSlug }) {
  const others = POLICY_PAGES.filter((p) => p.slug !== currentSlug);

  return (
    <section className="border-t border-[var(--surface-border)] bg-[var(--page-bg-muted)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-0 py-6 max-md:px-4">
        <p className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <PolicyIcon
            name="listChecks"
            className="h-5 w-5 shrink-0 text-9e-action dark:text-[#48B0FF]"
          />
          <span>
            ศึกษานโยบายที่เกี่ยวข้อง เพื่อความเข้าใจในสิทธิและเงื่อนไขของผู้ใช้บริการ
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {others.map((p) => (
            <Link
              key={p.slug}
              href={p.href}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-9e-action hover:text-9e-action dark:hover:border-[#48B0FF] dark:hover:text-[#48B0FF]"
            >
              {p.title}
              <PolicyIcon name="chevronRight" className="h-3 w-3" />
            </Link>
          ))}
          <Link
            href={POLICY_HUB.href}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-9e-action transition-colors hover:underline dark:text-[#48B0FF]"
          >
            ดูทั้งหมด
            <PolicyIcon name="chevronRight" className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PLACEHOLDER BANNER — READ THIS BEFORE REMOVING IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three of the four detail pages (cookie, terms, refund) carry body copy that
 * NOBODY IN LEGAL HAS WRITTEN OR APPROVED. It was mocked to the Figma's
 * structure and to the privacy page's tone so the layout could be built and
 * reviewed — it is scaffolding shaped like a legal document, which is the most
 * dangerous kind of placeholder there is, because it reads as authoritative to
 * anyone who does not know its provenance.
 *
 * So it is marked twice: in the source (a header comment on each such page) and
 * ON THE PAGE, with this banner. The on-page half is the one that matters —
 * a source comment does not protect a visitor who is trying to work out whether
 * they can get their money back.
 *
 * DELETE THIS BANNER ONLY when the page's copy has been replaced with text
 * legal has signed off. Deleting it while the mocked copy is still underneath
 * turns a clearly-marked draft into a false statement of the company's terms.
 *
 * /privacy-policy does NOT render this — its content is ported from the live
 * site and is real.
 */
function NoticeBand({ tone, icon, role, headingId, heading, body, detail }) {
  const draft = tone === 'draft';

  return (
    <aside
      role={role}
      aria-labelledby={headingId}
      className={
        draft
          ? 'border-y-4 border-[#0D1B2A] bg-[#F5C518]'
          : 'border-y border-[var(--surface-border)] bg-[var(--surface-muted)]'
      }
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-start gap-4 px-0 py-5 max-md:px-4">
        <PolicyIcon
          name={icon}
          className={
            draft
              ? 'mt-0.5 h-8 w-8 shrink-0 text-[#0D1B2A]'
              : 'mt-0.5 h-6 w-6 shrink-0 text-9e-action dark:text-[#48B0FF]'
          }
          strokeWidth={draft ? 2.25 : 2}
        />
        <div className={draft ? 'text-[#0D1B2A]' : ''}>
          <p
            id={headingId}
            className={
              draft
                ? 'text-[17px] font-extrabold leading-tight'
                : 'text-[15px] font-bold leading-tight text-[var(--text-primary)]'
            }
          >
            {heading}
          </p>
          <p
            className={
              draft
                ? 'mt-1.5 text-[14px] font-medium leading-[1.7]'
                : 'mt-1.5 text-[13px] leading-[1.7] text-[var(--text-secondary)]'
            }
          >
            {body}
          </p>
          {detail && (
            <p
              className={
                draft
                  ? 'mt-2 border-t border-[#0D1B2A]/25 pt-2 text-[14px] font-bold leading-[1.7]'
                  : 'mt-2 border-t border-[var(--surface-border)] pt-2 text-[13px] font-semibold leading-[1.7] text-[var(--text-secondary)]'
              }
            >
              {detail}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * TIER 2 — the page is a DRAFT and its specifics are invented.
 *
 * /terms and /refund-policy only. Deliberately the loudest thing on the page,
 * and deliberately NOT built from the site's palette: every other surface here
 * is a semantic token, so a token-coloured warning would harmonise with the
 * page and read as part of the design. A solid amber slab with a dark rule top
 * and bottom, identical in both themes, because it is not decoration and is not
 * supposed to look at home. role="alert", not "note".
 *
 * Full-bleed rather than a card — a bordered box inside the content column is a
 * callout, and a callout is something readers learn to skip.
 */
export function PolicyDraftNotice({ detail }) {
  return (
    <NoticeBand
      tone="draft"
      icon="alert"
      role="alert"
      headingId="policy-draft-heading"
      heading="เอกสารฉบับร่าง — ยังไม่มีผลบังคับใช้ และห้ามใช้อ้างอิง"
      body={
        <>
          เนื้อหาทั้งหมดในหน้านี้จัดทำขึ้นเป็นตัวอย่างประกอบการออกแบบเท่านั้น
          ยังไม่ผ่านการตรวจสอบโดยฝ่ายกฎหมาย และไม่ใช่เงื่อนไขที่บริษัทกำหนด กรุณา
          <Link href="/contact-us" className="font-bold underline underline-offset-2">
            ติดต่อทีมงาน 9EXPERT
          </Link>
          เพื่อขอข้อมูลที่เป็นทางการก่อนตัดสินใจใดๆ
        </>
      }
      detail={detail}
    />
  );
}

/**
 * TIER 1 — the content is REAL, but the policy is not yet in force.
 *
 * /privacy-policy and /cookie-policy. Their text came from the company's own
 * source documents, so the draft banner's wording was actively false on them:
 * it called counsel-drafted policy "ตัวอย่างประกอบการออกแบบ" and denied it was
 * "เงื่อนไขที่บริษัทกำหนด". Both clauses are gone here.
 *
 * What remains true, and all this says: the site is not in production, so the
 * policy has never taken effect, and counsel has not reviewed it.
 *
 * ── WHY THE HEADING IS PHRASED AS A NEGATIVE ────────────────────────────────
 * It reads "ยังไม่ผ่านการตรวจทานโดยที่ปรึกษากฎหมาย" — has NOT been reviewed —
 * and NOT "อยู่ระหว่างการตรวจทาน", which would say a review is underway. No
 * review is underway. The source documents recommend that counsel review before
 * publication; a recommendation is not a status, and stating one as the other
 * is the same defect as describing a cookie banner that does not exist.
 *
 * The same rule governs every `detail` line passed in here: say what is NOT
 * done, never what is supposedly in progress.
 *
 * Still full-bleed for the same reason as tier 2, but built from semantic
 * tokens and role="note" — this is a status, not a warning, and it should not
 * compete with the amber slab on the two pages that genuinely need one.
 */
export function PolicyStatusNotice({ detail }) {
  return (
    <NoticeBand
      tone="status"
      icon="info"
      role="note"
      headingId="policy-status-heading"
      heading="ฉบับก่อนเริ่มใช้บังคับ — ยังไม่ผ่านการตรวจทานโดยที่ปรึกษากฎหมาย"
      body={
        <>
          เนื้อหาในหน้านี้จัดทำขึ้นตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          (PDPA) และยังไม่มีผลบังคับใช้
          โดยจะเริ่มมีผลเมื่อเว็บไซต์เปิดให้บริการอย่างเป็นทางการ หากมีข้อสงสัย
          กรุณาติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ที่{' '}
          <a
            href="mailto:dpo@9expert.co.th"
            className="font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
          >
            dpo@9expert.co.th
          </a>
        </>
      }
      detail={detail}
    />
  );
}
