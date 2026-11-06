import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveWithPendingAvatar } from '@/lib/writers/avatarSave';

function harness({ upload, write } = {}) {
  const calls = [];
  return {
    calls,
    blob: { fake: 'blob' },
    upload: async (blob) => {
      calls.push(['upload', blob]);
      if (upload) return upload();
      return 'new-id';
    },
    write: async (id) => {
      calls.push(['write', id]);
      if (write) return write();
      return { ok: true };
    },
    discard: async (id) => { calls.push(['discard', id]); },
  };
}

const names = (calls) => calls.map(([name]) => name);

test('no pending crop: nothing is uploaded and the write gets no id', async () => {
  const h = harness();
  const { res, uploadedId } = await saveWithPendingAvatar({ ...h, blob: null });
  assert.equal(res.ok, true);
  assert.equal(uploadedId, null);
  assert.deepEqual(h.calls, [['write', null]]);
});

test('a pending crop uploads first, then writes with the new id', async () => {
  const h = harness();
  const { uploadedId } = await saveWithPendingAvatar(h);
  assert.equal(uploadedId, 'new-id');
  assert.deepEqual(names(h.calls), ['upload', 'write']);
  assert.deepEqual(h.calls[1], ['write', 'new-id']);
});

test('a failed upload aborts the save: no write, no cleanup', async () => {
  const h = harness({ upload: () => { throw new Error('upload failed'); } });
  await assert.rejects(saveWithPendingAvatar(h), /upload failed/);
  assert.deepEqual(names(h.calls), ['upload']);
});

test('a refused write removes the just-uploaded file and reports the refusal', async () => {
  const h = harness({ write: () => ({ ok: false, error: 'slug ซ้ำ' }) });
  const { res } = await saveWithPendingAvatar(h);
  assert.equal(res.error, 'slug ซ้ำ');
  assert.deepEqual(h.calls[2], ['discard', 'new-id']);
});

test('a thrown write removes it too, and the error still reaches the caller', async () => {
  const h = harness({ write: () => { throw new Error('network'); } });
  await assert.rejects(saveWithPendingAvatar(h), /network/);
  assert.deepEqual(h.calls[2], ['discard', 'new-id']);
});

test('a refused write with nothing uploaded has nothing to remove', async () => {
  const h = harness({ write: () => ({ ok: false }) });
  await saveWithPendingAvatar({ ...h, blob: null });
  assert.deepEqual(names(h.calls), ['write']);
});

test('a successful save removes nothing', async () => {
  const h = harness();
  await saveWithPendingAvatar(h);
  assert.equal(names(h.calls).includes('discard'), false);
});

test('a failed removal does not replace the refusal the admin needs to see', async (t) => {
  t.mock.method(console, 'error', () => {});
  const h = harness({ write: () => ({ ok: false, error: 'slug ซ้ำ' }) });
  const { res } = await saveWithPendingAvatar({ ...h, discard: async () => { throw new Error('gone'); } });
  assert.equal(res.error, 'slug ซ้ำ');
});
