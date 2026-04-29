export default function Loading() {
  return (
    <div className="bg-9e-ice">
      <div className="h-56 animate-pulse bg-9e-gradient-hero md:h-64" />
      <div className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6 lg:py-12">
        <div className="mb-6 h-10 w-full max-w-md animate-pulse rounded-xl bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-gray-100 bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
