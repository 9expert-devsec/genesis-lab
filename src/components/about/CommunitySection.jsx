import Image from 'next/image';
import CommunityGallery from '@/components/about/CommunityGallery';
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';
import { galleryLayout } from '@/lib/about/bento';
import { TRAINING_ROOMS } from '@/lib/about/rooms';
import { siteConfig } from '@/config/site';

/**
 * /about-us "แบ่งปันความรู้…" — the atmosphere photos as a bento (same data and
 * admin order as before) with a lightbox, then the four training rooms.
 * Calm: nothing moves on hover (globals.css, .about-bento-* / .about-room-*).
 *
 * The location note uses the building from siteConfig; "ใกล้ BTS ราชเทวี" is
 * not in the config and comes from the design draft.
 */
export default function CommunitySection({ photos = [] }) {
  const gallery = galleryLayout(photos);

  return (
    <AboutSection>
      <AboutSectionHeader
        title="แบ่งปันความรู้ จุดประกายแนวคิดสู่โลกดิจิทัล"
        intro="ห้องเรียน งานสัมมนา และกิจกรรมแลกเปลี่ยนความรู้ด้าน Digital Transformation ตลอดทั้งปี"
      />

      {gallery.items.length > 0 && (
        <div className="mt-10 lg:mt-12">
          <CommunityGallery layout={gallery.layout} items={gallery.items} />
        </div>
      )}

      <div className="mt-16 flex flex-wrap items-baseline gap-x-4 gap-y-1 lg:mt-20">
        <h3 className="font-heading text-2xl font-bold leading-[1.3] text-[var(--ab-bright)] lg:text-[28px]">ห้องอบรมของเรา</h3>
        <p className="text-sm text-[var(--ab-meta)]">
          {siteConfig.buildingTh} ราชเทวี · ใกล้ BTS ราชเทวี
        </p>
      </div>

      <div role="region" tabIndex={0} aria-label="ห้องอบรม" className="about-room-scroller mt-6">
        <ul data-reveal-group="" className="about-room-row">
          {TRAINING_ROOMS.map((room) => (
            <li key={room.key} data-reveal="fade" className="about-room">
              <Image
                src={room.image}
                alt={`ห้องอบรม ${room.name}`}
                fill
                sizes="(min-width: 1024px) 290px, (min-width: 768px) 45vw, 75vw"
                className="object-cover"
              />
              {/* On the photo's dark label gradient in both themes. */}
              <div className="about-room-label">
                <p className="font-heading text-lg font-bold text-white">{room.name}</p>
                <p className="text-sm font-semibold text-white/[0.85]">{room.seats} ที่นั่ง</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AboutSection>
  );
}
