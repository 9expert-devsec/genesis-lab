import Image from 'next/image';
import { Navigation } from 'lucide-react';
import { getTransportMap } from '@/lib/actions/contact';

export default async function TransportMapSection() {
  const map = await getTransportMap();
  if (!map?.image_url) return null;

  return (
    <section className="bg-[#060e1a] py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgba(0,92,255,0.3)] bg-[rgba(0,92,255,0.05)] px-4 py-1.5">
            <Navigation className="h-4 w-4 text-[#48B0FF]" />
            <span className="text-sm uppercase tracking-[0.7px] text-[#48B0FF]">
              การเดินทาง
            </span>
          </div>
          <h2 className="text-3xl font-extrabold leading-normal text-white md:text-5xl">
            การเดินทางมายัง{' '}
            <span className="bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent">
              9Expert
            </span>
          </h2>
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-[#1e2939] bg-[#0d1f35] p-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
            <Image
              src={map.image_url}
              alt="แผนที่การเดินทางมายัง 9Expert Training"
              width={1200}
              height={750}
              className="h-auto w-full rounded-2xl"
            />
          </div>

          {map.caption_th && (
            <p className="mt-6 whitespace-pre-line text-center text-sm text-[#99a1af]">
              {map.caption_th}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
