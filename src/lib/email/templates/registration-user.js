/**
 * Email to the user confirming their registration was received.
 * Returns { html, text } — the caller decides which to send.
 */
export function userConfirmationEmail({
  referenceNumber,
  firstName,
  courseName,
  classDate,
}) {
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>ยืนยันการสมัครอบรม - 9Expert Training</title>
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
              <h2 style="margin: 0 0 16px; font-size: 20px;">เรียนคุณ ${firstName}</h2>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.7;">
                ขอบคุณสำหรับการสมัครเข้าร่วมการอบรมกับ 9Expert Training เราได้รับข้อมูลของคุณเรียบร้อยแล้ว
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafd; border-left: 4px solid #2486FF; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">เลขอ้างอิง</p>
                    <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #005CFF;">${referenceNumber}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">หลักสูตร</p>
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">${courseName}</p>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">วันที่อบรม</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">${classDate || 'ตามรอบที่เลือก'}</p>
                  </td>
                </tr>
              </table>
              <h3 style="margin: 0 0 12px; font-size: 16px;">ขั้นตอนถัดไป</h3>
              <ol style="margin: 0 0 24px; padding-left: 20px; line-height: 1.8;">
                <li>ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการเพื่อยืนยันและแจ้งรายละเอียดการชำระเงิน</li>
                <li>เมื่อได้รับการยืนยันและชำระเงินแล้ว จะได้รับอีเมลพร้อมข้อมูลห้องเรียนและเอกสารประกอบ</li>
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

  const text = `เรียนคุณ ${firstName}

ขอบคุณสำหรับการสมัครเข้าร่วมการอบรมกับ 9Expert Training

เลขอ้างอิง: ${referenceNumber}
หลักสูตร: ${courseName}
วันที่อบรม: ${classDate || 'ตามรอบที่เลือก'}

ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการเพื่อยืนยันการสมัครและแจ้งรายละเอียดการชำระเงิน

หากมีข้อสงสัย:
โทร: 02-219-4304
LINE: @9expert

9EXPERT COMPANY LIMITED`;

  return { html, text };
}
