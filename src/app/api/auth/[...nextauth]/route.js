/**
 * NextAuth v5 route handler.
 *
 * The `handlers` export from @/lib/auth/options provides { GET, POST }.
 * We re-export them here so Next.js App Router picks them up at
 * /api/auth/[...nextauth].
 *
 * Runtime: Node.js (bcryptjs needs Node APIs — not Edge-compatible).
 */

import { handlers } from '@/lib/auth/options';

export const runtime = 'nodejs';
export const { GET, POST } = handlers;
