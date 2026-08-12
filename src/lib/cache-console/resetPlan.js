/**
 * The pure decisions behind every destructive cache action.
 *
 * Dependency-free — no next/*, no db, no models — so all three rulings are
 * unit-testable without a Mongo connection or a request context. Same split as
 * lib/webhooks/courseRevalidatePlan.js: this decides, the action executes.
 *
 * ── THE THREE RULINGS THIS MODULE CARRIES ───────────────────────────────────
 *   1. sync-then-replace, never delete-then-sync   → `assessBuild`
 *   2. the collapse guard                          → `assessReplace`
 *   3. preview before apply                        → `assessPreview`
 *
 * Each has a named assertion in test/pure/resetPlan that goes red if the ruling
 * is REVERSED, not merely if it breaks.
 */

/**
 * ── RULING 2: THE COLLAPSE THRESHOLD ────────────────────────────────────────
 *
 * A replace that SHRINKS the set by more than this fraction of the current row
 * count is refused pending a second confirmation that names the numbers.
 *
 * WHY A RATIO AND NOT AN ABSOLUTE COUNT. The four mirrors differ by more than
 * 3x in size (career_paths ~12 rows, faqs ~40). An absolute threshold that is
 * meaningful for the largest is most of the smallest; one tuned for the
 * smallest fires constantly on the largest.
 *
 * WHY 20% AND NOT LOWER. The guard exists to catch a COLLAPSE — an upstream
 * list that came back truncated or unreadable — not to gate routine
 * housekeeping. A legitimate purge is the one or two records someone deleted
 * upstream since the last run. On the smallest mirror 20% is 3 rows at once; on
 * the largest it is 8. Both read as "something changed a lot", which is the
 * shape of a failure rather than of an editor removing a FAQ. Set it lower and
 * the confirmation fires on ordinary purges, which is worse than not having it:
 * a dialog that always appears is a dialog that gets clicked through, and then
 * the one that mattered is clicked through too.
 *
 * WHY 20% AND NOT HIGHER. The incident this round exists for lost 22 of 27
 * programs — 81%. Any threshold below that would have caught it, so the
 * incident does not pin the number; what pins it is the gap between "a couple
 * of rows" and "a big chunk", and 20% sits in that gap for every collection
 * here.
 *
 * ONE CONSTANT, not a literal at the call site, so the number can be found,
 * argued with, and changed in one place.
 */
export const COLLAPSE_SHRINK_RATIO = 0.2;

/**
 * ── RULING 3: HOW OLD A PREVIEW MAY BE ──────────────────────────────────────
 *
 * Two minutes. Long enough to read four numbers and decide; short enough that a
 * cron (3h and 6h cadences) or a second admin is unlikely to have landed in
 * between.
 *
 * The window is NOT the real protection and must not be mistaken for it — see
 * `assessPreview`, which also refuses when live state has drifted from what the
 * preview reported, whatever the clock says. The window is what bounds the
 * race; the drift check is what detects it.
 */
export const PREVIEW_MAX_AGE_MS = 120_000;

export const VERDICT = Object.freeze({
  OK: 'ok',
  REFUSE_EMPTY: 'refuse-empty',
  REFUSE_INCOMPLETE: 'refuse-incomplete',
  CONFIRM_COLLAPSE: 'confirm-collapse',
  REFUSE_STALE: 'refuse-stale',
  REFUSE_DRIFTED: 'refuse-drifted',
  REFUSE_NO_PREVIEW: 'refuse-no-preview',
  REFUSE_WRONG_TARGET: 'refuse-wrong-target',
});

/**
 * ── RULING 1 — is this build fit to REPLACE what is stored? ─────────────────
 *
 * Called with the result of building the replacement, BEFORE anything is
 * written. The action must not touch the stored document unless this says ok.
 *
 * `complete` is the caller's own answer to "did every source I needed come
 * back?". It is passed in rather than inferred because only the builder knows
 * how many sources it had — and an incomplete build that still produced rows is
 * exactly the case that must be refused: it looks like data.
 *
 * A build that is not complete, or that produced nothing, leaves the existing
 * snapshot in place. There is deliberately NO confirmation path here: unlike a
 * shrink, an incomplete build is not a judgement call an admin can overrule
 * from a number on a screen, because the thing they would be overruling is
 * "I could not read upstream".
 */
export function assessBuild({ complete, itemCount } = {}) {
  const count = Number.isFinite(itemCount) ? itemCount : 0;
  if (!complete) {
    return {
      verdict: VERDICT.REFUSE_INCOMPLETE,
      reason:
        'การดึงข้อมูลจากต้นทางไม่ครบทุกแหล่ง — สแนปช็อตเดิมถูกเก็บไว้ตามเดิม '
        + '(build incomplete; the existing snapshot was left untouched)',
    };
  }
  if (count <= 0) {
    return {
      verdict: VERDICT.REFUSE_EMPTY,
      reason:
        'ข้อมูลใหม่ว่างเปล่า — สแนปช็อตเดิมถูกเก็บไว้ตามเดิม '
        + '(the replacement was empty; the existing snapshot was left untouched)',
    };
  }
  return { verdict: VERDICT.OK, reason: '' };
}

/**
 * ── RULING 2 — may this replacement be applied? ─────────────────────────────
 *
 * @param {number} beforeCount rows currently stored
 * @param {number} afterCount  rows the incoming set would leave
 * @param {boolean} confirmed  the admin has confirmed a named collapse
 *
 * EMPTY IS REFUSED OUTRIGHT AND IS NOT CONFIRMABLE. `unwrap()`
 * (lib/api/client.js:95-105) turns any response it cannot read into
 * `{ items: [] }` without throwing, so "upstream has no rows" and "upstream
 * returned something unreadable" are the same value at every call site. There
 * is no click that should turn that into a purge of the entire collection.
 *
 * A COLLAPSE IS REFUSED **PENDING** CONFIRMATION. It is a judgement an admin
 * can legitimately make — a program genuinely being retired upstream looks like
 * this — so the answer is a second, explicit confirmation that names the
 * numbers, not a refusal.
 */
export function assessReplace({ beforeCount, afterCount, confirmed = false } = {}) {
  const before = Number.isFinite(beforeCount) ? beforeCount : 0;
  const after = Number.isFinite(afterCount) ? afterCount : 0;
  const delta = after - before;
  const removed = Math.max(0, before - after);
  const shrinkRatio = before > 0 ? removed / before : 0;

  const base = { before, after, delta, removed, shrinkRatio };

  if (after <= 0 && before > 0) {
    return {
      ...base,
      verdict: VERDICT.REFUSE_EMPTY,
      reason:
        `ชุดข้อมูลใหม่ว่างเปล่า (${before} → 0) — ปฏิเสธเสมอ ไม่มีปุ่มยืนยัน `
        + 'เพราะการอ่านต้นทางไม่สำเร็จให้ผลเหมือนกับ "ต้นทางไม่มีข้อมูล" ทุกประการ '
        + '(empty incoming set — always refused, never confirmable)',
    };
  }

  if (before > 0 && shrinkRatio > COLLAPSE_SHRINK_RATIO) {
    return {
      ...base,
      verdict: confirmed ? VERDICT.OK : VERDICT.CONFIRM_COLLAPSE,
      reason: confirmed
        ? ''
        : `จะลบ ${removed} จาก ${before} แถว (${Math.round(shrinkRatio * 100)}%) `
          + `เหลือ ${after} — เกินเกณฑ์ ${Math.round(COLLAPSE_SHRINK_RATIO * 100)}% `
          + 'ต้องยืนยันอีกครั้งโดยอ่านตัวเลขนี้ก่อน',
    };
  }

  return { ...base, verdict: VERDICT.OK, reason: '' };
}

/**
 * ── RULING 3 — may this apply proceed on this preview? ──────────────────────
 *
 * @param {object|null} preview  what the preview action returned
 * @param {object} live          state re-read by the apply, right now
 * @param {number} now           injected clock
 *
 * ── WHY THERE IS NO SIGNATURE ON THE PREVIEW ────────────────────────────────
 * A signature would prove the preview was issued by us and not fabricated. It
 * would buy nothing here, and reasoning about why is worth writing down.
 *
 * Both actions are `requireAdmin`-gated, so a caller able to invoke apply at all
 * is already an admin able to invoke preview. The only thing fabrication could
 * achieve is dodging the collapse guard by supplying flattering numbers — and
 * it cannot, because THE APPLY RECOMPUTES THE VERDICT FROM LIVE DATA and never
 * from the preview's numbers. The preview's counts are used for exactly one
 * thing: detecting that the world moved between the two clicks.
 *
 * So the preview is a claim about a moment, checked against the present. That
 * is the lost-update protection; a signature would only have protected the
 * claim's authorship, which was never the risk.
 */
export function assessPreview(preview, live, now) {
  if (!preview || typeof preview !== 'object') {
    return {
      verdict: VERDICT.REFUSE_NO_PREVIEW,
      reason: 'ต้องกดดูตัวอย่าง (preview) ก่อนจึงจะยืนยันได้',
    };
  }

  if (preview.target !== live.target) {
    return {
      verdict: VERDICT.REFUSE_WRONG_TARGET,
      reason:
        `พรีวิวนี้เป็นของ "${preview.target}" แต่กำลังสั่งกับ "${live.target}"`,
    };
  }

  const age = now - Number(preview.issuedAt ?? 0);
  if (!Number.isFinite(age) || age < 0 || age > PREVIEW_MAX_AGE_MS) {
    return {
      verdict: VERDICT.REFUSE_STALE,
      reason:
        `พรีวิวเก่าเกิน ${Math.round(PREVIEW_MAX_AGE_MS / 1000)} วินาที — `
        + 'กรุณากดดูตัวอย่างใหม่ก่อนยืนยัน',
    };
  }

  // THE DRIFT CHECK — the part that actually protects the delete. If the stored
  // set changed since the preview read it (a cron fired, another admin applied),
  // the numbers on the admin's screen describe a world that no longer exists.
  if (Number(preview.beforeCount) !== Number(live.beforeCount)) {
    return {
      verdict: VERDICT.REFUSE_DRIFTED,
      reason:
        `ข้อมูลเปลี่ยนไปหลังจากกดดูตัวอย่าง (ตอนนั้น ${preview.beforeCount} แถว, `
        + `ตอนนี้ ${live.beforeCount} แถว) — กรุณากดดูตัวอย่างใหม่`,
    };
  }

  return { verdict: VERDICT.OK, reason: '' };
}

/** Is this verdict one that permits a write? */
export function permitsWrite(verdict) {
  return verdict === VERDICT.OK;
}

// ── LABELS FOR STATES THAT ONLY EXIST AFTER A CLICK ─────────────────────────
//
// Every string below was previously a template literal inside a client
// component, in a branch that only renders once a preview has returned. That
// made each of them STRUCTURALLY UNASSERTABLE: renderToStaticMarkup reaches
// only the initial render, and no test here may mount a React root (the runner
// is isolation:'none', and a root over jsdom leaks globalThis.window into every
// other render test in the process).
//
// Round 5 found this the hard way — a control-break that stripped the numbers
// out of the override confirm label left the entire suite green — and moved
// that one label out. These are the rest of the same class, found by auditing
// for it rather than by waiting for the next break to miss.
//
// The rule they encode: A CONTROL THAT DESTROYS DATA RESTATES WHAT IS LOST IN
// ITS OWN LABEL. A button reading "ยืนยัน" beneath a table is a button people
// press having read the heading and not the rows.

/**
 * The confirm label for a purge that tripped the collapse guard.
 *
 * Names both numbers — what goes and what it goes from — because the collapse
 * confirmation is the one the admin is most likely to meet while surprised.
 */
export function mirrorCollapseConfirmLabel(preview) {
  // Read off a possibly-null object rather than destructured with a default:
  // a parameter default only covers `undefined`, and `null` is exactly what a
  // cleared preview state holds. Throwing here would blank the panel that is
  // the only route to the action.
  const going = Number(preview?.doomedTotal) || 0;
  const from = Number(preview?.beforeCount) || 0;
  return `ยืนยันลบ ${going} แถว จาก ${from} แถว`;
}

/** The label for an ordinary purge, below the collapse threshold. */
export function mirrorDeleteLabel(preview) {
  const going = Number(preview?.doomedTotal) || 0;
  return `ลบ ${going} แถวที่ถูกลบไปแล้วที่ต้นทาง`;
}

/**
 * One line per section an override would shrink, for the list beside the
 * confirm button.
 *
 * Returns an ARRAY, not a joined string: the component renders one element per
 * entry, and a test that asserts on the array cannot be satisfied by a single
 * line that happens to contain every number.
 */
export function overrideLossLines(shrunk) {
  const list = Array.isArray(shrunk) ? shrunk : [];
  return list.map((s) => {
    const lost = Number.isFinite(s?.lost) ? s.lost : (Number(s?.before) || 0) - (Number(s?.after) || 0);
    const pct = Number.isFinite(s?.ratio) ? Math.round(s.ratio * 100) : 0;
    return `${s?.section}: ${s?.before} → ${s?.after} (หายไป ${lost}, -${pct}%)`;
  });
}

/**
 * The staleness note shown under every preview.
 *
 * DERIVED FROM `PREVIEW_MAX_AGE_MS`, not written out. Both components carried
 * "ประมาณ 2 นาที" as prose beside a constant of 120_000 — a duplicated number
 * with nothing holding the two together, so raising or lowering the window
 * would have left the UI confidently stating the old one. The window is a
 * safety property; the copy describing it must not be able to disagree.
 */
export function previewWindowNote(ms = PREVIEW_MAX_AGE_MS) {
  // The window is a PARAMETER defaulting to the constant, not a closed-over
  // read of it. Hardcoding  produced a byte-identical note while
  // the constant happened to be 120_000, so a control-break that severed the
  // derivation reddened nothing — the output is the same until the day someone
  // changes the window, which is the day it matters. Taking it as an argument
  // makes the derivation observable: a test can pass a different window and
  // watch the sentence follow.
  const seconds = Math.round(ms / 1000);
  const minutes = seconds % 60 === 0 ? seconds / 60 : null;
  const window = minutes ? `${minutes} นาที` : `${seconds} วินาที`;
  return `ตัวอย่างนี้ใช้ได้ประมาณ ${window} — ถ้าเกินกว่านั้น หรือข้อมูลเปลี่ยนไประหว่างนี้ ระบบจะปฏิเสธและให้กดดูตัวอย่างใหม่`;
}
