'use client';

import { useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterParamKey, isDefaultFilterValue } from '@/lib/registrations/filterScope';
import {
  buildStatCards,
  isSystemSet,
  statusLabel,
  statusesForSource,
} from '@/lib/registrations/statuses';
import { ListPanel } from './ListPanel';
import { FilterPanel } from './FilterPanel';
import { PublicTable } from './PublicTable';
import { InhouseTable } from './InhouseTable';

// ── Constants ──────────────────────────────────────────────────────

/**
 * ONE MODULE, TWO SUBSETS — NEITHER WRITTEN HERE.
 *
 * The two vocabularies used to be two modules aliased apart in this file,
 * because in-house stored new / contacted / quoted / closed-won / closed-lost
 * and public stored pending / confirmed / paid / cancelled. Round 2 collapsed
 * in-house onto the same three values public already uses, so there is now one
 * module with a per-source SUBSET — and `statusesForSource` is the only place
 * `source` turns into a list.
 *
 * The subsets stay distinct even though the module is shared: `paid` is PUBLIC
 * ONLY, and merging the two lists is how a `ชำระแล้ว` card would appear over a
 * collection that can never hold one. That is the same rule this screen already
 * had to learn — no branch may render a value the data does not hold.
 *
 * The public side used to be three hand-written lists in this file — the filter
 * options, the label map and the stat-card literal — which is the same shape
 * that had already drifted on the in-house side.
 */
const RANGE_OPTIONS = [
  { value: 'all',   label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'week',  label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
];

/**
 * The two tabs, keyed by the `source` value each navigates to.
 *
 * These are COLLECTION discriminators, not statuses — `getModel` in
 * lib/actions/registrations.js reads the same two values — so writing them here
 * is not the hand-written-vocabulary shape the status lists were. There is no
 * module to derive them from and inventing one for a two-member closed set that
 * the router also has to know would be indirection for its own sake.
 */
const SOURCE_TABS = [
  { value: 'public',  label: 'Public' },
  { value: 'inhouse', label: 'In-house' },
];

/*
 * NO STATUS_LABEL AND NO STATUS_BADGE MAP IN THIS FILE ANY MORE.
 *
 * Both were derived-then-cached locals: `buildStatusLabels()` for the text and
 * a hand-written literal for the colour. The label map was already derived; the
 * COLOUR was not, and it was the last hand-written status list on this screen.
 *
 * Both are now single function calls — `statusLabel(v)` and `statusBadge(v)` —
 * which also folds the `?? 'bg-slate-100 text-slate-600'` fallback that used to
 * sit at every call site into the module, where there is one of it.
 *
 * `statusLabel` survives HERE for two reasons and neither of them is a cell: the
 * lock sub-line under the overview title, and the panel's "filtered by" line.
 * Both name a status in a SENTENCE, and a sentence is exactly where a
 * hand-written label would look harmless.
 *
 * SCHEDULE_BADGE and `fmtDate` have gone with the table they served —
 * PublicTable.jsx and tableParts.jsx respectively. Neither was ever a status
 * map: SCHEDULE_BADGE is keyed by `scheduleType`, a course-schedule property
 * with its own vocabulary, and it must not acquire an entry in the status
 * module.
 */

/**
 * THE DETAIL ROUTE FOR A ROW — and there are two of them, not one.
 *
 * This list renders BOTH collections: `source` picks which one, and each has
 * its own fully-built detail page. `/admin/registrations/[id]` reads
 * `register_public`; `/admin/registrations/inhouse/[id]` reads
 * `register_inhouse`. They are separate collections, so an in-house `_id` sent
 * to the public route finds nothing and the page calls `notFound()` — a 404 on
 * a record that exists, with a working page sitting one segment away.
 *
 * `source` is the same value the list query used to choose the model, so the
 * link cannot disagree with the row it is attached to.
 */
function detailHref(source, id) {
  return source === 'inhouse'
    ? `/admin/registrations/inhouse/${id}`
    : `/admin/registrations/${id}`;
}


// ── Main Component ─────────────────────────────────────────────────

/**
 * ── THE FILTERS ARE PROPS. THERE IS NO FILTER STATE IN THIS FILE. ───────────
 *
 * `source`, `status`, `q` and `range` are derived from the URL by page.jsx on
 * every render and passed straight down. None of them is copied into
 * `useState`, and the prop names deliberately no longer start with `initial` —
 * that prefix is what invites the copy.
 *
 * ── THE DEFECT THIS SHAPE REMOVES ───────────────────────────────────────────
 * They WERE `useState(initialSource)` and friends, seeded once. On a
 * client-side navigation to the same route — clicking the sidebar's bare
 * `/admin/registrations` while sitting on `?source=inhouse`, or pressing Back —
 * React preserves the component instance, so the props updated and the state did
 * not. The result was measured: the header read "Public — 39" and the rows were
 * real public records, while the toggle, the summary cards and the COLUMNS were
 * all still in-house. Every in-house column rendered an em-dash over a public
 * document and the สถานะ cell showed `confirmed`, which is not a value an
 * in-house enquiry can hold.
 *
 * That is the same rule this screen already had to learn once, in InhouseTable:
 * NO BRANCH MAY RENDER A VALUE THE DATA DOES NOT HOLD. A stale `source` makes
 * the whole table such a branch.
 *
 * The second-order effect was worse than the display. `navigate` re-serialises
 * the filters into the next URL, so a stale value was WRITTEN BACK — the lie
 * became the real filter on the following click.
 *
 * ── CONFORMANCE, NOT INVENTION ──────────────────────────────────────────────
 * AuditLogClient, WebhookLogsClient and DashboardClient already do exactly this:
 * filters arrive as props, render directly, and are re-serialised from props in
 * `navigate`. This file is brought into line with them.
 *
 * The one thing that cannot be a prop is the search box's in-progress text,
 * because the user is typing it and no navigation has happened yet. It is an
 * UNCONTROLLED input instead — `defaultValue` plus a `key`, read out of the form
 * on submit. The `key` is what keeps it honest: when the URL's `q` changes the
 * input is a new element, so it cannot go on showing a term the list is not
 * filtered by. That input now lives in ListPanel, unchanged.
 *
 * ── THE STATUS CHIP ROW IS GONE, AND THAT IS NOT AN OMISSION ────────────────
 * There used to be a row of filter chips under the summary strip — ทั้งหมด,
 * then one per status — and it duplicated the overview CARDS one for one: the
 * same statuses, the same navigate targets, the same selected state, with the
 * ทั้งหมด card doing exactly what the ทั้งหมด chip did. Two controls for one
 * filter is two things to keep in step and one of them to eventually forget,
 * which is the drift this screen has already been rebuilt around twice.
 *
 * The cards win because they carry the COUNT as well as the label, and the
 * section sub-line now says out loud that clicking one filters the list. No
 * capability was removed: every URL the chips could produce, a card produces.
 */
export function RegistrationsClient({
  initialData,
  status = 'all',
  q      = '',
  source = 'public',
  range  = 'all',
  counts,
  // Both tabs' numbers, keyed by source value. Built in page.jsx from the
  // counts the strip already needed plus ONE extra query for the other side.
  sourceTotals = {},
  lastEdited = {},
  // Built server-side in page.jsx and only for source=inhouse; null on a public
  // render, where nothing reads it.
  courseNames = null,
  /**
   * ROUND 8'S TWO FILTERS, DERIVED FROM THE URL BY page.jsx AND PASSED AS PROPS
   * — never copied into state here. See the file header's rule and
   * test/fs/urlFilterNoState, which enumerates this file BY PATH.
   *
   * `from`/`to` arrive as the raw strings; `dateWindow` is the RESOLVED value —
   * parsed dates, the selected preset, and whether a backwards range was
   * swapped. The chrome reads the resolver rather than re-deciding what a date
   * is, which is the same single-source rule the query follows.
   */
  from = '',
  to = '',
  course = '',
  dateWindow = { custom: false, preset: 'all', from: null, to: null, swapped: false },
  courseOptions = [],
}) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  /**
   * EVERY FILTER WRITE GOES INTO THE CURRENT SOURCE'S NAMESPACE — ROUND 10.
   *
   * `from`, `to` and `course` joined the set in round 8, and the reason still
   * holds: every dimension has to be here, or an override of one would leave the
   * others in the URL from the previous navigation while the props say
   * otherwise. They are named in `next` so that an override CAN clear them.
   *
   * ── `source` HAS LEFT THIS SET, AND THAT IS THE CHANGE ───────────────────
   * It is not a filter — it selects the collection, the same reasoning
   * `SCOPE_PARAMS` gives for excluding it from the query scope. It now has its
   * own navigator below, which touches nothing else.
   *
   * ── THE PROPS STAY BARE, AND THE NAMESPACE IS APPLIED HERE ───────────────
   * `q`, `status`, `range`, `from`, `to` and `course` arrive as ordinary props
   * with ordinary names; page.jsx did the reading. Only the URL KEY is
   * namespaced, at the one moment it is written. That is deliberate: the
   * namespace is a URL concern and prefixing the PROPS would have renamed six
   * identifiers that fs/urlFilterNoState enumerates, for no gain.
   */
  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = { page: '1', status, q, range, from, to, course, ...overrides };
    Object.entries(next).forEach(([name, v]) => {
      const key = filterParamKey(name, source);
      if (v == null || isDefaultFilterValue(name, v)) params.delete(key);
      else params.set(key, String(v));
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router, status, q, source, range, from, to, course]);

  /**
   * SWITCHING SOURCE MOVES NO VALUES. It sets one parameter.
   *
   * ══ WHY THIS IS ITS OWN FUNCTION AND NOT `navigate({ source })` ═════════════
   *
   * `navigate` writes the CURRENT source's namespace from the current props. Ask
   * it to change `source` too and it would write this side's values into this
   * side's keys while the page renders the other side — correct by luck, and
   * wrong the moment anyone adds an override.
   *
   * More importantly there is nothing to write. Public's filters live in the
   * bare names and in-house's live under `inhouse.`, so BOTH SETS ARE ALREADY IN
   * THE URL and correct. Switching is one key.
   *
   * ── WHAT THIS DELETED, AND IT WAS TWO REAL WARTS ─────────────────────────
   * The toggle used to navigate with `{ source, page: '1', status: 'all' }`.
   *
   * `status: 'all'` was there because the two vocabularies are different subsets
   * and carrying `paid` to in-house produced an empty list — so switching
   * DESTROYED the public status, and switching back did not bring it home. Each
   * side now keeps its own and nothing is discarded on the way.
   *
   * `page: '1'` was there because page 3 of public is not page 3 of in-house.
   * `page` is namespaced too, so each side keeps its own place.
   */
  const switchSource = useCallback((value) => {
    const params = new URLSearchParams(searchParams.toString());
    // 'public' is the default and is absent from the URL, exactly as the default
    // of every namespaced filter is — one rule for what "not set" looks like.
    if (value === 'public') params.delete('source');
    else params.set('source', value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router]);

  // The term is read out of the form, not out of state — see the header.
  const handleSearch = (e) => {
    e.preventDefault();
    const term = String(new FormData(e.currentTarget).get('q') ?? '');
    navigate({ q: term, page: '1' });
  };

  /**
   * THE FILTER PANEL'S TWO HANDLERS.
   *
   * Read out of the FORM, exactly as the search term is, and for the same
   * reason: nothing about a filter lives in `useState` on this screen. The panel
   * renders from props and reports what its inputs hold at submit.
   *
   * ── APPLYING A CUSTOM RANGE CLEARS `range`, AND THAT IS THE (a) DECISION ──
   * The chips are PRESETS over one window: `from`/`to` win when either is set,
   * so leaving a stale `range` in the URL would put a lit chip above a table
   * filtered to something else. Clearing it is what makes "one value, two ways
   * in" true in the URL and not only in the resolver.
   *
   * Conversely a chip click already clears `from`/`to`, because `RANGE_CHIPS`
   * navigates with `{ range }` and the generic rule above deletes the empty
   * defaults — the two directions are symmetric without a second branch.
   */
  const handleFilters = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const nextFrom = String(data.get('from') ?? '');
    const nextTo   = String(data.get('to') ?? '');
    navigate({
      from: nextFrom,
      to: nextTo,
      course: String(data.get('course') ?? ''),
      range: (nextFrom || nextTo) ? 'all' : range,
      page: '1',
    });
  };

  const handleClearFilters = () => navigate({ from: '', to: '', course: '', page: '1' });

  const { items, page, pageCount, pageSize, total } = initialData;
  // `{}`, not a hand-written zero-filled object. That fallback was a fourth
  // spelling of the public enum — and it was the WRONG enum on an in-house
  // render. The card already reads `statCounts[key] ?? 0`, so an empty object
  // produces the same zeroes for whichever collection is showing.
  const statCounts = counts ?? {};
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? 'ทั้งหมด';

  /**
   * EVERY LIST ON THIS SCREEN COMES FROM ONE ARRAY — see
   * src/lib/registrations/statuses.js.
   *
   * The in-house cards and chips were two hand-written lists fifteen lines
   * apart and they had drifted: the cards had five entries and no
   * `ส่งใบเสนอราคาแล้ว`, the chips had six and did. A record in that status was
   * counted in ทั้งหมด and displayed by nothing, so the strip read 6 over cards
   * summing to 5.
   *
   * Public had the identical shape and had not yet been bitten. Deriving both
   * sides makes a card-without-a-chip unrepresentable in either — and there are
   * no chips left to disagree with the cards at all now.
   */
  const sourceStatuses = statusesForSource(source);
  const statCards      = buildStatCards(sourceStatuses);

  /**
   * THE LOCKED STATUSES, AND WHY THE LOCK IS ON THE CARD AND NOT ON THE CHIP.
   *
   * The design renders the lock INSIDE the status label in the table cell —
   * `ชำระแล้ว 🔒`. That is ruled out: the label comes from the shared module and
   * must stay the label, byte for byte, or the list, the summary card and the
   * detail header stop agreeing about what a status is called. A glyph welded
   * into it is a fifth spelling of the vocabulary.
   *
   * So the lock lives HERE, on the overview card, where it is an affordance
   * about a CONTROL rather than a decoration on a value: the card is clickable,
   * and the lock says the state behind it is one the system assigns and an admin
   * cannot pick. The sub-line under the section title says the same thing in
   * words.
   *
   * WHICH statuses are locked is asked of the transition table, never named —
   * see `isSystemSet`. For public it resolves to `paid` alone; for in-house it
   * resolves to nothing, because `paid` is not in that vocabulary.
   */
  const lockedLabels = sourceStatuses
    .filter((s) => isSystemSet(s.value, source))
    .map((s) => statusLabel(s.value));

  const overviewSubLine = [
    'คลิกการ์ดเพื่อกรองรายการตามสถานะ',
    lockedLabels.length ? `${lockedLabels.join(' / ')} ระบบกำหนดให้เอง เลือกเองไม่ได้` : '',
  ].filter(Boolean).join(' · ');

  /**
   * The panel's sub-line: what the list below is currently filtered BY.
   *
   * Built from the same four props `navigate` re-serialises, so it cannot
   * describe a filter the query is not using. The status half is rendered
   * through `statusLabel` rather than written out — a hand-written label here
   * would be the drift this screen keeps removing, arriving in a sentence
   * instead of in a list.
   */
  const panelSubLine = [
    source === 'inhouse' ? 'In-house' : 'Public',
    rangeLabel,
    status !== 'all' ? statusLabel(status) : '',
    q ? `“${q}”` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-[22px] pt-[24px]">

      {/* ── Source toggle: 269×50, 5px padding, two 128×40 tabs, 3px gap ── */}
      <div className="flex h-[50px] w-[269px] items-center gap-[3px] rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[5px]">
        {SOURCE_TABS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => switchSource(s.value)}
            aria-pressed={source === s.value}
            className={cn(
              'flex h-[40px] w-[128px] items-center justify-center gap-[6px] rounded-9e-md text-[13px] font-semibold transition-colors',
              source === s.value
                ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <span>{s.label}</span>
            {/*
              THE BADGE FOR THE TAB THAT IS NOT SELECTED HAS ITS OWN QUERY, and
              it follows the SAME range filter as the cards below it — see
              getRegistrationTotal in lib/actions/registrations.js for why the
              mockup's raw totals are not what ships.

              `?? 0` rather than a conditional render: a tab whose badge vanished
              at zero would change width, and the reader would not know whether
              the count was zero or unknown.
            */}
            <span className={cn(
              'flex h-[18px] w-[21px] items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
              source === s.value
                ? 'bg-9e-ice/20 text-9e-ice'
                : 'bg-[var(--surface-border)] text-[var(--text-secondary)]'
            )}>
              {sourceTotals[s.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Overview section ── */}
      <section>
        {/* Header row: 38px = a 21px title line over a 17px sub-line. */}
        <div className="flex h-[38px] items-start justify-between">
          <div>
            <p className="h-[21px] text-[14px] font-bold leading-[21px] text-[var(--text-primary)]">
              ภาพรวม
            </p>
            <p className="h-[17px] text-[11px] leading-[17px] text-[var(--text-muted)]">
              {overviewSubLine}
            </p>
          </div>

          {/* Range chips: a 34px group with 3px padding and 3px gaps, each chip
              28px tall with 11px of horizontal padding. RIGHT-ALIGNED. */}
          <div className="flex h-[34px] shrink-0 items-center gap-[3px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[3px]">
            {/*
              ── THE CHIPS ARE PRESETS, AND THEY READ THE RESOLVER ────────────
              `dateWindow.preset`, NOT `range`. There is ONE window and two ways
              to fill it; when a custom from/to is in force the resolver returns
              `preset: null` and NO chip is lit. Reading `range` here would leave
              วันนี้ highlighted above a table filtered to last March — the exact
              two-controls-one-field disagreement option (a) exists to prevent.

              Clicking a chip clears `from`/`to`: `navigate` names every
              dimension, so passing the empty strings deletes them from the URL.
              The two directions are symmetric — see `handleFilters`.
            */}
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => navigate({ range: opt.value, from: '', to: '', page: '1' })}
                aria-pressed={dateWindow.preset === opt.value}
                className={cn(
                  'flex h-[28px] items-center rounded-9e-md px-[11px] text-[11px] font-semibold transition-colors',
                  dateWindow.preset === opt.value
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-9e-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/*
          THE COLUMN COUNT IS DERIVED FROM THE CARDS, not asserted alongside them.

          This was `grid-cols-5` while the in-house set is six cards long — which
          is why the sixth (ส่งใบเสนอราคาแล้ว) had nowhere to go and the strip was
          left summing to less than its own total. An inline
          `gridTemplateColumns` rather than a Tailwind class because Tailwind
          scans for whole class names: `grid-cols-${n}` is purged at build time
          and the grid silently collapses to one column.

          EQUAL FRACTIONS, keyed on the count, rather than the two measured
          widths. The design reads 280px per card for public's five and 352.5px
          for in-house's four — but those ARE the equal fractions of a 1440 row
          minus four and three 10px gaps, so hard-coding them would encode the
          container width as well as the ratio, and both numbers would be wrong
          the moment the sidebar collapsed.
        */}
        <div
          className="mt-[10px] grid gap-[10px]"
          style={{ gridTemplateColumns: `repeat(${statCards.length}, minmax(0, 1fr))` }}
        >
          {statCards.map(({ key, label, filterVal, cls }) => (
            <StatCard
              key={key}
              label={label}
              count={statCounts[key] ?? 0}
              accentCls={cls}
              selected={status === filterVal}
              locked={lockedLabels.includes(label)}
              onClick={() => navigate({ status: filterVal, page: '1' })}
            />
          ))}
        </div>
      </section>

      {/* ── The list ──
          IN-HOUSE GETS ITS OWN BODY. The columns below are the PUBLIC set and
          only the public set — an in-house document has no courseName, no
          coordinator, no attendeesCount and no payment — so rendering one
          through them produced a row of blanks with two cells that stated a
          confident falsehood instead. See InhouseTable.jsx for why that is a
          separate component and not a `source ===` test inside each cell.

          Both bodies now sit inside ONE ListPanel: the count, the search box and
          the pager are the same frame for either table, and neither table can
          reach them. */}
      <ListPanel
        total={total ?? 0}
        subLine={panelSubLine}
        q={q}
        /*
          THE ตัวกรอง DISCLOSURE, as a node. `ListPanel` is a shell and stays one
          — it renders the slot and never learns what a filter is, the same seam
          `children` is for the table. See FilterPanel for why round 3's ruling
          is SATISFIED here rather than reversed.
        */
        filters={(
          <FilterPanel
            dateWindow={dateWindow}
            course={course}
            courseOptions={courseOptions}
            onApply={handleFilters}
            onClear={handleClearFilters}
          />
        )}
        /*
          THE PLACEHOLDER NAMES THE FIELDS THE FILTER ACTUALLY SEARCHES, and the
          two filters do not search the same ones.

          Public matches courseName + coordinator name/email, so this label has
          been correct there throughout and is unchanged.

          ── IN-HOUSE GAINS หลักสูตร IN ROUND 10, AND ONLY NOW ─────────────────
          It was deliberately absent, and the reason it was absent is the reason
          this line is load-bearing: `coursesInterested` holds CODES, so naming
          หลักสูตร while no clause could match a typed NAME would have been an
          invitation to type a course and get nothing back. A placeholder is a
          promise about what the box does.

          The promise is now kept, and each of the four was checked against
          `searchClauses` in lib/registrations/listFilter before this string
          changed — บริษัท → companyName, ชื่อ → contactFirstName/contactLastName,
          อีเมล → contactEmail, หลักสูตร → coursesInterested by CODE and by
          resolved NAME. A test asserts the same four, from the same source.

          WHAT IT STILL CANNOT DO is search a course whose name will not resolve
          — ZZTEST-EXCEL-01 has no name anywhere in this system, so it is
          findable by code only. That is a gap in the DATA rather than a lie in
          this label, and it degrades to "no match on that term". See
          lib/registrations/inhouseCourseSearch.
        */
        placeholder={source === 'inhouse'
          ? 'ค้นหาบริษัท / ชื่อ / อีเมล / หลักสูตร'
          : 'ค้นหาชื่อ / อีเมล / หลักสูตร'}
        onSearch={handleSearch}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        onNavigate={navigate}
      >
        {source === 'inhouse' ? (
          /* No `lastEdited`: the in-house table does not render the audit hint —
             see its header. page.jsx does not even fetch it for this source. */
          <InhouseTable items={items} courseNames={courseNames} />
        ) : (
          <PublicTable
            items={items}
            lastEdited={lastEdited}
            /*
              BOUND TO THIS BRANCH'S SOURCE, so the table takes an id and gets
              back a route it cannot get wrong. `detailHref` exists to choose
              BETWEEN the two collections' pages — an in-house `_id` sent to the
              public route 404s on a record that exists — and the choice is
              already made by the `source ===` test above. Handing the table the
              two-argument form would hand it the decision as well.
            */
            detailHref={(id) => detailHref('public', id)}
          />
        )}
      </ListPanel>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

/**
 * One summary card: 82px tall, a 1px border, and a 4px accent bar INSET 1px
 * from the left running the full height minus 2px — so it sits inside the
 * border rather than painting over it.
 *
 * ── THE BAR REUSES THE VOCABULARY'S `accent` CLASS UNCHANGED ────────────────
 * `buildStatCards` hands down `border-l-4 border-l-amber-400` and friends, which
 * were written for a card whose whole left EDGE was the accent. A zero-width
 * element wearing a 4px left border is exactly a 4px bar, so the module needs no
 * new property and no second spelling of any colour: one status, one colour,
 * still. The alternative — a `bg-amber-400` map keyed by status — would be a
 * hand-written colour list in a list client, which is the thing commit 1 spent
 * itself removing.
 */
function StatCard({ label, count, accentCls, selected, locked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        /*
          ── `overflow-hidden` IS THE ACCENT BAR'S CLIP, AND IT WAS MISSING ────

          MEASURED FROM A CLICK-TEST: the 4px bar drew OUTSIDE the card's rounded
          corners, top-left and bottom-left.

          The cause is that nothing clipped it. The bar is absolutely positioned
          at left/top/bottom 1px — a straight rectangle — while the card's corner
          is a 16px arc (`9e-lg`), so for the first and last ~15px of its height
          the bar sits where the card is not. With no `overflow-hidden` on the
          card there was nothing to cut it off.

          The bar's own `rounded-l-9e-lg` was an attempt at the same thing and
          could never work, which is why this looked almost-right rather than
          obviously broken: on a 4px-wide box CSS reduces both horizontal radii
          to fit the box, scaling 16px down to ~2px. A 2px curve cannot follow a
          16px one. That class is deleted rather than tuned — a hand-picked
          radius on the bar would have to be re-picked every time the card's is.

          Clipping to the card means the bar's corners ARE the card's corners, by
          construction. `overflow` clips to the PADDING box with the inner radius,
          which is exactly the geometry's "inset 1px, inside the border, not over
          it".

          `overflow-hidden rounded-9e-lg border` is the same combination ListPanel
          already uses on this screen for the same reason.

          The `ring` below is unaffected: it is a box-shadow on this element, and
          `overflow` clips descendants, not an element's own shadow. The selected
          card keeps its outline — pinned by a compiled-CSS control, and on the
          click-test list.
        */
        'relative h-[82px] w-full overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] text-left transition-shadow hover:shadow-9e-sm',
        selected && 'ring-2 ring-9e-brand ring-offset-1'
      )}
    >
      {/*
        `aria-hidden` because it is a rule, not content — and because it is the
        one element on this screen that is EMPTY ON PURPOSE. The guard against
        dropped optional lines asserts that no element renders with no content,
        which is exactly what a decorative bar does; declaring it decorative is
        how the two are told apart, and it is the correct markup regardless.
      */}
      <span aria-hidden="true" className={cn('absolute bottom-[1px] left-[1px] top-[1px] w-0', accentCls)} />

      <span className="absolute left-[17px] top-[15.5px] flex h-[17px] items-center gap-[4px]">
        <span className="text-[11px] leading-[17px] text-[var(--text-muted)]">{label}</span>
        {/*
          THE LOCK, AND ONLY HERE. Never inside the status label — see
          `lockedLabels` in the component above. `title` rather than a visible
          second line, because the section sub-line already carries the sentence
          and repeating it on every card would crowd an 82px box.
        */}
        {locked ? (
          <Lock
            aria-hidden="true"
            className="h-[11px] w-[11px] shrink-0 text-[var(--text-muted)]"
          />
        ) : null}
      </span>

      <span className="absolute left-[17px] top-[32.5px] block h-[34px] text-[30px] font-bold leading-[34px] tabular-nums text-[var(--text-primary)]">
        {count}
      </span>
    </button>
  );
}
