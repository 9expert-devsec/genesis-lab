"use client";

import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CARD_BRAND_LABEL,
  cardNumberValid,
  cvcMax,
  detectCardBrand,
  expiryValid,
  formatCardNumber,
  formatExpiry,
} from "./card";

/**
 * Card entry form. The brand is shown as a text label (the masterclass
 * presentation) rather than a remote logo image, so the masterclass page
 * renders unchanged after the extraction.
 */
export function CardFields({ card, setCard }) {
  const brand = detectCardBrand(card.number);
  const numDigits = card.number.replace(/\D/g, "");
  const numError = numDigits.length > 0 && !cardNumberValid(card.number, brand);
  const expError = card.expiry.length > 0 && !expiryValid(card.expiry);
  const cvcError = card.cvc.length > 0 && card.cvc.length !== cvcMax(brand);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label htmlFor="card-number">หมายเลขบัตร</Label>
          {numDigits.length > 0 && (
            <span className="text-xs font-semibold text-9e-action">
              {CARD_BRAND_LABEL[brand]}
            </span>
          )}
        </div>
        <Input
          id="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(e) =>
            setCard((c) => ({
              ...c,
              number: formatCardNumber(
                e.target.value,
                detectCardBrand(e.target.value),
              ),
            }))
          }
        />
        {numError && (
          <p className="mt-1 text-xs text-red-500">หมายเลขบัตรไม่ถูกต้อง</p>
        )}
      </div>
      <div>
        <Label htmlFor="card-name">ชื่อบนบัตร</Label>
        <Input
          id="card-name"
          autoComplete="cc-name"
          placeholder="NAME SURNAME"
          value={card.name}
          onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="card-expiry">วันหมดอายุ (MM/YY)</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            maxLength={5}
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) =>
              setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))
            }
          />
          {expError && (
            <p className="mt-1 text-xs text-red-500">วันหมดอายุไม่ถูกต้อง</p>
          )}
        </div>
        <div>
          <Label htmlFor="card-cvc">CVC</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={brand === "amex" ? "1234" : "123"}
            value={card.cvc}
            onChange={(e) =>
              setCard((c) => ({
                ...c,
                cvc: e.target.value
                  .replace(/\D/g, "")
                  .slice(0, cvcMax(detectCardBrand(card.number))),
              }))
            }
          />
          {cvcError && (
            <p className="mt-1 text-xs text-red-500">CVC ไม่ถูกต้อง</p>
          )}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Lock className="h-3.5 w-3.5" />
        ข้อมูลบัตรถูกเข้ารหัสและส่งตรงไปยัง Omise — เราไม่เก็บเลขบัตรของคุณ
      </p>
    </div>
  );
}
