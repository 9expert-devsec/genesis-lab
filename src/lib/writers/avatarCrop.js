/**
 * The arithmetic behind the writer avatar crop, and the one function that turns
 * it into pixels.
 *
 * The circle is CSS at render time; what is stored is a square. So the crop
 * dialog's job ends at a 512×512 image, which is what /api/admin/upload receives.
 *
 * Everything here runs with no DOM root, so the test tier can call it directly.
 * `renderCroppedBlob` takes its canvas as an argument for the same reason.
 */

export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 3;
export const AVATAR_PREVIEW_SIZES = Object.freeze([96, 48, 28]);

const WEBP_QUALITY = 0.9;
const JPEG_QUALITY = 0.9;

/**
 * The source rectangle, as whole pixels inside the image.
 *
 * react-easy-crop reports fractional pixels and, at the edge of the image, can
 * land a fraction past it. Rounding alone could then ask the canvas for a row
 * that does not exist, which it fills with transparency. The square stays
 * square: a crop that does not fit is shrunk, not stretched.
 *
 * @param {{x:number, y:number, width:number, height:number}} area
 * @param {{width:number, height:number}} natural  the image's own size
 */
export function clampCropArea(area, natural) {
  const imageWidth = Math.max(1, Math.round(natural?.width) || 1);
  const imageHeight = Math.max(1, Math.round(natural?.height) || 1);
  const wanted = Math.round(Math.min(Number(area?.width) || 0, Number(area?.height) || 0));
  const side = Math.max(1, Math.min(wanted, imageWidth, imageHeight));
  const x = Math.min(Math.max(0, Math.round(Number(area?.x) || 0)), imageWidth - side);
  const y = Math.min(Math.max(0, Math.round(Number(area?.y) || 0)), imageHeight - side);
  return { x, y, width: side, height: side };
}

/**
 * Where to put the image inside a `size`px circle so the circle shows exactly
 * what the crop will.
 *
 * @param {{x:number, y:number, width:number, height:number}} percent
 *   react-easy-crop's area in PERCENT of the image
 * @param {number} size
 */
export function previewImageStyle(percent, size) {
  const width = (size * 100) / percent.width;
  const height = (size * 100) / percent.height;
  return {
    width,
    height,
    left: -(percent.x / 100) * width,
    top: -(percent.y / 100) * height,
  };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function paint(ctx, image, region, output, background) {
  ctx.clearRect(0, 0, output, output);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, output, output);
  }
  ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, output, output);
}

/**
 * Render the crop to a square image.
 *
 * A browser that cannot encode WebP does not fail: `toBlob` quietly hands back
 * a PNG instead, so the check has to be on the blob's type. The JPEG fallback
 * paints white first because JPEG has no alpha, and a transparent logo would
 * otherwise come out on black.
 *
 * @param {{naturalWidth:number, naturalHeight:number}} image
 * @param {{x:number, y:number, width:number, height:number}} area  in PIXELS
 * @param {{canvas?: object, size?: number}} [options]
 * @returns {Promise<Blob>}
 */
export async function renderCroppedBlob(image, area, { canvas, size = AVATAR_OUTPUT_SIZE } = {}) {
  const target = canvas ?? document.createElement('canvas');
  target.width = size;
  target.height = size;
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ครอปรูปไม่ได้');

  const region = clampCropArea(area, { width: image.naturalWidth, height: image.naturalHeight });

  paint(ctx, image, region, size);
  const webp = await toBlob(target, 'image/webp', WEBP_QUALITY);
  if (webp?.type === 'image/webp') return webp;

  paint(ctx, image, region, size, '#FFFFFF');
  const jpeg = await toBlob(target, 'image/jpeg', JPEG_QUALITY);
  if (!jpeg) throw new Error('สร้างรูปที่ครอปไม่สำเร็จ');
  return jpeg;
}
