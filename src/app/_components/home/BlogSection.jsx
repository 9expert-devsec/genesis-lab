import Link from 'next/link';
import { ExternalLink, FileText } from 'lucide-react';

const PLACEHOLDER_ARTICLES = [
  {
    title: 'Microsoft Power Platform คืออะไร',
    excerpt:
      'Power Platform ประกอบด้วย 4 เครื่องมือหลักที่ช่วยให้คุณวิเคราะห์ข้อมูล สร้างแอป อัตโนมัติ และสนทนากับลูกค้า',
    tag: 'บทความ',
  },
  {
    title: 'เริ่มต้นกับ Power BI ภายใน 1 ชั่วโมง',
    excerpt:
      'คู่มือสั้นๆ สำหรับผู้เริ่มต้นใช้งาน Power BI Desktop พร้อมตัวอย่างข้อมูลที่ใช้ฝึกได้จริง',
    tag: 'บทความ',
  },
  {
    title: 'AI ในงานออฟฟิศ: 5 แนวทางที่ใช้ได้เลย',
    excerpt:
      'จาก Microsoft 365 Copilot ถึง Power Automate — สรุปแนวทางที่พนักงานออฟฟิศเริ่มใช้ AI ได้ทันที',
    tag: 'บทความ',
  },
];

/**
 * Blog strip. Articles are stored in our own MongoDB (`Article` model)
 * but there isn't a server-fetch adapter yet — we render curated
 * placeholders so the section ships alongside the rest of the home page.
 * Swap to real data once the adapter exists.
 */
export function BlogSection({ articles }) {
  const list = Array.isArray(articles) && articles.length
    ? articles.slice(0, 3)
    : PLACEHOLDER_ARTICLES;

  return (
    <section className="bg-9e-ice px-4 py-12 lg:px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-primary">
              <FileText className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy">บทความ</h2>
          </div>
          <Link
            href="/articles"
            className="flex items-center gap-1 text-sm font-medium text-9e-primary hover:underline"
          >
            ดูบทความทั้งหมด
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {list.map((a, i) => (
            <article
              key={a.slug ?? i}
              className="overflow-hidden rounded-2xl bg-white transition-shadow duration-9e-micro ease-9e hover:shadow-9e-md"
            >
              <div className="aspect-video bg-gradient-to-br from-9e-sky/30 to-9e-primary/10" />
              <div className="p-4">
                <div className="mb-2 flex gap-2">
                  <span className="rounded-full bg-9e-primary px-2 py-0.5 text-xs text-white">
                    {a.tag ?? 'บทความ'}
                  </span>
                </div>
                <h3 className="mb-1 line-clamp-2 text-sm font-bold text-9e-navy">
                  {a.title}
                </h3>
                <p className="line-clamp-2 text-xs text-9e-slate">
                  {a.excerpt ?? ''}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
