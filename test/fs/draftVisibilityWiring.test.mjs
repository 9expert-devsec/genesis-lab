import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The two surfaces whose content lives inside a Radix `Dialog.Portal`.
 *
 * A portal renders NOTHING under renderToStaticMarkup, and mounting a root is
 * forbidden in this runner (isolation:'none', one shared process). So these
 * claims can only be made against shape — the same compromise, for the same
 * reason, as test/fs/pageBuilderDeleteConfirm, and stated here rather than
 * left for a reader to discover.
 *
 * WHAT MAKES EACH PROBE HONEST: every assertion is paired with a
 * DISCRIMINATION control asserting the same probe comes out the OTHER way on
 * the pre-change shape. A probe that cannot tell the old shape from the new one
 * is green about nothing.
 *
 * The behaviour underneath is tested for real elsewhere: the condition in
 * test/pure/editorStatus (hasPendingDraft / canDiscardDraft), and the action it
 * reaches in test/fs/pageBuilderDraftActions (discardDraftContent).
 */

const PUBLISH = 'src/components/pageBuilder/editor/PublishDialog.jsx';
const TOPBAR = 'src/components/pageBuilder/editor/EditorTopBar.jsx';
const SHELL = 'src/components/pageBuilder/editor/EditorShell.jsx';

const NOTE = 'การเผยแพร่จะใช้เนื้อหาฉบับร่างล่าสุด ไม่ใช่เนื้อหาที่เผยแพร่อยู่ในขณะนี้';
const CONFIRM = 'ทิ้งฉบับร่างที่ยังไม่เผยแพร่ทั้งหมด และกลับไปใช้เนื้อหาที่เผยแพร่อยู่ตอนนี้ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้';

// ── PublishDialog's informational line ──────────────────────────────────────

test('the publish dialog carries the note, GATED on a pending draft', () => {
  const { code, withImports } = readSource(PUBLISH);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bhasPendingDraft\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/,
    'the dialog does not import the shared condition'
  );
  // The literal and the gate in ONE expression, so a note that rendered
  // unconditionally cannot satisfy this.
  assert.match(
    code,
    new RegExp(`hasPendingDraft\\(editor\\) && \\([\\s\\S]{0,200}?${NOTE}`),
    'the note is missing, or is not gated on a pending draft'
  );
});

test('CONTROL: the probe rejects an UNGATED note', () => {
  // The pre-change shape this round could have shipped by mistake.
  const ungated = `<Warn tone="info">${NOTE}</Warn>`;
  assert.equal(
    new RegExp(`hasPendingDraft\\(editor\\) && \\([\\s\\S]{0,200}?${NOTE}`).test(ungated), false,
    'the probe accepts a note that always renders'
  );
});

test('the note reuses the file own Warn/info tone, not a new component', () => {
  const { code } = readSource(PUBLISH);
  assert.match(code, new RegExp(`<Warn tone="info">${NOTE}</Warn>`));
});

test('the round did NOT touch the readiness logic', () => {
  // Explicitly out of scope: OPTIONS, the radios, willBeVisible/invisibleReason
  // and publishBlockers all stay exactly as they were.
  const { code, withImports } = readSource(PUBLISH);
  assert.match(withImports, /import \{ publishBlockers \} from '@\/lib\/pageBuilder\/publishReadiness'/);
  assert.match(withImports, /import \{ isPubliclyVisible, invisibleReason \} from '@\/lib\/pageBuilder\/visibility'/);
  assert.equal(countCallSites(code, 'publishBlockers'), 1, 'publishBlockers is called a different number of times');
  assert.equal(countCallSites(code, 'isPubliclyVisible'), 1);
  assert.equal(countCallSites(code, 'invisibleReason'), 1);
  assert.match(code, /const blocked = messages\.length > 0;/, 'the blocked rule changed');
});

// ── the discard confirm ─────────────────────────────────────────────────────

test('the confirm dialog carries the exact destructive copy and label', () => {
  const { code } = readSource(TOPBAR);
  assert.ok(code.includes(CONFIRM), 'the confirm copy is missing or reworded');
  assert.match(code, /bg-red-600[\s\S]{0,120}?ทิ้งฉบับร่าง/, 'the confirm button is not in the destructive tone');
});

test('the discard button opens the confirm — it never calls onDiscard directly', () => {
  // The defect this shape exists to prevent, and the same one StructurePanel's
  // delete guard pins: a destructive action wired to the click instead of to a
  // confirmed decision.
  const { code } = readSource(TOPBAR);
  assert.match(
    code, /data-testid="discard-draft-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmDiscard\(true\)\}/,
    'the discard button does not open a confirm'
  );
  assert.match(
    code, /onConfirm=\{\(\) => \{ setConfirmDiscard\(false\); onDiscard\?\.\(\); \}\}/,
    'onDiscard is not reached from the confirm'
  );
  // countCallSites is blind to an OPTIONAL call: its regex wants `name(` and
  // this is `onDiscard?.(`, so it reports 0 on a correct file. Counting the
  // real form rather than asserting against a probe that cannot see it.
  const invocations = code.match(/onDiscard\?\.\(/g) ?? [];
  assert.equal(invocations.length, 1, 'onDiscard is invoked from more than one place');
});

test('CONTROL: the probe rejects a button wired straight to onDiscard', () => {
  const direct = 'data-testid="discard-draft-button"\n onClick={onDiscard}';
  assert.equal(
    /data-testid="discard-draft-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmDiscard\(true\)\}/.test(direct),
    false,
    'the probe accepts a discard wired to the click'
  );
});

test('the discard button is gated by the shared predicate, not a local rule', () => {
  const { code, withImports } = readSource(TOPBAR);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bcanDiscardDraft\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/,
    'the top bar does not import canDiscardDraft'
  );
  assert.match(code, /disabled=\{!canDiscardDraft\(editor\)\}/, 'the disabled rule is written out locally');
});

test('the top bar reads the status line from the shared module', () => {
  const { code, withImports } = readSource(TOPBAR);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bstatusLine\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/
  );
  assert.equal(
    /function savedAgo\(/.test(code), false,
    'the retired savedAgo() is still in the file beside its replacement'
  );
  assert.equal(
    code.includes('บันทึกอัตโนมัติเมื่อ'), false,
    'the retired copy is still in the source'
  );
});

test('CONTROL: that import guard must read withImports', () => {
  // scrubSource strips imports from `code`, so the same regex against `code`
  // matches nothing on a correct file — the vacuous shape this repo has hit.
  const { code, withImports } = readSource(TOPBAR);
  assert.equal(/from '@\/lib\/pageBuilder\/editorStatus'/.test(code), false);
  assert.equal(/from '@\/lib\/pageBuilder\/editorStatus'/.test(withImports), true);
});

// ── the shell hands discard down ────────────────────────────────────────────

test('EditorShell wires round 4 discard() to the top bar', () => {
  const { code } = readSource(SHELL);
  assert.match(code, /const \{ saveNow, publish, discard \} = useEditorSave\(\);/);
  assert.match(code, /onDiscard=\{discard\}/, 'the top bar never receives discard');
});

// ── the preview route ───────────────────────────────────────────────────────

test('the preview route renders the composed view, and gates BEFORE it', () => {
  const { code, withImports } = readSource('src/app/(public)/preview/[slug]/page.jsx');
  assert.match(
    withImports,
    /import \{[\s\S]*?\bcomposeWorkingView\b[\s\S]*?\} from '@\/lib\/pageBuilder\/draftState'/
  );
  assert.match(code, /<PageBuilderView page=\{composeWorkingView\(page\)\} \/>/, 'the route still renders the raw doc');

  // ORDER, asserted rather than assumed: every terminal gate returns before the
  // content is composed. An unauthenticated response must contain only the gate.
  const gateAt = code.lastIndexOf('PreviewGate');
  const composeAt = code.indexOf('composeWorkingView(page)');
  assert.ok(gateAt > -1 && composeAt > -1);
  assert.ok(gateAt < composeAt, 'the content is composed before the cookie gate returns');
});

/**
 * ── RE-POINTED IN ROUND 36, AND FLAGGED RATHER THAN QUIETLY EDITED ─────────
 * Round 5 wrote this against the route file, where both banner strings were
 * inline ternary branches. Round 36 added a THIRD state (the published view),
 * and three states written inline is exactly the shape that lets two of them be
 * reachable at once — so the set moved to lib/pageBuilder/previewMode.js as one
 * frozen object selected by a total function.
 *
 * The GUARANTEE is unchanged and is asserted in the same two halves: the exact
 * strings still exist, and the banner is still driven by the STORED draft
 * rather than by anything local to the tab. What moved is which file owns the
 * strings — and that they now partition, which the route file could never have
 * shown, is proven in test/pure/previewMode.
 */
test('the banner states WHICH case the reader is looking at', () => {
  const { code } = readSource('src/app/(public)/preview/[slug]/page.jsx');
  const banners = readSource('src/lib/pageBuilder/previewMode.js').code;

  assert.ok(banners.includes('ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — ห้ามแชร์ลิงก์นี้ต่อ'), 'the draft banner text changed');
  assert.ok(
    banners.includes('หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้'),
    'the no-draft banner text is missing'
  );
  // Round 36's third state, pinned beside the two it joined.
  assert.ok(
    banners.includes('กำลังดูเวอร์ชันที่เผยแพร่อยู่ — ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้'),
    'the published banner text is missing'
  );

  // Still driven by the stored draft, and the route still reads it — the half
  // of the original assertion that was never about where the strings live.
  assert.match(code, /const pending = hasUnpublishedDraft\(page\);/, 'the banner is not driven by the stored draft');
  assert.match(code, /previewBanner\(\{ mode, pending \}\)/, 'the route no longer selects the banner by mode + pending');
});

// ── CustomPage: EVERY read that returns a document, enumerated ──────────────

/**
 * The Advanced HTML half of the same rule, and the reason it is an ENUMERATION
 * rather than a list of the reads someone remembered.
 *
 * A projection that happens to be safe today is safe by LUCK. `sitemap.js` is
 * the case in point: it never carried a draft, not because anything strips one,
 * but because it asks for two fields — and one careless `.select()` widening
 * would put unpublished bodies into a public sitemap without a single guard
 * going red. So this scans for every CustomPage read in the codebase and
 * requires each one to be REGISTERED below with a verdict and a reason. A read
 * that nobody classified fails the sweep; it is not silently assumed safe.
 *
 * Two reads are deliberately UNSTRIPPED and both are correct:
 *   · getCustomPageBySlugAny backs ?preview=<token>, whose whole purpose is to
 *     show what is not public yet;
 *   · getCustomPageById is what the editor opens, and stripping it would show
 *     the author the published content their next save would then write back.
 *
 * ── THE SWEEP SPANS TWO MODULES, AND THAT IS THE POINT ────────────────────
 * It scanned lib/actions/customPages.js alone until the /promotions grid gained
 * an Advanced HTML half, whose loader lives in lib/promotions/getPromotions.js.
 * A read in a different file is not a read outside the rule — living elsewhere
 * is exactly how the sitemap read stayed unexamined — so the enumeration was
 * WIDENED rather than a second sweep written beside it. One register, one set of
 * verdicts, one place to look.
 *
 * Each entry names its `file`, and the enumeration below runs per file, so a new
 * read in EITHER module is caught by the same assertion.
 */
const CUSTOM_PAGE_MODULES = [
  'src/lib/actions/customPages.js',
  'src/lib/promotions/getPromotions.js',
];

const CUSTOM_PAGE_READS = {
  // exported reads in lib/actions/customPages.js
  getCustomPages: {
    file: 'src/lib/actions/customPages.js',
    verdict: 'stripped',
    why: 'admin list; no projection, so it would ship a second full copy of every body',
  },
  getCustomPageById: {
    file: 'src/lib/actions/customPages.js',
    verdict: 'unstripped',
    why: 'the EDITOR opens this and must see the pending draft; admin-gated by the route',
  },
  getCustomPageBySlug: {
    file: 'src/lib/actions/customPages.js',
    verdict: 'stripped',
    why: 'THE public read — a draft here reaches a visitor. Also the /promotions/<slug> '
      + 'Advanced HTML branch, which takes no second strip because this one is inside',
  },
  getCustomPageBySlugAny: {
    file: 'src/lib/actions/customPages.js',
    verdict: 'unstripped',
    why: 'backs ?preview=<token>; gated on the token by the caller, and showing the draft is its job',
  },
  findCustomPageByHistoricalSlug: {
    file: 'src/lib/actions/customPages.js',
    verdict: 'projected',
    why: "selects 'slug' only — the draft cannot be in the result",
  },
  // exported reads in lib/promotions/getPromotions.js
  getActiveCustomPagePromotions: {
    file: 'src/lib/promotions/getPromotions.js',
    verdict: 'projected',
    why: 'the /promotions grid loader; selects the seven fields the card pipeline reads, '
      + 'so the unpublished draft — body AND promotionCover — cannot be in the result',
  },
};

/** Exported functions of a scrubbed module, bounded by the next `export`. */
function exportedFns(src) {
  const re = /export\s+async\s+function\s+([A-Za-z0-9_]+)/g;
  const marks = [...src.matchAll(re)].map((m) => ({ name: m[1], at: m.index }));
  return marks.map((m, i) => ({
    name: m.name,
    body: src.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : src.length),
  }));
}

const READS_A_DOC = /CustomPage\.(find|findOne|findById)\s*\(/;

/** Every read in every scanned module, as `{ name, file, body }`. */
function allCustomPageReads() {
  return CUSTOM_PAGE_MODULES.flatMap((file) => {
    const { code } = readSource(file);
    return exportedFns(code)
      .filter((f) => READS_A_DOC.test(f.body))
      // Mutating actions read the document to write it; they are not read paths
      // and never return one to a caller.
      .filter((f) => !/findByIdAndUpdate|findByIdAndDelete|CustomPage\.create/.test(f.body))
      .map((f) => ({ ...f, file }));
  });
}

test('every CustomPage read is registered with a verdict, and none is unclassified', () => {
  const found = allCustomPageReads().map((f) => f.name).sort();

  assert.deepEqual(found, Object.keys(CUSTOM_PAGE_READS).sort(),
    'a CustomPage read appeared or disappeared without being classified. Add it to '
    + 'CUSTOM_PAGE_READS with a file, a verdict and a REASON — an unregistered read is '
    + 'the projection-safe-by-luck failure this sweep exists to catch');
});

test('every registered read names the module it was actually found in', () => {
  // Without this, a register entry could name the wrong file and the per-file
  // scan below would look in a module that never contained the function.
  const foundIn = Object.fromEntries(allCustomPageReads().map((f) => [f.name, f.file]));
  for (const [name, entry] of Object.entries(CUSTOM_PAGE_READS)) {
    assert.ok(CUSTOM_PAGE_MODULES.includes(entry.file),
      `${name} is registered against a module this sweep does not scan: ${entry.file}`);
    assert.equal(entry.file, foundIn[name],
      `${name} is registered in ${entry.file} but was found in ${foundIn[name]}`);
  }
});

test('every read marked `stripped` actually calls stripDraft', () => {
  const bodies = Object.fromEntries(allCustomPageReads().map((f) => [f.name, f.body]));
  for (const [name, { verdict }] of Object.entries(CUSTOM_PAGE_READS)) {
    if (verdict !== 'stripped') continue;
    assert.match(bodies[name] ?? '', /stripDraft\(/,
      `${name} is registered as stripped but does not call stripDraft`);
  }
});

test('every read marked `unstripped` really does NOT strip — the register is not decorative', () => {
  // The other direction. Without this, marking everything `unstripped` would
  // make the assertion above vacuous.
  const bodies = Object.fromEntries(allCustomPageReads().map((f) => [f.name, f.body]));
  for (const [name, { verdict }] of Object.entries(CUSTOM_PAGE_READS)) {
    if (verdict !== 'unstripped') continue;
    assert.doesNotMatch(bodies[name] ?? '', /stripDraft\(/,
      `${name} is registered as unstripped but strips — the register and the code disagree`);
  }
});

test('every read marked `projected` really has a .select(), and it excludes the draft', () => {
  /**
   * `projected` is the only verdict that claims safety WITHOUT a strip, so it is
   * the one that can rot silently: widen the select and nothing else in this file
   * would notice. Both halves are asserted — that a projection exists at all, and
   * that it does not name `draft`.
   */
  const bodies = Object.fromEntries(allCustomPageReads().map((f) => [f.name, f.body]));
  for (const [name, { verdict }] of Object.entries(CUSTOM_PAGE_READS)) {
    if (verdict !== 'projected') continue;
    const body = bodies[name] ?? '';
    const select = body.match(/\.select\((['"])([^'"]*)\1\)/);
    assert.ok(select,
      `${name} is registered as safe BY PROJECTION but has no .select() — it ships whole `
      + 'documents, draft included');
    assert.equal(/\bdraft\b/.test(select[2]), false,
      `${name}'s projection names the draft: ${select[2]}`);
  }
});

test('every read has a stated REASON, not just a verdict', () => {
  for (const [name, entry] of Object.entries(CUSTOM_PAGE_READS)) {
    assert.ok(typeof entry.why === 'string' && entry.why.length > 20,
      `${name} is classified with no reason worth reading`);
    assert.ok(['stripped', 'unstripped', 'projected'].includes(entry.verdict),
      `${name} has an unknown verdict`);
  }
});

test('the sitemap read is safe BY PROJECTION, and says so where it is written', () => {
  /**
   * The one CustomPage read outside the actions module. It takes no stripDraft
   * and does not need one — but only while the projection stays two fields, so
   * the comment saying that is load-bearing and is asserted here.
   */
  const { code, raw } = readSource('src/app/sitemap.js');
  assert.match(code, /\.select\('slug updatedAt'\)/,
    'the sitemap projection changed. If it now takes more than a URL and a date, '
    + 'it must take stripDraft() with it — an unpublished body in a public sitemap');
  assert.equal(/stripDraft/.test(code), false,
    'the sitemap now strips, so this case is asserting the wrong mechanism');
  assert.match(raw, /THE PROJECTION IS WHAT KEEPS THE DRAFT OUT/,
    'the load-bearing comment is gone — the next person widening the select has no warning');
});

test('CONTROL: the sweep DOES catch an unregistered read, and a stripped one that stopped stripping', () => {
  // Both halves, against planted source rather than the real file.
  const planted = `
    export async function getCustomPageBySlug(slug) { const d = await CustomPage.findOne({}).lean(); return d; }
    export async function getSomethingNew(slug) { const d = await CustomPage.findOne({}).lean(); return d; }
  `;
  const names = exportedFns(planted).filter((f) => READS_A_DOC.test(f.body)).map((f) => f.name).sort();
  assert.deepEqual(names, ['getCustomPageBySlug', 'getSomethingNew'],
    'the scanner cannot see a newly added read, so the enumeration proves nothing');

  const bodies = Object.fromEntries(exportedFns(planted).map((f) => [f.name, f.body]));
  assert.doesNotMatch(bodies.getCustomPageBySlug, /stripDraft\(/,
    'the planted leak still looks stripped to the reader — the strip check is not live');
});
