/**
 * Postmark Template Variables — Registration Public
 *
 * This file serves two purposes:
 * 1. Documents all variables available in Postmark email templates
 * 2. Exports buildPostmarkPayload() to convert registration data → flat Postmark vars
 *
 * Usage (when switching to Postmark templates):
 *   1. Set POSTMARK_TEMPLATE_ID_USER and POSTMARK_TEMPLATE_ID_ADMIN in .env.local
 *   2. In route.js, replace sendEmail({html, text}) with sendTemplateEmail({templateId, variables})
 *   3. In Postmark dashboard, use {{variable_name}} syntax in your template
 *
 * Variable naming: snake_case, prefixed by section
 *   - ref_*          reference/course info
 *   - coord_*        coordinator fields
 *   - attendee_*     attendee list (Postmark supports array iteration)
 *   - invoice_*      invoice fields
 *   - meta_*         system/admin fields
 */

// ── Sample values (for Postmark template preview) ─────────────────

export const POSTMARK_VARIABLE_SAMPLES = {
  // Reference
  ref_number:           'A1B2C3D4',
  ref_course_name:      'Microsoft Excel Advanced',
  ref_course_code:      'EXCEL-ADV',
  ref_class_date:       '18-19 พ.ค. 2569',
  ref_schedule_type:    'hybrid',          // classroom | hybrid | online
  ref_attendance_mode:  'Classroom',       // 'Classroom' | 'Online via Microsoft Teams'
  ref_show_mode:        true,              // true when schedule_type = hybrid

  // Coordinator
  coord_first_name:     'พิรัศมิ์',
  coord_last_name:      'สังข์สุวรรณ',
  coord_full_name:      'พิรัศมิ์ สังข์สุวรรณ',
  coord_email:          'pirasak@9expert.co.th',
  coord_phone:          '0889432707',
  coord_is_attending:   true,

  // Attendees count
  attendees_count:      2,
  attendees_provided:   true,             // false = will notify later

  // Attendees list (array — Postmark iterates with {{#each attendees}})
  attendees: [
    {
      number:           1,
      first_name:       'พิรัศมิ์',
      last_name:        'สังข์สุวรรณ',
      full_name:        'พิรัศมิ์ สังข์สุวรรณ',
      email:            'pirasak@9expert.co.th',
      phone:            '0889432707',
      is_coordinator:   true,
    },
    {
      number:           2,
      first_name:       'ทดสอบ',
      last_name:        'ระบบ',
      full_name:        'ทดสอบ ระบบ',
      email:            'test@example.com',
      phone:            '0812345678',
      is_coordinator:   false,
    },
  ],

  // Invoice
  invoice_requested:    true,
  invoice_type:         'individual',     // individual | corporate
  invoice_type_label:   'บุคคลทั่วไป',   // บุคคลทั่วไป | นิติบุคคล / บริษัท
  invoice_country:      'TH',            // TH | OTHER
  invoice_country_label:'ไทย',           // ไทย | ต่างประเทศ
  invoice_name:         'พิรัศมิ์ สังข์สุวรรณ', // full name or company name
  invoice_company:      '',              // company name (corporate only)
  invoice_branch:       '',              // branch (corporate only, optional)
  invoice_tax_id:       '1234567894213',
  invoice_address:      '254/271 สนามชัย เมืองสุพรรณบุรี สุพรรณบุรี 72000',

  // Meta (admin template only)
  meta_admin_url:       'https://genesis-lab.9expert.app/admin/registrations/abc123',
  meta_notes:           'หมายเหตุจากผู้สมัคร',
  meta_source:          'web',
};

// ── buildPostmarkPayload ───────────────────────────────────────────

/**
 * Converts a registration doc (or the route.js data object) into a flat
 * variable map for Postmark's TemplateModel.
 *
 * @param {object} params
 * @param {string} params.referenceNumber
 * @param {object} params.data   - parsed registration data from publicRegistrationSchema
 * @param {object[]} params.attendees - resolved attendees array (coordinator prepended if attending)
 * @param {string} params.invoiceCountry  - 'TH' | 'OTHER'
 * @param {string} params.invoiceAddress  - pre-computed address string
 * @param {string} [params.adminDashboardUrl]
 */
export function buildPostmarkPayload({
  referenceNumber,
  data,
  attendees = [],
  invoiceCountry = 'TH',
  invoiceAddress = '',
  adminDashboardUrl = '',
}) {
  const modeLabel =
    data.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom';

  const invoiceNameLine =
    data.invoice?.type === 'corporate'
      ? data.invoice?.companyName || ''
      : `${data.invoice?.firstName ?? ''} ${data.invoice?.lastName ?? ''}`.trim();

  return {
    // Reference
    ref_number:           referenceNumber,
    ref_course_name:      data.courseName || data.courseId,
    ref_course_code:      data.courseCode || data.courseId,
    ref_class_date:       data.classDate || '',
    ref_schedule_type:    data.scheduleType || 'classroom',
    ref_attendance_mode:  modeLabel,
    ref_show_mode:        data.scheduleType === 'hybrid',

    // Coordinator
    coord_first_name:     data.coordinator.firstName,
    coord_last_name:      data.coordinator.lastName,
    coord_full_name:      `${data.coordinator.firstName} ${data.coordinator.lastName}`.trim(),
    coord_email:          data.coordinator.email,
    coord_phone:          data.coordinator.phone,
    coord_is_attending:   Boolean(data.coordinator.isAttending),

    // Attendees
    attendees_count:      data.attendeesCount,
    attendees_provided:   Boolean(data.attendeesListProvided),
    attendees: attendees.map((a, i) => ({
      number:         i + 1,
      first_name:     a.firstName,
      last_name:      a.lastName,
      full_name:      `${a.firstName} ${a.lastName}`.trim(),
      email:          a.email,
      phone:          a.phone,
      is_coordinator: i === 0 && Boolean(data.coordinator.isAttending),
    })),

    // Invoice
    invoice_requested:    Boolean(data.requestInvoice),
    invoice_type:         data.invoice?.type || '',
    invoice_type_label:   data.invoice?.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป',
    invoice_country:      invoiceCountry,
    invoice_country_label: invoiceCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย',
    invoice_name:         invoiceNameLine,
    invoice_company:      data.invoice?.companyName || '',
    invoice_branch:       data.invoice?.branch || '',
    invoice_tax_id:       data.invoice?.taxId || '',
    invoice_address:      invoiceAddress,

    // Meta
    meta_admin_url:       adminDashboardUrl,
    meta_notes:           data.notes || '',
    meta_source:          'web',
  };
}

// ── How to switch to Postmark templates ───────────────────────────
//
// 1. Add to .env.local:
//    POSTMARK_TEMPLATE_ID_USER=12345
//    POSTMARK_TEMPLATE_ID_ADMIN=12346
//
// 2. Add sendTemplateEmail() to src/lib/email/postmark.js:
//
//    export async function sendTemplateEmail({ to, bcc, templateId, variables }) {
//      const response = await fetch('https://api.postmarkapp.com/email/withTemplate', {
//        method: 'POST',
//        headers: {
//          'Accept': 'application/json',
//          'Content-Type': 'application/json',
//          'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
//        },
//        body: JSON.stringify({
//          From: process.env.POSTMARK_FROM_EMAIL,
//          To: to,
//          Bcc: bcc || undefined,
//          TemplateId: templateId,
//          TemplateModel: variables,
//          MessageStream: 'outbound',
//        }),
//      });
//      return response.json();
//    }
//
// 3. In route.js, replace the sendEmail() calls with:
//
//    const payload = buildPostmarkPayload({ referenceNumber, data, attendees, invoiceCountry, invoiceAddress, adminDashboardUrl });
//
//    const userTemplateId = process.env.POSTMARK_TEMPLATE_ID_USER;
//    const adminTemplateId = process.env.POSTMARK_TEMPLATE_ID_ADMIN;
//
//    if (userTemplateId) {
//      await sendTemplateEmail({ to: data.coordinator.email, bcc: adminEmail, templateId: userTemplateId, variables: payload });
//    } else {
//      await sendEmail({ to: ..., html: userMsg.html, text: userMsg.text }); // fallback to hardcoded template
//    }
//
// 4. In Postmark template editor, reference variables as: {{ref_number}}, {{coord_full_name}},
//    {{#each attendees}}{{number}}. {{full_name}} — {{email}}{{/each}}, etc.