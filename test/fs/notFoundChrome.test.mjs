// The not-found tree fetches nothing.
//
// Next renders the root `not-found.jsx` into EVERY page's RSC payload, so any
// data-fetching component mounted there runs for every page on the site — and
// did: the root not-found used to mount PublicHeader, doubling the header's
// ~9 Mongo reads and its ~195 K-char nav props on every response (a 404 body
// was 734 KB; a prerendered /about-us carried two identical `programs` chunks).
//
// These guards pin the rule from both ends: every not-found.jsx above the
// public pages imports only data-free chrome, and that chrome's own import
// view reaches nothing under @/lib/actions, @/lib/api, @/lib/db, or the
// data-fetching header itself. Import view (not code view) because an import
// is the only way this data can arrive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource, sourceExists, walkSources } from '../sourceScan.mjs';
import NotFound from '@/app/not-found';

const ROOT_NOT_FOUND = 'src/app/not-found.jsx';
const STATIC_HEADER = 'src/components/layout/StaticHeader.jsx';
const FOOTER = 'src/components/layout/PublicFooter.jsx';

/** Any import that could put a database or upstream read behind a component. */
const DATA_IMPORT = /from\s+['"](@\/lib\/(actions|api|db|navmenu|masterclass|career-paths|faqs|landing|promotions)\b[^'"]*|@\/components\/layout\/PublicHeader(?:Client)?|@\/models\/[^'"]*)['"]/;

/** Every not-found.jsx that sits above a public page (admin has its own tree). */
function publicNotFounds() {
  return walkSources('src/app').filter(
    (s) => /\/not-found\.jsx$/.test(s.rel) && !s.rel.startsWith('src/app/admin/')
  );
}

test('the root not-found exists and mounts StaticHeader, never PublicHeader', () => {
  assert.ok(sourceExists(ROOT_NOT_FOUND));
  const { withImports } = readSource(ROOT_NOT_FOUND);
  assert.match(withImports, /import \{ StaticHeader \} from '@\/components\/layout\/StaticHeader'/);
  assert.doesNotMatch(withImports, /PublicHeader\b/, 'PublicHeader fetches nav data — it must not sit in the not-found tree');
});

test('every not-found.jsx above the public pages has a data-free import view', () => {
  const files = publicNotFounds();
  assert.ok(files.length >= 1, 'walk found no not-found.jsx (the check can see nothing)');
  for (const s of files) {
    const hit = s.withImports.match(DATA_IMPORT);
    assert.equal(hit, null, `${s.rel} imports data-bearing code: ${hit?.[0]}`);
  }
});

test('no (public)/not-found.jsx mounts the data-fetching header (the tempting "fix" that doubles it for every page in the group)', () => {
  const rel = 'src/app/(public)/not-found.jsx';
  if (!sourceExists(rel)) return; // absent is fine; present must stay data-free
  assert.doesNotMatch(readSource(rel).withImports, /PublicHeader\b/, `${rel} must not import PublicHeader`);
});

test('StaticHeader and PublicFooter import view: no @/lib data modules, no models, no PublicHeader', () => {
  for (const rel of [STATIC_HEADER, FOOTER]) {
    const { withImports } = readSource(rel);
    const hit = withImports.match(DATA_IMPORT);
    assert.equal(hit, null, `${rel} imports data-bearing code: ${hit?.[0]}`);
    assert.doesNotMatch(withImports, /\bawait\b|async function/, `${rel} must be synchronous — nothing to await`);
  }
});

test('CONTROL: the data-import matcher fires on each forbidden shape, and not on the allowed ones', () => {
  for (const line of [
    "import { PublicHeader } from '@/components/layout/PublicHeader';",
    "import { listPrograms } from '@/lib/api/programs';",
    "import { getActiveTopBars } from '@/lib/actions/site-notifications';",
    "import { dbConnect } from '@/lib/db/connect';",
    "import { getNavMenuData } from '@/lib/navmenu/getNavMenuData';",
    "import Article from '@/models/Article';",
  ]) {
    assert.ok(DATA_IMPORT.test(line), `should fire: ${line}`);
  }
  for (const line of [
    "import { Logo } from '@/components/brand/Logo';",
    "import { siteConfig, footerNav, policyNav } from '@/config/site';",
    "import { cn } from '@/lib/utils';",
    "import Link from 'next/link';",
  ]) {
    assert.ok(!DATA_IMPORT.test(line), `should not fire: ${line}`);
  }
});

test('the 404 page renders (renderToStaticMarkup) with its copy, both links, and a header + footer', () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.match(html, /404 — Page not found/);
  assert.match(html, /ไม่พบหน้าที่คุณค้นหา/);
  assert.match(html, /href="\/"[^>]*>กลับหน้าแรก</);
  assert.match(html, /href="\/training-course"[^>]*>ดูหลักสูตรทั้งหมด</);
  assert.match(html, /<header[^>]*>/);
  assert.match(html, /<footer[^>]*>/);
  assert.match(html, /href="\/search"/, 'the static bar links to search');
  assert.doesNotMatch(html, /"programs":\[/, 'no nav catalogue is serialised');
});
