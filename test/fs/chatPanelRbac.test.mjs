import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PAGES, ALL_PAGE_KEYS, PAGE_KEYS_BY_GROUP, resolvePageKey } from '@/lib/rbac/pages';
import { canAccess } from '@/lib/rbac/access';
import { AUDIT_CONTRACT_ENTRIES, MENUS_WITHOUT_MUTATIONS, pairContract } from '@/lib/audit/auditContract';
import { MENU_ENUM } from '@/models/AdminAuditLog';
import { readSource, sourceExists, walkSources } from '../sourceScan.mjs';

/**
 * The two AI Chat permission keys, and everything one registry row is
 * supposed to earn (docs/admin-chat-panel-phase-a.md §A3, §A5):
 *
 *   the key            → ALL_PAGE_KEYS, MENU_ENUM, the /admin/roles checkbox
 *   the sidebar row    → NAV_GROUPS (a separate list; rbacNavParity holds it)
 *   the seed mirror    → migrate-rbac.mjs (rbacRegistryMirror holds it) —
 *                        and, THIS round's ruling, granted to NO seeded role
 *   the audit pair     → chat_transcripts|transcript, act_only
 *   the pages          → requirePage with their own key, force-dynamic,
 *                        server components (no 'use client' under the tree)
 *
 * The three parity guards each check one seam; this file checks the facts
 * about THESE keys that no generic guard states — which href belongs to which
 * key, which one wins the prefix, and that the seed script hands them out to
 * nobody.
 */

const KEYS = ['chat_stats', 'chat_transcripts'];
const HREFS = { chat_stats: '/admin/chat', chat_transcripts: '/admin/chat/sessions' };
const PAGES = {
  chat_stats: 'src/app/admin/chat/page.jsx',
  chat_transcripts_list: 'src/app/admin/chat/sessions/page.jsx',
  chat_transcripts_detail: 'src/app/admin/chat/sessions/[sessionId]/page.jsx',
};

// ── the registry ─────────────────────────────────────────────────────────────

test('rbac: both keys are registered, with these hrefs, as prefix matches', () => {
  const rows = ADMIN_PAGES.flatMap((g) => g.pages).filter((p) => KEYS.includes(p.key));
  assert.deepEqual(
    rows.map(({ key, href, match }) => ({ key, href, match })),
    [
      { key: 'chat_stats', href: '/admin/chat', match: 'prefix' },
      { key: 'chat_transcripts', href: '/admin/chat/sessions', match: 'prefix' },
    ],
  );
  assert.deepEqual(rows.map((r) => r.label), ['สถิติแชต AI', 'บทสนทนาแชต AI']);
  for (const k of KEYS) assert.ok(ALL_PAGE_KEYS.includes(k));
});

test('rbac: the "AI Chat" group sits immediately after ภาพรวม and holds exactly the two keys', () => {
  const groups = ADMIN_PAGES.map((g) => g.group);
  assert.equal(groups[0], 'ภาพรวม');
  assert.equal(groups[1], 'AI Chat', `expected AI Chat second, got: ${groups.join(' | ')}`);
  assert.deepEqual(PAGE_KEYS_BY_GROUP['AI Chat'], KEYS);
});

test('rbac: longest href wins — the transcript routes resolve to chat_transcripts, never chat_stats', () => {
  assert.equal(resolvePageKey('/admin/chat'), 'chat_stats');
  assert.equal(resolvePageKey('/admin/chat/'), 'chat_stats');
  assert.equal(resolvePageKey('/admin/chat?from=2026-09-01'), null, 'a query string is not part of a path (callers strip it)');
  assert.equal(resolvePageKey('/admin/chat/sessions'), 'chat_transcripts');
  assert.equal(resolvePageKey('/admin/chat/sessions/3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c'), 'chat_transcripts');
  assert.equal(resolvePageKey('/admin/chatter'), null, 'prefix means a path segment, not a substring');
});

test('rbac: chat_stats does not imply chat_transcripts, and superadmin holds both', () => {
  const statsOnly = { isSuperadmin: false, pages: ['chat_stats'] };
  assert.equal(canAccess(statsOnly, 'chat_stats'), true);
  assert.equal(canAccess(statsOnly, 'chat_transcripts'), false);
  const transcriptsOnly = { isSuperadmin: false, pages: ['chat_transcripts'] };
  assert.equal(canAccess(transcriptsOnly, 'chat_stats'), false, 'the keys are independent in both directions');
  assert.equal(canAccess({ isSuperadmin: true, pages: null }, 'chat_transcripts'), true);
});

test('rbac: both keys are in the audit MENU_ENUM, derived from the registry', () => {
  for (const k of KEYS) assert.ok(MENU_ENUM.includes(k), `${k} missing from MENU_ENUM`);
});

// ── the audit pair ───────────────────────────────────────────────────────────

test('audit: chat_transcripts|transcript is registered act_only; chat_stats has no mutations', () => {
  const entries = AUDIT_CONTRACT_ENTRIES.filter((e) => e.menu === 'chat_transcripts');
  assert.deepEqual(entries.map(({ menu, entity, diff }) => ({ menu, entity, diff })), [{ menu: 'chat_transcripts', entity: 'transcript', diff: 'act_only' }]);
  assert.deepEqual(pairContract('chat_transcripts', 'transcript'), { label: 'บทสนทนาแชต AI', diff: 'act_only' });
  assert.ok(MENUS_WITHOUT_MUTATIONS.includes('chat_stats'), 'chat_stats is read-only and must not gain a contract by accident');
  assert.equal(MENUS_WITHOUT_MUTATIONS.includes('chat_transcripts'), false);
});

// ── the seed mirror: granted to nobody ───────────────────────────────────────

test('seed: migrate-rbac mirrors both keys and hands them to NO seeded role', () => {
  const { code } = readSource('src/scripts/migrate-rbac.mjs');
  for (const k of KEYS) {
    assert.match(code, new RegExp(`'${k}'`), `${k} missing from the ALL_PAGE_KEYS mirror`);
    assert.match(code, new RegExp(`^\\s*${k}:\\s*'SUPER'`, 'm'), `${k} must be tagged SUPER — no membership set grants it`);
  }
  const excluded = /const ADMIN_EXCLUDED = new Set\(\[([^\]]*)\]\)/.exec(code);
  assert.ok(excluded, 'ADMIN_EXCLUDED not found');
  for (const k of KEYS) {
    assert.ok(excluded[1].includes(`'${k}'`), `${k} must be in ADMIN_EXCLUDED, or the widened admin role receives it on the next seed`);
  }
});

test('CONTROL: the SUPER-tag matcher rejects a key tagged anything else', () => {
  assert.equal(/^\s*chat_stats:\s*'SUPER'/m.test("  chat_stats: 'ALL',"), false);
  assert.equal(/^\s*chat_stats:\s*'SUPER'/m.test("  chat_stats: 'SUPER',"), true);
});

// ── the pages ────────────────────────────────────────────────────────────────

test('pages: each route file exists, is force-dynamic, and calls requirePage with ITS key', () => {
  const expectKey = {
    [PAGES.chat_stats]: 'chat_stats',
    [PAGES.chat_transcripts_list]: 'chat_transcripts',
    [PAGES.chat_transcripts_detail]: 'chat_transcripts',
  };
  for (const [rel, key] of Object.entries(expectKey)) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    const { code } = readSource(rel);
    assert.match(code, /export const dynamic = 'force-dynamic'/, `${rel}: not force-dynamic`);
    const calls = [...code.matchAll(/requirePage\(['"]([a-z_]+)['"]\)/g)].map((m) => m[1]);
    assert.deepEqual(calls, [key], `${rel}: expected exactly one requirePage('${key}')`);
    assert.ok(/await requirePage\(/.test(code), `${rel}: the guard must be awaited`);
  }
});

test('pages: nothing under src/app/admin/chat is a client component, and the pages import the server-only client', () => {
  const files = walkSources('src/app/admin/chat');
  assert.ok(files.length >= 4, `expected the three pages and the parts file; found ${files.length}`);
  for (const f of files) {
    assert.equal(/^\s*['"]use client['"]/.test(f.code), false, `${f.rel} is a client component — one hop from the panel key`);
    assert.equal(/dangerouslySetInnerHTML/.test(f.code), false, `${f.rel} renders raw HTML — transcript text must be text`);
  }
  for (const rel of Object.values(PAGES)) {
    assert.match(readSource(rel).withImports, /from '@\/lib\/chatPanel\/client'/, `${rel} does not read through the server-only client`);
  }
});

test('pages: the transcript page audits a `view` inside the success branch only, act_only-shaped', () => {
  const { code } = readSource(PAGES.chat_transcripts_detail);
  const call = /recordView\(\{[\s\S]*?\}\);/.exec(code);
  assert.ok(call, 'no recordView call');
  assert.match(call[0], /menu: 'chat_transcripts'/);
  assert.match(call[0], /entity: 'transcript'/);
  assert.match(call[0], /action: 'view'/);
  assert.match(call[0], /recordId: sessionId/);
  assert.equal(/before:|after:/.test(call[0]), false, 'act_only: no payload keys');
  // The call sits inside `if (result.ok) { … }` — the guard is textually before it
  // and the two are adjacent. Behaviour is proven in test/render/chatPanelPages.
  const guardAt = code.indexOf('if (result.ok) {');
  assert.ok(guardAt !== -1 && guardAt < call.index, 'the view is not gated on the read succeeding');
  assert.match(code, /recordView = recordAdminActionAfter/, 'production writes through the after() writer');
  for (const other of [PAGES.chat_stats, PAGES.chat_transcripts_list]) {
    assert.equal(/recordAdminAction/.test(readSource(other).withImports), false, `${other} must not audit — only a rendered transcript is a view`);
  }
});
