/**
 * Run ONE test file under the verification suite's loader.
 *
 * `node --test` forks a child per file and does not propagate `--import`, so a
 * single-file run has to drive the programmatic runner with isolation:'none' —
 * the same arrangement test/run.mjs uses, reduced to one path. A convenience for
 * iterating on a new file; `npm test` is still what decides.
 *
 * Run: node scripts/_run-one-test.mjs test/pure/<name>.test.mjs
 */
import { register } from 'node:module';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
register(new URL('../test/loader.mjs', import.meta.url));

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/_run-one-test.mjs <file...>'); process.exit(2); }

let failed = 0;
const stream = run({ files, isolation: 'none', concurrency: false });
stream.on('test:fail', () => { failed += 1; });
stream.compose(spec).pipe(process.stdout);
stream.on('end', () => process.exit(failed ? 1 : 0));
