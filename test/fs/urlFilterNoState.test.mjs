import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE URL IS THE ONLY PLACE A FILTER LIVES.
 *
 * ── WHY THIS IS A SOURCE SCAN AND NOT A BEHAVIOURAL TEST ────────────────────
 * The defect is a NAVIGATION-TIMING one and this runner cannot stage it. It
 * needs a surviving component instance re-rendered with changed props: React
 * keeps the instance when you navigate to the same route with different
 * searchParams, so `useState(initialSource)` holds the old value while the props
 * carry the new one. Reproducing that requires `createRoot` and a second render
 * into the same root, which this suite forbids for a measured reason — it leaks
 * `globalThis.window` across the shared process and once broke twenty-eight
 * render tests.
 *
 * `renderToStaticMarkup` cannot stand in: on a FIRST render, state seeded from a
 * prop and the prop itself are the same value, so a render assertion passes
 * identically before and after the fix. That is the "passes for the wrong
 * reason" case, and writing one here would have been worse than writing nothing.
 *
 * So this file asserts the SHAPE that makes the defect unrepresentable: a filter
 * that is never copied into state cannot go stale. It reddens the moment anyone
 * reintroduces the copy, which is the actual regression to defend against — the
 * pattern was found on three admin screens and three public ones, so it comes
 * back by habit, not by accident.
 *
 * The behavioural proof is a click-test, recorded in the commit message. It is
 * not a test and is not counted as one.
 *
 * ── THE CONFORMANCE TARGET ──────────────────────────────────────────────────
 * AuditLogClient, WebhookLogsClient and DashboardClient already hold their
 * filters as props. They are asserted here too, as the reference — if one of
 * them ever regresses, the rule loses the example it is argued from.
 */

/**
 * Screens whose filters come from the URL. `filters` are the prop names.
 *
 * MasterclassRegistrationsClient joins this list in the commit that converts it.
 * A screen is added here only once it is fully converted — a half-converted
 * filter screen is worse than an unconverted one, because the surviving state
 * writes itself back into the URL on the next click.
 */
const FILTER_SCREENS = [
  {
    rel: 'src/app/admin/registrations/_components/RegistrationsClient.jsx',
    component: 'RegistrationsClient',
    filters: ['status', 'q', 'source', 'range'],
  },
];

/** Screens that already followed the rule and are the reference for it. */
const REFERENCE_SCREENS = [
  'src/app/admin/audit-log/_components/AuditLogClient.jsx',
  'src/app/admin/webhook-logs/_components/WebhookLogsClient.jsx',
  'src/app/admin/_components/DashboardClient.jsx',
];

/**
 * Every `useState(...)` argument in a source file.
 *
 * Deliberately shallow — it captures up to the first `)` or `,`, which is enough
 * for the seeded-from-a-prop forms this rule is about (`useState(initialQ)`,
 * `useState(sp.status)`, `useState(searchParams.get('q'))`) and cannot be
 * defeated by a nested call, because the identifier still appears in the slice.
 */
function useStateArgs(src) {
  return [...src.matchAll(/useState(?:<[^>]*>)?\(([^)]*)\)/g)].map((m) => m[1].trim());
}

for (const { rel, component, filters } of FILTER_SCREENS) {
  const src = readSource(rel).code;

  test(`${component}: the filters arrive as props`, () => {
    const sig = new RegExp(`export function ${component}\\(\\{([\\s\\S]*?)\\}\\)`);
    const m = sig.exec(src);
    assert.ok(m, `${component} signature not found`);
    for (const f of filters) {
      assert.match(m[1], new RegExp(`\\b${f}\\b`), `${f} is not a prop of ${component}`);
    }
  });

  /** THE RULE. */
  test(`${component}: no filter is copied into useState`, () => {
    for (const arg of useStateArgs(src)) {
      for (const f of filters) {
        assert.ok(
          !new RegExp(`\\b${f}\\b`, 'i').test(arg),
          `useState(${arg}) seeds the ${f} filter into state — it will survive a navigation`
        );
      }
      assert.ok(
        !/\binitial/i.test(arg),
        `useState(${arg}) seeds state from an "initial" prop — that prefix is the smell this rule is about`
      );
    }
  });

  /**
   * No `initial*` PROP for a filter either.
   *
   * The prop name is half the defect: `initialSource` reads as "a starting value
   * you are expected to take over", and the next person takes it over with
   * `useState`. Removing the state while keeping the name leaves the invitation.
   */
  test(`${component}: no filter is named initial*`, () => {
    for (const f of filters) {
      const initialName = new RegExp(`initial${f[0].toUpperCase()}${f.slice(1)}`, 'i');
      assert.ok(!initialName.test(src), `${component} still has an initial-prefixed ${f} prop`);
    }
  });

  /** No setter can exist for a value that is not state. */
  test(`${component}: no filter setter survives`, () => {
    for (const f of filters) {
      const setter = new RegExp(`\\bset${f[0].toUpperCase()}${f.slice(1)}\\b`);
      assert.ok(!setter.test(src), `${component} still has a set${f} setter`);
    }
  });

  /**
   * `navigate` re-serialises FROM THE PROPS.
   *
   * This is the second-order half of the defect and the one that turned a
   * display bug into a data bug: the next URL is built from the filter values,
   * so a stale one is written back and becomes the real filter on the following
   * click. Every filter must appear in the object `navigate` serialises.
   */
  test(`${component}: navigate serialises every filter`, () => {
    const nav = /const navigate = useCallback\(([\s\S]*?)\n  \}, \[/.exec(src);
    assert.ok(nav, `${component}: navigate not found in the expected shape`);
    for (const f of filters) {
      assert.match(nav[1], new RegExp(`\\b${f}\\b`), `navigate does not carry ${f}`);
    }
  });
}

// ── The reference implementations, asserted so the argument keeps its examples ─

for (const rel of REFERENCE_SCREENS) {
  const name = rel.split('/').pop().replace('.jsx', '');
  test(`${name}: still holds no URL filter in state (the reference)`, () => {
    const src = readSource(rel).code;
    for (const arg of useStateArgs(src)) {
      assert.ok(
        !/\binitial(Status|Q|Range|Source|Filters|CourseId|BatchId)\b/i.test(arg),
        `${name} regressed: useState(${arg}) copies a URL filter`
      );
    }
  });
}

/**
 * CONTROL: `useStateArgs` actually finds useState calls.
 *
 * Every assertion above is a NEGATIVE — "no useState seeds a filter" — and a
 * broken extractor returning [] satisfies all of them forever. This proves the
 * extractor works by pointing it at a file that legitimately holds local UI
 * state, and at a synthetic string of the exact shape the rule bans.
 */
test('CONTROL: the useState extractor finds real calls', () => {
  const audit = readSource('src/app/admin/audit-log/_components/AuditLogClient.jsx').code;
  const args = useStateArgs(audit);
  assert.ok(args.length >= 2, `extractor found ${args.length} useState calls in AuditLogClient — expected its local UI state`);
});

test('CONTROL: the rule rejects the banned shape when it is present', () => {
  const offending = useStateArgs("const [source, setSource] = useState(initialSource);");
  assert.deepEqual(offending, ['initialSource']);
  assert.ok(/\binitial/i.test(offending[0]), 'the matcher would not have flagged the shape it bans');
});
