import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { getBanners } from '@/lib/actions/banners';
import { AdminBannerList } from './_components/AdminBannerList';

export const metadata = { title: 'Banner' };

export default async function Page() {
  await requirePage('banners');

  const banners = await getBanners();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-9e-navy">จัดการ Banner</h1>
        <Link
          href="/admin/banners/new"
          className="px-4 py-2 bg-9e-action hover:bg-9e-brand text-white rounded-9e-md text-sm font-bold transition-colors"
        >
          + เพิ่ม Banner
        </Link>
      </div>
      <AdminBannerList banners={banners} />
    </div>
  );
}
