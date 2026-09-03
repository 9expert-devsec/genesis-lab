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
 * `_components/LandingCacheClient.jsx` — the component this page used to render,
 * and the one the console's sync button was ported from — has now been deleted.
 * Nothing imported it; this page has been a bare redirect since the port, and
 * the file was reachable only from two comments pointing at it.
 *
 * THIS FILE STAYS. It is the redirect, not the dead component: deleting it
 * would 404 every bookmark and every older role description that names
 * /admin/landing-cache.
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
