"use client";

import { Loader2, Lock } from "lucide-react";
import { formatTHB } from "@/lib/pricing";
import { CardFields } from "./CardFields";

/** Expanded card panel — lives in the left column once the user confirms. */
export function CardPanelFull({
  card,
  setCard,
  pricing,
  onCharge,
  onChangeMethod,
  submitting,
  processing,
  payError,
  cardValid,
  omiseReady,
}) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">
        ชำระเงินผ่านบัตรเครดิต / เดบิต
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        กรอกข้อมูลบัตรอย่างปลอดภัยผ่าน Card Secure Fields
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-9e-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        กรอกข้อมูลผ่าน Card Secure Fields จาก Payment Gateway
        โดยไม่เก็บเลขบัตรเต็มในระบบ
      </div>

      <div className="mt-4">
        <CardFields card={card} setCard={setCard} />
      </div>

      {payError && (
        <div className="mt-3 rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {payError}
        </div>
      )}

      <button
        type="button"
        onClick={onCharge}
        disabled={submitting || processing || !cardValid || !omiseReady}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50"
      >
        {submitting || processing ? (
          <>
            <Loader2 size={16} className="animate-spin" />{" "}
            {processing ? "กำลังตรวจสอบการชำระเงิน…" : "กำลังดำเนินการ…"}
          </>
        ) : (
          <>
            <Lock size={14} /> ชำระเงิน {formatTHB(pricing.total)} บาท
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onChangeMethod}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5"
      >
        เปลี่ยนวิธีชำระเงิน
      </button>
    </section>
  );
}
