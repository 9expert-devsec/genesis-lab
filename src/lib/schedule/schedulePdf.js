/**
 * The schedule PDF's one address. There is exactly one schedule file on the
 * site, so the name is fixed and carries no key and no timestamp: each upload
 * overwrites the same asset in place (see lib/actions/schedule-pdf.js).
 *
 *   /files/schedule/9expert-training-schedule.pdf
 */
export const SCHEDULE_PDF_CATEGORY = 'schedule';
export const SCHEDULE_PDF_FILE_NAME = '9expert-training-schedule.pdf';

export function schedulePdfPublicPath() {
  return `/files/${SCHEDULE_PDF_CATEGORY}/${SCHEDULE_PDF_FILE_NAME}`;
}
