'use client';

import { useState } from 'react';
import Cropper from 'react-easy-crop';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  AVATAR_PREVIEW_SIZES,
  previewImageStyle,
} from '@/lib/writers/avatarCrop';

/**
 * Drag and zoom a photo inside a circle. Reports the crop in pixels through
 * `onApply`; rendering and uploading it belongs to the field that opened this.
 *
 * `onCropAreaChange` rather than `onCropComplete`: the second fires when the
 * pointer lifts, and the preview circles have to follow the drag.
 */
export function AvatarCropDialog({ src, busy, error, onApply, onPickAgain, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(AVATAR_MIN_ZOOM);
  const [area, setArea] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="ปรับรูปโปรไฟล์" data-testid="crop-dialog">
      <div className="max-h-full w-full max-w-[448px] overflow-y-auto rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">ปรับรูปโปรไฟล์</h2>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            disabled={busy}
            className="rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-9e-md bg-9e-navy" data-testid="crop-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={AVATAR_MIN_ZOOM}
            maxZoom={AVATAR_MAX_ZOOM}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropAreaChange={(percent, pixels) => setArea({ percent, pixels })}
          />
        </div>

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          ลากรูปเพื่อเลื่อนตำแหน่ง · เลื่อนแถบเพื่อซูม — ส่วนในวงกลมคือสิ่งที่แสดงบนเว็บ
        </p>

        <div className="mt-3 flex items-center gap-2">
          <ZoomOut className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="range"
            min={AVATAR_MIN_ZOOM}
            max={AVATAR_MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label="ซูม"
            data-testid="crop-zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-9e-action"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        </div>

        <div className="mt-4 flex items-end gap-3" data-testid="crop-previews">
          {AVATAR_PREVIEW_SIZES.map((size) => (
            <div
              key={size}
              className="relative overflow-hidden rounded-full border border-[var(--surface-border)] bg-9e-ice"
              style={{ width: size, height: size }}
            >
              {area && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  data-testid={`crop-preview-${size}`}
                  className="absolute max-w-none"
                  style={previewImageStyle(area.percent, size)}
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onPickAgain}
            disabled={busy}
            className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            เลือกไฟล์ใหม่
          </button>
          <button
            type="button"
            onClick={() => area && onApply(area.pixels)}
            disabled={busy || !area}
            data-testid="crop-apply"
            className="rounded-9e-md bg-9e-action px-3 py-1.5 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {busy ? 'กำลังอัปโหลด…' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>
  );
}
