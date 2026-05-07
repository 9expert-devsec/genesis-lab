import Link from 'next/link';
import { listPromotionBanners } from '@/lib/actions/promotion-banner';
import { PromotionBannerAdminClient } from './_components/PromotionBannerAdminClient';

export const metadata = { title: 'แบนเนอร์โปรโมชั่น' };
export const dynamic = 'force-dynamic';

export default async function PromotionBannerPage() {
  const banners = await listPromotionBanners();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/admin/promotions"
          className="text-sm text-9e-action hover:underline dark:text-9e-air"
        >
          ← กลับไปยังโปรโมชั่น
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-9e-navy dark:text-white">
          แบนเนอร์โปรโมชั่น
        </h1>
        <p className="mt-1 text-sm text-9e-slate dark:text-[#94a3b8]">
          จัดการแบนเนอร์ที่แสดงเหนือรายการโปรโมชั่น (เลื่อนอัตโนมัติทุก 4 วินาที)
        </p>
      </div>

      <PromotionBannerAdminClient initialBanners={banners} />
    </div>
  );
}
