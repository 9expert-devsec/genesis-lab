import { requirePage } from '@/lib/rbac/guard';
import {
  listRegistrations,
  getRegistrationStatusCounts,
  getRegistrationTotal,
  getRegistrationCourseOptions,
} from '@/lib/actions/registrations';
import { resolveDateWindow } from '@/lib/registrations/listFilter';
import { buildCourseNameMap } from '@/lib/api/courseNameMap';
import { readSourceFilters } from '@/lib/registrations/filterScope';
import { readLastEditedMap } from '@/lib/audit/readAuditLog';
import { RefreshOnNavigate } from '@/components/admin/RefreshOnNavigate';
import { RegistrationsClient } from './_components/RegistrationsClient';
import { normaliseStatusParam } from '@/lib/registrations/statuses';

export const metadata = { title: 'การลงทะเบียน' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const session = await requirePage('registrations');

  const sp     = (await searchParams) ?? {};
  const source = ['public', 'inhouse'].includes(sp.source) ? sp.source : 'public';

  /**
   * ══ EACH SOURCE'S FILTERS COME OUT OF ITS OWN NAMESPACE — ROUND 10 ══════════
   *
   * Public keeps the BARE parameter names and in-house is prefixed, so
   * `?q=excel&inhouse.q=acme&source=inhouse` holds both sets at once and
   * switching source is a one-parameter change that moves no values. See
   * lib/registrations/filterScope for why the namespace keys on source IDENTITY
   * rather than on which side is active, and what that costs.
   *
   * EVERY EXISTING LINK STILL WORKS: `?q=…&status=…&range=…` is public's, which
   * is exactly what it meant before.
   *
   * ── BOTH SETS ARE READ, NOT ONLY THE ACTIVE ONE ──────────────────────────
   * The toggle badge for the other side has to count under THAT side's filters —
   * see the `getRegistrationTotal` call below, where the reasoning changed with
   * this feature.
   */
  const active = readSourceFilters(sp, source);
  const otherSource = source === 'inhouse' ? 'public' : 'inhouse';
  const other  = readSourceFilters(sp, otherSource);

  const page   = Math.max(1, parseInt(active.page ?? '1', 10) || 1);
  const q      = active.q;
  const range  = ['today', 'week', 'month', 'all'].includes(active.range) ? active.range : 'all';

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
  const from   = active.from;
  const to     = active.to;
  const course = active.course;

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
  const status = normaliseStatusParam(active.status ?? 'all', source);

  /**
   * The other side's RANGE, normalised against the other side's own value.
   *
   * Its `status` is deliberately NOT read here: `getRegistrationTotal` takes no
   * status and never has. The badge is a SCOPE total — the same number the
   * ทั้งหมด card shows for the active side — and the status chip narrows the
   * table below it. Applying a status to one badge and not the other would make
   * the pair mean two different things.
   */
  const otherRange = ['today', 'week', 'month', 'all'].includes(other.range) ? other.range : 'all';

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
  const [data, counts, otherTotal, courseNames, courseOptions] = await Promise.all([
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
    /**
     * ══ THE OTHER SIDE'S BADGE NOW COUNTS UNDER THE OTHER SIDE'S FILTERS ══════
     *
     * REVERSED IN ROUND 10, and the old reasoning is worth stating because it
     * was right at the time. This used to take the ACTIVE source's `q`, `range`,
     * `from`, `to` and `course` — deliberately — so that a badge reading 8 could
     * not sit beside a ทั้งหมด card reading 1 under "7 วัน". One screen, one
     * question, one answer.
     *
     * With per-source filters that argument INVERTS. The badge is a promise
     * about what you will see if you click it, and clicking it now shows the
     * other side under ITS OWN remembered filters. Feeding it this side's
     * filters would make it count a set that no click can produce.
     *
     * The disagreement the old note feared is gone rather than tolerated: the
     * two badges answer two questions now, and each is labelled with the source
     * it belongs to.
     *
     * ── EVERY DIMENSION IS NAMED, NOT SPREAD, AND THAT IS ON PURPOSE ─────────
     * `{ ...other, source: otherSource }` would be shorter and would make
     * fs/registrationsFilterWiring VACUOUS: it reads this call's object literal
     * looking for each SCOPE_PARAM by name, and a spread satisfies the property
     * while defeating the matcher. That is defect 7 exactly — the guard would go
     * quiet without going red. Named keys keep it binding, and there is now an
     * assertion that no spread appears here.
     */
    getRegistrationTotal({
      q:      other.q,
      range:  otherRange,
      source: otherSource,
      from:   other.from,
      to:     other.to,
      course: other.course,
    }),
    source === 'inhouse' ? buildCourseNameMap() : Promise.resolve(null),
    /**
     * THE FILTER PANEL'S COURSE OPTIONS — from the REGISTRATIONS, not the
     * catalogue. See `getRegistrationCourseOptions` for why, and for what it
     * costs at today's size.
     *
     * A FIFTH PARALLEL QUERY, not a serial await tacked on: it joins the
     * Promise.all like the other source's total did, so the page still makes one
     * round of queries rather than one more round trip.
     *
     * It takes `source` and NOTHING ELSE — deliberately. The options must list
     * every course the collection holds, not only those matching the current
     * filters, or narrowing to one course would leave a select containing only
     * that course and no way back to the others.
     */
    getRegistrationCourseOptions({ source }),
  ]);

  /**
   * ══ THE IN-HOUSE DROPDOWN SHOWS NAMES — ROUND 10 ════════════════════════════
   *
   * In-house documents store CODES only (`coursesInterested` holds `course_id`
   * values), unlike public which carries `courseName` denormalised — so
   * `getRegistrationCourseOptions` can only return `label === code` for that
   * side, and the dropdown read as a list of SKUs.
   *
   * ── THE LABEL CHANGES; THE VALUE DOES NOT ────────────────────────────────
   * `code` is untouched. It is what the documents hold, what `?course=` means
   * and what `courseClause` matches — changing it would break every existing
   * link and every bookmark for a cosmetic gain.
   *
   * ── WHAT IT COSTS: NOTHING NEW ───────────────────────────────────────────
   * ZERO additional lookups. `buildCourseNameMap` is ALREADY fetched above for
   * the in-house table's course column, in the same `Promise.all`, and it is
   * ONE `listPublicCourses()` covering the whole catalogue — never one
   * `getCourseByCode` per distinct code, which at today's 7 would be 7 live
   * requests per render and up to a second each on a case miss. This is a join
   * against a map already in hand.
   *
   * ── A CODE THAT DOES NOT RESOLVE STILL APPEARS ───────────────────────────
   * Labelled with its code. `ZZTEST-EXCEL-01` is the live case — in the
   * registrations, not in the catalogue — and round 6 measured the general shape
   * at 26 of 39 registrations holding a round the schedule endpoint would not
   * return. AN OPTION LIST THAT DROPS WHAT IT CANNOT NAME HIDES ROWS WHILE
   * LOOKING COMPLETE, which is the worst available outcome: the rows exist, the
   * filter cannot reach them, and nothing says so.
   *
   * ── AND AN OUTAGE DEGRADES TO CODES, NOT TO AN EMPTY LIST ────────────────
   * `buildCourseNameMap` catches its own failure and returns `{}`, so every
   * label falls back to its code and the dropdown still works. It cannot block
   * the page: it is one member of a `Promise.all` that already cannot reject.
   *
   * Lower-cased key, matching how the map is built — see `resolveCourseNames`
   * for why a case-insensitive LOCAL lookup is safe and is not the upstream
   * casing bug.
   */
  const labelledCourseOptions = source === 'inhouse' && courseNames
    ? courseOptions.map((o) => ({
        ...o,
        label: courseNames[String(o.code).toLowerCase()] || o.code,
      }))
    : courseOptions;

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
        /*
          ── THE CHROME READS THE SAME RESOLVER THE QUERY DOES ────────────────
          `dateWindow` is `resolveDateWindow`'s return value, not a second
          opinion formed here: the parsed dates, the preset the chips should
          light, and whether a backwards range was swapped. The query calls the
          same function through `buildRegistrationScope`.

          That is the round-2 two-layer rule applied to a value that is not an
          enum. The page cannot normalise a date against a literal list, so
          instead of validating it here it shows what the RESOLVER decided —
          which is by construction what the query did.
        */
        from={from}
        to={to}
        course={course}
        dateWindow={resolveDateWindow({ range, from, to })}
        courseOptions={labelledCourseOptions}
      />
    </div>
  );
}