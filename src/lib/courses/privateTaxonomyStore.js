/**
 * The `private_taxonomy` store — custom private programs and skills.
 *
 * Same split as privateCourseStore: plain module, `deps.model` injectable so
 * the pure tier runs without a database, and NOTHING here may reach MSDB — no
 * msdb-write, no aiFetch. test/fs/privateCourseNoMsdb pins it.
 */

export const TAXONOMY_KINDS = Object.freeze(['program', 'skill']);

/** `#RRGGBB`, exactly — no shorthand, no alpha, no names. */
export function isHex6(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * The admin form's input, checked and trimmed. A program needs a colour (it is
 * the hero background); a skill may leave it blank, but a colour that IS given
 * must still be `#RRGGBB`.
 *
 * @returns {{ ok: true, value: object } | { ok: false, field: string, error: string }}
 */
export function validateTaxonomyInput(input) {
  const kind = String(input?.kind ?? '').trim();
  const name = String(input?.name ?? '').trim();
  const logoUrl = String(input?.logoUrl ?? '').trim();
  const color = String(input?.color ?? '').trim();

  if (!TAXONOMY_KINDS.includes(kind)) {
    return { ok: false, field: 'kind', error: 'ประเภทต้องเป็น program หรือ skill' };
  }
  if (!name) return { ok: false, field: 'name', error: 'กรุณากรอกชื่อ' };
  if (kind === 'program' && !color) {
    return { ok: false, field: 'color', error: 'โปรแกรมต้องมีสี (#RRGGBB) — ใช้เป็นพื้นหลัง hero' };
  }
  if (color && !isHex6(color)) {
    return { ok: false, field: 'color', error: 'สีต้องอยู่ในรูปแบบ #RRGGBB' };
  }
  return { ok: true, value: { kind, name, logoUrl, color: color.toUpperCase() } };
}

async function taxonomyModel() {
  const { dbConnect } = await import('@/lib/db/connect');
  await dbConnect();
  return (await import('@/models/PrivateTaxonomy')).default;
}

async function courseModel() {
  const { dbConnect } = await import('@/lib/db/connect');
  await dbConnect();
  return (await import('@/models/PrivateCourse')).default;
}

export async function listTaxonomy({ model } = {}) {
  const M = model ?? (await taxonomyModel());
  return M.find({}).sort({ kind: 1, name: 1 }).lean();
}

/**
 * The course form's custom options, as plain `{ _id, name }` rows split by
 * kind. A failed read leaves the form usable with MSDB programs only.
 */
export async function privateTaxonomyOptions({ model } = {}) {
  try {
    const rows = await listTaxonomy({ model });
    const plain = (r) => ({ _id: String(r._id), name: r.name ?? '' });
    return {
      programs: rows.filter((r) => r.kind === 'program').map(plain),
      skills: rows.filter((r) => r.kind === 'skill').map(plain),
    };
  } catch (err) {
    console.error('[privateTaxonomy] options read failed', err?.message);
    return { programs: [], skills: [] };
  }
}

/** One indexed read by `_id` — what the private course page runs. */
export async function getTaxonomyItem(id, { model } = {}) {
  if (!id) return null;
  const M = model ?? (await taxonomyModel());
  return M.findById(id).lean();
}

export async function insertTaxonomyItem(value, { model } = {}) {
  const M = model ?? (await taxonomyModel());
  const created = await M.create(value);
  return typeof created?.toObject === 'function' ? created.toObject() : created;
}

/** `kind` is fixed once created — a program cannot become a skill. */
export async function updateTaxonomyItem(id, value, { model } = {}) {
  const M = model ?? (await taxonomyModel());
  const { kind: _kind, ...rest } = value;
  return M.findByIdAndUpdate(id, { $set: rest }, { new: true, runValidators: true }).lean();
}

export async function removeTaxonomyItem(id, { model } = {}) {
  const M = model ?? (await taxonomyModel());
  return M.findByIdAndDelete(id).lean();
}

/** The private courses that point at this item — as program or as a skill. */
export async function coursesReferencingTaxonomy(id, { courseModel: CM } = {}) {
  const M = CM ?? (await courseModel());
  return M.find({ $or: [{ privateProgram: id }, { privateSkills: id }] })
    .select('course_id course_name')
    .lean();
}

/**
 * The refusal for deleting an item still in use, naming every course by code
 * and name — or null when nothing references it. No cascade: the admin
 * re-points those courses first.
 */
export function taxonomyDeleteRefusal(courses) {
  const list = Array.isArray(courses) ? courses : [];
  if (list.length === 0) return null;
  const names = list.map((c) => `${c.course_id} — ${c.course_name}`);
  return {
    ok: false,
    error: `ลบไม่ได้: ยังมี Private Course ใช้อยู่ ${list.length} หลักสูตร (${names.join(', ')})`,
    courses: list.map((c) => ({ course_id: c.course_id, course_name: c.course_name })),
  };
}
