import { requirePage } from '@/lib/rbac/guard';
import { listRegistrations, getRegistrationStatusCounts, getRegistrationTotal } from '@/lib/actions/registrations';
import { buildCourseNameMap } from '@/lib/api/courseNameMap';
import { readLastEditedMap } from '@/lib/audit/readAuditLog';
import { RefreshOnNavigate } from '@/components/admin/RefreshOnNavigate';
import { RegistrationsClient } from './_components/RegistrationsClient';
import { normaliseStatusParam } from '@/lib/registrations/statuses';

export const metadata = { title: 'การลงทะเบียน' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const session = await requirePage('registrations');

  const sp     = (await searchParams) ?? {};
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q      = sp.q      ?? '';
  const source = ['public', 'inhouse'].includes(sp.source) ? sp.source : 'public';
  const range  = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';

  /**
   * THE CUSTOM RANGE AND THE COURSE — read raw, normalised by the RESOLVER.
   *
   * ── DELIBERATELY NOT VALIDATED HERE, AND THAT IS NOT AN OMISSION ─────────
   * `status`, `source` and `range` are small closed enums, so the page can
   * normalise them against a literal list and the CHROME then agrees with the
   * rows. A date and a course code are not: there is no list of valid dates, and
   * the valid courses are whatever the collection happens to hold.
   *
   * So the two layers split differently for these. The QUERY degrades in
   * `resolveDateWindow` / `courseClause` — an unparseable date and an empty
   * course add no clause — and the CHROME reads the same resolver rather than a
   * second opinion written here. A `parseDateInput` call in this file would be a
   * third place that decides what a date is.
   *
   * They are passed through as strings for that reason. The panel commit renders
   * the chrome from `resolveDateWindow`'s return value, which is where the
   * swapped-range flag lives too.
   */
  const from   = typeof sp.from   === 'string' ? sp.from   : '';
  const to     = typeof sp.to     === 'string' ? sp.to     : '';
  const course = typeof sp.course === 'string' ? sp.course : '';

  /**
   * THE SAME TREATMENT `source` AND `range` ALREADY GET, and it was the one
   * param not getting it.
   *
   * `status` went straight through, so `?status=closed-won` — a value round 2
   * retired, sitting in bookmarks and still-open tabs — reached the query as a
   * clause matching nothing and rendered an EMPTY LIST. Empty reads as lost
   * data, not as a stale bookmark.
   *
   * Normalising to 'all' here is the SCREEN half: it makes the ทั้งหมด chip and
   * the total card render as the selected one, so the controls agree with the
   * rows. `buildRegistrationFilter` degrades the QUERY independently, because
   * `listRegistrations` is a `'use server'` export and can be called without
   * ever passing through this page.
   *
   * It is normalised AFTER `source`, and must be: the two vocabularies are
   * different subsets, so `?status=paid&source=inhouse` is unrecognised while
   * `?status=paid` alone is fine.
   */
  const status = normaliseStatusParam(sp.status ?? 'all', source);

  /**
   * THE SOURCE THAT IS NOT SELECTED, so its toggle tab can carry a count too.
   *
   * `getRegistrationStatusCounts` already answers this for the SELECTED source
   * — the toggle reads `counts.total` — so only the other one needs asking, and
   * it needs exactly one number rather than a per-status breakdown.
   *
   * IT TAKES THE SAME `range`. The mockup shows raw totals in the toggle, and a
   * badge reading 8 beside a ทั้งหมด card reading 1 under "7 วัน" is the screen
   * giving two answers to one question — the defect class this page has shipped
   * twice already. See getRegistrationTotal's own note.
   */
  const otherSource = source === 'inhouse' ? 'public' : 'inhouse';

  // The course map is only wanted by the in-house body, so a public render does
  // not ask for it at all — and it joins the existing Promise.all rather than
  // adding a serial await. So does the other source's total: it is a fourth
  // PARALLEL query, never a sequential await tacked on after the list resolves.
  const [data, counts, otherTotal, courseNames] = await Promise.all([
    // `range` goes to BOTH queries. It used to reach only the counts, so the
    // date chips filtered the summary cards and left the table below them
    // showing everything — see buildRegistrationFilter in
    // src/lib/registrations/listFilter.js.
    listRegistrations({ page, status, q, source, range, from, to, course }),
    /**
     * ── `q` REACHES THESE TWO NOW, AND IT NEVER DID BEFORE ──────────────────
     *
     * The stat cards and the toggle badges had NEVER followed the search box:
     * this call was `{ range, source }`. Type a name and the table filtered to
     * one row under cards still reading 39 — one screen answering one question
     * two ways, which is the fourth time this list has produced that defect.
     *
     * It survived because every guard over this seam ENUMERATED FILTERS BY
     * NAME — tests that `range` reaches the list, the counts, the total — and
     * none asked whether the SET was the same in all four places. `SCOPE_PARAMS`
     * in lib/registrations/listFilter is now that set, and
     * fs/registrationsFilterWiring reads it instead of naming dimensions.
     *
     * THE OTHER SOURCE TAKES IT TOO. Its badge sits beside the selected one and
     * a raw 8 next to a searched 1 is the same disagreement one control over.
     * The two sources search DIFFERENT fields — `buildRegistrationScope` picks
     * them from `source`, so each badge counts what its own table would show.
     */
    getRegistrationStatusCounts({ q, range, source, from, to, course }),
    getRegistrationTotal({ q, range, source: otherSource, from, to, course }),
    source === 'inhouse' ? buildCourseNameMap() : Promise.resolve(null),
  ]);

  /**
   * ONE audit query for the whole page, never one per row — and NONE AT ALL on
   * an in-house render.
   *
   * It has to follow the list because it needs the ids the list actually
   * returned: a page of 20 is one `$in` of 20, served by
   * `{recordId:1, createdAt:-1}` with no sort stage. That makes it the page's
   * only SERIAL query, which is why not running it is worth something.
   *
   * ── WHY IT IS SKIPPED FOR IN-HOUSE ──────────────────────────────────────
   * The in-house table no longer renders `LastEditedHint` — ruled out after it
   * was seen in place. Fetching it anyway would be a round trip per page load
   * for data nothing displays, which is the same rule this screen already
   * applies to its PROJECTIONS: a superset of what the render needs is dead
   * weight over the wire, and a test asserts that equality for both tables.
   *
   * Expressed as the same shape `buildCourseNameMap` already uses two blocks
   * up — a per-source ternary — rather than as a new kind of conditional.
   */
  const lastEdited = source === 'inhouse'
    ? {}
    : await readLastEditedMap({
        user: session?.user ?? null,
        menu: 'registrations',
        entity: 'public',
        recordIds: data.items.map((r) => String(r._id)),
      });

  return (
    /*
      ── `-mt-6` CANCELS THE ADMIN SHELL'S TOP PADDING ───────────────────────

      THE DEAD BAND ABOVE THE EYEBROW WAS THE SHELL'S `p-6`, NOT AN EMPTY
      ELEMENT. `AdminContentWrapper` wraps every admin page that is not a
      full-height editor in `p-6`, so the 24px it contributes stacked with this
      page's own `pt-[34px]` and put the eyebrow 58px down instead of 34px.

      `RefreshOnNavigate` was the other candidate and is not it: it `return null`s
      and emits nothing at all.

      ONLY THE TOP IS CANCELLED. The same `p-6` supplies this page's left, right
      and bottom padding, which it still wants — so this is a negative margin
      rather than an opt-out from the wrapper, and the geometry's 34px stays
      stated ONCE, on the header below, where it can be read against the design.

      THE COUPLING IS REAL AND IS PINNED. `-mt-6` only cancels `p-6` while the
      shell says `p-6`; if that ever changes this silently drifts. A test asserts
      the wrapper's padding class and this negative margin agree, so the two
      cannot move apart quietly.
    */
    <div className="mx-auto -mt-6 max-w-7xl">
      {/*
        `dynamic = 'force-dynamic'` above keeps the SERVER fresh; it does not
        reach the client Router Cache, which is what served a list missing a
        just-created row while the same URL under F5 showed it. See the cost and
        the no-flash reasoning in the component.
      */}
      <RefreshOnNavigate />

      {/*
        ── THE PAGE HEADER, AT THE MEASURED RHYTHM ─────────────────────────────
        34px below the top of the container, then a block exactly 100px tall:
        an eyebrow line of 15px, the H1 block of 42px and the subtitle block of
        21px, with the remaining 22px split as two 11px gaps. 15+11+42+11+21.

        The three heights are ABSOLUTE because vertical rhythm does not reflow —
        only the COLUMN widths further down are proportional, so the page keeps
        its measure when the admin sidebar collapses.

        Every value is written out as a complete Tailwind class. None is
        assembled, because an assembled arbitrary value produces correct markup
        and no CSS at all — see the compile-through-Tailwind guard in
        test/fs/tailwindArbitraryValueRules.test.mjs, which now harvests these
        classes out of the RENDERED markup and asserts each one emits a rule.
      */}
      <header className="pt-[34px]">
        <p className="h-[15px] text-[11px] font-semibold uppercase leading-[15px] tracking-[0.08em] text-[var(--text-muted)]">
          ระบบจัดการ
        </p>
        <h1 className="mt-[11px] h-[42px] text-[28px] font-bold leading-[42px] text-[var(--text-primary)]">
          การลงทะเบียน
        </h1>
        <p className="mt-[11px] h-[21px] text-[14px] leading-[21px] text-[var(--text-secondary)]">
          {source === 'inhouse' ? 'In-house' : 'Public'} — {data.total} รายการทั้งหมด
        </p>
      </header>

      {/*
        The filters go down as PLAIN NAMES, not `initial*`. They are derived
        from searchParams above on every render and the client renders straight
        from them — see the header of RegistrationsClient for what the `initial`
        prefix cost when they were seeded into useState instead.
      */}
      <RegistrationsClient
        initialData={data}
        status={status}
        q={q}
        source={source}
        range={range}
        counts={counts}
        /*
          Both tabs' numbers, keyed by the value the tab navigates to, so the
          toggle reads one map rather than deciding which of two props belongs
          to which tab. The selected tab's number is the SAME `counts.total` the
          ทั้งหมด card renders — one query, two consumers, so the two cannot
          disagree.
        */
        sourceTotals={{ [source]: counts?.total ?? 0, [otherSource]: otherTotal }}
        lastEdited={lastEdited}
        courseNames={courseNames}
      />
    </div>
  );
}