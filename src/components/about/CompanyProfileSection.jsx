import { Download, FileText } from "lucide-react";

/**
 * The company profile, offered at its SITE-ROOT URL.
 *
 * ── WHY THE HREF IS A BARE PATH AND NOT A BLOB URL ──────────────────────────
 * /9expert-company-profile.pdf is one of the three entries in
 * src/lib/webrootDocuments.mjs, rewritten to the Blob store by next.config.mjs.
 * Sales hand this URL out and it can never change, which is the whole reason
 * the root rule exists — so this links to the root path and lets the rewrite do
 * its job. Pointing at the Blob (or a Cloudinary) URL directly would bypass the
 * indirection and pin the page to wherever the bytes happen to live today.
 *
 * That indirection is also what makes this section maintenance-free: the
 * webroot admin surface is REPLACE-ONLY, so a new edition of the profile
 * replaces the bytes behind this same path and this file never changes.
 *
 * ── NO DOWNLOAD ATTRIBUTE, DELIBERATELY ─────────────────────────────────────
 * Measured against the deployed file: it answers Content-Type application/pdf
 * with Content-Disposition inline, so the browser opens it in its own PDF
 * viewer. Forcing the download attribute would override that and push a 22 MB
 * save on a visitor who only wanted a look. Same choice /schedule's button
 * makes, for the same reason — see the note in src/lib/actions/schedule-pdf.js
 * about the header winning over the markup either way.
 *
 * The size is stated in the caption because 22 MB is a real cost on mobile
 * data, and /schedule's button — which sits on a far smaller file — has no
 * caption to copy.
 */
export default function CompanyProfileSection() {
  return (
    <section className="relative overflow-hidden bg-[#F8FAFD] py-24 dark:bg-[#0D1B2A]">
      <div className="mx-auto max-w-[1200px] px-4 text-center lg:px-6">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{
            backgroundImage: "linear-gradient(135deg,#005CFF 0%,#2486FF 100%)",
          }}
        >
          <FileText className="h-7 w-7" strokeWidth={2} />
        </div>

        <h2 className="text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-4xl">
          <span className="block">โปรไฟล์บริษัท</span>
          <span
            className="mt-2 block bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)",
            }}
          >
            9Expert Training
          </span>
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
          รวมข้อมูลองค์กร หลักสูตร ประสบการณ์
          และผลงานที่ผ่านมาของเราไว้ในเอกสารฉบับเดียว
          เหมาะสำหรับใช้ประกอบการพิจารณาจัดอบรมภายในองค์กร
        </p>

        <a
          href="/9expert-company-profile.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#005CFF] to-[#2486FF] px-10 py-4 text-base font-semibold text-white transition-all duration-300 sm:text-lg"
          style={{ boxShadow: "0 25px 50px -12px rgba(0,92,255,0.5)" }}
        >
          <FileText className="h-5 w-5" />
          ดาวน์โหลด Company Profile
          <Download className="h-5 w-5 transition-transform duration-300 group-hover:translate-y-0.5" />
        </a>

        <p className="mt-4 text-sm text-[#465469] dark:text-[#94a3b8]">
          ไฟล์ PDF · ขนาดประมาณ 22 MB · เปิดในแท็บใหม่
        </p>
      </div>
    </section>
  );
}
