import { Search } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-9e-ice">
        <Search className="h-5 w-5 text-9e-slate" strokeWidth={1.75} />
      </div>
      <p className="text-base font-semibold text-9e-navy">
        ไม่พบหลักสูตรที่ตรงกับเงื่อนไข
      </p>
      <p className="mt-1 text-sm text-9e-slate">
        ลองลบตัวกรอง หรือค้นหาด้วยคำอื่น
      </p>
    </div>
  );
}
