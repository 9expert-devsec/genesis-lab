'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { adminLogin } from '@/lib/actions/auth';

const initialState = { error: null, require2fa: false };

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
      <h2 className="text-lg font-bold text-9e-navy mb-6">
        {isOtpStep ? 'ยืนยัน 2FA' : 'เข้าสู่ระบบผู้ดูแล'}
      </h2>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-9e-md">
          {state.error}
        </div>
      )}

      {!isOtpStep && (
        <>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-bold text-9e-navy mb-1.5"
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
              className="w-full border border-gray-200 rounded-9e-md px-4 py-3 text-sm
                text-9e-navy bg-white hover:border-9e-sky focus:outline-none
                focus:ring-2 focus:ring-9e-primary/20 focus:border-9e-primary
                transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-9e-navy mb-1.5"
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
                className="w-full border border-gray-200 rounded-9e-md px-4 py-3 pr-11 text-sm
                  text-9e-navy bg-white hover:border-9e-sky focus:outline-none
                  focus:ring-2 focus:ring-9e-primary/20 focus:border-9e-primary
                  transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-9e-slate
                  hover:text-9e-primary transition-colors"
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

          <p className="text-sm text-9e-slate flex items-center gap-2">
            <ShieldCheck size={16} className="text-9e-primary" />
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
              className="w-full border border-gray-200 rounded-9e-md px-4 py-3 text-2xl
                text-center tracking-[0.5em] font-bold
                text-9e-navy bg-white hover:border-9e-sky focus:outline-none
                focus:ring-2 focus:ring-9e-primary/20 focus:border-9e-primary
                transition-colors"
            />
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isPending || (isOtpStep && otp.length !== 6)}
        className="w-full flex items-center justify-center gap-2 py-3
          bg-9e-primary hover:bg-9e-brand text-white font-bold rounded-9e-md
          transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
      >
        {isPending ? (
          <>
            <span
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
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
          className="w-full text-9e-slate text-sm hover:text-9e-primary transition-colors"
        >
          ← กลับไปหน้าล็อกอิน
        </button>
      )}
    </form>
  );
}
