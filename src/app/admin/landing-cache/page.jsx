/**
 * /admin/landing-cache
 *
 * Status dashboard for the landing-page MongoDB cache. Shows last sync
 * time, per-section counts, and any errors from the most recent
 * sync run. The "Sync now" button posts to /api/admin/landing/sync.
 *
 * Access is already gated by the global admin middleware
 * (`matcher: ['/admin/:path*']` in src/middleware.js).
 */

import { dbConnect } from '@/lib/db/connect';
import LandingCache from '@/models/LandingCache';
import { LandingCacheClient } from './_components/LandingCacheClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Landing Cache — Admin',
  robots: { index: false, follow: false },
};

export default async function LandingCachePage() {
  await dbConnect();

  // Strip the heavy `data` payload — the page only needs status meta.
  // Keep the stringified path through `JSON.parse(JSON.stringify(...))`
  // so Mongoose ObjectIds / Dates serialize cleanly to client props.
  const raw = await LandingCache.findOne({ key: 'homepage_v1' })
    .select('-data')
    .lean()
    .exec();
  const cache = raw ? JSON.parse(JSON.stringify(raw)) : null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
        Landing Cache
      </h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Snapshot ที่หน้า Home ใช้แทนการเรียก API ปลายทางตอน render.
        ถ้าข้อมูลไม่อัพเดต กดปุ่มด้านล่างเพื่อ sync ใหม่
      </p>
      <LandingCacheClient initialCache={cache} />
    </div>
  );
}
