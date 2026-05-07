'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SecurityClient({ initiallyEnabled, verifiedAt }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initiallyEnabled);

  // Setup state
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [secret, setSecret] = useState(null);
  const [setupToken, setSetupToken] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupOk, setSetupOk] = useState(false);

  // Disable state
  const [disableToken, setDisableToken] = useState('');
  const [disableError, setDisableError] = useState('');

  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setSetupError('');
    setSetupOk(false);
    try {
      const res = await fetch('/api/admin/2fa/setup', { method: 'GET' });
      const data = await res.json();
      if (!res.ok) {
        setSetupError(data?.error ?? 'ไม่สามารถสร้าง QR Code ได้');
      } else {
        setQrDataUrl(data.qrDataUrl);
        setSecret(data.secret);
      }
    } catch (err) {
      setSetupError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setLoading(true);
    setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, token: setupToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSetupError(data?.error ?? 'OTP ไม่ถูกต้อง');
      } else {
        setSetupOk(true);
        setEnabled(true);
        setQrDataUrl(null);
        setSecret(null);
        setSetupToken('');
        router.refresh();
      }
    } catch (err) {
      setSetupError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setLoading(true);
    setDisableError('');
    try {
      const res = await fetch('/api/admin/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disableToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDisableError(data?.error ?? 'OTP ไม่ถูกต้อง');
      } else {
        setEnabled(false);
        setDisableToken('');
        router.refresh();
      }
    } catch (err) {
      setDisableError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── ENABLED branch ────────────────────────────────────────────
  if (enabled) {
    return (
      <div className="flex flex-col gap-5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 text-green-600" />
          <div>
            <p className="font-medium text-[var(--text-primary)]">
              2FA เปิดใช้งานอยู่
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {verifiedAt
                ? `ยืนยันล่าสุด: ${new Date(verifiedAt).toLocaleString('th-TH')}`
                : 'ยังไม่มีการยืนยัน'}
            </p>
          </div>
        </div>

        <form onSubmit={confirmDisable} className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
          <p className="text-sm text-[var(--text-secondary)]">
            ต้องการปิดใช้ 2FA? กรอก OTP ปัจจุบันเพื่อยืนยัน
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={disableToken}
            onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ''))}
            className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3 text-center text-xl font-bold tracking-widest text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
          />
          {disableError && (
            <p className="text-sm text-red-600">{disableError}</p>
          )}
          <button
            type="submit"
            disabled={loading || disableToken.length !== 6}
            className="rounded-9e-md bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldOff size={16} />
              {loading ? 'กำลังปิด...' : 'ปิดใช้ 2FA'}
            </span>
          </button>
        </form>
      </div>
    );
  }

  // ── DISABLED branch ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      {!qrDataUrl && (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            ยังไม่ได้เปิดใช้ 2FA สำหรับบัญชีนี้
          </p>
          {setupOk && (
            <p className="rounded-9e-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              เปิดใช้ 2FA เรียบร้อย
            </p>
          )}
          {setupError && (
            <p className="rounded-9e-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {setupError}
            </p>
          )}
          <button
            type="button"
            onClick={startSetup}
            disabled={loading}
            className={cn(
              'w-fit rounded-9e-md bg-9e-action px-6 py-3 font-medium text-white',
              'transition-colors hover:bg-9e-brand disabled:opacity-50'
            )}
          >
            {loading ? 'กำลังสร้าง QR Code...' : 'เริ่มตั้งค่า 2FA'}
          </button>
        </>
      )}

      {qrDataUrl && (
        <form onSubmit={confirmSetup} className="flex flex-col gap-4">
          <h2 className="font-medium text-[var(--text-primary)]">
            สแกน QR Code ด้วย Authenticator App
          </h2>
          <div className="flex justify-center">
            {/* QR is a base64 data URL — use plain <img> instead of next/image */}
            <img
              src={qrDataUrl}
              alt="TOTP QR Code"
              className="h-48 w-48 rounded-9e-md border border-[var(--surface-border)] bg-white p-2"
            />
          </div>
          {secret && (
            <p className="text-center font-mono text-xs text-[var(--text-muted)]">
              หรือกรอกรหัสนี้ในแอป: <span className="break-all">{secret}</span>
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="กรอก OTP 6 หลักเพื่อยืนยัน"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value.replace(/\D/g, ''))}
            className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3 text-center text-xl font-bold tracking-widest text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
          />
          {setupError && (
            <p className="text-sm text-red-600">{setupError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setQrDataUrl(null);
                setSecret(null);
                setSetupToken('');
                setSetupError('');
              }}
              className="flex-1 rounded-9e-md border border-[var(--surface-border)] px-6 py-3 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || setupToken.length !== 6}
              className="flex-1 rounded-9e-md bg-9e-action px-6 py-3 font-medium text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
            >
              {loading ? 'กำลังยืนยัน...' : 'ยืนยันและเปิดใช้'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
