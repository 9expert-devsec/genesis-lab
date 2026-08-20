import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../sourceScan.mjs';
import { compile, declarationsFor } from '../twCompile.mjs';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { resolveDateWindow } from '@/lib/registrations/listFilter';

/**
 * THE FLOATING SHEETS ARE NOT IN A CLIPPED COORDINATE SPACE.
 *
 * ══ WHAT THIS TIER CAN HONESTLY SAY, AND WHAT IT CANNOT ═════════════════════
 *
 * The defect is a layout one — the attendee row menu opened downward past the
 * bottom of the screen and could not be reached — and `renderToStaticMarkup`
 * has no viewport, no boxes, and no getBoundingClientRect. It cannot see a
 * clip. Nine vacuity findings across six rounds have come from assertions that
 * looked like they could.
 *
 * So this file asserts exactly one thing, and asserts it STRUCTURALLY:
 *
 *   a sheet is safe from an ancestor's clip if and only if it is `position:
 *   fixed` AND no ancestor establishes a containing block for fixed
 *   descendants.
 *
 * That is not a stylistic preference, it is the CSS rule, and both halves are
 * checkable from here: the first against the COMPILED stylesheet, the second by
 * walking the real ancestor chain of the real render and asking the compiled
 * stylesheet what each ancestor's classes actually do. Neither half is a class
 * -name match — `fixed` could be renamed out of the config tomorrow and compile
 * to nothing, which is the /schedule hover defect this suite already owns.
 *
 * WHAT IT STILL CANNOT SAY, stated rather than implied:
 *   · that the sheet lands somewhere legible — that is arithmetic, and it is in
 *     test/pure/anchoredMenu, with real rectangles;
 *   · that Esc, the outside click and the focus return actually fire. Those need
 *     a click and this tier has none. They are on the human checklist and
 *     nowhere else. An assertion here that a handler EXISTS in the source would
 *     be exactly the vacuous shape this note is about.
 *
 * ══ THE CHAIN INCLUDES THE ADMIN SHELL, WHICH IS NOT IN EITHER RENDER ═══════
 * `<main>` is where the clip actually is, and it is in src/app/admin/layout.jsx
 * — an async server component that cannot be rendered under this loader. Its
 * two class strings are therefore read from SOURCE, which is stated plainly at
 * the assertion rather than blurred into the walk. If the layout is restructured
 * the extraction fails loudly instead of quietly checking nothing.
 */

// ── The two screens ─────────────────────────────────────────────────────────

const ATTENDEE = { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' };

const DETAIL_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: { ...ATTENDEE, isAttending: true },
  attendeesListProvided: true,
  attendeesCount: 2,
  // TWO ROWS, which is the screenshot. The LAST one is the defect.
  attendees: [ATTENDEE, { ...ATTENDEE, firstName: 'สมหญิง', lastName: 'ดีใจ' }],
  requestInvoice: false,
  invoice: null,
  notes: '',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const DETAIL = renderToStaticMarkup(createElement(RegistrationDetailClient, {
  doc: DETAIL_DOC,
  history: createElement('p', { id: 'history-slot' }, 'ประวัติ'),
}));

const LIST = renderToStaticMarkup(createElement(RegistrationsClient, {
  initialData: { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 },
  status: 'all', q: '', source: 'public', range: 'all',
  counts: { total: 39 }, sourceTotals: { public: 39, inhouse: 9 }, lastEdited: {},
  from: '', to: '', course: '',
  dateWindow: resolveDateWindow({ range: 'all' }),
  courseOptions: [{ code: 'POWER-BI', label: 'Power BI Desktop' }],
}));

/**
 * The source files whose CODE is compiled, per the standing harvest rule: the
 * classes come from the RENDER, the CSS comes from compiling the SOURCE. A
 * class present in the markup but assembled from a template literal produces no
 * rule and is reported here as producing nothing — which is the right way round.
 */
const COMPILED_FROM = [
  'src/app/admin/registrations/_components/detailShell.jsx',
  'src/app/admin/registrations/_components/RegistrationDetailClient.jsx',
  'src/app/admin/registrations/_components/RegistrationsClient.jsx',
  'src/app/admin/registrations/_components/ListPanel.jsx',
  'src/app/admin/registrations/_components/FilterPanel.jsx',
  'src/app/admin/registrations/_components/tableParts.jsx',
  'src/app/admin/layout.jsx',
  'src/components/layout/AdminContentWrapper.jsx',
];

const css = await compile(COMPILED_FROM.map((rel) => ({ raw: readSource(rel).code, extension: 'js' })));

// ── Walking the real render ─────────────────────────────────────────────────

/**
 * HTML void elements ONLY.
 *
 * This list was wrong once, in the probe this test grew out of, and the failure
 * is worth recording because it looked like a finding: `path`, `rect` and the
 * other SVG leaves were in here, React emits them with explicit close tags, and
 * every `</path>` therefore popped somebody else's element. The walk reported
 * the row menu as having THREE ancestors and no clip — a true-looking answer
 * arrived at by a broken instrument. `unmatched`/`leftover` below is the guard
 * that would have caught it immediately.
 */
const VOID = new Set([
  'br', 'img', 'input', 'hr', 'meta', 'link', 'col',
  'source', 'area', 'base', 'embed', 'track', 'wbr', 'param',
]);

/** Tags in document order, quote-aware so a `>` inside an attribute is safe. */
function* tagsOf(html) {
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return;
    if (html.startsWith('<!', lt)) { i = html.indexOf('>', lt) + 1; continue; }
    let j = lt + 1;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j += 1;
    }
    yield html.slice(lt, j + 1);
    i = j + 1;
  }
}

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

/**
 * Every element matching `match`, with its ANCESTOR class strings — outermost
 * first, excluding the element itself.
 *
 * Returns `{ found, unmatched, leftover }` so a caller can prove the walk was
 * balanced before believing anything it says about depth. See VOID above.
 */
function chainsTo(html, match) {
  const stack = [];
  const found = [];
  let unmatched = 0;
  for (const raw of tagsOf(html)) {
    if (raw[1] === '/') {
      if (stack.length === 0) unmatched += 1; else stack.pop();
      continue;
    }
    const tag = /^<([a-zA-Z0-9]+)/.exec(raw)?.[1];
    if (!tag) continue;
    if (VOID.has(tag.toLowerCase()) || raw.endsWith('/>')) continue;
    const node = { tag, cls: attr(raw, 'class'), raw };
    if (match(node, stack)) found.push({ node, ancestors: stack.map((n) => ({ tag: n.tag, cls: n.cls })) });
    stack.push(node);
  }
  return { found, unmatched, leftover: stack.length };
}

/** Every declaration any class in `classes` compiles to. */
const declsFor = (classes) => classes.flatMap((c) => declarationsFor(css, c));

const classesOf = (cls) => cls.split(/\s+/).filter(Boolean);

// ── The two things a clip-escape depends on ─────────────────────────────────

/**
 * Properties that make an ancestor a containing block for `position: fixed`
 * descendants — and therefore re-trap a sheet that thought it had escaped.
 *
 * This is the CSS rule, not a taste: a non-`none` transform, filter,
 * perspective, backdrop-filter, `will-change` naming one of those, or
 * `contain` with a paint/layout component. It is the single thing that can
 * silently undo this whole fix, and it arrives by accident — a `hover:scale-`
 * on a card, a `backdrop-blur` on a header — with no error and no warning.
 */
function trapsFixed(decl) {
  const [prop, ...rest] = decl.split(':');
  const p = prop.trim();
  const v = rest.join(':').trim();
  if (v === '' || v === 'none') return false;
  if (['transform', 'filter', 'perspective', 'backdrop-filter'].includes(p)) return true;
  if (p === 'will-change') return /transform|filter|perspective/.test(v);
  if (p === 'contain') return /paint|layout|strict|content/.test(v);
  return false;
}

const CLIPS = /^overflow(-[xy])?\s*:\s*(hidden|auto|scroll|clip)$/;

// ════════════════════════════════════════════════════════════════════════════
// 1. THE SHEETS ARE FIXED — against the stylesheet, not against a class name
// ════════════════════════════════════════════════════════════════════════════

/*
 * ── BOTH SELECTORS ARE STRUCTURAL, AND THE FIRST DRAFT'S WAS NOT ───────────
 *
 * The ตัวกรอง panel was originally found by looking for a div carrying `fixed`
 * — i.e. by the very class the tests below assert about. Running the control
 * that puts `absolute` back showed what that costs: the panel stopped being
 * FOUND rather than being found and reported wrong, so "every floating sheet
 * compiles to position: fixed" stayed green over zero sheets. A selector must
 * never key on the property under test.
 *
 * So: the menus are `role="menu"` (an ARIA fact, not a style one) and the panel
 * is "the div a `<details>` discloses" (a structural fact). The count assertions
 * in the first test are what turn a vanished element into a failure.
 */
const rowMenus = chainsTo(DETAIL, (n) => attr(n.raw, 'role') === 'menu');
const filterPanels = chainsTo(LIST, (n, stack) => n.tag === 'div' && stack.at(-1)?.tag === 'details');

test('the walk is balanced — every claim below about depth depends on it', () => {
  /*
   * The instrument first, because a walk that over-pops reports a SHORT chain
   * and a short chain has no clipping ancestors in it. That is a green test
   * arrived at by a broken scanner, and it is exactly what happened once.
   */
  assert.equal(rowMenus.unmatched, 0, 'the detail render popped more elements than it pushed');
  assert.equal(rowMenus.leftover, 0, 'the detail render left elements open');
  assert.equal(filterPanels.unmatched, 0, 'the list render popped more elements than it pushed');
  assert.equal(filterPanels.leftover, 0, 'the list render left elements open');

  // Three menus on the detail screen: the status bar's, and one per roster row.
  assert.equal(rowMenus.found.length, 3, 'the fixture no longer renders the status bar menu and two rows');
  assert.equal(filterPanels.found.length, 1, 'the ตัวกรอง panel is not on the list screen');

  // And the chains are DEEP, which is the other half of "the walk works": a
  // scanner that pushed nothing would also report no clipping ancestors.
  const depths = rowMenus.found.map((f) => f.ancestors.length);
  assert.ok(Math.min(...depths) >= 4, `the menu chains are implausibly shallow: ${depths.join(', ')}`);
});

test('every floating sheet compiles to `position: fixed`', () => {
  /*
   * THE ESCAPE MECHANISM ITSELF, asked of the stylesheet. `fixed` is a stock
   * utility and looks unbreakable, but the same reasoning that made this suite
   * compile Tailwind at all applies: the question is what the browser is given,
   * not what the source says.
   */
  for (const { node } of [...rowMenus.found, ...filterPanels.found]) {
    const decls = declsFor(classesOf(node.cls));
    assert.ok(decls.includes('position: fixed'),
      `a sheet is not fixed and is therefore inside its ancestors' scrollports: [${node.cls}]`);
  }
});

test('the sheets carry NO class that compiles to a top or bottom offset', () => {
  /*
   * This is the `top-[30px]` / `top-[42px]` / `top-[45px]` defect stated as a
   * property rather than as an absence. A hardcoded downward offset is what
   * made the sheet open off the bottom of the screen in the first place, and a
   * static offset surviving alongside the measured one would win or lose
   * depending on specificity — a coin toss nobody would notice until a row
   * near the fold.
   *
   * Placement may come ONLY from the inline style the component measures.
   */
  for (const { node } of [...rowMenus.found, ...filterPanels.found]) {
    const offsets = declsFor(classesOf(node.cls)).filter((d) => /^(top|bottom)\s*:/.test(d));
    assert.deepEqual(offsets, [],
      `a sheet still has a hardcoded vertical offset from its classes: [${offsets.join(', ')}] in [${node.cls}]`);
  }
});

test('the clamped sheet can actually scroll, so maxHeight does not hide items', () => {
  /*
   * The pure tier proves a maxHeight is RETURNED. This proves the sheet does
   * something usable with it: a clamped box with `overflow: hidden` would swap
   * "items below the fold" for "items below the fold", which is the defect
   * wearing a different hat.
   */
  for (const { node } of [...rowMenus.found, ...filterPanels.found]) {
    const decls = declsFor(classesOf(node.cls));
    assert.ok(decls.some((d) => /^overflow(-y)?\s*:\s*auto$/.test(d)),
      `a sheet clamped by maxHeight cannot be scrolled: [${decls.join(', ')}]`);
    assert.ok(decls.some((d) => /^overscroll-behavior/.test(d)),
      'a scrolling sheet without overscroll containment drags <main> out from under itself');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. NOTHING ON EITHER CHAIN RE-TRAPS THE SHEET
// ════════════════════════════════════════════════════════════════════════════

test('no ancestor of any sheet establishes a containing block for fixed descendants', () => {
  /*
   * The one thing that would silently undo this. A `hover:scale-[1.01]` added
   * to SectionCard, or a `backdrop-blur` on the status bar, turns that box into
   * the sheet's containing block — at which point `fixed` behaves like
   * `absolute` again and the clip comes straight back, with no build error and
   * nothing on screen to say why.
   */
  for (const { node, ancestors } of [...rowMenus.found, ...filterPanels.found]) {
    for (const a of ancestors) {
      const guilty = declsFor(classesOf(a.cls)).filter(trapsFixed);
      assert.deepEqual(guilty, [],
        `<${a.tag} class="${a.cls}"> traps the sheet [${node.cls.slice(0, 60)}…]: ${guilty.join(', ')}`);
    }
  }
});

test('CONTROL: the trap detector really does fire — on classes that create one', async () => {
  /*
   * Without this the assertion above passes on a detector that returns false
   * for everything, which is the classic vacuous guard. These four are real
   * Tailwind utilities a designer would plausibly add to a card.
   *
   * COMPILED FROM A FIXTURE, and that is the one place in this file where a
   * fixture is the right input rather than the wrong one. Tailwind emits only
   * what it FINDS, so asking the app's stylesheet about `scale-105` answers
   * "nothing" — correctly, because nothing uses it. The subject here is the
   * DETECTOR, not the app, so the content it needs is the classes themselves.
   */
  const traps = ['scale-105', 'rotate-3', 'blur-sm', 'backdrop-blur-sm', 'will-change-transform'];
  const trapCss = await compile([{ raw: traps.join(' '), extension: 'html' }]);
  for (const c of traps) {
    const decls = declarationsFor(trapCss, c);
    assert.ok(decls.length > 0, `${c} compiles to nothing — the control is testing a dead class`);
    assert.ok(decls.some(trapsFixed), `${c} was not recognised as trapping fixed: ${decls.join(', ')}`);
  }
  // And the other direction: the classes that ARE on the chains today must not
  // be false positives, or the assertion above would be red for the wrong reason.
  for (const c of ['transition-colors', 'transition-shadow', 'relative', 'group']) {
    assert.ok(!declarationsFor(css, c).some(trapsFixed), `${c} was wrongly read as trapping fixed`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE CLIPS THAT ARE STILL THERE — named, because they are CORRECT
// ════════════════════════════════════════════════════════════════════════════

test('the row menu never had an overflow-hidden ancestor inside the client — the shell is the clip', () => {
  /*
   * ── THE FINDING, PINNED SO IT IS NOT RE-DIAGNOSED FROM THE OBVIOUS READING ─
   *
   * The natural reading of "a menu is clipped by its card" is that the card
   * carries `overflow-hidden`. For THIS menu that is false, and it stays false
   * only as long as something says so. Not one ancestor between the sheet and
   * the client's own root clips anything: SectionCard does not, the tab panel
   * does not, the table does not.
   *
   * What clipped it is the admin shell — see the next test.
   */
  for (const { ancestors } of rowMenus.found) {
    const clipping = ancestors
      .map((a) => ({ a, decls: declsFor(classesOf(a.cls)).filter((d) => CLIPS.test(d)) }))
      .filter((x) => x.decls.length > 0);
    assert.deepEqual(clipping.map((x) => x.a.cls), [],
      'a clipping ancestor appeared inside the detail client. That is not where the clip was, '
      + 'and it changes the diagnosis: re-read the note in detailShell before assuming it is harmless.');
  }
});

test('the ตัวกรอง panel DOES have a real overflow-hidden ancestor, and it is ListPanel', () => {
  /*
   * The other half of the same finding, and the reason the two sheets were
   * fixed in one commit rather than one of them being waved through.
   *
   * ListPanel's card clips so the table's corners follow the card's radius —
   * the same reasoning as the accent bar's clip, and CORRECT. A 340px panel
   * dropping out of a 66px header row is cut off at that card's bottom edge,
   * which is invisible while the table is long and halves the panel on an
   * empty result set: the state where a reader most needs the filter.
   *
   * This assertion says the clip is STILL THERE. It is not the bug; the panel
   * being inside it was.
   */
  const [{ ancestors }] = filterPanels.found;
  const clipping = ancestors.filter((a) => declsFor(classesOf(a.cls)).some((d) => CLIPS.test(d)));
  assert.equal(clipping.length, 1, 'ListPanel stopped clipping — the table corners now escape its radius');
  assert.match(clipping[0].cls, /overflow-hidden/);
  assert.match(clipping[0].cls, /rounded-9e-lg/, 'the clip without a radius clips to a square');
});

test('the admin shell is the only scrollport, and it still is — read from source', () => {
  /*
   * ── THIS ONE IS A SOURCE READ, AND SAYS SO ────────────────────────────────
   * src/app/admin/layout.jsx is an async server component that calls `auth()`;
   * it cannot be rendered under this loader, so its two class strings are
   * extracted from the file. If the layout is restructured these regexes stop
   * matching and this fails loudly rather than checking nothing.
   *
   * WHY IT MATTERS: this is what makes the reported symptom "the page cannot be
   * scrolled to reach the rest of it" rather than merely "it is clipped". The
   * outer row is `h-screen overflow-hidden`, so the document has NO scrollbar
   * at all — by design, and the layout's own comment says so — and `<main>` is
   * the only box that scrolls. A sheet laid out below `<main>`'s bottom edge is
   * outside the only thing on the page that could bring it back.
   *
   * It is also the CONTROL for every "no clipping ancestor" assertion above: it
   * proves `CLIPS` can recognise a clip when there is one to recognise.
   */
  const { code } = readSource('src/app/admin/layout.jsx');

  const row = /<div className="([^"]*h-screen[^"]*)"/.exec(code);
  assert.ok(row, 'the admin shell no longer has an h-screen row — re-read this test before changing it');
  const rowDecls = declsFor(classesOf(row[1]));
  assert.ok(rowDecls.some((d) => CLIPS.test(d)),
    `the shell row stopped clipping, so the document may now scroll: [${rowDecls.join(', ')}]`);

  const main = /<main className="([^"]*)"/.exec(code);
  assert.ok(main, 'the admin shell no longer has a <main> — the scrollport moved');
  const mainDecls = declsFor(classesOf(main[1]));
  assert.ok(mainDecls.some((d) => CLIPS.test(d)),
    `<main> is not a scrollport: [${mainDecls.join(', ')}]`);
  assert.ok(mainDecls.includes('overflow-y: auto'),
    'the content area stopped scrolling independently');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE SHEETS STILL SAY WHAT THEY SAID
// ════════════════════════════════════════════════════════════════════════════

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

test('the menu subtree is still reachable, still named, and still full of items', () => {
  /*
   * Positioning changed; nothing else was allowed to. The sheet stayed in its
   * original React subtree precisely so that this remains true — a portal would
   * have moved the markup and this assertion would have had to move with it.
   *
   * The no-empty-menu guard proper lives where it has lived since round 4:
   * test/render/registrationAttendeeTab, "NO row menu is empty, and every item
   * in every one has text". It is unchanged and still green; this is the
   * lighter cross-check that the sheet is still IN the render at all, so a
   * regression that deleted it could not be reported as "positioning".
   */
  for (const { node } of rowMenus.found) {
    const end = DETAIL.indexOf('</div>', DETAIL.indexOf(node.raw));
    const inner = DETAIL.slice(DETAIL.indexOf(node.raw), end);
    assert.match(inner, /role="menuitem"/, 'a menu has no items in it at all');
  }

  const triggers = [...DETAIL.matchAll(/<button[^>]*aria-haspopup="menu"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => textOf(m[1]));
  assert.equal(triggers.length, 3, 'a "•••" trigger disappeared with the positioning change');
  for (const t of triggers) {
    assert.ok(t.length > 0, 'a "•••" trigger renders as an empty button — it matches no text assertion anywhere');
  }
  assert.ok(triggers.some((t) => t.includes('ผู้เข้าอบรมท่านที่ 2')),
    'the LAST row — the one in the screenshot — has no named trigger');

  // The item the screenshot shows, still there and still spelled out.
  assert.ok(DETAIL.includes('แก้ไขรายชื่อ'), 'the row menu lost its edit item');
});

test('every trigger still declares the sheet it opens', () => {
  const withPopup = [...DETAIL.matchAll(/<button[^>]*aria-haspopup="menu"[^>]*>/g)].map((m) => m[0]);
  assert.equal(withPopup.length, 3);
  for (const t of withPopup) {
    assert.match(t, /aria-expanded="(true|false)"/,
      'a trigger stopped announcing its state — the sheet is invisible to a screen reader');
  }
});
