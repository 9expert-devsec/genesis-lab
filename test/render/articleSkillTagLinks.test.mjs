import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { BlogCard } from '@/app/_components/home/BlogSection';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { ProgramArticlesSection } from '@/components/program/ProgramArticlesSection';
import { articleSkillHref, resolveTaxonomyEntries, resolveTaxonomyNames } from '@/lib/articleTaxonomy';
import { toBlogCardModel } from '@/lib/articleCardModel';
import { readSource } from '../sourceScan.mjs';

/**
 * Skill chips on every article card are links to /articles?skill=<skill_id>.
 *
 * Three surfaces render them: /articles (ArticleCard), the landing page
 * (BlogCard) and the program/skill page section (ProgramArticlesSection, which
 * renders BlogCard). All three go through the ONE SkillChips component, the
 * href is the skill_id (the value the /articles <select> uses), and no surface
 * may nest an anchor inside an anchor — BlogCard was a whole-card <Link> and is
 * now a stretched-link card for exactly that reason.
 */

const SKILL_NAMES = { DATA: 'Data', AI: 'AI' };
const ARTICLE = {
  _id: 'a1',
  slug: 'power-bi-tips',
  title: 'Power BI tips',
  excerpt: 'excerpt',
  coverUrl: 'https://example.com/c.png',
  programs: [],
  skills: ['DATA', 'SK-GONE', 'AI'],
};

const dom = (html) => new JSDOM(`<body>${html}</body>`).window.document;

function maxAnchorDepth(html) {
  let depth = 0;
  let max = 0;
  for (const m of html.matchAll(/<a\b|<\/a>/g)) {
    depth += m[0] === '</a>' ? -1 : 1;
    max = Math.max(max, depth);
  }
  return max;
}

test('CONTROL: maxAnchorDepth sees a nested anchor', () => {
  assert.equal(maxAnchorDepth('<a href="/x"><span><a href="/y">y</a></span></a>'), 2);
  assert.equal(maxAnchorDepth('<a href="/x">x</a><a href="/y">y</a>'), 1);
});

const surfaces = {
  BlogCard: () =>
    renderToStaticMarkup(
      createElement(BlogCard, { blog: toBlogCardModel(ARTICLE), skillNames: SKILL_NAMES }),
    ),
  ArticleCard: () =>
    renderToStaticMarkup(createElement(ArticleCard, { article: ARTICLE, skillNames: SKILL_NAMES })),
  ProgramArticlesSection: () =>
    renderToStaticMarkup(
      createElement(ProgramArticlesSection, {
        articles: [ARTICLE],
        total: 1,
        skill: { skill_id: 'DATA', skill_name: 'Data' },
        skillNames: SKILL_NAMES,
      }),
    ),
};

for (const [name, render] of Object.entries(surfaces)) {
  test(`${name}: each resolvable skill chip links to /articles?skill=<skill_id>`, () => {
    const doc = dom(render());
    const chips = [...doc.querySelectorAll('a[href^="/articles?skill="]')]
      // The program/skill section's own see-all link shares the prefix.
      .filter((a) => a.getAttribute('aria-label')?.startsWith('ดูบทความ skill'));
    assert.deepEqual(
      chips.map((a) => a.getAttribute('href')),
      ['/articles?skill=DATA', '/articles?skill=AI'],
      'one link per RESOLVED skill, valued by id, unresolved id dropped',
    );
    assert.deepEqual(
      chips.map((a) => a.getAttribute('aria-label')),
      ['ดูบทความ skill Data', 'ดูบทความ skill AI'],
    );
    assert.deepEqual(chips.map((a) => a.textContent), ['Data', 'AI'], 'the visible label is the name');
    for (const a of chips) {
      assert.match(a.className, /focus-visible:ring-2/, 'visible focus ring');
    }
  });

  test(`${name}: no anchor is nested inside another anchor`, () => {
    // Scanned on the RAW markup, not a parsed DOM: an HTML parser silently
    // splits a nested <a>, so `a a` on a parsed document is 0 either way.
    assert.equal(maxAnchorDepth(render()), 1);
  });

  test(`${name}: the chip row sits above any stretched link`, () => {
    const doc = dom(render());
    const row = doc.querySelector('a[aria-label^="ดูบทความ skill"]').parentElement;
    assert.match(row.className, /\brelative\b/);
    assert.match(row.className, /\bz-10\b/);
  });
}

test('BlogCard is a stretched-link card: relative root, title link covers it, still opens the article', () => {
  const doc = dom(surfaces.BlogCard());
  const card = doc.body.firstElementChild;
  assert.equal(card.tagName, 'ARTICLE', 'no longer a whole-card <a>');
  assert.match(card.className, /\brelative\b/);
  const title = card.querySelector('h3 a');
  assert.equal(title.getAttribute('href'), '/articles/power-bi-tips');
  assert.match(title.className, /after:absolute/);
  assert.match(title.className, /after:inset-0/);
  assert.match(title.className, /focus-visible:after:ring-2/, 'keyboard focus shows on the card');
});

test('resolveTaxonomyEntries keeps the id, drops unresolved ones and caps; names derive from it', () => {
  const names = { A: 'Alpha', C: 'Gamma', D: 'Delta' };
  assert.deepEqual(resolveTaxonomyEntries(['A', 'B', 'C', 'D'], names, 2), [
    { id: 'A', name: 'Alpha' },
    { id: 'C', name: 'Gamma' },
  ]);
  assert.deepEqual(resolveTaxonomyNames(['A', 'B', 'C', 'D'], names, 2), ['Alpha', 'Gamma']);
  assert.deepEqual(resolveTaxonomyEntries(null, names, 3), []);
});

test('articleSkillHref encodes the id', () => {
  assert.equal(articleSkillHref('DATA'), '/articles?skill=DATA');
  assert.equal(articleSkillHref('A&B C'), '/articles?skill=A%26B%20C');
});

test('/articles page: an unknown ?skill= falls back to ทุก Skill, validated against the offered options', () => {
  const { code } = readSource('src/app/(public)/articles/page.jsx');
  assert.match(code, /const requestedSkill = \(sp\?\.skill \?\? ''\)\.toString\(\);/);
  assert.match(
    code,
    /const skill = skillOptions\.some\(\(s\) => s\.skill_id === requestedSkill\) \? requestedSkill : '';/,
    'valid means offered by the dropdown, so the control and the list agree',
  );
  assert.match(code, /skill === requestedSkill \? requestedList : await listArticles\(skill\)/);
  assert.match(code, /skill=\{skill\}/, 'the client receives the EFFECTIVE skill');
  assert.doesNotMatch(code, /<Suspense/, 'no Suspense boundary around the list');
});

test('/articles canonical stays bare — no query string', () => {
  const { code } = readSource('src/app/(public)/articles/page.jsx');
  assert.match(code, /alternates: \{ canonical: `\$\{process\.env\.NEXT_PUBLIC_SITE_URL\}\/articles` \}/);
});
