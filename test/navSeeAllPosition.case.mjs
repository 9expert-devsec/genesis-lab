/**
 * The DOM drive behind test/render/navSeeAllPosition.test.mjs, in ITS OWN
 * PROCESS. Prints one JSON object on stdout and exits.
 *
 * ── WHY A CHILD PROCESS ───────────────────────────────────────────────────
 * Same idiom, same reason as test/canvasFrameAttach.case.mjs. The header's
 * mobile drawer is portalled only after a mount effect flips `mounted`, and
 * the update that effect schedules lands on React's Default lane — which
 * `flushSync` does not flush. The first draft of this drive mounted the header
 * with `flushSync` in-process and found `#mobile-drawer` absent every time:
 * the effect ran, the re-render was queued, and nothing synchronous could
 * reach it. Getting there needs `act`, `act` needs a development React, and
 * the suite pins NODE_ENV=production before the loader is registered — so the
 * drive runs where the environment can be its own.
 *
 * ── WHAT IT DRIVES ────────────────────────────────────────────────────────
 * PublicHeaderClient, with two Career Path rows and two Masterclass rows in
 * the shapes PublicHeader passes. Then, as a visitor would:
 *
 *   mobile   click หลักสูตร in the drawer → click the Career Path sub →
 *            read that sub's anchors in DOCUMENT ORDER; same for Masterclass.
 *   desktop  hover the Career Path sidebar row so column 2 shows that
 *            section → read the section's anchors in order; same for
 *            Masterclass.
 *
 * Only document order is reported. The test file decides what it means.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/navSeeAllPosition.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PublicHeaderClient } = await import('@/components/layout/PublicHeaderClient');

const CAREER_PATHS = [
  { title: 'Prompt Engineer',    api_slug: 'prompt-engineer-career-path',    hero_image_url: '' },
  { title: 'Business Analytics', api_slug: 'business-analytics-career-path', hero_image_url: '' },
];
const MASTERCLASSES = [
  { _id: 'm1', slug: 'claude-ai-for-data-analyst', title_th: 'Claude AI for Data Analyst', cover_image_url: '' },
  { _id: 'm2', slug: 'power-bi-masterclass',       title_th: 'Power BI Masterclass',       cover_image_url: '' },
];
const PROPS = {
  programs: [],
  dynamicCareerPaths: CAREER_PATHS,
  tnhsCourses: [],
  navOnlineCourses: [],
  navMenuData: { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {}, skillOrder: {} },
  navMasterclasses: MASTERCLASSES,
};

const SEE_ALL = 'ดูทั้งหมด →';
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const links = (scope) =>
  [...scope.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), text: text(a) }));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const click = (el) =>
  act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
// React synthesises onMouseEnter from a bubbling `mouseover` whose
// relatedTarget is outside the tree — a pointer arriving from nowhere.
const hover = (el) =>
  act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })); });

const root = createRoot(dom.window.document.getElementById('root'));
await act(async () => { root.render(h(PublicHeaderClient, PROPS)); });
const doc = dom.window.document;

// ── mobile ──────────────────────────────────────────────────────────────────
const drawer = doc.getElementById('mobile-drawer');
const mobile = { drawerMounted: Boolean(drawer) };
if (drawer) {
  const button = (label) => [...drawer.querySelectorAll('button')].find((b) => text(b) === label) ?? null;
  const catalogue = button('หลักสูตร');
  if (catalogue) await click(catalogue);
  for (const [key, label] of [['careerPath', 'Career Path'], ['masterclass', 'Masterclass']]) {
    const btn = button(label);
    if (!btn) { mobile[key] = null; continue; }
    await click(btn);
    // MobileSub renders its children in the sibling div after its button.
    const panel = btn.nextElementSibling;
    const seeAll = panel ? [...panel.querySelectorAll('a')].find((a) => text(a) === SEE_ALL) : null;
    mobile[key] = {
      expanded: btn.getAttribute('aria-expanded'),
      links: panel ? links(panel) : [],
      seeAllClass: seeAll ? seeAll.getAttribute('class') : null,
    };
  }
}

// ── desktop ─────────────────────────────────────────────────────────────────
const nav = doc.querySelector('nav[aria-label="Primary"]');
const desktop = { navMounted: Boolean(nav) };
if (nav) {
  const anchor = (label) => [...nav.querySelectorAll('a')].find((a) => text(a) === label) ?? null;
  for (const [key, label, firstRow] of [
    ['careerPath', 'Career Path', 'Prompt Engineer'],
    ['masterclass', 'Masterclass', 'Claude AI for Data Analyst'],
  ]) {
    const row = anchor(label);
    if (!row) { desktop[key] = null; continue; }
    await hover(row);
    // The section is the closest ancestor of the first data row that also
    // holds a "ดูทั้งหมด" link — that container is the group, and reading
    // its anchors in order is what makes "first" mean first IN THE GROUP.
    // The desktop Masterclass card carries its title AND a 'ดูรายละเอียด →'
    // caption, so the first row is matched by prefix, not equality.
    const first = [...nav.querySelectorAll('a')].find((a) => text(a).startsWith(firstRow)) ?? null;
    let group = first ? first.parentElement : null;
    while (group && group !== nav && ![...group.querySelectorAll('a')].some((a) => text(a) === SEE_ALL)) {
      group = group.parentElement;
    }
    desktop[key] = {
      revealed: Boolean(first),
      links: group && group !== nav ? links(group) : [],
    };
  }
}

await act(async () => { root.unmount(); });
process.stdout.write(JSON.stringify({ mobile, desktop }));
