import { getActiveFaqsGrouped } from '@/lib/faqs/getFaqs';
import { FaqClient } from './_components/FaqClient';

export const metadata = {
  title: 'คำถามที่พบบ่อย',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/faq` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/faq` },
};
// ISR, not force-dynamic. The FAQ set changes through the admin (faqs.js →
// revalidatePath('/faq')), the MSDB webhook (faq.* → '/faq') and the 6-hourly
// cron sync (triggerFaqSync → '/faq'); every writer already busts this path,
// so a per-request render bought nothing but a function invocation per hit
// (4.2K in 12 h, measured 2026-09-18).
export const revalidate = 3600;

function FaqHero() {
  return (
    <section className="bg-gradient-to-r from-[#005CFF] to-[#2486FF]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center gap-3">
          <span
            className="text-4xl font-extrabold leading-none text-[#D4F73F]"
            aria-hidden="true"
          >
            ?
          </span>
          <h1 className="text-3xl font-extrabold text-white">
            คำถามที่พบบ่อย
          </h1>
        </div>
        <p className="mt-2 text-sm text-white/70">
          ค้นหาคำตอบสำหรับคำถามทั่วไปเกี่ยวกับการอบรมที่ 9Expert
        </p>
      </div>
    </section>
  );
}

export default async function Page() {
  const groups = await getActiveFaqsGrouped();
  return (
    <>
      <FaqHero />
      <FaqClient groups={groups} />
    </>
  );
}