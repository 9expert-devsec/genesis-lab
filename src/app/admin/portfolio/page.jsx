import {
  getAllClientLogos,
  getAllAtmospherePhotos,
} from '@/lib/actions/portfolio';
import { PortfolioAdminClient } from './_components/PortfolioAdminClient';

export const metadata = { title: 'จัดการหน้าผลงาน' };
export const dynamic = 'force-dynamic';

export default async function PortfolioAdminPage() {
  const [logos, photos] = await Promise.all([
    getAllClientLogos(),
    getAllAtmospherePhotos(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการหน้าผลงาน
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          จัดการโลโก้ลูกค้าและภาพบรรยากาศการฝึกอบรมบนหน้า /portfolio
        </p>
      </div>

      <PortfolioAdminClient initialLogos={logos} initialPhotos={photos} />
    </div>
  );
}
