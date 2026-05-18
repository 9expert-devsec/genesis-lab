import Link from 'next/link';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';

export const metadata = {
  title: 'เส้นทางอาชีพ | 9Expert Training',
  description:
    'เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ',
};
export const revalidate = 3600;

function Hero({ count }) {
  return (
    <section className="bg-gradient-to-r from-[#005CFF] to-[#2486FF]">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold text-white md:text-4xl">
          เลือกเส้นทางอาชีพของคุณ
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
          {count > 0
            ? `${count} เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ`
            : 'เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ'}
        </p>
      </div>
    </section>
  );
}

function CareerPathCard({ path }) {
  const href = path.api_slug ? `/${path.api_slug}` : '/career-path-project';
  const hasHero = Boolean(path.hero_image_url);

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      {hasHero ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={path.hero_image_url}
          alt={path.hero_image_alt || path.title}
          className="h-[200px] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-[160px] items-center justify-center bg-[#F8FAFD]">
          {path.icon_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={path.icon_url}
              alt={path.title}
              className="h-16 w-16 object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-3xl font-extrabold text-[#005CFF]/30">
              {path.title?.slice(0, 1) ?? '?'}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col px-5 py-4">
        <h2 className="text-lg font-bold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {path.title}
        </h2>
        {path.short_description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {path.short_description}
          </p>
        )}
        <p className="mt-3 text-sm font-semibold text-[#2486FF]">
          ดูรายละเอียด →
        </p>
      </div>
    </Link>
  );
}

export default async function Page() {
  const paths = await getActiveCareerPaths();

  return (
    <>
      <Hero count={paths.length} />
      <section className="mx-auto max-w-6xl px-4 py-12">
        {paths.length === 0 ? (
          <p className="py-16 text-center text-gray-500">
            ยังไม่มีข้อมูล กรุณา Sync ข้อมูลจาก Admin
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paths.map((p) => (
              <CareerPathCard key={p.career_path_id} path={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}