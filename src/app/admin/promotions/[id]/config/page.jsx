import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';
import { PromotionConfigForm } from './_components/PromotionConfigForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  await dbConnect();
  const promotion = await Promotion.findOne({ promotion_id: id }).lean();
  if (!promotion) return { title: 'ไม่พบโปรโมชั่น' };
  return { title: `ตั้งค่า: ${promotion.title}` };
}

export default async function PromotionConfigPage({ params }) {
  const { id } = await params;
  await dbConnect();

  const [promotionRaw, configRaw] = await Promise.all([
    Promotion.findOne({ promotion_id: id }).lean(),
    PromotionConfig.findOne({ promotion_id: id }).lean(),
  ]);

  if (!promotionRaw) notFound();

  const promotion = JSON.parse(JSON.stringify(promotionRaw));
  const config = configRaw ? JSON.parse(JSON.stringify(configRaw)) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/promotions"
          className="text-sm text-9e-action hover:underline dark:text-9e-air"
        >
          ← กลับไปยังรายการโปรโมชั่น
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-9e-navy dark:text-white">
          ตั้งค่า URL &amp; SEO
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {promotion.title}
        </p>
      </div>

      <PromotionConfigForm promotion={promotion} config={config} />
    </div>
  );
}
