import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { PublicHeaderClient } from '@/components/layout/PublicHeaderClient';
import { projectHeaderProps, HEADER_PROP_FIELDS } from '@/lib/navmenu/headerProps';
import { FULL_PROPS, NEVER_READ } from '../headerPropsFixture.mjs';
import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * lib/navmenu/headerProps changes BYTES ON THE WIRE and nothing a visitor sees.
 *
 * ── THE CLAIM ──────────────────────────────────────────────────────────────
 * PublicHeader hands PublicHeaderClient six catalogue props. Every one of them
 * is serialised into the RSC flight data of every public page — inline in the
 * HTML, again in the `.rsc` payload, and so into every ISR write. On
 * 2026-09-21 that was 313 KB per page, of which the menu reads about 40 KB;
 * the rest was career-path curricula, masterclass descriptions and program
 * teasers no header code path touches. The projection drops them.
 *
 * The proof that it drops ONLY them is here: the same fixture, carrying every
 * field production hands over today, rendered through the header twice —
 * once as-is, once projected — must produce byte-identical markup. Static
 * SSR markup for the shell, and a DOM drive for the parts that exist only
 * after a hover or a click (every mega-menu section, the Col 3 course list,
 * the Col 4 cover card, the whole mobile drawer). A field the menu reads that
 * the projection forgot shows up here as a diff, not in production as a blank
 * icon.
 *
 * ── WHY A CHILD PROCESS FOR THE DRIVE ──────────────────────────────────────
 * Same reason as navSeeAllPosition: the drawer is portalled after a mount
 * effect, the sections open on hover, both need `act`, `act` needs a
 * development React, and this suite runs under NODE_ENV=production. The drive
 * (test/headerPropsParity.case.mjs) runs where the environment can be its own
 * and reports snapshots; this file decides what identical means.
 */

// ── 1. Static SSR markup — what the server writes into the HTML ─────────────

const ssrFull = renderToStaticMarkup(createElement(PublicHeaderClient, FULL_PROPS));
const ssrProjected = renderToStaticMarkup(
  createElement(PublicHeaderClient, projectHeaderProps(FULL_PROPS)),
);

test('SSR: the header markup is byte-identical before and after the projection', () => {
  assert.equal(ssrProjected, ssrFull);
});

test('SSR: the fixture actually exercises the props (a trivially empty header proves nothing)', () => {
  // The Programs section is the default open column of the desktop mega
  // panel, so it and its count badges are in the static markup.
  assert.match(ssrFull, /Microsoft Excel/, 'program name');
  assert.match(ssrFull, /https:\/\/example\.test\/excel\.png/, 'program icon url');
  assert.match(ssrFull, /\(2\)/, 'the course-count badge from navMenuData');
  assert.match(ssrFull, /\/power-bi-all-courses/, 'the custom program slug map');
});

// ── 2. The DOM drive — every section, both surfaces ─────────────────────────

const CHILD = path.join(ROOT, 'test', 'headerPropsParity.case.mjs');
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

const DESKTOP_SECTIONS = ['Programs', 'Skills', 'Career Path', 'Masterclass', 'TNHS', 'หลักสูตรออนไลน์'];

test('the drive ran at all', () => {
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
  for (const side of ['full', 'projected']) {
    assert.equal(R[side].navMounted, true, `${side}: the desktop nav never mounted`);
    assert.equal(R[side].drawerMounted, true, `${side}: the mobile drawer never mounted`);
  }
});

test('desktop: every mega-menu section renders byte-identical markup from the projected props', () => {
  for (const label of DESKTOP_SECTIONS) {
    assert.notEqual(R.full.desktop[label], null, `${label}: the sidebar row was not found`);
    assert.equal(
      R.projected.desktop[label],
      R.full.desktop[label],
      `${label}: the projection changed what the section renders`,
    );
  }
});

test('desktop: each section really showed its data (the drive hovered something)', () => {
  const d = R.full.desktop;
  assert.match(d['Programs'], /Excel Level 1/, 'Col 3 course list from navMenuData.items');
  assert.match(d['Programs'], /excel-level-1-training-course/, 'course href from urlAlias');
  assert.match(d['Programs'], /ดูรายละเอียด →/, 'the Col 4 cover card');
  assert.match(d['Skills'], /Skill Course One/, 'Col 3 from navMenuData.skills');
  assert.match(d['Career Path'], /Data Analyst/);
  assert.match(d['Career Path'], /prompt-engineer-career-path/, 'title falls back to api_slug');
  assert.match(d['Masterclass'], /Claude for Analysts/);
  assert.match(d['Masterclass'], /https:\/\/example\.test\/m1\.jpg/, 'masterclass cover');
  assert.match(d['TNHS'], /TNHS One/);
  assert.match(d['TNHS'], /https:\/\/example\.test\/t1\.jpg/, 'TNHS cover card');
  assert.match(d['หลักสูตรออนไลน์'], /Online One/);
  assert.match(d['หลักสูตรออนไลน์'], /https:\/\/academy\.example\.test\/one/, 'online course url');
});

test('mobile: the fully-opened drawer is byte-identical from the projected props', () => {
  assert.equal(R.projected.mobile, R.full.mobile);
});

test('mobile: the drawer really opened every sub', () => {
  const m = R.full.mobile;
  for (const needle of [
    'Microsoft Excel', 'https://example.test/excel.png', '/power-bi-all-courses',
    'Data Analyst', 'prompt-engineer-career-path',
    'TNHS One', 'https://www.thenexthumansskills.com/one',
    'Claude for Analysts', '/masterclass/claude-for-analysts',
    'Online One', 'https://academy.example.test/one',
  ]) {
    assert.ok(m.includes(needle), `mobile drawer is missing "${needle}"`);
  }
});

// ── 3. What the projection removes ──────────────────────────────────────────

const projected = projectHeaderProps(FULL_PROPS);
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));

test('the projected props are smaller, and carry none of the never-read fields', () => {
  assert.ok(bytes(projected) < bytes(FULL_PROPS) / 4, `${bytes(projected)} vs ${bytes(FULL_PROPS)} bytes`);
  const text = JSON.stringify(projected);
  for (const [prop, fields] of Object.entries(NEVER_READ)) {
    for (const f of fields) {
      assert.ok(!text.includes(`"${f}"`), `${prop}.${f} leaked through the projection`);
    }
  }
});

test('the projected props carry ONLY the declared fields, and every declared field survives', () => {
  const only = (rows, allowed) => {
    for (const row of rows) {
      for (const k of Object.keys(row)) assert.ok(allowed.includes(k), `unexpected field "${k}"`);
    }
  };
  only(projected.programs, HEADER_PROP_FIELDS.programs);
  only(projected.dynamicCareerPaths, HEADER_PROP_FIELDS.dynamicCareerPaths);
  only(projected.tnhsCourses, HEADER_PROP_FIELDS.tnhsCourses);
  only(projected.navOnlineCourses, HEADER_PROP_FIELDS.navOnlineCourses);
  only(projected.navMasterclasses, HEADER_PROP_FIELDS.navMasterclasses);
  for (const group of Object.values(projected.navMenuData.programs)) {
    only(group.items, HEADER_PROP_FIELDS.navMenuItem);
    if (group.firstCover) only([group.firstCover], HEADER_PROP_FIELDS.navMenuCover);
  }
  // Survival: the first program keeps all four, the first cover all four.
  assert.deepEqual(Object.keys(projected.programs[0]).sort(), [...HEADER_PROP_FIELDS.programs].sort());
  assert.deepEqual(
    Object.keys(projected.navMenuData.programs.EXCEL.firstCover).sort(),
    [...HEADER_PROP_FIELDS.navMenuCover].sort(),
  );
});

test('values pass through untouched — no defaults, no coercion, absent stays absent', () => {
  // '' title and '' hero on the second career path: the client decides the
  // fallback (`title || api_slug`, `hero ?? ''`), not the projection.
  assert.equal(projected.dynamicCareerPaths[1].title, '');
  assert.equal(projected.dynamicCareerPaths[1].hero_image_url, '');
  // A null alias stays null (courseCanonicalPath derives the legacy path from it).
  assert.equal(projected.navMenuData.programs.EXCEL.items[1].urlAlias, null);
  // A missing key is not invented.
  const sparse = projectHeaderProps({ programs: [{ program_id: 'X', program_name: 'X' }] });
  assert.deepEqual(Object.keys(sparse.programs[0]), ['program_id', 'program_name']);
  // The empty shape is the one PublicHeaderClient defaults to.
  assert.deepEqual(projectHeaderProps({}), {
    programs: [], dynamicCareerPaths: [], tnhsCourses: [], navOnlineCourses: [],
    navMenuData: { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {}, skillOrder: {} },
    navMasterclasses: [],
  });
  // firstCover null survives as null, not as an object.
  assert.equal(projected.navMenuData.programs.PBI.firstCover, null);
});

// ── 4. The shell routes through it — the projection cannot be bypassed ──────

const SHELL = readSource('src/components/layout/PublicHeader.jsx');

test('PublicHeader projects on the server and passes ONLY the projected props to the client', () => {
  // `withImports` for the import line, `code` for the call — see readSource.
  assert.match(SHELL.withImports, /import \{ projectHeaderProps \} from '@\/lib\/navmenu\/headerProps'/);
  assert.match(SHELL.code, /const clientProps = projectHeaderProps\(\{/);
  const tag = SHELL.code.match(/<PublicHeaderClient([\s\S]*?)\/>/);
  assert.ok(tag, 'the shell no longer renders PublicHeaderClient');
  for (const prop of ['programs', 'dynamicCareerPaths', 'tnhsCourses', 'navOnlineCourses', 'navMenuData', 'navMasterclasses']) {
    assert.match(
      tag[1],
      new RegExp(`${prop}=\\{clientProps\\.${prop}\\}`),
      `${prop} reaches the client from somewhere other than clientProps`,
    );
  }
  // The one non-catalogue prop is untouched (heroOverlayOptIn pins its shape).
  assert.match(tag[1], /overlay=\{overlay\}/);
});
