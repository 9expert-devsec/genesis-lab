/**
 * Schedule an instructors resync to run AFTER the current server
 * action's response is flushed. Same `after()` pattern as the other
 * trigger helpers in this repo.
 */

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncInstructors } from './syncInstructors';

export function triggerInstructorSync() {
  try {
    after(async () => {
      try {
        await syncInstructors();
        revalidatePath('/admin/instructors');
        // eslint-disable-next-line no-console
        console.log('[triggerInstructorSync] sync + revalidate complete');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[triggerInstructorSync] background sync failed:',
          err?.message ?? err
        );
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[triggerInstructorSync] could not schedule:',
      err?.message ?? err
    );
  }
}
