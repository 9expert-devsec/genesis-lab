'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';

import {
  prepareWebrootReplacement,
  recordWebrootReplacement,
  listWebrootReplacements,
} from '@/lib/actions/webroot-documents';
import {
  PHASE,
  PROPAGATION,
  WEBROOT_PROPAGATION_BUDGET_MS,
  canStartUpload,
  fetchWebrootBytes,
  pollForPropagation,
  remedyFor,
  sha256Hex,
} from '@/lib/webroot/propagation.mjs';
import { WEBROOT_CONTENT_TYPE, refuseWebrootSize } from '@/lib/webrootDocuments.mjs';

/**
 * REPLACE ONE OF THE THREE SITE-ROOT PDFs.
 *
 * ══ WHAT THIS COMPONENT DOES NOT DECIDE ═════════════════════════════════════
 *
 * It never composes a pathname. `prepareWebrootReplacement` derives the target
 * from the filename, the upload route re-derives it AGAIN from the stored
 * receipt, and the only thing this component sends across is a receipt id. The
 * `pathname` handed to `upload()` comes from the server's own reply, so a bug
 * here cannot aim the overwrite anywhere.
 *
 * ══ THE ORDER, AND ONE DELIBERATE DEPARTURE ════════════════════════════════
 *
 *   prepare (archives + verifies + issues receipt)
 *   → client upload straight to Blob, receipt in clientPayload
 *   → RECORD
 *   → poll the public URL
 *
 * The record is written BEFORE the poll rather than after it. Once `upload()`
 * resolves, the bytes are live and the old ones exist only in the archive — so
 * the row describing that is the thing least able to afford waiting through a
 * 60-second window a closed tab would abandon. Polling only observes; it never
 * decides whether a replacement happened.
 */
export default function WebrootDocumentsClient({
  documents, initialRows, initialPrepared, initialError,
}) {
  const [rows, setRows] = useState(initialRows);
  const [prepared, setPrepared] = useState(initialPrepared);
  const [error, setError] = useState(initialError);

  const [selected, setSelected] = useState(documents[0]?.filename ?? '');
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);

  const busy = !canStartUpload(phase);
  const sizeRefusal = file ? refuseWebrootSize(file.size) : null;
  const canGo = Boolean(selected) && Boolean(file) && !sizeRefusal && !busy;

  const doc = documents.find((d) => d.filename === selected) ?? null;

  async function refreshHistory() {
    const next = await listWebrootReplacements();
    if (next.ok) {
      setRows(next.rows);
      setPrepared(next.prepared ?? []);
    }
  }

  /** Poll the PUBLIC url — what a visitor gets — not the Blob url. */
  async function runPoll(publicPath, expectedSha256) {
    setPhase(PHASE.POLLING);
    setNote('กำลังตรวจสอบว่าไฟล์ใหม่ให้บริการแล้วหรือยัง…');
    const outcome = await pollForPropagation(
      { url: publicPath, expectedSha256 },
      {
        fetchBytes: (u) => fetchWebrootBytes(u),
        hash: (bytes) => sha256Hex(bytes),
        nowMs: () => Date.now(),
        wait: (ms) => new Promise((r) => { setTimeout(r, ms); }),
      },
    );
    setResult(outcome);
    setPhase(outcome.status === PROPAGATION.VISIBLE ? PHASE.VISIBLE : PHASE.NOT_VISIBLE_YET);
    setNote('');
    return outcome;
  }

  async function onReplace() {
    if (!canGo || !doc) return;
    setError('');
    setResult(null);
    setNote('');

    // The hash of what the admin PICKED. Computed before anything is sent, so
    // the poll compares against the file on this machine rather than against
    // anything the server reports back about itself.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const localSha256 = await sha256Hex(bytes);

    setPhase(PHASE.PREPARING);
    setNote('กำลังสำรองไฟล์เดิม…');
    let prep;
    try {
      prep = await prepareWebrootReplacement({ filename: doc.filename, bytes: file.size });
    } catch (err) {
      setPhase(PHASE.REFUSED);
      setNote('');
      setError(`เตรียมการแทนที่ไม่สำเร็จ — ${err?.message ?? err}`);
      return;
    }
    if (!prep?.ok) {
      setPhase(PHASE.REFUSED);
      setNote('');
      setError(prep?.error ?? 'เตรียมการแทนที่ไม่สำเร็จ');
      await refreshHistory();
      return;
    }

    setPhase(PHASE.UPLOADING);
    setNote('กำลังอัปโหลด…');
    try {
      await upload(prep.blobPathname, file, {
        access: 'public',
        contentType: WEBROOT_CONTENT_TYPE,
        handleUploadUrl: '/api/admin/webroot-documents/upload',
        // THE ONLY VALUE THIS PAGE SENDS. The route reads the filename out of
        // the stored receipt, never out of here.
        clientPayload: JSON.stringify({ receiptId: prep.receiptId }),
      });
    } catch (err) {
      setPhase(PHASE.REFUSED);
      setNote('');
      setError(`อัปโหลดไม่สำเร็จ จึงยังไม่แทนที่ — ${err?.message ?? err}`);
      await refreshHistory();
      return;
    }

    // The bytes are live from here on. Record before observing.
    const recorded = await recordWebrootReplacement({
      filename: doc.filename,
      archivePathname: prep.archivePathname,
      bytes: file.size,
      contentType: WEBROOT_CONTENT_TYPE,
      sha256: localSha256,
    });
    if (!recorded?.ok) setError(recorded?.error ?? '');
    await refreshHistory();

    await runPoll(doc.publicPath, localSha256);
  }

  async function onRecheck() {
    if (!doc || !result) return;
    await runPoll(doc.publicPath, rows.find((r) => r.filename === doc.filename)?.sha256 || '');
    await refreshHistory();
  }

  const historyFor = (filename) => rows.filter((r) => r.filename === filename);

  return (
    <div className="mt-6 space-y-6">
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {/* ── pick one of the three ─────────────────────────────────────────── */}
      <div className="space-y-2">
        {documents.map((d) => {
          const latest = historyFor(d.filename)[0] ?? null;
          return (
            <label
              key={d.filename}
              className={`flex cursor-pointer items-start gap-3 rounded border p-3 ${
                selected === d.filename ? 'border-9e-action bg-9e-action/5' : 'border-9e-slate-dp-20'
              }`}
            >
              <input
                type="radio"
                name="webroot-document"
                className="mt-1"
                checked={selected === d.filename}
                disabled={busy}
                onChange={() => { setSelected(d.filename); setResult(null); setPhase(PHASE.IDLE); }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-9e-navy dark:text-white">{d.filename}</span>
                <a
                  href={d.publicPath}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-9e-action hover:underline"
                >
                  {d.publicPath}
                </a>
                <span className="mt-1 block text-xs text-9e-slate-dp-50">
                  {latest
                    ? `แทนที่ล่าสุด v${latest.version} · ${new Date(latest.uploadedAt).toLocaleString('th-TH')} · โดย ${latest.uploadedBy || '—'}`
                    : 'ยังไม่เคยแทนที่ผ่านหน้านี้'}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* ── choose a file ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          className="block w-full text-sm"
        />
        {sizeRefusal ? <p className="text-sm text-red-700">{sizeRefusal}</p> : null}

        <button
          type="button"
          onClick={onReplace}
          disabled={!canGo}
          className="rounded bg-9e-action px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'กำลังดำเนินการ…' : 'สำรองไฟล์เดิมแล้วแทนที่'}
        </button>
        {note ? <p className="text-sm text-9e-slate-dp-50">{note}</p> : null}
      </div>

      {/* ── the result, and the two caveats that must not live only in a comment ── */}
      {result ? (
        <div className="space-y-2 rounded border border-9e-slate-dp-20 p-3 text-sm">
          {result.status === PROPAGATION.VISIBLE ? (
            <p className="font-medium text-green-700">
              ไฟล์ใหม่ให้บริการแล้ว — ตรวจสอบจากเครื่องนี้เมื่อ {Math.round(result.elapsedMs / 1000)} วินาทีหลังอัปโหลด
              (ตรวจ {result.attempts} ครั้ง)
            </p>
          ) : (
            <p className="font-medium text-amber-700">
              ยังมองไม่เห็นไฟล์ใหม่จากเครื่องนี้ ภายใน {Math.round(WEBROOT_PROPAGATION_BUDGET_MS / 1000)} วินาที
              — <strong>ไม่ได้แปลว่าล้มเหลว</strong> การอัปโหลดสำเร็จและบันทึกประวัติแล้ว
            </p>
          )}

          <p className="text-xs text-9e-slate-dp-50">
            เครื่องนี้เห็น CDN เพียงจุดเดียว ผลที่ได้จึงเป็นค่า <strong>อย่างน้อย</strong> ไม่ใช่ค่าสูงสุด —
            จุดให้บริการอื่นอาจยังส่งไฟล์เดิมอยู่ และหน้านี้ไม่มีทางรู้
          </p>
          <p className="text-xs text-9e-slate-dp-50">
            นอกจากนี้ <strong>เบราว์เซอร์ของคุณเองก็เก็บสำเนาไว้</strong> ตามอายุแคชเดียวกัน
            และไม่มีอะไรฝั่งเซิร์ฟเวอร์ล้างแคชนั้นให้ — คนที่มักคิดว่า “ไม่สำเร็จ” คือคนที่เพิ่งอัปโหลดเอง
            ลองเปิดแบบไม่ใช้แคช (Ctrl+F5) หรือหน้าต่างส่วนตัว
          </p>

          {remedyFor(phase) === 'recheck' ? (
            <button
              type="button"
              onClick={onRecheck}
              disabled={busy}
              className="rounded border border-9e-action px-3 py-1.5 text-sm text-9e-action disabled:opacity-40"
            >
              ตรวจสอบอีกครั้ง
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── prepared-but-never-completed ──────────────────────────────────── */}
      {prepared.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            มีการเตรียมแทนที่ที่ยังไม่เสร็จ {prepared.length} รายการ
          </p>
          <p className="mt-1 text-xs text-amber-800">
            แต่ละรายการได้สำรองไฟล์เดิมไว้แล้วแต่ไม่มีการอัปโหลดตามมา ไฟล์สำรองยังอยู่ครบและไม่มีอะไรเสียหาย
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {prepared.map((p) => (
              <li key={p._id}>
                {p.filename} · {new Date(p.issuedAt).toLocaleString('th-TH')} · {p.issuedBy || '—'}
                {p.expired ? ' · หมดอายุแล้ว' : ' · ยังไม่หมดอายุ'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── history ───────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">ประวัติการแทนที่</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-9e-slate-dp-50">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="space-y-1 text-xs text-9e-slate-dp-50">
            {rows.map((r) => (
              <li key={r._id}>
                v{r.version} · {r.filename} · {(r.bytes / 1024 / 1024).toFixed(1)} MB ·{' '}
                {new Date(r.uploadedAt).toLocaleString('th-TH')} · {r.uploadedBy || '—'}
                {r.archivePathname ? ` · สำรองไว้ที่ ${r.archivePathname}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
