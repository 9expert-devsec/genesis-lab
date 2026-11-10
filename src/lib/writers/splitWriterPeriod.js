import { WRITER_SECTION_KEYS } from './writerFields.js';

/**
 * Split a legacy section row's leading year into `period`.
 *
 * Pure, and the only rule scripts/split-writer-periods.mjs applies. A row
 * splits when it STARTS with a period followed by " · ":
 *
 *   YYYY
 *   YYYY – YYYY | YYYY – Present | YYYY – ปัจจุบัน
 *
 * The dash may be an en dash, an em dash or a hyphen, with or without spaces.
 * Only the FIRST " · " is the separator: "2013 – Present · 9Expert … · Delivered …"
 * keeps its second one in the text. Everything else is left exactly as it is.
 */
const PERIOD_RE = /^(\d{4}(?:\s*[–—-]\s*(?:\d{4}|Present|ปัจจุบัน))?)\s+·\s+([\s\S]+)$/;

/**
 * @returns {{ action: 'skip', item: object }       already object-shaped
 *         | { action: 'split', item: { period, text } }
 *         | { action: 'keep', item: { text } }}     a string with no period
 */
export function splitWriterPeriod(item) {
  if (item && typeof item === 'object') return { action: 'skip', item };
  const text = String(item ?? '').trim();
  const m = text.match(PERIOD_RE);
  if (!m) return { action: 'keep', item: { text } };
  // The period is kept as typed; only the separator is removed.
  return { action: 'split', item: { period: m[1], text: m[2].trim() } };
}

/**
 * The plan for one writer: the new `sections`, and one report row per string
 * item. `changed` is false when every row was already an object, so a re-run
 * writes nothing: the script is idempotent.
 */
export function planWriterPeriodSplit(writer) {
  const rows = [];
  const sections = {};
  let changed = false;
  for (const key of WRITER_SECTION_KEYS) {
    const items = Array.isArray(writer?.sections?.[key]) ? writer.sections[key] : [];
    sections[key] = items.map((item) => {
      const result = splitWriterPeriod(item);
      if (result.action === 'skip') return result.item;
      changed = true;
      rows.push({
        writer: writer.slug,
        section: key,
        action: result.action,
        before: String(item ?? ''),
        period: result.item.period ?? '',
        text: result.item.text,
      });
      return result.item;
    });
  }
  return { changed, sections, rows };
}
