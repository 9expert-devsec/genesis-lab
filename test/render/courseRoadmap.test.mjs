import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CourseRoadmap,
  roadmapAssetPlan,
} from '@/app/(public)/[...slug]/_components/CourseRoadmap';

// Duplicate-ID collision fix. The SVG is injected in a browser-only effect, so
// server markup can't hold the inlined <svg>; what it CAN measure is how many
// asset COPIES the component emits — one container div (`.aspect-video`) per
// inlined SVG. Two copies of the same file = every id duplicated in the DOM =
// the bug. So container-count is a faithful proxy for the duplication here; the
// exact injected-ID count (=1) is proven separately by the client-DOM script.

const R = (course) => renderToStaticMarkup(CourseRoadmap({ course }));
const countAssets = (html) => (html.match(/aspect-video/g) || []).length;

const NAME = 'Excel Advanced';
const DESK = 'https://cdn/excel-advanced-desktop.svg';
const MOB = 'https://cdn/excel-advanced-mobile.svg';

test('same-URL (desktop-only) inlines the asset ONCE (the fix)', () => {
  const html = R({ course_name: NAME, course_roadmap_desktop_url: DESK });
  assert.equal(countAssets(html), 1, 'exactly one asset copy, not two');
  // the single copy is shown at all breakpoints, not md-gated
  assert.ok(html.includes('block') && !/md:hidden|md:block/.test(html), 'single copy is un-gated (visible everywhere)');
});

test('both fields set to the SAME url also collapse to one (compare resolved src, not DB field)', () => {
  const html = R({ course_name: NAME, course_roadmap_desktop_url: DESK, course_roadmap_mobile_url: DESK });
  assert.equal(countAssets(html), 1);
});

test('different URLs still inline BOTH copies, md-gated (no regression)', () => {
  const html = R({ course_name: NAME, course_roadmap_desktop_url: DESK, course_roadmap_mobile_url: MOB });
  assert.equal(countAssets(html), 2, 'two copies when the files genuinely differ');
  assert.ok(html.includes('block md:hidden'), 'mobile copy gated < md');
  assert.ok(html.includes('hidden md:block'), 'desktop copy gated >= md');
});

test('neither URL set → renders nothing (SidebarNav gate unchanged)', () => {
  assert.equal(R({ course_name: NAME }), '');
  assert.equal(roadmapAssetPlan({ course_name: NAME }).length, 0);
});

// CONTROL — proves the "== 1" assertion measures the duplication and is not
// vacuous. This is the PRE-FIX plan: always emit both copies whenever any src
// exists. For the desktop-only course it yields TWO — which fails the fix's
// assertion above. The fixed plan yields ONE for the same input.
test('CONTROL: pre-fix plan emits TWO copies for a desktop-only course (would fail the fix assertion)', () => {
  const preFixPlan = (course) => {
    const desktop = course?.course_roadmap_desktop_url || '';
    const mobile = course?.course_roadmap_mobile_url || '';
    if (!desktop && !mobile) return [];
    const desktopSrc = desktop || mobile;
    const mobileSrc = mobile || desktop;
    return [
      { src: mobileSrc, className: 'block md:hidden' },
      { src: desktopSrc, className: 'hidden md:block' },
    ];
  };
  const deskOnly = { course_name: NAME, course_roadmap_desktop_url: DESK };
  assert.equal(preFixPlan(deskOnly).length, 2, 'pre-fix: duplicated (the bug)');
  assert.equal(roadmapAssetPlan(deskOnly).length, 1, 'fixed: single copy');
});
