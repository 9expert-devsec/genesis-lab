import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getBanners } from '@/lib/actions/banners';
import {
  getBannerArticleOptions,
  getBannerCourseOptions,
} from '@/lib/banners/pickerOptions';
import { BannerForm } from '../../_components/BannerForm';

export const metadata = { title: 'แก้ไข Banner' };

export default async function Page({ params }) {
  await requirePage('banners');

  const { id } = await params;
  // All three in parallel — the picker lists do not depend on which banner this
  // is, and neither loader throws (see the note on the new-banner page). A
  // record whose stored reference is missing from the lists is still rendered:
  // the value lives on the document and in a hidden input, and the picker warns
  // rather than silently blanking it.
  const [banners, courseOptions, articleOptions] = await Promise.all([
    getBanners(),
    getBannerCourseOptions(),
    getBannerArticleOptions(),
  ]);

  const banner = banners.find((b) => b._id === id);
  if (!banner) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold text-9e-navy mb-6">แก้ไข Banner</h1>
      <BannerForm
        banner={banner}
        courseOptions={courseOptions}
        articleOptions={articleOptions}
      />
    </div>
  );
}
