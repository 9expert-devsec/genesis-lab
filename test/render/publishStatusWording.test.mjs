import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { EditorTopBar } from '@/components/pageBuilder/editor/EditorTopBar';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this repo.
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';
import { windowStartFromInput, windowEndFromInput } from '@/lib/pageBuilder/publishWindow';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 42, commit 2 — making unpublish findable, by wording alone.
 *
 * PublishDialog has offered all five statuses since round 5, `draft` among them
 * ("ยกเลิกเผยแพร่ กลับไปแก้ไข"). Nothing was missing. What was missing was a
 * reason to look: the button said เผยแพร่ and the dialog said เผยแพร่หน้านี้.
 *
 * WHAT THIS FILE DOES NOT RE-TEST, because each already has an owner and a
 * parallel assertion would be a second authority:
 *   · the settings dialog still has no Status control (round 27's decline)
 *     → test/render/pageDialogs, "the union across all menu sections equals the
 *       pre-relocation field set". A Status field there adds a <label> and the
 *       union stops matching. Verified by breaking it, this round.
 *   · the bar still carries exactly five buttons, and each dispatches what it
 *     dispatched → test/render/topBarGrouping, "every element the bar carried
 *     is still in it" and "every button dispatches exactly what it dispatched
 *     before". No sixth element, no separate unpublish button.
 */

const SRC = 'src/components/pageBuilder/editor/EditorTopBar.jsx';
const DIALOG = 'src/components/pageBuilder/editor/PublishDialog.jsx';

const PUBLISH_LABEL = 'เผยแพร่';
const MANAGE_LABEL = 'จัดการการเผยแพร่';

const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const noop = () => {};

const PAGE = (over = {}) => ({
  slug: 'live-slug', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  publishedVersion: 3, preview: { enabled: true, passwordHash: 'x' }, draft: null,
  ...over,
});

const topBar = (page) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(
  createElement(EditorProvider, { page, pageId: 'p1', updatedAt: 'T0', tier: TIER, currentUserName: 'C' },
    createElement(EditorTopBar, {
      onSave: noop, onOpenSettings: noop, onOpenPreview: noop, onPublish: noop, onDiscard: noop,
    }))
)}</body>`).window.document;

const primaryLabel = (page) => topBar(page)
  .querySelector('[data-testid="publish-button"]').textContent.trim();

const PAST = windowEndFromInput('2020-01-01');
const LONG_PAST = windowStartFromInput('2020-01-01');
const FUTURE = windowStartFromInput('2099-01-01');

/**
 * Every case, with the two questions that could decide the label and what each
 * would answer. The rows where they DISAGREE are the whole point: those are the
 * cases where a status test sends an author the wrong way.
 */
const CASES = Object.freeze([
  ['published, no window — live',
    PAGE(), true, MANAGE_LABEL],
  ['published but PAST its end date — the badge lies, the URL 404s',
    PAGE({ publishEndDate: PAST }), false, PUBLISH_LABEL],
  ['published with a FUTURE start — not live yet',
    PAGE({ publishStartDate: FUTURE }), false, PUBLISH_LABEL],
  ['scheduled with its start REACHED — live, and nothing will flip the status',
    PAGE({ status: 'scheduled', publishStartDate: LONG_PAST }), true, MANAGE_LABEL],
  ['scheduled for the future',
    PAGE({ status: 'scheduled', publishStartDate: FUTURE }), false, PUBLISH_LABEL],
  ['scheduled with NO start — never goes live',
    PAGE({ status: 'scheduled', publishStartDate: null }), false, PUBLISH_LABEL],
  ['draft', PAGE({ status: 'draft' }), false, PUBLISH_LABEL],
  ['closed', PAGE({ status: 'closed' }), false, PUBLISH_LABEL],
  ['archived', PAGE({ status: 'archived' }), false, PUBLISH_LABEL],
]);

// ── G: the label follows the route's own question ─────────────────────────

test('the primary button says เผยแพร่ only when the page is NOT public', () => {
  for (const [name, page, expectVisible, expectLabel] of CASES) {
    assert.equal(isPubliclyVisible(page), expectVisible,
      `the fixture "${name}" does not have the visibility it claims`);
    assert.equal(primaryLabel(page), expectLabel,
      `"${name}": the button reads "${primaryLabel(page)}" for a page that is `
      + `${expectVisible ? 'PUBLIC' : 'NOT public'}`);
  }
});

test('both labels really are reachable, and they differ', () => {
  // Without this, the sweep above would pass for a button whose label is a
  // constant that happens to match every expectation in one direction.
  const seen = new Set(CASES.map(([, page]) => primaryLabel(page)));
  assert.deepEqual([...seen].sort(), [MANAGE_LABEL, PUBLISH_LABEL].sort());
  assert.notEqual(PUBLISH_LABEL, MANAGE_LABEL);
});

test('CONTROL: keying off status === "published" disagrees, in BOTH directions', () => {
  /**
   * The control the round asks for. `status === 'published'` is the tempting
   * second rule, and it is wrong on two of the nine cases — one in each
   * direction, which is what makes it a genuinely different question rather
   * than a stricter one:
   *
   *   · published + past its end date → status says manage, the page is DOWN;
   *   · scheduled + start reached     → status says publish, the page is LIVE.
   *
   * …and a third, in the same direction as the first: published with a start
   * date that has not arrived. Enumerated rather than counted, so the failure
   * says WHICH case stopped discriminating.
   *
   * Round 5 shipped the status-vs-visibility distinction and visibility.js's
   * header exists so a second copy of it cannot drift. This is that drift,
   * measured.
   */
  const byStatus = (page) => (page.status === 'published' ? MANAGE_LABEL : PUBLISH_LABEL);
  const disagreements = CASES
    .filter(([, page, , expectLabel]) => byStatus(page) !== expectLabel)
    .map(([name]) => name);

  assert.deepEqual(disagreements, [
    'published but PAST its end date — the badge lies, the URL 404s',
    'published with a FUTURE start — not live yet',
    'scheduled with its start REACHED — live, and nothing will flip the status',
  ], 'the status test no longer disagrees with the visibility test on this fixture set, '
    + 'so the choice between them is untested');

  // …and the surface really does take the visibility branch on both of them.
  assert.equal(primaryLabel(PAGE({ publishEndDate: PAST })), PUBLISH_LABEL);
  assert.equal(byStatus(PAGE({ publishEndDate: PAST })), MANAGE_LABEL);
  assert.equal(primaryLabel(PAGE({ status: 'scheduled', publishStartDate: LONG_PAST })), MANAGE_LABEL);
  assert.equal(byStatus(PAGE({ status: 'scheduled', publishStartDate: LONG_PAST })), PUBLISH_LABEL);
});

test('the bar runs the shared predicate, not a paraphrase of it', () => {
  const { code, withImports } = readSource(SRC);
  assert.match(withImports, /import \{ isPubliclyVisible \} from '@\/lib\/pageBuilder\/visibility'/,
    'the top bar no longer imports the shared predicate');
  assert.match(code, /const livePublic = isPubliclyVisible\(page\)/,
    'the top bar no longer asks the route’s question');
  // The second rule this must never become.
  assert.equal(/status === 'published'/.test(code), false,
    'the top bar tests the STATUS to pick the label. That is a second copy of the '
    + 'status-vs-visibility distinction round 5 shipped, and it is wrong for a published page '
    + 'past its end date and for a scheduled page whose start has passed.');
});

test('CONTROL: the status-test matcher does see one', () => {
  assert.equal(/status === 'published'/.test("const live = page.status === 'published';"), true,
    'the status-test matcher does not work, so the check above means nothing');
});

// ── G: the dialog title ───────────────────────────────────────────────────

test('the dialog is titled for the subject, not for one of its five verbs', () => {
  /**
   * PublishDialog is a Radix portal and renders ZERO BYTES under
   * renderToStaticMarkup (round 27 measured that), so the title is asserted
   * from source — the same compromise test/fs/pageBuilderDeleteConfirm makes,
   * for the same reason.
   */
  const { code } = readSource(DIALOG);
  assert.match(code, /<Dialog\.Title[^>]*>สถานะการเผยแพร่<\/Dialog\.Title>/,
    'the publish dialog is not titled สถานะการเผยแพร่');
  assert.equal(code.includes('เผยแพร่หน้านี้'), false,
    'the old title is still there — it named ONE of the five things this dialog does, and an '
    + 'author who came to take a page down read the opposite of what they wanted');
});

test('CONTROL: the title matcher does see a title', () => {
  assert.equal(/<Dialog\.Title[^>]*>สถานะการเผยแพร่<\/Dialog\.Title>/
    .test('<Dialog.Title className="x">สถานะการเผยแพร่</Dialog.Title>'), true,
    'the title matcher does not work, so the check above means nothing');
});

// ── H: nothing about the control itself moved ─────────────────────────────

/** The five options, exactly as round 5 shipped them and round 42 leaves them. */
const OPTION_STATUSES = ['published', 'scheduled', 'draft', 'closed', 'archived'];

test('the five options, their labels and their descriptions are untouched', () => {
  const { code } = readSource(DIALOG);
  for (const s of OPTION_STATUSES) {
    assert.match(code, new RegExp(`status: '${s}'`),
      `the '${s}' option left OPTIONS — round 42 changes wording, not the control`);
  }
  // The one that makes unpublish possible, with the words that say so.
  assert.match(code, /status: 'draft',\s*label: 'ฉบับร่าง',\s*desc: 'ยกเลิกเผยแพร่ กลับไปแก้ไข'/,
    'the draft option — the one that takes a page down — changed');
  // …and no sixth option was invented to carry the new wording.
  assert.equal((code.match(/\{ status: '/g) ?? []).length, OPTION_STATUSES.length,
    'OPTIONS no longer holds exactly five entries');
});

test('the dialog still writes through the one publish path', () => {
  const { code, withImports } = readSource(DIALOG);
  // Round 4/7's flush-before-publish and round 5's window validation both hang
  // off this one call; a wording change must not have grown a second door.
  assert.match(code, /onPublish\(next\)/, 'the dialog no longer applies through onPublish');
  assert.match(code, /publishBlockers\(page, status\)/, 'the readiness check moved');
  for (const forbidden of ['updatePageStatus', 'publishPageStatus', 'saveDraftContent']) {
    assert.equal(withImports.includes(forbidden), false,
      `PublishDialog reaches for '${forbidden}' — publishing here is a FULL SAVE through `
      + 'useEditorSave.publish, and calling an action directly would publish stale content');
  }
});

test('no unpublish CONTROL was added anywhere — only words changed', () => {
  /**
   * The temptation this round exists to refuse: a separate "ยกเลิกเผยแพร่"
   * button would be a sixth top-bar element, one round 41 just spent a commit
   * removing the need for, and a second way into a status change.
   */
  const { code } = readSource(SRC);
  for (const invented of ['ยกเลิกเผยแพร่', 'unpublish', 'onUnpublish', 'takeDown']) {
    assert.equal(code.includes(invented), false,
      `the top bar grew "${invented}". Unpublish is the draft option inside PublishDialog; a `
      + 'second control would bypass its window validation and round 4/7’s flush-before-publish.');
  }
  // …and the phrase still lives where it always did: on the option itself.
  assert.ok(readSource(DIALOG).code.includes('ยกเลิกเผยแพร่'),
    'the draft option lost the words that say it takes a page down');
});

test('CONTROL: the invented-control matcher does see one', () => {
  assert.equal('<button onClick={onUnpublish}>ยกเลิกเผยแพร่</button>'.includes('onUnpublish'), true,
    'the invented-control matcher does not work, so the check above means nothing');
});

// ── I: it still sits where round 41 put it ────────────────────────────────

test('the renamed button is still the primary, outside the secondary cluster', () => {
  // Round 41's grouping, re-asserted against BOTH labels rather than assumed to
  // survive a text change. The cluster's own membership is round 41's test.
  for (const [name, page] of CASES) {
    const doc = topBar(page);
    const cluster = doc.querySelector('[data-testid="editor-secondary-actions"]');
    const publish = doc.querySelector('[data-testid="publish-button"]');
    assert.ok(publish, `${name}: the primary button is gone`);
    assert.equal(cluster.contains(publish), false,
      `${name}: the primary fell back into the row of secondary buttons`);
    assert.equal(doc.querySelectorAll('button').length,
      page.draft ? 5 : 4,
      `${name}: the bar grew or lost a button`);
  }
});
