import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT } from '../sourceScan.mjs';

/**
 * "ดูทั้งหมด →" is the FIRST entry of the Career Path and Masterclass groups,
 * on both nav surfaces.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * The mobile drawer's Career Path group had no "ดูทั้งหมด" at all, and its
 * Masterclass group had one at the BOTTOM, after the course rows. The desktop
 * mega menu already put both in the header row above the list. Two surfaces,
 * two components (DesktopMega and MobileMegaAccordion, both in
 * PublicHeaderClient.jsx), one affordance presented three different ways.
 *
 * ── WHY POSITION, NOT PRESENCE ─────────────────────────────────────────────
 * "The group contains a link to /masterclass" was already true before the fix
 * — the link existed, at the wrong end. So every assertion here reads the
 * group's anchors IN DOCUMENT ORDER and pins index 0. A test that only
 * searched the group would have been green on the defect.
 *
 * ── WHY A CHILD-PROCESS DRIVE, NOT renderToStaticMarkup ────────────────────
 * The drawer is portalled after a mount effect, its หลักสูตร accordion and
 * each MobileSub are `open` state, and the desktop mega's column 2 shows one
 * section at a time chosen by hover. None of that exists in static markup —
 * a static render emits the drawer as nothing and the desktop panel with only
 * its default (Programs) section. And the mount effect's re-render lands on
 * React's Default lane, which `flushSync` does not reach, so the in-process
 * synchronous mount of test/render/imageLightbox cannot get there either. The
 * header is therefore driven with `act` in test/navSeeAllPosition.case.mjs,
 * in its own process, for the reasons recorded on
 * test/render/canvasFrameLateAttach and its drive.
 */

const CHILD = path.join(ROOT, 'test', 'navSeeAllPosition.case.mjs');
// NODE_ENV is named, not inherited: under `npm test` it is 'production' from
// before file one, and `act` throws outright in a production React. See the
// note on test/render/canvasFrameLateAttach.
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

const SEE_ALL = 'ดูทั้งหมด →';

test('the drive ran at all', () => {
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
  assert.equal(R.mobile.drawerMounted, true, 'the mobile drawer never mounted');
  assert.equal(R.desktop.navMounted, true, 'the desktop nav never mounted');
});

// ── Mobile drawer — the surface with the defect ─────────────────────────────

test('mobile · Career Path: "ดูทั้งหมด" is the FIRST entry and points at /career-path-project', () => {
  const g = R.mobile.careerPath;
  assert.ok(g, 'no Career Path sub in the drawer');
  assert.equal(g.expanded, 'true', 'the Career Path sub did not expand');
  assert.ok(g.links.length >= 2, 'the group has too few links to have an order');
  assert.deepEqual(g.links[0], { href: '/career-path-project', text: SEE_ALL });
  // The DB rows follow it — the link was ADDED above them, not in place of one.
  assert.equal(g.links[1].text, 'Prompt Engineer');
  assert.equal(g.links[1].href, '/prompt-engineer-career-path');
  assert.equal(g.links.filter((l) => l.text === SEE_ALL).length, 1, 'the link is duplicated');
});

test('mobile · Masterclass: "ดูทั้งหมด" is the FIRST entry, not the last', () => {
  const g = R.mobile.masterclass;
  assert.ok(g, 'no Masterclass sub in the drawer');
  assert.equal(g.expanded, 'true', 'the Masterclass sub did not expand');
  assert.ok(g.links.length >= 2, 'the group has too few links to have an order');
  assert.deepEqual(g.links[0], { href: '/masterclass', text: SEE_ALL });
  assert.equal(g.links[1].text, 'Claude AI for Data Analyst');
  assert.equal(g.links[1].href, '/masterclass/claude-ai-for-data-analyst');
  // The old position is empty: the link MOVED, it was not copied.
  assert.notEqual(g.links[g.links.length - 1].text, SEE_ALL, 'the link is still at the bottom as well');
  assert.equal(g.links.filter((l) => l.text === SEE_ALL).length, 1, 'the link is duplicated');
});

test('mobile · the two groups present the link identically', () => {
  const cp = R.mobile.careerPath;
  const mc = R.mobile.masterclass;
  assert.ok(cp.seeAllClass, 'Career Path has no "ดูทั้งหมด" to compare');
  assert.equal(cp.seeAllClass, mc.seeAllClass, 'different styling for the same affordance');
  assert.equal(cp.links[0].text, mc.links[0].text, 'different wording for the same affordance');
});

// ── Desktop mega menu — already right; pinned so the two surfaces agree ─────

test('desktop · Career Path: "ดูทั้งหมด" is the FIRST entry and points at /career-path-project', () => {
  const g = R.desktop.careerPath;
  assert.ok(g && g.revealed, 'hovering Career Path did not reveal its section');
  assert.deepEqual(g.links[0], { href: '/career-path-project', text: SEE_ALL });
  assert.equal(g.links[1].text, 'Prompt Engineer');
});

test('desktop · Masterclass: "ดูทั้งหมด" is the FIRST entry', () => {
  const g = R.desktop.masterclass;
  assert.ok(g && g.revealed, 'hovering Masterclass did not reveal its section');
  assert.deepEqual(g.links[0], { href: '/masterclass', text: SEE_ALL });
  assert.equal(g.links[1].href, '/masterclass/claude-ai-for-data-analyst');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────

test('CONTROL: the drive reports ORDER, not membership', () => {
  // If the drive returned a set, or the accordion rendered rows in some order
  // other than the source's, index 0 above would be meaningless. The SECOND
  // data row is pinned here, so a reordering of the rows themselves would
  // also be visible.
  const g = R.mobile.careerPath;
  assert.equal(g.links[2].text, 'Business Analytics');
  assert.notDeepEqual(g.links[0], g.links[2]);
});
