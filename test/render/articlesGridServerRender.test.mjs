import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  __setPathname,
  __setSearchParams,
  __failSearchParams,
  useSearchParams,
} from 'next/navigation';
import { ArticlesPageClient } from '@/app/(public)/articles/_components/ArticlesPageClient';

/**
 * /articles PUTS ARTICLE LINKS IN THE SERVER RESPONSE.
 *
 * ── WHY THIS FILE CAN CLAIM WHAT courseListUrlFilter EXPLICITLY COULD NOT ───
 * That file states, correctly, that /training-course's server render emits zero
 * course links, so its own assertions are about a component and not about what
 * a crawler receives. /articles is the other case, and the difference was
 * measured against the production build on 2026-08-14 (`next build` +
 * `next start`, visible text with <script>/<style> stripped):
 *
 *     /articles                  757,349 bytes   5,423 chars   12 article links
 *     /articles?skill=DES        602,511 bytes   3,068 chars    3 article links
 *     /articles?program=CANVA    562,853 bytes   2,159 chars    1 article link
 *     /training-course         1,404,581 bytes   1,455 chars    0 course links
 *
 * The last row reproduces courseListUrlFilter's recorded figure exactly (1,455),
 * which is what licenses reading the first three as the same measurement rather
 * than a different method flattering a different page.
 *
 * ── WHAT IS ASSERTED HERE, AND WHAT CARRIES THE REST ────────────────────────
 * The suite has no database and cannot invoke page.jsx, so the numbers above
 * are evidence and not a test. What this file pins is the half that IS
 * reachable: given the items a request returned, the component's server output
 * contains a link per article and contains only the set it was handed.
 *
 * Two honest limits, stated rather than implied:
 *   · The link/filtered-set cases are NEW COVERAGE, not a regression guard on
 *     the commit that added them — the grid rendered from props before that
 *     commit too. They redden if the grid ever stops emitting anchors, which
 *     nothing previously checked.
 *   · The claim that the PAGE emits them is carried by `force-dynamic` and the
 *     absent Suspense boundary, guarded in test/fs/articlesServerRender.
 *
 * The one case below that does redden on a physical revert of that commit is
 * the last one, and it is the one that says what the commit was actually for.
 */

const article = (slug, title, skills = []) => ({
  _id: slug,
  slug,
  title,
  excerpt: `${title} — เนื้อหาโดยย่อ`,
  coverUrl: '',
  skills,
  programs: [],
});

const DATA_ONE = article('data-storytelling', 'Data Storytelling', ['DATA']);
const DATA_TWO = article('power-bi-basics', 'Power BI Basics', ['DATA']);
const DESIGN    = article('canva-for-teams', 'Canva for Teams', ['DES']);

const SKILL_OPTIONS = [
  { skill_id: 'DATA', skill_name: 'Data' },
  { skill_id: 'DES',  skill_name: 'Design' },
];

function render(props = {}) {
  __setPathname('/articles');
  __setSearchParams('');
  const items = props.articles ?? [DATA_ONE, DATA_TWO, DESIGN];
  return renderToStaticMarkup(
    createElement(ArticlesPageClient, {
      articles: items,
      programs: [{ program_id: 'CANVA', program_name: 'Canva' }],
      programNames: { CANVA: 'Canva' },
      skillNames: { DATA: 'Data', DES: 'Design' },
      skillOptions: SKILL_OPTIONS,
      page: 1,
      totalPages: 1,
      total: items.length,
      q: '',
      tag: '',
      program: '',
      skill: '',
      articleType: '',
      ...props,
    })
  );
}

/** Every `href="/articles/…"` in the markup, de-duplicated — the card links to
 *  the same slug three times (cover, title, อ่านเพิ่มเติม). */
function articleLinks(html) {
  return [...new Set(
    [...html.matchAll(/href="\/articles\/([^"]+)"/g)].map((m) => m[1])
  )].sort();
}

// ── 1. The markup contains article links at all ─────────────────────────────

test('the server-rendered markup contains a link per article', () => {
  const links = articleLinks(render());
  assert.deepEqual(links, ['canva-for-teams', 'data-storytelling', 'power-bi-basics']);
});

test('each link is a real anchor with the article title as its text', () => {
  const html = render({ articles: [DATA_ONE] });
  // The title link specifically — proof the anchor carries readable content and
  // is not an empty wrapper a text-only reader would get nothing from.
  assert.match(
    html,
    /<a[^>]+href="\/articles\/data-storytelling"[^>]*>Data Storytelling<\/a>/,
    'no anchor carries the article title as its text'
  );
});

/**
 * CONTROL: the link extractor is not returning [] and calling it a pass.
 *
 * Case 3 below is a NEGATIVE ("the other set is absent"), and a broken matcher
 * satisfies every negative forever.
 */
test('CONTROL: the extractor finds nothing in markup that has no links', () => {
  assert.deepEqual(articleLinks('<div>no anchors here</div>'), []);
  assert.equal(articleLinks(render()).length, 3);
});

// ── 2. The filtered set, and only the filtered set ──────────────────────────

test('a filtered request renders exactly the filtered set', () => {
  const html = render({ articles: [DESIGN], skill: 'DES', total: 1 });
  assert.deepEqual(articleLinks(html), ['canva-for-teams']);
  assert.ok(!html.includes('Data Storytelling'), 'an article outside the filter rendered');
  assert.ok(!html.includes('Power BI Basics'),   'an article outside the filter rendered');
});

/**
 * THE CHROME AGREES WITH THE LIST.
 *
 * The filtered set and the control that says which filter produced it come from
 * the same prop, so a page cannot show three Design articles under a dropdown
 * reading "ทุก Skill". This is the assertion the old `useState` copy of `q`
 * would have failed on a second render, and the reason the whole family of
 * "filters are props" rules exists.
 */
test('the skill dropdown selects the filter the list was built from', () => {
  const html = render({ articles: [DESIGN], skill: 'DES', total: 1 });
  assert.match(
    html,
    /<option[^>]+value="DES"[^>]+selected=""/,
    'the list is filtered by DES but the dropdown does not show it'
  );
});

test('an empty result renders the empty message and no links', () => {
  const html = render({ articles: [], total: 0 });
  assert.deepEqual(articleLinks(html), []);
  assert.ok(html.includes('ไม่พบบทความที่ตรงกับเงื่อนไข'));
});

/**
 * CONTROL: the two renders are genuinely different documents.
 *
 * Without this, a component that ignored `articles` entirely and rendered a
 * fixed grid would satisfy every positive above.
 */
test('CONTROL: different item sets produce different markup', () => {
  const all = render();
  const one = render({ articles: [DESIGN], skill: 'DES', total: 1 });
  assert.notEqual(all, one);
  assert.ok(all.length > one.length, 'the filtered render is not smaller than the full one');
});

// ── 3. The render does not depend on the URL hook ───────────────────────────

/**
 * THE CASE THAT REDDENS ON A PHYSICAL REVERT.
 *
 * `useSearchParams` is what bails a client subtree out to CSR, and it is why
 * page.jsx wrapped this component in `<Suspense fallback={null}>`. The commit
 * this test arrived with removed the hook — every parameter it was reading is
 * now a prop — and this is the assertion that says so in terms of the render
 * rather than in terms of the source text.
 *
 * The stub is made to THROW rather than to bail out, because a stub cannot
 * reproduce Next's bailout; see the note on `__failSearchParams`. So the claim
 * is precisely: this component's server output does not read the hook. Restore
 * `const sp = useSearchParams()` to the component and this render throws.
 *
 * `try/finally` because the runner shares one process: a leaked failing stub
 * would break every render test of a component that legitimately reads the URL.
 */
test('the grid renders on a path where useSearchParams is unavailable', () => {
  __failSearchParams(true);
  try {
    const links = articleLinks(render());
    assert.deepEqual(links, ['canva-for-teams', 'data-storytelling', 'power-bi-basics']);
  } finally {
    __failSearchParams(false);
  }
});

/** A component of the shape ArticlesPageClient used to have: it reads the URL
 *  during render. Exists only to prove the switch above is wired to something. */
function Probe() {
  const sp = useSearchParams();
  return createElement('div', null, sp.get('q') ?? '');
}

test('CONTROL: the failing stub really does break a component that reads the hook', () => {
  // Without this, `__failSearchParams` could be a no-op and the case above
  // would pass whether or not the hook was still in the component — the
  // "negative assertion satisfied by a broken switch" failure.
  __failSearchParams(true);
  try {
    assert.throws(
      () => renderToStaticMarkup(createElement(Probe)),
      /not available on this render path/,
      'the failing stub did not throw — the case above proves nothing'
    );
  } finally {
    __failSearchParams(false);
  }
});

test('CONTROL: the same probe renders fine once the switch is off', () => {
  // And that the switch is genuinely restored, so this file cannot poison the
  // shared process for every render test that runs after it.
  __setSearchParams('q=excel');
  assert.match(renderToStaticMarkup(createElement(Probe)), /excel/);
});
