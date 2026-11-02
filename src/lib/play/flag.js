import 'server-only';

import { notFound } from 'next/navigation';

/**
 * 9Expert Play is dark-launched behind PLAY_ENABLED. Anything other than the
 * exact string "true" — unset, "1", "TRUE" — means off, and every /play route
 * answers 404. Server-only: the flag never reaches the client bundle.
 *
 * The level pages are statically generated, so the value is read at BUILD
 * time. Changing it on Vercel needs a redeploy (which an env change there
 * needs anyway).
 */
export function isPlayEnabled() {
  return process.env.PLAY_ENABLED === 'true';
}

export function assertPlayEnabled() {
  if (!isPlayEnabled()) notFound();
}
