/**
 * Run named test files through the suite's loader and PRINT THE FAILURE
 * DETAIL — which `npm test`'s spec reporter does not, because it streams and
 * discards the diagnostic.
 *
 * A developer affordance, not part of `npm test`. It exists because "which
 * assertion, and what were the two values" is the first question after a red
 * run, and answering it by bisecting the file by hand is slow enough that the
 * temptation is to guess instead.
 *
 * Usage: node scripts/_run-tests.mjs test/fs/foo.test.mjs [more…]
 */
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register(new URL('../test/loader.mjs', import.meta.url));

const { run } = await import('node:test');

const files = process.argv.slice(2).map((f) => path.join(ROOT, f));
if (files.length === 0) {
  console.error('usage: node scripts/_run-tests.mjs <test file> [...]');
  process.exit(2);
}

let pass = 0;
const failures = [];
const stream = run({ files, isolation: 'none', concurrency: false });
stream.on('test:pass', () => { pass += 1; });
stream.on('test:fail', (e) => {
  failures.push({ name: e.name, error: e.details?.error });
});
stream.on('data', () => {});
stream.on('close', () => {
  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  for (const f of failures) {
    console.log(`✖ ${f.name}`);
    const err = f.error?.cause ?? f.error;
    console.log(`   ${err?.message ?? err}`);
    if (err && 'actual' in err) {
      console.log(`   actual:   ${JSON.stringify(err.actual)}`);
      console.log(`   expected: ${JSON.stringify(err.expected)}`);
    }
    console.log('');
  }
  process.exit(failures.length ? 1 : 0);
});
