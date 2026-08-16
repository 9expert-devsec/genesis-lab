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
    listRegistrations({ page, status, q, source, range }),
    getRegistrationStatusCounts({ range, source }),
    getRegistrationTotal({ range, source: otherSource }),
    source === 'inhouse' ? buildCourseNameMap() : Promise.resolve(null),
  ]);

  // ONE audit query for the whole page, never one per row. It has to follow the
  // list because it needs the ids the list actually returned — a page of 20 is
  // one $in of 20, served by {recordId:1, createdAt:-1} with no sort stage.
  //
  // `entity` mirrors `source`, which is why this page adds exactly ONE query
  // and not two: it renders one entity at a time.
  const lastEdited = await readLastEditedMap({
    user: session?.user ?? null,
    menu: 'registrations',
    entity: source === 'inhouse' ? 'inhouse' : 'public',
    recordIds: data.items.map((r) => String(r._id)),
  });

  return (
    <div className="mx-auto max-w-7xl">
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