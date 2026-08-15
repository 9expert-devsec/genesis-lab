import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RenamePreviewReport } from '@/app/admin/courses/rename/_components/RenamePreviewReport';
import { buildRenamePreview, RENAME_STORES } from '@/lib/courses/renameCoursePreview';

/**
 * The preview, as an admin actually sees it.
 *
 * Driven through the REAL preview builder so the component is rendering the
 * shape the action returns rather than one invented for the test. The
 * verdicts themselves are asserted in test/pure/renamePreviewView; what this
 * adds is that they REACH THE MARKUP — a correct classification rendered into
 * a branch nobody displays is the failure this tier exists for.
 */

const preview = (over = {}) => {
  const matches = Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));
  return buildRenamePreview({
    oldCode: 'MSE-L1',
    newCode: 'EXCEL-INT',
    msdbCodes: ['MSE-L1', 'MSE-L2'],
    extensionCodes: ['MSE-L1'],
    urlAlias: '',
    ...over,
    matches: {
      ...matches,
      courseExtension: [{ courseId: 'MSE-L1' }],
      article: [{ slug: 'a' }, { slug: 'b' }],
      registerPublic: [{ courseCode: 'MSE-L1' }],
      ...(over.matches ?? {}),
    },
  });
};

const render = (p) => renderToStaticMarkup(createElement(RenamePreviewReport, { preview: p }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** The `<tbody>` rows of the per-store table. */
const storeRows = (html) => {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
};

// ── Nothing yet ─────────────────────────────────────────────────────────────

test('with no preview the report renders nothing at all', () => {
  assert.equal(render(null), '');
});

// ── The per-store breakdown ─────────────────────────────────────────────────

test('THE PER-STORE TABLE RENDERS ONE ROW PER CHANGING STORE', () => {
  const rows = storeRows(render(preview()));
  const changing = RENAME_STORES.filter((s) => !s.historical);
  assert.equal(rows.length, changing.length, `expected ${changing.length} store rows, got ${rows.length}`);
});

test('a store with ZERO rows is shown as zero, not omitted', () => {
  const html = render(preview());
  const rows = storeRows(html);
  const early = rows.find((r) => r.includes('EarlyBirdConfig'));
  assert.ok(early, 'a store with no rows was dropped from the table');
  assert.match(early, />\s*0\s*</, 'the empty store does not render a 0');
});

test('each row names what the store HOLDS, in Thai, and the model beside it', () => {
  const html = render(preview());
  assert.match(text(html), /SEO, URL alias, แกลเลอรี, สถานะเผยแพร่/, 'no plain-language description');
  assert.match(html, /CourseExtension\.courseId/, 'the model/field is not shown');
});

test('the TOTAL is rendered prominently', () => {
  // 1 extension + 2 articles; every other read store is empty.
  assert.match(text(render(preview())), /3 แถว/);
});

// ── Collision ───────────────────────────────────────────────────────────────

test('A COLLISION RENDERS AS A REFUSAL, naming the store that holds the code', () => {
  const html = render(preview({ newCode: 'MSE-L2' }));
  const t = text(html);
  assert.match(t, /เปลี่ยนรหัสนี้ไม่ได้/, 'a blocked rename does not say it is blocked');
  assert.match(t, /ถูกใช้แล้ว/);
  assert.match(t, /MSDB/, 'the colliding store is not named');
  assert.match(html, /MSE-L2/);
  // and it does NOT render as a ready-to-run total
  assert.ok(!/แถว<\/p>/.test(html.replace(/\s+/g, '')), 'a blocked preview showed a run total');
});

test('a blocked preview does not tell the admin to go change MSDB', () => {
  assert.ok(!/นาที ไม่ใช่ชั่วโมง/.test(text(render(preview({ newCode: 'MSE-L2' })))));
});

// ── Case-only ───────────────────────────────────────────────────────────────

test('A CASE-ONLY RENAME RENDERS AS A WARNING', () => {
  const html = render(preview({
    newCode: 'mse-l1',
    matches: { programOrder: [{ programId: 'MSE' }] },
  }));
  const t = text(html);
  assert.match(t, /อันตรายกว่าที่เห็น/, 'a case-only rename is not flagged as dangerous');
  assert.match(t, /ลำดับหลักสูตรในโปรแกรม/, 'the silently no-op store is not named');
  // The row itself is marked, so the table and the banner agree.
  const rows = storeRows(html);
  const prog = rows.find((r) => r.includes('ProgramOrder'));
  assert.match(prog, /ไม่เปลี่ยน/, 'the no-op row is not marked in the table');
});

test('an ordinary rename shows no case-only warning', () => {
  assert.ok(!/อันตรายกว่าที่เห็น/.test(text(render(preview()))));
});

// ── URL ─────────────────────────────────────────────────────────────────────

test('a DERIVED url shows the change and the alias-first step', () => {
  const t = text(render(preview({ urlAlias: '' })));
  assert.match(t, /\/mse-l1-training-course/);
  assert.match(t, /\/excel-int-training-course/);
  assert.match(t, /สร้าง alias/, 'the alias-first step is not stated');
  assert.match(t, /404/, 'the consequence of skipping it is not stated');
});

test('an ALIASED url says the URL does not change', () => {
  const t = text(render(preview({ urlAlias: '/excel-intermediate' })));
  assert.match(t, /ตั้ง URL alias ไว้แล้ว/);
  assert.ok(!/สร้าง alias/.test(t), 'an aliased course was told an alias will be created');
});

// ── Historical ──────────────────────────────────────────────────────────────

test('the historical stores render as WILL NOT CHANGE, with the reason', () => {
  const t = text(render(preview()));
  assert.match(t, /จะไม่ถูกเปลี่ยน/);
  assert.match(t, /ใบลงทะเบียนที่เคยเกิดขึ้น/);
  assert.match(t, /บันทึกว่าลูกค้าซื้ออะไรไว้|เคยเกิดขึ้น/, 'no reason is given');
  // and they are not in the changing table
  assert.ok(!storeRows(render(preview())).some((r) => r.includes('RegisterPublic')));
});

// ── The interval ────────────────────────────────────────────────────────────

test('THE INTERVAL IS STATED AS SOMETHING THE ADMIN MUST DO', () => {
  const t = text(render(preview()));
  assert.match(t, /ต้องแก้ MSDB ทันที/, 'the MSDB step is not presented as an instruction');
  assert.match(t, /นาที ไม่ใช่ชั่วโมง/, 'the urgency is not stated');
  assert.match(t, /ยังไม่จัดลำดับ/, 'the ordering consequence is not named');
});

// ── No rename control exists ────────────────────────────────────────────────

test('THERE IS NO RENAME CONTROL — not disabled, ABSENT', () => {
  /**
   * Asserted on the ELEMENTS, not on the words. The report necessarily says
   * "จะเปลี่ยนรหัสจาก X → Y" — that is the sentence describing what a rename
   * WOULD do, which is the whole purpose of a preview. Matching Thai prose for
   * the presence of a control confuses the description with the thing, and the
   * first draft of this test did exactly that.
   *
   * A control is an element. There is no button, no form and no input in this
   * component in any of its three states. That the WRITE PATH is unreachable
   * from the mounted screen is a different claim and is asserted structurally
   * in test/fs/renameUiNoWrite.
   */
  for (const p of [preview(), preview({ newCode: 'mse-l1' }), preview({ newCode: 'MSE-L2' })]) {
    const html = render(p);
    assert.ok(!/<button/i.test(html), 'the report rendered a button');
    assert.ok(!/<form/i.test(html), 'the report rendered a form');
    assert.ok(!/<input/i.test(html), 'the report rendered an input');
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the row extractor finds real rows and nothing in bare markup', () => {
  // Several assertions above are negatives over this extractor.
  assert.ok(storeRows(render(preview())).length >= 10);
  assert.deepEqual(storeRows('<table><tbody></tbody></table>'), []);
  assert.deepEqual(storeRows(''), []);
});

test('CONTROL: the three verdicts produce genuinely different documents', () => {
  const ready = render(preview());
  const caseOnly = render(preview({ newCode: 'mse-l1' }));
  const blocked = render(preview({ newCode: 'MSE-L2' }));
  assert.notEqual(ready, caseOnly);
  assert.notEqual(ready, blocked);
  assert.notEqual(caseOnly, blocked);
  assert.ok(ready.length > 500 && blocked.length > 200, 'a render collapsed to near-nothing');
});
