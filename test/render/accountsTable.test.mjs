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
  assert.deepEqual(headings(render([row()])), ['โปรไฟล์', 'อีเมล', 'ชื่อ', 'Role', 'สถานะ', 'เข้าใช้ล่าสุด', 'ออนไลน์', 'การจัดการ']);
});

// ── the presence column ─────────────────────────────────────────────────────

const LAST_SEEN = '2026-09-17T09:12:00.000Z';
const presenceCell = (doc, nth = 1) => doc.querySelector(`tbody tr:nth-child(${nth}) td[data-cell="presence"]`);
const statusCell = (doc, nth = 1) => doc.querySelector(`tbody tr:nth-child(${nth}) td:nth-child(5)`);

test('presence heading is ออนไลน์ — not a second สถานะ — and sits between เข้าใช้ล่าสุด and การจัดการ', () => {
  const h = headings(render([row()]));
  assert.equal(h.filter((x) => x === 'สถานะ').length, 1, 'exactly one สถานะ heading');
  assert.equal(h.indexOf('ออนไลน์'), h.indexOf('เข้าใช้ล่าสุด') + 1);
  assert.equal(h.indexOf('การจัดการ'), h.indexOf('ออนไลน์') + 1);
});

test('online row: a green dot plus ออนไลน์, nothing underneath', () => {
  const cell = presenceCell(render([row({ online: true, lastSeenAt: LAST_SEEN })]));
  const mark = cell.querySelector('[data-presence]');
  assert.equal(mark.getAttribute('data-presence'), 'online');
  assert.equal(text(mark), 'ออนไลน์');
  const dot = mark.querySelector('span[aria-hidden="true"]');
  assert.match(dot.className, /\bbg-green-500\b/);
  assert.match(dot.className, /\brounded-full\b/);
  assert.equal(cell.querySelector('[data-last-seen]'), null);
});

test('offline row with a last beat: a hollow muted dot, ออฟไลน์, and เห็นล่าสุด <time> in the เข้าใช้ล่าสุด format', () => {
  const doc = render([row({ online: false, lastSeenAt: LAST_SEEN, lastLoginAt: LAST_SEEN })]);
  const cell = presenceCell(doc);
  const mark = cell.querySelector('[data-presence]');
  assert.equal(mark.getAttribute('data-presence'), 'offline');
  assert.match(text(mark), /^ออฟไลน์/);
  const dot = mark.querySelector('span[aria-hidden="true"]');
  assert.doesNotMatch(dot.className, /\bbg-green-500\b/);
  assert.match(dot.className, /\bborder\b/, 'hollow: a border, no fill');
  const seen = cell.querySelector('[data-last-seen]');
  assert.ok(seen, 'the last-seen line renders');
  const lastLoginText = text(doc.querySelector('tbody tr td:nth-child(6)'));
  assert.equal(text(seen), `เห็นล่าสุด ${lastLoginText}`, 'same formatter as เข้าใช้ล่าสุด (both fed the same instant)');
  assert.match(seen.className, /\btext-xs\b/);
});

test('offline row with no beat ever: ออฟไลน์ and NOTHING under it', () => {
  const cell = presenceCell(render([row({ online: false, lastSeenAt: null })]));
  assert.equal(cell.querySelector('[data-presence]').getAttribute('data-presence'), 'offline');
  assert.equal(cell.querySelector('[data-last-seen]'), null);
  assert.equal(text(cell), 'ออฟไลน์');
});

test('the column draws the SERVER\'s boolean only: a disabled account with a fresh lastSeenAt is Offline because listAdmins says so', () => {
  // The rule lives in src/lib/admin/presence.js and runs in listAdmins; the
  // client never re-derives it from the timestamp. A row that arrives with
  // online:false and a fresh lastSeenAt — exactly what a disabled admin's row
  // looks like — is drawn Offline, with the last-seen line.
  const fresh = new Date().toISOString();
  const doc = render([row({ active: false, online: false, lastSeenAt: fresh })]);
  assert.equal(presenceCell(doc).querySelector('[data-presence]').getAttribute('data-presence'), 'offline');
  assert.ok(presenceCell(doc).querySelector('[data-last-seen]'));
  assert.equal(text(statusCell(doc)), 'ปิดใช้', 'สถานะ says disabled, in its own words');
  // and a row with no `online` key at all (an older payload) is not online
  const legacy = render([row({ lastSeenAt: fresh })]);
  assert.equal(presenceCell(legacy).querySelector('[data-presence]').getAttribute('data-presence'), 'offline');
});

test('สถานะ and ออนไลน์ do not share a shape: enabled text has no dot, presence always has one', () => {
  const doc = render([row({ online: true })]);
  assert.equal(statusCell(doc).querySelector('span[aria-hidden="true"]'), null, 'สถานะ is plain text');
  assert.equal(text(statusCell(doc)), 'ใช้งาน');
  assert.ok(presenceCell(doc).querySelector('span[aria-hidden="true"]'), 'presence has its dot');
});

test('listAdmins decides online with isOnline and the server clock (source)', () => {
  const { code, withImports } = readSource('src/lib/actions/admin-accounts.js');
  assert.match(withImports, /from ['"]@\/lib\/admin\/presence['"]/);
  assert.match(code, /online: isOnline\(d, now\)/);
  assert.match(code, /const now = Date\.now\(\)/);
  const client = readSource(CLIENT_REL).code;
  assert.equal(/isOnline\(|lastSignedOutAt|PRESENCE_THRESHOLD/.test(client), false, 'the client never re-derives presence');
  assert.match(client, /online=\{a\.online === true\}/);
});

test('the list refreshes itself only while visible, throttled, and once on focus (source)', () => {
  const { code } = readSource(CLIENT_REL);
  assert.match(code, /REFRESH_MS = 60_000/);
  assert.match(code, /REFRESH_MIN_GAP_MS = 30_000/);
  assert.match(code, /document\.visibilityState !== 'visible'/, 'a hidden tab does not refresh');
  assert.match(code, /setInterval\(tick, REFRESH_MS\)/);
  assert.match(code, /addEventListener\('focus', tick\)/);
  assert.match(code, /clearInterval\(timer\)/);
  assert.equal(/sendBeacon|pagehide|beforeunload/.test(code), false);
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
