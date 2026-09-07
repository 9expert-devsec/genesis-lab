import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { readSource } from '../sourceScan.mjs';

/**
 * The group headers are real controls, and the server render is deterministic.
 *
 * ══ WHAT CAN AND CANNOT BE ASSERTED FROM HERE, STATED UP FRONT ══════════════
 * This is a SERVER render. `collapsed` and `groupCollapse` are both read from
 * localStorage in a post-mount effect, so from here they are always their
 * initial values — rail expanded, every group open. That is not a limitation to
 * work around; it is THE PROPERTY WORTH ASSERTING, because it is what makes the
 * first client render match the server's and keeps React from tearing the
 * sidebar down with a hydration mismatch. A test that could drive the stored
 * state from a prop would be testing a component that had the hydration bug.
 *
 * So: the markup assertions below are about the deterministic initial state and
 * the accessibility wiring baked into it. The BEHAVIOUR — clicking a header,
 * the chevron turning, the state surviving a reload — is browser-only and is
 * named as unverified in the round report rather than implied here.
 *
 * The storage RULES (malformed values, unknown ids, the active-group override)
 * are pure and fully covered in test/pure/navGroupCollapse.test.mjs.
 */

function sidebar(pathname = '/admin') {
  __setPathname(pathname);
  try {
    return renderToStaticMarkup(createElement(AdminSidebar, {
      isSuperadmin: true,
      pages: null,
      userName: 'Somchai',
    }));
  } finally {
    __setPathname('/');
  }
}

const MARKUP = sidebar();
const HEADERS = [...MARKUP.matchAll(/<button\b[^>]*aria-expanded[^>]*>/g)].map((m) => m[0]);

test('group toggle: every group renders a header button, one per group', () => {
  // Six groups plus the rail's own collapse toggle, which also carries
  // aria-expanded — asserted separately so a miscount is legible.
  const controlled = HEADERS.filter((h) => /aria-controls="admin-nav-/.test(h));
  assert.equal(controlled.length, 6, `expected 6 group headers, found ${controlled.length}`);
});

test('group toggle: each header names the list it controls, and that list exists', () => {
  const ids = HEADERS
    .map((h) => (h.match(/aria-controls="([^"]+)"/) ?? [])[1])
    .filter(Boolean);
  assert.equal(ids.length, 6);
  for (const id of ids) {
    assert.match(
      MARKUP, new RegExp(`<ul id="${id}"`),
      `aria-controls points at #${id}, which is not in the DOM — a screen reader `
      + 'following the reference finds nothing, which is worse than no reference',
    );
  }
  assert.deepEqual([...new Set(ids)].length, 6, 'two headers claim the same list');
});

test('group toggle: the headers are <button>, not clickable text', () => {
  // What makes them tab-reachable and Enter/Space-operable at all. A div with
  // an onClick renders identically and is unusable without a mouse.
  for (const header of HEADERS.filter((h) => /aria-controls="admin-nav-/.test(h))) {
    assert.match(header, /type="button"/, 'a button inside a form would submit it');
    assert.match(header, /focus-visible:ring-2/,
      'the reset removes the default outline, so a keyboard user gets no ring back');
  }
});

test('group toggle: the server render is all-expanded and deterministic', () => {
  // The default when nothing is stored, and the only markup the server can
  // produce. `hidden` on any list here would mean the component read storage
  // during render — the hydration mismatch this pattern exists to avoid.
  for (const header of HEADERS.filter((h) => /aria-controls="admin-nav-/.test(h))) {
    assert.match(header, /aria-expanded="true"/);
  }
  assert.equal(
    [...MARKUP.matchAll(/<ul id="admin-nav-[^"]*" hidden/g)].length, 0,
    'a group rendered folded on the server: the stored state is being read during render',
  );
});

test('group toggle: the same markup comes out on a different route', () => {
  // The active-group override changes WHICH group is forced open, never how
  // many are open on a fresh render — nothing is stored, so all six are open
  // either way. If this ever differs, the server output depends on the URL in a
  // way the client's first render would not reproduce.
  const other = sidebar('/admin/masterclass/registrations');
  assert.equal([...other.matchAll(/aria-expanded="true"/g)].length,
    [...MARKUP.matchAll(/aria-expanded="true"/g)].length);
});

// ── the wiring the markup cannot show ───────────────────────────────────────
test('group toggle: state is read after mount, from ONE id-keyed storage key', () => {
  // Shape-bound (test/sourceScan.mjs, defect 7): if you restructure this, come
  // back and check it still binds. It is here because the three things it names
  // are exactly the three that would fail silently — a render-time read would
  // only break in a browser, a label-keyed map would only break when a label is
  // reworded, and a per-group key would only leak on the day a group is removed.
  const { code } = readSource('src/components/layout/AdminSidebar.jsx');
  assert.match(code, /const GROUPS_KEY = 'admin-sidebar-groups'/,
    'one key holding a map, not a key per group');
  assert.match(code, /useEffect\(\(\) => \{\s*try \{\s*setGroupCollapse\(parseGroupCollapse\(localStorage/,
    'the stored map must be read in an effect, not during render');
  assert.match(code, /parseGroupCollapse\(localStorage\.getItem\(GROUPS_KEY\), GROUP_IDS\)/,
    'the whitelist passed to the parser must be the group IDS, never the labels');
  assert.doesNotMatch(code, /GROUPS_KEY[^\n]*group\.label/,
    'storage keyed on a Thai display label resets every preference the day it is reworded');
});
