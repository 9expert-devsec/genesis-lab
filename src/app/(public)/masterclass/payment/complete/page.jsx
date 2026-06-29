'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/**
 * Return page after Omise 3DS/bank redirect.
 * Omise redirects here with ?registrationId=xxx after bank auth.
 * We poll the registration status and redirect to the masterclass
 * registration page once settled.
 *
 * The status logic lives in an inner component wrapped in <Suspense>
 * because useSearchParams() requires a suspense boundary in the App
 * Router (a bare top-level call fails `next build`).
 */
function PaymentCompleteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const registrationId = searchParams.get('registrationId');

  const [status, setStatus] = useState('checking'); // checking | paid | failed | timeout

  useEffect(() => {
    if (!registrationId) {
      setStatus('failed');
      return;
    }

    const start = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - start > 60000) {
        clearInterval(timer);
        setStatus('timeout');
        return;
      }
      try {
        const res = await fetch(
          `/api/masterclass/register/status?id=${encodeURIComponent(registrationId)}`,
          { cache: 'no-store' }
        );
        const body = await res.json().catch(() => ({}));
        if (body?.status === 'paid') {
          clearInterval(timer);
          setStatus('paid');
        } else if (body?.paymentStatus === 'failed') {
          clearInterval(timer);
          setStatus('failed');
        }
      } catch {
        // transient — keep polling
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [registrationId]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        <h1 className="text-xl font-semibold">กำลังตรวจสอบการชำระเงิน...</h1>
        <p className="text-gray-500 text-sm">กรุณารอสักครู่ ระบบกำลังยืนยันสถานะการชำระเงินของท่าน</p>
      </div>
    );
  }

  if (status === 'paid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">ชำระเงินสำเร็จ!</h1>
        <p className="text-gray-500">ระบบได้รับการชำระเงินของท่านเรียบร้อยแล้ว</p>
        <p className="text-gray-400 text-sm">ระบบได้จัดส่งรายละเอียดไปยังอีเมลของท่านแล้ว</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          กลับหน้า Home
        </button>
      </div>
    );
  }

  if (status === 'timeout') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <XCircle className="h-16 w-16 text-yellow-500" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">ยังไม่ได้รับการยืนยัน</h1>
        <p className="text-gray-500">ระบบยังไม่ได้รับการยืนยันจากธนาคาร</p>
        <p className="text-gray-400 text-sm">หากเงินถูกตัดแล้ว ระบบจะอัปเดตสถานะภายใน 24 ชั่วโมง<br/>กรุณาตรวจสอบอีเมลของท่าน</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
        >
          กลับหน้า Home
        </button>
      </div>
    );
  }

  // failed
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <XCircle className="h-16 w-16 text-red-500" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold">การชำระเงินไม่สำเร็จ</h1>
      <p className="text-gray-500">กรุณาลองใหม่อีกครั้ง หรือเลือกวิธีชำระเงินอื่น</p>
      <button
        onClick={() => router.push('/')}
        className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
      >
        กลับหน้า Home
      </button>
    </div>
  );
}

export default function MasterclassPaymentCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <h1 className="text-xl font-semibold">กำลังตรวจสอบการชำระเงิน...</h1>
        </div>
      }
    >
      <PaymentCompleteInner />
    </Suspense>
  );
}
