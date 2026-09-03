import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordCourseContentVersion,
  recordCourseFileReplacement,
  MAX_NUMBER_ATTEMPTS,
} from '@/lib/courses/courseVersionWriter';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { VERSION_KIND, PRE_IMAGE } from '@/lib/courses/courseSnapshot';

/**
 * The course version WRITER, driven directly through its `deps` seam.
 *
 * ── WHY AN INJECTED MODEL AND NOT test/fakeDb ───────────────────────────────
 * fakeDb is an in-memory Mongo stand-in and a good one, but it has no INDEXES —
 * it cannot refuse a duplicate key, and refusing a duplicate key is the entire
 * numbering mechanism here. A test that ran against it would be asserting that
 * two racing writers get two numbers because nothing stopped them, which is the
 * opposite of the claim. So the model below enforces the partial unique index
 * on (courseId, versionNumber), and the race cases drive it deliberately.
 *
 * The seam is the same one recordAdminAction uses: `deps` is test-only and
 * production passes nothing.
 */

/** A snapshot-shaped object. Only its identity matters to the writer. */
const snap = (over = {}) => ({
  course: { course_id: 'PBI-101', course_name: 'Power BI', ...over.course },
  extension: { descriptionRich: '<p>เดิม</p>', ...over.extension },
  outlineRefs: { th: null, en: null, ...over.outlineRefs },
});

/**
 * One timestamp for every row in these tests.
 *
 * Mongo stamps `createdAt` to the millisecond, and a baseline plus the save
 * that follows it are written back to back — so a tie is the ordinary case
 * here, not a pathological one. Making every row tie turns "the writer breaks
 * the tie" from an assumption into something these tests actually exercise.
 */
const SAME_MILLISECOND = new Date('2026-09-03T09:00:00.000Z');

/**
 * A CourseVersion stand-in that enforces what the real partial unique index
 * enforces: two numbers collide, two nulls do not.
 *
 * `stealNumber` is how a race is staged — it does what a competing writer
 * actually does, taking the number between our read and our insert, rather than
 * throwing a synthetic error at us.
 */
function makeModel({ rows = [] } = {}) {
  const store = rows.map((r, i) => ({
    _id: `id${String(i).padStart(6, '0')}`,
    createdAt: SAME_MILLISECOND,
    ...r,
  }));
  const warns = [];

  /**
   * EVERY sort key, in order — not just the first.
   *
   * A one-key sort is what let the first draft of this file pass while the
   * writer resolved "the latest version" by a `createdAt` that ties. The rows
   * below deliberately share ONE timestamp, so a writer that does not break the
   * tie on `_id` picks the older row and the no-op cases go red. That is the
   * point of stamping them identically rather than counting upwards.
   */
  const chain = (resolveRows) => {
    let sortSpec = null;
    const q = {
      sort(spec) { sortSpec = spec; return q; },
      select() { return q; },
      lean() { return q; },
      then(onOk, onErr) {
        let list = resolveRows();
        if (sortSpec) {
          const entries = Object.entries(sortSpec);
          list = [...list].sort((a, b) => {
            for (const [key, dir] of entries) {
              const av = String(a[key] ?? '');
              const bv = String(b[key] ?? '');
              const cmp = av === bv ? 0 : av < bv ? -1 : 1;
              if (cmp !== 0) return dir < 0 ? -cmp : cmp;
            }
            return 0;
          });
        }
        return Promise.resolve(list[0] ?? null).then(onOk, onErr);
      },
    };
    return q;
  };

  const model = {
    __rows: store,
    __warns: warns,
    /** Simulate a competing writer taking `n` for `courseId`. */
    stealNumber(courseId, n) {
      store.push({
        _id: `id${String(store.length).padStart(6, '0')}`,
        createdAt: SAME_MILLISECOND,
        courseId,
        versionNumber: n,
        kind: VERSION_KIND.CONTENT,
        snapshot: snap(),
      });
    },
    findOne(filter = {}) {
      return chain(() =>
        store.filter((r) =>
          Object.entries(filter).every(([k, v]) => String(r[k] ?? '') === String(v))
        )
      );
    },
    async create(doc) {
      // THE PARTIAL UNIQUE INDEX, faithfully: numbers collide, nulls do not.
      if (typeof doc.versionNumber === 'number') {
        const clash = store.some(
          (r) => r.courseId === doc.courseId && r.versionNumber === doc.versionNumber
        );
        if (clash) {
          const err = new Error('E11000 duplicate key error');
          err.code = 11000;
          throw err;
        }
      }
      // Zero-padded so a string compare orders them the way Mongo orders
      // ObjectIds, and ONE shared timestamp so the tie-break is load-bearing.
      const row = {
        _id: `id${String(store.length + 1).padStart(6, '0')}`,
        createdAt: SAME_MILLISECOND,
        ...doc,
      };
      store.push(row);
      return row;
    },
  };
  return { model, deps: { CourseVersion: model, warn: (...a) => warns.push(a.join(' ')) } };
}

const contentRows = (model) =>
  model.__rows.filter((r) => r.kind === VERSION_KIND.CONTENT);

// ── V2 — a save with no changes writes NO new version ────────────────────────

test('V2: a save whose snapshot matches the latest version writes nothing', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap(), actor: { id: 'u1', name: 'A' } },
    deps
  );

  assert.equal(res.written, 0);
  assert.equal(res.reason, 'unchanged');
  assert.equal(model.__rows.length, 1, 'no second row');
});

test('V2: pressing save twice produces ONE version, not two', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  const edited = snap({ extension: { descriptionRich: '<p>แก้แล้ว</p>' } });
  await recordCourseContentVersion({ courseId: 'PBI-101', snapshot: edited }, deps);
  await recordCourseContentVersion({ courseId: 'PBI-101', snapshot: edited }, deps);

  assert.equal(contentRows(model).length, 2, 'the edit added one row; the repeat added none');
  assert.deepEqual(contentRows(model).map((r) => r.versionNumber), [1, 2]);
});

test('CONTROL: a save that DID change something is not suppressed', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap({ course: { course_name: 'Power BI II' } }) },
    deps
  );

  assert.equal(res.written, 1);
  assert.equal(model.__rows.length, 2);
});

test('key order alone is not a change — the fingerprint sorts', async () => {
  const a = { course: { course_id: 'X', course_name: 'Y' }, extension: null, outlineRefs: {} };
  const b = { outlineRefs: {}, extension: null, course: { course_name: 'Y', course_id: 'X' } };
  const { model, deps } = makeModel({
    rows: [{ courseId: 'X', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: a }],
  });

  const res = await recordCourseContentVersion({ courseId: 'X', snapshot: b }, deps);
  assert.equal(res.reason, 'unchanged');
  assert.equal(model.__rows.length, 1);
});

// ── V3 — the trap: an UNCHANGED path whose file was replaced ─────────────────

/**
 * The defect this whole kind of row exists for.
 *
 * The outline public_id is derived from (course_id, lang) and the upload is
 * signed `overwrite: true`, so the stored path string is IDENTICAL before and
 * after a replacement. Asserting the path really is identical first, because
 * without that the rest of the case proves nothing.
 */
test('V3: a file replacement at an identical path still produces a version', async () => {
  const { model, deps } = makeModel();
  const publicPath = '/files/courses/pbi-101-outline-th.pdf';

  await recordCourseFileReplacement(
    {
      courseId: 'PBI-101',
      file: {
        field: 'course_outline_th', lang: 'th', filename: 'pbi-101-outline-th.pdf',
        publicPath, bytes: 240_000, uploadedAt: '2026-09-01T00:00:00.000Z', outlineVersion: 3,
      },
    },
    deps
  );
  await recordCourseFileReplacement(
    {
      courseId: 'PBI-101',
      file: {
        field: 'course_outline_th', lang: 'th', filename: 'pbi-101-outline-th.pdf',
        publicPath, bytes: 318_500, uploadedAt: '2026-09-03T00:00:00.000Z', outlineVersion: 4,
      },
    },
    deps
  );

  const [first, second] = model.__rows;
  assert.equal(first.file.publicPath, second.file.publicPath,
    'CONTROL: the path really is identical — that is the trap');
  assert.equal(model.__rows.length, 2, 'both replacements are recorded');

  // The three values that make the change visible when the path cannot.
  assert.notEqual(first.file.bytes, second.file.bytes);
  assert.notEqual(first.file.uploadedAt.getTime(), second.file.uploadedAt.getTime());
  assert.notEqual(first.file.outlineVersion, second.file.outlineVersion);
});

test('V3: a file replacement is NEVER suppressed as a no-op, even when identical', async () => {
  const { model, deps } = makeModel();
  const file = {
    field: 'course_outline_th', lang: 'th', filename: 'x.pdf',
    publicPath: '/files/x.pdf', bytes: 100, uploadedAt: '2026-09-01T00:00:00.000Z', outlineVersion: 2,
  };

  await recordCourseFileReplacement({ courseId: 'PBI-101', file }, deps);
  await recordCourseFileReplacement({ courseId: 'PBI-101', file }, deps);

  assert.equal(model.__rows.length, 2,
    'the bytes really were destroyed and replaced twice; both are events');
});

test('a file row carries no snapshot, so kind and shape cannot disagree', async () => {
  const { model, deps } = makeModel();
  await recordCourseFileReplacement(
    { courseId: 'PBI-101', file: { lang: 'th', publicPath: '/f.pdf', bytes: 1, outlineVersion: 1 } },
    deps
  );
  const [row] = model.__rows;
  assert.equal(row.kind, VERSION_KIND.FILE_REPLACEMENT);
  assert.equal(row.snapshot, null);
  assert.ok(row.file, 'and it does carry a file block');
});

test('a content row carries no file block, for the same reason', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion({ courseId: 'PBI-101', snapshot: snap() }, deps);
  const [row] = model.__rows;
  assert.equal(row.kind, VERSION_KIND.CONTENT);
  assert.equal(row.file, null);
  assert.ok(row.snapshot);
});

test('a file row between two saves does not make the next save look changed', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  await recordCourseFileReplacement(
    { courseId: 'PBI-101', file: { lang: 'th', publicPath: '/f.pdf', bytes: 9, outlineVersion: 2 } },
    deps
  );
  // The newest row is now a file_replacement with a null snapshot. If the no-op
  // check took THAT as "the latest state", an unchanged save would compare
  // against null and be written.
  const res = await recordCourseContentVersion({ courseId: 'PBI-101', snapshot: snap() }, deps);

  assert.equal(res.reason, 'unchanged');
  assert.equal(contentRows(model).length, 1);
});

// ── V4 — the missing pre-image ───────────────────────────────────────────────

test('V4: an unreadable pre-image still writes the version, flagged', async () => {
  const { model, deps } = makeModel();

  const res = await recordCourseContentVersion(
    {
      courseId: 'PBI-101',
      snapshot: snap(),
      preImage: { state: PRE_IMAGE.UNAVAILABLE },
      actor: { id: 'u1', name: 'A' },
    },
    deps
  );

  assert.equal(res.written, 1, 'the save is recorded regardless');
  assert.equal(model.__rows.length, 1);
  assert.equal(model.__rows[0].preImageMissing, true);
});

test('V4: a CAPTURED pre-image becomes a baseline row, so the first save is diffable', async () => {
  const { model, deps } = makeModel();
  const before = snap();
  const afterSave = snap({ course: { course_name: 'Power BI — ปรับปรุง' } });

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: afterSave, preImage: { state: PRE_IMAGE.CAPTURED, snapshot: before } },
    deps
  );

  assert.equal(res.written, 2, 'the baseline and the save');
  assert.deepEqual(model.__rows.map((r) => r.versionNumber), [1, 2]);
  assert.deepEqual(model.__rows[0].snapshot, before);
  assert.deepEqual(model.__rows[1].snapshot, afterSave);
  assert.equal(model.__rows[0].preImageMissing, false);
  assert.equal(model.__rows[1].preImageMissing, false,
    'the baseline exists, so nothing about this row is missing');
});

test('a create (ABSENT) is not flagged — there was no earlier state to lose', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion(
    { courseId: 'NEW-1', snapshot: snap(), preImage: { state: PRE_IMAGE.ABSENT } },
    deps
  );
  assert.equal(model.__rows.length, 1);
  assert.equal(model.__rows[0].preImageMissing, false);
});

test('a baseline identical to the post-state collapses to ONE row', async () => {
  const { model, deps } = makeModel();
  const same = snap();

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: same, preImage: { state: PRE_IMAGE.CAPTURED, snapshot: same } },
    deps
  );

  assert.equal(res.written, 1, 'a save that changed nothing does not double the baseline');
  assert.equal(model.__rows.length, 1);
});

test('a course with history takes no baseline, whatever the caller passes', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  await recordCourseContentVersion(
    {
      courseId: 'PBI-101',
      snapshot: snap({ course: { course_name: 'Z' } }),
      preImage: { state: PRE_IMAGE.CAPTURED, snapshot: snap({ course: { course_name: 'stale' } }) },
    },
    deps
  );

  assert.equal(contentRows(model).length, 2, 'one new row, no retro-baseline');
});

test('V4: a flagged row is only ever the FIRST of a course', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap({ course: { course_name: 'Z' } }), preImage: { state: PRE_IMAGE.UNAVAILABLE } },
    deps
  );

  assert.equal(model.__rows[1].preImageMissing, false,
    'history already exists, so nothing is missing — the flag would be a lie');
});

// ── V9 — a cover re-upload then a save is ONE row, not two ───────────────────

/**
 * The cover image is the ASYMMETRIC case against the outline PDF: it gets a
 * fresh Cloudinary public_id on every re-upload, so the URL visibly changes and
 * the ordinary save-time snapshot catches it. Nothing writes a version at
 * upload time for it, so a re-upload followed by a save must produce exactly
 * one row — the save's.
 */
test('V9: a cover re-upload then a save produces exactly ONE version, showing the new URL', async () => {
  const oldUrl = 'https://res.cloudinary.com/x/image/upload/v1/courses/covers/aaa.jpg';
  const newUrl = 'https://res.cloudinary.com/x/image/upload/v2/courses/covers/bbb.jpg';

  const { model, deps } = makeModel({
    rows: [{
      courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1,
      snapshot: snap({ course: { course_cover_url: oldUrl } }),
    }],
  });

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap({ course: { course_cover_url: newUrl } }) },
    deps
  );

  assert.equal(res.written, 1, 'exactly one row — the upload itself wrote none');
  assert.equal(model.__rows.length, 2);
  assert.equal(model.__rows[0].snapshot.course.course_cover_url, oldUrl);
  assert.equal(model.__rows[1].snapshot.course.course_cover_url, newUrl,
    'and the diff between adjacent versions is the URL');
});

// ── numbering, and what two simultaneous admins get (B5) ─────────────────────

test('numbers start at 1 and increment within one course', async () => {
  const { model, deps } = makeModel();
  for (const name of ['A', 'B', 'C']) {
    await recordCourseContentVersion(
      { courseId: 'PBI-101', snapshot: snap({ course: { course_name: name } }) },
      deps
    );
  }
  assert.deepEqual(model.__rows.map((r) => r.versionNumber), [1, 2, 3]);
});

test('numbering is scoped per course — two courses both start at 1', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion({ courseId: 'AAA', snapshot: snap() }, deps);
  await recordCourseContentVersion({ courseId: 'BBB', snapshot: snap() }, deps);
  assert.deepEqual(model.__rows.map((r) => [r.courseId, r.versionNumber]), [['AAA', 1], ['BBB', 1]]);
});

test('content and file rows share ONE sequence, so history has no duplicate numbers', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion({ courseId: 'PBI-101', snapshot: snap() }, deps);
  await recordCourseFileReplacement(
    { courseId: 'PBI-101', file: { lang: 'th', publicPath: '/f.pdf', bytes: 1, outlineVersion: 1 } },
    deps
  );
  await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap({ course: { course_name: 'Z' } }) },
    deps
  );
  assert.deepEqual(model.__rows.map((r) => r.versionNumber), [1, 2, 3]);
});

/**
 * TWO ADMINS SAVING THE SAME COURSE AT THE SAME MOMENT.
 *
 * The competitor takes the number between our read and our insert, which is
 * exactly the window a read-max-then-insert scheme has. The index refuses us,
 * we re-read and take the next one. Both rows survive with distinct numbers.
 */
test('B5: losing the race for a number retries and takes the next one', async () => {
  const { model, deps } = makeModel({
    rows: [{ courseId: 'PBI-101', kind: VERSION_KIND.CONTENT, versionNumber: 1, snapshot: snap() }],
  });

  const realCreate = model.create.bind(model);
  let raced = false;
  model.create = async (doc) => {
    if (!raced) {
      raced = true;
      // The other admin's row lands first, taking 2.
      model.stealNumber('PBI-101', 2);
    }
    return realCreate(doc);
  };

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap({ course: { course_name: 'ours' } }) },
    deps
  );

  assert.equal(res.written, 1);
  assert.deepEqual(res.versionNumbers, [3], 're-read after the refusal, took 3');
  const numbers = model.__rows.map((r) => r.versionNumber);
  assert.equal(new Set(numbers).size, numbers.length, 'no number handed out twice');
});

test('B5: an exhausted retry budget writes the row UNNUMBERED rather than losing it', async () => {
  const { model, deps } = makeModel();

  // Every insert loses: the competitor always gets there first.
  const realCreate = model.create.bind(model);
  model.create = async (doc) => {
    if (typeof doc.versionNumber === 'number') {
      model.stealNumber('PBI-101', doc.versionNumber);
    }
    return realCreate(doc);
  };

  const res = await recordCourseContentVersion(
    { courseId: 'PBI-101', snapshot: snap() },
    deps
  );

  assert.equal(res.written, 1, 'the snapshot is never the thing sacrificed');
  assert.deepEqual(res.versionNumbers, [null]);
  const ours = model.__rows.find((r) => r.versionNumber === null);
  assert.ok(ours, 'the row exists, unnumbered');
  assert.ok(
    model.__warns.some((w) => w.includes('UNNUMBERED')),
    'and it is not silent about it'
  );
  assert.ok(MAX_NUMBER_ATTEMPTS >= 1);
});

// ── the never-throws contract ────────────────────────────────────────────────

test('a database that throws never reaches the caller as an exception', async () => {
  const model = {
    findOne() { throw new Error('mongo is down'); },
    async create() { throw new Error('mongo is down'); },
  };
  const warns = [];
  const deps = { CourseVersion: model, warn: (...a) => warns.push(a.join(' ')) };

  const content = await recordCourseContentVersion({ courseId: 'X', snapshot: snap() }, deps);
  const file = await recordCourseFileReplacement(
    { courseId: 'X', file: { lang: 'th', publicPath: '/f.pdf' } },
    deps
  );

  assert.equal(content.reason, 'error');
  assert.equal(file.reason, 'error');
  assert.equal(warns.length, 2, 'swallowed, but never silently');
});

test('a missing course code is refused rather than filed under an empty key', async () => {
  const { model, deps } = makeModel();
  const res = await recordCourseContentVersion({ courseId: '   ', snapshot: snap() }, deps);
  assert.equal(res.reason, 'no-course-id');
  assert.equal(model.__rows.length, 0);
});

test('a content call with no snapshot is refused, not written empty', async () => {
  const { model, deps } = makeModel();
  const res = await recordCourseContentVersion({ courseId: 'X' }, deps);
  assert.equal(res.reason, 'no-snapshot');
  assert.equal(model.__rows.length, 0);
});

test('case and whitespace in the code do not fork a history', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion({ courseId: 'pbi-101', snapshot: snap() }, deps);
  await recordCourseContentVersion(
    { courseId: '  PBI-101 ', snapshot: snap({ course: { course_name: 'Z' } }) },
    deps
  );
  assert.deepEqual(model.__rows.map((r) => r.courseId), ['PBI-101', 'PBI-101']);
  assert.deepEqual(model.__rows.map((r) => r.versionNumber), [1, 2]);
});

test('the actor is snapshotted onto every row', async () => {
  const { model, deps } = makeModel();
  await recordCourseContentVersion(
    { courseId: 'X', snapshot: snap(), actor: { id: 'u9', name: 'Pirasak S.' } },
    deps
  );
  await recordCourseFileReplacement(
    { courseId: 'X', file: { lang: 'th', publicPath: '/f.pdf' }, actor: { id: 'u9', name: 'Pirasak S.' } },
    deps
  );
  for (const row of model.__rows) {
    assert.deepEqual(row.actor, { id: 'u9', name: 'Pirasak S.' });
  }
});
