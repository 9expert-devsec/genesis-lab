import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The catalog PDF feature is WIRED the way the outline precedent is.
 *
 * test/pure/pageCatalog proves the derivation and the predicate; the render
 * tier proves the button. This pins the seams none of those can see: that the
 * action derives and never builds, that both public routes hand the config to
 * the page, that both pages mount the ONE button, and that the editor mounts
 * the uploader. Mirrors test/fs/courseOutlineDerivation for the action half.
 */

const ACTION   = 'src/lib/actions/page-catalogs.js';
const EDITOR   = 'src/app/admin/page-configs/_components/PageConfigEditor.jsx';
const UPLOADER = 'src/components/admin/PageCatalogUpload.jsx';
const BUTTON   = 'src/components/ui/PageCatalogButton.jsx';
const HERO_BTN = 'src/components/ui/HeroPdfButton.jsx';
const PROGRAM_PAGE = 'src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx';
const SKILL_PAGE   = 'src/app/(public)/skill/[slug]/_components/SkillPageClient.jsx';
const CATCH_ALL    = 'src/app/(public)/[...slug]/page.jsx';
const SKILL_ROUTE  = 'src/app/(public)/skill/[slug]/page.jsx';
const PROGRAM_ROUTE = 'src/app/(public)/program/[slug]/page.jsx';
const MODELS = ['src/models/ProgramPageConfig.js', 'src/models/SkillPageConfig.js'];

const calls = (code, name) => new RegExp(`\\b${name}\\s*\\(`).test(code);

// ── The action derives; it never builds ─────────────────────────────────────

test('the action scan found real code', () => {
  const { code } = readSource(ACTION);
  assert.ok(code.length > 1500, `scrubbed to ${code.length} chars`);
  assert.match(code, /export async function signPageCatalogUpload/);
  assert.match(code, /export async function recordPageCatalogUpload/);
  assert.match(code, /export async function removePageCatalog/);
});

test('every action derives its target through catalogTarget and gates on requireAdmin(\'page_configs\')', () => {
  const { code } = readSource(ACTION);
  const bodies = code.split(/export async function /).slice(1);
  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.ok(calls(body, 'catalogTarget'), `${body.slice(0, 30)}… does not derive its target`);
    assert.match(body, /requireAdmin\('page_configs'\)/, `${body.slice(0, 30)}… is not gated on the page_configs menu`);
    assert.match(body, /recordAdminActionAfter\(/, `${body.slice(0, 30)}… records no audit row`);
  }
});

test('the signer refuses a non-PDF through refuseNonPdf on the PICKED file, and runs the shared policy', () => {
  const { code } = readSource(ACTION);
  const signer = code.split(/export async function /)[1];
  assert.match(signer, /refuseNonPdf\(\{ filename, contentType \}\)/, 'the PDF check does not read the picked file');
  assert.match(signer, /refuseUpload\(\{ filename: target\.fileName, bytes \}\)/);
  // Signed overwrite + invalidate, exactly as the outline is signed.
  assert.match(signer, /overwrite: true,\s*invalidate: true,\s*unique_filename: false/);
});

test('the action builds NO path and NO public_id of its own', () => {
  const { code } = readSource(ACTION);
  assert.equal(/['"`]\/files\//.test(code), false, 'a /files/ literal in the action');
  assert.equal(/catalog\//.test(code), false, 'a catalog/ segment in the action');
  assert.equal(/\.pdf['"`]/.test(code), false, 'a .pdf literal in the action');
  assert.equal(/9exp-genesis\/legacy/.test(code), false, 'a hard-coded public_id prefix');
  // The client id may reach ONE kind of string: a revalidatePath() argument —
  // the same `/program/${id}` page-configs.js already busts. Anywhere else an
  // interpolated id is a path being built.
  const interpolations = [...code.matchAll(/[^\n]*`[^`]*\$\{\s*id\s*\}[^`]*`[^\n]*/g)].map((m) => m[0].trim());
  for (const line of interpolations) {
    assert.match(line, /^revalidatePath\(/, `the client id is interpolated outside revalidatePath: ${line}`);
  }
  assert.equal(/legacyPathToPublicId/.test(code), false, 'the action derives the id itself instead of through catalogTarget');
});

test('no language dimension: the action and the pure module take no lang', () => {
  for (const rel of [ACTION, 'src/lib/pageCatalog.js']) {
    const { code } = readSource(rel);
    assert.doesNotMatch(code, /\blang\b/, `${rel} carries a lang`);
    assert.doesNotMatch(code, /OUTLINE_LANGS|isOutlineLang/, `${rel} imports the outline languages`);
  }
});

// ── The model ───────────────────────────────────────────────────────────────

test('both page-config models carry catalogPdf with the same five leaves', () => {
  for (const rel of MODELS) {
    const { code } = readSource(rel);
    assert.match(code, /catalogPdf:\s*\{/, `${rel} has no catalogPdf`);
    for (const leaf of ['path', 'bytes', 'uploadedAt', 'uploadedBy', 'version']) {
      assert.match(code, new RegExp(`${leaf}:\\s*\\{ type:`), `${rel}: catalogPdf.${leaf} missing`);
    }
  }
});

test('the URL/SEO save does not touch catalogPdf — it $sets only its own fields', () => {
  const { code } = readSource('src/lib/actions/page-configs.js');
  assert.doesNotMatch(code, /catalogPdf/, 'page-configs.js writes catalogPdf — the upload action is the only writer');
});

// ── The button, on both pages ───────────────────────────────────────────────

test('the button renders on hasCatalog and nothing else', () => {
  const { code, withImports } = readSource(BUTTON);
  assert.match(withImports, /import \{[^}]*\bhasCatalog\b[^}]*\} from '@\/lib\/pageCatalog'/);
  assert.match(code, /if \(!hasCatalog\(config\)\) return null;/);
  assert.match(code, /<HeroPdfButton/, 'the treatment is not the site\'s PDF button');
  assert.match(code, /downloadAs=\{catalogDownloadName\(name\)\}/, 'the button does not download');
  assert.match(code, /\{CATALOG_DOWNLOAD_LABEL\}/, 'the label is not the shared constant');
});

test('HeroPdfButton\'s download is OPT-IN and undefined by default', () => {
  const { code } = readSource(HERO_BTN);
  assert.match(code, /download=\{downloadAs \|\| undefined\}/);
});

test('both pages mount PageCatalogButton with their config, after the description', () => {
  for (const [rel, name] of [[PROGRAM_PAGE, 'program?.program_name'], [SKILL_PAGE, 'skill?.skill_name']]) {
    const { code, withImports } = readSource(rel);
    assert.match(withImports, /import \{ PageCatalogButton \} from '@\/components\/ui\/PageCatalogButton'/, `${rel} does not import the button`);
    const mount = new RegExp(`<PageCatalogButton config=\\{config\\} name=\\{${name.replace(/[?.]/g, '\\$&')}\\}`);
    assert.match(code, mount, `${rel} does not mount the button with config and name`);
    const descAt = code.indexOf('{description && (');
    const mountAt = code.search(mount);
    assert.ok(descAt > 0 && mountAt > descAt, `${rel}: the button is not after the description`);
  }
});

test('every route that renders the skill page passes config — the catch-all and the /skill/[slug] fallback', () => {
  assert.match(readSource(CATCH_ALL).code, /<SkillPageClient\s+skill=\{skillData\.skill\}\s+config=\{skillData\.config\}/);
  assert.match(readSource(SKILL_ROUTE).code, /<SkillPageClient\s+skill=\{skill\}\s+config=\{config\}/);
  // The program page already took config before this feature; pinned so the
  // symmetry holds.
  assert.match(readSource(CATCH_ALL).code, /<ProgramPageClient[\s\S]*?config=\{programData\.config\}/);
  assert.match(readSource(PROGRAM_ROUTE).code, /<ProgramPageClient[\s\S]*?config=\{config\}/);
});

// ── The editor ──────────────────────────────────────────────────────────────

test('the page-config editor mounts the uploader with kind, id and the stored record', () => {
  const { code, withImports } = readSource(EDITOR);
  assert.match(withImports, /import \{ PageCatalogUpload \} from '@\/components\/admin\/PageCatalogUpload'/);
  assert.match(code, /<PageCatalogUpload kind=\{kind\} id=\{item\.id\} initialCatalog=\{config\?\.catalogPdf \?\? null\} \/>/);
  // Deleting the row detaches the catalog; the confirm says so.
  assert.match(code, /hasCatalog\(config\)/, 'the delete confirm does not check for a catalog');
});

test('the uploader is the outline flow: sign → POST verbatim → record; and remove is an action', () => {
  const { code, withImports } = readSource(UPLOADER);
  assert.match(withImports, /^'use client';/m);
  for (const fn of ['signPageCatalogUpload', 'recordPageCatalogUpload', 'removePageCatalog']) {
    assert.ok(calls(code, fn), `${fn} is not called`);
  }
  assert.match(code, /filename: file\.name, contentType: file\.type, bytes: file\.size/, 'the picked file\'s name and type do not reach the signer');
  assert.match(code, /for \(const \[k, v\] of Object\.entries\(signed\.params\)\) body\.append\(k, String\(v\)\);/, 'the signed params are not sent verbatim');
  assert.match(code, /accept="application\/pdf,\.pdf"/);
  assert.doesNotMatch(code, /type="hidden"/, 'a hidden form input — this editor saves through actions, not a form');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the no-literal matchers catch what they claim to', () => {
  const bad = "const p = `/files/catalog/${id}-catalog.pdf`; const q = '9exp-genesis/legacy/x';";
  assert.equal(/['"`]\/files\//.test(bad), true);
  assert.equal(/catalog\//.test(bad), true);
  assert.equal(/\.pdf['"`]/.test(bad), true);
  assert.equal(/9exp-genesis\/legacy/.test(bad), true);
  assert.equal(/`[^`]*\$\{\s*id\s*\}[^`]*`/.test(bad), true);
});

test('CONTROL: a mere MENTION does not satisfy the delegation probe', () => {
  assert.equal(calls('const note = "we call catalogTarget somewhere";', 'catalogTarget'), false);
  assert.equal(calls('const t = catalogTarget(kind, id);', 'catalogTarget'), true);
});
