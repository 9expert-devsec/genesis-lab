import { getDashboardMetrics } from '@/lib/actions/dashboard';
import { ADMIN_SCHEDULE_STATUSES, getAllSchedules } from '@/lib/api/schedules';
import { requirePage } from '@/lib/rbac/guard';
import { dashboardScopes } from '@/lib/dashboard/scopes';
import { DEFAULT_RANGE, normaliseRange } from '@/lib/dashboard/ranges';
import { DashboardClient } from './_components/DashboardClient';

export const metadata = { title: 'แดชบอร์ด' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const sp = (await searchParams) ?? {};

  /**
   * ── THE GUARD RUNS BEFORE THE SEARCH PARAM IS TRUSTED FOR ANYTHING ───────
   * `requirePage('dashboard')` still gates the PAGE and is not weakened by the
   * scopes; it either returns a session or redirects. The scopes then NARROW
   * what that session may see, and they are read from the session alone — never
   * from `sp`, never from a prop.
   */
  const session = await requirePage('dashboard');
  const scopes = dashboardScopes(session?.user);

  /**
   * ── THE RANGE CONTROL BELONGS TO THE REGISTRATION SCOPE ──────────────────
   * `range` is resolved to null for a caller without it, so there is nothing to
   * pass down and no control to draw. That is belt-and-braces rather than the
   * enforcement: even a non-null range reaches no registration read, because
   * getDashboardMetrics decides which halves run from the session before it
   * looks at its argument. This line makes the URL parameter inert in the
   * PAYLOAD too — a system-only admin's page carries no evidence that a range
   * was ever asked for.
   */
  const range = scopes.registrations ? normaliseRange(sp.range) : null;

  /**
   * THE CUSTOM DATES BELONG TO THE REGISTRATION SCOPE, like the range control.
   *
   * Read as RAW STRINGS and passed on untouched — the action validates them,
   * where they arrive, and this page must not become a second place that decides
   * what a date is. Resolved to '' for a caller without the scope so a from/to
   * in their URL leaves no trace in the payload, exactly as `range` does.
   */
  const from = scopes.registrations ? String(sp.from ?? '') : '';
  const to   = scopes.registrations ? String(sp.to   ?? '') : '';

  /**
   * The open-rounds tile is part of the ภาพรวมระบบ strip, so its upstream fetch
   * belongs to `dashboard_system` and MUST NOT RUN without it. It is the one
   * read on this page that is not a Mongo query, and skipping it is the same
   * ruling as skipping a wave of counts: not fetched then filtered — not
   * started. A registration-only admin makes no call to MSDB at all.
   *
   * status: all — same reason as the admin schedules table (see
   * app/admin/schedules/page.jsx). Without it this reads the PUBLIC-filtered
   * feed, so the dashboard tile counted fewer rounds than the table an admin
   * reaches by clicking it: a round set to เต็ม left the count but stayed in
   * the grid. Two admin surfaces disagreeing about how many rounds exist is
   * worse than either number alone.
   *
   * includeStarted — the public surfaces now drop a round the moment its first
   * training day arrives. This tile is an ADMIN count and must not move: an
   * admin manages rounds that have started and rounds that have finished, and
   * this number has to keep agreeing with the /admin/schedules table it links
   * to. Two admin surfaces disagreeing about how many rounds exist is exactly
   * what `status: all` was added to stop.
   */
  const [metrics, schedulesRes] = await Promise.allSettled([
    // `?? DEFAULT_RANGE` for the system-only caller, whose `range` is null. The
    // value is inert for them — the action decides which halves run from the
    // session before it looks at its argument — but it must be a VALID range
    // rather than undefined, and it must not be a second copy of the default.
    getDashboardMetrics(range ?? DEFAULT_RANGE, from, to),
    scopes.system
      ? getAllSchedules({ status: ADMIN_SCHEDULE_STATUSES, includeStarted: true })
      : Promise.resolve(null),
  ]);

  const data = metrics.status === 'fulfilled' ? metrics.value : null;

  /**
   * `null`, not `0`, without the system scope — and the difference matters on
   * the wire. `0` is a figure; it would sit in the payload asserting that this
   * admin has been told there are no open rounds. `null` is the absence of an
   * answer, and DashboardClient draws no tile for it.
   */
  const openSchedulesCount = scopes.system
    ? (schedulesRes.status === 'fulfilled' ? (schedulesRes.value?.items?.length ?? 0) : 0)
    : null;

  return (
    <DashboardClient
      data={data}
      openSchedulesCount={openSchedulesCount}
      initialRange={range}
      initialFrom={from}
      initialTo={to}
    />
  );
}
