import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PREVIEW_MODES, PREVIEW_MODE_PARAM, DEFAULT_PREVIEW_MODE, PREVIEW_BANNERS,
  resolvePreviewMode, previewBannerKey, previewBanner,
  hasPublishedVersion, versionRowMatchesLive,
} from '@/lib/pageBuilder/previewMode';

/**
 * ROUND 36, commit 1 — the decisions /preview/[slug] makes, as functions.
 *
 * The route is an async server component that reads cookies(), so it cannot be
 * rendered by this tier. Its BEHAVIOUR is driven for real in the suite's single
 * fakeDb owner (test/fs/pageBuilderDraftActions); what is proven here is that
 * each decision is total, and in particular that the three banner states
 * partition.
 */

test('the mode is resolved from one search param, and unknown falls to draft', async (t) => {
  await t.test('both modes resolve to themselves', () => {
    for (const mode of PREVIEW_MODES) {
      assert.equal(resolvePreviewMode({ [PREVIEW_MODE_PARAM]: mode }), mode);
    }
  });

  await t.test('the declared set is exactly two, draft first', () => {
    assert.deepEqual(PREVIEW_MODES, ['draft', 'published']);
    assert.equal(DEFAULT_PREVIEW_MODE, 'draft');
  });

  await t.test('anything else is draft — the behaviour this route already had', () => {
    // A typo, a stale bookmark, a crawler appending junk, or a repeated param
    // (which arrives as an ARRAY, not a string) must land on the existing
    // behaviour rather than on a claim about what the public can see.
    const junk = [
      undefined, null, {}, { mode: '' }, { mode: 'Published' }, { mode: 'live' },
      { mode: ['draft', 'published'] }, { mode: 1 }, { mode: true }, { other: 'published' },
    ];
    for (const sp of junk) {
      assert.equal(resolvePreviewMode(sp), 'draft', `resolved ${JSON.stringify(sp)} to a non-draft mode`);
    }
  });

  await t.test('CONTROL: the resolver is not simply always returning draft', () => {
    assert.equal(resolvePreviewMode({ mode: 'published' }), 'published',
      'the resolver never returns published — every case above is vacuous');
  });
});

test('the three banner states PARTITION', async (t) => {
  // Every input the route can produce. `pending` is a boolean; `mode` is one of
  // two. Four combinations, and the set is closed.
  const INPUTS = [
    { mode: 'draft', pending: true },
    { mode: 'draft', pending: false },
    { mode: 'published', pending: true },
    { mode: 'published', pending: false },
  ];

  await t.test('every input yields exactly one key, and every key is declared', () => {
    const declared = Object.keys(PREVIEW_BANNERS);
    assert.deepEqual(declared.sort(), ['draftMatchesLive', 'draftPending', 'published']);
    for (const input of INPUTS) {
      const key = previewBannerKey(input);
      assert.equal(declared.includes(key), true,
        `${JSON.stringify(input)} produced undeclared key ${key}`);
      assert.equal(typeof previewBanner(input), 'string');
    }
  });

  await t.test('the mapping is exactly this, input by input', () => {
    assert.deepEqual(INPUTS.map(previewBannerKey), [
      'draftPending', 'draftMatchesLive', 'published', 'published',
    ]);
  });

  await t.test('published mode ignores `pending` — that is the point of the mode', () => {
    // What is on screen is the live document; whether an unpublished draft
    // exists beside it does not change what visitors are reading. A banner
    // mentioning the draft would be the one sentence not about what is below it.
    assert.equal(
      previewBanner({ mode: 'published', pending: true }),
      previewBanner({ mode: 'published', pending: false })
    );
  });

  await t.test('the three strings are distinct and none is a prefix of another', () => {
    // Thai negates by PREFIX, so two banners differing only by a trailing
    // clause can read as agreeing while meaning opposite things. Both
    // directions, every pair.
    const all = Object.values(PREVIEW_BANNERS);
    assert.equal(new Set(all).size, 3, 'two banner states share a string');
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        assert.equal(a.startsWith(b), false, `"${a}" is "${b}" plus a suffix`);
      }
    }
  });

  await t.test('each string is the requirement’s, verbatim', () => {
    assert.equal(PREVIEW_BANNERS.draftPending, 'ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — ห้ามแชร์ลิงก์นี้ต่อ');
    assert.equal(PREVIEW_BANNERS.draftMatchesLive, 'หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้');
    assert.equal(PREVIEW_BANNERS.published, 'กำลังดูเวอร์ชันที่เผยแพร่อยู่ — ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้');
  });

  await t.test('only the published banner claims visitors are seeing it', () => {
    const CLAIM = 'ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้';
    assert.equal(PREVIEW_BANNERS.published.includes(CLAIM), true);
    assert.equal(PREVIEW_BANNERS.draftPending.includes(CLAIM), false,
      'the DRAFT banner claims visitors are seeing it');
    assert.equal(PREVIEW_BANNERS.draftMatchesLive.includes(CLAIM), false,
      'the no-draft banner claims visitors are seeing it');
  });

  await t.test('CONTROL: two states reachable at once IS caught', () => {
    // The discrimination form. A selector that could return two keys for one
    // input — or two keys mapping to one string — breaks the partition, and
    // both checks above must reject that shape.
    const overlapping = { a: 'same text', b: 'same text', c: 'other' };
    assert.throws(
      () => assert.equal(new Set(Object.values(overlapping)).size, 3),
      'the distinctness check does NOT catch two states sharing a string'
    );
    const prefixed = ['หน้านี้ไม่มีฉบับร่าง', 'หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่'];
    assert.throws(
      () => assert.equal(prefixed[1].startsWith(prefixed[0]), false),
      'the prefix check does NOT catch one banner being another plus a suffix'
    );
  });
});

test('a page has a published version only when something says so', async (t) => {
  await t.test('the counter alone is enough', () => {
    assert.equal(hasPublishedVersion({ publishedVersion: 1, hasVersionRow: false }), true);
    assert.equal(hasPublishedVersion({ publishedVersion: 9, hasVersionRow: false }), true);
  });

  await t.test('a surviving row alone is enough — the un-backfilled database', () => {
    // Round 35's counter is absent everywhere its backfill has not run, so the
    // row must be able to carry the answer by itself.
    assert.equal(hasPublishedVersion({ publishedVersion: undefined, hasVersionRow: true }), true);
    assert.equal(hasPublishedVersion({ publishedVersion: null, hasVersionRow: true }), true);
  });

  await t.test('neither means never published', () => {
    for (const publishedVersion of [undefined, null, 0]) {
      assert.equal(
        hasPublishedVersion({ publishedVersion, hasVersionRow: false }), false,
        `a page with publishedVersion ${String(publishedVersion)} claimed a published version`
      );
    }
  });

  await t.test('CONTROL: 0 is not 1 — the counter check is a threshold, not truthiness', () => {
    // $inc runs before the stamp, so the first publish mints 1. A page sitting
    // at 0 has never published, and `if (publishedVersion)` agrees only by
    // accident — this states the threshold explicitly.
    assert.equal(hasPublishedVersion({ publishedVersion: 0, hasVersionRow: false }), false);
    assert.equal(hasPublishedVersion({ publishedVersion: 1, hasVersionRow: false }), true);
  });
});

test('a version row is trusted unless it provably belongs to an earlier publish', async (t) => {
  await t.test('matching numbers are trusted', () => {
    assert.equal(versionRowMatchesLive({ publishedVersion: 3, rowVersionNumber: 3 }), true);
  });

  await t.test('a row BEHIND the counter is not — its snapshot write was lost', () => {
    // The counter moved, the row did not, so the newest surviving row belongs to
    // an earlier publish and naming its actor would credit the wrong person.
    assert.equal(versionRowMatchesLive({ publishedVersion: 4, rowVersionNumber: 3 }), false);
  });

  await t.test('an undetectable case is trusted, not suppressed', () => {
    // On an un-backfilled database neither number exists. The newest row is
    // still the newest publish, so suppressing its facts would lose true
    // information to guard against a drift that cannot be observed.
    for (const pair of [
      { publishedVersion: undefined, rowVersionNumber: null },
      { publishedVersion: 3, rowVersionNumber: null },
      { publishedVersion: undefined, rowVersionNumber: 3 },
    ]) {
      assert.equal(versionRowMatchesLive(pair), true, `${JSON.stringify(pair)} was suppressed`);
    }
  });

  await t.test('CONTROL: the rule really can return false', () => {
    assert.equal(versionRowMatchesLive({ publishedVersion: 4, rowVersionNumber: 3 }), false,
      'the rule never returns false, so every true above is vacuous');
  });
});
