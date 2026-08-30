/**
 * Build the `prep_checklist` template model ("เตรียมความพร้อมก่อน Workshop" box)
 * for Masterclass receipt/quote emails.
 *
 * Sources the box from the course itself instead of hard-coding it in the
 * Postmark template:
 *   - `equipment_required: string[]`     → `items[]` (plain text, one row each)
 *   - `system_requirements_html: string` → `prep_html.html` (admin-authored rich text)
 *
 * FALLBACK rule:
 *   - a course with NEITHER field populated must not render an empty amber box →
 *     fall back to the previous static 5-item checklist (verbatim from the live
 *     template) and log which course triggered it.
 *
 * INDEX rule:
 *   - Mustachio has no loop-index helper, so `index` is precomputed here — same
 *     reason `attendee_list.items` already carries `index: i + 1`.
 *
 * EMPTINESS rule:
 *   - `system_requirements_html` comes from a TipTap editor, which serialises a
 *     cleared field as `<p></p>` — markup with no text is treated as unset so it
 *     cannot keep an otherwise-empty box alive.
 *
 * SHAPE rule:
 *   - `prep_html` is an object-or-`false`, never a bare string: a Mustache
 *     section entered on a STRING makes that string the current context, so an
 *     inner `{{{prep_html}}}` would only resolve by parent-context fallback.
 *     Every other gated text block here is a named-key object (`billing_notes`
 *     is `{ text } | false`) → the template reads `{{{html}}}` inside the
 *     `{{#prep_html}}` gate, matching `license_conditions[].html`.
 *
 * `prep_html.html` is raw rich-text HTML → render with triple-mustache.
 * `items[].text` is plain text → render with regular mustache.
 *
 * @param {object} courseDoc  MasterclassCourse doc (equipment_required, system_requirements_html)
 * @returns {{ prep_checklist: object }}
 */

/** Static checklist used when the course carries no preparation content. */
const FALLBACK_ITEMS = [
  'Notebook หรือ Laptop ส่วนตัว (ไม่แนะนำ Tablet หรือ Smartphone)',
  'Windows 10/11 และ Google Chrome หรือ Microsoft Edge เวอร์ชันล่าสุด',
  'สามารถเชื่อมต่อ Internet ได้ตลอดการอบรม',
  'เตรียมบัญชี Claude AI และ Google Account ให้พร้อม',
  'ติดตั้ง Claude for Desktop ล่วงหน้าก่อนวันอบรม',
];

/** True when the rich-text HTML carries actual text (not just `<p></p>`/`<br>`). */
function hasRichText(html) {
  if (typeof html !== 'string') return false;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0;
}

export function buildPrepModel(courseDoc) {
  const equipment = Array.isArray(courseDoc?.equipment_required)
    ? courseDoc.equipment_required
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim())
    : [];
  const html = courseDoc?.system_requirements_html;
  const prep_html = hasRichText(html) ? { html } : false;

  if (!equipment.length && !prep_html) {
    console.log(
      '[mc-prep] fallback checklist used | course_id:',
      String(courseDoc?._id ?? 'unknown'),
    );
    return {
      // Mustachio only enters {{#key}} for truthy CONTAINERS (object/array),
      // not boolean true → the checklist is an object, never `true`.
      prep_checklist: {
        items: FALLBACK_ITEMS.map((text, i) => ({ index: i + 1, text })),
        prep_html: false, // false → {{#prep_html}} section skipped
      },
    };
  }

  return {
    prep_checklist: {
      items: equipment.map((text, i) => ({ index: i + 1, text })),
      prep_html, // { html } | false (raw HTML → triple-mustache as {{{html}}})
    },
  };
}
