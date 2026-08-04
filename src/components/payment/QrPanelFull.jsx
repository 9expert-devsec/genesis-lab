"use client";

import { Download, RefreshCw } from "lucide-react";
import { formatTHB } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Expanded PromptPay panel — lives in the left column once a charge exists. */
export function QrPanelFull({
  charge,
  pricing,
  expired,
  secondsLeft,
  onRegenerate,
}) {
  const mmss = `${String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, "0")}:${String(
    (secondsLeft ?? 0) % 60,
  ).padStart(2, "0")}`;
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">
        ชำระเงินผ่าน PromptPay QR
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        สแกน QR ผ่าน Mobile Banking แล้วระบบจะตรวจสอบสถานะการชำระเงินให้อัตโนมัติ
      </p>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* left: QR + amount + timer */}
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={charge.qrUrl}
            alt="PromptPay QR"
            className="h-56 w-56 rounded-9e-md border border-[var(--surface-border)] bg-white p-2"
          />
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            ยอดชำระ:{" "}
            <span className="text-lg font-bold text-9e-action">
              {formatTHB(charge.amount ?? pricing?.total ?? 0)} บาท
            </span>
          </p>
          {!expired ? (
            <span className="mt-2 inline-flex items-center rounded-full border border-amber-400 px-3 py-0.5 text-xs font-semibold text-amber-600">
              ชำระภายใน {mmss}
            </span>
          ) : (
            <span className="mt-2 text-sm text-red-500">
              QR หมดอายุแล้ว กรุณาสร้าง QR ใหม่
            </span>
          )}
        </div>

        {/* right: reference, status, steps */}
        <div className="space-y-3">
          {charge.referenceNumber && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-9e-slate-dp-50">
                เลขที่อ้างอิง
              </p>
              <p className="text-sm font-semibold text-9e-navy dark:text-white">
                {charge.referenceNumber}
              </p>
            </div>
          )}
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-semibold",
                expired
                  ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {expired ? "หมดอายุ" : "รอการชำระเงิน"}
            </span>
          </div>
          <ol className="space-y-1 text-sm text-[var(--text-secondary)]">
            <li>1. เปิดแอปธนาคารบนมือถือ</li>
            <li>2. สแกน QR Code นี้</li>
            <li>3. ตรวจสอบยอดและยืนยันการชำระเงิน</li>
          </ol>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={charge.qrUrl}
          download="promptpay-qr.png"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
        >
          <Download size={14} /> ดาวน์โหลด QR
        </a>
        {expired && (
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
          >
            <RefreshCw size={14} /> สร้าง QR ใหม่
          </button>
        )}
      </div>
    </section>
  );
}
