import { getAllNearbyPlaces } from '@/lib/actions/nearby-places';
import { NearbyPlacesAdminClient } from './_components/NearbyPlacesAdminClient';

export const metadata = { title: 'โรงแรมและร้านอาหารใกล้เคียง' };
export const dynamic = 'force-dynamic';

export default async function NearbyPlacesAdminPage() {
  const places = await getAllNearbyPlaces();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          โรงแรมและร้านอาหารใกล้เคียง
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          จัดการสถานที่ที่แสดงในหน้า /restaurant-and-hotel-nearby-9expert-training
        </p>
      </div>

      <NearbyPlacesAdminClient initialPlaces={places} />
    </div>
  );
}