import Link from 'next/link';

export function InhouseCTA() {
  return (
    <div className="rounded-2xl bg-9e-action p-5 text-center">
      <p className="mb-1 text-sm font-semibold text-white">
        ต้องการอบรมหลักสูตรนี้
      </p>
      <p className="mb-4 text-xs text-white/80">สำหรับ Inhouse Training</p>
      <Link
        href="/contact-us"
        className="block w-full rounded-xl bg-white py-2.5 text-sm font-bold text-9e-action transition-colors duration-9e-micro ease-9e hover:bg-9e-ice"
      >
        ขอใบเสนอราคา
      </Link>
    </div>
  );
}
