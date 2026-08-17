"use client";

/** Terms & conditions modal behind the single consent checkbox. */
export function TermsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เงื่อนไขการสมัครและการชำระเงิน"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-[60] w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <h2 className="text-base font-bold text-9e-navy dark:text-white mb-4">
          เงื่อนไขการสมัครและการชำระเงิน
        </h2>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            <strong className="text-9e-navy dark:text-white">
              1. การตรวจสอบข้อมูล
            </strong>
            <br />
            ผู้สมัครรับผิดชอบในการตรวจสอบความถูกต้องของข้อมูลการสมัครก่อนยืนยัน
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              2. นโยบายการคืนเงิน
            </strong>
            <br />
            บริษัทไม่มีนโยบายคืนเงินหลังจากชำระเงินแล้วในทุกกรณี
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              3. การเลื่อน / เปลี่ยนแปลงรอบอบรม
            </strong>
            <br />
            ผู้สมัครสามารถขอเลื่อนรอบอบรมได้ล่วงหน้าไม่น้อยกว่า 7 วันทำการ
            ทั้งนี้ขึ้นอยู่กับที่นั่งว่างของรอบที่ต้องการเปลี่ยน
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              4. เงื่อนไขการอบรม
            </strong>
            <br />
            ผู้สมัครยินยอมปฏิบัติตามกฎระเบียบและเงื่อนไขการอบรมของ 9Expert
            Training ตลอดระยะเวลาการอบรม
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-9e-action py-2.5 text-sm font-semibold text-white hover:bg-9e-brand"
        >
          รับทราบและปิด
        </button>
      </div>
    </div>
  );
}
