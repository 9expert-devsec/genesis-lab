/**
 * The rename preview, turned into something a person can read.
 *
 * ── WHY A MODULE AND NOT JSX ───────────────────────────────────────────────
 * Three of the four things this screen must get right are JUDGEMENTS, not
 * markup: whether the rename is refused, whether a case-only change is being
 * presented as trivial when it is not, and whether a store with zero rows is
 * shown rather than dropped. Each is assertable against a fixture, and none of
 * them needs a DOM — so they live here and the component renders what it is
 * told. The states that matter (a collision, a case-only rename) have no live
 * instance to eyeball, which is the same reason the preview's own verdicts are
 * driven from fixtures.
 *
 * Pure: no React, no model, no action. It takes the object
 * `previewCourseCodeRename` returns and nothing else.
 */

import { RENAME_STORES } from './renameCoursePreview';

/**
 * What each store HOLDS, in the words an admin would use.
 *
 * Deliberately not the model name: "CourseExtension" tells the tech lead
 * something and tells the person who asked for the rename nothing. The model
 * name is still shown beside it, because the two audiences are both real.
 */
export const STORE_DESCRIPTIONS = Object.freeze({
  courseExtension:         'SEO, URL alias, แกลเลอรี, สถานะเผยแพร่',
  courseOutlineFile:       'ไฟล์ PDF หลักสูตร (เฉพาะแถวข้อมูล — ตัวไฟล์ยังไม่ถูกย้าย)',
  programOrder:            'ลำดับหลักสูตรในโปรแกรม',
  skillOrder:              'ลำดับหลักสูตรใน Skill',
  earlyBirdConfig:         'ราคา Early Bird',
  coursePromoLink:         'ลิงก์โปรโมชั่นของหลักสูตร',
  featuredCourse:          'หลักสูตรแนะนำ (หน้าแรก)',
  featuredOnlineCourse:    'คอร์สออนไลน์แนะนำ',
  navFeaturedOnlineCourse: 'คอร์สออนไลน์แนะนำ (Navbar)',
  scheduleLocal:           'ข้อมูลตารางอบรมที่แก้ไขในระบบ',
  promotion:               'โปรโมชั่นที่อ้างถึงหลักสูตรนี้',
  article:                 'บทความที่ปักหมุดหลักสูตรนี้',
  registerPublic:          'ใบลงทะเบียนที่เคยเกิดขึ้น',
  careerPathRegistration:  'ใบลงทะเบียน Career Path ที่เคยเกิดขึ้น',
});

/** blocked → cannot run. warning → runs, but the admin is being misled if this is not said. */
export const VERDICT = Object.freeze({
  IDLE:     'idle',
  BLOCKED:  'blocked',
  CASE_ONLY: 'case-only',
  READY:    'ready',
});

const label = (key) => STORE_DESCRIPTIONS[key] ?? key;

/**
 * @param {object|null} preview what `previewCourseCodeRename` returned
 * @returns {object} a flat shape the component renders without deciding anything
 */
export function buildRenamePreviewView(preview) {
  if (!preview) return { verdict: VERDICT.IDLE, stores: [], historical: [], warnings: [], total: 0 };

  const blocked = preview.ok === false;
  const caseOnly = Boolean(preview.caseOnly);

  /**
   * EVERY store, including the empty ones.
   *
   * "Nothing here" is information: an admin looking at a rename needs to know
   * that the featured lists were CHECKED and hold nothing, not be left to
   * wonder whether they were considered. Omitting zeros would make a
   * twelve-store migration look like a four-store one.
   *
   * `count: null` is a third state and is NOT rendered as 0 — it means the
   * store was not read, which is a different claim from "it is empty".
   */
  const stores = RENAME_STORES.filter((s) => !s.historical).map((s) => {
    const row = (preview.stores ?? []).find((p) => p.key === s.key);
    return {
      key: s.key,
      model: s.model,
      field: s.field,
      holds: label(s.key),
      count: row?.count ?? null,
      unread: row ? row.count === null : true,
      noOp: Boolean(row?.noOp),
      note: s.note ?? '',
    };
  });

  const historical = (preview.historical ?? []).map((h) => ({
    key: h.key,
    model: h.model,
    holds: label(h.key),
    count: h.count,
    reason: h.reason ?? '',
  }));

  /**
   * THE CASE-ONLY WARNING, and why it is a warning rather than a note.
   *
   * Measured: three stores no-op on a case-only rename because they normalise
   * the code, while every exact-match store still changes. So the ordering an
   * admin spot-checks afterwards looks correct while the extension, the
   * early-bird row, the promo links and the schedule rows are orphaned. It
   * reads as the safest possible rename and is one of the worst.
   */
  const warnings = [];
  if (caseOnly) {
    const noOps = stores.filter((s) => s.noOp).map((s) => s.holds);
    warnings.push({
      kind: 'case-only',
      title: 'เปลี่ยนเฉพาะตัวพิมพ์เล็ก/ใหญ่ — อันตรายกว่าที่เห็น',
      body:
        'ระบบที่เก็บรหัสแบบปรับรูปแบบอัตโนมัติจะไม่เปลี่ยนอะไรเลย '
        + `(${noOps.join(', ') || 'ไม่มี'}) แต่ระบบที่เทียบรหัสแบบตรงตัวจะเปลี่ยนทั้งหมด — `
        + 'ผลคือลำดับยังดูถูกต้องหลังเปลี่ยน ทั้งที่ SEO / Early Bird / ลิงก์โปรโมชั่น / '
        + 'ตารางอบรม หลุดออกจากหลักสูตรนี้แล้ว',
    });
  }

  /**
   * ── THE DETACHED CODES, SHOWN ON EVERY VERDICT INCLUDING A BLOCKED ONE ────
   *
   * This is the warning the screen did not have, and its absence is what let
   * the upstream-only state be reported as "nothing to change". It is rendered
   * on the BLOCKED path too — deliberately, because blocked is exactly where
   * that state lands: the only code the picker can offer is the one upstream
   * moved to, so the admin's honest attempt produces `from === to`.
   *
   * Two different things to say, and they are not interchangeable:
   *   fromIsOne  the admin IS previewing the genesis-only code — they have the
   *              right question in front of them, and what follows is a real
   *              blast radius rather than a dead end.
   *   otherwise  a genesis-only code exists SOMEWHERE. That is a fact about the
   *              catalogue and it is named, because nothing else on this screen
   *              can see it.
   */
  const detached = preview.detached ?? { codes: [], fromIsOne: false };
  if (detached.codes.length > 0) {
    warnings.push(
      detached.fromIsOne
        ? {
            kind: 'detached',
            title: `รหัส "${preview.oldCode}" มีอยู่เฉพาะฝั่งระบบนี้ — MSDB ไม่มีรหัสนี้แล้ว`,
            body:
              'แปลว่า course_id ที่ MSDB ถูกเปลี่ยนไปแล้ว แต่ฝั่งระบบนี้ยังค้างอยู่ที่รหัสเดิม '
              + 'จำนวนแถวด้านล่างคือของจริงที่ยังรออยู่ ไม่ใช่ศูนย์ '
              + 'เลือกได้สองทาง: เปลี่ยน course_id ที่ MSDB กลับเป็นรหัสนี้ (ยกเลิกได้ทั้งหมด) '
              + 'หรือสั่งเปลี่ยนฝั่งระบบนี้ให้ตามทัน',
          }
        : {
            kind: 'detached',
            title: 'มีรหัสที่ค้างอยู่ฝั่งระบบนี้ และไม่มีอยู่ที่ MSDB',
            body:
              `${detached.codes.join(', ')} — รหัสเหล่านี้ถูกถือไว้ที่ CourseExtension `
              + 'แต่ต้นทางไม่มีแล้ว ซึ่งเป็นร่องรอยของการเปลี่ยน course_id ที่ MSDB '
              + 'โดยที่ฝั่งระบบนี้ยังไม่ได้ตามไป — เลือกรหัสนั้นเป็นรหัสเดิมเพื่อดูผลกระทบที่แท้จริง '
              + '(ตรวจจากแถว CourseExtension เท่านั้น หลักสูตรที่หลุดเฉพาะในลำดับ/ตาราง จะไม่ถูกนับที่นี่)',
          }
    );
  }

  /**
   * THE INTERVAL, phrased as an instruction rather than a fact.
   *
   * The action returns these warnings after the write; the person reading the
   * PREVIEW is the one who still has the chance to plan around them, so they
   * are shown here too — as what they must DO, not as what will happen to them.
   */
  if (!blocked) {
    warnings.push({
      kind: 'interval',
      title: 'ต้องแก้ MSDB ทันทีหลังจากนี้ — เป็นนาที ไม่ใช่ชั่วโมง',
      body:
        'phase 1 เปลี่ยนเฉพาะฝั่ง genesis. ระหว่างที่ MSDB ยังเป็นรหัสเดิม '
        + 'หลักสูตรจะหลุดจากลำดับของโปรแกรม (ไปอยู่กลุ่มยังไม่จัดลำดับ) และ Early Bird / '
        + 'ลิงก์โปรโมชั่น / ตารางที่แก้ในระบบ / รายการแนะนำ จะยังไม่ผูกกับหลักสูตรนี้ '
        + '— ส่วนนี้ไม่มีทางลัดรองรับ. URL และการค้นหาด้วยรหัสเดิมยังใช้ได้',
    });
  }

  const url = preview.url
    ? {
        current: preview.url.current,
        after: preview.url.after,
        aliased: preview.url.aliased,
        changes: preview.url.changes,
        aliasFirst: preview.url.mustCreateAliasFirst,
        aliasToCreate: preview.url.aliasToCreate,
      }
    : null;

  return {
    verdict: blocked ? VERDICT.BLOCKED : caseOnly ? VERDICT.CASE_ONLY : VERDICT.READY,
    oldCode: preview.oldCode,
    newCode: preview.newCode,
    blocked: preview.blocked ?? [],
    collision: preview.collision ?? null,
    detached,
    url,
    stores,
    historical,
    notKeyedByCode: preview.notKeyedByCode ?? [],
    outlineBlobs: preview.outlineBlobs ?? [],
    undetermined: preview.undetermined ?? [],
    warnings,
    // Only what was actually read — an unread store contributes nothing rather
    // than a zero that would understate the blast radius.
    total: stores.reduce((n, s) => n + (s.count ?? 0), 0),
  };
}
