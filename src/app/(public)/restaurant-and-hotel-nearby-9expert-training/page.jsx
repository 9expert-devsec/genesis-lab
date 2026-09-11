import { getActiveNearbyPlaces } from '@/lib/actions/nearby-places';
import NearbyPageClient from './_components/NearbyPageClient';

export const metadata = {
  title: 'โรงแรมและร้านอาหารใกล้ 9Expert Training',
  description: 'รวมโรงแรม ร้านอาหาร และคาเฟ่ใกล้สถาบัน 9Expert Training ย่านราชเทวี',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/restaurant-and-hotel-nearby-9expert-training` },
};

export const revalidate = 3600;

export default async function Page() {
  const places = await getActiveNearbyPlaces();
  return <NearbyPageClient places={places} />;
}