import { Download, FileText } from 'lucide-react';

/**
 * Course outline PDFs. Upstream returns `course_doc_paths` as an array
 * of absolute URLs. Each renders as its own tappable row — external
 * links open in a new tab with rel=noopener.
 */
export function PDFDownload({ course }) {
  const docs = Array.isArray(course?.course_doc_paths)
    ? course.course_doc_paths.filter(Boolean)
    : [];
  if (!docs.length) return null;

  return (
    <div className="space-y-1 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      {docs.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl p-2 transition-colors duration-9e-micro ease-9e hover:bg-9e-ice"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50">
            <FileText className="h-4 w-4 text-red-500" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-9e-navy">
              ดาวน์โหลด Course Outline
            </p>
            <p className="text-xs text-9e-slate">PDF</p>
          </div>
          <Download className="h-3.5 w-3.5 shrink-0 text-9e-action" strokeWidth={2} />
        </a>
      ))}
    </div>
  );
}
