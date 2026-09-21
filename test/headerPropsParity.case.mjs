/**
 * The DOM drive behind test/render/headerPropsProjection.test.mjs, in ITS OWN
 * PROCESS. Prints one JSON object on stdout and exits.
 *
 * Same idiom, same reason as test/navSeeAllPosition.case.mjs: the mobile
 * drawer is portalled only after a mount effect, and every non-default section
 * of the mega menu (Skills, Career Path, TNHS, Masterclass, Online, the Col 3
 * course list, the Col 4 cover card) exists only after a hover or a click.
 * renderToStaticMarkup sees none of that; `act` needs a development React;
 * the suite pins NODE_ENV=production — so the drive runs where the
 * environment can be its own.
 *
 * ── WHAT IT DRIVES ──────────────────────────────────────────────────────────
 * PublicHeaderClient TWICE, with the same fixture: once as production handed
 * it before lib/navmenu/headerProps (every field), once projected. For each
 * mount, as a visitor would:
 *
 *   desktop  hover each sidebar row in turn (Programs · Skills · Career Path ·
 *            Masterclass · TNHS · Online) and, in Programs and Skills, hover
 *            the first Col 2 row and then the first Col 3 course so Col 3 and
 *            Col 4 fill from the props — snapshot the <header> after each.
 *   mobile   open the drawer's หลักสูตร accordion, then every sub inside it —
 *            snapshot #mobile-drawer once everything is open.
 *
 * The snapshots are the report. The test file decides what identical means.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/headerPropsParity.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PublicHeaderClient } = await import('@/components/layout/PublicHeaderClient');
const { projectHeaderProps } = await import('@/lib/navmenu/headerProps');
const { FULL_PROPS } = await import('./headerPropsFixture.mjs');

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

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

const DESKTOP_SECTIONS = ['Programs', 'Skills', 'Career Path', 'Masterclass', 'TNHS', 'หลักสูตรออนไลน์'];
const MOBILE_SUBS = ['Programs', 'Skills', 'Career Path', 'TNHS', 'Masterclass', 'หลักสูตรออนไลน์'];

async function drive(props) {
  const doc = dom.window.document;
  const mount = doc.getElementById('root');
  const root = createRoot(mount);
  await act(async () => { root.render(h(PublicHeaderClient, props)); });

  const desktop = {};
  const header = doc.querySelector('header');
  const nav = doc.querySelector('nav[aria-label="Primary"]');
  if (header && nav) {
    // Open the mega panel the way a pointer does — entering the trigger.
    const trigger = [...nav.querySelectorAll('a')].find((a) => text(a).startsWith('หลักสูตร'));
    if (trigger) await hover(trigger.parentElement);
    for (const label of DESKTOP_SECTIONS) {
      const row = [...nav.querySelectorAll('a')].find((a) => text(a) === label) ?? null;
      if (!row) { desktop[label] = null; continue; }
      await hover(row);
      if (label === 'Programs' || label === 'Skills') {
        // Col 2's first data row, then Col 3's first course: the props' own
        // items and firstCover feed both, and the course hover renders the
        // Col 4 card from the row (composeCoursePreview — the stubbed lookup
        // contributes no cover).
        const col2Rows = [...nav.querySelectorAll('a')].filter((a) => /\(\d+\)$/.test(text(a)));
        if (col2Rows[0]) await hover(col2Rows[0]);
        const course = [...nav.querySelectorAll('a[href$="-training-course"]')][0] ?? null;
        if (course) await hover(course);
      }
      desktop[label] = header.outerHTML;
    }
  }

  let mobile = null;
  const drawer = doc.getElementById('mobile-drawer');
  if (drawer) {
    const button = (label) => [...drawer.querySelectorAll('button')].find((b) => text(b) === label) ?? null;
    const catalogue = button('หลักสูตร');
    if (catalogue) await click(catalogue);
    for (const label of MOBILE_SUBS) {
      const btn = button(label);
      if (btn) await click(btn);
    }
    mobile = drawer.outerHTML;
  }

  await act(async () => { root.unmount(); });
  return { desktop, mobile, drawerMounted: Boolean(drawer), navMounted: Boolean(nav) };
}

const full = await drive(FULL_PROPS);
const projected = await drive(projectHeaderProps(FULL_PROPS));

process.stdout.write(JSON.stringify({ full, projected }));
