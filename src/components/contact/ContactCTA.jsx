import Image from 'next/image';
import Link from 'next/link';

/**
 * Always dark, in both themes, over the classroom artwork. `bg-9e-navy` is the
 * fallback if the image fails. Not `priority` — this band is at the bottom of
 * the page. On phones the crop slides right to keep the classroom in frame, and
 * a navy scrim sits under the text there because the classroom then lands
 * behind it.
 */
export default function ContactCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-9e-navy text-white">
      <Image
        src="/contact-img/contact-inhouse.webp"
        alt=""
        fill
        sizes="100vw"
        quality={80}
        className="-z-10 object-cover object-[80%_center] lg:object-[right_center]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-9e-navy/90 via-9e-navy/70 to-9e-navy/30 lg:from-9e-navy/50 lg:via-transparent lg:to-transparent"
      />

      <div className="mx-auto flex max-w-[1200px] flex-col justify-center px-4 py-16 sm:py-20 lg:min-h-[350px] lg:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-9e-air">
          IN-HOUSE TRAINING
        </p>
        <h2 className="mt-3 text-3xl font-bold leading-snug md:text-4xl">
          สนใจอบรมภายในองค์กร?
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-9e-ice/90 md:text-lg lg:max-w-3xl">
          ออกแบบหลักสูตรเฉพาะสำหรับองค์กรของคุณ วิทยากรมืออาชีพ
          พร้อมใบประกาศนียบัตร
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/registration/in-house"
            className="inline-flex items-center justify-center rounded-full bg-9e-action px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#004BD1]"
          >
            สอบถาม In-house Training →
          </Link>
          <Link
            href="/training-course"
            className="inline-flex items-center justify-center rounded-full border-2 border-white/70 px-8 py-3 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
          >
            ดูหลักสูตรทั้งหมด →
          </Link>
        </div>
      </div>
    </section>
  );
}
