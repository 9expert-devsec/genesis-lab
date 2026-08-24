// Stub for `@/models/PageBuilder`. Exports ONLY `default`, exactly as the real
// model does — test/fs/stubExportParity rejects extras. All state and control
// live in test/fakeDb.mjs.
import { makeModel } from './fakeDb.mjs';

export default makeModel('PageBuilder');
