import { requirePage } from '@/lib/rbac/guard';
import {
  getBannerArticleOptions,
  getBannerCourseOptions,
} from '@/lib/banners/pickerOptions';
import { BannerForm } from '../_components/BannerForm';

export const metadata = { title: 'เพิ่ม Banner' };

export default async function Page() {
  await requirePage('banners');

  // Both, in parallel, and NEITHER can throw: each loader returns
  // `{ items, error }` and swallows its own failure. This page had no upstream
  // dependency before the pickers existed, and MSDB being down must not turn
  // "create a banner" into a 500 — the other fifteen fields have nothing to do
  // with courses. The form renders the error inline, next to a working form.
  const [courseOptions, articleOptions] = await Promise.all([
    getBannerCourseOptions(),
    getBannerArticleOptions(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-9e-navy mb-6">เพิ่ม Banner ใหม่</h1>
      <BannerForm courseOptions={courseOptions} articleOptions={articleOptions} />
    </div>
  );
}
