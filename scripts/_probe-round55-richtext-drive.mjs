/**
 * ROUND 55 — the rich-text editor, driven inside the wrapper it actually ships in.
 *
 * TWO SYMPTOMS were reported from the running editor: typed text is bold from
 * the first character, and merely CLICKING the text toggles bold. The second
 * identifies the mechanism, so it is driven first.
 *
 * ── WHY THIS IS A CHILD PROCESS AND NOT A TEST ────────────────────────────
 * Tiptap does not initialise under `renderToStaticMarkup`: `useEditor` returns
 * null on the server, the component renders nothing, and a markup-only
 * measurement reports ZERO toolbar buttons — a false negative, not a clean
 * result. So this needs a real DOM and a React root, and the suite runs every
 * file in ONE process where a React root over jsdom leaks its globals into the
 * markup tests sharing it (round 45: 5 failures became 34).
 *
 * NODE_ENV is pinned by the runner rather than inherited — `act` throws in
 * React's production build, and round 54 established the inherited value under
 * `npm test` is production.
 *
 * ── THE MECHANISM BEING SIMULATED, NAMED ──────────────────────────────────
 * A real `MouseEvent('click', { bubbles, cancelable })` on the target, preceded
 * by mousedown/mouseup, because a browser fires the trio and label activation
 * is the DEFAULT ACTION of the click. NOT `button.click()`, which would beg the
 * question.
 *
 * Verified separately before any of this was trusted: jsdom DOES forward a
 * click from a non-labelable descendant to `label.control`, at any nesting
 * depth, and stops only when something calls preventDefault.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round55-richtext-drive.mjs
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3001/admin/pages/builder/1/edit', pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.getSelection = () => dom.window.getSelection();
/**
 * jsdom does not implement elementFromPoint, and ProseMirror calls it from its
 * mousedown handler. Without this the handler THROWS, jsdom swallows the
 * listener error, and every measurement below is taken against an editor that
 * never processed the pointer — a false negative produced by the harness.
 */
dom.window.document.elementFromPoint = () => dom.window.document.querySelector('[contenteditable]');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, useState, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { SectionContentEditor } = await import('@/components/pageBuilder/editor/SectionContentEditor');

/**
 * SEEDED WITH REAL TEXT, and that is not cosmetic. An earlier version started
 * from an EMPTY document and reported "clicking the text does not toggle bold"
 * — a green that meant nothing, because toggleBold on a document with no text
 * position is a no-op whether or not the click arrived.
 */
const SEED = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ข้อความเดิม' }] }] };

const container = dom.window.document.getElementById('root');
const root = createRoot(container);

let stored = SEED;
function Host() {
  const [content, setContent] = useState({ doc: SEED });
  stored = content.doc;
  return h(SectionContentEditor, {
    type: 'rich_text',
    content,
    patch: (p) => setContent((c) => ({ ...c, ...p })),
    resolved: undefined,
    courses: [],
  });
}

await act(async () => { root.render(h(Host)); });

const label = container.querySelector('label');
const editable = container.querySelector('[contenteditable]');
const boldBtn = [...container.querySelectorAll('button')]
  .find((b) => b.getAttribute('aria-label') === 'ตัวหนา');

/**
 * THE DECISIVE INSTRUMENT: did the click REACH the button at all?
 * `aria-pressed` conflates "the click never arrived" with "it arrived and the
 * command declined". A listener on the button separates them.
 */
let boldClicks = 0;
boldBtn?.addEventListener('click', () => { boldClicks += 1; });

const boldActive = () => boldBtn?.getAttribute('aria-pressed') === 'true';
const storedJson = () => JSON.stringify(stored);
const hasBoldMark = () => storedJson().includes('"type":"bold"');

const pointer = (el) => {
  for (const type of ['mousedown', 'mouseup']) {
    el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, view: dom.window }));
  }
  const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, view: dom.window });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
};

const line = (k, v, note) => console.log(`  ${String(k).padEnd(42)}: ${v}${note ? '   ' + note : ''}`);

console.log('=== round 55 — the rich text editor, driven inside its shipped wrapper ===');

console.log('');
console.log('-- the structure');
line('a <label> wraps the editor', Boolean(label));
line('toolbar buttons inside that label', label ? label.querySelectorAll('button').length : 0);
line('the contenteditable is inside that label', Boolean(label && editable && label.contains(editable)));
line('label.control resolves to',
  label?.control
    ? `${label.control.tagName.toLowerCase()} aria-label=${JSON.stringify(label.control.getAttribute('aria-label'))}`
    : '(none)');
line('...and that IS the bold button', label?.control === boldBtn);

/**
 * ── CONTROL: DOES THIS LABEL FORWARD AT ALL, IN THIS MOUNT? ───────────────
 * The label's own caption is inside the same label, is not interactive, and is
 * not the editable surface. If the caption forwards and the editable does not,
 * the contenteditable is the variable and the structure is confirmed. If
 * NEITHER forwards, this harness is not reproducing label activation and
 * nothing below it can be believed.
 */
/**
 * Does the click even REACH the label? Label activation is the label's own
 * default action, so it can be defeated two ways that look identical from the
 * button's side: `preventDefault` (cancels the action) or `stopPropagation`
 * (the event never arrives). `defaultPrevented` distinguishes only the first,
 * so the label is instrumented too.
 */
let labelClicksFromCaption = 0;
let labelClicksFromText = 0;
let watching = null;
label?.addEventListener('click', () => {
  if (watching === 'caption') labelClicksFromCaption += 1;
  if (watching === 'text') labelClicksFromText += 1;
});

/**
 * AFTER THE FIX there is no <label> at all, so there is nothing to forward and
 * nothing below applies. Reported as the answer rather than crashing on a null,
 * so this probe stays runnable on both sides of the change — which is what lets
 * it be the before/after measurement rather than a one-shot.
 */
if (!label) {
  console.log('');
  console.log('-- FIXED: the editor is not inside a <label> ------------------------');
  line('any <label> wrapping the editor', false);
  line('so a stray click can reach the toolbar', false, '<- the capture is structurally gone');
  line('toolbar buttons still present', container.querySelectorAll('button').length);
  line('the contenteditable is still present', Boolean(editable));
  await act(async () => { root.unmount(); });
  process.exit(0);
}

const caption = label.querySelector('span');
watching = 'caption';
await act(async () => { pointer(caption); });
console.log('');
console.log('-- CONTROL: does this label forward AT ALL here?');
line('caption click reached the <label>', labelClicksFromCaption);
line('clicking the label CAPTION -> bold clicks', boldClicks,
  boldClicks > 0 ? '<- forwarding works in this mount' : '<- forwarding NOT reproduced here');
/**
 * Reaching the button and RUNNING the command are different claims. This is the
 * second: if `aria-pressed` flipped, `toggleBold()` executed and the editor is
 * now in bold — which is what the author then types into. It also settles
 * whether the bold is REAL (a Tiptap mark, and therefore a stored one) or
 * merely a CSS weight: this is the editor's own mark state, not a class.
 */
line('...and bold is now ACTIVE', boldActive(),
  boldActive() ? '<- toggleBold() actually ran' : '<- the click arrived but the command declined');
const forwardsFromCaption = boldClicks > 0;
const captionRanTheCommand = boldActive();
// Put it back, so the symptom-2 measurement starts from a clean state.
if (boldActive()) await act(async () => { pointer(caption); });
line('restored to off for the next measurement', !boldActive());
boldClicks = 0;

console.log('');
console.log('-- SYMPTOM 2: a click on the text');
line('stored doc', storedJson());
line('bold active before', boldActive());
let prevented;
watching = 'text';
await act(async () => { prevented = pointer(editable); });
line('click defaultPrevented?', prevented, prevented ? '<- default action cancelled' : '');
line('did the click REACH the <label>?', labelClicksFromText > 0,
  labelClicksFromText > 0 ? '' : '<- propagation stopped before the label');
const afterFirst = boldActive();
line('bold clicks after ONE click', boldClicks);
line('bold active after ONE click', afterFirst);
await act(async () => { pointer(editable); });
const afterSecond = boldActive();
line('bold clicks after TWO clicks', boldClicks);
line('bold active after TWO clicks', afterSecond);
line('stored doc after the clicks', storedJson());

console.log('');
console.log('-- SYMPTOM 1: what the document holds');
line('stored doc contains a bold mark', hasBoldMark());

console.log('');
console.log('-- the ledger');
line('the editor is wrapped in a <label>', Boolean(label));
line("that label's control is the BOLD button", label?.control === boldBtn);
line('the label forwards a caption click', forwardsFromCaption);
line('a caption click RUNS toggleBold', captionRanTheCommand);
line('a click on the TEXT reaches bold', `${boldClicks > 0} (${boldClicks} clicks)`);
line('a click on the TEXT toggles bold', afterFirst !== afterSecond);

await act(async () => { root.unmount(); });
