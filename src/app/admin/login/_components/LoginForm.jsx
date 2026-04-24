'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { adminLogin } from '@/lib/actions/auth';

const initialState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(adminLogin, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      <h2 className="text-lg font-bold text-9e-navy mb-6">เข้าสู่ระบบผู้ดูแล</h2>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-9e-md">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-bold text-9e-navy mb-1.5">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="admin@9expert.co.th"
          className="w-full border border-gray-200 rounded-9e-md px-4 py-3 text-sm
            text-9e-navy bg-white hover:border-9e-sky focus:outline-none
            focus:ring-2 focus:ring-9e-primary/20 focus:border-9e-primary
            transition-colors"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-bold text-9e-navy mb-1.5">
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

      <button
        type="submit"
        disabled={isPending}
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
            กำลังเข้าสู่ระบบ...
          </>
        ) : (
          <>
            <LogIn size={16} />
            เข้าสู่ระบบ
          </>
        )}
      </button>
    </form>
  );
}
