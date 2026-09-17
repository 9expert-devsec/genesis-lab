/**
 * The Thai sentence for each way a panel read can fail.
 *
 * Pure and import-free so the plain page components can render it without
 * touching client.js — that module is `server-only`, and keeping the copy out
 * of it means a future client component that only needs the wording does not
 * become a reason to import the thing that holds the key.
 *
 * One vocabulary, declared once. `PANEL_FAILURE_REASONS` is the closed set
 * client.js may answer with; a reason outside it renders as the generic line
 * rather than as nothing, so an unmapped code is visible and not blank.
 */

export const PANEL_FAILURE_REASONS = Object.freeze([
  'not_configured',
  'unauthorized',
  'disabled_upstream',
  'bad_request',
  'not_found',
  'timeout',
  'upstream_error',
]);

const MESSAGES = Object.freeze({
  not_configured:    'ยังไม่ได้ตั้งค่าการเชื่อมต่อแผงสถิติแชต (CHAT_PANEL_API_URL / CHAT_PANEL_API_KEY)',
  unauthorized:      'บริการแชตปฏิเสธคีย์ที่ตั้งค่าไว้ — กรุณาตรวจสอบ CHAT_PANEL_API_KEY',
  disabled_upstream: 'บริการแชตปิดแผงสถิติอยู่ (ฝั่งบริการยังไม่ได้ตั้งคีย์)',
  bad_request:       'ช่วงวันที่หรือพารามิเตอร์ไม่ถูกต้อง',
  not_found:         'ไม่พบบทสนทนานี้',
  timeout:           'บริการแชตตอบกลับช้าเกินไป กรุณาลองใหม่อีกครั้ง',
  upstream_error:    'ไม่สามารถอ่านข้อมูลจากบริการแชตได้ในขณะนี้',
});

const GENERIC = 'ไม่สามารถอ่านข้อมูลจากบริการแชตได้ในขณะนี้';

/** The sentence for `reason`; unknown reasons get the generic line. */
export function panelFailureMessage(reason) {
  return MESSAGES[reason] ?? GENERIC;
}
