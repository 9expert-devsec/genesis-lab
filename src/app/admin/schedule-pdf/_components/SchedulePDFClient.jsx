'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react';
import {
  uploadSchedulePDF,
  deleteSchedulePDF,
} from '@/lib/actions/schedule-pdf';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function SchedulePDFClient({ current }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setError('');
    setSuccess('');
    if (f && f.type && f.type !== 'application/pdf') {
      setError('รองรับเฉพาะไฟล์ PDF');
      setFile(null);
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('กรุณาเลือกไฟล์ PDF');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await uploadSchedulePDF(fd);
      if (!res.ok) {
        setError(res.error ?? 'อัปโหลดไม่สำเร็จ');
      } else {
        setSuccess('อัปโหลดเรียบร้อย');
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('ลบไฟล์ PDF ปัจจุบัน?')) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteSchedulePDF();
      setSuccess('ลบเรียบร้อย');
      router.refresh();
    } catch (err) {
      setError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Current file info */}
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-9e-md bg-9e-action/10 text-9e-action">
            <FileText className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            {current?.url ? (
              <>
                <p className="truncate text-sm font-semibold text-9e-navy dark:text-white">
                  {current.filename || 'schedule.pdf'}
                </p>
                <p className="mt-0.5 text-xs text-9e-slate">
                  อัปโหลดเมื่อ {formatDate(current.uploadedAt)}
                  {current.uploadedBy ? ` · ${current.uploadedBy}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-9e-sm border border-9e-action px-3 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    เปิดไฟล์
                  </a>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? 'กำลังลบ...' : 'ลบไฟล์'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-9e-slate">ยังไม่มีไฟล์อัปโหลด</p>
            )}
          </div>
        </div>
      </div>

      {/* Upload form */}
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
        <p className="mb-3 text-sm font-semibold text-9e-navy dark:text-white">
          {current?.url ? 'อัปโหลดไฟล์ใหม่' : 'อัปโหลดไฟล์'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          className="block w-full text-sm text-9e-slate file:mr-3 file:rounded-9e-sm file:border-0 file:bg-9e-action/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-9e-action hover:file:bg-9e-action/20"
        />
        {file ? (
          <p className="mt-2 text-xs text-9e-slate">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || submitting}
          className="mt-4 inline-flex items-center gap-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0047CC] disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {submitting ? 'กำลังอัปโหลด...' : 'อัปโหลด PDF'}
        </button>

        {error ? (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        ) : null}
        {success ? (
          <p className="mt-3 text-sm text-green-600">{success}</p>
        ) : null}
      </div>
    </div>
  );
}
