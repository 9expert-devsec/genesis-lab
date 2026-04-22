'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Hook for error reporting (Sentry/Vercel logs) — wire in Phase 4.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[680px] px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-9e-brand">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-primary)] md:text-4xl">
        เกิดข้อผิดพลาด
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-[var(--text-secondary)]">
        ขออภัยในความไม่สะดวก ลองรีเฟรชหน้าหรือกลับหน้าแรก
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={reset}>ลองอีกครั้ง</Button>
        <Button asChild variant="outline">
          <Link href="/">กลับหน้าแรก</Link>
        </Button>
      </div>
    </div>
  );
}
