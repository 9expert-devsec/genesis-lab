/**
 * ROUND 67 §J/§K — drive the save pipeline end to end, in process, and check
 * that it LANDS.
 *
 * The editor route is behind requirePage('pages') — credentials + bcrypt +
 * TOTP — so the browser cannot be driven from here. This drives everything
 * saveDraftContent does EXCEPT requireAdmin, against a real page, and then
 * reads draft.savedAt back to prove the write happened.
 *
 * IT WRITES. Only to a page it creates itself, prefixed `__r67-`, and it deletes
 * that page and its audit rows at the end. It never touches an author's page.
 *
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *        scripts/_diagnose-round67-drive.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';
import { unserialisableArguments, unserialisableMessage } from '../test/plainValue.mjs';

const { draftContentSchema } = await import('@/lib/schemas/pageBuilder');
const { sanitizePageForTier, renumberSections } = await import('@/lib/pages/tierSanitize');
const { effectiveContent } = await import('@/lib/pageBuilder/draftState');
const { DRAFT_CONTENT_KEYS } = await import('@/lib/schemas/pageBuilder');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB_NAME);
const pages = db.collection('page_builder_pages');

const SLUG = '__r67-drive-' + Date.now();

/** The empty-page shape §C names: one highlight_grid holding one rich_text. */
const SECTIONS = [{
  id: 'a', type: 'highlight_grid', name: '', enabled: true, sortOrder: 0,
  settings: { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium',
    background: 'default', visibility: 'all' },
  layout: {}, style: {},
  advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  content: { children: [{
    id: 'b', type: 'rich_text', name: '', enabled: true, sortOrder: 0,
    settings: { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium',
      background: 'default', visibility: 'all' },
    layout: {}, style: {},
    advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
    content: { doc: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'ทดสอบบันทึกฉบับร่าง' }] }] } },
  }] },
}];

/** saveDraftContent's body, minus requireAdmin. The guard is included. */
async function drive(id, patch, expectedUpdatedAt) {
  const poisoned = (() => {
    const hits = unserialisableArguments({ id, patch, expectedUpdatedAt });
    return hits.length ? { ok: false, error: unserialisableMessage(hits) } : null;
  })();
  if (poisoned) return poisoned;

  const existing = await pages.findOne({ _id: new ObjectId(id) });
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const parsed = draftContentSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const sanitized = sanitizePageForTier(parsed.data, effectiveContent(existing), true);
  sanitized.sections = renumberSections(sanitized.sections);
  const draft = { ...sanitized, savedAt: new Date(), savedBy: { id: 'r67', name: 'round 67' } };

  try {
    const res = await pages.findOneAndUpdate(
      { _id: new ObjectId(id) }, { $set: { draft, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    const doc = res?.value ?? res;
    if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    return { ok: true, updatedAt: doc.updatedAt?.toISOString?.() ?? String(doc.updatedAt) };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกฉบับร่างไม่สำเร็จ' };
  }
}

let created;
try {
  const now = new Date();
  const ins = await pages.insertOne({
    slug: SLUG, title: 'r67 drive', pageType: 'page', status: 'draft',
    sections: [], theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
    seo: {}, jsonLd: '', promotionCover: {}, createdAt: now, updatedAt: now,
  });
  created = ins.insertedId;
  console.log(`created scratch page ${created} (${SLUG})`);

  const before = await pages.findOne({ _id: created });
  console.log(`\n§K BEFORE  draft.savedAt = ${before.draft?.savedAt ?? '(no draft)'}`);

  /**
   * The payload is taken from a REAL stored page rather than hand-authored:
   * three attempts at writing one by hand each tripped a different schema
   * detail (the theme enum, then an object-vs-string field), which proves only
   * that the fixture was wrong — not anything about the save. `effectiveContent`
   * + the client's own `pick` is exactly what runSave sends.
   *
   * Its SECTIONS are then replaced with the empty-page shape §C names, so the
   * drive still exercises the case the author reported failing.
   */
  const donor = await pages.findOne({ slug: 'early-bird-claude-code' });
  const source = effectiveContent(donor);
  const patch = {};
  for (const k of DRAFT_CONTENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, k)) patch[k] = source[k];
  }
  patch.title = 'r67 drive';
  patch.sections = SECTIONS;

  console.log('\n§J  drive 1 — an EMPTY-SHAPED page (highlight_grid > rich_text)');
  const r1 = await drive(String(created), patch, before.updatedAt.toISOString());
  console.log('   response body: ' + JSON.stringify(r1));

  const mid = await pages.findOne({ _id: created });
  console.log(`\n§K AFTER   draft.savedAt = ${mid.draft?.savedAt?.toISOString?.() ?? mid.draft?.savedAt ?? '(no draft)'}`);
  console.log(`   sections written: ${mid.draft?.sections?.length ?? 0}`);

  console.log('\n§J  drive 2 — the SAME payload with a poisoned value planted');
  const TAG = Symbol.for('react.temporary.reference');
  const fake = new Proxy({ $$typeof: TAG }, {
    get: (t, n) => { if (n === '$$typeof') return t.$$typeof;
      throw new Error('Cannot access ' + String(n) + ' on the server. You cannot dot into a '
        + 'temporary client reference from a server component.'); },
  });
  const poisonedPatch = JSON.parse(JSON.stringify(patch));
  poisonedPatch.sections[0].content.children[0].content.doc = fake;
  const r2 = await drive(String(created), poisonedPatch, mid.updatedAt.toISOString());
  console.log('   response body: ' + JSON.stringify(r2));

  const after = await pages.findOne({ _id: created });
  console.log(`\n§K  after the REFUSED save, draft.savedAt is unchanged: `
    + `${String(after.draft?.savedAt?.toISOString?.() === mid.draft?.savedAt?.toISOString?.())}`);
  console.log(`   (the refusal did not half-write: sections still ${after.draft?.sections?.length ?? 0})`);
} finally {
  if (created) {
    await pages.deleteOne({ _id: created });
    await db.collection('page_audit_logs').deleteMany({ pageId: String(created) });
    console.log(`\ncleaned up scratch page ${created}`);
  }
  await client.close();
}
