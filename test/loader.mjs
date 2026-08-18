// Node module-customization hooks for the verification suite (item 1).
//
// WHY THIS FILE EXISTS AT ALL — two facts about Node that the app's `@/` imports
// and `.jsx` files run headlong into:
//
//  1. `jsconfig.json` `paths` (@/* → ./src/*, plus four more aliases) are
//     INVISIBLE to Node. They are an editor/bundler convention; the Node ESM
//     resolver never reads them. And `package.json` "imports" (subpath imports)
//     CANNOT express `@` — a subpath key must start with `#`. So nothing in the
//     platform resolves `@/lib/...`; this `resolve` hook does. It is not a
//     dependency, it is ~40 lines, and the app modules import each other via
//     `@/` internally, so even a test that imports nothing but a relative path
//     needs this the moment that module pulls in a sibling by alias.
//
//  2. Node has NO native JSX transform. `--experimental-strip-types` (22.6+) is
//     TypeScript TYPE-STRIPPING only; it does not touch JSX, and this repo is
//     JSX-not-TS. Raw Node errors at the first `<`. So the `load` hook runs
//     `sucrase` (a DECLARED devDependency — see the finding in item 1: the
//     throwaway harnesses this suite replaces only ran because sucrase happened
//     to be present transitively, which nobody chose and nobody knew).
//
// The render-tier tests import real components, which import next/link and
// next/image — not what we verify, and not node-resolvable — so they are stubbed
// with faithful <a>/<img>. Everything else resolves to the real file on disk and
// runs as the real module.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { transform } from 'sucrase';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'src');
const EXTS = ['.js', '.jsx'];

/**
 * EXPORTED so test/fs/stubExportParity can compare each stub's export set
 * against the module it stands in for, reading the mapping from the one place
 * that defines it. A second copy of this list in the test would be the drift it
 * exists to catch.
 */
export const STUBS = {
  'next/link': path.join(ROOT, 'test', 'stub-next-link.mjs'),
  'next/image': path.join(ROOT, 'test', 'stub-next-image.mjs'),
  // Client components in the render tier call useRouter/useSearchParams during
  // SSR; next/navigation does not resolve outside a Next runtime.
  'next/navigation': path.join(ROOT, 'test', 'stub-next-navigation.mjs'),
  // next/cache + next/server don't resolve outside a Next runtime; stub them so
  // webhook handler/route code can be exercised under this loader.
  'next/cache': path.join(ROOT, 'test', 'stub-next-cache.mjs'),
  'next/server': path.join(ROOT, 'test', 'stub-next-server.mjs'),
  // The header's nav-preview server actions import @/lib/db/connect, which
  // throws at module load with no MONGODB_URI. They are never called during a
  // server render — see the stub for the full note.
  '@/lib/actions/nav-course-preview': path.join(ROOT, 'test', 'stub-nav-course-preview.mjs'),
  // ArticlesAdminClient imports the article server actions for its click
  // handlers; that chain reaches next-auth → next/headers, which does not
  // resolve outside a Next runtime. Same reasoning as the line above.
  '@/lib/actions/articles': path.join(ROOT, 'test', 'stub-article-actions.mjs'),
  // RegistrationDetailClient imports the registration server actions for its
  // save/delete handlers; that chain reaches next-auth → next/headers. Same
  // reasoning as the two lines above.
  '@/lib/actions/registrations': path.join(ROOT, 'test', 'stub-registration-actions.mjs'),
  // CourseForm imports the course + extension server actions for its save
  // handler; both chains reach next-auth → next/headers (and mongoose). Same
  // reasoning as the three lines above.
  '@/lib/actions/courses': path.join(ROOT, 'test', 'stub-course-actions.mjs'),
  // CoursesAdminClient imports saveProgramCourseOrder for the reorder save;
  // same chain, same reasoning as the line above.
  '@/lib/actions/program-order': path.join(ROOT, 'test', 'stub-program-order-actions.mjs'),
  // RenameExecutePanel imports the rename + the state inspector for its click
  // handler; same chain, same reasoning as the line above.
  '@/lib/actions/course-rename': path.join(ROOT, 'test', 'stub-course-rename-actions.mjs'),
  '@/lib/actions/course-extensions': path.join(ROOT, 'test', 'stub-course-extension-actions.mjs'),
  // Reached indirectly, via CourseOutlineUpload inside CourseForm.
  '@/lib/actions/course-outlines': path.join(ROOT, 'test', 'stub-course-outline-actions.mjs'),
  // MirrorResetClient imports the cache-console actions for its preview/apply
  // handlers; that chain reaches next-auth → next/headers. Same reasoning as
  // the lines above — and see the stub's own note on why it throws rather than
  // returning a benign result.
  '@/lib/actions/cache-console': path.join(ROOT, 'test', 'stub-cache-console-actions.mjs'),
  // BannerForm imports createBanner/updateBanner for its submit handler and
  // AdminBannerList imports deleteBanner for its row button; that chain reaches
  // next-auth → next/headers AND mongoose. Same reasoning as every line above.
  '@/lib/actions/banners': path.join(ROOT, 'test', 'stub-banner-actions.mjs'),
};

// The repo omits extensions on relative/alias imports (the bundler adds them);
// Node's ESM resolver does not, so re-implement that lookup.
function resolveFsPath(base) {
  if (existsSync(base) && path.extname(base)) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  for (const e of EXTS) if (existsSync(path.join(base, 'index' + e))) return path.join(base, 'index' + e);
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true };

  let target = null;
  if (specifier.startsWith('@/')) {
    target = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!existsSync(candidate) || !path.extname(candidate)) target = candidate; // only take over when default would miss
  }
  if (target) {
    const fs = resolveFsPath(target);
    if (fs) return { url: pathToFileURL(fs).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // 3. Node requires `with { type: 'json' }` on a JSON import; webpack and every
  //    other bundler take a bare one, so that is what the app code writes
  //    (src/lib/address/postcodeIndex.js imports the derived postcode index).
  //    Adding the attribute to the app module to satisfy Node would be the tail
  //    wagging the dog — and its support across bundlers is still uneven — so
  //    the bridge goes here, next to the alias and JSX bridges, for the same
  //    reason those do. Serving it as a module means the app file stays exactly
  //    what it would be in any other Next codebase.
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const file = fileURLToPath(url);
    if (file.startsWith(SRC)) {
      // JSON.parse of a string literal, not an inlined object literal: it is the
      // faster path for a payload this size and it cannot be mangled by the
      // source text ever being read as code.
      const json = readFileSync(file, 'utf8');
      return {
        format: 'module',
        source: `export default JSON.parse(${JSON.stringify(json)});`,
        shortCircuit: true,
      };
    }
  }

  if (url.startsWith('file:') && /\.(jsx|js)$/.test(url)) {
    const file = fileURLToPath(url);
    if (file.startsWith(SRC)) {
      const code = readFileSync(file, 'utf8');
      // production:true → the automatic runtime emits react/jsx-runtime (not the
      // dev jsx-dev-runtime), which is what SectionRenderer's recursion needs to
      // render. Tests set NODE_ENV=production to match component runtime branches.
      const { code: out } = transform(code, {
        transforms: ['jsx'],
        jsxRuntime: 'automatic',
        production: true,
        filePath: file,
      });
      return { format: 'module', source: out, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
