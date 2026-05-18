/**
 * Schedule a FAQs resync + revalidation to run AFTER the current
 * Server Action's response has been sent. Mirrors triggerPromotionSync.js
 * — see that file for the rationale on `after()`.
 */

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncFaqs } from '@/lib/faqs/syncFaqs';

export function triggerFaqSync() {
  try {
    after(async () => {
      try {
        await syncFaqs();
        revalidatePath('/faq');
        // eslint-disable-next-line no-console
        console.log('[triggerFaqSync] sync + revalidate complete');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[triggerFaqSync] background sync failed:',
          err?.message ?? err
        );
      }
    });
  } catch (err) {
    // after() throws if called outside a Server Component / Action /
    // Route Handler / Middleware. Don't break the caller.
    // eslint-disable-next-line no-console
    console.warn(
      '[triggerFaqSync] could not schedule:',
      err?.message ?? err
    );
  }
}