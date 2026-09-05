/**
 * The hard-coded HTML for the bundle quotation confirmation — the FALLBACK when
 * POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE is unset, or when the template send fails.
 *
 * ── WHY A FALLBACK EXISTS AT ALL ──────────────────────────────────────────
 * The same asymmetric policy `sendPublicRegistrationEmails` states and
 * `decideSendPlan` decides: a blank alias in Vercel is someone saying "not
 * yet", and a mistyped one must not ship silence. This is now the ONLY mail a
 * bundle request produces, so a silent failure is a total one — the customer's
 * confirmation, the team's BCC notification and the trail all vanish together.
 *
 * ── DELIBERATELY PLAINER THAN THE COURSE FALLBACK ─────────────────────────
 * `registration-user.js` is an elaborate document because it has been the live
 * mail for a long time. This one is the fallback for a template that is meant
 * to take over immediately, so it states every fact the customer needs — the
 * reference, the package, every course and round, the price, and that no
 * payment has been taken — and spends nothing on ornament. A fallback that is
 * as expensive to maintain as the template is a second template.
 *
 * Text and HTML are built from ONE array of rows, so the two bodies cannot list
 * different courses. That is the whole failure a hand-written pair invites.
 *
 * PURE: no env, no db, no clock.
 */

/** Minimal HTML escaping for values that reach an attribute-free text node. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {object} p
 * @param {string} p.referenceNumber
 * @param {string} p.firstName
 * @param {string} p.bundleName
 * @param {Array<{courseName: string, dates: string, typeLabel: string}>} p.courses
 * @param {string} p.priceLabelNet   pre-formatted, or ''
 * @param {string} p.priceLabelList  pre-formatted, or ''
 * @param {number|null} p.discount   whole percent, or null
 * @param {string} p.notes
 */
export function bundleConfirmationEmail({
  referenceNumber,
  firstName = '',
  bundleName = '',
  courses = [],
  priceLabelNet = '',
  priceLabelList = '',
  discount = null,
  notes = '',
}) {
  const rows = Array.isArray(courses) ? courses : [];
  const pkg = bundleName || 'แพ็กเกจอบรม';

  const priceLine = priceLabelNet
    ? `ราคาแพ็กเกจ ${priceLabelNet}` +
      (priceLabelList ? ` (จากราคาปกติ ${priceLabelList}` +
        (discount != null && discount > 0 ? ` — ลด ${discount}%` : '') + ')' : '')
    : '';

  const text = [
    `สวัสดีคุณ ${firstName}`.trim(),
    '',
    `เราได้รับคำขอใบเสนอราคาสำหรับ “${pkg}” เรียบร้อยแล้ว`,
    `เลขอ้างอิง: ${referenceNumber}`,
    '',
    `หลักสูตรในแพ็กเกจ (${rows.length} หลักสูตร):`,
    ...rows.map((c, i) => `  ${i + 1}. ${c.courseName} — รอบอบรม ${c.dates} (${c.typeLabel})`),
    ...(priceLine ? ['', priceLine] : []),
    ...(notes ? ['', `หมายเหตุของคุณ: ${notes}`] : []),
    '',
    'ขั้นตอนนี้ยังไม่มีการชำระเงิน ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา',
    '',
    '9Expert Training',
  ].join('\n');

  const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.7">
  <p>สวัสดีคุณ ${esc(firstName)}</p>
  <p>เราได้รับคำขอใบเสนอราคาสำหรับ <strong>${esc(pkg)}</strong> เรียบร้อยแล้ว</p>
  <p>เลขอ้างอิง: <strong style="letter-spacing:.05em">${esc(referenceNumber)}</strong></p>

  <h3 style="margin:24px 0 8px;font-size:15px">หลักสูตรในแพ็กเกจ (${rows.length} หลักสูตร)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tbody>
      ${rows.map((c) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0">
          <div style="font-weight:700">${esc(c.courseName)}</div>
          <div style="color:#475569;font-size:13px">รอบอบรม ${esc(c.dates)} · ${esc(c.typeLabel)}</div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${priceLine ? `<p style="margin-top:20px;font-size:15px"><strong>${esc(priceLine)}</strong></p>` : ''}
  ${notes ? `<p style="margin-top:16px;color:#475569">หมายเหตุของคุณ: ${esc(notes)}</p>` : ''}

  <p style="margin-top:24px;color:#475569;font-size:13px">
    ขั้นตอนนี้ยังไม่มีการชำระเงิน ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา
  </p>
  <p style="margin-top:24px">9Expert Training</p>
</div>`.trim();

  return { html, text };
}
