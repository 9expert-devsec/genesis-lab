/**
 * /admin/landing-cache — REDIRECT to /admin/cache.
 *
 * This page's status read and its "Sync now" button were absorbed into the
 * cache console, which covers landing_cache alongside the five other cache
 * surfaces the inventory found. The URL is kept as a redirect rather than
 * deleted because it is the href every existing bookmark, every older role
 * description and the previous sidebar entry point at.
 *
 * ── THE GUARD RUNS BEFORE THE REDIRECT, AND THAT ORDER MATTERS ──────────────
 * `requirePage` first, `redirect` second. Reversed, this URL would bounce
 * anyone — including a signed-out visitor — to /admin/cache and let THAT page
 * do the refusing, which turns a clean 403 into a redirect chain and leaks the
 * existence of the console to someone who cannot open it.
 *
 * The key is still `landing_cache`: it is what `Role.pages` holds in Mongo, and
 * the console guards on the same one.
 *
 * `_components/LandingCacheClient.jsx` is deliberately NOT deleted this round.
 * It is the component the console's sync button was ported from, and removing
 * it belongs with round 3's write actions rather than with a read-only screen —
 * a deletion here would make this commit's diff span two unrelated concerns.
 */

import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Landing Cache — Admin',
  robots: { index: false, follow: false },
};

export default async function LandingCacheRedirectPage() {
  await requirePage('landing_cache');
  redirect('/admin/cache');
}
