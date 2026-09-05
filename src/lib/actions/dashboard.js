'use server';

/**
 * The dashboard's one server action — the AUTHORISED WRAPPER.
 *
 * ══ WHAT THIS FILE IS AND IS NOT ════════════════════════════════════════════
 * It owns exactly three things: the guard, the scope resolution, and handing the
 * real mongoose models to the read layer. The reads themselves, the filters and
 * the payload shape live in lib/dashboard/buildMetrics.js — see that file's
 * header for why the models are a parameter there and must never be one here.
 *
 * ── THE SCOPES COME FROM THE SESSION. THERE IS NO OTHER SOURCE. ─────────────
 * `requireAdmin('dashboard')` returns the session it just validated, and
 * `dashboardScopes` reads the page keys off `session.user`. Nothing about which
 * sections run is derived from an argument: this module is `'use server'`, so
 * every parameter it declares is a client-supplied value, and `range` is the
 * only one — a value that can change WHICH ROWS are counted but never WHETHER
 * they are counted. A system-only caller can post any range they like and reach
 * no registration read, because the branch that would run one is decided by
 * `canAccess` on their session before `range` is looked at.
 *
 * ── requirePage('dashboard') IS NOT WEAKENED ────────────────────────────────
 * The scopes NARROW. A caller still needs `dashboard` to get past the guard
 * below; holding `dashboard_registrations` without `dashboard` gets them
 * nothing, because they never reach this function.
 */

import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import Banner          from '@/models/Banner';
import Promotion       from '@/models/Promotion';
import Article         from '@/models/Article';
import FeaturedReview  from '@/models/FeaturedReview';
import Recruit         from '@/models/Recruit';
/**
 * Round E3's action queue.
 *
 * `MasterclassRegistration` is the FIRST masterclass figure ever to reach this
 * page — one queue card, no section, no batch seats, no revenue. Round E1
 * measured it as the largest queue in the system (30 pending, 28 of them older
 * than a fortnight) against a dashboard that did not mention masterclass at all.
 *
 * `WebhookLog` serves the system-scope error card and is read ONLY for a caller
 * holding `dashboard_system`.
 */
import MasterclassRegistration from '@/models/MasterclassRegistration';
import WebhookLog              from '@/models/WebhookLog';
import { requireAdmin } from '@/lib/actions/auth';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { dashboardScopes, hasNoDashboardScope } from '@/lib/dashboard/scopes';

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

/** The real models, in the shape buildDashboardMetrics destructures. */
const MODELS = {
  RegisterPublic,
  RegisterInhouse,
  Banner,
  Promotion,
  Article,
  FeaturedReview,
  Recruit,
  MasterclassRegistration,
  WebhookLog,
};

/**
 * Fetch the dashboard metrics the caller is authorised to see.
 *
 * @param {'today'|'week'|'month'|'all'} range — date filter for the registration
 *   counts. Client-supplied, and deliberately inert for a caller without
 *   `dashboard_registrations`.
 */
export async function getDashboardMetrics(range = 'today') {
  const session = await requireAdmin('dashboard');
  const scopes = dashboardScopes(session?.user);

  /**
   * ── NO SCOPE, NO CONNECTION ─────────────────────────────────────────────
   * Returned BEFORE `dbConnect()`. `buildDashboardMetrics` with two false
   * scopes already issues no query, so this is not what makes the read count
   * zero — but opening a database handle to answer "you may see nothing" is
   * work with no reader, and returning first says so in the shape of the code.
   */
  if (hasNoDashboardScope(scopes)) {
    return serialize({ scopes });
  }

  await dbConnect();

  return serialize(await buildDashboardMetrics({ scopes, range, models: MODELS }));
}
