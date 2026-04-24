import { notFound } from 'next/navigation';
import { getBanners } from '@/lib/actions/banners';
import { BannerForm } from '../../_components/BannerForm';

export const metadata = { title: 'แก้ไข Banner' };

export default async function Page({ params }) {
  const { id } = await params;
  const banners = await getBanners();
  const banner = banners.find((b) => b._id === id);
  if (!banner) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold text-9e-navy mb-6">แก้ไข Banner</h1>
      <BannerForm banner={banner} />
    </div>
  );
}
