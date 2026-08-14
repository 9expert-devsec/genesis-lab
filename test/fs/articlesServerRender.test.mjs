import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * WHAT KEEPS THE /articles GRID IN THE SERVER RESPONSE.
 *
 * test/render/articlesGridServerRender asserts the COMPONENT's output. This
 * asserts the two page-level facts that decide whether a crawler ever receives
 * it, neither of which is reachable from a render test because the suite has no
 * database and cannot invoke page.jsx.
 *
 * ── THE TWO FACTS, AND WHY BOTH ARE NEEDED ──────────────────────────────────
 *   1. `dynamic = 'force-dynamic'`. Without it the route is a static render, and
 *      a static render is the ONLY situation in which useSearchParams bails a
 *      subtree out to CSR. This line has been there since 2026-06-12 and is the
 *      reason the grid was already in the production HTML before the commit
 *      this file arrived with — measured, see the render test's header.
 *   2. No `useSearchParams` in the client component, and therefore no Suspense
 *      boundary needed around it. This is what makes (1) a performance decision
 *      rather than a load-bearing one: with the hook gone, dropping
 *      force-dynamic would cost freshness, not the grid.
 *
 * Guarding only (1) would leave the grid one `export const dynamic` edit away
 * from silently disappearing from the server response. Guarding only (2) would
 * miss that the route must still be rendered per request to have filtered
 * `searchParams` at all. So both.
 */

const PAGE = 'src/app/(public)/articles/page.jsx';
const CLIENT = 'src/app/(public)/articles/_components/ArticlesPageClient.jsx';

test('the route is rendered per request', () => {
  const { code } = readSource(PAGE);
  assert.match(
    code,
    /export const dynamic = 'force-dynamic';/,
    'without force-dynamic the route is statically rendered and searchParams cannot filter it'
  );
});

test('page.jsx reads every filter out of searchParams', () => {
  const { code } = readSource(PAGE);
  for (const key of ['q', 'tag', 'program', 'skill', 'type']) {
    assert.match(
      code,
      new RegExp(`sp\\?\\.${key}\\s*\\?\\?`),
      `page.jsx does not read ?${key}= — the client cannot receive it as a prop`
    );
  }
});

test('page.jsx passes the filters down as discrete props', () => {
  const { code } = readSource(PAGE);
  // The prop NAMES, at the call site. `initialFilters={{…}}` is what this
  // replaced, and the object was half the invitation to copy it into state —
  // see test/fs/urlFilterNoState on the `initial*` prefix.
  for (const prop of ['q=', 'tag=', 'program=', 'skill=', 'articleType=']) {
    assert.ok(
      code.includes(prop),
      `<ArticlesPageClient> is not passed ${prop.slice(0, -1)}`
    );
  }
  assert.ok(
    !/initialFilters/.test(code),
    'the initialFilters bundle is back — that name is the smell the rule is about'
  );
});

/**
 * THE BAILOUT CAUSE IS GONE.
 *
 * Read from `code` (imports stripped) AND from `withImports`, because the two
 * catch different reintroductions: a call with no import would be a bug, and an
 * import with no call is dead weight that the next person will "use".
 */
test('the client component does not read useSearchParams', () => {
  const { code, withImports } = readSource(CLIENT);
  assert.ok(
    !/useSearchParams/.test(code),
    'useSearchParams is back in ArticlesPageClient — the CSR bailout returns with it'
  );
  assert.ok(
    !/import[^;]*useSearchParams/.test(withImports),
    'useSearchParams is imported but unused — remove the import or the claim is stale'
  );
});

test('the list is not wrapped in a Suspense boundary', () => {
  const { code, withImports } = readSource(PAGE);
  assert.ok(
    !/<Suspense/.test(code),
    'a Suspense boundary is back around the list — it can only be there for a bailout that no longer exists'
  );
  assert.ok(
    !/import\s*\{[^}]*\bSuspense\b/.test(withImports),
    'Suspense is imported but unused'
  );
});

/**
 * CONTROL: the matchers see the file they think they see.
 *
 * Every assertion above except the first two is a NEGATIVE, and a `readSource`
 * that returned an empty string would satisfy all of them.
 */
test('CONTROL: both files were actually read', () => {
  const page = readSource(PAGE);
  const client = readSource(CLIENT);
  assert.ok(page.code.length > 1000, `page.jsx scrubbed to ${page.code.length} chars`);
  assert.ok(client.code.length > 1000, `the client scrubbed to ${client.code.length} chars`);
  // And that the negatives are pointed at real syntax rather than at a spelling
  // that never appears: the same matcher finds the boundary in a page that has
  // one. /training-course is the deferred case and still needs its own.
  const deferred = readSource('src/app/(public)/training-course/page.jsx');
  assert.match(
    deferred.code,
    /<Suspense/,
    'the Suspense matcher found nothing in a page known to have a boundary'
  );
  assert.match(
    readSource('src/app/(public)/training-course/_components/CourseListClient.jsx').code,
    /useSearchParams/,
    'the useSearchParams matcher found nothing in a component known to call it'
  );
});
