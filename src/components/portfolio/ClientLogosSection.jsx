export default function ClientLogosSection({ logos }) {
  if (!logos || logos.length === 0) return null;

  return (
    <section className="bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center">
          <h2 className="font-heading text-3xl font-bold text-9e-navy dark:text-white lg:text-4xl">
            องค์กรที่ให้ความไว้วางใจ
          </h2>
          <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            บริษัทและองค์กรชั้นนำกว่า 5000+ แห่งจากทุกอุตสาหกรรม
          </p>
        </div>

        <div className="mt-14 grid grid-cols-3 gap-x-8 gap-y-10 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {logos.map((logo) => (
            <div
              key={logo._id}
              className="flex h-[72px] items-center justify-center"
            >
              <img
                src={logo.image_url}
                alt={logo.company_name}
                className="h-auto max-h-[56px] w-auto max-w-[140px] object-contain opacity-75 transition-all duration-9e-micro hover:scale-105 hover:opacity-100 dark:opacity-50 dark:brightness-0 dark:invert"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
