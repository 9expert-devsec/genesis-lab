import { Download, FileText } from 'lucide-react';

/**
 * Course outline downloads. Upstream sends `course_outline_th` and
 * `course_outline_en` objects, each with an absolute, ready-to-use
 * `download_url`. A single card holds the heading plus up to two
 * side-by-side language buttons (TH | EN).
 */

const hasFile = (outline) =>
  typeof outline?.download_url === 'string' && outline.download_url.length > 0;

function OutlineButton({ lang, outline }) {
  return (
    <a
      href={outline.download_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-9e-navy transition-colors duration-9e-micro ease-9e hover:border-9e-action hover:bg-9e-ice hover:text-9e-action"
    >
      <Download className="h-4 w-4 shrink-0" strokeWidth={2} />
      {lang}
    </a>
  );
}

export function PDFDownload({ course }) {
  const buttons = [
    { lang: 'TH', outline: course?.course_outline_th },
    { lang: 'EN', outline: course?.course_outline_en },
  ].filter(({ outline }) => hasFile(outline));

  if (!buttons.length) return null;

  return (
    <div className="flex flex-row rounded-2xl border items-center border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50">
          <FileText className="h-4 w-4 text-red-500" strokeWidth={1.75} />
        </div>
      <div className="flex flex-col items-center w-full gap-3">
        
        {/* <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50">
          <FileText className="h-4 w-4 text-red-500" strokeWidth={1.75} />
        </div> */}
        <p className="text-xs font-semibold text-9e-navy">
          ดาวน์โหลด Course Outline
        </p>
       <div className="flex flex-wrap gap-2 ">
        {buttons.map(({ lang, outline }) => (
          <OutlineButton key={lang} lang={lang} outline={outline} />
        ))}
      </div>
      </div>
      {/* <div className="mt-3 flex flex-wrap gap-2 ">
        {buttons.map(({ lang, outline }) => (
          <OutlineButton key={lang} lang={lang} outline={outline} />
        ))}
      </div> */}
    </div>
  );
}
