/**
 * The DOM drive behind test/render/bundleAttendeeCount.test.mjs, in ITS OWN
 * PROCESS. Prints one JSON object on stdout and exits.
 *
 * Same idiom and same reason as test/headerPropsParity.case.mjs and
 * test/navSeeAllPosition.case.mjs: `AttendeesList` keeps the `attendees` field
 * array in step with the `จำนวนผู้สมัคร` select from an EFFECT, so
 * `renderToStaticMarkup` — which runs no effects — sees zero attendee cards
 * whatever the count says and can tell you nothing about this bug. `act` needs
 * a development React and the suite pins NODE_ENV=production, so the drive runs
 * where the environment can be its own.
 *
 * ── WHAT IT DRIVES ──────────────────────────────────────────────────────────
 * `BundleStepForm` — the bundle wizard's กรอกข้อมูล step — mounted once per
 * scenario, with nothing touched afterwards. For each mount it reports what a
 * customer would see on FIRST RENDER: the select's value, how many attendee
 * cards are on screen, their labels, and whether the coordinator mirror card
 * is there.
 *
 * The scenarios are the four states this step can be entered in: fresh, and
 * three restores out of sessionStorage — because each step of this wizard is
 * its own route, so arriving at กรอกข้อมูล from เลือกรอบ or from the browser's
 * back button is always a restore.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/bundleAttendeeSeed.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act, StrictMode, useEffect, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BundleStepForm } = await import('@/components/registration/BundleWizard');

/*
  A REAL ORIGIN, because sessionStorage needs one: jsdom refuses storage for
  an opaque origin, and the wizard mounts below read their draft out of it —
  which is the whole point of this drive.
*/
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/registration/bundle/step-2?page=p1&section=s1',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
/*
  `sessionStorage` BY ITS BARE NAME, because that is how the wizard reads it.
  Without this the component's `sessionStorage.getItem(...)` resolves to an
  undefined global, throws, and is swallowed by the try/catch the wizard wraps
  every storage read in — so every restore would look empty and this drive
  would report a bug that is its own.
*/
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const attendee = (n) => ({ firstName: `A${n}`, lastName: `B${n}`, email: '', phone: '' });

/**
 * The restores are spelled as whole stored payloads rather than patches, so a
 * reader can see exactly what came back out of sessionStorage — that is the
 * input the bug is about.
 */
const SCENARIOS = {
  /** A customer arriving with nothing stored. */
  fresh: null,

  /**
   * THE REPORTED STATE. `attendeesCount: 1` beside two stored attendee rows.
   * Reachable without any contrivance: set the count to 2, fill both, go to
   * ตรวจสอบ, come back, set it to 1, leave the step again. The count is what
   * the select writes; the rows are what the field array wrote.
   */
  countOneTwoRows: {
    attendeesCount: 1,
    attendeesListProvided: true,
    attendees: [attendee(1), attendee(2)],
    coordinator: { firstName: 'C', lastName: 'D', email: 'c@d.test', phone: '0812345678', isAttending: false },
  },

  /** A consistent restore — three asked for, three stored. */
  countThreeThreeRows: {
    attendeesCount: 3,
    attendeesListProvided: true,
    attendees: [attendee(1), attendee(2), attendee(3)],
    coordinator: { firstName: 'C', lastName: 'D', email: 'c@d.test', phone: '0812345678', isAttending: false },
  },

  /**
   * The coordinator-is-attendee interaction, which is the one rule that makes
   * "cards == count" false on purpose: slot 1 is the coordinator's mirror card
   * and only count-1 editable cards are drawn.
   */
  coordinatorAttendingCountTwo: {
    attendeesCount: 2,
    attendeesListProvided: true,
    attendees: [attendee(1)],
    coordinator: { firstName: 'C', lastName: 'D', email: 'c@d.test', phone: '0812345678', isAttending: true },
  },

  /** The opt-out: no cards at all, whatever the count says. */
  optedOutCountThree: {
    attendeesCount: 3,
    attendeesListProvided: false,
    attendees: [],
    coordinator: { firstName: 'C', lastName: 'D', email: 'c@d.test', phone: '0812345678', isAttending: false },
  },
};

const report = {};

for (const [name, initialValues] of Object.entries(SCENARIOS)) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      h(BundleStepForm, {
        pageId: 'p1',
        sectionId: 's1',
        initialValues,
        onSubmit() {},
        backHref: null,
      }),
    );
  });
  // A second flush: the length sync is an effect whose own dependency is
  // `fields.length`, so it can legitimately need more than one pass to settle.
  await act(async () => {});

  const select = host.querySelector('select[name="attendeesCount"]');
  const cards = [...host.querySelectorAll('button[aria-expanded]')]
    .map((b) => b.textContent.replace(/\s+/g, ' ').trim())
    .filter((t) => t.startsWith('ผู้เข้าอบรมท่านที่'));

  /**
   * THE FIELD ARRAY'S OWN LENGTH, read off the registered inputs rather than
   * through a submit. `requestInvoice` defaults TRUE on this form with no
   * invoice object, so the schema refuses it and `onSubmit` would never fire;
   * a drive that waited for one would report nothing at all. The registered
   * inputs ARE the array, so counting their indices answers the question the
   * submit was there for: are there rows nobody can see?
   */
  const rows = new Set(
    [...host.querySelectorAll('input[name^="attendees."]')]
      .map((el) => el.getAttribute('name').split('.')[1]),
  );

  report[name] = {
    selectValue: select ? Number(select.value) : null,
    selectOptions: select ? select.options.length : null,
    cardCount: cards.length,
    cardLabels: cards,
    mirrorCard: host.textContent.includes('ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)'),
    optOutNotice: host.textContent.includes('แจ้งรายชื่อผู้เข้าอบรมภายหลัง'),
    fieldArrayRows: rows.size,
  };

  await act(async () => { root.unmount(); });
  host.remove();
}

/**
 * ── AND NOW THE WHOLE WIZARD, WHICH IS WHERE THE BUG WAS SEEN ──────────────
 *
 * The mounts above drive `BundleStepForm` directly, which is the component that
 * owns the `useForm`. That is not the surface the mismatch was reported on: on
 * the live page the step is reached through `BundleWizard`, which reads the
 * draft out of sessionStorage in an EFFECT and passes it down as
 * `initialValues` — and `useForm` reads `defaultValues` exactly once, on its
 * first mount. If the form mounts BEFORE the draft arrives, every later value
 * is ignored and the two halves of the screen come from different sources.
 *
 * So this section mounts the wizard the way a route does, with the pair, the
 * step and the stored draft all in place, and reports the same facts.
 */
const { BundleWizard } = await import('@/components/registration/BundleWizard');

const PAIR = { pageId: 'p1', sectionId: 's1' };
const STORAGE_KEY = 'registration-bundle-v1';
const FORMDATA_KEY = 'registration-bundle-formdata-v1';

/** A bundle of TWO courses, each offering one round — the reported fixture. */
const PICK_ITEMS = [
  { id: 'i1', courseId: 'C-1', rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-02'], type: 'classroom' } }] },
  { id: 'i2', courseId: 'C-2', rounds: [{ id: 'r2', snapshot: { id: 'r2', dates: ['2026-12-10'], type: 'classroom' } }] },
];
const LIVE = { r1: { status: 'open', dates: ['2026-11-02'], type: 'classroom' }, r2: { status: 'open', dates: ['2026-12-10'], type: 'classroom' } };

/**
 * ── THE LEG COUNT MUST NOT REACH THE ATTENDEE COUNT ───────────────────────
 * A bundle is ONE person or group registering for every course in it, so the
 * number of items — and the number of legs the route later writes — is a
 * storage detail with no bearing on how many people are coming. The reported
 * bundle had two courses and showed two cards, which is the correlation this
 * pins against: the same wizard is driven with two items and with five, and
 * the answer has to be `1` both times.
 */
const PICK_ITEMS_FIVE = Array.from({ length: 5 }, (_, i) => ({
  id: `j${i + 1}`,
  courseId: `D-${i + 1}`,
  rounds: [{ id: `q${i + 1}`, snapshot: { id: `q${i + 1}`, dates: ['2026-11-02'], type: 'classroom' } }],
}));
const LIVE_FIVE = Object.fromEntries(
  PICK_ITEMS_FIVE.map((it) => [it.rounds[0].id, { status: 'open', dates: ['2026-11-02'], type: 'classroom' }]),
);

const WIZARD_SCENARIOS = {
  /** Nothing stored: a customer who reached กรอกข้อมูล in this session. */
  wizardNoDraft: null,
  /** THE REPORTED STATE, restored out of storage by the wizard itself. */
  wizardCountOneTwoRows: SCENARIOS.countOneTwoRows,
  /** And a consistent one, as the control. */
  wizardCountThreeThreeRows: SCENARIOS.countThreeThreeRows,
};

const LEGS = {
  twoCourses: { items: PICK_ITEMS, live: LIVE },
  fiveCourses: { items: PICK_ITEMS_FIVE, live: LIVE_FIVE },
};

for (const [name, draft] of Object.entries(WIZARD_SCENARIOS)) {
 for (const [legName, legs] of Object.entries(LEGS)) {
  for (const strict of [false, true]) {
  dom.window.sessionStorage.clear();
  if (draft) {
    const stored = JSON.stringify({ ...draft, ...PAIR });
    dom.window.sessionStorage.setItem(STORAGE_KEY, stored);
    dom.window.sessionStorage.setItem(FORMDATA_KEY, stored);
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  const tree = h(BundleWizard, {
        ...PAIR,
        step: 2,
        pickItems: legs.items,
        sequential: false,
        liveStatusById: legs.live,
        today: '2026-10-08',
        courseTitleByItemId: {},
        summaryLines: [],
        listPrice: null,
        netPrice: null,
        backHref: null,
  });
  await act(async () => {
    root.render(strict ? h(StrictMode, null, tree) : tree);
  });
  await act(async () => {});
  await act(async () => {});

  const select = host.querySelector('select[name="attendeesCount"]');
  const cards = [...host.querySelectorAll('button[aria-expanded]')]
    .map((b) => b.textContent.replace(/\s+/g, ' ').trim())
    .filter((t) => t.startsWith('ผู้เข้าอบรมท่านที่'));
  /**
   * THE FIELD ARRAY'S OWN LENGTH, read off the DOM rather than through a
   * submit: `requestInvoice` defaults true with no invoice, so this form cannot
   * validate without a full billing block and `onSubmit` would never fire. The
   * registered inputs ARE the array, so counting them answers the question the
   * submit was being used for — are there rows nobody can see?
   */
  const rowInputs = new Set(
    [...host.querySelectorAll('input[name^="attendees."]')]
      .map((el) => el.getAttribute('name').split('.')[1]),
  );

  report[`${name}_${legName}${strict ? '_strict' : ''}`] = {
    mounted: Boolean(select),
    legCount: legs.items.length,
    selectValue: select ? Number(select.value) : null,
    cardCount: cards.length,
    cardLabels: cards,
    fieldArrayRows: rowInputs.size,
    coordinatorName: host.querySelector('input[name="coordinator.firstName"]')?.value ?? null,
  };

  await act(async () => { root.unmount(); });
  host.remove();
  }
 }
}

/**
 * ── AND THE SAME THING UNDER STRICT MODE, WHICH IS WHAT `next dev` RUNS ───
 *
 * next.config.mjs sets `reactStrictMode: true`, so in development React
 * mounts every component, unmounts it and mounts it again — running each
 * effect TWICE with the first render's closure. An effect that RECONCILES two
 * values is fine under that; one that APPLIES A DELTA is not, and
 * `AttendeesList` applied a delta: `append(EMPTY_ATTENDEE)` once per missing
 * row, computed from a `fields.length` that the second invocation still sees
 * as the pre-append value.
 *
 * This is the only section that reproduces the reported screen, and it is why
 * the plain mounts above all look correct.
 */
for (const [name, initialValues] of Object.entries(SCENARIOS)) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      h(StrictMode, null,
        h(BundleStepForm, {
          pageId: 'p1',
          sectionId: 's1',
          initialValues,
          onSubmit() {},
          backHref: null,
        }),
      ),
    );
  });
  await act(async () => {});

  const select = host.querySelector('select[name="attendeesCount"]');
  const cards = [...host.querySelectorAll('button[aria-expanded]')]
    .map((b) => b.textContent.replace(/s+/g, ' ').trim())
    .filter((t) => t.startsWith('ผู้เข้าอบรมท่านที่'));
  const rows = new Set(
    [...host.querySelectorAll('input[name^="attendees."]')]
      .map((el) => el.getAttribute('name').split('.')[1]),
  );

  report[`strict_${name}`] = {
    selectValue: select ? Number(select.value) : null,
    cardCount: cards.length,
    cardLabels: cards,
    fieldArrayRows: rows.size,
  };

  await act(async () => { root.unmount(); });
  host.remove();
}

/**
 * ── THE CONTROL, AND WITHOUT IT EVERY NUMBER ABOVE IS WORTHLESS ───────────
 *
 * Every assertion over this report says "rows equal the count". That would
 * also be true of a harness that cannot observe the defect at all — a drive
 * whose `act` flushes hid StrictMode's second effect pass, or a jsdom that
 * never double-invokes, would report the same clean numbers against the
 * BROKEN code.
 *
 * So this mounts the shape the fix replaced — an effect that APPLIES A DELTA
 * computed from the render's own snapshot — and reports what it produces. It
 * must come back with TWO rows for a target of one. If it ever reports one,
 * this drive has stopped being able to see the bug and the numbers above mean
 * nothing in either direction.
 */
function DeltaShape() {
  const [rows, setRows] = useState([]);
  const target = 1;
  useEffect(() => {
    if (rows.length < target) {
      const missing = target - rows.length;
      for (let i = 0; i < missing; i += 1) setRows((r) => [...r, 'x']);
    }
  }, [rows.length]);
  return h('div', { id: 'delta' }, String(rows.length));
}

/** The same component written as a RECONCILIATION — the shape the fix uses. */
function ReconcileShape() {
  const [rows, setRows] = useState([]);
  const target = 1;
  useEffect(() => {
    if (rows.length !== target) setRows(Array.from({ length: target }, () => 'x'));
  }, [rows.length]);
  return h('div', { id: 'reconcile' }, String(rows.length));
}

for (const [key, Comp] of [['controlDelta', DeltaShape], ['controlReconcile', ReconcileShape]]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(h(StrictMode, null, h(Comp))); });
  await act(async () => {});
  report[key] = { rows: Number(host.textContent) };
  await act(async () => { root.unmount(); });
  host.remove();
}

process.stdout.write(JSON.stringify(report, null, 2));
