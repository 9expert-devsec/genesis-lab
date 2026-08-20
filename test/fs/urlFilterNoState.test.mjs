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
  {
    rel: 'src/app/admin/masterclass/registrations/_components/MasterclassRegistrationsClient.jsx',
    component: 'MasterclassRegistrationsClient',
    filters: ['status', 'q', 'range', 'courseId', 'batchId', 'licenseScope'],
  },
  /**
   * Promoted out of OUTSTANDING, where it sat as "the half-fixed case": three
   * filters derived, `q` alone in `useState`. All four are props now.
   *
   * It belongs in THIS list rather than in DERIVED_SCREENS because page.jsx is
   * what reads `searchParams` and hands the values down — the same shape as the
   * two admin screens above, not CourseListClient's read-the-hook-directly one.
   *
   * The conversion carried a second consequence the other entries did not: the
   * hook it removed was the only reason the route needed a Suspense boundary,
   * so the grid's server render stopped depending on one. That half is guarded
   * in test/fs/articlesServerRender and test/render/articlesGridServerRender.
   */
  {
    rel: 'src/app/(public)/articles/_components/ArticlesPageClient.jsx',
    component: 'ArticlesPageClient',
    filters: ['q', 'tag', 'program', 'skill'],
  },
  /**
   * Promoted out of OUTSTANDING. Its filters were the LAZILY-SEEDED variant —
   * `useState(() => searchParams.get('q'))` — which is the same defect wearing
   * the costume that looks most like a fix: the initialiser reads the live URL,
   * so it is correct on mount and only wrong on a navigation that keeps the
   * instance. It is now the AuditLogClient shape, filters in as props.
   *
   * This screen is also the reason the `navigate serialises every filter`
   * matcher below was fixed: its `next` object legitimately LEADS with a
   * filter, and the old pattern could not match a key in first position.
   */
  {
    rel: 'src/app/admin/courses/_components/CoursesAdminClient.jsx',
    component: 'CoursesAdminClient',
    filters: ['q', 'program', 'type'],
  },
];

/**
 * ── PRESENTATIONAL COMPONENTS THAT HOLD A FILTER VALUE ──────────────────────
 *
 * A third list, because the rule has to follow the VALUE and the value has
 * moved. The registrations search box no longer lives in RegistrationsClient —
 * it is in ListPanel, which receives `q` as a prop and renders it as an
 * uncontrolled `defaultValue` + `key`. Everything the rule forbids is forbidden
 * there for exactly the same reason, and nothing above this line would have
 * noticed: FILTER_SCREENS matches on `export function <Component>({…})` and
 * would go on passing over a `useState(q)` sitting one file away.
 *
 * That is the failure mode the brief names — an enumeration that stops reaching
 * the file the code moved into — so the enumeration moved with it, in the same
 * commit.
 *
 * These entries assert LESS than FILTER_SCREENS does, deliberately: a
 * presentational component has no `navigate` to serialise from and no page.jsx
 * behind it, so only the two claims that still mean something are made — the
 * filter arrives as a prop, and it is never copied into state.
 */
const FILTER_BEARING_COMPONENTS = [
  {
    rel: 'src/app/admin/registrations/_components/ListPanel.jsx',
    component: 'ListPanel',
    filters: ['q'],
  },
  {
    /**
     * ── ADDED IN THE SAME COMMIT THAT CREATED IT — ROUND 8 ──────────────────
     *
     * The ตัวกรอง disclosure. It carries THREE filters and it is exactly the
     * shape this enumeration exists for: a new component holding a filter, on
     * the screen that shipped wrong chrome over right data from a `useState`
     * seeded off a prop.
     *
     * THE ENUMERATION IS HAND-WRITTEN AND BY PATH, which is its known weakness —
     * a component nobody adds here is a component nobody checks. That is the same
     * per-name weakness that let `q` go missing from the counts for four rounds
     * (see lib/registrations/listFilter's SCOPE_PARAMS). It is not fixed here
     * because the two lists answer different questions and merging them would
     * make neither readable; the mitigation is that adding a filter-bearing
     * component and forgetting this line is now a thing the round's own report
     * asks about explicitly.
     *
     * `course` is the filter name; `from` and `to` are the date pair. All three
     * arrive as props and none is copied into state — the panel's inputs are
     * uncontrolled with `defaultValue` + `key`, exactly as the search box beside
     * it is, and `open` belongs to the `<details>` element rather than to React.
     */
    rel: 'src/app/admin/registrations/_components/FilterPanel.jsx',
    component: 'FilterPanel',
    filters: ['course', 'window'],
  },
];

for (const { rel, component, filters } of FILTER_BEARING_COMPONENTS) {
  const src = readSource(rel).code;

  test(`${component}: the filter arrives as a prop`, () => {
    const sig = new RegExp(`export function ${component}\\(\\{([\\s\\S]*?)\\}\\)`);
    const m = sig.exec(src);
    assert.ok(m, `${component} signature not found`);
    for (const f of filters) {
      assert.match(m[1], new RegExp(`\\b${f}\\b`), `${f} is not a prop of ${component}`);
    }
  });

  test(`${component}: no filter is copied into useState`, () => {
    for (const arg of useStateArgs(src)) {
      for (const f of filters) {
        assert.ok(
          !new RegExp(`\\b${f}\\b`).test(arg),
          `useState(${arg}) seeds the ${f} filter into state — it will survive a navigation`
        );
      }
      assert.ok(!/\binitial/i.test(arg), `useState(${arg}) seeds state from an "initial" prop`);
    }
  });

  /**
   * The input stays UNCONTROLLED and stays `key`ed.
   *
   * This is the half a `useState` scan cannot see. An input that becomes
   * `value={q}` with no state behind it is not stale — it is FROZEN, and the box
   * stops accepting keystrokes entirely. And dropping the `key` while keeping
   * `defaultValue` reintroduces staleness without any state at all: React reuses
   * the element across a navigation, so the box goes on showing a term the list
   * is no longer filtered by.
   */
  test(`${component}: every filter input is uncontrolled and re-keyed`, () => {
    /**
     * ── GENERALISED IN ROUND 8, AND THE OLD FORM WAS PER-NAME ────────────────
     *
     * This asserted `defaultValue={q}` and `key={q}` literally, so it applied to
     * exactly one filter on exactly one component — and it FAILED the moment a
     * second filter-bearing component was added to the enumeration, because
     * FilterPanel has no `q`.
     *
     * That failure was the right outcome and the wrong reason: the claim is not
     * about `q`, it is about every filter input on every component in this list.
     * It is driven by `filters` now, which is the same list the two assertions
     * above read.
     *
     * The claim itself is unchanged and is the half a `useState` scan cannot
     * see. An input that becomes `value={…}` with no state behind it is not
     * stale — it is FROZEN, and stops accepting keystrokes. And dropping the
     * `key` while keeping `defaultValue` reintroduces staleness with no state at
     * all: React reuses the element across a navigation, so the control goes on
     * showing a value the list is no longer filtered by.
     */
    assert.match(src, /defaultValue=\{/, `${component} has no uncontrolled input at all`);

    for (const f of filters) {
      // The filter must appear inside a `key=` expression — that is what makes
      // the control follow a navigation.
      const keys = [...src.matchAll(/key=\{([^}]*(?:\{[^}]*\})?[^}]*)\}/g)].map((m) => m[1]);
      assert.ok(keys.some((k) => new RegExp(`\\b${f}\\b`).test(k)),
        `no control is re-keyed on \`${f}\` — it will show a stale value after a navigation`);
    }

    // No `<input>` is controlled. `<select>` is exempt: React accepts
    // `defaultValue` on it and a controlled select is a different failure.
    assert.ok(!/<input[^>]*\svalue=\{/.test(src),
      `${component} has a controlled input — it will stop accepting keystrokes`);
  });
}

/**
 * Screens that derive their filters from `useSearchParams` DIRECTLY, rather than
 * from server props.
 *
 * A separate list because the shape is genuinely different — there is no
 * `page.jsx` reading searchParams to assert against, so "the filters arrive as
 * props" does not apply — but the rule is the same one: the URL is the only
 * place the filter lives.
 */
const DERIVED_SCREENS = [
  {
    rel: 'src/app/(public)/training-course/_components/CourseListClient.jsx',
    component: 'CourseListClient',
    // The identifiers, and the URL keys they are read from.
    filters: ['skillSlug', 'programName', 'view'],
    // `search` is NOT here: it is local by design (search terms are noisy for
    // URL history) and has never been a URL parameter. A value that lives in
    // exactly one place is already conformant.
  },
];

/**
 * ── OUTSTANDING, AND SELF-INVALIDATING BY CONSTRUCTION ──────────────────────
 *
 * ONE screen still holds a URL filter in state. It is recorded here so the
 * remaining work is visible in the suite rather than in somebody's notes.
 * (It was three. ArticlesPageClient and CoursesAdminClient have both been
 * converted and are now in FILTER_SCREENS — the register doing exactly what the
 * note below says it must, twice.)
 *
 * THIS IS NOT AN ALLOWLIST. An allowlist of known-broken files is a guard that
 * has quietly become decoration: it grows, nobody re-reads it, and a file that
 * was fixed years ago still sits in it exempting a defect that no longer exists.
 *
 * Each entry names the file AND the EXACT source line that is outstanding, and
 * asserts that line is STILL THERE. So fixing the file breaks this entry: the
 * line disappears, the assertion fails, and whoever did the fix is told to
 * delete the entry and add the screen to DERIVED_SCREENS or FILTER_SCREENS
 * above. The register cannot outlive the defects it records.
 *
 * Lines are matched after comment/import scrubbing and compared trimmed, so
 * reindentation does not produce a false failure — but a genuine edit to the
 * statement does, which is the point.
 */
const OUTSTANDING = [
  {
    rel: 'src/app/(public)/search/_components/SearchClient.jsx',
    why: 'q + debouncedQ seeded from the initialQ prop; navigating to a bare /search keeps the old term',
    lines: [
      'const [q, setQ] = useState(initialQ);',
      'const [debouncedQ, setDebouncedQ] = useState(initialQ);',
    ],
  },
];

/** Screens that already followed the rule and are the reference for it. */
const REFERENCE_SCREENS = [
  'src/app/admin/audit-log/_components/AuditLogClient.jsx',
  'src/app/admin/webhook-logs/_components/WebhookLogsClient.jsx',
  'src/app/admin/_components/DashboardClient.jsx',
];

/**
 * Every `useState(...)` argument in a source file, to its MATCHING paren.
 *
 * ── WHY THIS IS NOT THE `[^)]*` ONE-LINER IT USED TO BE ────────────────────
 * It was `/useState(?:<[^>]*>)?\(([^)]*)\)/`, which stops at the FIRST `)`. For
 * the plain forms this rule was written against (`useState(initialQ)`) that is
 * enough. For a LAZY INITIALISER it is not, and the difference is total rather
 * than partial:
 *
 *     useState(() => searchParams.get('q') ?? '')
 *              ^^ the first `)` is the arrow's own empty parameter list
 *
 * so the captured argument was the two characters `()`, and every assertion
 * below — all of which are negatives — passed on it. That is defect 6 in
 * test/sourceScan.mjs's header ("a regex bounded by `[^)]*` could not cross the
 * arrow function's OWN `)`"), and it is the reason CoursesAdminClient's entry in
 * OUTSTANDING had to record its three lines as EXACT TEXT: the rule could not
 * see the shape at all, so the register was doing the rule's job by hand.
 *
 * That file is now in FILTER_SCREENS. Moving it there under an extractor blind
 * to the very shape it used to have would have been a downgrade wearing the
 * costume of a fix — the screen would be "guarded" by four assertions that
 * cannot fail on it.
 *
 * Counts depth instead, so the argument comes out whole and a nested call, an
 * arrow, or an object literal cannot truncate it.
 */
function useStateArgs(src) {
  const out = [];
  const opener = /useState(?:<[^>]*>)?\(/g;
  let m;
  while ((m = opener.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      i += 1;
    }
    // Unbalanced (truncated source) → skip rather than capture to end-of-file,
    // which would sweep the whole rest of the module into one "argument".
    if (depth === 0) out.push(src.slice(start, i - 1).trim());
  }
  return out;
}

test('CONTROL: the extractor captures a LAZY initialiser whole, not just its `()`', () => {
  // The defect, pinned. Without this the extractor could go back to `[^)]*`
  // and every negative assertion in this file would keep passing.
  const lazy = useStateArgs("const [search, setSearch] = useState(() => searchParams.get('q') ?? '');");
  assert.deepEqual(lazy, ["() => searchParams.get('q') ?? ''"]);
  assert.ok(/\bq\b/i.test(lazy[0]), 'the rule could not see the filter inside a lazy initialiser');
  assert.ok(/searchParams/.test(lazy[0]), 'the rule could not see the URL read inside a lazy initialiser');

  // The plain forms it always handled still come out identically.
  assert.deepEqual(useStateArgs('useState(initialSource)'), ['initialSource']);
  assert.deepEqual(useStateArgs('useState(null)'), ['null']);
  assert.deepEqual(useStateArgs('useState()'), ['']);
  // And a nested call no longer truncates.
  assert.deepEqual(useStateArgs('useState(buildThing(a, b))'), ['buildThing(a, b)']);
});

/**
 * `f` appearing as a KEY of an object literal's captured body — including in
 * FIRST position.
 *
 * ── THE MATCHER DEFECT THIS FIXES, AT BOTH ENDS ────────────────────────────
 * It was `(^|[{,]\s*)…[,:}]`. The capture from `/const next = \{([^}]*)\}/`
 * excludes BOTH braces, and the old pattern assumed neither was missing:
 *
 *   · LEADING. For `const next = { q, program, type }` the capture is
 *     ` q, program, type ` — it begins with a SPACE. The `^` branch had to
 *     match `q` at index 0 where a space sits, and the `[{,]` branch had no
 *     comma to find. The first key was unmatchable.
 *   · TRAILING. The last key has no `}` after it either, so a key in final
 *     position with no trailing comma could not match the `[,:}]` terminator.
 *
 * Both went unnoticed because the two original screens lead with a non-filter
 * (`page: '1'`, `cursor: ''`) and end with `...overrides`, so every filter they
 * declare happens to sit between two commas. CoursesAdminClient has no such key
 * to lead with, and adding one purely to satisfy a regex would be the test
 * dictating the code.
 *
 * Still a KEY match, not a substring one: the name must be followed by `,`,
 * `:`, `}` or the end of the object body, so `...overrides` and a longer
 * identifier ending in the same letters cannot satisfy it.
 */
const FIRST_CLASS_KEY = (f) => new RegExp(`(^\\s*|[{,]\\s*)${f}(\\s*[,:}]|\\s*$)`);

test('CONTROL: the next-object matcher finds a key at BOTH ends, and rejects a non-key', () => {
  // The defect, pinned at each end. Without this the fix above could be
  // reverted and only the screens that sandwich every filter between two commas
  // would notice — which is exactly how it survived being written.
  assert.match(' q, program, type, ...overrides ', FIRST_CLASS_KEY('q'), 'first position');
  assert.match(' q, program, type ', FIRST_CLASS_KEY('type'), 'last position, no trailing comma');
  assert.match(" page: '1', status, q, source ", FIRST_CLASS_KEY('q'), 'the shape that always worked');
  assert.match(' menu: m, entity ', FIRST_CLASS_KEY('menu'), 'first position with a value');

  // And it is still a key match rather than a substring one.
  assert.ok(!FIRST_CLASS_KEY('q').test(' query, program '), 'a longer identifier satisfied the key match');
  assert.ok(!FIRST_CLASS_KEY('type').test(' ...overrides, subtype '), 'a suffix match was accepted');
  assert.ok(!FIRST_CLASS_KEY('skill').test(' q, program '), 'a missing key was reported as present');
  assert.ok(!FIRST_CLASS_KEY('q').test(' program, type '), 'a missing key at neither end was accepted');
});

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
    /**
     * The `next` OBJECT specifically, not the whole navigate body.
     *
     * The body also names every filter as a STRING literal in its
     * `isDefault` checks (`k === 'licenseScope'`), so a scan of the body
     * would go on matching after a filter was dropped from the serialised
     * object — green while the filter silently stopped reaching the URL.
     * This reads the object literal, where the filters appear as bare
     * identifiers.
     */
    const next = /const next = \{([^}]*)\}/.exec(src);
    assert.ok(next, `${component}: navigate's next-object not found in the expected shape`);
    for (const f of filters) {
      assert.match(
        next[1],
        FIRST_CLASS_KEY(f),
        `navigate does not serialise ${f} — it would be dropped from the next URL`
      );
    }
  });
}

/**
 * THE MASTERCLASS CONSEQUENCE, NAMED.
 *
 * On this screen a stale filter did more than mislabel the chrome: `courseId`
 * feeds a FETCH. The batch dropdown is loaded from it, so following one
 * `?courseId=A&batchId=…` deep link and then a second one for course B left the
 * table showing B's registrations beside a รุ่น dropdown still listing A's
 * batches — an admin could pick a batch that does not belong to the course on
 * screen.
 *
 * The fix is that `courseId` is a prop, so the effect's dependency is the URL's
 * value and it re-fetches on every navigation instead of once per mount. This
 * pins the dependency, because a `useState` copy would satisfy every other
 * assertion in this file the moment someone reintroduced it under another name.
 */
test('MasterclassRegistrationsClient: the batch options effect keys on the courseId prop', () => {
  const src = readSource('src/app/admin/masterclass/registrations/_components/MasterclassRegistrationsClient.jsx').code;
  assert.match(src, /getMasterclassBatchOptions\(courseId\)/, 'the batch fetch does not read courseId');
  assert.match(src, /\}, \[courseId\]\);/, 'the batch effect does not re-run when courseId changes');
});

// ── Screens deriving straight from useSearchParams ──────────────────────────

for (const { rel, component, filters } of DERIVED_SCREENS) {
  const src = readSource(rel).code;

  test(`${component}: every filter is read from searchParams, not stored`, () => {
    for (const f of filters) {
      const decl = new RegExp(`const ${f} = [^;]*searchParams`, 's');
      assert.match(src, decl, `${f} is not derived from searchParams on every render`);
    }
  });

  test(`${component}: no filter is copied into useState`, () => {
    for (const arg of useStateArgs(src)) {
      for (const f of filters) {
        assert.ok(!new RegExp(`\\b${f}\\b`).test(arg), `useState(${arg}) stores the ${f} filter`);
      }
      assert.ok(!/searchParams/.test(arg), `useState(${arg}) seeds state from the URL — it will go stale`);
    }
  });

  test(`${component}: no filter setter survives`, () => {
    for (const f of filters) {
      const setter = new RegExp(`\\bset${f[0].toUpperCase()}${f.slice(1)}\\b`);
      assert.ok(!setter.test(src), `${component} still has a set${f} setter`);
    }
  });

  /**
   * NO EFFECT MAY DEPEND ON `searchParams`. This is the defect itself.
   *
   * The removed sync effect listed `searchParams` in its own dependency array
   * and wrote the URL from state inside its body. So a navigation to the same
   * route with new parameters re-ran it with the OLD state and wrote the old
   * values back — deleting an incoming `?skill=`, or reverting it to the
   * previous one. Any future effect here that watches the URL and writes the URL
   * is that loop again.
   */
  test(`${component}: no effect depends on searchParams`, () => {
    const effects = [...src.matchAll(/useEffect\([\s\S]*?\}, \[([^\]]*)\]\)/g)].map((m) => m[1]);
    for (const deps of effects) {
      assert.ok(
        !/searchParams/.test(deps),
        `an effect depends on [${deps}] — a URL-watching effect that writes the URL is the erasure defect`
      );
    }
  });

  /**
   * ONE WRITER. The parameters are written in exactly one place, so "when does
   * the URL change" has a single answer, and ARRIVAL — which writes nothing at
   * all — stays distinguishable from an action.
   */
  test(`${component}: the URL is written in exactly one place`, () => {
    const writes = [...src.matchAll(/router\.(replace|push)\(/g)].length;
    assert.equal(writes, 1, `expected a single URL writer, found ${writes}`);
  });
}

// ── The outstanding register — self-invalidating ─────────────────────────────

for (const { rel, why, lines } of OUTSTANDING) {
  const name = rel.split('/').pop().replace('.jsx', '');

  test(`OUTSTANDING ${name}: still holds a URL filter in state (${why})`, () => {
    const src = readSource(rel).code;
    const present = src.split('\n').map((l) => l.trim());
    for (const line of lines) {
      assert.ok(
        present.includes(line.trim()),
        `${rel} no longer contains:\n    ${line.trim()}\n\n`
        + 'If you FIXED this screen: delete its entry from OUTSTANDING and add the\n'
        + 'file to DERIVED_SCREENS or FILTER_SCREENS so it is guarded from now on.\n'
        + 'If you merely edited the line: update the entry to the new text.\n'
        + 'This register records defects that still exist — it is not an allowlist,\n'
        + 'and it is designed to fail the moment it becomes stale.'
      );
    }
  });
}

test('CONTROL: the outstanding register is not empty and names real files', () => {
  // A register that silently emptied itself would make every assertion above
  // vacuous while reading as "all clear".
  assert.ok(OUTSTANDING.length > 0, 'the register is empty — say so deliberately rather than by deletion');
  for (const { rel, lines } of OUTSTANDING) {
    assert.ok(readSource(rel).code.length > 200, `${rel} scrubbed to nothing`);
    assert.ok(lines.length > 0, `${rel} has no outstanding line recorded`);
  }
});

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
