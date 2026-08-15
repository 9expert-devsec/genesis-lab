import { monthLongLabel } from '@/lib/schedule/monthWindow';

/**
 * Confirmation email sent to the prospect who submitted the In-house
 * training request. Returns { html, text }.
 */
export function inhouseUserConfirmationEmail({
  referenceNumber,
  contactFirstName,
  companyName,
  data,
  quotationAddress = '',
}) {
  // Same two labels as the Postmark model, and same reasoning: 'flexible' and
  // the scheduleMode branches cannot occur on a new submission, but a re-send
  // of a historical enquiry still reaches here, so the fallbacks stay as
  // fail-safes for old data rather than as live branches.
  // See src/lib/email/models/inhouseRegistrationModel.js.
  const trainingFormatLabel =
    data.trainingFormat === 'onsite'   ? 'Onsite' :
    data.trainingFormat === 'online'   ? 'Online' :
    'ยังไม่ระบุ — ทีมขายจะช่วยแนะนำ';

  // `preferredMonth` is the `YYYY-MM` VALUE of the form's month <select>
  // (InhouseForm.jsx:67-74 builds the options, :531 submits the value), not the
  // Thai label shown beside it — so this line used to put '2026-09' in front of
  // a customer who had just approved 'กันยายน 2569' on the review step.
  // Decoded through the same formatter the Postmark model uses.
  //
  // THE PREFIX STAYS HERE FOR NOW, unlike in the model — but ONE const cannot
  // actually serve both consumers, and that is a real defect this change does
  // NOT fix. Measured:
  //
  //   · the plain-text part renders it on a BARE LINE, and every sibling there
  //     is `label: value` (`เลขอ้างอิง:`, `จำนวนผู้เข้าอบรม:`,
  //     `รูปแบบการอบรม:`). It NEEDS the prefix.
  //   · the HTML part already prints a row heading `ช่วงเวลา` immediately
  //     above it, and every sibling row there is a heading over a BARE value.
  //     It renders `ช่วงเวลา` / `เดือนที่สนใจ: กันยายน 2569` — two labels
  //     stacked, and the only row in that block carrying its own.
  //
  // The correct answer is two values, not one compromise. Left as a follow-up
  // rather than restructured here: this file is the unset-alias fallback and
  // the round that touched it was scoped to the month FORMAT only.
  const scheduleLabel = `เดือนที่สนใจ: ${data.preferredMonth ? monthLongLabel(data.preferredMonth) : 'ตามที่ทีมขายแนะนำ'}`;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>ได้รับคำขอใบเสนอราคา In-house - 9Expert Training</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Sarabun', 'Arial', sans-serif; background: #f5f7fa; color: #0d1b2a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f7fa; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0D1B2A, #1d3047); padding: 32px 40px; color: #F8FAFD;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700;">9Expert Training</h1>
              <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">In-house Training Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px;">เรียนคุณ ${contactFirstName}</h2>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.7;">
                ขอบคุณสำหรับการส่งคำขอใบเสนอราคาอบรมแบบ In-house ของ <strong>${companyName}</strong>
                ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการพร้อมใบเสนอราคา
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafd; border-left: 4px solid #D4F73F; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">เลขอ้างอิง</p>
                    <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #2486FF;">${referenceNumber}</p>

                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">บริษัท / องค์กร</p>
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600;">${companyName}</p>

                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">จำนวนผู้เข้าอบรม (โดยประมาณ)</p>
                    <p style="margin: 0 0 12px; font-size: 14px;">${data.participantsCount} ท่าน</p>

                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">รูปแบบการอบรม</p>
                    <p style="margin: 0 0 12px; font-size: 14px;">${trainingFormatLabel}</p>

                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">ช่วงเวลา</p>
                    <p style="margin: 0; font-size: 14px;">${scheduleLabel}</p>
                  </td>
                </tr>
              </table>

              ${quotationAddress ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafd; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">ที่อยู่สำหรับออกใบเสนอราคา</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6;">${quotationAddress}</p>
                  </td>
                </tr>
              </table>` : ''}

              <h3 style="margin: 0 0 12px; font-size: 16px;">ขั้นตอนถัดไป</h3>
              <ol style="margin: 0 0 24px; padding-left: 20px; line-height: 1.8;">
                <li>ทีมขายจะติดต่อกลับเพื่อยืนยัน Requirement และนัดหมายปรึกษา</li>
                <li>จัดทำใบเสนอราคาและส่งให้ทางอีเมลภายใน 2-3 วันทำการ</li>
                <li>หากมีข้อสงสัย ติดต่อได้ที่ 02-219-4304 หรือ LINE: @9expert</li>
              </ol>

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

  const text = `เรียนคุณ ${contactFirstName}

ขอบคุณสำหรับการส่งคำขอใบเสนอราคาอบรมแบบ In-house ของ ${companyName}

เลขอ้างอิง: ${referenceNumber}
จำนวนผู้เข้าอบรม: ${data.participantsCount} ท่าน
รูปแบบการอบรม: ${trainingFormatLabel}
${scheduleLabel}
${quotationAddress ? `ที่อยู่สำหรับออกใบเสนอราคา: ${quotationAddress}` : ''}

ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการพร้อมใบเสนอราคา

หากมีข้อสงสัย:
โทร: 02-219-4304
LINE: @9expert

9EXPERT COMPANY LIMITED`;

  return { html, text };
}