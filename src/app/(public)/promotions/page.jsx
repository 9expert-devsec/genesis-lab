import Image from 'next/image';
import Link from 'next/link';
import { getActivePromotions, getSlugMap } from '@/lib/promotions/getPromotions';
import { getActivePromotionBanners } from '@/lib/actions/promotion-banner';
import { PromotionBannerCarousel } from '@/components/promotions/PromotionBannerCarousel';

export const revalidate = 3600;

export const metadata = {
  title: 'โปรโมชั่น | 9Expert Training',
  description:
    'รวมโปรโมชั่นและส่วนลดพิเศษสำหรับหลักสูตรอบรมจาก 9Expert Training',
};

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Buddhist year (พ.ศ. = ค.ศ. + 543)
  const year = d.getFullYear() + 543;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;
}

function dateRangeLabel(startISO, endISO) {
  const end = formatThaiDate(endISO);
  if (!end) return null;
  return `วันนี้ - ${end}`;
}

function PromotionCard({ promotion, slugMap }) {
  const slug = slugMap[promotion.promotion_id] || promotion.promotion_id;
  const range = dateRangeLabel(promotion.start_date, promotion.end_date);
  const cover = promotion.thumbnail_url;

  return (
    <Link
      href={`/promotions/${slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-9e-navy"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[#F8FAFD] dark:bg-[#0D1B2A]">
        {cover ? (
          <Image
            src={cover}
            alt={promotion.image_alt || promotion.title || ''}
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
          {promotion.title}
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

export default async function PromotionsListPage() {
  const [promotions, slugMap, banners] = await Promise.all([
    getActivePromotions(),
    getSlugMap(),
    getActivePromotionBanners(),
  ]);

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
            โปรโมชั่น
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-base text-white/80">
            ส่วนลดและสิทธิพิเศษสำหรับหลักสูตรฝึกอบรม 9Expert Training
          </p>
        </div>
      </section>

      {/* Featured banner carousel (renders nothing when banners are empty) */}
      {banners.length > 0 && (
        <section className="mx-auto max-w-[1200px] py-6">
          <PromotionBannerCarousel banners={banners} />
        </section>
      )}

      {/* Grid */}
      <section className="mx-auto max-w-[1200px] py-10 lg:py-14">
        {promotions.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--surface-border)] bg-white p-10 text-center dark:bg-9e-border">
            <p className="text-base text-[#465469] dark:text-[#C5CEDA]">
              ยังไม่มีโปรโมชั่นในตอนนี้
            </p>
            <p className="mt-1 text-sm text-[#5E6A7E]">
              โปรดกลับมาตรวจสอบใหม่อีกครั้งภายหลัง
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {promotions.map((p) => (
              <PromotionCard key={p.promotion_id} promotion={p} slugMap={slugMap} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
