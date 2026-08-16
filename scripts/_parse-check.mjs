import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
let bad = 0;
for (const f of process.argv.slice(2)) {
  try {
    transform(readFileSync(f, 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic', production: true, filePath: f });
    console.log('OK  ', f);
  } catch (e) { bad++; console.log('FAIL', f, '\n   ', e.message); }
}
process.exit(bad ? 1 : 0);
