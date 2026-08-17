import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';
import { SCHEDULE_STATUS } from '@/lib/scheduleStatus';
import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';

/**
 * THE `ตารางอบรมที่กำลังเปิดรับสมัคร` ROW, BELOW `md`.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * Each round rendered as a stacked card: a type pill on its own line, the course
 * name, the date, a status line, a price line, and a full-width `สมัครเรียน →`
 * button. Three of them filled a phone screen and this query returns eighteen.
 *
 * ── WHAT REPLACED IT ────────────────────────────────────────────────────────
 * The object /schedule's mobile card already settled on: a filled row with its
 * own border, a declared 44px tap floor, a type DOT instead of a type pill, the
 * name on one line and date/status/price on the next, an `active:` press state,
 * and a chevron. The row IS the registration link, so the button is gone — a
 * button inside a link is a second call to action for the same destination and a
 * focusable element nested in an anchor. Same call as the online-course card.
 *
 * ── AND THE DESKTOP FORM DID NOT MOVE ───────────────────────────────────────
 * `md` is where this component already flipped from stacked to horizontal, so
 * the split is at `md` and every viewport that renders the horizontal row today
 * renders the same computed layout after this change. Pinned by a golden at the
 * bottom of this file, for the same reason /schedule pins its table cells: the
 * risk is not a named class going missing, it is a SHARED helper edited for the
 * phone quietly changing the desktop too.
 */

const R = (el) => renderToStaticMarkup(el);

const COURSE = {
  _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop', course_price: 9000,
};

/** open / blank-status / no-link, which are the three shapes the row has. */
const SCHEDULES = {
  open:   { _id: 's1', dates: ['2026-10-17'], type: 'classroom', status: 'open',        course_ref: COURSE },
  near:   { _id: 's2', dates: ['2026-11-03'], type: 'hybrid',    status: 'nearly_full', course_ref: COURSE },
  blank:  { _id: 's3', dates: ['2026-11-09'], type: 'classroom', status: '',            course_ref: COURSE },
  /** No `_id` and no `signup_url` — scheduleRegistrationHref returns null. */
  unlinked: { dates: ['2026-11-11'], type: 'online', status: 'full', course_ref: COURSE },
};

const render = (keys = ['open'], term = 'zzz') => {
  const schedules = keys.map((k) => SCHEDULES[k]);
  return R(createElement(SearchResults, {
    status: 'ready',
    term,
    data: {
      counts: { ...emptySearchCounts(), schedules: schedules.length },
      total: schedules.length,
      results: {
        courses: [], onlineCourses: [], careerPaths: [], promotions: [], articles: [], schedules,
      },
    },
    requestedTab: 'all',
  }));
};

/**
 * The balanced `<div …>…</div>` beginning at `from`.
 *
 * A non-greedy regex cannot extract the desktop form: it contains a nested
 * `<div class="min-w-0 flex-1">`, so `[\s\S]*?<\/div>` stops at the INNER close
 * and every assertion downstream of it would be reading half a row. Depth
 * counting is the only correct reader here, and the control below proves it
 * really counts rather than returning the first close it finds.
 */
function divAt(html, from) {
  assert.ok(html.startsWith('<div', from), 'divAt was not pointed at a <div>');
  let i = from;
  let depth = 0;
  for (;;) {
    const open = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    assert.notEqual(close, -1, 'unbalanced markup — the extractor ran off the end');
    if (open !== -1 && open < close) {
      depth += 1;
      i = open + 4;
    } else {
      depth -= 1;
      i = close + 6;
      if (depth === 0) return html.slice(from, i);
    }
  }
}

/**
 * Every rendered round, as `{ compact, desktop }`.
 *
 * DEPENDS ON THE TWO FORMS BEING ADJACENT SIBLINGS inside one wrapper. If that
 * ever stops being true this throws rather than silently handing every test
 * below an empty string, which is the failure mode that makes a file of absence
 * assertions pass together.
 */
const rows = (html) => {
  const out = [];
  const marker = '<div class="md:hidden">';
  for (let at = html.indexOf(marker); at !== -1; at = html.indexOf(marker, at + 1)) {
    const compact = divAt(html, at);
    const rest = html.slice(at + compact.length);
    assert.ok(
      rest.startsWith('<div class="hidden flex-col'),
      'the desktop form must sit immediately after the compact one inside the wrapper',
    );
    out.push({ compact, desktop: divAt(rest, 0) });
  }
  assert.ok(out.length > 0, 'no schedule row rendered — this file has lost its subject');
  return out;
};

/**
 * The whole `<section>` for the schedule results, both forms included.
 *
 * The label is `ตารางอบรม` — the section was renamed from
 * `ตารางอบรมที่กำลังเปิดรับสมัคร`, whose 237px of unbreakable Thai overflowed
 * the 360px header row. The SHORT name is a substring of the long one, so this
 * matcher is anchored on the closing quote: an `aria-label="…ตารางอบรม"` probe
 * without it would still match the old heading and this file would go on
 * passing against a title that had never been renamed.
 */
const section = (html) => {
  const m = html.match(/<section[^>]*aria-label="ผลการค้นหา: ตารางอบรม"[\s\S]*?<\/section>/);
  assert.ok(m, 'the schedule section is gone');
  return m[0];
};

const unescapeHref = (s) => s.replace(/&amp;/g, '&');

// ── One link, no nested control ─────────────────────────────────────────────

test('the compact row is exactly one <a>, with nothing interactive inside it', () => {
  for (const { compact } of rows(render(['open', 'near', 'blank']))) {
    assert.equal((compact.match(/<a\s/g) ?? []).length, 1, 'the row must be one link');
    assert.equal((compact.match(/<button/g) ?? []).length, 0, 'and hold no nested control');
    assert.equal((compact.match(/<input/g) ?? []).length, 0);
  }
});

test('the สมัครเรียน button is gone from the compact row', () => {
  /**
   * SCOPED TO THE ROW, and that is not tidiness: the DESKTOP form still carries
   * the button, deliberately, so a page-level `includes('สมัครเรียน') === false`
   * would be red for a change that was never made.
   *
   * This test used to carry a second reason — the section heading was
   * `ตารางอบรมที่กำลังเปิดรับสมัคร`, which contains `สมัคร`, so even the SHORTER
   * probe had a false positive waiting for it in the copy. That half retired
   * with the rename to `ตารางอบรม`; the control below records which trap is
   * still live and which is not, so nobody re-derives the retired one.
   */
  for (const { compact } of rows(render(['open', 'near', 'blank']))) {
    assert.equal(compact.includes('สมัครเรียน'), false, 'no second call to action in the row');
    assert.equal(
      /bg-\[#005CFF\] px-3 py-1\.5/.test(compact), false,
      'nor the button styling it was wearing',
    );
  }
});

test('CONTROL: the สมัครเรียน probe DOES see the label where it still is', () => {
  /**
   * Two absences in a row need a positive. The desktop form is unchanged and
   * still carries the button, so it is the honest positive — and it is also the
   * live reason the probe above has to be scoped.
   */
  const html = render(['open']);
  const { desktop } = rows(html)[0];
  assert.ok(desktop.includes('สมัครเรียน'), 'the desktop form still has its button');
  assert.ok(
    section(html).includes('สมัคร'),
    'so the section as a whole still contains สมัคร — an unscoped probe would read it',
  );
  // The heading is no longer one of the places it can be read from. Asserted so
  // the retired trap is recorded rather than remembered.
  assert.equal(
    section(html).match(/<h2 class="[^"]*">([^<]*)<\/h2>/)[1].includes('สมัคร'), false,
    'the heading was renamed to ตารางอบรม and no longer contains สมัคร',
  );
});

// ── The affordances ─────────────────────────────────────────────────────────

test('the row carries a chevron, and it is decoration inside the link', () => {
  const { compact } = rows(render(['open']))[0];
  const circle = compact.match(/<span aria-hidden="true" class="([^"]*)">\s*<svg/);
  assert.ok(circle, 'the chevron wrapper must be aria-hidden — the link text is what is announced');
  assert.match(circle[1], /rounded-full/, 'a circle');
  assert.match(circle[1], /\bflex-none\b/, 'that a long date can never squeeze out');
  assert.match(compact, /lucide-chevron-right/, 'and a chevron in it');
});

test('the type is a DOT, not the full-width pill it replaced', () => {
  /**
   * `TYPE_COLOR.classroom` is `#00CCFF`. The desktop pill paints the SAME hex
   * with an alpha suffix (`#00CCFF1A`) as its background, so the probe has to be
   * anchored on the exact declaration or it would match the pill too — which is
   * the point of the control below.
   */
  const [classroom, hybrid] = rows(render(['open', 'near'])).map((r) => r.compact);
  const dot = (row) => row.match(/<span class="([^"]*)" style="background-color:(#[0-9A-Fa-f]{6})" aria-hidden="true">/);

  const c = dot(classroom);
  assert.ok(c, 'no type dot rendered');
  assert.equal(c[2], '#00CCFF', 'classroom keeps the colour the /schedule legend names');
  assert.match(c[1], /\brounded-full\b/, 'a circle');
  assert.match(c[1], /\bh-2\.5 w-2\.5\b/, 'dot-sized, not pill-sized');
  assert.match(c[1], /\bflex-none\b/);

  assert.equal(dot(hybrid)[2], '#8B5CF6', 'and hybrid its own');

  // The pill's chrome is gone from the compact row entirely.
  assert.equal(
    /rounded-full px-2\.5 py-1 text-\[11px\] font-bold/.test(classroom), false,
    'the type pill must not survive alongside the dot',
  );
});

test('CONTROL: the dot probe does not match the desktop type pill', () => {
  // Without this, "there is a dot" could be satisfied by the pill's own inner
  // circle or by the pill itself, both of which carry a background-color.
  const { desktop } = rows(render(['open']))[0];
  assert.ok(desktop.includes('#00CCFF1A'), 'the pill really is painted with the same hex + alpha');
  assert.equal(
    /style="background-color:#00CCFF1A" aria-hidden="true"/.test(desktop), false,
    'and the tinted pill is not aria-hidden, so the dot probe cannot land on it',
  );
});

test('dropping the visible type label did not drop the fact', () => {
  /**
   * /schedule can render a bare coloured dot because that page carries a legend.
   * /search does not. The word rides along in an `sr-only` span so the compact
   * row still announces `Classroom` / `Hybrid` / `Online`.
   *
   * Compared as a whole TEXT NODE rather than by containment: `Online` is a
   * substring of nothing here, but `Classroom` is what a truncated or
   * concatenated label would still contain, and equality is the only check that
   * tells `Classroom` from `Classroom Power BI Desktop`.
   */
  const [classroom, hybrid] = rows(render(['open', 'near'])).map((r) => r.compact);
  assert.equal(classroom.match(/<span class="sr-only">([^<]*)<\/span>/)?.[1], 'Classroom');
  assert.equal(hybrid.match(/<span class="sr-only">([^<]*)<\/span>/)?.[1], 'Hybrid');
});

// ── The status pill ─────────────────────────────────────────────────────────

test('the status renders as a tinted pill in the shared soft tokens', () => {
  const [open, near] = rows(render(['open', 'near'])).map((r) => r.compact);
  assert.ok(open.includes(SCHEDULE_STATUS.open.soft), 'the open pill must use the soft tokens');
  assert.ok(open.includes('>ลงทะเบียน</span>'), 'and say ลงทะเบียน');
  assert.ok(near.includes(SCHEDULE_STATUS.nearly_full.soft), 'amber for nearly_full');
  assert.ok(near.includes('>ใกล้เต็ม</span>'));
  // Pill, not bare text: a radius and horizontal padding around the label.
  assert.match(open, /rounded-full px-2 py-0\.5 text-\[11px\] font-bold [^"]*#39b980/);
});

test('a blank status renders NO pill — not an empty one, not a default', () => {
  /**
   * The behaviour lib/scheduleStatus exists to protect, re-asserted against this
   * shape: a pill is louder than the old status line was, so a defaulted
   * `ลงทะเบียน` here would advertise a session as taking bookings more loudly
   * than before, on no evidence — and as an IMPERATIVE, which is worse.
   *
   * Labels matched as `>label<` because a Thai status label can be a substring
   * of another: `เต็ม` is inside `ใกล้เต็ม`. The open label used to be caught by
   * this too — `เปิดรับ` sits inside this page's own `เปิดรับสมัคร` heading —
   * and since the state/action split it no longer is, because the badge word is
   * now `ลงทะเบียน`. The anchoring stays: `เต็ม` still needs it, and the open
   * word only stopped needing it by accident of vocabulary.
   */
  const { compact } = rows(render(['blank']))[0];
  for (const label of ['ลงทะเบียน', 'ใกล้เต็ม', 'เต็ม']) {
    assert.equal(
      compact.includes(`>${label}</span>`), false,
      `a blank status must not be labelled ${label}`,
    );
  }
  assert.equal(
    /rounded-full px-2 py-0\.5/.test(compact), false,
    'no empty pill element either — the whole span is omitted',
  );
  // …and the row itself is still there, with everything else on it.
  assert.ok(compact.includes('9,000 .-'), 'the price survived');
  assert.ok(compact.includes('lucide-chevron-right'), 'and the chevron');
});

test('CONTROL: the pill probe DOES see a pill on a real status', () => {
  // Without this, a row that dropped every pill would pass the test above.
  const { compact } = rows(render(['near']))[0];
  assert.match(compact, /rounded-full px-2 py-0\.5/, 'the probe cannot see a pill that is there');
  assert.ok(compact.includes('>ใกล้เต็ม</span>'));
});

test('CONTROL: the >label< form really is stricter than containment', () => {
  // The substring trap, asserted rather than trusted.
  assert.ok('ใกล้เต็ม'.includes('เต็ม'), 'the shorter label is inside the longer one…');
  assert.equal(
    '<span>ใกล้เต็ม</span>'.includes('>เต็ม</span>'), false,
    '…and the anchored form is not fooled by it',
  );
  // The heading hazard this control used to close is GONE, and saying so is
  // the point: `เปิดรับสมัคร` contained the old open label and does not contain
  // the new one. Asserting the absence keeps the record honest — a reader who
  // finds only the `เต็ม` case above would reasonably assume the heading was
  // never a problem.
  assert.ok('เปิดรับสมัคร'.includes('เปิดรับ'), 'the heading did contain the old open STATE word…');
  assert.equal(
    'เปิดรับสมัคร'.includes('ลงทะเบียน'), false,
    '…and does not contain the ACTION word the badge now carries',
  );
});

// ── The href ────────────────────────────────────────────────────────────────

test('the row links to the href the shared builder produces for that round', () => {
  /**
   * EQUALITY AGAINST THE BUILDER, not a second copy of the literal. A test that
   * pasted the URL would agree with a component that pasted it too — which is
   * exactly the state this change removed, where /search carried a byte-
   * identical copy of /schedule's template that no guard could see.
   */
  for (const key of ['open', 'near', 'blank']) {
    const s = SCHEDULES[key];
    const { compact } = rows(render([key]))[0];
    const href = unescapeHref(compact.match(/<a href="([^"]*)"/)?.[1] ?? '');
    assert.equal(
      href,
      scheduleRegistrationHref(s, s.course_ref.course_id),
      `${key}: the row's href must BE the builder's output`,
    );
    assert.ok(href.includes('&class='), `${key}: and carry the chosen round`);
  }
});

test('both forms of the same round link to the same place', () => {
  /**
   * The regression the two subtrees make possible: the phone and the desktop
   * quietly offering different destinations for one round, which no viewport
   * shows at once.
   */
  const { compact, desktop } = rows(render(['open']))[0];
  const compactHref = unescapeHref(compact.match(/<a href="([^"]*)"/)[1]);
  // The desktop form's FIRST <a> is the course link; the registration href is
  // the one on the button, so it is matched by its label rather than by order.
  const desktopHref = unescapeHref(
    desktop.match(/<a href="([^"]*)"[^>]*>สมัครเรียน/)?.[1] ?? '',
  );
  assert.equal(compactHref, desktopHref, 'the two forms must agree on the destination');
});

test('CONTROL: the href probes DO tell the two links on a row apart', () => {
  // Without this, "the hrefs are equal" could be two reads of the same element.
  const { desktop } = rows(render(['open']))[0];
  const all = [...desktop.matchAll(/<a href="([^"]*)"/g)].map((m) => unescapeHref(m[1]));
  assert.equal(all.length, 2, 'the desktop form has a course link AND a registration button');
  assert.notEqual(all[0], all[1], 'and they go to different places');
  assert.ok(all[0].endsWith('-training-course'), 'the first is the course page');
  assert.ok(all[1].startsWith('/registration/public?'), 'the second is the wizard');
});

test('a round with nowhere to go renders the same object, minus the affordances', () => {
  const { compact } = rows(render(['unlinked']))[0];
  assert.equal((compact.match(/<a\s/g) ?? []).length, 0, 'nothing to link to');
  assert.ok(compact.includes('bg-white'), 'but it is still the same surface');
  assert.match(compact, /min-h-\[44px\]/, 'and still a full-height row');
  assert.equal(/active:/.test(compact), false, 'with no press state, because there is no press');
  assert.equal(
    /lucide-chevron-right/.test(compact), false,
    'and no chevron promising a destination',
  );
  assert.ok(compact.includes('>เต็ม</span>'), 'the round is still described');
});

// ── The row as an object ────────────────────────────────────────────────────

test('the row declares a tap height of at least 44px', () => {
  /**
   * Parsed rather than string-matched, so a later trim to 40px goes red with a
   * message that says why. The next round is directly beneath: a mis-tap does
   * not miss, it opens the wrong round's registration page.
   */
  for (const { compact } of rows(render(['open', 'near', 'blank']))) {
    const declared = compact.match(/min-h-\[(\d+)px\]/);
    assert.ok(declared, 'the row must declare a minimum height, not rely on padding');
    assert.ok(
      Number(declared[1]) >= 44,
      `tap target is ${declared[1]}px — below the 44px minimum`,
    );
  }
});

test('the row is a filled, bordered, rounded surface with a press state', () => {
  const { compact } = rows(render(['open']))[0];
  const anchor = compact.match(/<a href="[^"]*" class="([^"]*)"/)?.[1] ?? '';
  assert.ok(anchor.includes('bg-white'), 'a fill, so the row reads as an object on #F8FAFD');
  assert.ok(anchor.includes('border border-gray-100'), 'its own border');
  assert.ok(anchor.includes('rounded-xl'), 'rounded like its neighbours in this list');
  assert.match(anchor, /\bactive:/, 'no active: state — a tap gives no feedback on a phone');
  assert.ok(anchor.includes('active:scale-'), 'the press itself');
  assert.ok(anchor.includes('active:bg-[#F8FAFD]'), 'and the press tint');
});

test('rows are separated by a gap, and each round is ONE wrapper', () => {
  /**
   * `space-y-3` puts a margin on every child but the first. With the two forms
   * as bare siblings, the first DESKTOP row would inherit a top margin from the
   * hidden phone row in front of it — a 12px shift on a layout that must not
   * move. One wrapper per round is what makes the gap gap ROUNDS.
   */
  const html = render(['open', 'near']);
  assert.match(section(html), /<div class="space-y-3">/, 'the stacked list keeps its gap');
  const list = section(html).match(/<div class="space-y-3">([\s\S]*)<\/div>/)[1];
  assert.equal(
    (list.match(/<div><div class="md:hidden">/g) ?? []).length, 2,
    'each round is one wrapper holding both forms',
  );
});

test('the second line carries date, then status, then price — in that order', () => {
  /**
   * Order asserted inside the META ROW only. The row's other text — the course
   * name, the sr-only type — and the href both contain digits and words that a
   * document-wide indexOf would happily match first.
   */
  const { compact } = rows(render(['open']))[0];
  const meta = compact.match(/<span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">([\s\S]*?)<\/span><\/span>/);
  assert.ok(meta, 'the second line is gone');
  // 2-digit Buddhist year — the shared formatter takes it from Intl now, where
  // the retired local copy hand-added 543 and printed four.
  const dateAt = meta[1].indexOf('17 ต.ค. 69');
  const statusAt = meta[1].indexOf('>ลงทะเบียน</span>');
  const priceAt = meta[1].indexOf('9,000 .-');
  assert.notEqual(dateAt, -1, 'the date must render');
  assert.notEqual(statusAt, -1, 'the status must render');
  assert.notEqual(priceAt, -1, 'the price must render');
  assert.ok(dateAt < statusAt && statusAt < priceAt, 'date, status, price');
});

test('the course name is the first line, and the term is still highlighted in it', () => {
  /**
   * Two separate renders on purpose. A highlighted string is NOT a contiguous
   * substring of its own HTML — `highlightText` splits `Power BI Desktop` around
   * a `<mark>` — so the whole-name assertion uses a term that does not occur,
   * and the highlight assertion uses one that does.
   */
  const plain = rows(render(['open'], 'zzz'))[0].compact;
  const title = plain.match(/<span class="line-clamp-1 text-sm font-semibold text-\[#0D1B2A\]">([^<]*)<\/span>/);
  assert.ok(title, 'the title line is gone');
  assert.equal(title[1], 'Power BI Desktop', 'the whole name, unsplit and untruncated');

  const marked = rows(render(['open'], 'power'))[0].compact;
  assert.match(marked, /<mark[^>]*>Power<\/mark> BI Desktop/, 'the term is marked inside the name');
});

// ── The desktop form did not move ───────────────────────────────────────────

/**
 * The shipped desktop row's INNARDS, frozen before this change.
 *
 * A golden rather than a list of class assertions, for the reason /schedule's
 * table cells are one: the risk is not a named class disappearing, it is a
 * shared helper edited for the phone — the href builder, the status policy, the
 * date label, the price label — quietly changing the desktop too, and nobody
 * looking at 1024px while working on a phone layout.
 *
 * The OUTER div's class attribute is deliberately not part of it: `flex` became
 * `hidden md:flex`, which is the visibility switch and the only intended change.
 * That one line is asserted separately, below.
 *
 * ── RE-BASELINED: THE DATE LABEL ────────────────────────────────────────────
 * `17 ต.ค. 2569` became `17 ต.ค. 69`. This file's local `formatDateLabel` — the
 * one whose own comment called it a "local re-implementation from
 * ScheduleClient" — is gone, replaced by the shared formatter. Two consequences,
 * both intended:
 *
 *   · the YEAR is now 2-digit Buddhist, because it comes from `Intl` instead of
 *     a hand-rolled `getFullYear() + 543`. Two digits is what every other
 *     schedule surface on the site shows;
 *   · a NON-CONSECUTIVE round is now listed rather than ranged. This fixture is
 *     a single day so it cannot show that, but it is the defect the replacement
 *     was for: `8, 10, 12 ต.ค.` used to render `8-12 ต.ค. 2569` on a row that
 *     links straight into the registration wizard.
 *
 * RE-CAPTURED FROM RENDERED OUTPUT: the row was printed from a real render and
 * diffed against this constant; the ONLY delta was the four characters of the
 * year inside the `<p>`. Every class, every href, the price and the CTA were
 * unchanged. The fixture dates here are FIXED (`2026-10-17`), so unlike the
 * /schedule goldens this one stays a literal.
 */
const DESKTOP_OPEN_INNER =
  '<span class="inline-flex h-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style="background-color:#00CCFF1A;color:#00CCFF">'
  + '<span class="h-2 w-2 rounded-full" style="background-color:#00CCFF"></span>Classroom</span>'
  + '<div class="min-w-0 flex-1">'
  + '<a href="/mse-pbi-training-course" class="line-clamp-1 text-sm font-semibold text-[#0D1B2A] hover:text-[#005CFF]">Power BI Desktop</a>'
  + '<p class="mt-0.5 text-xs text-gray-500">17 ต.ค. 69</p></div>'
  + '<span class="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#39b980]">'
  + '<span class="h-2 w-2 rounded-full bg-[#39b980]" aria-hidden="true"></span>ลงทะเบียน</span>'
  + '<span class="shrink-0 text-sm font-bold text-[#0D1B2A]">9,000 .-</span>'
  + '<a href="/registration/public?course=mse-pbi&amp;class=s1" class="shrink-0 rounded-9e-md bg-[#005CFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0046cc]">สมัครเรียน →</a>';

const desktopInner = (row) => row.replace(/^<div class="[^"]*">/, '').replace(/<\/div>$/, '');

test('the desktop row is byte-identical to before this change', () => {
  const { desktop } = rows(render(['open']))[0];
  assert.equal(desktopInner(desktop), DESKTOP_OPEN_INNER, 'the desktop schedule row changed');
});

test('the only edit to the desktop row is the visibility switch', () => {
  /**
   * `flex flex-col …` became `hidden flex-col … md:flex …`. At `md` and up both
   * strings compute to the same box, which is the claim "desktop did not move"
   * actually rests on — the golden above cannot see a class attribute it
   * deliberately strips.
   *
   * `\b`-anchored: `hidden` is a substring of `md:hidden`, and the compact row's
   * wrapper right next door is exactly `md:hidden`.
   */
  const { desktop } = rows(render(['open']))[0];
  const classes = desktop.match(/^<div class="([^"]*)">/)[1];
  assert.match(classes, /(^|\s)hidden(\s|$)/, 'the desktop form is hidden on a phone');
  assert.match(classes, /(^|\s)md:flex(\s|$)/, 'and shown from md up');
  assert.equal(
    /(^|\s)md:hidden(\s|$)/.test(classes), false,
    'md:hidden is the OTHER form — these two must not be confused',
  );
  for (const kept of [
    'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-gray-100', 'bg-white', 'p-4',
    'shadow-sm', 'transition-all', 'duration-150', 'hover:shadow-md',
    'md:flex-row', 'md:items-center', 'md:gap-4',
  ]) {
    assert.match(
      classes, new RegExp(String.raw`(^|\s)${kept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\s|$)`),
      `the desktop row lost "${kept}"`,
    );
  }
});

test('CONTROL: the golden DOES fail on a one-class edit, and the extractor is real', () => {
  /**
   * Without this the byte comparison is only as strong as `divAt`: if it
   * returned '' the equality would fail loudly, but if it returned something
   * that matched everything the test would pass vacuously. Mutating one class
   * must break equality.
   */
  const mutated = DESKTOP_OPEN_INNER.replace('gap-1.5', 'gap-2');
  assert.notEqual(mutated, DESKTOP_OPEN_INNER, 'the mutation is real');
  const { desktop } = rows(render(['open']))[0];
  assert.notEqual(desktopInner(desktop), mutated, 'a one-class edit must break the golden');
  // …and the depth-counting reader really crossed the nested <div>.
  assert.ok(desktop.includes('min-w-0 flex-1'), 'the nested div is inside the slice');
  assert.ok(desktop.endsWith('</div>'), 'and the slice closes at the outer div');
});

test('CONTROL: divAt counts depth rather than stopping at the first close', () => {
  const nested = '<div class="a"><div class="b">x</div>y</div>TRAILING';
  assert.equal(divAt(nested, 0), '<div class="a"><div class="b">x</div>y</div>');
  assert.notEqual(divAt(nested, 0), '<div class="a"><div class="b">x</div>');
});

test('CONTROL: the compact and desktop forms really did diverge', () => {
  /**
   * If the rebuild had not happened, every "the desktop is unchanged" claim
   * above would hold trivially against two identical subtrees.
   */
  const { compact, desktop } = rows(render(['open']))[0];
  assert.notEqual(compact, desktop);
  assert.ok(compact.includes('min-h-[44px]') && !desktop.includes('min-h-[44px]'));
  assert.ok(compact.includes(SCHEDULE_STATUS.open.soft), 'the phone row has the soft pill');
  assert.equal(
    desktop.includes(SCHEDULE_STATUS.open.soft), false,
    'and the desktop row kept the old dot-and-text treatment',
  );
});
