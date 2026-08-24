import { slotsOf } from './containerSlots';
import { isValidSectionId } from './scopeCss';
import { embedSrc } from './embedSrc';

/**
 * Human labels for section types, and a short content summary for each.
 *
 * ONE definition, shared by the Structure tree (item 2) and the add-section
 * picker (item 4) — the picker names the same things the tree names, and two
 * copies would let those drift apart under the author's hands.
 *
 * Keys mirror the renderer's REGISTRY in components/pageBuilder/SectionRenderer.jsx.
 * A type missing here still renders; it just falls back to its raw type name,
 * so an unlabelled Phase-2 section is untidy rather than invisible.
 */
export const SECTION_LABELS = {
  heading:        'หัวข้อ',
  rich_text:      'ข้อความ',
  image:          'รูปภาพ',
  cta:            'ปุ่ม CTA',
  checklist:      'รายการตรวจสอบ',
  notice:         'กล่องแจ้งเตือน',
  full_width:     'เต็มความกว้าง',
  container:      'คอนเทนเนอร์',
  two_column:     'สองคอลัมน์',
  card_grid:      'กริดการ์ด',
  highlight_grid: 'กริดไฮไลต์',
  timeline:       'ไทม์ไลน์',
  tabs:           'แท็บ',
  accordion:      'แอคคอร์เดียน',

  // 2C shipped the self-contained Card + Advanced components — these now render
  // (REGISTRY owns that claim; a label is only a name to show).
  price_card:      'การ์ดราคา',
  stat_card:       'การ์ดสถิติ',
  icon_card:       'การ์ดไอคอน',
  custom_html:     'HTML กำหนดเอง',
  embed:           'ฝังเนื้อหา (embed)',
  custom_css:      'CSS กำหนดเอง',
  debug_json:      'Debug JSON',

  // 2C.2a shipped the authored-reference data-backed types — these render now
  // (from data hoisted above the renderer; see resolveSectionData.js).
  course_card:     'การ์ดคอร์ส',
  instructor_card: 'การ์ดผู้สอน',
  course_selector: 'ตัวเลือกคอร์ส',
  course_list:     'รายการคอร์ส',
  bundle_courses:  'คอร์สในแพ็กเกจ',

  // 2C.2b shipped the derived / time-varying data-backed type — it renders now
  // (from a request-time schedule fetch hoisted above the renderer; the canvas
  // shows an edit-time SAMPLE the editor labels as such).
  course_schedule: 'ตารางคอร์ส',
};

export function labelOf(type) {
  return SECTION_LABELS[type] ?? String(type ?? 'ไม่ทราบชนิด');
}

/**
 * How many child sections a container holds, PER SLOT.
 *
 * ── WHY PER SLOT AND NOT ONE TOTAL ─────────────────────────────────────────
 * `two_column` has two slots. A single "6" over it would be true arithmetic and
 * a false description: it reads as one list of six when it is two lists whose
 * split is the whole point of choosing that type. The structure tree already
 * draws the slots separately, labelled ซ้าย / ขวา, so a summed number on the
 * row would also contradict what is directly underneath it.
 *
 * Returns null for a NON-container — not an empty array and not zero. A row
 * that has no slots must be able to render no count at all, and `[]` invites a
 * caller to print "0", which would say a heading is an empty container.
 *
 * An empty container DOES return its slots with zeros: it genuinely is a
 * container holding nothing, and that is worth saying.
 */
export function sectionChildCounts(section) {
  const slots = slotsOf(section?.type);
  if (!slots) return null;
  const content = section?.content ?? {};
  return slots.map((slot) => ({
    slot,
    count: Array.isArray(content[slot]) ? content[slot].length : 0,
  }));
}

const trim = (s, max = 40) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/**
 * A one-line hint at what's IN a section, so a tree of five headings isn't five
 * rows reading "หัวข้อ". Returns null when the type has no plain-text field to
 * read — only the shapes typed in lib/schemas/sections/content.js are touched.
 *
 * rich_text is deliberately absent: its content is a Tiptap doc, and walking it
 * for a preview string would be a second, drift-prone reader of a document
 * whose one contract lives in richText/tiptapToReact.jsx.
 */
export function sectionSummary(section) {
  const c = section?.content ?? {};
  switch (section?.type) {
    case 'heading':
    case 'notice':
      return trim(c.text);
    case 'cta':
      return trim(c.heading || c.buttonLabel);
    case 'image':
      return trim(c.alt || c.caption);
    case 'checklist': {
      const n = Array.isArray(c.items) ? c.items.length : 0;
      return n ? `${n} รายการ` : null;
    }
    default:
      return null;
  }
}

/**
 * Does this section render NOTHING on the page right now? The structure tree
 * marks these, because the canvas renders through the real SectionRenderer and
 * therefore shows nothing for them — so a row exists in the tree with no
 * counterpart on the canvas, and without a marker that reads as a broken
 * canvas rather than an empty section.
 *
 * ⚠ DRIFT: each case MIRRORS a component's own fail-closed guard. It is a second
 * reader of the same rule, so if a component changes when it returns null, this
 * must change with it — the marker would otherwise lie. Kept narrow and pinned
 * to the exact guard lines on purpose; a loader check asserts these stay in
 * sync with the component sources. Only the components that return null
 * OUTRIGHT are covered — cta and the item-based blocks render a wrapper even
 * when empty, so marking them would be a FALSE "won't render".
 *
 *   heading    image.jsx-adjacent: !text.trim()            → sections/heading.jsx
 *   notice     !text.trim()                                 → sections/notice.jsx
 *   image      !src.trim()                                  → sections/image.jsx
 *   checklist  no item with non-empty text                 → sections/checklist.jsx
 *   rich_text  doc has no renderable content                → sections/rich_text.jsx
 *   container  every child slot empty (renders a bare grid) → the layout components
 *   price_card no title, price, or feature                  → sections/price_card.jsx
 *   stat_card  no value and no label                        → sections/stat_card.jsx
 *   icon_card  no icon-name, IMAGE, title, or description   → sections/icon_card.jsx
 *   custom_html no html                                     → sections/custom_html.jsx
 *   custom_css  no css OR no valid Section ID to scope to    → sections/custom_css.jsx
 *   embed      iframe: no html · youtube/vimeo: url→no id   → sections/embed.jsx
 *   debug_json no json (it renders in the CANVAS, so the tree marks it by the
 *              same rule the author sees there; on a published page it renders
 *              nothing regardless — that is by design, not "empty")
 *   course_card / instructor_card   no id reference set     → the *_card.jsx
 *   course_selector / bundle_courses  no courseIds set
 *   course_list  manual: no courseIds · skill/program: no filter set (2C.2b)
 *   course_schedule  no course code set (2C.2b)
 *
 * ⚠ Secondary guards NOT mirrored on purpose, to keep this a cheap pure check:
 * custom_html/embed html that SANITIZES to nothing, custom_css that scopeCss
 * REJECTS, and — for the 2C.2a data-backed types — a reference that is SET but
 * RESOLVES to nothing (a bad course_id). That last one needs the fetch, which
 * the tree does not have; the settings panel warns instead. All still fail
 * closed at render; they just aren't pre-marked here. The primary (raw-emptiness
 * / no-reference) guards above are.
 */
export function sectionRendersEmpty(section) {
  if (!section || typeof section !== 'object') return true;
  if (section.enabled === false) return false; // hidden ≠ empty; the tree marks hidden separately
  const c = section.content ?? {};
  switch (section.type) {
    case 'heading':
    case 'notice':
      return !String(c.text ?? '').trim();
    case 'image':
      return !String(c.src ?? '').trim();
    case 'checklist':
      return !(Array.isArray(c.items) && c.items.some((it) => String(it?.text ?? '').trim()));
    case 'rich_text': {
      const content = c.doc?.content;
      return !(Array.isArray(content) && content.length > 0);
    }
    case 'price_card':
      return (
        !String(c.title ?? '').trim() &&
        !String(c.price ?? '').trim() &&
        !(Array.isArray(c.features) && c.features.some((f) => String(f ?? '').trim()))
      );
    case 'stat_card':
      return !String(c.value ?? '').trim() && !String(c.label ?? '').trim();
    case 'icon_card':
      return (
        !String(c.icon ?? '').trim() &&
        !String(c.imageSrc ?? '').trim() &&
        !String(c.title ?? '').trim() &&
        !String(c.description ?? '').trim()
      );
    case 'custom_html':
      return !String(c.html ?? '').trim();
    case 'custom_css':
      // Mirrors the component's guard: no css, OR no valid sectionId to scope to
      // (the renderer supplies domId only when advanced.sectionId is valid).
      return !String(c.css ?? '').trim() || !isValidSectionId(section.advanced?.sectionId);
    case 'embed':
      return c.provider === 'iframe'
        ? !String(c.html ?? '').trim()
        : !embedSrc(c.provider, c.url);
    case 'debug_json':
      return !String(c.json ?? '').trim();
    // 2C.2a data-backed: statically knowable emptiness is "no reference set". The
    // OTHER empty case — a reference that resolves to nothing — needs the fetch,
    // so it is a runtime-only guard (the settings panel warns), not mirrored here
    // (same shape as the custom_html sanitize-empty exception above).
    case 'course_card':
      return !String(c.courseId ?? '').trim();
    case 'instructor_card':
      return !String(c.instructorId ?? '').trim();
    case 'course_schedule':
      // 2C.2b: statically empty iff no course code. Whether that code has any
      // upcoming rounds is a runtime fetch (the settings panel warns) — same
      // shape as the resolved-to-nothing exception noted above.
      return !String(c.courseId ?? '').trim();
    case 'course_list': {
      // 2C.2b: the derived sources key off `filter`, not `courseIds`. Statically
      // empty iff the reference that source uses is unset.
      const source = c.source ?? 'manual';
      if (source === 'skill' || source === 'program') return !String(c.filter ?? '').trim();
      return !(Array.isArray(c.courseIds) && c.courseIds.some((id) => String(id ?? '').trim()));
    }
    case 'course_selector':
    case 'bundle_courses':
      return !(Array.isArray(c.courseIds) && c.courseIds.some((id) => String(id ?? '').trim()));
    default: {
      const slots = slotsOf(section.type);
      if (!slots) return false; // cta / timeline / tabs / accordion: render a wrapper — not marked
      return slots.every((slot) => !(Array.isArray(c[slot]) && c[slot].length > 0));
    }
  }
}

