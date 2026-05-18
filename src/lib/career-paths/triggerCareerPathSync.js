/**
 * Schedule a career-paths resync + revalidation to run AFTER the current
 * Server Action's response has been sent. Mirrors triggerPromotionSync.js
 * — see that file for the rationale on `after()`.
 */

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncCareerPaths } from '@/lib/career-paths/syncCareerPaths';

export function triggerCareerPathSync() {
  try {
    after(async () => {
      try {
        await syncCareerPaths();
        revalidatePath('/career-path-project');
        // Detail pages live under the public catch-all route.
        revalidatePath('/[...slug]', 'page');
        // eslint-disable-next-line no-console
        console.log('[triggerCareerPathSync] sync + revalidate complete');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[triggerCareerPathSync] background sync failed:',
          err?.message ?? err
        );
      }
    });
  } catch (err) {
    // after() throws if called outside a Server Component / Action /
    // Route Handler / Middleware. Don't break the caller.
    // eslint-disable-next-line no-console
    console.warn(
      '[triggerCareerPathSync] could not schedule:',
      err?.message ?? err
    );
  }
}