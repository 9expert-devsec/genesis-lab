/**
 * The hooks half of _probe-live-register.mjs. See that file for why a live
 * probe cannot use test/loader.mjs.
 *
 * Deliberately NOT a copy of test/loader.mjs with lines deleted: it is the same
 * two bridges (the `@/` alias, and sucrase for JSX) written out small, plus the
 * three framework stubs, and nothing else. A trimmed copy would invite someone
 * to "restore" the data stubs it exists to omit.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { transform } from 'sucrase';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'src');
const EXTS = ['.js', '.jsx'];

/**
 * Framework-only. Every entry here decides MARKUP; none of them reads course
 * data, so none can affect a number this probe reports. The verification
 * suite's own stubs are reused rather than re-written.
 */
const STUBS = {
  'next/link': path.join(ROOT, 'test', 'stub-next-link.mjs'),
  'next/image': path.join(ROOT, 'test', 'stub-next-image.mjs'),
  'next/navigation': path.join(ROOT, 'test', 'stub-next-navigation.mjs'),
};

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
    if (!existsSync(candidate) || !path.extname(candidate)) target = candidate;
  }
  if (target) {
    const fs = resolveFsPath(target);
    if (fs) return { url: pathToFileURL(fs).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const file = fileURLToPath(url);
    if (file.startsWith(SRC)) {
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
      const { code } = transform(readFileSync(file, 'utf8'), {
        transforms: ['jsx'],
        jsxRuntime: 'automatic',
        production: true,
        filePath: file,
      });
      return { format: 'module', source: code, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
