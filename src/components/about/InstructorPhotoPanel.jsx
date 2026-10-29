import Image from 'next/image';
import { photoCropStyle } from '@/lib/instructors/photoCrop';

/**
 * The cursor mark from public/about-img/arrow-logo.svg, INLINED rather than
 * referenced: the file's path carries its own `opacity="0.12"` and a fixed
 * fill, so as an <img> or a CSS mask it would multiply with the watermark's
 * opacity (0.12 × 0.16 ≈ 0.02 — invisible). Inline, the colour and opacity
 * are CSS (.about-instructor-watermark). The file stays untouched as the
 * source; test/fs/aboutArrowWatermark pins this path to it.
 */
const ARROW_LOGO_VIEWBOX = '0 0 215 188';
const ARROW_LOGO_PATH =
  'M14.0577 0.173618C3.81762 -1.52955 -3.64688 9.64618 1.87265 18.4459L53.4933 100.755L104.651 182.329C110.245 191.244 123.765 189.215 126.488 179.048L147.147 102.048L210.3 53.3713C218.627 46.9477 215.305 33.6903 204.928 31.9556L109.919 16.1224L14.0471 0.152603L14.0577 0.173618Z';

/**
 * The instructor card's photo panel — ONE component for the /about-us card and
 * the /admin/instructors crop preview, so what the admin sees is what ships.
 *
 * Head-and-chest crop: the photo renders far larger than the panel inside the
 * crop box (see .about-instructor-crop), anchored top-centre, and the panel's
 * overflow:hidden cuts it around mid-chest. `scale` / `offsetY` come from
 * photoCropValues() — per instructor, defaults when unset.
 *
 * `unoptimized` is for the admin preview of a just-picked file (a blob: URL
 * the image optimiser cannot fetch).
 */
export default function InstructorPhotoPanel({
  imageUrl,
  alt,
  scale,
  offsetY,
  offsetX = 0,
  sizes = '(min-width: 1024px) 440px, (min-width: 768px) 60vw, 110vw',
  unoptimized = false,
  className = '',
}) {
  return (
    <div className={`about-instructor-panel ${className}`.trim()}>
      {/* The 9Expert cursor mark behind the photo — panel gradient, then this,
          then the photo. Fixed to the PANEL (the crop moves only the photo). */}
      <svg
        className="about-instructor-watermark"
        viewBox={ARROW_LOGO_VIEWBOX}
        aria-hidden="true"
        focusable="false"
      >
        <path d={ARROW_LOGO_PATH} fill="currentColor" />
      </svg>
      {imageUrl && (
        <div className="about-instructor-crop" style={photoCropStyle({ scale, offsetY, offsetX })}>
          <Image
            src={imageUrl}
            alt={alt}
            fill
            sizes={sizes}
            unoptimized={unoptimized}
            className="about-instructor-photo object-contain object-top"
          />
        </div>
      )}
    </div>
  );
}
