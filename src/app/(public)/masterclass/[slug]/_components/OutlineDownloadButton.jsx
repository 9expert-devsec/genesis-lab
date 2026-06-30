'use client';

import { Download } from 'lucide-react';
import { trackDownload } from '@/lib/analytics/conversions';

// Client wrapper for the course-outline download link. Fires the GA4
// file_download + Google Ads download conversion on click. Tracking does NOT
// preventDefault — the link still navigates normally.
//
// Renders the exact same markup as the original inline <a> so the UI is
// visually identical.
export function OutlineDownloadButton({ href, fileName }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackDownload({ fileName })}
      className="flex flex-col px-8 py-5  items-center rounded-[20px] bg-9e-brand text-sm font-semibold text-white transition-colors hover:bg-9e-air"
    >
      <div className="flex flex-row items-center gap-2 text-lg md:text-2xl">
        <Download size={24} /> Download
      </div>

      <span className="text-[12px] font-semibold uppercase tracking-widest text-white mt-0.5">
        COURSE OUTLINE
      </span>
    </a>
  );
}
