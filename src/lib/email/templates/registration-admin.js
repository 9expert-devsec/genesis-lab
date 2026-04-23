/**
 * Email to the admin team notifying of a new registration.
 * Returns { html, text }.
 */
export function adminNotificationEmail({
  referenceNumber,
  data,
  adminDashboardUrl,
}) {
  const requestsInvoice = data.requestInvoice ? 'ใช่' : 'ไม่';

  const html = `<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Sarabun', 'Arial', sans-serif; background: #ffffff; color: #0d1b2a; margin: 0; padding: 24px;">
  <h2 style="margin: 0 0 20px; color: #005CFF;">ใบสมัครใหม่</h2>
  <p style="margin: 0 0 20px;">มีผู้สมัครใหม่เข้ามาในระบบ เลขอ้างอิง: <strong>${referenceNumber}</strong></p>

  <table cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; background: #f8fafd; border-radius: 8px;">
    <tr><td style="width: 180px; color: #6b7280;">หลักสูตร</td><td><strong>${data.courseName || data.courseId}</strong></td></tr>
    <tr><td style="color: #6b7280;">รอบอบรม</td><td>${data.classDate || data.classId}</td></tr>
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ข้อมูลผู้สมัคร</strong></td></tr>
    <tr><td style="color: #6b7280;">ชื่อ-นามสกุล</td><td>${data.firstName} ${data.lastName}</td></tr>
    <tr><td style="color: #6b7280;">อีเมล</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
    <tr><td style="color: #6b7280;">เบอร์โทร</td><td><a href="tel:${data.phone}">${data.phone}</a></td></tr>
    ${data.lineId ? `<tr><td style="color: #6b7280;">LINE ID</td><td>${data.lineId}</td></tr>` : ''}
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ใบกำกับภาษี: ${requestsInvoice}</strong></td></tr>
    ${
      data.requestInvoice
        ? `<tr><td style="color: #6b7280;">ชื่อบริษัท</td><td>${data.companyName}</td></tr>
    <tr><td style="color: #6b7280;">เลขประจำตัวผู้เสียภาษี</td><td>${data.taxId}</td></tr>
    <tr><td style="color: #6b7280;">ที่อยู่</td><td>${data.address}</td></tr>`
        : ''
    }
    ${data.notes ? `<tr><td style="color: #6b7280;">หมายเหตุ</td><td>${data.notes}</td></tr>` : ''}
  </table>

  <div style="margin-top: 24px;">
    <a href="${adminDashboardUrl}" style="display: inline-block; background: #005CFF; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">ดูใน Admin Panel</a>
  </div>

  <p style="margin: 32px 0 0; font-size: 12px; color: #6b7280;">
    อีเมลนี้ส่งอัตโนมัติจากระบบ 9Expert Genesis Lab
  </p>
</body>
</html>`;

  const text = `ใบสมัครใหม่ - ${referenceNumber}

หลักสูตร: ${data.courseName || data.courseId}
รอบอบรม: ${data.classDate || data.classId}

ผู้สมัคร:
  ${data.firstName} ${data.lastName}
  ${data.email}
  ${data.phone}
  ${data.lineId ? `LINE: ${data.lineId}` : ''}

ใบกำกับภาษี: ${requestsInvoice}
${data.requestInvoice ? `  ${data.companyName}\n  เลข: ${data.taxId}\n  ${data.address}` : ''}

${data.notes ? `หมายเหตุ: ${data.notes}` : ''}

ดูใน Admin: ${adminDashboardUrl}`;

  return { html, text };
}
