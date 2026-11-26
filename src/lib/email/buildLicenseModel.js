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
  if (!opts?.enabled) return null;

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
    // per_attendee → never render a summary table (each attendee's license is
    // already in the attendee table). Conditions come ONLY from global_ack.
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
    return {
      // Mustachio only enters {{#key}} for truthy CONTAINERS (object/array),
      // not boolean true → use {} for the active mode, false for the inactive.
      license_per_attendee_mode: {}, // truthy object → section enters
      license_all_mode: false, // false → section skipped
      license_conditions: conditions, // array | false (from global_ack)
    };
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
  return {
    license_per_attendee_mode: false, // false → section skipped
    license_all_mode: {}, // truthy object → section enters
    // object|false so {{#license_show_table}} works AND exposes license_text
    license_show_table: show_items ? { license_text: single.license_text } : false,
    license_conditions: conditions, // array | false
  };
}

/**
 * Which license(s) the attendees actually chose: 'own' | 'team' | 'mixed'.
 *
 * Choice values are compared case-insensitively because the stored values
 * follow the course's `choices[].value` as typed by the admin ("Own",
 * "9expert"), not a fixed spelling.
 *
 *   scope "all"          → the one choice ('mixed' if missing or unknown)
 *   scope "per_attendee" → 'own' / 'team' only when EVERY listed attendee has
 *                          that same choice. 'mixed', the safe default, when:
 *                          both appear, the names were withheld
 *                          (attendeesListProvided === false), any attendee has
 *                          no slot / no choice, or a value is unrecognised.
 */
export function resolveEffectiveLicenseMode(registration) {
  const kindOf = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'own' ? 'own' : s === '9expert' ? 'team' : null;
  };

  if (registration?.license_scope !== 'per_attendee') {
    return kindOf(registration?.license_choice) ?? 'mixed';
  }
  if (registration.attendeesListProvided === false) return 'mixed';

  const slots = Array.isArray(registration.license_per_attendee)
    ? registration.license_per_attendee
    : [];
  const attendeeCount = Math.max(
    Array.isArray(registration.attendees) ? registration.attendees.length : 0,
    slots.length
  );
  if (attendeeCount === 0) return 'mixed';

  const kinds = new Set();
  for (let i = 0; i < attendeeCount; i++) {
    const k = kindOf(slots[i]?.choice);
    if (!k) return 'mixed';
    kinds.add(k);
  }
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
}

/**
 * The license model for the Masterclass EMAILS (quote + paid receipt).
 *
 * Same as buildLicenseModel, except that a per-attendee registration whose
 * attendees all chose the SAME license is rendered exactly as scope "all" with
 * that choice: the chosen option's own conditions instead of the combined
 * global_ack block that covers both. A genuinely mixed (or uncertain)
 * registration keeps the per-attendee model.
 *
 * Only the emails use this. The per-attendee rows of the attendee table are
 * built by the senders from license_per_attendee and are unaffected.
 */
export function buildEmailLicenseModel(doc, courseDoc) {
  if (doc?.license_scope !== 'per_attendee') return buildLicenseModel(doc, courseDoc);

  const mode = resolveEffectiveLicenseMode(doc);
  if (mode === 'mixed') return buildLicenseModel(doc, courseDoc);

  const target = mode === 'own' ? 'own' : '9expert';
  const choice = (courseDoc?.license_options?.choices ?? []).find(
    (c) => String(c?.value ?? '').trim().toLowerCase() === target
  );
  if (!choice) return buildLicenseModel(doc, courseDoc); // no matching option → safe default

  return buildLicenseModel(
    {
      ...doc,
      license_scope: 'all',
      license_choice: choice.value,
      license_level: null,
      license_detail: null,
    },
    courseDoc
  );
}
