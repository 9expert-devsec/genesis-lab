'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Copy, Check, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  enablePreviewLink, regeneratePreviewPassword, setPreviewExpiry, revokePreviewAccess,
  getPreviewState,
} from '@/lib/actions/pageBuilder';
import { Field, Group, TextInput, Warn, INPUT_CLASS } from './fields';
import { useEditor } from './EditorProvider';

/**
 * Preview link management (item 6). Wires the existing preview actions —
 * enable / regenerate / expiry / revoke — which own the bcrypt hashing and the
 * tier gate; this dialog only calls them.
 *
 * ── These write to the SERVER immediately ────────────────────────────────
 * Unlike everything else in the editor, these are NOT part of the page tree and
 * do NOT ride autosave: each action writes the preview block straight to the
 * doc. That is the actions' design (passwordHash is set server-side and must
 * never enter the working tree), but it means the buttons here behave
 * differently from the rest of the editor, so the dialog says so — an author
 * who assumes "nothing is saved until I hit save" would otherwise be wrong in
 * exactly one place, and only about credentials.
 *
 * A password is shown ONCE, on enable/regenerate, because only the hash is
 * stored. Revoking or rotating invalidates outstanding cookies (the signed
 * preview cookie's HMAC covers passwordHash + passwordUpdatedAt), which is the
 * property that makes revoke meaningful rather than cosmetic.
 */
export function PreviewDialog({ open, onClose }) {
  const { page, pageId, tier } = useEditor();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Only a GENERATED password lands here — the admin never types it, so it is
  // the one value they can't recover any other way. A typed password is never
  // put in state at all (they already have it). Even this stays hidden until an
  // explicit reveal; the default screen must not contain a password.
  const [generated, setGenerated] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');   // non-secret confirmation text
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);     // URL copy
  const [pwCopied, setPwCopied] = useState(false); // generated-password copy
  const [state, setState] = useState(null);   // fresh server state, never the tree's

  const slug = String(page?.slug ?? '');
  const url = slug ? `/preview/${slug}` : '';

  // The working tree's `preview` is a mount-time snapshot the preview actions
  // never update — reading it would report a revoked link as active. Always ask
  // the server, and re-ask after every mutation.
  const refresh = useCallback(() => {
    if (!pageId) return;
    getPreviewState(pageId).then(setState).catch(() => setState(null));
  }, [pageId]);

  useEffect(() => {
    if (open) { refresh(); return undefined; }
    // Closing clears the one-time secret and any notice — reopening must not
    // resurface a password that was only ever meant to be shown once.
    setGenerated(''); setRevealed(false); setNotice(''); setError('');
    return undefined;
  }, [open, refresh]);

  const run = async (name, fn) => {
    setBusy(name); setError('');
    try {
      const res = await fn();
      if (!res?.ok) { setError(res?.error ?? 'ทำรายการไม่สำเร็จ'); return null; }
      refresh();
      return res;
    } catch (e) {
      setError(e?.message ?? 'ทำรายการไม่สำเร็จ');
      return null;
    } finally {
      setBusy('');
    }
  };

  const onEnable = async () => {
    const res = await run('enable', () => enablePreviewLink(pageId, input));
    // The admin typed this password — do NOT echo it back. Confirm, and clear.
    if (res) { setGenerated(''); setRevealed(false); setNotice('เปิดใช้งานลิงก์พรีวิวด้วยรหัสที่ตั้งไว้แล้ว'); setInput(''); }
  };
  const onRegenerate = async () => {
    const res = await run('regen', () => regeneratePreviewPassword(pageId));
    // Generated server-side — the ONLY time this value is knowable. Held for a
    // one-time reveal, not shown outright.
    if (res?.password) { setGenerated(res.password); setRevealed(false); setNotice(''); }
  };
  const onRevoke = async () => {
    const res = await run('revoke', () => revokePreviewAccess(pageId));
    if (res) { setGenerated(''); setRevealed(false); setNotice('ปิดการเข้าถึงแล้ว — ลิงก์ที่เปิดค้างไว้ใช้ไม่ได้'); }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setPwCopied(true);
      setTimeout(() => setPwCopied(false), 1500);
    } catch { setRevealed(true); /* clipboard blocked — reveal so it can be copied by hand */ }
  };
  const onExpiry = async (v) => {
    await run('expiry', () => setPreviewExpiry(pageId, v || null));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the URL is on screen to copy by hand */ }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'max-h-[calc(100dvh-4rem)] overflow-y-auto'
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">ลิงก์พรีวิว</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">จัดการลิงก์พรีวิวที่ป้องกันด้วยรหัสผ่าน</Dialog.Description>

          {!pageId && <Warn>ต้องบันทึกหน้านี้ก่อนจึงจะสร้างลิงก์พรีวิวได้</Warn>}
          {!slug && pageId && <Warn>ต้องตั้ง URL (slug) ก่อนจึงจะมีลิงก์พรีวิว</Warn>}
          {!tier?.canManagePreview && <Warn>ต้องมีสิทธิ์ marketing ขึ้นไปเพื่อจัดการลิงก์พรีวิว</Warn>}
          {error && <Warn tone="red">{error}</Warn>}

          {notice && !generated && (
            <p className="mb-3 rounded-9e-md bg-9e-ice px-2 py-1.5 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
              {notice}
            </p>
          )}

          {/* A GENERATED password, shown ONCE and only behind an explicit
              reveal — the default state is masked. Only the hash is stored, so
              this is the single chance to capture it; copy works without ever
              revealing it on screen. */}
          {generated && (
            <div className="mb-3 rounded-9e-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <p className="mb-1 font-bold">รหัสผ่านใหม่ (แสดงครั้งเดียว)</p>
              <div className="flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate rounded bg-white/60 px-1.5 py-1 font-mono dark:bg-black/20">
                  {revealed ? generated : '•'.repeat(generated.length)}
                </code>
                <button type="button" onClick={() => setRevealed((v) => !v)}
                  aria-label={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="rounded p-1 hover:bg-white/50 dark:hover:bg-black/20">
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={copyPassword} aria-label="คัดลอกรหัสผ่าน"
                  className="rounded p-1 hover:bg-white/50 dark:hover:bg-black/20">
                  {pwCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1">คัดลอกเก็บไว้ตอนนี้ — ระบบเก็บเฉพาะค่าที่เข้ารหัสแล้ว จะดูซ้ำไม่ได้</p>
            </div>
          )}

          {state && (
            <p className="mb-3 text-[11px] text-9e-slate-dp-50">
              สถานะ:{' '}
              <span className={cn('font-bold', state.status === 'active' ? 'text-green-700 dark:text-green-400' : 'text-9e-navy dark:text-white')}>
                {state.status === 'active' ? 'เปิดใช้งานอยู่' : state.status === 'expired' ? 'หมดอายุแล้ว' : 'ปิดอยู่'}
              </span>
              {state.expireDate && ` · หมดอายุ ${String(state.expireDate).slice(0, 10)}`}
            </p>
          )}

          {url && (
            <Group title="ลิงก์">
              <div className="flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate rounded-9e-md bg-9e-ice px-2 py-1 font-mono text-[10px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
                  {url}
                </code>
                <button type="button" onClick={copy} aria-label="คัดลอกลิงก์"
                  className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label="เปิดลิงก์"
                  className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </Group>
          )}

          <Group title="รหัสผ่าน">
            <p className="mb-2 text-[10px] text-9e-slate-dp-50">
              ปุ่มในส่วนนี้บันทึกลงเซิร์ฟเวอร์ทันที ไม่ต้องกด “บันทึกฉบับร่าง”
            </p>
            <Field label="ตั้งรหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร (หรือกด “สุ่มรหัสใหม่” เพื่อรหัสที่ปลอดภัย)">
              <TextInput value={input} onChange={setInput} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={onEnable}
                disabled={!pageId || !tier?.canManagePreview || input.length < 8 || Boolean(busy)}
                className={cn(INPUT_CLASS, 'w-auto cursor-pointer font-medium disabled:opacity-40')}>
                {busy === 'enable' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'เปิดใช้งาน'}
              </button>
              <button type="button" onClick={onRegenerate}
                disabled={!pageId || !tier?.canManagePreview || Boolean(busy)}
                className={cn(INPUT_CLASS, 'w-auto cursor-pointer disabled:opacity-40')}>
                {busy === 'regen' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'สุ่มรหัสใหม่'}
              </button>
              <button type="button" onClick={onRevoke}
                disabled={!pageId || !tier?.canManagePreview || Boolean(busy)}
                className={cn(INPUT_CLASS, 'w-auto cursor-pointer text-red-600 disabled:opacity-40')}>
                {busy === 'revoke' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ปิดการเข้าถึง'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-9e-slate-dp-50">
              การสุ่มรหัสใหม่หรือปิดการเข้าถึงจะทำให้ลิงก์ที่เปิดค้างไว้ใช้ไม่ได้ทันที
            </p>
          </Group>

          <Group title="วันหมดอายุ">
            <Field label="หมดอายุเมื่อ" hint="เว้นว่าง = ไม่มีวันหมดอายุ">
              <input type="date" className={INPUT_CLASS}
                key={state?.expireDate ?? 'none'}   // re-seed when the fresh read lands
                defaultValue={state?.expireDate ? String(state.expireDate).slice(0, 10) : ''}
                disabled={!pageId || !tier?.canManagePreview}
                onChange={(e) => onExpiry(e.target.value)} />
            </Field>
          </Group>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
