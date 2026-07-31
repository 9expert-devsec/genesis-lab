/**
 * debug_json — a developer-tier JSON inspection block (§5.5). Server component.
 *
 * AUTHORING-ONLY BY DESIGN. It renders its `<pre>` ONLY in the editor canvas
 * (the renderer passes `inEditor` — true only when a `path` is threaded, i.e.
 * the canvas) and NOTHING on any published or preview page. This is the one
 * section whose canvas view intentionally differs from publish: it is a scratch
 * pad for a developer to eyeball a data shape while building, not page content,
 * so it must never leak a JSON dump to a public visitor. The editor says so at
 * the field (SectionContentEditor).
 *
 * Because it renders in the canvas, sectionRendersEmpty marks it empty only when
 * its `json` is blank — matching what the author sees there.
 */
export function DebugJsonSection({ content, inEditor }) {
  if (!inEditor) return null; // never on the published page
  const raw = typeof content?.json === 'string' ? content.json : '';
  if (!raw.trim()) return null;

  // Pretty-print when it parses; otherwise show the raw string as-is (a dev
  // inspecting malformed JSON still wants to see exactly what is stored).
  let display = raw;
  try {
    display = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    /* keep raw */
  }

  return (
    <pre className="overflow-x-auto rounded-9e-md border border-[var(--surface-border)] bg-9e-slate-lt-800 p-4 font-mono text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
      {display}
    </pre>
  );
}
