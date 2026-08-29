/**
 * ROUND 48 — an author's session with the course picker, clicked for real.
 *
 * The render tests assert on markup, which is right for what markup can show.
 * What they cannot show is a SEQUENCE: pick, type, move, delete, and what the
 * stored array is after each one. That is the thing this step changes — it is
 * the only step that changes what an author's actions write into the document —
 * so it is driven rather than reasoned about.
 *
 * ── IN ITS OWN PROCESS, AND NOT BY PREFERENCE ──────────────────────────────
 * This needs a real DOM and real clicks, so it installs `globalThis.document`.
 * The verification suite runs every file in ONE process with concurrency:true,
 * and a React root over jsdom leaks those globals into every markup test
 * sharing it — round 45 measured an inline drive taking the suite from 5
 * failures to 34 while contributing zero tests. So this is a standalone probe,
 * like test/canvasFrameAttach.case.mjs, and nothing in `npm test` imports it.
 *
 * NODE_ENV is pinned by the runner below rather than inherited: other files in
 * this repo set it to production mid-run, and `act` throws outright in React's
 * production build (round 45, again).
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round48-picker-drive.mjs
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
const { CourseIdsPicker } = await import('@/components/pageBuilder/editor/CoursePicker');

const CATALOGUE = [
  { course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
  { course_id: 'POWER-BI', course_name: 'Power BI Desktop' },
];

/**
 * The fixture the round asks for: two live codes, a DUPLICATE of one of them, a
 * STALE code the catalogue has never heard of, and the empty string a trailing
 * newline used to leave behind.
 */
const START = ['CLAUDE-AI', 'MSE-AI', 'CLAUDE-AI', 'ZZ-NO-SUCH-COURSE', ''];

let stored = [...START];
function Host() {
  const [value, setValue] = useState(START);
  stored = value;
  return h(CourseIdsPicker, { value, onChange: setValue, courses: CATALOGUE });
}

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => { root.render(h(Host)); });

const rows = () => [...container.querySelectorAll('[data-testid="course-row"]')].map((el) => ({
  code: el.getAttribute('data-code'),
  text: el.textContent.replace(/\s+/g, ' ').trim(),
}));

function report(label) {
  console.log(`\n── ${label}`);
  console.log(`   stored array : ${JSON.stringify(stored)}`);
  console.log(`   rows on screen (${rows().length}):`);
  for (const r of rows()) console.log(`     ${JSON.stringify(r.code).padEnd(22)} ${r.text}`);
}

console.log('=== round 48 — the picker, driven ===');
report('0. on open — live codes, a duplicate, a stale code and an empty entry');

// ── the stale code survives every interaction that is not about it ─────────
/**
 * Typing, the way React actually sees it.
 *
 * Assigning `el.value` and dispatching `input` is NOT enough for a controlled
 * input: React installs its own value setter on the element and compares
 * against the node's tracked value, so a plain assignment updates the DOM and
 * React's onChange never fires. Measured — the first version of this probe did
 * exactly that and reported "hand-typed code stored verbatim: false" against a
 * component that was fine.
 *
 * The native setter, then the event, is what a real keystroke amounts to.
 */
function type(el, text) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

await act(async () => {
  type(container.querySelector('[data-testid="course-code-input"]'), 'BRAND-NEW-CODE');
});
await act(async () => { container.querySelector('[data-testid="course-code-add"]').click(); });
report('1. after typing a code upstream has never published, and pressing เพิ่ม');

await act(async () => { container.querySelector('[data-move="down"][data-row="0"]').click(); });
report('2. after moving entry #1 down');

/**
 * Delete the EMPTY entry specifically — the '' a trailing newline in the old
 * textarea left behind. It is the interesting deletion: the new control cannot
 * create one, refuses to strip it on load, and gives the author a row and a bin
 * so they can remove it deliberately.
 *
 * By position, not "the last one". The first version of this step deleted the
 * last row, which by then was the code typed in step 1 — and the ledger then
 * reported "hand-typed code stored verbatim: false" about a component that had
 * stored it correctly one step earlier.
 */
const emptyAt = rows().findIndex((r) => r.code === '');
await act(async () => {
  container.querySelectorAll('button[aria-label^="ลบ"]')[emptyAt].click();
});
report(`3. after deleting the EMPTY entry (row #${emptyAt + 1})`);

// ── what changed, and what did not ────────────────────────────────────────
console.log('\n── the ledger');
console.log(`   started : ${JSON.stringify(START)}`);
console.log(`   ended   : ${JSON.stringify(stored)}`);
const stale = 'ZZ-NO-SUCH-COURSE';
console.log(`   stale code still stored          : ${stored.includes(stale)}`);
console.log(`   duplicate still stored           : ${stored.filter((c) => c === 'CLAUDE-AI').length} copies`);
console.log(`   hand-typed code stored verbatim  : ${stored.includes('BRAND-NEW-CODE')}`);
console.log(`   nothing was sorted               : ${JSON.stringify(stored) !== JSON.stringify([...stored].sort())}`);
console.log(`   nothing was de-duplicated        : ${stored.length !== new Set(stored).size}`);
console.log(`   empty entry removed on request   : ${!stored.includes('')}`);
// The whole point, stated as one comparison: everything the author did NOT
// touch is byte-identical, and the only differences are the three they made.
const untouched = START.filter((c) => c !== '');
const endedMinusNew = stored.filter((c) => c !== 'BRAND-NEW-CODE');
console.log(`   the untouched entries, as a SET  : ${JSON.stringify([...endedMinusNew].sort()) === JSON.stringify([...untouched].sort())}`);
console.log(`   …and only their ORDER moved      : ${JSON.stringify(endedMinusNew) !== JSON.stringify(untouched)}`);

await act(async () => { root.unmount(); });
