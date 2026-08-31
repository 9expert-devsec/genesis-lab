import Image from 'next/image';

/**
 * image — a Cloudinary image via next/image. Server component. Alt text is
 * required per requirement §16 (enforced in the 2B editor); an empty alt here
 * renders a decorative image. Optimises Cloudinary hosts and falls back to
 * unoptimized for any other host so an unexpected seed can't crash the render.
 */
/**
 * The two hosts next.config.mjs lists AND that Cloudinary can transform, so
 * `unoptimized` is off for them and on for everything else. EXPORTED in round
 * 69 rather than copied: icon_card draws its illustration through next/image by
 * the same rule, and a second regexp that agrees with this one today is a
 * second regexp that disagrees with it the day either is edited. Exporting a
 * constant changes nothing about what ImageSection renders.
 */
export const CLOUDINARY = /^https:\/\/(res\.cloudinary\.com|ddva7xvdt\.res\.cloudinary\.com)\//;

export function ImageSection({ content }) {
  const src = typeof content?.src === 'string' ? content.src.trim() : '';
  if (!src) return null;
  const alt = typeof content?.alt === 'string' ? content.alt : '';
  const caption = typeof content?.caption === 'string' ? content.caption : '';

  return (
    <figure className="mx-auto">
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={900}
        sizes="(max-width: 768px) 100vw, 1200px"
        unoptimized={!CLOUDINARY.test(src)}
        className="h-auto w-full rounded-9e-lg"
      />
      {caption.trim() && (
        <figcaption className="mt-2 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
