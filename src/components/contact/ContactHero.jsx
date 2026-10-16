import styles from './contactMotion.module.css';

/**
 * Always dark, in both themes: a CSS-only aurora on Deep Navy, white text over
 * it. Every colour is a fixed 9e token with no `dark:` variant, so the banner
 * never inverts with the theme toggle.
 *
 * Layers, back to front: the navy section background; three blurred blobs
 * clustered on the RIGHT (Action Blue largest upper-right, Air Blue lower-right,
 * a small Signal Lime hint between them) drifting on transform-only keyframes in
 * contactMotion.module.css; a navy → transparent scrim from the left, stronger
 * below lg where the text spans the full width, so the heading and subtitle sit
 * on near-flat navy at every width. The blobs are sized down on phones and the
 * section is overflow-hidden, so their bleed never causes a horizontal scroll.
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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className={`absolute -right-24 -top-32 h-72 w-72 rounded-full bg-9e-action opacity-70 blur-[60px] md:-right-16 md:-top-40 md:h-[34rem] md:w-[34rem] md:blur-[90px] ${styles.blobA}`}
        />
        <div
          className={`absolute -bottom-28 right-4 h-56 w-56 rounded-full bg-9e-air opacity-60 blur-[60px] md:-bottom-40 md:right-[12%] md:h-[26rem] md:w-[26rem] md:blur-[80px] ${styles.blobB}`}
        />
        <div
          className={`absolute right-[30%] top-[20%] h-28 w-28 rounded-full bg-9e-lime opacity-30 blur-[50px] md:right-[30%] md:top-[18%] md:h-48 md:w-48 md:blur-[70px] ${styles.blobC}`}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-9e-navy via-9e-navy/80 to-9e-navy/30 lg:via-9e-navy/60 lg:to-transparent"
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
