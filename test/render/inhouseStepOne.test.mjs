import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InhouseStepForm } from '@/components/registration/InhouseForm';

/**
 * Step 1 of the in-house quotation form, after the field cull.
 *
 * ── PROBE DISCIPLINE ────────────────────────────────────────────────────────
 * Every label here is matched as `>label<` — an element's whole text — because
 * Thai negates by PREFIX and every affirmative label is a substring of its own
 * negation. 'ยังไม่แน่ใจ' is the removed card AND a fragment of two surviving
 * description strings, so a bare `includes()` would report the deleted card as
 * still present forever.
 */

const COURSES = [
  { id: 'COPILOT-STU', name: 'Microsoft Copilot for Studio', program: 'AI' },
  { id: 'DA-PBI',      name: 'Power BI Essentials',          program: 'Data' },
];

const noop = () => {};

const html = (props = {}) =>
  renderToStaticMarkup(
    createElement(InhouseStepForm, {
      courses: COURSES,
      preselectedCourse: null,
      initialValues: null,
      onSubmit: noop,
      ...props,
    })
  );

/** Text as an ELEMENT's whole content — see the header note. */
const hasLabel = (out, label) => out.includes(`>${label}<`);

const OUT = html();

// ── The removed sections ────────────────────────────────────────────────────

const REMOVED_LABELS = [
  ['ระดับพื้นฐานของผู้เข้าอบรม', 'skillLevel'],
  ['วัตถุประสงค์ในการอบรม',      'objective'],
  ['อุปกรณ์ที่มีให้',             'onsiteEquipment'],
  ['ช่วงเวลาที่สะดวก',           'the scheduleMode selector'],
];

for (const [label, field] of REMOVED_LABELS) {
  test(`the ${field} section is GONE`, () => {
    assert.equal(hasLabel(OUT, label), false, `"${label}" still renders`);
  });
}

test('the ผู้ประสานงาน section no longer asks for a company', () => {
  // It asked for one twice — here and in the quotation block — and people
  // filled the two in differently. The quotation field is the survivor; the API
  // route mirrors it onto the legacy `companyName` path.
  assert.equal(hasLabel(OUT, 'บริษัท / องค์กร'), false);
  assert.ok(OUT.includes('ชื่อบริษัทสำหรับออกใบเสนอราคา'), 'the quotation one stays');
});

test('the three date fields of the removed dateRange branch are gone', () => {
  for (const label of ['วันที่เริ่มต้น', 'วันที่สิ้นสุด']) {
    assert.equal(hasLabel(OUT, label), false, `"${label}" still renders`);
  }
  assert.equal(OUT.includes('name="preferredDateFrom"'), false);
  assert.equal(OUT.includes('name="preferredDateTo"'), false);
});

// ── The two selectors that KEPT their section ───────────────────────────────

test('รูปแบบเนื้อหา keeps its section and both surviving cards', () => {
  assert.ok(hasLabel(OUT, 'รูปแบบเนื้อหาที่ต้องการ'), 'the section heading stays');
  assert.ok(hasLabel(OUT, 'ใช้ Outline มาตรฐาน'));
  assert.ok(hasLabel(OUT, 'ปรับเนื้อหาบางส่วน'));
});

test('the ให้ช่วยแนะนำ content card is gone', () => {
  assert.equal(hasLabel(OUT, 'ให้ช่วยแนะนำ'), false);
});

test('รูปแบบการอบรม keeps its section and both surviving cards', () => {
  assert.ok(OUT.includes('รูปแบบการอบรม'), 'the section heading stays');
  assert.ok(hasLabel(OUT, 'Onsite'));
  assert.ok(hasLabel(OUT, 'Online'));
});

test('the ยังไม่แน่ใจ format card is gone', () => {
  assert.equal(hasLabel(OUT, 'ยังไม่แน่ใจ'), false);
});

test('CONTROL: `ยังไม่แน่ใจ` DOES still occur as a loose substring', () => {
  /**
   * The reason every probe in this file is bounded. The surviving Onsite/Online
   * card descriptions do not carry it, but the removed cards' text pattern
   * ("ยังไม่แน่ใจว่า…") is the kind of string that reappears in copy — so this
   * asserts the bounded form and the bare form are genuinely different tests by
   * showing the bare form matching something the bounded form does not.
   */
  const withLooseCopy = `<span>ยังไม่แน่ใจว่าควรเลือกแบบใด</span>`;
  assert.ok(withLooseCopy.includes('ยังไม่แน่ใจ'), 'a bare probe matches');
  assert.equal(withLooseCopy.includes('>ยังไม่แน่ใจ<'), false, 'the bounded probe does not');
});

// ── Nothing is preselected ──────────────────────────────────────────────────

test('NO training format is preselected — both detail blocks stay hidden', () => {
  // The old default was 'flexible', which no longer exists. Defaulting to
  // 'onsite' instead would put a venue form in front of every customer.
  assert.equal(OUT.includes('รายละเอียดสถานที่จัดอบรม'), false, 'no venue block');
  assert.equal(hasLabel(OUT, 'ผู้เข้าอบรมอยู่พื้นที่ใดเป็นหลัก'), false, 'no online block');
});

test('choosing onsite reveals the venue autocomplete, NOT three free-text fields', () => {
  const onsite = html({ initialValues: { trainingFormat: 'onsite' } });
  assert.ok(onsite.includes('รายละเอียดสถานที่จัดอบรม'));
  // ThaiAddressFields' own labels — the same control as the quotation address.
  assert.ok(hasLabel(onsite, 'รหัสไปรษณีย์'));
  assert.ok(hasLabel(onsite, 'แขวง / ตำบล'));
  // …and none of the fields it replaced.
  assert.equal(hasLabel(onsite, 'ที่อยู่สถานที่'), false);
  assert.equal(onsite.includes('name="onsiteAddress"'), false, 'the legacy String path is never bound');
  assert.equal(onsite.includes('name="onsiteProvince"'), false);
  assert.equal(onsite.includes('name="onsiteDistrict"'), false);
});

test('choosing online reveals the online block and no venue', () => {
  const online = html({ initialValues: { trainingFormat: 'online' } });
  assert.ok(hasLabel(online, 'ผู้เข้าอบรมอยู่พื้นที่ใดเป็นหลัก'));
  assert.equal(online.includes('รายละเอียดสถานที่จัดอบรม'), false);
});

// ── The schedule ────────────────────────────────────────────────────────────

test('เดือนที่สนใจ renders UNCONDITIONALLY, with no mode to unlock it', () => {
  // It used to be gated behind scheduleMode === 'month'. With no format chosen
  // and no draft at all, it is on screen.
  assert.ok(hasLabel(OUT, 'เดือนที่สนใจ'));
  assert.ok(OUT.includes('name="preferredMonth"'));
  assert.ok(hasLabel(OUT, 'หมายเหตุเรื่องวันอบรม'));
});

// ── participantsCount: the floor is visible, not just enforced ──────────────

/** The minus button, as rendered. Identified by its aria-label, not its order. */
const minusButton = (out) => out.match(/<button[^>]*aria-label="ลดจำนวนผู้เข้าอบรม"[^>]*>/)?.[0] ?? '';
const plusButton  = (out) => out.match(/<button[^>]*aria-label="เพิ่มจำนวนผู้เข้าอบรม"[^>]*>/)?.[0] ?? '';

test('at the default of 15 the minus button is DISABLED', () => {
  // `disabled=""`, never the bare word — `disabled` also matches
  // `disabled:opacity-30`, which is on this very button, so a bare probe would
  // report "disabled" for every state including the enabled one.
  const minus = minusButton(OUT);
  assert.notEqual(minus, '', 'the minus button must be findable');
  assert.ok(minus.includes('disabled=""'), `expected a disabled minus, got: ${minus}`);
});

test('at 16 the minus button is ENABLED', () => {
  const minus = minusButton(html({ initialValues: { participantsCount: 16 } }));
  assert.notEqual(minus, '');
  assert.equal(minus.includes('disabled=""'), false, 'above the floor it must work');
});

test('the PLUS button is never disabled at the floor', () => {
  // The floor is a floor, not a lock. If both buttons went dead at 15 the
  // control would be unusable and the first test would still pass.
  assert.equal(plusButton(OUT).includes('disabled=""'), false);
});

test('CONTROL: the bare-attribute probe cannot tell the two states apart', () => {
  /**
   * The trap, executed. Both renders contain the word `disabled` — one as an
   * attribute, both as a Tailwind variant class — so only the `attr=""` form
   * discriminates.
   */
  const atFloor = minusButton(OUT);
  const above   = minusButton(html({ initialValues: { participantsCount: 16 } }));
  assert.ok(atFloor.includes('disabled'), 'bare probe matches at the floor');
  assert.ok(above.includes('disabled'), '…and matches above it too — it proves nothing');
  assert.notEqual(atFloor.includes('disabled=""'), above.includes('disabled=""'), 'the bounded form does discriminate');
});

test('the helper line states a MINIMUM, not a starting point', () => {
  // 'เริ่มต้น 15' reads as a default you may move away from. It is a floor.
  assert.ok(OUT.includes('In-house ขั้นต่ำ 15 ท่านต่อรุ่น'));
  assert.equal(OUT.includes('In-house เริ่มต้น 15 ท่านต่อรุ่น'), false);
});

test('a stale below-floor draft renders honestly rather than being silently rewritten', () => {
  /**
   * A sessionStorage draft written before the floor existed can hold 3. The
   * display shows 3 — the truth, and what the schema message will refer to —
   * with minus dead. The alternative, clamping the displayed value, would show
   * 15 while the form state still held 3, and the submit error would point at a
   * field reading 15.
   */
  const stale = html({ initialValues: { participantsCount: 3 } });
  assert.ok(stale.includes('>3</div>'), 'the real value is shown');
  assert.ok(minusButton(stale).includes('disabled=""'), 'and it cannot go lower');
});

// ── The quotation block ─────────────────────────────────────────────────────

test('Thailand is the default country, and it gets the branch dropdown', () => {
  assert.ok(hasLabel(OUT, 'สำนักงานใหญ่'), 'the head-office option');
  assert.ok(hasLabel(OUT, 'สาขาย่อย'), 'the sub-branch option');
  assert.ok(OUT.includes('name="branchType"'));
  // The old free-text control is gone entirely.
  assert.equal(OUT.includes('name="branch"'), false, '`branch` is legacy read-only');
});

test('the branch CODE input appears only once สาขาย่อย is chosen', () => {
  assert.equal(OUT.includes('name="branchCode"'), false, 'hidden for head office');
  const sub = html({ initialValues: { branchType: 'branch' } });
  assert.ok(sub.includes('name="branchCode"'));
  assert.ok(hasLabel(sub, 'เลขที่สาขา'));
});

test('the tax id input is digit-capped at 13', () => {
  assert.ok(/name="taxId"[^>]*maxLength="13"|maxLength="13"[^>]*name="taxId"/.test(OUT), OUT.match(/<input[^>]*taxId[^>]*>/)?.[0] ?? 'no taxId input');
  assert.ok(/name="taxId"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*name="taxId"/.test(OUT));
});

test("'Other country' drops the Thai-tax controls and takes the public field set", () => {
  const other = html({ initialValues: { quotationCountry: 'OTHER' } });
  assert.equal(other.includes('name="branchType"'), false, 'a branch number is meaningless abroad');
  assert.equal(other.includes('name="branchCode"'), false);
  for (const label of ['Address line 1', 'City', 'Country']) {
    assert.ok(hasLabel(other, label), `"${label}" should render`);
  }
  assert.ok(hasLabel(other, 'Address line 2 (optional)'));
  assert.ok(hasLabel(other, 'State / Province / Region (optional)'));
  assert.ok(hasLabel(other, 'Postal code (optional)'));
  assert.ok(hasLabel(other, 'Tax ID / VAT ID (optional)'));
});

test('CONTROL: the country switch really changes the block', () => {
  // If initialValues were being ignored, every "OTHER" assertion above would be
  // testing the Thai render and the absence checks would pass for free.
  const other = html({ initialValues: { quotationCountry: 'OTHER' } });
  assert.ok(OUT.includes('name="branchType"'), 'TH has it');
  assert.equal(other.includes('name="branchType"'), false, 'OTHER does not');
  assert.ok(hasLabel(OUT, 'รหัสไปรษณีย์'), 'TH has the Thai address');
  assert.equal(hasLabel(other, 'รหัสไปรษณีย์'), false);
});
