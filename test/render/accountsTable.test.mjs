import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { AccountsClient } from '@/app/admin/accounts/_components/AccountsClient';
import { readSource } from '../sourceScan.mjs';

/**
 * The /admin/accounts table, RENDERED.
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and a leaked React root breaks unrelated files. The client component is
 * rendered directly with fixture rows — `listAdmins()` is a server action and
 * is not what this file is about; what the ROWS look like is.
 *
 * ── WHY "ROWS FOLLOW A CHANGED PROP" IS A RENDER ASSERTION HERE ─────────────
 * The defect was `useState(initialAdmins)` with no setter ever called: after a
 * mutation's `router.refresh()` the page handed down a new array and the table
 * kept the old one. renderToStaticMarkup cannot re-render a surviving instance,
 * so the behavioural half is a click-test; what CAN be asserted is that two
 * renders with two props draw two different tables (a state copy seeded from
 * the first prop would still draw the first on a fresh mount — so this alone is
 * not proof) AND, from the source, that no `useState(` takes the prop. The two
 * together are the claim.
 */

const CLIENT_REL = 'src/app/admin/accounts/_components/AccountsClient.jsx';
const PUBLIC_ID = '9expert/avatars/abc123';
const DEFAULT_36 = '/avatar/avatar-default-128.png';
const ROLES = [{ key: 'admin', name: 'Admin', color: '#6b7280', isSuperadmin: false }];

const row = (over = {}) => ({
  _id: 'u1', email: 'one@9expert.co.th', name: 'One', roleKey: 'admin', active: true,
  lastLoginAt: '2026-09-17T09:00:00.000Z', imagePublicId: null, ...over,
});

const render = (initialAdmins, currentUserId = 'u1') =>
  new JSDOM(`<!doctype html><body>${renderToStaticMarkup(
    createElement(AccountsClient, { initialAdmins, roles: ROLES, currentUserId }),
  )}</body>`).window.document;

const headings = (doc) => [...doc.querySelectorAll('thead th')].map((th) => th.textContent.trim());
const text = (el) => el?.textContent?.trim() ?? null;

// ── the avatar column ───────────────────────────────────────────────────────

test('column 1 is โปรไฟล์ and holds a 36px round <img> — the Cloudinary derivative for a public_id, the bundled default without one', () => {
  const doc = render([row({ _id: 'u1', imagePublicId: PUBLIC_ID }), row({ _id: 'u2', email: 'two@9expert.co.th', imagePublicId: null })]);
  assert.equal(headings(doc)[0], 'โปรไฟล์');
  const imgs = [...doc.querySelectorAll('tbody tr td:first-child img')];
  assert.equal(imgs.length, 2, 'one avatar per row, in the FIRST cell');
  const [withPhoto, withoutPhoto] = imgs;
  assert.match(withPhoto.getAttribute('src'), /^https:\/\/res\.cloudinary\.com\/.+\/c_fill,f_auto,g_face,h_36,q_auto,w_36\/9expert\/avatars\/abc123$/);
  assert.equal(withoutPhoto.getAttribute('src'), DEFAULT_36, 'no photo → the same bundled default the sidebar shows');
  for (const img of imgs) {
    assert.equal(img.getAttribute('alt'), '', 'the name is the next column — no second announcement');
    assert.equal(img.getAttribute('width'), '36');
    assert.equal(img.getAttribute('height'), '36');
    assert.match(img.className, /\brounded-full\b/);
    assert.match(img.className, /\bobject-cover\b/);
  }
  assert.equal(imgs.some((i) => i.getAttribute('src') === PUBLIC_ID), false, 'the raw public_id is never the src by itself');
});

test('the avatar cell is the shared AdminAvatar, not a third <img>', () => {
  const { withImports, code } = readSource(CLIENT_REL);
  assert.match(withImports, /from ['"]@\/components\/admin\/AdminAvatar['"]/);
  assert.equal(/<img\b/.test(code), false, 'AccountsClient draws no <img> of its own');
  assert.match(code, /<AdminAvatar publicId=\{a\.imagePublicId \?\? null\} size=\{36\} \/>/);
});

// ── the heading order ───────────────────────────────────────────────────────

test('headings, left to right', () => {
  assert.deepEqual(headings(render([row()])), ['โปรไฟล์', 'อีเมล', 'ชื่อ', 'Role', 'สถานะ', 'เข้าใช้ล่าสุด', 'การจัดการ']);
});

test('the (คุณ) marker survives in the email cell, and the empty state spans every column', () => {
  const doc = render([row({ _id: 'me' })], 'me');
  assert.match(text(doc.querySelector('tbody tr td:nth-child(2)')), /one@9expert\.co\.th\s*\(คุณ\)/);
  const empty = render([]);
  const cell = empty.querySelector('tbody td');
  assert.equal(text(cell), 'ไม่มีบัญชี');
  assert.equal(Number(cell.getAttribute('colspan')), headings(empty).length, 'colSpan matches the heading count');
});

// ── rows follow the prop ────────────────────────────────────────────────────

test('rows follow a changed prop: two renders, two tables — and the source never copies the prop into state', () => {
  const a = render([row({ _id: 'u1', email: 'first@9expert.co.th' })]);
  const b = render([row({ _id: 'u1', email: 'first@9expert.co.th' }), row({ _id: 'u2', email: 'second@9expert.co.th' })]);
  assert.equal(a.querySelectorAll('tbody tr').length, 1);
  assert.equal(b.querySelectorAll('tbody tr').length, 2);
  assert.match(text(b.querySelector('tbody tr:nth-child(2) td:nth-child(2)')), /second@9expert\.co\.th/);

  const { code } = readSource(CLIENT_REL);
  const seeded = [...code.matchAll(/useState\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.equal(seeded.includes('initialAdmins'), false, 'useState(initialAdmins) is the defect — rows must read the prop');
  assert.equal(/\binitialAdmins\b/.test(code), true, 'the prop is still read');
  assert.equal(/setAdmins/.test(code), false, 'no state setter for the list exists any more');
});

test('CONTROL: the useState extractor sees a seeded call', () => {
  const seeded = [...'const [admins, setAdmins] = useState(initialAdmins);'.matchAll(/useState\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(seeded, ['initialAdmins']);
});

// ── the wrapper scrolls ─────────────────────────────────────────────────────

test('the table wrapper is overflow-x-auto, so a narrow screen scrolls the table instead of crushing eight columns', () => {
  const doc = render([row()]);
  const wrapper = doc.querySelector('table').parentElement;
  assert.match(wrapper.className, /\boverflow-x-auto\b/);
  assert.doesNotMatch(wrapper.className, /\boverflow-hidden\b/);
});
