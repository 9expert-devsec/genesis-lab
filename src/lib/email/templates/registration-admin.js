/**
 * Email to the admin team notifying of a new registration.
 * Returns { html, text }.
 *
 * Expects `data` to include the fields spread from coordinator plus:
 *   attendanceMode, requestInvoice, invoice (nested object),
 *   invoiceCountry ('TH' | 'OTHER'), invoiceAddress (pre-computed string)
 */
export function adminNotificationEmail({
  referenceNumber,
  data,
  adminDashboardUrl,
}) {
  const requestsInvoice = data.requestInvoice ? 'ใช่' : 'ไม่';
  const modeLabel =
    data.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom';
  const showMode = data.scheduleType === 'hybrid';

  const invoiceNameLine =
    data.invoice?.type === 'corporate'
      ? data.invoice?.companyName || '—'
      : `${data.invoice?.firstName ?? ''} ${data.invoice?.lastName ?? ''}`.trim() || '—';

  const invoiceTypeThai =
    data.invoice?.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป';

  const invoiceCountryLabel =
    data.invoiceCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';

  // ── HTML ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Sarabun', 'Arial', sans-serif; background: #ffffff; color: #0d1b2a; margin: 0; padding: 24px;">
  <h2 style="margin: 0 0 20px; color: #005CFF;">ใบสมัครใหม่</h2>
  <p style="margin: 0 0 20px;">มีผู้สมัครใหม่เข้ามาในระบบ เลขอ้างอิง: <strong>${referenceNumber}</strong></p>

  <table cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; background: #f8fafd; border-radius: 8px;">
    <!-- Course -->
    <tr><td style="width: 180px; color: #6b7280;">หลักสูตร</td><td><strong>${data.courseName || data.courseId}</strong></td></tr>
    <tr><td style="color: #6b7280;">รอบอบรม</td><td>${data.classDate || data.classId}</td></tr>
    ${showMode ? `<tr><td style="color: #6b7280;">รูปแบบการอบรม</td><td>${modeLabel}</td></tr>` : ''}

    <!-- Coordinator -->
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ข้อมูลผู้สมัคร / ผู้ประสานงาน</strong></td></tr>
    <tr><td style="color: #6b7280;">ชื่อ-นามสกุล</td><td>${data.firstName} ${data.lastName}</td></tr>
    <tr><td style="color: #6b7280;">อีเมล</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
    <tr><td style="color: #6b7280;">เบอร์โทร</td><td><a href="tel:${data.phone}">${data.phone}</a></td></tr>
    ${data.lineId ? `<tr><td style="color: #6b7280;">LINE ID</td><td>${data.lineId}</td></tr>` : ''}
    <tr><td style="color: #6b7280;">จำนวนผู้เข้าอบรม</td><td>${data.attendeesCount} ท่าน</td></tr>

    <!-- Invoice -->
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ใบเสนอราคา / ใบกำกับภาษี: ${requestsInvoice}</strong></td></tr>
    ${data.requestInvoice ? `
    <tr><td style="color: #6b7280;">ประเภทลูกค้า</td><td>${invoiceTypeThai} · ${invoiceCountryLabel}</td></tr>
    <tr><td style="color: #6b7280;">${data.invoice?.type === 'corporate' ? 'ชื่อบริษัท' : 'ชื่อ-นามสกุล'}</td><td>${invoiceNameLine}</td></tr>
    ${data.invoice?.branch ? `<tr><td style="color: #6b7280;">สาขา</td><td>${data.invoice.branch}</td></tr>` : ''}
    ${data.invoice?.taxId ? `<tr><td style="color: #6b7280;">เลขประจำตัวผู้เสียภาษี</td><td>${data.invoice.taxId}</td></tr>` : ''}
    ${data.invoiceAddress ? `<tr><td style="color: #6b7280;">ที่อยู่</td><td>${data.invoiceAddress}</td></tr>` : ''}
    ` : ''}

    <!-- Notes -->
    ${data.notes ? `<tr><td colspan="2" style="padding-top: 8px;"></td></tr><tr><td style="color: #6b7280;">หมายเหตุ</td><td>${data.notes}</td></tr>` : ''}
  </table>

  <div style="margin-top: 24px;">
    <a href="${adminDashboardUrl}" style="display: inline-block; background: #005CFF; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">ดูใน Admin Panel</a>
  </div>

  <p style="margin: 32px 0 0; font-size: 12px; color: #6b7280;">
    อีเมลนี้ส่งอัตโนมัติจากระบบ 9Expert Genesis Lab
  </p>
</body>
</html>`;

  // ── Plain text ────────────────────────────────────────────────────
  const text = `ใบสมัครใหม่ - ${referenceNumber}

หลักสูตร: ${data.courseName || data.courseId}
รอบอบรม: ${data.classDate || data.classId}${showMode ? `\nรูปแบบการอบรม: ${modeLabel}` : ''}

ผู้สมัคร / ผู้ประสานงาน:
  ${data.firstName} ${data.lastName}
  ${data.email}
  ${data.phone}${data.lineId ? `\n  LINE: ${data.lineId}` : ''}
  จำนวนผู้เข้าอบรม: ${data.attendeesCount} ท่าน

ใบเสนอราคา / ใบกำกับภาษี: ${requestsInvoice}${data.requestInvoice ? `
  ประเภท: ${invoiceTypeThai} · ${invoiceCountryLabel}
  ${data.invoice?.type === 'corporate' ? 'ชื่อบริษัท' : 'ชื่อ-นามสกุล'}: ${invoiceNameLine}${data.invoice?.branch ? `\n  สาขา: ${data.invoice.branch}` : ''}${data.invoice?.taxId ? `\n  เลขผู้เสียภาษี: ${data.invoice.taxId}` : ''}${data.invoiceAddress ? `\n  ที่อยู่: ${data.invoiceAddress}` : ''}` : ''}

${data.notes ? `หมายเหตุ: ${data.notes}\n\n` : ''}ดูใน Admin: ${adminDashboardUrl}`;

  return { html, text };
}