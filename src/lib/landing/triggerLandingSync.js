/**
 * Schedule a landing-cache rebuild + homepage revalidation to run
 * AFTER the current Server Action's response has been sent.
 *
 * Why `after()` and not `await syncLandingData()`?
 *   - The sync fans out to ~10 upstream calls and can take 5–15s.
 *     Awaiting it would tack that latency onto every admin save —
 *     the user clicks "save", then waits 15s for a toggle to confirm.
 *   - `after()` (stable in Next.js 15.1+) defers the callback until
 *     after the HTTP response is flushed; Vercel's runtime keeps the
 *     function alive long enough for the work to finish.
 *   - The callback swallows its own errors so a transient sync
 *     failure can't surface as a failed admin save.
 *
 * Call this from any Server Action that mutates data feeding the
 * home page (banners, featured-*). It's a no-op if called outside a
 * supported context (Server Component / Action / Route Handler /
 * Middleware) — `after()` will throw, but we don't.
 */

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncLandingData } from '@/lib/landing/syncLandingData';

export function triggerLandingSync() {
  try {
    after(async () => {
      try {
        await syncLandingData();
        revalidatePath('/');
        // eslint-disable-next-line no-console
        console.log('[triggerLandingSync] sync + revalidate complete');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[triggerLandingSync] background sync failed:',
          err?.message ?? err
        );
      }
    });
  } catch (err) {
    // after() throws if called outside a Server Component / Action /
    // Route Handler / Middleware. We never want to break the caller.
    // eslint-disable-next-line no-console
    console.warn(
      '[triggerLandingSync] could not schedule:',
      err?.message ?? err
    );
  }
}
