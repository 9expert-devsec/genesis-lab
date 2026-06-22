import { sendEmail } from '@/lib/email/postmark';
import { formatTHB } from '@/lib/pricing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInvoiceAddress(invoice) {
  if (!invoice) return '';
  if ((invoice.country ?? 'TH') === 'TH') {
    const a = invoice.thaiAddress ?? {};
    return [a.addressLine, a.subDistrict, a.district, a.province, a.postalCode]
      .filter(Boolean).join(' ');
  }
  const a = invoice.internationalAddress ?? {};
  return [a.line1, a.line2, a.city, a.state, a.postalCode, a.country]
    .filter(Boolean).join(', ');
}

/** Prefer coordinator, fall back to attendee (old records). */
function resolveRecipient(doc) {
  const coord = doc.coordinator;
  if (coord?.email) {
    return { to: coord.email, firstName: coord.firstName ?? '', phone: coord.phone ?? '' };
  }
  const att = doc.attendee ?? {};
  return { to: att.email ?? '', firstName: att.firstName ?? '', phone: att.phone ?? '' };
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Shared HTML shell ─────────────────────────────────────────────────────────

function emailShell({ title, headerLabel, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;font-family:'Sarabun','Arial',sans-serif;background:#f5f7fa;color:#0d1b2a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#005CFF,#2486FF);padding:32px 40px;color:#fff;">
    <h1 style="margin:0;font-size:24px;font-weight:700;">9Expert Training</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:.9;">Universe of Learning Technology</p>
  </td></tr>
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 20px;font-size:20px;">${headerLabel}</h2>
    ${bodyHtml}
    <p style="margin:32px 0 0;font-size:14px;color:#6b7280;">
      9EXPERT COMPANY LIMITED<br>
      318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B ซอยวรฤทธิ์ ถนนพญาไท เขตราชเทวี กรุงเทพฯ 10400
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function infoBlock(borderColor, rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafd;border-left:4px solid ${borderColor};padding:20px;border-radius:4px;margin-bottom:24px;">
  <tr><td>${rows.map(([label, value]) =>
    `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${label}</p>
     <p style="margin:0 0 14px;font-size:14px;font-weight:600;">${value}</p>`
  ).join('')}</td></tr></table>`;
}

function pricingBlock(pricePerSeat, seats, subtotal, vatAmount, total) {
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #e2e8f0;border-radius:4px;margin-bottom:24px;font-size:14px;">
  <tr><td style="padding:12px 16px;color:#6b7280;">ราคาต่อท่าน</td>
      <td style="padding:12px 16px;text-align:right;">${formatTHB(pricePerSeat)} บาท</td></tr>
  <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e2e8f0;">ราคา × ${seats} ท่าน</td>
      <td style="padding:12px 16px;text-align:right;border-top:1px solid #e2e8f0;">${formatTHB(subtotal)} บาท</td></tr>
  <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e2e8f0;">VAT 7%</td>
      <td style="padding:12px 16px;text-align:right;border-top:1px solid #e2e8f0;">${formatTHB(vatAmount)} บาท</td></tr>
  <tr style="background:#f8fafd;">
    <td style="padding:14px 16px;font-weight:700;border-top:2px solid #e2e8f0;">ยอดชำระสุทธิ</td>
    <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:18px;color:#005CFF;border-top:2px solid #e2e8f0;">${formatTHB(total)} บาท</td>
  </tr>
</table>`;
}

function invoiceBlock(invoice, invoiceAddress) {
  if (!invoice) return '';
  const invoiceNameLine = invoice.type === 'corporate'
    ? invoice.companyName || ''
    : `${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim();
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafd;border-left:4px solid #D4F73F;padding:20px;border-radius:4px;margin-bottom:24px;">
  <tr><td>
    <p style="margin:0 0 12px;font-size:14px;font-weight:700;">ข้อมูลสำหรับออกใบกำกับภาษี</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${invoice.type === 'corporate' ? 'ชื่อบริษัท' : 'ชื่อ-นามสกุล'}</p>
    <p style="margin:0 0 10px;font-size:14px;">${invoiceNameLine}</p>
    ${invoice.taxId ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">เลขประจำตัวผู้เสียภาษี</p><p style="margin:0 0 10px;font-size:14px;">${invoice.taxId}</p>` : ''}
    ${invoiceAddress ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">ที่อยู่</p><p style="margin:0;font-size:14px;line-height:1.6;">${invoiceAddress}</p>` : ''}
  </td></tr></table>`;
}

function attendeesBlock(attendees, attendeesCount, coordinatorIsAttending) {
  if (!attendees || attendees.length === 0) return '';
  return `<p style="margin:0 0 10px;font-size:14px;font-weight:700;">รายชื่อผู้เข้าอบรม (${attendeesCount} ท่าน)</p>
  <table width="100%" cellpadding="6" cellspacing="0"
    style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
  <thead><tr style="background:#f1f5f9;">
    <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">#</th>
    <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">ชื่อ-นามสกุล</th>
    <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">อีเมล</th>
    <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">เบอร์โทร</th>
  </tr></thead>
  <tbody>${attendees.map((a, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafd'};">
      <td style="padding:8px;border:1px solid #e2e8f0;">${i + 1}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;">${a.firstName} ${a.lastName}${i === 0 && coordinatorIsAttending ? ' <span style="color:#6b7280;font-size:11px;">(ผู้ประสานงาน)</span>' : ''}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;">${a.email}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;">${a.phone}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

// ── Paid receipt ──────────────────────────────────────────────────────────────

/**
 * Idempotently send the paid-receipt email for a Masterclass registration.
 * Guards on `payment.receiptSentAt` to prevent double-send.
 */
export async function sendMasterclassReceipt(doc) {
  console.log('[mc-receipt] sendMasterclassReceipt called | docId:', doc?._id, '| receiptSentAt:', doc?.payment?.receiptSentAt ?? null);
  if (!doc || doc.payment?.receiptSentAt) {
    console.log('[mc-receipt] SKIPPED — already sent or no doc');
    return { skipped: true };
  }

  const recipient = resolveRecipient(doc);
  console.log('[mc-receipt] Recipient resolved | to:', recipient.to ?? 'NONE', '| firstName:', recipient.firstName);
  if (!recipient.to) {
    console.error('[mc-receipt] ❌ SKIPPED — no recipient email on doc:', String(doc._id));
    return { skipped: true, reason: 'no_email' };
  }

  const refNo        = String(doc._id).slice(-8).toUpperCase();
  const method       = doc.payment?.method === 'credit_card' ? 'บัตรเครดิต/เดบิต' : 'QR PromptPay';
  const subject      = `[9Expert Masterclass] ยืนยันการชำระเงิน ${refNo} — ${doc.course_title}`;
  const pricePerSeat = doc.pricing?.pricePerSeat ?? 0;
  const seats        = doc.pricing?.seats ?? doc.attendeesCount ?? 1;
  const subtotal     = doc.pricing?.subtotal ?? 0;
  const vatAmount    = doc.pricing?.vatAmount ?? 0;
  const total        = doc.pricing?.total ?? 0;
  const invoiceAddr  = buildInvoiceAddress(doc.invoice);
  const showInvoice  = Boolean(doc.request_invoice && doc.invoice);
  const attList      = doc.attendees ?? [];
  const showAtt      = Boolean(doc.attendeesListProvided) && attList.length > 0;
  const coordIsAtt   = Boolean(doc.coordinator?.isAttending);

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">เรียนคุณ ${recipient.firstName} ขอบคุณสำหรับการชำระเงิน เราได้รับการชำระเงินของคุณเรียบร้อยแล้ว</p>
    ${infoBlock('#10b981', [
      ['เลขอ้างอิง', `<span style="font-size:18px;color:#005CFF;">${refNo}</span>`],
      ['วิธีชำระเงิน', method],
      ['วันที่ชำระ', fmtDate(doc.payment?.paidAt)],
    ])}
    ${infoBlock('#2486FF', [
      ['หลักสูตร', doc.course_title],
      ['รุ่น', doc.batch_label],
      ['วันที่อบรม', doc.batch_date_label || 'ตามรอบที่เลือก'],
      ...(doc.venue_name ? [['สถานที่', doc.venue_name]] : []),
    ])}
    ${pricingBlock(pricePerSeat, seats, subtotal, vatAmount, total)}
    ${showInvoice ? invoiceBlock(doc.invoice, invoiceAddr) + '<p style="margin:0 0 24px;font-size:13px;color:#6b7280;">* อีเมลฉบับนี้เป็นใบเสร็จรับเงินอย่างย่อ ทีมงานจะจัดส่งใบกำกับภาษีฉบับเต็มภายหลัง</p>' : ''}
    ${showAtt ? attendeesBlock(attList, doc.attendeesCount ?? 1, coordIsAtt) : doc.attendeesListProvided === false ? '<p style="font-size:13px;color:#6b7280;font-style:italic;">* รายชื่อผู้เข้าอบรมจะแจ้งภายหลัง</p>' : ''}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;">ทีมงานจะติดต่อกลับเพื่อแจ้งรายละเอียดห้องเรียนและเอกสารประกอบการอบรม<br>หากมีข้อสงสัย ติดต่อได้ที่ 02-219-4304 หรือ LINE: @9expert</p>`;

  const text = `ชำระเงินสำเร็จ — Masterclass

เรียนคุณ ${recipient.firstName}

เลขอ้างอิง: ${refNo}
วิธีชำระเงิน: ${method}
หลักสูตร: ${doc.course_title}
รุ่น: ${doc.batch_label}
วันที่อบรม: ${doc.batch_date_label || 'ตามรอบที่เลือก'}
${doc.venue_name ? `สถานที่: ${doc.venue_name}\n` : ''}
ราคา × ${seats} ท่าน: ${formatTHB(subtotal)} บาท
VAT 7%: ${formatTHB(vatAmount)} บาท
ยอดชำระสุทธิ: ${formatTHB(total)} บาท
${showAtt ? `\nรายชื่อผู้เข้าอบรม:\n${attList.map((a, i) => `  ${i + 1}. ${a.firstName} ${a.lastName} | ${a.email}`).join('\n')}` : ''}

หากมีข้อสงสัย: โทร 02-219-4304 | LINE: @9expert`;

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;
  const html = emailShell({ title: 'ชำระเงินสำเร็จ - 9Expert Training', headerLabel: 'ชำระเงินสำเร็จ — Masterclass', bodyHtml });

  await Promise.allSettled([
    sendEmail({ to: recipient.to, subject, html, text }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ชำระแล้ว] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nวิธี: ${method}\nยอด: ${formatTHB(total)} บาท\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}`,
        })
      : Promise.resolve(),
  ]);

  console.log('[mc-receipt] ✅ sendMasterclassReceipt complete | receiptSentAt set | docId:', String(doc._id));
  await doc.constructor.findByIdAndUpdate(doc._id, {
    $set: { 'payment.receiptSentAt': new Date() },
  });
  return { ok: true };
}

// ── Quote confirmation email ──────────────────────────────────────────────────

/**
 * Send a quote-request confirmation immediately after registration.
 * No payment at this point — customer receives "เราได้รับคำขอแล้ว" message.
 */
export async function sendMasterclassQuoteConfirmation(doc, referenceNumber) {
  const recipient = resolveRecipient(doc);
  if (!recipient.to) return { skipped: true, reason: 'no_email' };

  const refNo          = referenceNumber ?? String(doc._id).slice(-8).toUpperCase();
  const subject        = `[9Expert Masterclass] ได้รับคำขอใบเสนอราคา ${refNo} — ${doc.course_title}`;
  const total          = doc.pricing?.total ?? 0;
  const attendeesCount = doc.attendeesCount ?? 1;
  const attList        = doc.attendees ?? [];
  const showAtt        = Boolean(doc.attendeesListProvided) && attList.length > 0;
  const invoiceAddr    = buildInvoiceAddress(doc.invoice);
  const showInvoice    = Boolean(doc.request_invoice && doc.invoice);

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">
      เรียนคุณ ${recipient.firstName} เราได้รับคำขอใบเสนอราคาของคุณเรียบร้อยแล้ว
      ทีมงานจะจัดส่งใบเสนอราคาไปทางอีเมลนี้ภายใน 1 วันทำการ
    </p>
    ${infoBlock('#2486FF', [
      ['เลขอ้างอิงคำขอ', `<span style="font-size:18px;color:#005CFF;">${refNo}</span>`],
      ['หลักสูตร', doc.course_title],
      ['รุ่น', doc.batch_label],
      ['วันที่อบรม', doc.batch_date_label || 'ตามรอบที่เลือก'],
      ...(doc.venue_name ? [['สถานที่', doc.venue_name]] : []),
    ])}
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e2e8f0;border-radius:4px;margin-bottom:24px;font-size:14px;">
      <tr><td style="padding:12px 16px;color:#6b7280;">จำนวนผู้เข้าอบรม</td>
          <td style="padding:12px 16px;text-align:right;font-weight:600;">${attendeesCount} ท่าน</td></tr>
      <tr style="background:#f8fafd;">
        <td style="padding:14px 16px;font-weight:700;border-top:2px solid #e2e8f0;">ยอดประมาณการ (รวม VAT 7%)</td>
        <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:18px;color:#005CFF;border-top:2px solid #e2e8f0;">${formatTHB(total)} บาท</td>
      </tr>
    </table>
    ${showInvoice ? invoiceBlock(doc.invoice, invoiceAddr) : ''}
    ${showAtt ? `
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;">รายชื่อผู้เข้าอบรม (${attendeesCount} ท่าน)</p>
      <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">#</th>
          <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">ชื่อ-นามสกุล</th>
          <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">อีเมล</th>
        </tr></thead>
        <tbody>${attList.map((a, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafd'};">
            <td style="padding:8px;border:1px solid #e2e8f0;">${i + 1}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${a.firstName} ${a.lastName}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${a.email}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : doc.attendeesListProvided === false ? '<p style="font-size:13px;color:#6b7280;font-style:italic;">* จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง</p>' : ''}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;">หากมีข้อสงสัย ติดต่อได้ที่ 02-219-4304 หรือ LINE: @9expert</p>`;

  const text = `ได้รับคำขอใบเสนอราคาแล้ว

เรียนคุณ ${recipient.firstName}
ทีมงานจะส่งใบเสนอราคาภายใน 1 วันทำการ

เลขอ้างอิงคำขอ: ${refNo}
หลักสูตร: ${doc.course_title}
รุ่น: ${doc.batch_label}
วันที่อบรม: ${doc.batch_date_label || 'ตามรอบที่เลือก'}
จำนวนผู้เข้าอบรม: ${attendeesCount} ท่าน
ยอดประมาณการ: ${formatTHB(total)} บาท
${showAtt ? `\nรายชื่อผู้เข้าอบรม:\n${attList.map((a, i) => `  ${i + 1}. ${a.firstName} ${a.lastName} | ${a.email}`).join('\n')}` : ''}

หากมีข้อสงสัย: โทร 02-219-4304 | LINE: @9expert`;

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;
  const html = emailShell({ title: 'คำขอใบเสนอราคา - 9Expert Training', headerLabel: 'ได้รับคำขอใบเสนอราคาแล้ว', bodyHtml });

  await Promise.allSettled([
    sendEmail({ to: recipient.to, subject, html, text }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ขอใบเสนอราคา] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}\nจำนวน: ${attendeesCount} ท่าน\nยอด: ${formatTHB(total)} บาท`,
        })
      : Promise.resolve(),
  ]);

  return { ok: true };
}
