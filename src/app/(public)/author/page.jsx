import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { OG_DEFAULT_IMAGE } from '@/lib/seo/ogImage';
import { readPublicWriters } from '@/lib/writers/writerReads';
import { WRITER_LIST_PATH, writerPath } from '@/lib/writers/writerUrls';
import { WRITER_HERO_BAND, WriterPhoto } from './_components/WriterParts';

const TITLE = 'ผู้เขียน';
const DESCRIPTION = 'ทีมผู้เชี่ยวชาญและวิทยากรที่เขียนบทความให้ 9Expert Training';
const PAGE_URL = `${SITE_URL}${WRITER_LIST_PATH}`;

export const metadata = {
  // The root layout's template appends the brand.
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: siteConfig.name,
    locale: 'th_TH',
    type: 'website',
    images: [OG_DEFAULT_IMAGE],
  },
};

// The article page's policy. Writer actions refresh it through revalidatePath.
export const revalidate = 3600;

function WriterCard({ writer }) {
  return (
    <Link
      href={writerPath(writer.slug)}
      className="flex h-full flex-col items-center rounded-2xl border border-[var(--surface-border)] bg-white p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-9e-lg dark:bg-[#111d2c]"
      data-testid="writer-card"
    >
      <WriterPhoto writer={writer} className="h-28 w-28 ring-4 ring-9e-air/20" />
      <h2 className="mt-4 text-lg font-bold text-9e-navy dark:text-white">{writer.displayName}</h2>
      {writer.role && <p className="mt-1 text-sm text-9e-action dark:text-9e-air">{writer.role}</p>}
      <div className="mt-auto w-full pt-4">
        <div className="flex items-center justify-between border-t border-[var(--surface-border)] pt-3 text-sm">
          <span className="text-[var(--text-secondary)]">{writer.articleCount} บทความ</span>
          <span className="inline-flex items-center gap-1 font-semibold text-9e-action dark:text-9e-air">
            ดูโปรไฟล์ <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function WritersPage() {
  const writers = await readPublicWriters();

  return (
    <>
      <section className={WRITER_HERO_BAND}>
        <div className="mx-auto max-w-[1200px] px-4 py-14 text-center lg:px-6">
          <h1 className="text-4xl font-bold text-9e-navy dark:text-white">ผู้เขียน</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)]">{DESCRIPTION}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {writers.map((writer) => <WriterCard key={writer._id} writer={writer} />)}
        </div>
      </section>
    </>
  );
}
