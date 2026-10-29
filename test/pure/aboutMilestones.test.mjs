import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONES } from '@/lib/about/milestones';

/**
 * /about-us timeline data. See src/lib/about/milestones.js. One entry per
 * YEAR; a year holds one or more items (round AB-3c: 2026 has two).
 */

test('six years, 2005 → 2026, strictly ascending — no seventh column', () => {
  assert.equal(MILESTONES.length, 6);
  assert.deepEqual(MILESTONES.map((m) => m.year), [2005, 2020, 2022, 2023, 2025, 2026]);
  for (let i = 1; i < MILESTONES.length; i += 1) {
    assert.ok(MILESTONES[i].year > MILESTONES[i - 1].year, `${MILESTONES[i].year} after ${MILESTONES[i - 1].year}`);
  }
});

test('every item has a title and a description', () => {
  for (const m of MILESTONES) {
    assert.ok(m.items.length > 0, `${m.year} has items`);
    for (const it of m.items) {
      assert.ok(it.title.trim(), `${m.year} title`);
      assert.ok(it.description.trim(), `${m.year} description`);
    }
  }
});

test('2023 is the DBD (กรมพัฒนาธุรกิจการค้า), not DSD', () => {
  const [item, ...rest] = MILESTONES.find((m) => m.year === 2023).items;
  assert.equal(rest.length, 0);
  assert.equal(item.title, 'ได้รับการรับรองจาก DBD');
  assert.equal(item.description, 'กรมพัฒนาธุรกิจการค้า');
  assert.equal(JSON.stringify(MILESTONES).includes('DSD'), false);
});

test('2026 holds two items: the CI rebrand, then One Platform for Skill Development', () => {
  const items = MILESTONES.find((m) => m.year === 2026).items;
  assert.deepEqual(items.map((it) => it.title), ['รีแบรนด์ CI ใหม่', 'ร่วมลงนาม One Platform for Skill Development']);
  assert.equal(items[0].description, 'ปรับโทนสีและโลโก้ใหม่ทั้งหมด เป็นเอกลักษณ์ที่เห็นในวันนี้');
  assert.equal(items[1].description, 'แพลตฟอร์มพัฒนาทักษะของกรมพัฒนาฝีมือแรงงาน กระทรวงแรงงาน');
});
