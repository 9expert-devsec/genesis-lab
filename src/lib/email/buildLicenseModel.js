/**
 * Build the `license_summary` template model for Masterclass receipt/quote emails.
 *
 * Always renders the chosen license — including when the attendee list is not
 * provided (attendee_later) — so the customer always sees what they selected.
 *
 * CONDITIONS rule:
 *   - scope "all"          → conditions come from the SELECTED choice's info_popup.
 *   - scope "per_attendee" → conditions come ONLY from global_ack (never per-choice).
 *
 * SUMMARY-TABLE rule (per validateLicense in the form):
 *   - per_attendee scope is only possible when the attendee list IS provided, and
 *     each attendee's license already shows in the attendee table → NEVER render a
 *     summary license table here; show conditions only.
 *   - scope "all" → the single license belongs in the summary table ONLY when the
 *     attendee list was NOT provided (`show_items`); otherwise it's already in the
 *     attendee table. Conditions are always shown.
 *
 * `conditions[].html` is raw rich-text HTML → render with triple-mustache.
 *
 * @param {object} doc        registration doc (license_choice/level/detail/scope/per_attendee)
 * @param {object} courseDoc  MasterclassCourse doc (license_options)
 * @returns {{ license_summary: false | object }}
 */
export function buildLicenseModel(doc, courseDoc) {
  const opts = courseDoc?.license_options;
  if (!opts?.enabled) return { license_summary: false };

  const choices = opts.choices ?? [];
  const findChoice = (v) => choices.find((c) => c.value === v) || null;
  const labelOf = (v) =>
    findChoice(v)?.label_th ||
    (v === 'own'
      ? 'ใช้ License ของผู้เข้าอบรมเอง'
      : v === '9expert'
        ? 'ให้ 9Expert จัดเตรียม License ให้'
        : v || '—');

  if (
    doc.license_scope === 'per_attendee' &&
    Array.isArray(doc.license_per_attendee) &&
    doc.license_per_attendee.length
  ) {
    const items = doc.license_per_attendee.map((s, i) => ({
      index: i + 1,
      choice_label: labelOf(s.choice),
      level: s.level || '',
      detail: s.detail || '',
    }));
    // per_attendee → conditions come ONLY from global_ack
    const g = opts.global_ack;
    const conditions =
      g?.enabled && g?.html_content
        ? [
            {
              title: g.popup_title || g.label_th || 'เงื่อนไขการใช้ License',
              html: g.html_content,
            },
          ]
        : false;
    return { license_summary: { per_attendee: true, items, conditions } };
  }

  // scope "all" → conditions come from the selected choice's info_popup
  const v = doc.license_choice;
  const choice_label = labelOf(v);
  const level = doc.license_level || '';
  const detail = doc.license_detail || '';
  const single = {
    choice_label,
    level,
    detail,
    // Single combined cell for the summary table.
    license_text: [choice_label, level, detail].filter(Boolean).join(' — '),
  };
  // Only surface the single license in a summary table when the attendee list
  // was NOT provided; otherwise it already appears in the attendee table.
  const show_items = doc.attendeesListProvided === false;
  const c = findChoice(v);
  const p = c?.info_popup;
  const conditions =
    p?.enabled && p?.html_content
      ? [
          {
            title: p.popup_title || c?.label_th || 'เงื่อนไข License',
            html: p.html_content,
          },
        ]
      : false;
  return { license_summary: { per_attendee: false, show_items, single, conditions } };
}
