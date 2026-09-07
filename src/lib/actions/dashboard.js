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
import { DEFAULT_RANGE, resolveCustomWindow } from '@/lib/dashboard/ranges';

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
 * ══ THREE PARAMETERS, ALL OF THEM WINDOW PARAMETERS ═════════════════════════
 *
 * This is a `'use server'` export, so every argument is a value a browser can
 * post. Round E2 pinned it at ONE parameter with the reasoning that `range` can
 * change WHICH rows are counted and never WHETHER they are. `from` and `to`
 * are the same kind of value and carry the same guarantee, so the guard in
 * test/fs/dashboardScopeEnforcement is now a NAMED ALLOWLIST of exactly these
 * three rather than a count — a count would have been satisfied by folding them
 * into one object, which is the letter of the rule with none of its point.
 *
 * What still holds, and is what the rule was protecting: the SCOPES decide
 * whether the registration half runs at all, and they come from the session
 * before any of these is looked at. A caller without `dashboard_registrations`
 * can post any `from`/`to` they like and reach no registration read.
 *
 * ── THE DATES ARE VALIDATED HERE, WHERE THE UNTRUSTED STRINGS ARRIVE ───────
 * `resolveCustomWindow` is the one rule (see its header for the case table). It
 * returns instants or null; nothing downstream ever parses a date, so there is
 * one place a bad date can be handled and one place to read to know what happens
 * to one.
 *
 * @param {'today'|'week'|'month'|'all'} range — preset window. Client-supplied,
 *   and deliberately inert for a caller without `dashboard_registrations`.
 * @param {string} [from] — 'YYYY-MM-DD', a BANGKOK date. Untrusted.
 * @param {string} [to]   — 'YYYY-MM-DD', a BANGKOK date, INCLUSIVE. Untrusted.
 */
export async function getDashboardMetrics(range = DEFAULT_RANGE, from = '', to = '') {
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

  /**
   * Resolved AFTER the scope check and BEFORE any read. A caller without the
   * registration scope never reaches a registration query whatever this returns,
   * so the work is wasted for them and harmless — but it is also the only place
   * these two strings are interpreted, which is the property worth having.
   */
  const custom = resolveCustomWindow({ from, to });

  return serialize(await buildDashboardMetrics({ scopes, range, custom, models: MODELS }));
}
