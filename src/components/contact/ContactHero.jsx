import Image from 'next/image';

import styles from './contactMotion.module.css';

/**
 * Always dark, in both themes: the artwork is a night-blue globe and the text
 * is white over it. `bg-9e-navy` is the fallback if the image fails to load, so
 * the white text keeps its contrast either way.
 *
 * The image is 2172x361 — the section is held near that height on desktop
 * (360px) so it is never upscaled far enough to soften. On phones the crop
 * slides right (object-[75%_center]) to keep the globe in frame, and a navy
 * scrim sits under the text there because the globe then lands behind it.
 *
 * Heights are minimums (300 / 320 / 360px): the text block is vertically
 * centred, and if it wraps taller the banner grows with it. The container is
 * the same `max-w-[1200px] px-4 lg:px-6` as the sections below, so the text
 * shares their left edge. "9Expert Training" is an inline-block so a phone-
 * width wrap falls after "ติดต่อ", never inside the brand name.
 */
export default function ContactHero() {
  return (
    <section className="relative isolate overflow-hidden bg-9e-navy text-white">
      <Image
        src="/contact-img/contact-hero.webp"
        alt=""
        fill
        priority
        fetchPriority="high"
        quality={80}
        sizes="100vw"
        className={`-z-10 object-cover object-[75%_center] lg:object-[right_center] ${styles.heroImage}`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-9e-navy/90 via-9e-navy/60 to-9e-navy/20 lg:from-9e-navy/40 lg:via-transparent lg:to-transparent"
      />

      <div className="mx-auto flex min-h-[300px] max-w-[1200px] flex-col justify-center px-4 py-12 md:min-h-[320px] lg:min-h-[360px] lg:px-6">
        <p className={`text-sm font-semibold uppercase tracking-[0.18em] text-9e-air ${styles.eyebrow}`}>
          CONTACT US
        </p>
        <h1 className={`mt-3 text-[clamp(2.25rem,1.2rem+3vw,3.75rem)] font-bold leading-[1.15] tracking-[-0.01em] ${styles.title}`}>
          ติดต่อ <span className="inline-block text-9e-air">9Expert Training</span>
        </h1>
        <p className={`mt-5 max-w-[40rem] text-lg leading-[1.6] text-9e-ice/90 md:text-xl ${styles.subtitle}`}>
          มีคำถามเกี่ยวกับหลักสูตร การอบรม หรือบริการของเรา?
          <br />
          ทีมงาน 9Expert พร้อมให้คำปรึกษาและช่วยเหลือคุณ
        </p>
      </div>
    </section>
  );
}
