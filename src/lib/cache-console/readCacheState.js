/**
 * The reads behind /admin/cache. READ-ONLY — this module writes nothing.
 *
 * Everything here is classified READABLE or INFERRED in
 * docs/cache-console-inventory.md §E. Nothing classified NOT OBSERVABLE is
 * fetched, derived, or approximated, because a value that cannot be read must
 * not be rendered even as "unknown" — an "unknown" badge still tells the reader
 * there is a thing here whose state might one day be shown, and there is not.
 *
 * Every read is independently caught. A console whose Mongo connection hiccups
 * should show five panels and one error, not a 500 — it is the screen an admin
 * opens BECAUSE something looks wrong.
 */

import { dbConnect } from '@/lib/db/connect';
import LandingCache from '@/models/LandingCache';
import NavMenuCache from '@/models/NavMenuCache';
import CareerPath from '@/models/CareerPath';
import Faq from '@/models/Faq';
import Instructor from '@/models/Instructor';
import Promotion from '@/models/Promotion';
import WebhookLog from '@/models/WebhookLog';
import { summariseMirror } from '@/lib/cache-console/mirrorFreshness';

const serialize = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** Wrap a read so one failure cannot take the page down. */
async function attempt(label, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[cache-console] ${label} read failed:`, err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err), data: null };
  }
}

/**
 * The two single-document snapshots.
 *
 * `.select('-data')` on landing_cache — the same projection
 * admin/landing-cache/page.jsx:33 already uses. The payload is six Mixed arrays
 * of full course/banner/review objects and the console needs none of it; the
 * `sections` counters already on the document say how big each section is.
 *
 * nav_menu_cache has no `sections` equivalent, so its counts must be DERIVED
 * from the payload — which means reading it. That asymmetry is real and is
 * surfaced in the UI rather than smoothed over.
 */
async function readSnapshots() {
  const [landing, navmenu] = await Promise.all([
    LandingCache.findOne({ key: 'homepage_v1' }).select('-data').lean().exec(),
    NavMenuCache.findOne({ key: 'navmenu_v1' }).lean().exec(),
  ]);

  const navData = navmenu?.data ?? {};
  const groupCounts = (groups) => {
    const entries = Object.entries(groups ?? {});
    return {
      groups: entries.length,
      courses: entries.reduce(
        (n, [, g]) => n + (Array.isArray(g?.items) ? g.items.length : 0),
        0
      ),
      // A group whose firstCover is null renders column 4 empty. Counted
      // because it is derivable and load-bearing, not because it is a fault.
      withoutCover: entries.filter(([, g]) => !g?.firstCover).length,
    };
  };

  return {
    landing: {
      present: Boolean(landing),
      syncedAt: landing?.syncedAt ? new Date(landing.syncedAt).toISOString() : null,
      status: landing?.status ?? null,
      schemaVersion: landing?.schemaVersion ?? null,
      sections: serialize(landing?.sections) ?? null,
      // FULL, never truncated. The shape of a syncErrors line is what
      // identifies which code produced the snapshot — see the panel copy.
      syncErrors: Array.isArray(landing?.syncErrors) ? landing.syncErrors : [],
      updatedAt: landing?.updatedAt ? new Date(landing.updatedAt).toISOString() : null,
      /**
       * The downgrade the guard last REFUSED to write, or null.
       *
       * Its presence means the 3-hourly cron is currently blocked: every run
       * since has recomputed the same refusal and left the snapshot alone. That
       * is a state a human has to resolve, so it is READ here and rendered
       * prominently rather than being something an admin discovers by noticing
       * the home page has stopped changing.
       */
      lastRefusal: landing?.lastRefusal ?? null,
    },
    navmenu: {
      present: Boolean(navmenu),
      syncedAt: navmenu?.syncedAt ? new Date(navmenu.syncedAt).toISOString() : null,
      status: navmenu?.status ?? null,
      programs: groupCounts(navData.programs),
      skills: groupCounts(navData.skills),
      updatedAt: navmenu?.updatedAt ? new Date(navmenu.updatedAt).toISOString() : null,
    },
  };
}

/**
 * The four row-level mirrors.
 *
 * Projected to `synced_at` only. These collections hold full documents
 * (a career path carries its whole curriculum) and the console needs one field
 * per row; pulling the rest would be megabytes to compute three integers.
 */
const MIRRORS = [
  { key: 'career_paths', label: 'career_paths', model: () => CareerPath, sync: 'syncCareerPaths' },
  { key: 'faqs',         label: 'faqs',         model: () => Faq,        sync: 'syncFaqs' },
  { key: 'instructors',  label: 'instructors',  model: () => Instructor, sync: 'syncInstructors' },
  { key: 'promotions',   label: 'promotions',   model: () => Promotion,  sync: 'syncPromotions' },
];

async function readMirrors() {
  return Promise.all(
    MIRRORS.map(async (m) => {
      const rows = await m.model().find({}, { synced_at: 1, _id: 0 }).lean();
      return { key: m.key, label: m.label, sync: m.sync, ...summariseMirror(rows) };
    })
  );
}

/**
 * Recent webhook deliveries with their `revalidated` audit arrays.
 *
 * `payload` is EXCLUDED. It is the raw upstream document — the largest field on
 * the row, unbounded in shape, and irrelevant to a cache console. Leaving it
 * out is also the conservative choice for a screen that renders whatever it is
 * given: an upstream payload is untrusted content.
 */
async function readWebhookTrail(limit) {
  const docs = await WebhookLog.find({})
    .sort({ processed_at: -1 })
    .limit(limit)
    .select('event source status error revalidated processed_at')
    .lean();
  return serialize(docs);
}

/**
 * Everything /admin/cache renders, in one call.
 *
 * `deps` is a test seam; production passes nothing.
 */
export async function readCacheConsoleState({ webhookLimit = 15 } = {}) {
  await dbConnect();

  const [snapshots, mirrors, webhooks] = await Promise.all([
    attempt('snapshots', readSnapshots),
    attempt('mirrors', readMirrors),
    attempt('webhooks', () => readWebhookTrail(webhookLimit)),
  ]);

  return { snapshots, mirrors, webhooks, webhookLimit };
}
