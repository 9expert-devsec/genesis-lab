import Image from 'next/image';
import Link from 'next/link';
import {
  getActivePromotions, getSlugMap, getActiveBuilderPromotions,
  getActiveCustomPagePromotions,
} from '@/lib/promotions/getPromotions';
import { getActivePromotionBanners } from '@/lib/actions/promotion-banner';
import {
  promotionPageToCard, orderedPromotionCards, selectVisiblePromotionPages,
} from '@/lib/pages/promotionMode';
import { PromotionBannerCarousel } from '@/components/promotions/PromotionBannerCarousel';
// ROUND 43, ADDED beside the statements above rather than folded into one —
// the standing rule in this repo. The two date helpers that used to live in
// this file moved there; see that module's header for what they were getting
// wrong and for the measurement that decided it.
import { dateRangeLabel } from '@/lib/promotions/promotionDateLabel';

export const revalidate = 3600;

export const metadata = {
  title: 'โปรโมชัน | 9Expert Training',
  description:
    'รวมโปรโมชั่นและส่วนลดพิเศษสำหรับหลักสูตรอบรมจาก 9Expert Training',
};

/*
 * ── THE DATE LABEL MOVED OUT — ROUND 43 ───────────────────────────────────
 * `THAI_MONTHS`, `formatThaiDate` and `dateRangeLabel` were here, and the
 * formatter read `getDate()` / `getMonth()` / `getFullYear()` — the RUNTIME's
 * zone. This is a server component with `revalidate = 3600`, so exactly one
 * zone decides and on Vercel it is UTC: the grid named a UTC day to an
 * audience reading it in Bangkok. Measured over all 23 end dates that reach
 * this label, both builder rows were shown a day EARLIER than the last day
 * they are actually visible.
 *
 * They now live in lib/promotions/promotionDateLabel.js, pinned to the site's
 * zone through the module that owns it. They moved rather than being fixed in
 * place because a route file's exports are constrained by the framework, so
 * nothing in the suite could reach them to assert what they RENDER — and the
 * defect was a rendered string.
 */

// ONE card for all three sources — fed a uniform view-model (see cardFromMsdb /
// promotionPageToCard). NOT forked per source: builder pages, Advanced HTML
// pages and MSDB rows are mapped to the same
// { href, title, cover, alt, start, end } shape upstream, so they render
// identically. A CustomPage has no publish window, so its card simply carries no
// date pill — an absent value, not an invented one.
function PromotionCard({ card }) {
  const range = dateRangeLabel(card.start, card.end);
  const cover = card.cover;

  return (
    <Link
      href={card.href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-9e-navy"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[#F8FAFD] dark:bg-[#0D1B2A]">
        {cover ? (
          <Image
            src={cover}
            alt={card.alt || card.title || ''}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105 aspect-square"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#5E6A7E]">
            ไม่มีภาพปก
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2 className="line-clamp-2 text-base font-bold leading-snug text-[#0D1B2A] dark:text-white md:text-lg">
          {card.title}
        </h2>

        {range && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#005CFF]/10 px-3 py-1 text-xs font-medium text-[#005CFF] dark:bg-[#48B0FF]/15 dark:text-[#48B0FF]">
            {range}
          </span>
        )}

        <div className="mt-auto pt-2">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#005CFF] transition-colors group-hover:text-[#2486FF] dark:text-[#48B0FF]">
            ดูรายละเอียด
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

// MSDB promotion → the same card view-model as promotionPageToCard. slug
// resolves via the config slugMap, falling back to the raw promotion_id.
function cardFromMsdb(promotion, slugMap) {
  const slug = slugMap[promotion.promotion_id] || promotion.promotion_id;
  return {
    key: `msdb:${promotion.promotion_id}`,
    href: `/promotions/${slug}`,
    title: promotion.title,
    cover: promotion.thumbnail_url,
    alt: promotion.image_alt || promotion.title || '',
    start: promotion.start_date,
    end: promotion.end_date,
    source: 'msdb',
  };
}

export default async function PromotionsListPage() {
  const [promotions, slugMap, banners, builderPromotions, customPromotions] =
    await Promise.all([
      getActivePromotions(),
      getSlugMap(),
      getActivePromotionBanners(),
      getActiveBuilderPromotions(),
      getActiveCustomPagePromotions(),
    ]);

  /**
   * Read-time union (§6 — no collection is written).
   *
   * ── THE GENESIS HALF IS ONE BLOCK, SORTED ACROSS BOTH COLLECTIONS ────────
   * Builder promotions and Advanced HTML promotions INTERLEAVE on
   * `promotionOrder`. They are both Genesis-owned pages carrying the same
   * admin-controlled order field, so the admin arranges them himself rather than
   * the code deciding which collection outranks the other — a builder promo at
   * order 2 sits between two Advanced HTML promos at 1 and 3.
   *
   * That requires ONE `selectVisiblePromotionPages` call over the UNION. Each
   * loader already gates and sorts its own half, and sorting two sorted lists
   * separately then concatenating them is two blocks by construction, which is
   * exactly what this is not. The gate is idempotent, so re-running it over the
   * union costs a filter pass and buys one ordering.
   *
   * The `promotionSource` tag is attached HERE, where the two loaders are named,
   * and read back by `promotionPageToCard` — which takes the source as a
   * required argument because it namespaces the React key, and an `_id` is
   * unique within a collection but not across two.
   *
   * MSDB still follows as its own block. `promotionOrder` and MSDB
   * `display_order` are independent scales nobody has reconciled; see
   * orderedPromotionCards.
   */
  const genesisPages = [
    ...builderPromotions.map((p) => ({ ...p, promotionSource: 'builder' })),
    ...customPromotions.map((p) => ({ ...p, promotionSource: 'custom' })),
  ];
  const cards = orderedPromotionCards(
    selectVisiblePromotionPages(genesisPages)
      .map((p) => promotionPageToCard(p, p.promotionSource)),
    promotions.map((p) => cardFromMsdb(p, slugMap)),
  );

  return (
    <div className="bg-[#F8FAFD] dark:bg-9e-border">
      {/* Hero — same gradient pattern as /training-course */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#005CFF] to-[#48B0FF] py-12 dark:bg-gradient-to-b dark:from-[#0a1628] dark:to-[#0d1e36] md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-[1200px] px-4 text-center lg:px-6">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            โปรโมชัน
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-base text-white/80">
            ส่วนลดและสิทธิพิเศษสำหรับหลักสูตรฝึกอบรม 9Expert Training
          </p>
        </div>
      </section>

      {/* Featured banner carousel (renders nothing when banners are empty) */}
      {banners.length > 0 && (
        <section className="mx-auto max-w-[1200px]  lg:px-6 lg:py-6">
          <PromotionBannerCarousel banners={banners} />
        </section>
      )}

      {/* Grid */}
      <section className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6 lg:py-14">
        {cards.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--surface-border)] bg-white p-10 text-center dark:bg-9e-border">
            <p className="text-base text-[#465469] dark:text-[#C5CEDA]">
              ยังไม่มีโปรโมชันในตอนนี้
            </p>
            <p className="mt-1 text-sm text-[#5E6A7E]">
              โปรดกลับมาตรวจสอบใหม่อีกครั้งภายหลัง
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <PromotionCard key={c.key} card={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
