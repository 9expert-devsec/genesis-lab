/**
 * Sheet-row → document resolution for the SEO page-meta sheet. Shared by
 * scripts/audit-page-meta.mjs (R1, read-only report) and
 * scripts/apply-page-meta.mjs (R2, dry-run / --apply), so both classify every
 * row the same way. PURE: takes rows already read from the database, reads and
 * writes nothing itself.
 *
 *   courses   CourseExtension by courseId, case-insensitively (course_id casing
 *             history: upstream mixes case, genesis URLs lowercase it).
 *             MATCH | URL_MISMATCH (urlAlias ≠ sheet url) | NOT_FOUND | MULTIPLE
 *   programs  ProgramPageConfig / SkillPageConfig by urlSlug = url without the
 *   skills    leading slash, EXACT — same as `findOne({ urlSlug })` in
 *             src/app/(public)/[...slug]/page.jsx.
 *             MATCH | UNPUBLISHED | NOT_FOUND | MULTIPLE
 */

export const COLLECTIONS = {
  course: 'course_extensions',
  program: 'program_page_configs',
  skill: 'skill_page_configs',
};

export const s = (v) => String(v ?? '');
export const normUrl = (v) => {
  const t = s(v).trim().toLowerCase();
  if (!t) return '';
  return t.startsWith('/') ? t : `/${t}`;
};
export const slugOf = (url) => s(url).trim().replace(/^\/+/, '');

/** Raw read of the three collections. find() only. */
export async function loadPageMetaCollections(db) {
  const [extensions, programCfgs, skillCfgs] = await Promise.all([
    db.collection(COLLECTIONS.course).find({}).toArray(),
    db.collection(COLLECTIONS.program).find({}).toArray(),
    db.collection(COLLECTIONS.skill).find({}).toArray(),
  ]);
  return { extensions, programCfgs, skillCfgs };
}

/**
 * @param {object} sheet  { courses, programs, skills }
 * @param {object} data   { extensions, programCfgs, skillCfgs, siteSkillSlugs:Set }
 * @param {object} [opts] { programSlugOverrides: { '/sheet-url': 'stored-slug' } }
 * @returns {{ results: object[], touched: { course:Set, program:Set, skill:Set } }}
 *   each result: { kind, row, url, courseId, status, doc, docs, sheetRow, notes,
 *                  override?: string }
 */
export function resolveSheetRows(sheet, data, opts = {}) {
  const { extensions, programCfgs, skillCfgs, siteSkillSlugs } = data;
  const programSlugOverrides = opts.programSlugOverrides ?? {};
  const touched = { course: new Set(), program: new Set(), skill: new Set() };
  const results = [];

  // ── courses ───────────────────────────────────────────────────────────────
  for (const r of sheet.courses ?? []) {
    const id = s(r.courseId).trim();
    const url = normUrl(r.url);
    const docs = extensions.filter((e) => s(e.courseId).trim().toLowerCase() === id.toLowerCase());
    const notes = [];
    let status;
    let doc = null;

    if (docs.length === 0) {
      status = 'NOT_FOUND';
      const byAlias = extensions.find((e) => normUrl(e.urlAlias) === url);
      notes.push(byAlias
        ? `sheet url IS the urlAlias of courseId "${byAlias.courseId}" — sheet likely has the wrong ID`
        : 'no extension holds the sheet url as urlAlias');
      const byFormerAlias = extensions.find((e) => (e.formerAliases ?? []).some((a) => normUrl(a) === url));
      if (byFormerAlias) notes.push(`sheet url is a FORMER alias of "${byFormerAlias.courseId}"`);
      const byFormerCode = extensions.find((e) => (e.formerCodes ?? []).some((c) => s(c).toLowerCase() === id.toLowerCase()));
      if (byFormerCode) notes.push(`courseId is a FORMER code of "${byFormerCode.courseId}"`);
    } else if (docs.length > 1) {
      status = 'MULTIPLE';
      notes.push(`${docs.length} extension rows match case-insensitively: ${docs.map((h) => h.courseId).join(', ')}`);
    } else {
      doc = docs[0];
      if (doc.courseId !== id) notes.push(`stored courseId casing is "${doc.courseId}"`);
      if (normUrl(doc.urlAlias) === url) {
        status = 'MATCH';
      } else {
        status = 'URL_MISMATCH';
        notes.push(`urlAlias is "${s(doc.urlAlias) || '(empty)'}"`);
        if ((doc.formerAliases ?? []).some((a) => normUrl(a) === url)) notes.push('sheet url is a FORMER alias of this row');
        if (!s(doc.urlAlias).trim() && url === `/${doc.courseId.toLowerCase()}-training-course`) {
          notes.push('no alias; the sheet url equals the code path the page serves');
        }
        const other = extensions.find((e) => e !== doc && normUrl(e.urlAlias) === url);
        if (other) notes.push(`sheet url is the urlAlias of another row "${other.courseId}"`);
      }
      if (doc.isPublished === false) notes.push('extension isPublished=false');
    }
    for (const h of docs) touched.course.add(String(h._id));

    results.push({ kind: 'course', row: r.row, url: r.url, courseId: id, status, doc, docs, sheetRow: r, notes });
  }

  // ── programs / skills ─────────────────────────────────────────────────────
  for (const [kind, rows, cfgs] of [
    ['program', sheet.programs ?? [], programCfgs],
    ['skill', sheet.skills ?? [], skillCfgs],
  ]) {
    for (const r of rows) {
      const override = kind === 'program' ? programSlugOverrides[normUrl(r.url)] : undefined;
      const slug = override ?? slugOf(r.url);
      const docs = cfgs.filter((c) => s(c.urlSlug) === slug);
      const notes = [];
      if (override) notes.push(`OVERRIDE: sheet url ${r.url} → urlSlug "${override}"`);
      let status;
      let doc = null;

      if (docs.length === 0) {
        status = 'NOT_FOUND';
        const ci = cfgs.filter((c) => s(c.urlSlug).toLowerCase() === slug.toLowerCase());
        if (ci.length) notes.push(`case-insensitive hit: "${ci.map((c) => c.urlSlug).join('", "')}"`);
        const other = (kind === 'program' ? skillCfgs : programCfgs).filter((c) => s(c.urlSlug) === slug);
        if (other.length) notes.push(`slug exists in the ${kind === 'program' ? 'SKILL' : 'PROGRAM'} config collection`);
        if (kind === 'skill') {
          notes.push(siteSkillSlugs.has(slug)
            ? 'slug IS one of the 7 site.js skills (+ -all-courses)'
            : 'slug is NOT in site.js skills');
        }
      } else if (docs.length > 1) {
        status = 'MULTIPLE';
        notes.push(`${docs.length} rows: ${docs.map((h) => `${h._id}(isPublished=${h.isPublished})`).join(', ')}`);
      } else {
        doc = docs[0];
        status = doc.isPublished === false ? 'UNPUBLISHED' : 'MATCH';
      }
      if (kind === 'skill' && docs.length && !siteSkillSlugs.has(slug)) notes.push('slug is NOT in site.js skills');
      for (const h of docs) touched[kind].add(String(h._id));

      results.push({ kind, row: r.row, url: r.url, courseId: '', status, doc, docs, sheetRow: r, notes, override });
    }
  }

  return { results, touched };
}

// The page renders `stored.trim() || fallback`, so compare trimmed values.
export function diff(current, next) {
  const c = s(current).trim();
  const n = s(next).trim();
  if (!c) return 'FILL';
  return c === n ? 'SAME' : 'CHANGE';
}

export function hygiene(value) {
  const v = s(value);
  const flags = [];
  if (v !== v.replace(/^\s+/, '')) flags.push('leading whitespace');
  if (v !== v.replace(/\s+$/, '')) flags.push('trailing whitespace');
  if (/ {2,}/.test(v)) flags.push('double space');
  if (/[\r\n]/.test(v)) flags.push('newline');
  if (/[^ ]\||\|[^ ]/.test(v)) flags.push('"|" not spaced on both sides');
  if (/[ ​‌‍﻿]/.test(v)) flags.push('nbsp / zero-width char');
  return flags;
}

export const csvCell = (v) => `"${s(v).replace(/"/g, '""')}"`;
