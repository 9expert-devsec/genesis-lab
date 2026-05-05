import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolvePromotion } from '@/lib/resolvePromotion';

export const revalidate = 3600;

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function formatThaiLong(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear() + 543;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;
}

function dateRangeLong(startISO, endISO) {
  const start = formatThaiLong(startISO);
  const end = formatThaiLong(endISO);
  if (start && end) return `${start} – ${end}`;
  if (end) return `วันนี้ – ${end}`;
  return start;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolvePromotion(slug);
  if (!resolved) return {};

  const { promotion, config } = resolved;
  const title =
    config?.meta_title?.trim() ||
    `${promotion.title} | โปรโมชั่น 9Expert Training`;
  const description =
    config?.meta_description?.trim() ||
    promotion.detail_plain?.slice(0, 160) ||
    promotion.title;
  const ogImage =
    config?.og_image_url?.trim() || promotion.thumbnail_url || '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function PromotionDetailPage({ params }) {
  const { slug } = await params;
  const resolved = await resolvePromotion(slug);
  if (!resolved) notFound();

  const { promotion } = resolved;
  const range = dateRangeLong(promotion.start_date, promotion.end_date);

  return (
    <div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
      {/* Hero image */}

      <article className="mx-auto max-w-[900px] px-4 py-10 lg:px-6 lg:py-14">
        <Link
          href="/promotions"
          className="mb-6 inline-flex items-center gap-1 text-sm text-[#005CFF] hover:underline dark:text-[#48B0FF]"
        >
          <span aria-hidden="true">←</span> กลับไปหน้าโปรโมชั่น
        </Link>

        <header className="mb-6">
          <h1 className="text-3xl font-bold leading-tight text-[#0D1B2A] dark:text-white md:text-4xl">
            {promotion.title}
          </h1>
          {range && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#005CFF]/10 px-3 py-1 text-sm font-medium text-[#005CFF] dark:bg-[#48B0FF]/15 dark:text-[#48B0FF]">
              {range}
            </p>
          )}
          {Array.isArray(promotion.tags) && promotion.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {promotion.tags.map((t, i) => (
                <span
                  key={`${t.label}-${i}`}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: t.color || '#465469' }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className="mb-6 border-[var(--surface-border)]" />

        {promotion.html_content ? (
          <div
            className="promotion-html-content text-[#0D1B2A] dark:text-[#F8FAFD]"
            dangerouslySetInnerHTML={{ __html: promotion.html_content }}
          />
        ) : (
          <p className="text-sm text-[#465469] dark:text-[#C5CEDA]">
            ไม่มีรายละเอียดเพิ่มเติม
          </p>
        )}

      </article>
    </div>
  );
}
