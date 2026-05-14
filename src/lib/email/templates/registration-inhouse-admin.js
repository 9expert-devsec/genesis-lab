/**
 * Email sent to the admin / sales team notifying of a new In-house
 * training request. Returns { html, text }.
 */
export function inhouseAdminNotificationEmail({
  referenceNumber,
  data,
  quotationAddress = '',
  adminDashboardUrl,
}) {
  const trainingFormatLabel =
    data.trainingFormat === 'onsite'   ? 'Onsite' :
    data.trainingFormat === 'online'   ? 'Online' :
    'ยังไม่ระบุ (Flexible)';

  const scheduleLabel =
    data.scheduleMode === 'month'
      ? `เดือน: ${data.preferredMonth || '—'}`
      : data.scheduleMode === 'dateRange'
        ? `${data.preferredDateFrom || '—'} ถึง ${data.preferredDateTo || '—'}`
        : 'ยังไม่แน่ใจ';

  const skillLevelLabel =
    data.skillLevel === 'beginner'     ? 'Beginner' :
    data.skillLevel === 'intermediate' ? 'Intermediate' :
    data.skillLevel === 'advanced'     ? 'Advanced' :
    'Mixed';

  const contentModeLabel =
    data.contentMode === 'standard' ? 'Outline มาตรฐาน' :
    data.contentMode === 'custom'   ? 'ปรับเนื้อหา' :
    'ให้แนะนำ';

  const preferredContactLabel =
    data.preferredContact === 'phone' ? 'โทรศัพท์' :
    data.preferredContact === 'line'  ? 'LINE' :
    'Email';

  const preferredTimeLabel =
    data.preferredContactTime === 'morning'   ? 'เช้า (09:00-12:00)' :
    data.preferredContactTime === 'afternoon' ? 'บ่าย (13:00-17:00)' :
    'เวลาทำการ (09:00-17:00)';

  const coursesList = (data.coursesInterested ?? []).join(', ') || '—';
  const equipmentList = (data.onsiteEquipment ?? []).join(', ') || '—';

  const countryLabel = data.quotationCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';

  const html = `<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Sarabun', 'Arial', sans-serif; background: #ffffff; color: #0d1b2a; margin: 0; padding: 24px;">
  <h2 style="margin: 0 0 20px; color: #2486FF;">In-house Request ใหม่</h2>
  <p style="margin: 0 0 20px;">มี Request เข้ามาในระบบ เลขอ้างอิง: <strong>${referenceNumber}</strong></p>

  <table cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; background: #f8fafd; border-radius: 8px;">
    <!-- Company / Contact -->
    <tr><td colspan="2" style="padding-top: 4px;"><strong>ผู้ประสานงาน</strong></td></tr>
    <tr><td style="width: 200px; color: #6b7280;">บริษัท</td><td><strong>${data.companyName}</strong></td></tr>
    <tr><td style="color: #6b7280;">ชื่อ-นามสกุล</td><td>${data.contactFirstName} ${data.contactLastName}</td></tr>
    ${data.contactRole ? `<tr><td style="color: #6b7280;">ตำแหน่ง</td><td>${data.contactRole}${data.contactDepartment ? ` · ${data.contactDepartment}` : ''}</td></tr>` : ''}
    <tr><td style="color: #6b7280;">อีเมล</td><td><a href="mailto:${data.contactEmail}">${data.contactEmail}</a></td></tr>
    <tr><td style="color: #6b7280;">เบอร์โทร</td><td><a href="tel:${data.contactPhone}">${data.contactPhone}</a></td></tr>
    ${data.contactLine ? `<tr><td style="color: #6b7280;">LINE ID</td><td>${data.contactLine}</td></tr>` : ''}
    <tr><td style="color: #6b7280;">ช่องทางที่สะดวก</td><td>${preferredContactLabel} · ${preferredTimeLabel}</td></tr>

    <!-- Training Requirement -->
    <tr><td colspan="2" style="padding-top: 20px;"><strong>Training Requirement</strong></td></tr>
    <tr><td style="color: #6b7280;">หลักสูตรที่สนใจ</td><td>${coursesList}</td></tr>
    <tr><td style="color: #6b7280;">จำนวนผู้เข้าอบรม</td><td>${data.participantsCount} ท่าน · ${skillLevelLabel}</td></tr>
    <tr><td style="color: #6b7280;">วัตถุประสงค์</td><td>${data.objective || '—'}</td></tr>
    <tr><td style="color: #6b7280;">เนื้อหา</td><td>${contentModeLabel}${data.contentDetails ? `<br><span style="color:#6b7280;">${data.contentDetails}</span>` : ''}</td></tr>

    <!-- Schedule & Format -->
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ตารางเวลา & รูปแบบ</strong></td></tr>
    <tr><td style="color: #6b7280;">ช่วงเวลา</td><td>${scheduleLabel}${data.scheduleNote ? `<br><span style="color:#6b7280;">${data.scheduleNote}</span>` : ''}</td></tr>
    <tr><td style="color: #6b7280;">รูปแบบ</td><td>${trainingFormatLabel}</td></tr>
    ${data.trainingFormat === 'onsite' ? `
    <tr><td style="color: #6b7280;">สถานที่</td><td>${data.onsiteAddress || '—'}${data.onsiteDistrict ? `, ${data.onsiteDistrict}` : ''}${data.onsiteProvince ? `, ${data.onsiteProvince}` : ''}</td></tr>
    <tr><td style="color: #6b7280;">อุปกรณ์</td><td>${equipmentList}</td></tr>` : ''}
    ${data.trainingFormat === 'online' && (data.onlineRegion || data.onlineTimezone) ? `
    <tr><td style="color: #6b7280;">Online</td><td>${data.onlineRegion || ''}${data.onlineTimezone ? ` · ${data.onlineTimezone}` : ''}</td></tr>` : ''}

    <!-- Quotation -->
    <tr><td colspan="2" style="padding-top: 20px;"><strong>ข้อมูลใบเสนอราคา</strong></td></tr>
    <tr><td style="color: #6b7280;">ประเทศ</td><td>${countryLabel}</td></tr>
    ${data.quotationCompany ? `<tr><td style="color: #6b7280;">ชื่อบริษัท</td><td>${data.quotationCompany}</td></tr>` : ''}
    ${data.taxId ? `<tr><td style="color: #6b7280;">เลขผู้เสียภาษี</td><td>${data.taxId}</td></tr>` : ''}
    ${data.branch ? `<tr><td style="color: #6b7280;">สาขา</td><td>${data.branch}</td></tr>` : ''}
    ${quotationAddress ? `<tr><td style="color: #6b7280;">ที่อยู่</td><td>${quotationAddress}</td></tr>` : ''}

    ${data.message ? `<tr><td colspan="2" style="padding-top: 20px;"><strong>หมายเหตุเพิ่มเติม</strong></td></tr><tr><td colspan="2">${data.message}</td></tr>` : ''}
  </table>

  <div style="margin-top: 24px;">
    <a href="${adminDashboardUrl}" style="display: inline-block; background: #2486FF; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">ดูใน Admin Panel</a>
  </div>

  <p style="margin: 32px 0 0; font-size: 12px; color: #6b7280;">
    อีเมลนี้ส่งอัตโนมัติจากระบบ 9Expert Genesis Lab
  </p>
</body>
</html>`;

  const text = `In-house Request ใหม่ - ${referenceNumber}

ผู้ประสานงาน:
  บริษัท: ${data.companyName}
  ชื่อ: ${data.contactFirstName} ${data.contactLastName}${data.contactRole ? `\n  ตำแหน่ง: ${data.contactRole}${data.contactDepartment ? ` (${data.contactDepartment})` : ''}` : ''}
  Email: ${data.contactEmail}
  Phone: ${data.contactPhone}${data.contactLine ? `\n  LINE: ${data.contactLine}` : ''}
  ช่องทาง: ${preferredContactLabel} · ${preferredTimeLabel}

Training Requirement:
  หลักสูตร: ${coursesList}
  จำนวน: ${data.participantsCount} ท่าน · ${skillLevelLabel}
  วัตถุประสงค์: ${data.objective || '—'}
  เนื้อหา: ${contentModeLabel}${data.contentDetails ? `\n  รายละเอียด: ${data.contentDetails}` : ''}

ตารางเวลา & รูปแบบ:
  ช่วงเวลา: ${scheduleLabel}${data.scheduleNote ? ` (${data.scheduleNote})` : ''}
  รูปแบบ: ${trainingFormatLabel}${data.trainingFormat === 'onsite' ? `\n  สถานที่: ${data.onsiteAddress || '—'}\n  อุปกรณ์: ${equipmentList}` : ''}${data.trainingFormat === 'online' && (data.onlineRegion || data.onlineTimezone) ? `\n  Online: ${data.onlineRegion || ''}${data.onlineTimezone ? ` · ${data.onlineTimezone}` : ''}` : ''}

ใบเสนอราคา:
  ประเทศ: ${countryLabel}${data.quotationCompany ? `\n  บริษัท: ${data.quotationCompany}` : ''}${data.taxId ? `\n  เลขผู้เสียภาษี: ${data.taxId}` : ''}${data.branch ? `\n  สาขา: ${data.branch}` : ''}${quotationAddress ? `\n  ที่อยู่: ${quotationAddress}` : ''}

${data.message ? `หมายเหตุ: ${data.message}\n\n` : ''}ดูใน Admin: ${adminDashboardUrl}`;

  return { html, text };
}