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

const STUBS = {
  'next/link': path.join(ROOT, 'test', 'stub-next-link.mjs'),
  'next/image': path.join(ROOT, 'test', 'stub-next-image.mjs'),
  // Client components in the render tier call useRouter/useSearchParams during
  // SSR; next/navigation does not resolve outside a Next runtime.
  'next/navigation': path.join(ROOT, 'test', 'stub-next-navigation.mjs'),
  // next/cache + next/server don't resolve outside a Next runtime; stub them so
  // webhook handler/route code can be exercised under this loader.
  'next/cache': path.join(ROOT, 'test', 'stub-next-cache.mjs'),
  'next/server': path.join(ROOT, 'test', 'stub-next-server.mjs'),
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
