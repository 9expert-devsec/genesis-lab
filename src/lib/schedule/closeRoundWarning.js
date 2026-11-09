/**
 * The confirm step shown before an admin saves a round TO `closed` (ยกเลิก).
 *
 * Dependency-free so the `pure` tier pins the wording. Rendered by
 * SchedulesAdminClient through the modal's existing in-page `pendingWarning`
 * step (never window.confirm), tagged `kind: 'close'` so the footer knows to
 * offer "confirm cancel" rather than the out-of-window "save anyway".
 *
 * Closing NEVER touches registrations — they stay exactly as they are and
 * remain visible in /admin/registrations. The sentence with a count says so
 * the only way that matters to the admin: nobody will be told automatically.
 */

/** True when this save CHANGES the round to closed (not a re-save of one already closed). */
export function isClosingChange({ isEdit, previousStatus, nextStatus }) {
  if (nextStatus !== 'closed') return false;
  return !isEdit || previousStatus !== 'closed';
}

/**
 * @param {number} activeCount registrations on the round, excluding `cancelled`
 * @returns {{ kind: 'close', title: string, lines: string[], dates: string[], severe: boolean }}
 */
export function closeRoundWarning(activeCount) {
  const n = Number(activeCount) || 0;
  if (n >= 1) {
    return {
      kind: 'close',
      title: `รอบนี้มีผู้ลงทะเบียน ${n} คน — ระบบจะไม่แจ้งลูกค้าให้อัตโนมัติ ยืนยันยกเลิกรอบนี้?`,
      lines: [],
      dates: [],
      severe: true,
    };
  }
  return {
    kind: 'close',
    title: 'ยืนยันยกเลิกรอบนี้? รอบจะไม่แสดงบนเว็บและลงทะเบียนไม่ได้',
    lines: [],
    dates: [],
    severe: false,
  };
}
