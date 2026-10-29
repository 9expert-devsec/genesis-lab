import Image from 'next/image';
import CommunityGallery from '@/components/about/CommunityGallery';
import { galleryLayout } from '@/lib/about/bento';
import { TRAINING_ROOMS } from '@/lib/about/rooms';
import { siteConfig } from '@/config/site';

/**
 * /about-us "แบ่งปันความรู้…" — the atmosphere photos as a bento (same data and
 * admin order as before) with a lightbox, then the four training rooms.
 * Calm: hover only (globals.css, .about-bento-* / .about-room-*).
 *
 * The location note uses the building from siteConfig; "ใกล้ BTS ราชเทวี" is
 * not in the config and comes from the design draft.
 */
export default function CommunitySection({ photos = [] }) {
  const gallery = galleryLayout(photos);

  return (
    <section className="bg-[var(--page-bg)] px-4 py-20 lg:px-6 lg:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[760px] text-center">
          <h2 className="font-heading text-3xl font-bold leading-snug text-[var(--text-primary)] md:text-[40px]">
            แบ่งปันความรู้ จุดประกายแนวคิดสู่โลกดิจิทัล
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
            ห้องเรียน งานสัมมนา และกิจกรรมแลกเปลี่ยนความรู้ด้าน Digital Transformation ตลอดทั้งปี
          </p>
        </div>

        {gallery.items.length > 0 && (
          <div className="mt-10 lg:mt-12">
            <CommunityGallery layout={gallery.layout} items={gallery.items} />
          </div>
        )}

        <div className="mt-16 flex flex-wrap items-baseline gap-x-4 gap-y-1 lg:mt-20">
          <h3 className="font-heading text-2xl font-bold text-[var(--text-primary)] lg:text-[28px]">ห้องอบรมของเรา</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {siteConfig.buildingTh} ราชเทวี · ใกล้ BTS ราชเทวี
          </p>
        </div>

        <div role="region" tabIndex={0} aria-label="ห้องอบรม" className="about-room-scroller mt-6">
          <ul className="about-room-row">
            {TRAINING_ROOMS.map((room) => (
              <li key={room.key} className="about-room">
                <Image
                  src={room.image}
                  alt={`ห้องอบรม ${room.name}`}
                  fill
                  sizes="(min-width: 1024px) 290px, (min-width: 768px) 45vw, 75vw"
                  className="about-room-photo object-cover"
                />
                <div className="about-room-label">
                  <p className="font-heading text-lg font-bold text-white">{room.name}</p>
                  <p className="text-sm font-semibold text-9e-lime">{room.seats} ที่นั่ง</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
