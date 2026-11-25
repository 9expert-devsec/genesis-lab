import { OAI_PIXEL_ID, oaiPixelDebug } from '@/lib/analytics/oaiPixel';
import { OaiPixelLoader } from '@/components/analytics/OaiPixelLoader';

/**
 * Server wrapper for the OpenAI Ads pixel. It exists so `debug` can be decided
 * from VERCEL_ENV — a server-only variable — at build time, and handed to the
 * client loader as a boolean. No pixel id configured → nothing is rendered at
 * all, not even the client component.
 */
export function OaiPixel() {
  if (!OAI_PIXEL_ID) return null;
  return <OaiPixelLoader pixelId={OAI_PIXEL_ID} debug={oaiPixelDebug()} />;
}
