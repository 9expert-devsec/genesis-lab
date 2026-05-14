import Link from 'next/link';

/**
 * Sidebar CTA for inhouse training enquiry.
 * When `courseId` is provided, pre-selects it on the inhouse form via ?course= param.
 */
export function InhouseCTA({ courseId }) {
  const href = courseId
    ? `/registration/in-house?course=${encodeURIComponent(String(courseId).toLowerCase())}`
    : '/registration/in-house';

  return (
    <div className="rounded-2xl bg-9e-action p-5 text-center">
      <p className="mb-1 text-sm font-semibold text-white">
        ต้องการอบรมหลักสูตรนี้
      </p>
      <p className="mb-4 text-xs text-white/80">สำหรับ Inhouse Training</p>
      <Link
        href={href}
        className="block w-full rounded-xl bg-white py-2.5 text-sm font-bold text-9e-action transition-colors duration-9e-micro ease-9e hover:bg-9e-ice"
      >
        ขอใบเสนอราคา
      </Link>
    </div>
  );
}