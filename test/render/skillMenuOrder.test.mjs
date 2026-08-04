import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DesktopSkillRows, MobileSkillRows } from '@/components/layout/SkillMenuRows';
import { sortSkillsByAdminOrder, buildSkillOrderMap } from '@/lib/navmenu/skillOrder';
import { skills as CONFIG } from '@/config/site';

/**
 * The admin's skill order, asserted on the MARKUP the two menus emit.
 *
 * The pure tier proves the sort; this proves the menus render its output, in
 * the same sequence, on both surfaces. Both lists are driven from one array so
 * a desktop/mobile divergence would have to come from the caller — and the
 * last test here is the one that would catch that.
 *
 * WHAT THIS CANNOT SEE: it renders the row components directly. It does not
 * open the real mega panel or the real drawer — both are behind `useState`
 * gates and this suite has no DOM and no interaction, which is precisely why
 * the rows were extracted into their own module. So this pins what the rows
 * emit for a given array; that PublicHeaderClient hands them the sorted array
 * is asserted by the source guard in test/fs/skillMenuWiring, not here.
 */

const ROWS = [
  { skillId: 'POWERPLATFORM', order: 0, isHidden: false },
  { skillId: 'BUSINESS', order: 1, isHidden: false },
  { skillId: 'DES', order: 2, isHidden: false },
  { skillId: 'DATA', order: 3, isHidden: false },
  { skillId: 'AI', order: 4, isHidden: false },
  { skillId: 'DEV', order: 5, isHidden: false },
  { skillId: 'RPA', order: 5, isHidden: false }, // ghost, tied with DEV
  { skillId: 'AUT', order: 6, isHidden: false },
];

const renderDesktop = (skills) =>
  renderToStaticMarkup(createElement(DesktopSkillRows, { skills, rowClass: 'row' }));
const renderMobile = (skills) =>
  renderToStaticMarkup(createElement(MobileSkillRows, { skills, rowClass: 'row' }));

/** The labels in the order the markup actually lists them. */
function labelsInMarkup(html) {
  return [...html.matchAll(/<span[^>]*>([^<]+)<\/span>/g)]
    .map((m) => m[1])
    .filter((t) => !/^\(\d+\)$/.test(t)); // drop the count badges
}

const ordered = (rows) => sortSkillsByAdminOrder(CONFIG, buildSkillOrderMap(rows));

// ── the order reaches the markup ───────────────────────────────────

test('the desktop rows render in the admin order', () => {
  assert.deepEqual(labelsInMarkup(renderDesktop(ordered(ROWS))), [
    'Power Platform', 'Business', 'Design', 'Data', 'AI', 'Development', 'Automation',
  ]);
});

test('the mobile rows render in the SAME order', () => {
  assert.deepEqual(
    labelsInMarkup(renderMobile(ordered(ROWS))),
    labelsInMarkup(renderDesktop(ordered(ROWS)))
  );
});

test('reordering the SkillOrder fixture reorders BOTH menus', () => {
  // Move Automation from last to first and nothing else.
  const moved = ROWS.map((r) => (r.skillId === 'AUT' ? { ...r, order: -1 } : r));
  assert.deepEqual(labelsInMarkup(renderDesktop(ordered(moved))), [
    'Automation', 'Power Platform', 'Business', 'Design', 'Data', 'AI', 'Development',
  ]);
  assert.deepEqual(
    labelsInMarkup(renderMobile(ordered(moved))),
    labelsInMarkup(renderDesktop(ordered(moved)))
  );
});

test('a hidden skill is ABSENT from both menus, link and all', () => {
  const hidden = ROWS.map((r) => (r.skillId === 'DES' ? { ...r, isHidden: true } : r));
  const desktop = renderDesktop(ordered(hidden));
  const mobile = renderMobile(ordered(hidden));
  assert.ok(!labelsInMarkup(desktop).includes('Design'));
  assert.ok(!labelsInMarkup(mobile).includes('Design'));
  // Not merely hidden by a class — the anchor must not be in the document.
  assert.ok(!/skill\/design|design-all-courses/.test(desktop), 'no desktop link to it');
  assert.ok(!/skill\/design|design-all-courses/.test(mobile), 'no mobile link to it');
});

test('CONTROL: an EMPTY order map renders the config order, not an empty menu', () => {
  // The failure this control exists for: if `{}` were ever read as "hidden",
  // a transient Mongo failure would empty the menu on every public page. The
  // config order is the degraded state, and it is a working menu.
  const html = renderDesktop(sortSkillsByAdminOrder(CONFIG, {}));
  assert.deepEqual(labelsInMarkup(html), CONFIG.map((s) => s.label));
  assert.equal(labelsInMarkup(html).length, 7);
});

test('CONTROL: the tie resolves by config index — reversing the array swaps it', () => {
  // DEV and the ghost RPA both sit at order 5. Renders the tied pair alone so
  // the assertion is about the tie and nothing else.
  const dev = CONFIG.find((s) => s.upstreamCode === 'DEV');
  const fake = { ...dev, upstreamCode: 'RPA', slug: 'rpa-ghost', label: 'Ghost' };
  const map = buildSkillOrderMap(ROWS);
  assert.deepEqual(
    labelsInMarkup(renderDesktop(sortSkillsByAdminOrder([dev, fake], map))),
    ['Development', 'Ghost']
  );
  assert.deepEqual(
    labelsInMarkup(renderDesktop(sortSkillsByAdminOrder([fake, dev], map))),
    ['Ghost', 'Development']
  );
});

test('the ghost order row adds no menu item', () => {
  // `RPA` is in the fixture rows and in nothing else. Seven skills in, seven
  // rows out — a menu built from the ROWS rather than the config would emit
  // eight, one of them linking nowhere.
  assert.equal(labelsInMarkup(renderDesktop(ordered(ROWS))).length, 7);
  assert.equal(labelsInMarkup(renderMobile(ordered(ROWS))).length, 7);
});

test('label, icon and href still come from the config, not the order row', () => {
  // The order rows carry `displayName: ''` on all 8 live documents. If the
  // renderer ever reached for it, this is the menu of blanks it would produce.
  const html = renderDesktop(ordered(ROWS));
  const automation = CONFIG.find((s) => s.upstreamCode === 'AUT');
  assert.ok(html.includes('Automation'), 'the label came from the config');
  assert.ok(html.includes(automation.iconUrl.split('/').pop()), 'the icon came from the config');
  assert.match(html, /href="\/skill\/automation"/, 'the href fell back to the config slug');
});
