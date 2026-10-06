"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { OPTIONAL_CATEGORIES } from "@/lib/consentCategories";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CookieBanner — LAYER 1 of the two-layer consent UI (round CB-C).
 *  PRESENTATION ONLY. The consent it collects IS honoured — by the mount.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The CB-A3 single-layer card (four pills, two buttons, the mascot) is gone.
 * Layer 1 now asks one question with two equal answers and a way into the
 * detail:
 *
 *   ยอมรับทั้งหมด  /  ปฏิเสธทั้งหมด     — IDENTICAL size, stacked, full width
 *   ตั้งค่าเพิ่มเติม                    — opens layer 2 (CookieSettingsDialog)
 *
 * EQUAL WEIGHT IS THE POINT. Accept and reject are the same height, the same
 * width, the same type size; only the fill differs. A reject that is smaller,
 * lower or hidden behind "settings" is the dark pattern regulators name first.
 *
 * NOT A MODAL. It is a labelled `region`: the page behind stays usable, focus
 * is not moved into it, and there is no × — dismissing without choosing is not
 * an answer, and layer 1 is the place that keeps asking.
 *
 * ── PRESENTATION ONLY IS A RULE, NOT A STATUS ───────────────────────────────
 * No cookie, no storage, no gtag here. The mount (CookieConsentBanner.jsx) owns
 * every side effect, in one readable order. test/render/cookieBannerMarkup
 * scans this file for `gtag`, `dataLayer`, `document.cookie`, `localStorage`
 * and `sessionStorage` and fails if any appears.
 *
 * The mascot is no longer rendered (CookieMascot.jsx stays in the tree, unused).
 */

/** Re-exported so imports that reach for the list at this path keep working. */
export { OPTIONAL_CATEGORIES };

/** Shared chrome for the two equal buttons: min-height 46, radius 12, 15px bold. */
const BIG_BUTTON = cn(
  "flex min-h-[40px] w-full items-center justify-center rounded-[12px] px-4",
  "text-[14px] font-bold leading-tight",
  "transition-colors duration-9e-micro ease-9e",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-9e-action",
);

export const COOKIE_BANNER_TITLE = "ช่วยเราปรับเว็บให้ตรงกับคุณมากขึ้น";

/**
 * @param onAcceptAll      "ยอมรับทั้งหมด"
 * @param onRejectAll      "ปฏิเสธทั้งหมด"
 * @param onOpenSettings   "ตั้งค่าเพิ่มเติม" — receives the click event, so the
 *                         mount knows which control to return focus to.
 */
export function CookieBanner({ className, onAcceptAll, onRejectAll, onOpenSettings }) {
  return (
    <section
      role="region"
      aria-labelledby="cookie-banner-title"
      className={cn(
        "flex w-full flex-col rounded-[20px] px-[24px] py-[20px]",
        "bg-white text-9e-navy dark:bg-[var(--surface-raised)] dark:text-[var(--text-primary)]",
        "border border-9e-slate-lt-300 dark:border-9e-border",
        "shadow-[0_12px_32px_rgba(15,23,42,0.18)]",
        className,
      )}
    >
      <h2
        id="cookie-banner-title"
        className="text-[16px] font-bold leading-snug text-[var(--text-primary)]"
      >
        {COOKIE_BANNER_TITLE}
      </h2>

      <p className="mt-1 text-[14px] leading-[1.5] text-[var(--text-secondary)]">
        คุกกี้วิเคราะห์ช่วยให้เรารู้ว่าหลักสูตรและบทความไหนมีประโยชน์ ส่วนคุกกี้การตลาดใช้แสดงโปรโมชันที่เกี่ยวข้อง
        เปลี่ยนใจได้ทุกเมื่อที่ &quot;ตั้งค่าคุกกี้&quot; ท้ายเว็บ{" "}
        <Link
          href="/cookie-policy"
          className="font-semibold text-9e-action underline underline-offset-2 hover:no-underline dark:text-9e-air"
        >
          นโยบายคุกกี้
        </Link>
      </p>

      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={onAcceptAll}
          className={cn(BIG_BUTTON, "bg-[#005CFF] text-white hover:brightness-90 dark:bg-9e-air dark:text-9e-navy")}
        >
          ยอมรับทั้งหมด
        </button>
        <button
          type="button"
          onClick={onRejectAll}
          className={cn(
            BIG_BUTTON,
            "border-2 border-[#005CFF] bg-white text-[#005CFF] hover:bg-9e-action-scale-950",
            "dark:border-9e-air dark:bg-transparent dark:text-9e-air dark:hover:bg-white/5",
          )}
        >
          ปฏิเสธทั้งหมด
        </button>
      </div>

      <button
        type="button"
        data-cookie-layer1-settings=""
        onClick={onOpenSettings}
        className={cn(
          "mx-auto mt-1 px-3 text-[14px] font-semibold",
          "text-[#005CFF] underline underline-offset-2 hover:no-underline dark:text-9e-air",
        )}
      >
        ตั้งค่าเพิ่มเติม
      </button>
    </section>
  );
}
