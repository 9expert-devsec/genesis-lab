import { formatTHB } from '@/lib/pricing';
import { formatSiteDateTime } from '@/lib/articlePublishTime';

/**
 * Paid-receipt email — sent once a card / PromptPay charge succeeds.
 * Serves BOTH payment methods; only the "วิธีชำระเงิน" line swaps.
 *
 * This is a short payment receipt (ใบเสร็จรับเงินอย่างย่อ), NOT a formal
 * tax invoice (ใบกำกับภาษี). When the customer requested documents, the
 * team issues the proper tax invoice separately.
 *
 * Returns { html, text } — the caller decides which to send.
 */

/**
 * `31 กรกฎาคม 2569 เวลา 03:15 น.` — pinned to Asia/Bangkok.
 *
 * ── THE BUG THIS REPLACES ───────────────────────────────────────────────────
 * This function used to read `d.getHours()`, `d.getMonth()`, `d.getDate()` and
 * `d.getFullYear()`, i.e. the RUNTIME's timezone. Nothing in this repo sets TZ,
 * so on Vercel that is UTC and every receipt has told Thai customers a time
 * SEVEN HOURS EARLY — a 09:00 payment printed as 02:00, and anything paid
 * before 07:00 local printed the PREVIOUS DAY's date on a receipt for money
 * that had already been taken.
 *
 * Same defect, same shape and the same fix as the article `publishedAt`
 * incident: stop asking the runtime. `formatSiteDateTime` pins `timeZone` to
 * Asia/Bangkok and cannot be talked out of it by a caller — see
 * src/lib/articlePublishTime.js.
 *
 * The Buddhist-era year is not manual arithmetic any more either: the `th-TH`
 * locale uses the Buddhist calendar natively, so `2026` renders as `2569`
 * without a `+ 543` that would double-count if the locale ever changed.
 *
 * Two calls rather than one because the shape is `<date> เวลา <time> น.` and
 * there is no single Intl pattern that emits the Thai word between them.
 */
function fmtPaidAt(value) {
  const date = formatSiteDateTime(value, { day: 'numeric', month: 'long', year: 'numeric' });
  if (!date) return '—';
  const time = formatSiteDateTime(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${date} เวลา ${time} น.`;
}

export function paidReceiptEmail({
  referenceNumber,
  firstName,
  courseName,
  classDate,
  attendanceMode,
  scheduleType,
  attendees = [],
  attendeesListProvided = false,
  coordinatorIsAttending = false,
  attendeesCount = 1,
  invoice = null,
  invoiceCountry = 'TH',
  invoiceAddress = '',
  requestInvoice = false,
  pricing = null,
  method = 'credit_card',
  paidAt = null,
}) {
  const modeLabel =
    attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom';
  const showMode = scheduleType === 'hybrid';

  const methodLabel = method === 'credit_card' ? 'บัตรเครดิต/เดบิต' : 'QR PromptPay';
  const paidAtLabel = fmtPaidAt(paidAt);

  // ── Pricing snapshot (frozen at checkout) ────────────────────────
  const pricePerSeat = pricing?.pricePerSeat ?? 0;
  const seats = pricing?.seats ?? attendeesCount;
  const subtotal = pricing?.subtotal ?? 0;
  const vatAmount = pricing?.vatAmount ?? 0;
  const total = pricing?.total ?? 0;

  // ── Invoice display helpers ──────────────────────────────────────
  const showInvoice = requestInvoice && invoice;

  // ── Attendees display helpers ────────────────────────────────────
  const showAttendees = attendeesListProvided && attendees.length > 0;

  const attendeesHtml = showAttendees ? `
              <!-- Attendees block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #0d1b2a;">
                      รายชื่อผู้เข้าอบรม (${attendeesCount} ท่าน)
                    </p>
                    <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                      <thead>
                        <tr style="background: #f1f5f9;">
                          <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0; width: 40px;">#</th>
                          <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">ชื่อ-นามสกุล</th>
                          <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">อีเมล</th>
                          <th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">เบอร์โทร</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${attendees.map((a, i) => `
                        <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafd'};">
                          <td style="padding: 8px; border: 1px solid #e2e8f0; color: #6b7280;">${i + 1}</td>
                          <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: ${i === 0 && coordinatorIsAttending ? '600' : '400'};">
                            ${a.firstName} ${a.lastName}${i === 0 && coordinatorIsAttending ? ' <span style="color:#6b7280;font-size:11px;">(ผู้ประสานงาน)</span>' : ''}
                          </td>
                          <td style="padding: 8px; border: 1px solid #e2e8f0;">${a.email}</td>
                          <td style="padding: 8px; border: 1px solid #e2e8f0;">${a.phone}</td>
                        </tr>`).join('')}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>` : attendeesListProvided === false ? `
              <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; font-style: italic;">
                * รายชื่อผู้เข้าอบรมจะแจ้งภายหลัง ทีมงานจะติดต่อเพื่อเก็บข้อมูล
              </p>` : '';

  const invoiceNameLine =
    invoice?.type === 'corporate'
      ? invoice.companyName || ''
      : `${invoice?.firstName ?? ''} ${invoice?.lastName ?? ''}`.trim();

  const invoiceTypeThai =
    invoice?.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป';

  const invoiceCountryLabel = invoiceCountry === 'TH' ? 'ไทย' : 'ต่างประเทศ';

  // ── HTML ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>ชำระเงินสำเร็จ - 9Expert Training</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Sarabun', 'Arial', sans-serif; background: #f5f7fa; color: #0d1b2a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f7fa; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #005CFF, #2486FF); padding: 32px 40px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700;">9Expert Training</h1>
              <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Universe of Learning Technology</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #0d1b2a;">ชำระเงินสำเร็จ</h2>
              <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">ใบเสร็จรับเงิน (อย่างย่อ)</p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.7;">
                เรียนคุณ ${firstName} ขอบคุณสำหรับการชำระเงิน เราได้รับการชำระเงินของคุณเรียบร้อยแล้ว
              </p>

              <!-- Payment block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">เลขอ้างอิง</p>
                    <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #005CFF;">${referenceNumber}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">วิธีชำระเงิน</p>
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">${methodLabel}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">วันที่ชำระ</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 600;">${paidAtLabel}</p>
                  </td>
                </tr>
              </table>

              <!-- Course summary block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafd; border-left: 4px solid #2486FF; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">หลักสูตร</p>
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">${courseName}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">วันที่อบรม</p>
                    <p style="margin: ${showMode ? '0 0 8px' : '0'}; font-size: 16px; font-weight: 600;">${classDate || 'ตามรอบที่เลือก'}</p>
                    ${showMode ? `
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">รูปแบบการอบรม</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 600;">${modeLabel}</p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Amount block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 24px; font-size: 14px;">
                <tr>
                  <td style="padding: 12px 16px; color: #6b7280;">ราคาต่อท่าน</td>
                  <td style="padding: 12px 16px; text-align: right;">${formatTHB(pricePerSeat)} บาท</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #6b7280; border-top: 1px solid #e2e8f0;">ราคา × ${seats} ท่าน</td>
                  <td style="padding: 12px 16px; text-align: right; border-top: 1px solid #e2e8f0;">${formatTHB(subtotal)} บาท</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #6b7280; border-top: 1px solid #e2e8f0;">VAT 7%</td>
                  <td style="padding: 12px 16px; text-align: right; border-top: 1px solid #e2e8f0;">${formatTHB(vatAmount)} บาท</td>
                </tr>
                <tr style="background: #f8fafd;">
                  <td style="padding: 14px 16px; font-weight: 700; color: #0d1b2a; border-top: 2px solid #e2e8f0;">ยอดชำระสุทธิ</td>
                  <td style="padding: 14px 16px; text-align: right; font-weight: 700; font-size: 18px; color: #005CFF; border-top: 2px solid #e2e8f0;">${formatTHB(total)} บาท</td>
                </tr>
              </table>

              ${showInvoice ? `
              <!-- Invoice summary block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafd; border-left: 4px solid #D4F73F; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #0d1b2a;">ข้อมูลสำหรับออกใบกำกับภาษี</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">ประเภท</p>
                    <p style="margin: 0 0 10px; font-size: 14px;">${invoiceTypeThai} · ${invoiceCountryLabel}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">${invoice?.type === 'corporate' ? 'ชื่อบริษัท' : 'ชื่อ-นามสกุล'}</p>
                    <p style="margin: 0 0 10px; font-size: 14px;">${invoiceNameLine}</p>
                    ${invoice?.branch ? `<p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">สาขา</p><p style="margin: 0 0 10px; font-size: 14px;">${invoice.branch}</p>` : ''}
                    ${invoice?.taxId ? `<p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">เลขประจำตัวผู้เสียภาษี</p><p style="margin: 0 0 10px; font-size: 14px;">${invoice.taxId}</p>` : ''}
                    ${invoiceAddress ? `<p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">ที่อยู่</p><p style="margin: 0; font-size: 14px; line-height: 1.6;">${invoiceAddress}</p>` : ''}
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280;">
                * อีเมลฉบับนี้เป็นใบเสร็จรับเงินอย่างย่อ ทีมงานจะจัดส่งใบกำกับภาษีฉบับเต็มให้ทางอีเมลภายหลัง
              </p>` : ''}

              ${attendeesHtml}

              <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.7; color: #0d1b2a;">
                ทีมงานจะติดต่อกลับเพื่อแจ้งรายละเอียดห้องเรียนและเอกสารประกอบการอบรม
                หากมีข้อสงสัย ติดต่อได้ที่ 02-219-4304 หรือ LINE: @9expert
              </p>

              <p style="margin: 32px 0 0; font-size: 14px; color: #6b7280;">
                9EXPERT COMPANY LIMITED<br>
                318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B<br>
                ซอยวรฤทธิ์ ถนนพญาไท เขตราชเทวี กรุงเทพฯ 10400
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Plain text ────────────────────────────────────────────────────
  const text = `ชำระเงินสำเร็จ — ใบเสร็จรับเงิน (อย่างย่อ)

เรียนคุณ ${firstName} ขอบคุณสำหรับการชำระเงิน

เลขอ้างอิง: ${referenceNumber}
วิธีชำระเงิน: ${methodLabel}
วันที่ชำระ: ${paidAtLabel}

หลักสูตร: ${courseName}
วันที่อบรม: ${classDate || 'ตามรอบที่เลือก'}${showMode ? `\nรูปแบบการอบรม: ${modeLabel}` : ''}

สรุปยอดชำระ:
  ราคาต่อท่าน: ${formatTHB(pricePerSeat)} บาท
  ราคา × ${seats} ท่าน: ${formatTHB(subtotal)} บาท
  VAT 7%: ${formatTHB(vatAmount)} บาท
  ยอดชำระสุทธิ: ${formatTHB(total)} บาท
${showInvoice ? `
ข้อมูลออกใบกำกับภาษี:
  ประเภท: ${invoiceTypeThai} · ${invoiceCountryLabel}
  ${invoice?.type === 'corporate' ? 'ชื่อบริษัท' : 'ชื่อ-นามสกุล'}: ${invoiceNameLine}${invoice?.branch ? `\n  สาขา: ${invoice.branch}` : ''}${invoice?.taxId ? `\n  เลขผู้เสียภาษี: ${invoice.taxId}` : ''}${invoiceAddress ? `\n  ที่อยู่: ${invoiceAddress}` : ''}
  * อีเมลฉบับนี้เป็นใบเสร็จอย่างย่อ ใบกำกับภาษีฉบับเต็มจะจัดส่งภายหลัง
` : ''}${showAttendees ? `
รายชื่อผู้เข้าอบรม (${attendeesCount} ท่าน):
${attendees.map((a, i) => `  ${i + 1}. ${a.firstName} ${a.lastName} | ${a.email} | ${a.phone}${i === 0 && coordinatorIsAttending ? ' (ผู้ประสานงาน)' : ''}`).join('\n')}
` : !attendeesListProvided ? '\n* รายชื่อผู้เข้าอบรมจะแจ้งภายหลัง\n' : ''}
หากมีข้อสงสัย:
โทร: 02-219-4304
LINE: @9expert

9EXPERT COMPANY LIMITED`;

  return { html, text };
}
