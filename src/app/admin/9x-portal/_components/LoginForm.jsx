'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { cva } from 'class-variance-authority';
import { AlertCircle, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { adminLogin } from '@/lib/actions/auth';

const initialState = { error: null, require2fa: false };

/**
 * ══ THE FIELD TREATMENT, AS A cva VARIANT RATHER THAN A className OVERRIDE ══
 *
 * All three inputs — email, password, OTP — share one surface, one border and
 * one focus ring. They differ only in padding and type scale. That difference
 * is a VARIANT here instead of a base string plus a per-input cn() override,
 * because in this repo an override of that shape does not work.
 *
 * cn() is twMerge, and twMerge does not know the custom 9e-* scales. Hand it
 * two radii from that scale and it keeps BOTH classes; the winner is whichever
 * Tailwind happens to emit later, and argument order does not decide it. The
 * same hazard reaches the colour utilities: a 9e-* text COLOUR and a text SIZE
 * are one group to Tailwind and an unknown pair to twMerge, so an OTP field
 * built by overriding the base's size would be a coin-flip on whether it kept
 * its text colour.
 *
 * (Class names are described rather than quoted throughout this file's
 * comments. Tailwind's JIT scans source as raw text, so a literal utility
 * inside a comment compiles into the stylesheet — a leaked radius was caught
 * in exactly this block.)
 *
 * cva concatenates and never merges, so each variant below carries its OWN
 * complete padding and type scale and no two of them collide.
 *
 * ── THE FOCUS RING IS AIR, NOT ACTION, AND THAT IS A MEASUREMENT ────────────
 * globals.css:172-176 already records it for the admin rail: --9e-action is
 * tuned for a white background and scores 3.29:1 on navy, where it all but
 * vanishes. --9e-air scores 7.40:1 on the same surface. This panel is the same
 * navy, so it takes the same ring. It is also why the ring cannot be lime: a
 * lime ring beside the lime submit button would make the focused field and the
 * button read as the same control.
 */
const field = cva(
  [
    'w-full rounded-9e-md border border-9e-border bg-9e-card text-9e-ice',
    'placeholder:text-9e-slate-dp-200',
    'transition-colors hover:border-9e-air/50',
    'focus:border-9e-air focus:outline-none focus:ring-2 focus:ring-9e-air/40',
    // SUBMITTING: read-only, NOT disabled. A disabled control is omitted
    // from the FormData the server action receives, so locking the fields
    // that way would change what gets submitted. `readOnly` locks editing
    // and submits the value unchanged.
    'read-only:cursor-not-allowed read-only:opacity-60',
  ],
  {
    variants: {
      tone: {
        // Plain single-line field.
        text: 'px-4 py-3 text-sm',
        // Same field with room on the right for the show/hide eye.
        withToggle: 'py-3 pl-4 pr-11 text-sm',
        // The 6-digit code. Its own padding and scale, not an override of `text`.
        otp: 'px-4 py-3 text-center text-2xl font-bold tracking-[0.5em]',
      },
    },
    defaultVariants: { tone: 'text' },
  }
);

/**
 * Admin login form.
 *
 * Single Server Action handles both phases:
 *   - First submit sends email + password (totp empty).
 *   - If the admin has 2FA enabled, the action returns
 *     `{ require2fa: true, email }`. The form then reveals the OTP
 *     input and resubmits with email + password + totp on the next
 *     click. We carry email/password forward in component state
 *     because the password field is intentionally cleared to satisfy
 *     password managers that auto-fill on every render.
 *
 * The session is granted only on the FINAL success — no partial auth,
 * no skip-OTP-by-navigating attack.
 *
 * ── THIS ROUND CHANGED THE SURFACE AND NOTHING ELSE ─────────────────────────
 * The action, the two-phase branch, the field names, the OTP length gate and
 * the back button all behave exactly as before. `state.error` is READ here, not
 * shaped: `adminLogin` already returns 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' itself
 * (src/lib/actions/auth.js:80), so the error copy needed no change on either
 * side of the wire. The four states this panel has to show — default, focused,
 * invalid credentials, submitting — were all already available: `state.error`
 * and `isPending` come straight out of useActionState, and BOTH steps read the
 * same two, so the OTP step gets the same four states as the first.
 */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    adminLogin,
    initialState
  );

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const otpInputRef = useRef(null);
  const isOtpStep = state?.require2fa === true;

  // When the action returns require2fa for the first time, focus the
  // OTP input. Stays in step 2 if the user fat-fingers the OTP.
  useEffect(() => {
    if (isOtpStep) otpInputRef.current?.focus();
  }, [isOtpStep]);

  function handleBack() {
    setOtp('');
    // Re-render with initial state by reloading form context — easiest
    // way is a navigation reset.
    window.location.reload();
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="mb-8">
        <h2 className="font-heading text-2xl font-bold text-9e-ice">
          {isOtpStep ? 'ยืนยัน 2FA' : 'เข้าสู่ระบบผู้ดูแล'}
        </h2>
        <p className="mt-2 text-sm text-9e-slate-dp-300">
          สำหรับเจ้าหน้าที่ 9Expert Training เท่านั้น
        </p>
      </div>

      {/*
        ── THE ERROR BOX, AND ITS ONE DELIBERATE COLOUR EXCEPTION ────────────
        `text-red-400` is a raw Tailwind utility, not a CI token, and it is the
        ONLY colour on this page that is not a 9e-* token. That is intentional
        and it is NOT an oversight.

        There is no danger/error token in this design system: globals.css
        declares 188 custom properties and not one of them is --danger, --error
        or --destructive. The admin expresses danger as raw Tailwind reds
        instead, at scale — over 400 such utilities across the admin surface,
        the commonest being the 50 fill and the 600 and 700 texts. Minting
        --9e-danger here would create a token that ONE box in the whole admin
        honours while every one of those call sites keeps the literal, which is
        a worse state than having no token at all.

        Introducing that token is a design-system decision belonging to a
        separate pass over the whole admin, not to this page. Until then this
        box follows the existing convention, at the 400 step rather than the
        admin's more common 600 because this panel is dark: 600 does not
        survive on --9e-card, 400 does. (Those step numbers are spelled out
        rather than written as class names for the JIT reason noted above.)

        The container itself is tokens — the card fill and the dark border — so
        the exception is exactly one hue, on the text and its icon, and nothing
        else on the page.
      */}
      {state?.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-9e-md border border-9e-border bg-9e-card px-4 py-3"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-red-400">{state.error}</p>
        </div>
      )}

      {!isOtpStep && (
        <>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-bold text-9e-ice"
            >
              อีเมล
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@9expert.co.th"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isPending}
              className={field({ tone: 'text' })}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-bold text-9e-ice"
            >
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                readOnly={isPending}
                className={field({ tone: 'withToggle' })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-9e-sm text-9e-slate-dp-300 transition-colors hover:text-9e-air focus:outline-none focus-visible:ring-2 focus-visible:ring-9e-air"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </>
      )}

      {isOtpStep && (
        <>
          {/* Carry email + password forward as hidden fields so the
              same Server Action can complete sign-in with all three. */}
          <input type="hidden" name="email" value={state?.email ?? email} />
          <input type="hidden" name="password" value={password} />

          <p className="flex items-center gap-2 text-sm text-9e-slate-dp-300">
            <ShieldCheck size={16} className="text-9e-air" />
            กรอกรหัส 6 หลักจาก Google Authenticator
          </p>

          <div>
            <label htmlFor="totp" className="sr-only">
              รหัส OTP
            </label>
            <input
              ref={otpInputRef}
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              readOnly={isPending}
              className={field({ tone: 'otp' })}
            />
          </div>
        </>
      )}

      {/*
        ── LIME, AND WHERE THE 10% GOES ─────────────────────────────────────
        The CI ratio is Blues 60 / Highlights 30 / Lime 10, and on this page the
        ENTIRE lime budget is this one button: nothing else in either column is
        lime, and no body text anywhere is. Navy text on it, not ice — --9e-lime
        is a bright accent and --9e-navy on it measures 15.6:1, where ice on
        lime would be unreadable. Hover and pressed are the scale's own steps
        (lime-lt / lime-dk) rather than an opacity trick, so the button never
        dims toward the panel behind it.

        The focus ring is air like every other control here, offset against the
        navy page so the ring reads as a ring and not as a second border.
      */}
      <button
        type="submit"
        disabled={isPending || (isOtpStep && otp.length !== 6)}
        className="flex w-full items-center justify-center gap-2 rounded-9e-md bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime-lt active:bg-9e-lime-dk focus:outline-none focus-visible:ring-2 focus-visible:ring-9e-air focus-visible:ring-offset-2 focus-visible:ring-offset-9e-navy disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-9e-navy/30 border-t-9e-navy"
              aria-hidden
            />
            กำลังตรวจสอบ...
          </>
        ) : (
          <>
            <LogIn size={16} />
            {isOtpStep ? 'ยืนยัน OTP' : 'เข้าสู่ระบบ'}
          </>
        )}
      </button>

      {isOtpStep && (
        <button
          type="button"
          onClick={handleBack}
          className="w-full rounded-9e-sm text-sm text-9e-slate-dp-300 transition-colors hover:text-9e-air focus:outline-none focus-visible:ring-2 focus-visible:ring-9e-air"
        >
          ← กลับไปหน้าล็อกอิน
        </button>
      )}
    </form>
  );
}
