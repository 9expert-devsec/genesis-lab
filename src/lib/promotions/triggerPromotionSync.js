/**
 * Schedule a promotions resync + revalidation to run AFTER the current
 * Server Action's response has been sent. Mirrors triggerLandingSync.js
 * — see that file for the rationale on `after()`.
 */

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncPromotions } from '@/lib/promotions/syncPromotions';

export function triggerPromotionSync() {
  try {
    after(async () => {
      try {
        await syncPromotions();
        revalidatePath('/promotions');
        revalidatePath('/promotions/[slug]', 'page');
        // eslint-disable-next-line no-console
        console.log('[triggerPromotionSync] sync + revalidate complete');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[triggerPromotionSync] background sync failed:',
          err?.message ?? err
        );
      }
    });
  } catch (err) {
    // after() throws if called outside a Server Component / Action /
    // Route Handler / Middleware. Don't break the caller.
    // eslint-disable-next-line no-console
    console.warn(
      '[triggerPromotionSync] could not schedule:',
      err?.message ?? err
    );
  }
}
