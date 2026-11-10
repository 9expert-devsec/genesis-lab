import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_OUTPUT_SIZE,
  clampCropArea,
  previewImageStyle,
  renderCroppedBlob,
} from '@/lib/writers/avatarCrop';

const natural = { width: 1000, height: 600 };

test('CONTROL: a crop inside the image comes back as whole pixels, unchanged', () => {
  assert.deepEqual(
    clampCropArea({ x: 100.4, y: 50.6, width: 300.2, height: 300.2 }, natural),
    { x: 100, y: 51, width: 300, height: 300 },
  );
});

test('a crop past the right and bottom edges is pulled back inside', () => {
  assert.deepEqual(
    clampCropArea({ x: 900, y: 500, width: 200, height: 200 }, natural),
    { x: 800, y: 400, width: 200, height: 200 },
  );
});

test('a crop starting before the image is pulled in', () => {
  assert.deepEqual(
    clampCropArea({ x: -3, y: -0.4, width: 100, height: 100 }, natural),
    { x: 0, y: 0, width: 100, height: 100 },
  );
});

test('a crop larger than the short side shrinks to it and stays square', () => {
  assert.deepEqual(
    clampCropArea({ x: 0, y: 0, width: 900, height: 900 }, natural),
    { x: 0, y: 0, width: 600, height: 600 },
  );
});

test('a non-square report takes the smaller side rather than stretching', () => {
  const area = clampCropArea({ x: 0, y: 0, width: 301, height: 299 }, natural);
  assert.equal(area.width, area.height);
  assert.equal(area.width, 299);
});

test('a broken report still yields a drawable one-pixel area', () => {
  assert.deepEqual(clampCropArea({}, natural), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(clampCropArea(null, null), { x: 0, y: 0, width: 1, height: 1 });
});

test('the preview at 100% zoom on a square image fills the circle exactly', () => {
  assert.deepEqual(
    previewImageStyle({ x: 0, y: 0, width: 100, height: 100 }, 96),
    { width: 96, height: 96, left: -0, top: -0 },
  );
});

test('the preview shows the same region at every size', () => {
  const percent = { x: 25, y: 10, width: 50, height: 50 };
  for (const size of [96, 48, 28]) {
    const style = previewImageStyle(percent, size);
    assert.equal(style.width, size * 2);
    assert.ok(Math.abs(-style.left / style.width - 0.25) < 1e-9);
    assert.ok(Math.abs(-style.top / style.height - 0.1) < 1e-9);
  }
});

/** A canvas that records what was painted and encodes as told. */
function fakeCanvas({ encodes = {} } = {}) {
  const calls = [];
  const canvas = {
    calls,
    getContext: () => ({
      clearRect: () => calls.push(['clear']),
      fillRect: () => calls.push(['fill', canvas.ctxFill]),
      set fillStyle(value) { canvas.ctxFill = value; },
      drawImage: (...args) => calls.push(['draw', ...args.slice(1)]),
    }),
    toBlob: (done, type, quality) => {
      calls.push(['encode', type, quality]);
      const out = type in encodes ? encodes[type] : { type, size: 1 };
      done(out);
    },
  };
  return canvas;
}

const image = { naturalWidth: 1000, naturalHeight: 600 };
const area = { x: 100, y: 50, width: 300, height: 300 };

test('the output is a 512 square drawn from exactly the cropped region', async () => {
  const canvas = fakeCanvas();
  const blob = await renderCroppedBlob(image, area, { canvas });
  assert.equal(AVATAR_OUTPUT_SIZE, 512);
  assert.equal(canvas.width, 512);
  assert.equal(canvas.height, 512);
  assert.deepEqual(canvas.calls.find((c) => c[0] === 'draw').slice(1), [100, 50, 300, 300, 0, 0, 512, 512]);
  assert.equal(blob.type, 'image/webp');
});

test('the crop is clamped before it is drawn', async () => {
  const canvas = fakeCanvas();
  await renderCroppedBlob(image, { x: 900, y: 500, width: 200, height: 200 }, { canvas });
  assert.deepEqual(canvas.calls.find((c) => c[0] === 'draw').slice(1, 5), [800, 400, 200, 200]);
});

test('a browser that answers WebP with PNG falls back to JPEG on white', async () => {
  const canvas = fakeCanvas({ encodes: { 'image/webp': { type: 'image/png', size: 1 } } });
  const blob = await renderCroppedBlob(image, area, { canvas });
  assert.equal(blob.type, 'image/jpeg');
  const fill = canvas.calls.find((c) => c[0] === 'fill');
  assert.equal(fill[1], '#FFFFFF');
  // White has to go down BEFORE the image, or it paints over it.
  const fallback = canvas.calls.slice(canvas.calls.indexOf(fill));
  assert.equal(fallback[1][0], 'draw');
});

test('CONTROL: WebP is not repainted on white', async () => {
  const canvas = fakeCanvas();
  await renderCroppedBlob(image, area, { canvas });
  assert.equal(canvas.calls.some((c) => c[0] === 'fill'), false);
});

test('a canvas that cannot encode at all is an error, not an empty upload', async () => {
  const canvas = fakeCanvas({ encodes: { 'image/webp': null, 'image/jpeg': null } });
  await assert.rejects(() => renderCroppedBlob(image, area, { canvas }), /ไม่สำเร็จ/);
});
