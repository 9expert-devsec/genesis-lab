import { Download, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The white pill button that offers a PDF from inside a blue gradient hero.
 *
 * ── WHY THIS IS SHARED RATHER THAN COPIED ───────────────────────────────────
 *
 * /schedule had it first. /training-course was told to "match that button's
 * treatment — same height, radius, padding, gap, icon sizes, font weight and
 * hover state", and the honest way to satisfy that is to render the same
 * element, not to copy nine utility classes into a second file and hope nobody
 * adjusts one of them. Copied classes agree on the day they are copied; a
 * shared component agrees permanently.
 *
 * It is deliberately NOT a general button. It hardcodes the leading document
 * glyph, the trailing download glyph, the white-on-blue palette and `mt-6`,
 * because those are what "the hero PDF button" means here. A caller that wants
 * something else wants a different component.
 *
 * ── THE TWO CALLERS DIFFER IN MECHANISM, NOT IN TREATMENT ───────────────────
 * /schedule's href is CMS-managed (Mongo `schedule_pdf`, admin at
 * /admin/schedule-pdf) and the button renders only when that url exists.
 * /training-course's is a hardcoded site-root path in WEBROOT_DOCUMENTS,
 * rewritten to Vercel Blob, always present. Both facts live at the call sites;
 * this component only knows how the thing should look.
 *
 * ── NO `download` ATTRIBUTE BY DEFAULT, ON PURPOSE ─────────────────────────
 * Whether the file opens in the tab or saves is decided by the RESPONSE
 * HEADERS, not by the anchor. Adding `download` unconditionally would override
 * an inline Content-Disposition the file may legitimately answer with, and
 * would do it for every caller at once.
 *
 * `downloadAs` is the OPT-IN for a caller whose file arrives with NO
 * disposition at all — a raw Cloudinary PDF under /files/ is served bare, so
 * without it the button opens a tab. It is a same-origin URL (the rewrite
 * proxies; the browser never sees Cloudinary), which is the one case the
 * attribute is honoured. The value is the filename the browser saves as.
 * Callers that do not pass it are byte-for-byte what they were.
 */
export function HeroPdfButton({ href, children, className, downloadAs }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={downloadAs || undefined}
      className={cn(
        'mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3',
        'text-sm font-medium text-9e-action shadow-md transition-colors hover:bg-9e-ice',
        className,
      )}
    >
      <FileText className="h-4 w-4 flex-none" />
      {children}
      <Download className="h-4 w-4 flex-none" />
    </a>
  );
}
