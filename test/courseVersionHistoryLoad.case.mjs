/**
 * The DOM drive behind test/render/courseVersionHistoryLoad.test.mjs, in ITS
 * OWN PROCESS. Prints one JSON object on stdout and exits.
 *
 * ── WHY A CHILD PROCESS ───────────────────────────────────────────────────
 * Same reason, measured, as test/canvasFrameAttach.case.mjs: installing
 * `globalThis.document` inside the suite's process leaks into every other file,
 * because `npm test` runs them all in ONE process with `concurrency: true`.
 * That experiment took the suite from 5 failures to 34. `act` is async by
 * construction, so the window cannot be kept closed the way
 * imageNodeViewButton's synchronous one is.
 *
 * ── WHY THE REAL COMPONENT AND NOT A COPY OF ITS EFFECT ───────────────────
 * THIS IS THE POINT OF THE FILE. The defect it exists for lived in the effect
 * itself: `state.status` sat in the dependency array of the effect that WROTE
 * `state.status`, so the effect re-entered, its cleanup flipped the `cancelled`
 * flag on the closure owning the only in-flight request, and the guard then
 * refused to start a replacement. The result arrived, was silently discarded,
 * and the spinner ran forever.
 *
 * A drive built around a reimplementation of that effect would have proved
 * something about the reimplementation. So `CourseVersionHistory` is imported
 * and mounted for real, and only its two fetchers are injected — the test seam
 * the component carries for exactly this.
 *
 * The response body below is the one CAPTURED FROM THE BROWSER on
 * /admin/courses/6a7a97f0b830e289fc383406/edit, verbatim, including the third
 * row's empty summary. The bug was never about the data.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/courseVersionHistoryLoad.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

// Registered here rather than through an --import flag so the child is
// self-contained: the app modules are reached by dynamic import BELOW, which is
// after this call and therefore sees the hook.
register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { CourseVersionHistory } = await import('@/app/admin/courses/_components/CourseVersionHistory');

/** The action's real response, captured from the browser. */
const ROWS = [
  {
    id: '6a992abe77ff1d60529a821e', kind: 'content', versionNumber: 3,
    createdAt: '2026-09-03T08:07:26.108Z', actorName: 'Pirasak S.',
    preImageMissing: false, file: null, summary: 'คำอธิบายสั้น',
  },
  {
    id: '6a992abe77ff1d60529a821d', kind: 'content', versionNumber: 2,
    createdAt: '2026-09-03T08:00:00.000Z', actorName: 'Pirasak S.',
    preImageMissing: false, file: null, summary: 'ราคา',
  },
  {
    id: '6a992abe77ff1d60529a821c', kind: 'content', versionNumber: 1,
    createdAt: '2026-09-03T07:00:00.000Z', actorName: 'Pirasak S.',
    preImageMissing: false, file: null, summary: '',
  },
];
const RESPONSE = { ok: true, rows: ROWS };

/** A promise whose settlement this file controls. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', {
    url: 'http://localhost:3000/admin/courses/6a7a97f0b830e289fc383406/edit',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // Node defines `navigator` as a getter-only global, so it is redefined.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator, configurable: true, writable: true,
  });
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** Let every already-resolved microtask and timer flush. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

/**
 * The version titles, read from the ROW ELEMENTS rather than by matching the
 * panel's whole textContent.
 *
 * NO REGEX OVER FLATTENED TEXT, and the reason is worth recording because it
 * cost two red runs that both looked like product bugs. A row renders
 * `เวอร์ชัน 3` immediately followed by its Thai date, which begins with the day
 * — so the flattened text reads `เวอร์ชัน 33 ก.ย.…` and `\d+` runs straight
 * across the element boundary, capturing "เวอร์ชัน 33". Anchoring the match to
 * the start of the BUTTON does not help either, for the same reason.
 *
 * So the title is read from the element that actually holds it. A DOM boundary
 * is the only thing that reliably separates two adjacent numbers.
 */
function versionTitles(container) {
  return [...container.querySelectorAll('button')]
    .map((b) => b.querySelector('span.font-semibold')?.textContent?.trim())
    .filter(Boolean);
}

/** What the panel is showing, reduced to the states that matter. */
function readPanel(container) {
  const text = container.textContent ?? '';
  return {
    spinner: text.includes('กำลังโหลดประวัติ'),
    error: text.includes('โหลดประวัติไม่สำเร็จ') || text.includes('ไม่มีสิทธิ์'),
    hasRetry: Boolean(container.querySelector('[data-testid="history-retry"]')),
    empty: text.includes('ยังไม่มีประวัติสำหรับหลักสูตรนี้'),
    versionsShown: versionTitles(container),
    rowButtons: container.querySelectorAll('button').length,
    text,
  };
}

/* ── 1. THE REPORTED DEFECT ────────────────────────────────────────────────
 * Mount with the tab CLOSED (what the edit page does on load), then open it,
 * then let the promise settle. The list must render.
 */
async function driveOpenTab() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  let calls = 0;
  const listVersions = async () => { calls += 1; return RESPONSE; };

  const render = (active) => act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'EXCEL-HR-02', active, listVersions, fetchDiff: async () => ({ ok: true }),
    }));
  });

  await render(false);
  const beforeOpen = readPanel(container);
  await render(true);
  await settle();
  const afterOpen = readPanel(container);

  await act(async () => { root.unmount(); });
  return {
    beforeOpenSpinner: beforeOpen.spinner,
    spinner: afterOpen.spinner,
    versionsShown: afterOpen.versionsShown,
    summaryShown: afterOpen.text.includes('คำอธิบายสั้น'),
    actorShown: afterOpen.text.includes('Pirasak S.'),
    fetchCalls: calls,
  };
}

/* ── 2. NO DOUBLE FETCH when the tab is left and re-entered ───────────────
 * The original `state.status` guard existed to prevent this. Whatever replaces
 * it has to keep the property.
 */
async function driveTabAwayAndBack() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  let calls = 0;
  const listVersions = async () => { calls += 1; return RESPONSE; };

  const render = (active) => act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'EXCEL-HR-02', active, listVersions, fetchDiff: async () => ({ ok: true }),
    }));
  });

  await render(false);
  await render(true);
  await settle();
  await render(false);   // switch to another tab
  await render(true);    // and back
  await settle();
  const panel = readPanel(container);

  await act(async () => { root.unmount(); });
  return { fetchCalls: calls, spinner: panel.spinner, versionsShown: panel.versionsShown };
}

/* ── 3. THE ERROR STATE, AND THAT RETRY CAN REACH 'ready' ─────────────────
 * The old guard made retry impossible by construction: after a failure the
 * status was 'error', never 'idle', so the effect could not fetch again and
 * there was nowhere for a retry to go.
 */
async function driveRejectThenRetry() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  let calls = 0;
  const listVersions = async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return RESPONSE;
  };

  await act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'EXCEL-HR-02', active: true, listVersions, fetchDiff: async () => ({ ok: true }),
    }));
  });
  await settle();
  const afterReject = readPanel(container);

  // Press the retry affordance, if there is one.
  const retry = container.querySelector('[data-testid="history-retry"]');
  if (retry) {
    await act(async () => { retry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await settle();
  }
  const afterRetry = readPanel(container);

  await act(async () => { root.unmount(); });
  return {
    rejectedSpinner: afterReject.spinner,
    rejectedError: afterReject.error,
    hasRetry: afterReject.hasRetry,
    retriedSpinner: afterRetry.spinner,
    retriedVersions: afterRetry.versionsShown,
    fetchCalls: calls,
  };
}

/* ── 4. ok:false is an ERROR, not an eternal spinner ──────────────────────── */
async function driveNotOk() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  await act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'EXCEL-HR-02', active: true,
      listVersions: async () => ({ ok: false, reason: 'forbidden', rows: [] }),
      fetchDiff: async () => ({ ok: true }),
    }));
  });
  await settle();
  const panel = readPanel(container);
  await act(async () => { root.unmount(); });
  return { spinner: panel.spinner, error: panel.error, forbidden: panel.text.includes('ไม่มีสิทธิ์') };
}

/* ── 5. THE EMPTY STATE still reaches the screen ──────────────────────────── */
async function driveEmpty() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  await act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'NEW-COURSE', active: true,
      listVersions: async () => ({ ok: true, rows: [] }),
      fetchDiff: async () => ({ ok: true }),
    }));
  });
  await settle();
  const panel = readPanel(container);
  await act(async () => { root.unmount(); });
  return { spinner: panel.spinner, empty: panel.empty };
}

/* ── 6. THE SELECT RACE — click A, then B, and let A resolve LAST ─────────
 * Whichever row the admin chose last is the one whose diff must render. The
 * original `select` had no supersession guard at all, so the slower earlier
 * response overwrote the newer one.
 */
async function driveDetailRace() {
  const dom = makeDom();
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);

  const first = deferred();
  const second = deferred();
  const byId = new Map([
    [ROWS[0].id, first],   // version 3 — clicked first, resolves LAST
    [ROWS[1].id, second],  // version 2 — clicked second, resolves FIRST
  ]);
  const fetchDiff = ({ versionId }) => byId.get(versionId)?.promise ?? Promise.resolve({ ok: true });

  await act(async () => {
    root.render(h(CourseVersionHistory, {
      courseId: 'EXCEL-HR-02', active: true,
      listVersions: async () => RESPONSE, fetchDiff,
    }));
  });
  await settle();

  const rowButtons = [...container.querySelectorAll('button')];
  /**
   * REPORTED, NOT THROWN. Against the unfixed component the list never renders,
   * so there is nothing to click — and a drive that crashed here would surface
   * as an unreadable child-process stack instead of the finding. The test reads
   * `rowsClickable` and says plainly that the race could not be exercised.
   */
  if (rowButtons.length < 2) {
    await act(async () => { root.unmount(); });
    return { rowsClickable: false, showsSecondClickDiff: false, showsFirstClickDiff: false };
  }

  const click = (el) => act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

  // Row order is newest first: [0] is version 3, [1] is version 2.
  await click(rowButtons[0]);
  await click(rowButtons[1]);

  // The SECOND click's request settles first…
  await act(async () => {
    second.resolve({
      ok: true, kind: 'content', file: null, preImageMissing: false,
      previousMissing: false, previousVersionNumber: 1,
      changes: [{ key: 'course_price', label: 'ราคา', kind: 'number', order: 23, before: 12900, after: 15900 }],
    });
    await new Promise((r) => setTimeout(r, 10));
  });
  // …and the FIRST click's request settles afterwards, out of order.
  await act(async () => {
    first.resolve({
      ok: true, kind: 'content', file: null, preImageMissing: false,
      previousMissing: false, previousVersionNumber: 2,
      changes: [{ key: 'course_name', label: 'ชื่อหลักสูตร', kind: 'text', order: 10, before: 'เก่า', after: 'ใหม่' }],
    });
    await new Promise((r) => setTimeout(r, 20));
  });

  const text = container.textContent ?? '';
  await act(async () => { root.unmount(); });
  return {
    rowsClickable: true,
    // The LAST click was version 2, whose diff is the price change.
    showsSecondClickDiff: text.includes('ราคา'),
    // The first click's diff must NOT have overwritten it.
    showsFirstClickDiff: text.includes('ชื่อหลักสูตร'),
  };
}

const results = {
  openTab: await driveOpenTab(),
  tabAwayAndBack: await driveTabAwayAndBack(),
  rejectThenRetry: await driveRejectThenRetry(),
  notOk: await driveNotOk(),
  empty: await driveEmpty(),
  detailRace: await driveDetailRace(),
};

process.stdout.write(JSON.stringify(results));
