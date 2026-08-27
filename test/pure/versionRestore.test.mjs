import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveContent } from '@/lib/pageBuilder/draftState';
import { DRAFT_CONTENT_KEYS, LIVE_ONLY_KEYS } from '@/lib/schemas/pageBuilder';
import { canRestoreVersion, restoreWouldLoseWork } from '@/lib/pageBuilder/editorStatus';
import { restoreWarning } from '@/components/pageBuilder/editor/VersionHistory';

/**
 * ROUND 34, commit 2 — restoring a version writes a DRAFT, and writes exactly
 * the draft half of it.
 *
 * ── THE ONE THAT MATTERS ──────────────────────────────────────────────────
 * A PageVersion snapshot is a WHOLE PAGE. It carries `slug`, `status`,
 * `promotionId`, `slugHistory`, `preview` — every live-only field. If the
 * restore handed that to saveDraftContent, an author restoring last week's
 * content would silently restore last week's URL with it, and the 301 history
 * that the slug rename built. The page would move and nothing would say so.
 *
 * So the pick is asserted as an EXACT SET, not a spot check, and the control
 * below proves the exact-set form is what catches a live-only key rather than
 * the assertion happening to be satisfied.
 *
 * ── WHY effectiveContent AND NOT A NEW HELPER ─────────────────────────────
 * It already picks exactly DRAFT_CONTENT_KEYS off a page-shaped object, and it
 * is the same function the editor and /preview seed from. A second picker with
 * the same job is the drift draftState.js's header exists to refuse — a key
 * dropped from one side would just quietly stop being restored.
 */

/** A stored snapshot, in the shape publishPageStatus writes: whole page, no draft. */
const SNAPSHOT = {
  _id: 'page-1',
  slug: 'last-weeks-slug',
  title: 'Last Week',
  pageType: 'general',
  status: 'published',
  publishStartDate: null,
  publishEndDate: null,
  promotionId: 'PROMO-OLD',
  promotionOrder: 7,
  slugHistory: ['older-slug'],
  preview: { enabled: true, passwordHash: 'x' },
  createdBy: { id: 'u0', name: 'Author A' },
  updatedBy: { id: 'u0', name: 'Author A' },
  theme: 'ai_purple',
  showHeader: false,
  showFooter: true,
  showStickyCta: true,
  sections: [{ id: 's1', type: 'heading' }],
  seo: { metaTitle: 'old meta' },
  jsonLd: { mode: 'off' },
  promotionCover: 'https://example.com/old.jpg',
};

test('the restore pick is exactly the draft half of a snapshot', async (t) => {
  await t.test('it returns exactly DRAFT_CONTENT_KEYS — the whole set, and nothing else', () => {
    const picked = effectiveContent(SNAPSHOT);
    assert.deepEqual(
      Object.keys(picked).sort(),
      [...DRAFT_CONTENT_KEYS].sort(),
      'the restore payload is no longer exactly the draft content keys'
    );
  });

  await t.test('no live-only key survives the pick, named one at a time', () => {
    const picked = effectiveContent(SNAPSHOT);
    for (const key of LIVE_ONLY_KEYS) {
      assert.equal(
        key in picked, false,
        `restoring a version would write the live-only key ${key} — the page's identity would move`
      );
    }
  });

  await t.test('the four identity fields by name, because those are the destructive ones', () => {
    const picked = effectiveContent(SNAPSHOT);
    for (const key of ['slug', 'status', 'promotionId', 'slugHistory']) {
      assert.equal(key in picked, false, `${key} reached the restore payload`);
    }
    // …and the content really did come through, so the emptiness above is not
    // the pick having returned nothing at all.
    assert.equal(picked.title, 'Last Week');
    assert.equal(picked.theme, 'ai_purple');
    assert.deepEqual(picked.sections, [{ id: 's1', type: 'heading' }]);
  });

  await t.test('CONTROL: a live-only key in the pick IS caught, by name', () => {
    // The discrimination form. If the exact-set assertion does not throw on a
    // payload with `slug` spliced in, the three cases above prove nothing.
    const widened = { ...effectiveContent(SNAPSHOT), slug: SNAPSHOT.slug };
    assert.throws(
      () => assert.deepEqual(Object.keys(widened).sort(), [...DRAFT_CONTENT_KEYS].sort()),
      /Expected values to be/,
      'the exact-set assertion does NOT catch a live-only key in the payload'
    );
    assert.throws(
      () => assert.equal('slug' in widened, false),
      'the per-key assertion does NOT catch a live-only key in the payload'
    );
  });

  await t.test('a snapshot that still carried a draft would NOT be picked from it', () => {
    // Commit 1 strips on read, so this state cannot arrive — but if it ever
    // did, effectiveContent's draft branch would prefer the pending edit over
    // the published content, which is the opposite of "restore this version".
    // Pinned so the read-side strip cannot be removed as redundant.
    const withDraft = { ...SNAPSHOT, draft: { title: 'PENDING_EDIT', sections: [] } };
    assert.equal(
      effectiveContent(withDraft).title, 'PENDING_EDIT',
      'effectiveContent no longer prefers a draft — commit 1 strip may be re-examined'
    );
    assert.equal(
      effectiveContent(SNAPSHOT).title, 'Last Week',
      'and the stripped snapshot restores the published content'
    );
  });
});

test('when a restore is offered, and when it warns', async (t) => {
  const state = (over = {}) => ({
    pageId: 'p1', saving: false, conflict: null,
    hadDraft: false, contentDirty: false, identityDirty: false, ...over,
  });

  await t.test('canRestoreVersion: allowed on a clean saved page', () => {
    assert.equal(canRestoreVersion(state()), true);
  });

  await t.test('canRestoreVersion: refused mid-save, after a conflict, and with no id', () => {
    assert.equal(canRestoreVersion(state({ saving: true })), false, 'allowed mid-save');
    assert.equal(canRestoreVersion(state({ conflict: { message: 'x' } })), false, 'allowed after a conflict');
    assert.equal(canRestoreVersion(state({ pageId: null })), false, 'allowed on an unsaved page');
    assert.equal(canRestoreVersion(null), false, 'allowed with no state at all');
  });

  await t.test('canRestoreVersion is NOT canDiscardDraft — it is offered with no draft', () => {
    // The distinction the two predicates exist for: restoring onto a clean page
    // is the harmless case and the common one. A shared predicate would hide it.
    assert.equal(canRestoreVersion(state({ hadDraft: false })), true);
    assert.equal(canRestoreVersion(state({ hadDraft: true })), true);
  });

  await t.test('restoreWouldLoseWork: false only when there is nothing to lose', () => {
    assert.equal(restoreWouldLoseWork(state()), false);
    assert.equal(restoreWouldLoseWork(state({ hadDraft: true })), true, 'a stored draft is work');
    assert.equal(restoreWouldLoseWork(state({ contentDirty: true })), true, 'local content edits are work');
    assert.equal(restoreWouldLoseWork(state({ identityDirty: true })), true, 'local identity edits are work');
    assert.equal(restoreWouldLoseWork(null), false);
  });
});

test('the confirmation says which case the author is in', async (t) => {
  const WHEN = '1 ส.ค. 2569 10:00';

  await t.test('the loss-bearing text names both losses and says it cannot be undone', () => {
    const text = restoreWarning(true, WHEN);
    assert.equal(
      text,
      `นำเนื้อหาของเวอร์ชันวันที่ ${WHEN} มาเป็นฉบับร่าง — ฉบับร่างที่ยังไม่เผยแพร่และการแก้ไขที่ยังไม่บันทึกในแท็บนี้จะถูกเขียนทับทั้งหมด และย้อนกลับไม่ได้`
    );
  });

  await t.test('the harmless text says the published page does not move', () => {
    const text = restoreWarning(false, WHEN);
    assert.equal(
      text,
      `นำเนื้อหาของเวอร์ชันวันที่ ${WHEN} มาเป็นฉบับร่าง — หน้าที่เผยแพร่อยู่ตอนนี้ยังไม่เปลี่ยน จนกว่าจะกด “เผยแพร่”`
    );
  });

  await t.test('the two differ, and neither is a prefix of the other', () => {
    // Thai negates by PREFIX (ไม่…), so two strings that differ only by a
    // trailing clause can read as agreeing while meaning opposite things. Both
    // directions are checked so neither can be the other truncated.
    const loud = restoreWarning(true, WHEN);
    const quiet = restoreWarning(false, WHEN);
    assert.notEqual(loud, quiet);
    assert.equal(loud.startsWith(quiet), false, 'the warning is the quiet text plus a suffix');
    assert.equal(quiet.startsWith(loud), false, 'the quiet text is the warning truncated');
  });

  await t.test('only the loss-bearing text claims irreversibility', () => {
    assert.equal(restoreWarning(true, WHEN).includes('ย้อนกลับไม่ได้'), true);
    assert.equal(restoreWarning(false, WHEN).includes('ย้อนกลับไม่ได้'), false,
      'the harmless case is being described as irreversible');
  });

  await t.test('both name the version being restored, so neither is generic', () => {
    for (const loses of [true, false]) {
      assert.equal(restoreWarning(loses, WHEN).includes(WHEN), true,
        `the ${loses ? 'warning' : 'quiet'} text does not say WHICH version`);
    }
  });
});
