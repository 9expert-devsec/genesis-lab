/**
 * Build the `prep_checklist` template model ("เตรียมความพร้อมก่อน Workshop" box)
 * for Masterclass receipt/quote emails.
 *
 * SOURCE rule:
 *   - the box comes from `MasterclassBatch.preparation_html` — per-BATCH, not
 *     per-course. An earlier revision read the course-level
 *     `equipment_required` / `system_requirements_html`; those are edited on a
 *     different admin form and are NOT what staff fill in for a run of the
 *     workshop. `preparation_html` is the field bound to the rich-text editor in
 *     MasterclassBatchListClient ("ข้อมูลเตรียมความพร้อมก่อนอบรม") and already
 *     rendered on the payment review step by MasterclassRegisterClient.
 *
 * HEADING rule:
 *   - the authored blob already opens with its own heading line
 *     ("กรุณาเตรียมอุปกรณ์และระบบให้พร้อมก่อนเข้าร่วม Workshop") and carries its own
 *     `<ol>`/`<ul>` numbering → the Postmark template must NOT hard-code a
 *     heading or build rows of its own. It renders the blob and nothing else.
 *
 * SHAPE rule:
 *   - `prep_checklist` is object-or-`false`: Mustachio only enters `{{#key}}`
 *     for truthy CONTAINERS, and a section entered on a bare STRING would make
 *     that string the current context. The gate and the HTML key collapse into
 *     one container → the template reads
 *     `{{#prep_checklist}}{{{html}}}{{/prep_checklist}}`.
 *   - `html` is admin-authored raw rich text → triple-mustache, same treatment
 *     as `license_conditions[].html`.
 *
 * NO FALLBACK:
 *   - a batch with no `preparation_html` yields `false` and the whole amber box
 *     is omitted, matching what the review page already does. There is no static
 *     default checklist.
 *
 * EMPTINESS rule:
 *   - `preparation_html` comes from a TipTap editor, which serialises a cleared
 *     field as `<p></p>` or `<p><br></p>` — markup with no text is treated as
 *     unset so it cannot render an empty box.
 *
 * @param {object} batchDoc  MasterclassBatch doc (preparation_html)
 * @returns {{ prep_checklist: false | { html: string } }}
 */

/** True when the rich-text HTML carries actual text (not just `<p></p>`/`<br>`). */
function hasRichText(html) {
  if (typeof html !== 'string') return false;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0;
}

export function buildPrepModel(batchDoc) {
  const html = batchDoc?.preparation_html;
  return {
    // { html } → section enters and exposes {{{html}}}; false → box omitted.
    prep_checklist: hasRichText(html) ? { html } : false,
  };
}
