/**
 * Chains onto test/loader.mjs, adding one stub the suite deliberately lacks.
 * See _walk-next-headers-stub.mjs for why it is not in the shared loader.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export * from '../test/loader.mjs';
import { resolve as baseResolve } from '../test/loader.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUBS = {
  'next/headers': pathToFileURL(path.join(HERE, '_walk-next-headers-stub.mjs')).href,
  'next/server':  pathToFileURL(path.join(HERE, '_walk-next-server-stub.mjs')).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  return baseResolve(specifier, context, nextResolve);
}
