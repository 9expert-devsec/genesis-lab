import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, blankStringBodies } from '../sourceScan.mjs';

/**
 * A sync that writes a Mongo mirror must also regenerate the page that baked
 * the old copy.
 *
 * ── THE DEFECT THIS GUARDS ──────────────────────────────────────────────────
 * Every one of these writers feeds a public surface through a MONGOOSE read,
 * not a `fetch`. A mongoose read carries no Next cache tag, so there is nothing
 * to `revalidateTag`: the value is captured into statically rendered output and
 * only a path revalidation releases it. Write the collection and stop, and the
 * new data reaches a visitor only when an unrelated ISR timer happens to
 * expire.
 *
 * It has now shipped three times. syncLandingData kept ค้นหาสิ่งที่คุณสนใจ
 * showing an empty state for hours after the data behind it was correct.
 * syncNavMenuData kept a course out of the หลักสูตร mega menu while the cache
 * document, the upstream API and a fresh prerender all had it. syncInstructors
 * revalidated only /admin/instructors, which is force-dynamic, so the public
 * page got nothing from any caller.
 *
 * The invariant belongs to the WRITE, not to its callers. Each of these writers
 * has three or four callers and a trigger* wrapper that revalidates; the cron —
 * the main path — bypasses the wrapper every time.
 *
 * ── WHAT THIS GUARD CANNOT SEE ──────────────────────────────────────────────
 * Stated plainly, because a shape guard that is mistaken for a behavioural one
 * is worse than no guard:
 *
 *   · WHETHER THE CALL RUNS. This matches text, not execution. A
 *     `revalidatePath` inside `if (false)`, after an early `return`, or in a
 *     branch never taken satisfies it completely.
 *   · WHETHER THE PATH IS CORRECT. It asserts the literal argument written
 *     here. If /about-us moves to /team, this guard keeps passing against the
 *     stale literal until a human updates the table below.
 *   · WHETHER THE SURFACE IS STILL STATIC. The scope decisions depend on
 *     measured render modes (○ Static vs ƒ Dynamic). Nothing here re-measures
 *     the build output; a page flipping to force-dynamic, or losing it, is
 *     invisible. The /faq exemption is the one case where the premise IS
 *     checked — see the last test.
 *   · NEW WRITERS. The registry is hand-maintained. A seventh sync added
 *     tomorrow is not covered until someone adds a row. There is no derivation
 *     that would find it: "is a cache writer" is a judgement about intent, not
 *     a property of the text.
 *
 * It catches exactly one thing, which is the thing that keeps happening: an
 * existing writer losing its invalidation in a refactor.
 */

/**
 * The writers, and the EXACT argument each must pass.
 *
 * The scope differs per writer and is measured, not copied — see each sync's
 * own comment for the surfaces it feeds:
 *
 *   '/' + 'layout'   the data renders in PublicHeader, which mounts on every
 *                    public route, on the home page inline (it sits outside the
 *                    (public) group), and on the 404. No narrower expression
 *                    selects that set: (public) is a route GROUP and
 *                    contributes no path segment.
 *   a bare path      the data reaches exactly one statically cached surface.
 */
const WRITERS = [
  {
    rel: 'src/lib/landing/syncLandingData.js',
    collection: 'landing_cache',
    args: "'/'",
    surface: '/ (○ Static)',
  },
  {
    rel: 'src/lib/navmenu/syncNavMenuData.js',
    collection: 'nav_menu_cache',
    args: "'/', 'layout'",
    surface: 'PublicHeader → every static public route + / + 404',
  },
  {
    rel: 'src/lib/career-paths/syncCareerPaths.js',
    collection: 'career_paths',
    args: "'/', 'layout'",
    surface: 'PublicHeader career-path dropdown + /career-path-project',
  },
  {
    rel: 'src/lib/instructors/syncInstructors.js',
    collection: 'instructors',
    args: "'/about-us'",
    surface: '/about-us (○ Static)',
  },
  {
    rel: 'src/lib/promotions/syncPromotions.js',
    collection: 'promotions',
    args: "'/promotions'",
    surface: '/promotions (○ Static)',
  },
];

/**
 * Every REAL `revalidatePath(...)` call, returned as its argument text.
 *
 * ── WHY THIS IS NOT `countCallSites` + `includes` ───────────────────────────
 * Both would be wrong here, and the first draft of this file was. Each writer
 * logs `console.warn('[syncX] revalidatePath("/about-us") skipped:', …)` in its
 * guard, so the call appears a SECOND time as text inside a string literal.
 * A bare identifier count returns 2, and an `includes()` on the expected
 * argument can be satisfied by the log message while the real call says
 * something else entirely — matching TEXT rather than CODE, which is the exact
 * family of defect sourceScan.mjs was written to end.
 *
 * So: blank the string bodies first, find the calls in THAT, then read the
 * arguments back out of the original text at the same offsets. blankStringBodies
 * preserves length and newlines, so the offsets line up.
 *
 * The closing paren is found by balancing on the blanked text rather than with
 * a `[^)]*` regex — defect 6 in sourceScan's header, which could not cross an
 * inner `)`.
 */
function revalidateCalls(code) {
  const blanked = blankStringBodies(code);
  const re = /(?<![.\w$])revalidatePath\s*\(/g;
  const out = [];
  let m;
  while ((m = re.exec(blanked)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    for (; i < blanked.length; i += 1) {
      if (blanked[i] === '(') depth += 1;
      else if (blanked[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(code.slice(open + 1, i).replace(/\s+/g, ' ').trim());
  }
  return out;
}

for (const w of WRITERS) {
  test(`${w.collection}: its writer calls revalidatePath(${w.args})`, () => {
    // `code` — imports stripped. Reading `withImports` here would let the bare
    // `import { revalidatePath }` line satisfy the assertion, which is defect 5
    // in sourceScan.mjs's header.
    const { code } = readSource(w.rel);
    const calls = revalidateCalls(code);

    assert.ok(
      calls.length > 0,
      `${w.rel} does not CALL revalidatePath at all. It writes ${w.collection}, `
        + `which renders into ${w.surface} — the write reaches Mongo and never `
        + 'reaches a visitor.',
    );

    assert.deepEqual(
      calls,
      [w.args],
      `${w.rel} should make exactly one revalidatePath call, with (${w.args}). `
        + `The scope is measured from the surfaces it feeds: ${w.surface}. `
        + 'If the surfaces changed, change the table in this file deliberately.',
    );
  });
}

/**
 * THE CONTROL. Deletes the call from the REAL source text — not from a
 * hand-written fixture — and asserts the matcher flips. A fixture control only
 * proves the matcher works on the fixture; this proves it works on the file it
 * actually guards.
 */
test('CONTROL: deleting the call from the real source makes each guard fail', () => {
  for (const w of WRITERS) {
    const { code } = readSource(w.rel);

    // Premise: it passes right now.
    assert.deepEqual(revalidateCalls(code), [w.args], `${w.rel}: precondition`);

    // Break the REAL text, exactly as a careless refactor would: delete the
    // call and leave everything else — the import, and the log message that
    // still mentions it by name.
    const broken = code.replace(/revalidatePath\((?![^)]*skipped)/, 'noop(');

    assert.deepEqual(
      revalidateCalls(broken),
      [],
      `${w.rel}: the guard still saw a call after the real one was removed. It `
        + 'is matching something that is not the call — most likely the '
        + 'console.warn message, which names revalidatePath inside a string.',
    );
  }
});

/**
 * CONTROL for the specific near-miss this file already hit once.
 *
 * Each writer's guard logs `console.warn('[syncX] revalidatePath("/…") …')`.
 * That string contains a perfectly good-looking call. A matcher that reads text
 * rather than code counts it, and would therefore stay green after the real
 * call was deleted — the exact way this class of guard goes quietly worthless.
 *
 * Asserted on a synthetic input so the control keeps its meaning even if the
 * log messages are reworded.
 */
test('CONTROL: a call named inside a string literal is NOT counted', () => {
  const decoy = [
    "export function sync() {",
    "  console.warn('[syncX] revalidatePath(\"/about-us\") skipped:', err);",
    "}",
  ].join('\n');

  assert.deepEqual(
    revalidateCalls(decoy),
    [],
    'a revalidatePath written inside a string was counted as a real call',
  );

  // And the same text WITH a real call finds exactly the real one.
  const real = decoy.replace('}', "  revalidatePath('/about-us');\n}");
  assert.deepEqual(revalidateCalls(real), ["'/about-us'"]);
});

/**
 * CONTROL for defect 5: the import line alone must not satisfy the guard.
 * `readSource().code` strips imports, so this is belt and braces — but the
 * matcher is also shaped so that an import could never satisfy it, because an
 * import has no opening paren after the identifier.
 */
test('CONTROL: the import line alone does not satisfy the guard', () => {
  const importOnly = "import { revalidatePath } from 'next/cache';";
  assert.deepEqual(revalidateCalls(importOnly), []);
});

/**
 * THE ONE EXEMPTION, AND ITS PREMISE.
 *
 * syncFaqs deliberately has no revalidatePath: `/faq` is force-dynamic, so it
 * renders fresh per request and there is no baked output to invalidate. Adding
 * one there would be cargo cult.
 *
 * That reasoning depends entirely on /faq STAYING dynamic. If someone removes
 * the export, /faq becomes statically cached and syncFaqs silently joins the
 * defect class. So the exemption is not just asserted — its premise is.
 */
test('faqs is exempt ONLY because /faq is force-dynamic', () => {
  const faqPage = readSource('src/app/(public)/faq/page.jsx');

  assert.match(
    faqPage.code.replace(/\s+/g, ' '),
    /export const dynamic = 'force-dynamic'/,
    "/faq is no longer force-dynamic. It now bakes its output, so syncFaqs "
      + 'needs a revalidatePath and a row in WRITERS above — the reason it was '
      + 'exempt has just stopped being true.',
  );

  // And while that holds, syncFaqs is expected NOT to have one. This is a
  // deliberate absence, recorded so that adding one is a decision rather than
  // a reflex.
  const sync = readSource('src/lib/faqs/syncFaqs.js');
  assert.deepEqual(
    revalidateCalls(sync.code),
    [],
    'syncFaqs now calls revalidatePath. That may well be right — but /faq is '
      + 'force-dynamic, so say why in the sync and move it into WRITERS.',
  );
});
