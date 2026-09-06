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
 * ── IT STATES WHAT THE TEMPLATE STATES ────────────────────────────────────
 * The alias is unset today, so this is the mail customers actually receive. It
 * carries the SAME information as the Postmark template it stands in for — the
 * three-column course table (หลักสูตร / รอบอบรม / รูปแบบการอบรม) and the two
 * price rows, full price struck through above the package price, with no
 * percentage and no amount saved. A fallback that showed a different offer from
 * the template would make the mail depend on which path it took, which is the
 * one thing a fallback must never do.
 *
 * It carries NO COVER IMAGE, and that is the one deliberate difference: this
 * body is plain by design (see above), and an <img> is the part of the template
 * that is decoration rather than fact.
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
 * @param {string} p.notes
 */
export function bundleConfirmationEmail({
  referenceNumber,
  firstName = '',
  bundleName = '',
  courses = [],
  priceLabelNet = '',
  priceLabelList = '',
  notes = '',
}) {
  const rows = Array.isArray(courses) ? courses : [];
  const pkg = bundleName || 'แพ็กเกจอบรม';

  /**
   * THE SAME TWO ROWS THE TEMPLATE SHOWS, AND NO THIRD.
   *
   * Gated on the NET price alone and hidden entirely without it — the model's
   * `package_price` makes exactly the same call, because a list price with no
   * package price is a struck-through figure above an empty row.
   *
   * No percentage and no amount saved: the full price and the package price,
   * with the gap left to speak. This used to append "— ลด N%" and no longer
   * does, so the fallback and the template state the same offer.
   */
  const showPrice = Boolean(priceLabelNet);

  const text = [
    `สวัสดีคุณ ${firstName}`.trim(),
    '',
    `เราได้รับคำขอใบเสนอราคาสำหรับ “${pkg}” เรียบร้อยแล้ว`,
    `เลขอ้างอิง: ${referenceNumber}`,
    '',
    `หลักสูตรในแพ็กเกจ (${rows.length} หลักสูตร):`,
    ...rows.map(
      (c, i) => `  ${i + 1}. ${c.courseName} | รอบอบรม ${c.dates} | ${c.typeLabel}`,
    ),
    ...(showPrice
      ? [
          '',
          ...(priceLabelList ? [`ราคาปกติ: ${priceLabelList}`] : []),
          `ราคาแพ็กเกจ: ${priceLabelNet}`,
        ]
      : []),
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
    <thead>
      <tr>
        <th align="left" style="padding:6px 8px 6px 0;border-bottom:2px solid #cbd5e1;font-size:13px;color:#475569">หลักสูตร</th>
        <th align="left" style="padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:13px;color:#475569">รอบอบรม</th>
        <th align="left" style="padding:6px 0 6px 8px;border-bottom:2px solid #cbd5e1;font-size:13px;color:#475569">รูปแบบการอบรม</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((c) => `
      <tr>
        <td style="padding:8px 8px 8px 0;border-bottom:1px solid #e2e8f0;font-weight:700">${esc(c.courseName)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#475569">${esc(c.dates)}</td>
        <td style="padding:8px 0 8px 8px;border-bottom:1px solid #e2e8f0;color:#475569">${esc(c.typeLabel)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${showPrice ? `
  <table style="margin-top:20px;font-size:15px">
    <tbody>
      ${priceLabelList ? `
      <tr>
        <td style="padding:2px 12px 2px 0;color:#475569">ราคาปกติ</td>
        <td style="padding:2px 0;color:#475569"><s>${esc(priceLabelList)}</s></td>
      </tr>` : ''}
      <tr>
        <td style="padding:2px 12px 2px 0">ราคาแพ็กเกจ</td>
        <td style="padding:2px 0"><strong>${esc(priceLabelNet)}</strong></td>
      </tr>
    </tbody>
  </table>` : ''}
  ${notes ? `<p style="margin-top:16px;color:#475569">หมายเหตุของคุณ: ${esc(notes)}</p>` : ''}

  <p style="margin-top:24px;color:#475569;font-size:13px">
    ขั้นตอนนี้ยังไม่มีการชำระเงิน ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา
  </p>
  <p style="margin-top:24px">9Expert Training</p>
</div>`.trim();

  return { html, text };
}
