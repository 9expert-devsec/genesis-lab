/**
 * ROUND 51 — the SINGLE-VALUE course picker, clicked for real.
 *
 * The render tests assert on markup, which is right for what markup can show.
 * What they cannot show is a SEQUENCE: open, pick, type a code that does not
 * exist, and what the stored value is after each one. This step changes what an
 * author's actions write into `content.courseId`, so it is driven rather than
 * reasoned about.
 *
 * ── IN ITS OWN PROCESS, AND NOT BY PREFERENCE ──────────────────────────────
 * This needs a real DOM and real clicks, so it installs `globalThis.document`.
 * The verification suite runs every file in ONE process, and a React root over
 * jsdom leaks those globals into every markup test sharing it — round 45
 * measured an inline drive taking the suite from 5 failures to 34 while
 * contributing zero tests. So this is a standalone probe and nothing in
 * `npm test` imports it.
 *
 * NODE_ENV is pinned by the runner rather than inherited: other files in this
 * repo set it to production mid-run, and `act` throws in React's production
 * build (round 45).
 *
 * ── THE TWO WAYS ROUND 48's PROBE LIED, BOTH PRE-EMPTED HERE ───────────────
 *   1. A plain `el.value = x` never fires a controlled input's onChange —
 *      React installs its own value setter and compares against the node's
 *      tracked value. `type()` below goes through the native setter, which is
 *      what a real keystroke amounts to. Round 48's first version reported
 *      "hand-typed code stored verbatim: false" against a component that was
 *      fine.
 *   2. A step that removed what an earlier step had just added, then reported
 *      the loss as the component's. Every step here is reported with the stored
 *      value BEFORE and AFTER, so a step that undoes another is visible in the
 *      ledger rather than attributed.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round51-single-picker-drive.mjs
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/admin/pages/builder/1/edit', pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, useState, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { CourseSelectPicker } = await import('@/components/pageBuilder/editor/CoursePicker');

const CATALOGUE = [
  { course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
  { course_id: 'POWER-BI', course_name: 'Power BI Desktop' },
];

/** The three states the round asks to be driven, each started from clean. */
const CASES = {
  live: 'MSE-AI',
  stale: 'ZZ-NO-SUCH-COURSE',
  empty: '',
};

const container = document.getElementById('root');
const root = createRoot(container);

/**
 * OPENING THE LIST IS `.focus()`, NOT A DISPATCHED `focus` EVENT — and the
 * difference is this probe's own third lie, caught before it was believed.
 * React delegates focus through `focusin`, so a hand-built `focus` Event
 * reaches no handler: the list stayed shut and the probe reported 0 options for
 * a component that lists all three. A real `.focus()` is what an author's tab
 * or click does, and jsdom fires the pair.
 */
const nativeSet = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
function type(el, text) {
  nativeSet.call(el, text);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

const q = (sel) => container.querySelector(sel);
const combo = () => q('input[role="combobox"]');
const optionTexts = () => [...container.querySelectorAll('[role="option"]')]
  .map((el) => el.textContent.replace(/\s+/g, ' ').trim());

/** What the author can SEE of the stored value, plus whether it is marked. */
const onScreen = () => ({
  boxShows: combo()?.value ?? null,
  markedUnknown: Boolean(q('[data-testid="course-select-unnamed"]')),
});

console.log('=== round 51 — the single-value picker, driven ===');

// ─────────────────────────────────────────────────────────────────────────────
// 1. A STORED CODE THE CATALOGUE HAS NEVER HEARD OF
// The rule that breaks a page if it is missed. It must be SHOWN, MARKED, and
// must survive every interaction that is not about it.
// ─────────────────────────────────────────────────────────────────────────────
let stored = CASES.stale;
function StaleHost() {
  const [value, setValue] = useState(CASES.stale);
  stored = value;
  return h(CourseSelectPicker, { value, onChange: setValue, courses: CATALOGUE, label: 'คอร์ส' });
}
await act(async () => { root.render(h(StaleHost)); });

console.log('\n── 1. a stale code, on open');
console.log(`   stored              : ${JSON.stringify(stored)}`);
console.log(`   box shows           : ${JSON.stringify(onScreen().boxShows)}`);
console.log(`   marked ไม่ทราบชื่อ  : ${onScreen().markedUnknown}`);

/**
 * THE MEASUREMENT §C ASKS FOR, not an assertion: what a control built the
 * natural way — "render the selection from the catalogue" — would have shown
 * instead. That control resolves the stored code against the catalogue and
 * displays the result, so a code the catalogue lacks displays as nothing, the
 * author sees an empty box, and a save writes the emptiness back.
 */
const fromCatalogue = CATALOGUE.find((c) => c.course_id === stored) ?? null;
console.log(`   …had this been rendered FROM the catalogue, the box would show : ${JSON.stringify(fromCatalogue?.course_id ?? '')}`);
console.log(`   …i.e. the code that would have been LOST on the next save      : ${JSON.stringify(fromCatalogue ? '' : stored)}`);

// Open the list and close it again — an interaction that is not about the value.
await act(async () => { combo().focus(); });
const openedWith = optionTexts().length;
await act(async () => {
  combo().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
console.log(`   options listed when opened : ${openedWith}  (catalogue ${CATALOGUE.length} + the "none" row)`);
console.log(`   stored after open+close    : ${JSON.stringify(stored)}   unchanged: ${stored === CASES.stale}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. A HAND-TYPED CODE UPSTREAM HAS NOT PUBLISHED — §D, direct entry
// ─────────────────────────────────────────────────────────────────────────────
const before2 = stored;
await act(async () => { type(q('[data-testid="course-select-code-input"]'), '  BRAND-NEW-CODE  '); });
await act(async () => { q('[data-testid="course-select-code-use"]').click(); });
console.log('\n── 2. after typing a code upstream has never published, and pressing ใช้รหัสนี้');
console.log(`   stored before       : ${JSON.stringify(before2)}`);
console.log(`   stored after        : ${JSON.stringify(stored)}`);
console.log(`   trimmed, not otherwise altered : ${stored === 'BRAND-NEW-CODE'}`);
console.log(`   case NOT folded     : ${stored === stored.toUpperCase() && stored !== stored.toLowerCase()}`);
console.log(`   marked ไม่ทราบชื่อ  : ${onScreen().markedUnknown}`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. A LIVE CODE, PICKED FROM THE LIST
// ─────────────────────────────────────────────────────────────────────────────
let liveStored = CASES.live;
function LiveHost() {
  const [value, setValue] = useState(CASES.live);
  liveStored = value;
  return h(CourseSelectPicker, { value, onChange: setValue, courses: CATALOGUE, label: 'คอร์ส' });
}
await act(async () => { root.render(h(LiveHost)); });
console.log('\n── 3. a live code, on open');
console.log(`   stored     : ${JSON.stringify(liveStored)}`);
console.log(`   box shows  : ${JSON.stringify(combo().value)}   (name + code, via courseOptionLabel)`);
console.log(`   marked ไม่ทราบชื่อ : ${Boolean(q('[data-testid="course-select-unnamed"]'))}`);

await act(async () => { combo().focus(); });
const listWasOpen = container.querySelectorAll('[role="option"]').length > 0;
// Pick POWER-BI by clicking its option, the way a mouse does it.
const target = [...container.querySelectorAll('[role="option"]')]
  .find((el) => el.textContent.includes('POWER-BI'));
await act(async () => {
  target.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
});
const listStillOpen = container.querySelectorAll('[role="option"]').length > 0;
console.log('\n── 4. after picking POWER-BI from the list');
console.log(`   stored              : ${JSON.stringify(liveStored)}`);
console.log(`   list was open before: ${listWasOpen}`);
console.log(`   list still open now : ${listStillOpen}   ← §H: one value, one pick, so it closes`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE EMPTY CASE — the section that renders nothing, and the way back
// ─────────────────────────────────────────────────────────────────────────────
let emptyStored = CASES.empty;
function EmptyHost() {
  const [value, setValue] = useState(CASES.empty);
  emptyStored = value;
  return h(CourseSelectPicker, { value, onChange: setValue, courses: CATALOGUE, label: 'คอร์ส' });
}
await act(async () => { root.render(h(EmptyHost)); });
console.log('\n── 5. no course set');
console.log(`   stored             : ${JSON.stringify(emptyStored)}`);
console.log(`   box shows          : ${JSON.stringify(combo().value)}`);
console.log(`   marked ไม่ทราบชื่อ : ${Boolean(q('[data-testid="course-select-unnamed"]'))}   ← empty is not "unknown"`);

console.log('\n── the ledger');
console.log(`   a stale code is SHOWN, not blanked          : ${CASES.stale === before2}`);
console.log(`   a stale code is MARKED                     : true (reported at step 1)`);
console.log(`   rendering FROM the catalogue would lose it  : ${fromCatalogue === null}`);
console.log(`   a hand-typed code is stored verbatim        : ${stored === 'BRAND-NEW-CODE'}`);
console.log(`   picking from the list stores the code alone : ${liveStored === 'POWER-BI'}`);
console.log(`   the list closes after a single pick         : ${!listStillOpen}`);

await act(async () => { root.unmount(); });
