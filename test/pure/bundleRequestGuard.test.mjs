import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUNDLE_REFUSAL_REASONS,
  SILENT_REFUSALS,
  findSectionById,
  isSilentRefusal,
  resolveBundleRequest,
  unresolvedBundleItems,
} from '@/lib/registration/bundleRequest';
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';

/**
 * The (pageId, sectionId) guard: every reason it can refuse for, and the
 * ordering between them.
 *
 * The pair is USER INPUT — a bookmark, a forwarded message, a hand-edited query
 * string — so the interesting cases here are all the ways a link that was once
 * correct stops being correct, and each of them has to fail cleanly rather than
 * half-render.
 */

const NOW = Date.parse('2026-09-05T10:00:00+07:00');
const TODAY = '2026-09-05';

const item = (over = {}) => ({ id: 'i1', courseId: 'MSE-L1', roundId: 'r1', ...over });

const entry = (over = {}) => ({
  id: 'i1',
  courseId: 'MSE-L1',
  course: { course_id: 'MSE-L1', course_name: 'Excel L1' },
  rounds: [{ _id: 'r1', dates: ['2026-10-20', '2026-10-21'], type: 'classroom' }],
  ...over,
});

const bundle = (content = {}, over = {}) => ({
  id: 'sec-1',
  type: 'promotion_bundle',
  content: { name: 'Bundle 1', items: [item()], ...content },
  ...over,
});

const page = (sections, over = {}) => ({
  _id: 'p1',
  status: 'published',
  publishStartDate: null,
  publishEndDate: null,
  sections,
  ...over,
});

const OK_ARGS = {
  page: page([bundle()]),
  sectionId: 'sec-1',
  resolved: [entry()],
  todayKey: TODAY,
  now: NOW,
};

// ── the happy path, so every refusal below is a discrimination ─────────────

test('a published, enabled, open bundle with resolvable items RESOLVES', () => {
  const res = resolveBundleRequest(OK_ARGS);
  assert.equal(res.ok, true);
  assert.equal(res.section.id, 'sec-1');
  assert.equal(res.content.name, 'Bundle 1');
});

// ── the three silent refusals ─────────────────────────────────────────────

test('a pair naming nothing is refused SILENTLY — there is no true sentence to say', () => {
  assert.equal(resolveBundleRequest({ ...OK_ARGS, page: null }).reason, 'page_missing');
  assert.equal(resolveBundleRequest({ ...OK_ARGS, sectionId: 'nope' }).reason, 'section_missing');
  assert.equal(
    resolveBundleRequest({ ...OK_ARGS, page: page([{ id: 'sec-1', type: 'rich_text', content: {} }]) }).reason,
    'wrong_type',
  );
  for (const r of ['page_missing', 'section_missing', 'wrong_type']) {
    assert.equal(isSilentRefusal(r), true, `${r} should 404, not speak`);
  }
});

test('CONTROL: the spoken refusals are NOT silent, so the split is doing work', () => {
  // `page_expired` joined this list when expiry was split out of
  // `page_not_public`: an ended promotion has a true sentence to say, so it
  // must never 404.
  for (const r of ['page_not_public', 'page_expired', 'section_disabled', 'closed', 'unresolved_items']) {
    assert.equal(isSilentRefusal(r), false, `${r} would 404 a visitor who deserves a sentence`);
  }
  // …and the two lists together are the whole enumeration, so a reason added
  // later cannot quietly fall into neither.
  assert.deepEqual(
    [...BUNDLE_REFUSAL_REASONS].sort(),
    [...SILENT_REFUSALS, 'page_not_public', 'page_expired', 'section_disabled', 'closed', 'unresolved_items'].sort(),
  );
});

test('a hand-edited section id is refused as MISSING, not as unavailable', () => {
  /**
   * The distinction the visitor sees: a bundle that never existed 404s, and a
   * bundle that exists but cannot be assembled says so. Reporting "temporarily
   * unavailable" for an id nobody ever authored would send someone to ring the
   * sales team about a package that has never been sold.
   */
  const res = resolveBundleRequest({ ...OK_ARGS, sectionId: 'sec-1-typo' });
  assert.equal(res.reason, 'section_missing');
  assert.equal(isSilentRefusal(res.reason), true);
});

// ── visibility ────────────────────────────────────────────────────────────

test('an unpublished, expired or not-yet-live page is refused', () => {
  /**
   * ── THE REASONS SPLIT; THE REFUSAL DID NOT ─────────────────────────────
   * Expiry now answers `page_expired` rather than `page_not_public`, because
   * the two say different things to a visitor: "not yet, try later" is honest
   * about an unpublished page and a lie about a promotion whose end date has
   * passed. Every case here still REFUSES — that is the property this test has
   * always been about, and it is asserted first, on `ok`, so the reason split
   * cannot mask a case that started being accepted.
   */
  const cases = [
    ['draft', { status: 'draft' }, 'page_not_public'],
    ['closed', { status: 'closed' }, 'page_not_public'],
    ['archived', { status: 'archived' }, 'page_not_public'],
    ['expired', { publishEndDate: '2026-09-01T00:00:00.000Z' }, 'page_expired'],
    ['scheduled, still future', { status: 'scheduled', publishStartDate: '2027-01-01T00:00:00.000Z' }, 'page_not_public'],
    ['published, start in future', { publishStartDate: '2027-01-01T00:00:00.000Z' }, 'page_not_public'],
  ];
  for (const [label, over, reason] of cases) {
    const out = resolveBundleRequest({ ...OK_ARGS, page: page([bundle()], over) });
    assert.equal(out.ok, false, `${label} was ACCEPTED`);
    assert.equal(out.reason, reason, `${label} refused with the wrong reason`);
  }
});

test('expiry is the ONLY one of those that answers page_expired', () => {
  /**
   * The discrimination the split lives or dies by. Without it, a guard that
   * answered `page_expired` for everything invisible would satisfy the test
   * above's expired row while telling every draft page its promotion had ended.
   */
  const reasons = [
    { status: 'draft' },
    { status: 'closed' },
    { status: 'archived' },
    { status: 'scheduled', publishStartDate: '2027-01-01T00:00:00.000Z' },
    { publishStartDate: '2027-01-01T00:00:00.000Z' },
  ].map((over) => resolveBundleRequest({ ...OK_ARGS, page: page([bundle()], over) }).reason);

  assert.equal(reasons.includes('page_expired'), false, `a non-expired state claimed expiry: ${reasons}`);
  // …and the expired case really does produce it, so the negative above is not
  // a probe that can never fire.
  assert.equal(
    resolveBundleRequest({
      ...OK_ARGS,
      page: page([bundle()], { publishEndDate: '2026-09-01T00:00:00.000Z' }),
    }).reason,
    'page_expired',
  );
});

test('an end date STILL IN THE FUTURE is not expiry — the boundary is the predicate’s', () => {
  /**
   * The window arithmetic is `isPubliclyVisible`'s and the reason is
   * `invisibleReason`'s; this file must not restate either. What it can check is
   * that a page inside its window is not refused at all — which is what would
   * break if a second, sloppier date comparison were ever written here.
   */
  const out = resolveBundleRequest({
    ...OK_ARGS,
    page: page([bundle()], { publishEndDate: '2099-01-01T00:00:00.000Z' }),
  });
  assert.equal(out.ok, true, `a page inside its window was refused: ${out.reason}`);
});

test('the guard reads isPubliclyVisible rather than a second opinion about status', () => {
  /**
   * Behavioural, over the same grid: whatever the public route would 404 must
   * be exactly what this refuses. A second copy of the window arithmetic here
   * is how a form comes to accept registrations for a page whose URL 404s.
   */
  const overrides = [
    {},
    { status: 'draft' },
    { status: 'scheduled', publishStartDate: '2026-01-01T00:00:00.000Z' },
    { status: 'scheduled', publishStartDate: '2027-01-01T00:00:00.000Z' },
    { status: 'scheduled' },
    { publishEndDate: '2026-09-01T00:00:00.000Z' },
    { publishStartDate: '2026-01-01T00:00:00.000Z' },
    { publishStartDate: '2027-01-01T00:00:00.000Z' },
    { status: 'archived' },
  ];
  /**
   * ── THE VISIBILITY REFUSAL IS NOW TWO REASONS, SO THE PROBE TAKES BOTH ──
   * It compared against `page_not_public` alone. Expiry answers `page_expired`
   * now, and left as it was this loop would have read an expired page as
   * ACCEPTED — the exact disagreement it exists to catch, inverted into a
   * false green. The set is derived from the two names rather than spelled as a
   * boolean, so a third visibility reason has one place to be added.
   */
  const VISIBILITY_REFUSALS = ['page_not_public', 'page_expired'];
  for (const over of overrides) {
    const p = page([bundle()], over);
    const accepted = !VISIBILITY_REFUSALS.includes(
      resolveBundleRequest({ ...OK_ARGS, page: p }).reason,
    );
    assert.equal(
      accepted,
      isPubliclyVisible(p, NOW),
      `the guard and isPubliclyVisible disagree about ${JSON.stringify(over)}`,
    );
  }
  // CONTROL: the expired row in the grid really does take the new reason, so
  // the widened set is doing work rather than papering over it.
  assert.equal(
    resolveBundleRequest({
      ...OK_ARGS,
      page: page([bundle()], { publishEndDate: '2026-09-01T00:00:00.000Z' }),
    }).reason,
    'page_expired',
  );
  // CONTROL: the grid holds both answers, so the loop is not comparing two
  // constant trues.
  assert.equal(overrides.some((o) => isPubliclyVisible(page([], o), NOW)), true);
  assert.equal(overrides.some((o) => !isPubliclyVisible(page([], o), NOW)), true);
});

test('a MISSING section on an UNPUBLISHED page reports the section, not the status', () => {
  /**
   * The order is load-bearing: a bad pair is a bad link whatever the page's
   * status happens to be, and 404 is the honest answer to it.
   */
  const res = resolveBundleRequest({ ...OK_ARGS, page: page([bundle()], { status: 'draft' }), sectionId: 'nope' });
  assert.equal(res.reason, 'section_missing');
});

// ── the section's own two gates ───────────────────────────────────────────

test('a DISABLED section is refused — it draws nothing, so its link must reach nothing', () => {
  const res = resolveBundleRequest({ ...OK_ARGS, page: page([bundle({}, { enabled: false })]) });
  assert.equal(res.reason, 'section_disabled');
});

test('CONTROL: enabled true and enabled absent both resolve', () => {
  // SectionRenderer returns null only for a literal `enabled === false`, so the
  // guard must not be wider than the renderer or it would refuse a bundle the
  // page is happily drawing.
  for (const enabled of [true, undefined]) {
    assert.equal(
      resolveBundleRequest({ ...OK_ARGS, page: page([bundle({}, { enabled })]) }).ok,
      true,
      `enabled: ${String(enabled)} was refused`,
    );
  }
});

test('a CLOSED bundle is refused, and closed is checked BEFORE the items', () => {
  /**
   * A bundle the author deliberately retired must say so, rather than reporting
   * that one of its rounds has rolled off — which is true, uninteresting, and
   * the wrong thing to tell a visitor about a finished promotion.
   */
  const closedAndBroken = page([bundle({ registrationOpen: false, items: [item({ courseId: 'GONE' })] })]);
  assert.equal(
    resolveBundleRequest({ ...OK_ARGS, page: closedAndBroken, resolved: [entry({ course: null, courseId: 'GONE' })] }).reason,
    'closed',
  );
});

test('CONTROL: that same broken bundle reports unresolved_items when it is OPEN', () => {
  // Without this, "closed wins" could be satisfied by a guard that never
  // reports unresolved_items at all.
  const openAndBroken = page([bundle({ items: [item({ courseId: 'GONE' })] })]);
  assert.equal(
    resolveBundleRequest({ ...OK_ARGS, page: openAndBroken, resolved: [entry({ course: null, courseId: 'GONE' })] }).reason,
    'unresolved_items',
  );
});

// ── the item pass ─────────────────────────────────────────────────────────

test('every way an item can be unquotable is caught, and they are named apart', () => {
  const rows = [
    item({ id: 'a', courseId: '' }),
    item({ id: 'b', courseId: 'GONE' }),
    item({ id: 'c', courseId: 'MSE-L1', roundId: '' }),
    item({ id: 'd', courseId: 'MSE-L1', roundId: 'rolled-off', roundSnapshot: { id: 'rolled-off', dates: ['2026-08-01'], type: 'classroom' } }),
    item({ id: 'e', courseId: 'MSE-L1', roundId: 'withdrawn', roundSnapshot: { id: 'withdrawn', dates: ['2027-08-01'], type: 'classroom' } }),
    item({ id: 'f' }),
  ];
  const resolved = [
    entry({ courseId: '', course: null, rounds: [] }),
    entry({ courseId: 'GONE', course: null, rounds: [] }),
    entry(),
    entry(),
    entry(),
    entry(),
  ];
  const bad = unresolvedBundleItems(rows, resolved, TODAY);
  assert.deepEqual(
    bad.map((b) => `${b.index}:${b.why}`),
    ['0:no_course', '1:course_unresolved', '2:no_round', '3:round_elapsed', '4:round_missing'],
  );
  // Item f — a live round — is the one that is NOT in the list, which is what
  // makes the five above discriminating rather than "everything is bad".
  assert.equal(bad.some((b) => b.index === 5), false);
});

test('CONTROL: a wholly good list yields NO unresolved items', () => {
  assert.deepEqual(unresolvedBundleItems([item()], [entry()], TODAY), []);
});

test('an unlanded fetch refuses every item rather than accepting the request', () => {
  /**
   * `undefined` and `[]` both mean the resolved entries are not there. Fail
   * CLOSED: a form that cannot name one course of the package must not take a
   * request for it, and "the fetch was slow" is not a reason to quote a
   * customer for something nobody has read.
   */
  const rows = [item({ id: 'a' }), item({ id: 'b' })];
  assert.equal(unresolvedBundleItems(rows, undefined, TODAY).length, 2);
  assert.equal(unresolvedBundleItems(rows, [], TODAY).length, 2);
  assert.equal(resolveBundleRequest({ ...OK_ARGS, resolved: [] }).reason, 'unresolved_items');
});

test('an EMPTY bundle is refused — a package with no courses has no basis for its price', () => {
  const res = resolveBundleRequest({ ...OK_ARGS, page: page([bundle({ items: [] })]), resolved: [] });
  assert.equal(res.reason, 'unresolved_items');
  assert.deepEqual(res.unresolved, []);
});

test('omitting `resolved` runs every check EXCEPT the item pass', () => {
  /**
   * The link-time guard wants this: a closed or unpublished bundle is refused
   * with no upstream call at all, and only a bundle that survives those pays
   * for the fetch.
   */
  const broken = page([bundle({ items: [item({ courseId: 'GONE' })] })]);
  assert.equal(resolveBundleRequest({ page: broken, sectionId: 'sec-1', now: NOW }).ok, true);
  // CONTROL: the same page WITH the resolved entries is refused, so the line
  // above is the item pass being skipped rather than the items being fine.
  assert.equal(
    resolveBundleRequest({
      page: broken, sectionId: 'sec-1', now: NOW, todayKey: TODAY,
      resolved: [entry({ courseId: 'GONE', course: null, rounds: [] })],
    }).reason,
    'unresolved_items',
  );
});

// ── the walk ──────────────────────────────────────────────────────────────

test('a bundle NESTED in a container is found — a two-column promotion page is ordinary', () => {
  /**
   * A top-level-only lookup would 404 a link the page itself rendered: the
   * button would be there and the form would deny the bundle exists.
   */
  const nested = page([
    {
      id: 'col', type: 'two_column',
      content: { left: [{ id: 'x', type: 'rich_text', content: {} }], right: [bundle()] },
    },
  ]);
  assert.equal(findSectionById(nested.sections, 'sec-1')?.id, 'sec-1');
  assert.equal(resolveBundleRequest({ ...OK_ARGS, page: nested }).ok, true);
});

test('CONTROL: the walk really descends — a flat search would miss that section', () => {
  const nested = page([
    { id: 'col', type: 'two_column', content: { left: [], right: [bundle()] } },
  ]);
  const flat = nested.sections.find((s) => s.id === 'sec-1') ?? null;
  assert.equal(flat, null, 'the fixture is not actually nested');
  assert.notEqual(findSectionById(nested.sections, 'sec-1'), null);
});

test('the walk survives junk in the tree and an empty id', () => {
  assert.equal(findSectionById(null, 'sec-1'), null);
  assert.equal(findSectionById([null, 'x', 7, undefined], 'sec-1'), null);
  assert.equal(findSectionById([bundle()], ''), null, 'an empty id must match nothing');
  assert.equal(findSectionById([bundle()], undefined), null);
});
