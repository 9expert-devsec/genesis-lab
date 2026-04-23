import { listPrograms } from '@/lib/api/programs';
import { PublicHeaderClient } from './PublicHeaderClient';

/**
 * Public site header — Server Component shell.
 *
 * Fetches the programs list (server-cached via ISR in the adapter) and
 * passes it down to the interactive client shell. If the upstream fetch
 * fails we render the header with an empty programs array; the mega
 * trigger then degrades to a plain link to /training-course.
 */
export async function PublicHeader() {
  let programs = [];
  try {
    const result = await listPrograms();
    programs = result.items;
  } catch (err) {
    console.error('[PublicHeader] failed to fetch programs:', err);
  }

  return <PublicHeaderClient programs={programs} />;
}
