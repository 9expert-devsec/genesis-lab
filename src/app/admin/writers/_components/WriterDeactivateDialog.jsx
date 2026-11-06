'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getWriterDeactivationPreview, setWriterActive } from '@/lib/actions/writers';
import { writerPath, DEFAULT_WRITER_PATH } from '@/lib/writers/writerUrls';
import { WriterAvatar } from './WriterAvatar';

/**
 * Deactivating a writer, for the list toggle and the edit page.
 *
 * The numbers here are a preview. setWriterActive recounts when it runs, so an
 * article saved while the dialog is open is still moved correctly.
 *
 * A writer with no articles has nothing to explain, and gets a plain confirm.
 *
 * @param {object} options
 * @param {() => void} options.onDone
 * @param {(message: string) => void} options.onError
 */
export function useWriterDeactivation({ onDone, onError }) {
  const [target, setTarget] = useState(null);
  const [working, setWorking] = useState(false);

  async function deactivate(writer) {
    setWorking(true);
    try {
      const res = await setWriterActive(writer._id, false);
      if (res?.ok) onDone();
      else onError(res?.error ?? 'บันทึกไม่สำเร็จ');
    } catch (err) {
      onError(err?.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setWorking(false);
      setTarget(null);
    }
  }

  async function begin(writer) {
    const preview = await getWriterDeactivationPreview(writer._id);
    if (!preview?.ok) {
      onError(preview?.error ?? 'บันทึกไม่สำเร็จ');
      return;
    }
    if (preview.total > 0) {
      setTarget({ writer, preview });
    } else if (window.confirm(`ปิดใช้งาน "${writer.displayName}"?`)) {
      await deactivate(writer);
    }
  }

  const dialog = target ? (
    <WriterDeactivateDialog
      writer={target.writer}
      preview={target.preview}
      working={working}
      onCancel={() => setTarget(null)}
      onConfirm={() => deactivate(target.writer)}
    />
  ) : null;

  return { begin, dialog };
}

export function WriterDeactivateDialog({ writer, preview, working, onCancel, onConfirm }) {
  const name = writer.displayName;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="writer-deactivate-title"
      data-testid="writer-deactivate-dialog"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-9e-md bg-white p-5 shadow-9e-md dark:bg-[#111d2c]">
        <h2 id="writer-deactivate-title" className="text-base font-bold text-9e-navy dark:text-white">
          ปิดใช้งาน {name}?
        </h2>

        <div className="mt-4 flex items-center justify-center gap-3 rounded-9e-md bg-9e-ice p-4 dark:bg-[#0D1B2A]">
          <WriterAvatar publicId={writer.avatarPublicId} px={48} source={128} />
          <div className="flex flex-col items-center text-xs font-medium text-[var(--text-secondary)]">
            <span>{preview.total} บทความ</span>
            <ArrowRight className="h-4 w-4 text-9e-action" aria-hidden="true" />
          </div>
          <WriterAvatar publicId={preview.academy.avatarPublicId} px={48} source={128} />
        </div>

        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[var(--text-secondary)]">
          <li>บทความ {preview.sole} รายการที่ {name} เขียนคนเดียว → ผู้เขียนเปลี่ยนเป็น {preview.academy.displayName}</li>
          <li>บทความ {preview.coWritten} รายการที่เขียนร่วมกับคนอื่น → เอาชื่อ {name} ออก</li>
          <li>หน้า {writerPath(writer.slug)} จะ redirect ไปที่ {DEFAULT_WRITER_PATH}</li>
          <li>เปิดใช้งานอีกครั้งได้ แต่บทความที่โอนไปแล้วจะไม่ย้ายกลับอัตโนมัติ</li>
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={working}
            data-testid="writer-deactivate-confirm"
            className="rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {working ? 'กำลังโอนบทความ…' : 'ปิดใช้งานและโอนบทความ'}
          </button>
        </div>
      </div>
    </div>
  );
}
