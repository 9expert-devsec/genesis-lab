import { Download, FileText } from "lucide-react";

/**
 * The full course catalog, offered at its SITE-ROOT URL.
 *
 * ── THE THREE DECISIONS HERE ARE NOT NEW ────────────────────────────────────
 * The root-path href, the absent download attribute and the stated file size
 * are the same three choices src/components/about/CompanyProfileSection.jsx
 * makes, and that file carries the full reasoning for each. In short: the bare
 * path is what src/lib/webrootDocuments.mjs rewrites to the Blob store, it is
 * the URL sales hand out, and it survives a replacement of the bytes behind it;
 * a download attribute would override the inline Content-Disposition the file
 * actually answers with; and the size is stated because it is a real cost.
 *
 * ── THIS ONE IS 44.6 MB — TWICE THE COMPANY PROFILE ─────────────────────────
 * Measured on the deployed file: 44,647,587 bytes. Big enough that the caption
 * is doing more work here than it does on /about-us — on a phone this is a
 * minute of data, and a visitor deserves to know that before tapping rather
 * than after.
 *
 * ── WHY IT IS THE LAST SIBLING AND NOT IN THE HERO ──────────────────────────
 * /schedule puts its PDF button in the hero, and says why: the bar below it
 * collapses on mobile, so the hero is the button's free mobile home. That
 * reasoning does not transfer. This route's hero already owns the search input
 * — the page's primary action — and its FilterBar is `sticky top-20`, so a
 * block above the bar pushes the bar, the results count and all 77 cards down
 * on every viewport. Sitting after the results container instead, this is
 * structurally outside the grid's box: it cannot perturb the grid, the sticky
 * bar, or the horizontal scroll track CourseListClient's own comment defends.
 *
 * Written in this route's 9e-* tokens rather than the hex literals
 * CompanyProfileSection uses, because src/components/about/* and this route are
 * two different palettes and the local one is the one that stays consistent
 * when a token moves.
 */
export function CatalogDownload() {
  return (
    <section className="border-t border-gray-100 bg-white py-16 dark:border-[#1e3a5f] dark:bg-9e-navy">
      <div className="mx-auto max-w-[1200px] px-4 text-center lg:px-6">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-9e-lg bg-9e-action/10 text-9e-action dark:bg-9e-air/10 dark:text-9e-air">
          <FileText className="h-6 w-6" strokeWidth={1.75} />
        </div>

        <h2 className="text-2xl font-bold text-9e-navy dark:text-white md:text-3xl">
          แคตตาล็อกหลักสูตรทั้งหมด
        </h2>

        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-9e-slate-dp-50 dark:text-[#94a3b8] md:text-base">
          รวมทุกหลักสูตรของ 9Expert Training ไว้ในไฟล์เดียว
          พร้อมรายละเอียดเนื้อหาและระยะเวลาอบรม
          สะดวกสำหรับส่งต่อให้ทีมหรือใช้ประกอบการวางแผนพัฒนาบุคลากร
        </p>

        <a
          href="/9expert-training-course-catalog.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-9e-action px-8 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-9e-brand md:text-base"
        >
          <FileText className="h-5 w-5" />
          ดาวน์โหลดแคตตาล็อกหลักสูตร
          <Download className="h-5 w-5 transition-transform duration-300 group-hover:translate-y-0.5" />
        </a>

        <p className="mt-4 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8] md:text-sm">
          ไฟล์ PDF · ขนาดประมาณ 44.6 MB · เปิดในแท็บใหม่
        </p>
      </div>
    </section>
  );
}
