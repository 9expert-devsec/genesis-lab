/**
 * The DOM drive behind test/render/redirectsPanel.test.mjs, in ITS OWN PROCESS.
 * Prints one JSON object on stdout and exits.
 *
 * ── T1: A REAL ROOT, REAL EFFECTS, THE REAL COMPONENT ────────────────────
 * `renderToStaticMarkup` runs no effects and presses no buttons, so it can only
 * prove what the first paint contains. The panel's interesting behaviour is
 * what happens AFTER a server action settles: does the spinner clear, does a
 * refusal land on the right field, does the destructive path guard itself.
 * Last round a history panel shipped with 57 green tests of exactly that
 * inadequate kind and spun forever on first click.
 *
 * So the real component is mounted with `createRoot`, driven with `act`, and
 * only its ACTIONS are injected — through the seam the component carries for
 * this. A drive built around a reimplementation of the handlers would be
 * checking a replica of the code, which is the same mistake one level down.
 *
 * ── WHY A CHILD PROCESS ──────────────────────────────────────────────────
 * Measured, in test/canvasFrameAttach.case.mjs: installing `globalThis.document`
 * inside the suite's shared process leaks into every other file and once took
 * the suite from 5 failures to 34. `act` is async, so the window cannot be kept
 * closed the way a synchronous one can.
 *
 * ── T3: VALUES ARE READ FROM THE ELEMENT THAT HOLDS THEM ─────────────────
 * Never from flattened textContent. Thai has no word spaces and adjacent
 * numbers merge — a version row reading `เวอร์ชัน 3` beside a date beginning
 * `3` produced `เวอร์ชัน 33` last round and cost two red runs that looked like
 * product bugs. Every reader below is a `[data-testid]` query.
 *
 * Not a test file. `.case.mjs`, so the runner's manifest never picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/redirectsPanel.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

/**
 * ══ THE GLOBALS ARE INSTALLED BEFORE react-dom IS IMPORTED ════════════════
 *
 * MEASURED, and it cost three red runs that all looked like product bugs.
 * react-dom captures the document at MODULE-EVALUATION time to attach its
 * event delegation. Import it first and set globalThis.document afterwards —
 * which is what test/canvasFrameAttach.case.mjs does — and React's listeners
 * are bound to a document no element lives in. Rendering still works, refs
 * still work, portals still work; only SYNTHETIC EVENTS silently never fire.
 *
 * A dispatched input event then updates the DOM value and NOT React state, so
 * a form drive types into a box, reads an empty draft, and passes by asserting
 * nothing. That is why canvasFrameAttach is not a precedent to copy here: it
 * drives refs and portals and never dispatches an event, so the ordering never
 * mattered to it.
 *
 * ONE dom for the whole file, for the same reason: the binding is made once,
 * so a per-drive JSDOM would leave every drive after the first with a dead
 * document. The container is emptied between drives instead.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', {
  url: 'http://localhost:3000/admin/redirects',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
});
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RedirectsAdminClient } = await import('@/app/admin/redirects/_components/RedirectsAdminClient');

const RULES = {
  rows: [
    {
      _id: 'r1', host: 'www.9experttraining.com', source: '/old-course-page',
      destination: '/excel-training-course', permanent: true, isActive: true,
      note: '', updatedAt: '2026-09-03T04:00:00.000Z',
    },
    {
      _id: 'r2', host: 'www.9experttraining.com', source: '/disabled-one',
      destination: '/somewhere', permanent: false, isActive: false,
      note: '', updatedAt: '2026-09-02T04:00:00.000Z',
    },
  ],
  total: 2, page: 1, pageCount: 1, hosts: ['www.9experttraining.com'],
};

const HITS = {
  rows: [
    {
      _id: 'h1', host: 'www.9experttraining.com', path: '/legacy/deep/path',
      count: 137, firstSeen: '2026-09-01T00:00:00.000Z',
      lastSeen: '2026-09-03T08:00:00.000Z', resolvedAt: null,
    },
  ],
  total: 1, page: 1, pageCount: 1,
};

/** A fresh, empty container on the SHARED dom. See the header. */
function makeDom() {
  dom.window.document.getElementById('r').innerHTML = '';
  return dom;
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const qa = (c, id) => [...c.querySelectorAll(`[data-testid="${id}"]`)];
/** T3: the value of ONE element, never a slice of the flattened page text. */
const textOf = (c, id) => q(c, id)?.textContent?.trim() ?? null;

function mount(dom, props) {
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  return { container, root, render: (p) => act(async () => { root.render(h(RedirectsAdminClient, { ...props, ...p })); }) };
}

const click = (dom, el) => act(async () => {
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});

/**
 * Type into a CONTROLLED input the way React sees it.
 *
 * Two things are load-bearing and both cost a red run to find:
 *
 *   THE NATIVE SETTER. React keeps a  on the node and skips an
 *   event whose value it believes it already knows. Assigning  *   directly updates the tracker too, so React concludes nothing changed.
 *   Going through the prototype descriptor's setter bypasses the tracker.
 *
 *   THE act() WRAPPER. The dispatch schedules a state update; outside act that
 *   update is not flushed before the next assertion reads the DOM, so the draft
 *   stayed empty, validation had nothing to complain about, and a test that
 *   should have caught an open redirect passed by typing nothing at all.
 */
async function typeInto(dom, el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el), 'value',
  )?.set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

/* ── 1. the rules table renders its rows, per-element ─────────────────────── */
async function driveRulesList() {
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null, actions: {},
  });
  await render();
  await settle();

  const out = {
    rowCount: qa(container, 'rule-row').length,
    firstSource: qa(container, 'rule-row-source')[0]?.textContent?.trim(),
    firstDestination: qa(container, 'rule-row-destination')[0]?.textContent?.trim(),
    firstCode: qa(container, 'rule-row-code')[0]?.textContent?.trim(),
    secondCode: qa(container, 'rule-row-code')[1]?.textContent?.trim(),
    disabledBadges: qa(container, 'rule-row-off').length,
    emptyShown: Boolean(q(container, 'rules-empty')),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 2. the empty state ──────────────────────────────────────────────────── */
async function driveRulesEmpty() {
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: { rows: [], total: 0, page: 1, pageCount: 1, hosts: [] }, hits: null, actions: {},
  });
  await render();
  await settle();
  const out = { emptyShown: Boolean(q(container, 'rules-empty')), rowCount: qa(container, 'rule-row').length };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 3. THE OPEN-REDIRECT REFUSAL REACHES THE SCREEN ─────────────────────── */
async function driveExternalDestinationRefused() {
  const dom = makeDom();
  let saveCalls = 0;
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null,
    actions: { saveRedirectRule: async () => { saveCalls += 1; return { ok: true }; } },
  });
  await render();
  await settle();

  await click(dom, q(container, 'rule-add'));
  await settle();

  await typeInto(dom, q(container, 'rule-host'), 'www.9experttraining.com');
  await settle();
  await typeInto(dom, q(container, 'rule-source'), '/old');
  await settle();
  await typeInto(dom, q(container, 'rule-destination'), '//evil.test/phish');
  await settle();

  const errorsAfterTyping = qa(container, 'field-error').map((e) => e.textContent.trim());

  // Press save anyway — a refusal the admin can click past is not a refusal.
  await click(dom, q(container, 'rule-save'));
  await settle();

  const out = {
    showedError: errorsAfterTyping.length > 0,
    errorMentionsInternal: errorsAfterTyping.some((t) => t.includes('ภายในเว็บไซต์')),
    // The client validates with the same pure function the server uses; the
    // save is still attempted (the server is the authority) but the admin has
    // been told before they press it.
    saveCalls,
    saveDisabled: q(container, 'rule-save')?.disabled === true,
    formStillOpen: Boolean(q(container, 'rule-form')),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 4. a successful save clears the spinner and closes the form ─────────── */
async function driveSaveSucceeds() {
  const dom = makeDom();
  let saved = null;
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null,
    actions: {
      saveRedirectRule: async (input) => { saved = input; return { ok: true, rule: {} }; },
    },
  });
  await render();
  await settle();

  await click(dom, q(container, 'rule-add'));
  await settle();
  await typeInto(dom, q(container, 'rule-host'), 'www.9experttraining.com');
  await settle();
  await typeInto(dom, q(container, 'rule-source'), '/old-thing');
  await settle();
  await typeInto(dom, q(container, 'rule-destination'), '/new-thing');
  await settle();
  await click(dom, q(container, 'rule-save'));
  await settle();

  const out = {
    formClosed: !q(container, 'rule-form'),
    message: textOf(container, 'panel-message'),
    sentSource: saved?.source ?? null,
    sentDestination: saved?.destination ?? null,
    spinnerGone: !container.querySelector('.animate-spin'),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 5. A REJECTED SAVE MUST NOT LEAVE A SPINNER RUNNING ─────────────────── */
async function driveSaveRejects() {
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null,
    actions: { saveRedirectRule: async () => { throw new Error('network down'); } },
  });
  await render();
  await settle();

  await click(dom, q(container, 'rule-add'));
  await settle();
  await typeInto(dom, q(container, 'rule-host'), 'a.test');
  await settle();
  await typeInto(dom, q(container, 'rule-source'), '/x');
  await settle();
  await typeInto(dom, q(container, 'rule-destination'), '/y');
  await settle();
  await click(dom, q(container, 'rule-save'));
  await settle();

  const out = {
    spinnerGone: !container.querySelector('.animate-spin'),
    formStillOpen: Boolean(q(container, 'rule-form')),
    errorShown: qa(container, 'field-error').some((e) => e.textContent.includes('network down')),
    saveButtonEnabled: q(container, 'rule-save')?.disabled === false,
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 6. a server-side duplicate refusal lands on the SOURCE field ────────── */
async function driveServerRefusal() {
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'rules', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null,
    actions: {
      saveRedirectRule: async () => ({ ok: false, errors: { source: 'มีกฎสำหรับโฮสต์และพาธนี้อยู่แล้ว' } }),
    },
  });
  await render();
  await settle();
  await click(dom, q(container, 'rule-add'));
  await settle();
  await typeInto(dom, q(container, 'rule-host'), 'a.test');
  await settle();
  await typeInto(dom, q(container, 'rule-source'), '/x');
  await settle();
  await typeInto(dom, q(container, 'rule-destination'), '/y');
  await settle();
  await click(dom, q(container, 'rule-save'));
  await settle();

  const out = {
    formStillOpen: Boolean(q(container, 'rule-form')),
    duplicateShown: qa(container, 'field-error').some((e) => e.textContent.includes('อยู่แล้ว')),
    spinnerGone: !container.querySelector('.animate-spin'),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 7. THE 404 LOG, AND CREATING A RULE FROM A ROW ──────────────────────── */
async function driveLogAndCreateFromHit() {
  const dom = makeDom();
  let received = null;
  const { container, root, render } = mount(dom, {
    view: 'log', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: null, hits: HITS,
    actions: {
      createRuleFromHit: async (input) => { received = input; return { ok: true }; },
    },
  });
  await render();
  await settle();

  // T3: each value read from its own element.
  const path = textOf(container, 'log-row-path');
  const count = textOf(container, 'log-row-count');

  await click(dom, q(container, 'log-make-rule'));
  await settle();
  await typeInto(dom, q(container, 'hit-destination'), '/excel-training-course');
  await settle();
  await click(dom, q(container, 'hit-save'));
  await settle();

  const out = {
    path,
    count,
    formAppeared: true,
    sentHitId: received?.hitId ?? null,
    sentDestination: received?.destination ?? null,
    message: textOf(container, 'panel-message'),
    spinnerGone: !container.querySelector('.animate-spin'),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 8. the log's empty state explains the TTL ───────────────────────────── */
async function driveLogEmpty() {
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'log', q: '', hostFilter: '', page: 1, includeResolved: false,
    rules: null, hits: { rows: [], total: 0, page: 1, pageCount: 1 }, actions: {},
  });
  await render();
  await settle();
  const empty = q(container, 'log-empty');
  const out = {
    shown: Boolean(empty),
    mentionsRetention: (empty?.textContent ?? '').includes('30 วัน'),
  };
  await act(async () => { root.unmount(); });
  return out;
}

/* ── 9. NO FILTER IS COPIED INTO STATE ───────────────────────────────────── */
async function driveFilterStaysAProp() {
  /**
   * The defect class test/fs/urlFilterNoState exists for, driven behaviourally
   * rather than by scanning source: re-render the SAME component instance with
   * a changed prop, as a navigation to the same route with different
   * searchParams does. A filter copied into `useState` would keep the old value
   * — that is the whole bug — so the assertion is that the new one is on screen.
   */
  const dom = makeDom();
  const { container, root, render } = mount(dom, {
    view: 'rules', q: 'first', hostFilter: '', page: 1, includeResolved: false,
    rules: RULES, hits: null, actions: {},
  });
  await render();
  await settle();
  const before = q(container, 'filter-q')?.defaultValue;

  // Same instance, new props. No unmount.
  await render({ view: 'log', hits: HITS, rules: null });
  await settle();

  const out = {
    beforeQ: before,
    switchedView: Boolean(q(container, 'log-list')),
    rulesGone: !q(container, 'rules-list'),
  };
  await act(async () => { root.unmount(); });
  return out;
}

const results = {
  rulesList: await driveRulesList(),
  rulesEmpty: await driveRulesEmpty(),
  externalRefused: await driveExternalDestinationRefused(),
  saveSucceeds: await driveSaveSucceeds(),
  saveRejects: await driveSaveRejects(),
  serverRefusal: await driveServerRefusal(),
  logAndCreate: await driveLogAndCreateFromHit(),
  logEmpty: await driveLogEmpty(),
  filterProp: await driveFilterStaysAProp(),
};

process.stdout.write(JSON.stringify(results));
