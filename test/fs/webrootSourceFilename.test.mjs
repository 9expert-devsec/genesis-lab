import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE SOURCE FILENAME IS A LABEL. IT MUST NEVER BECOME A PATH.
 *
 * ══ WHY THIS FIELD IS DIFFERENT FROM EVERY OTHER ONE ON THE ROW ════════════
 *
 * `filename`, `blobPathname` and `publicPath` are all DERIVED server-side from
 * an enum-locked value — `webrootUploadTarget(filename)` over the frozen three.
 * `sourceFilename` cannot be: its entire purpose is to record a name that is
 * NOT one of the three, so it arrives from `File.name` in the browser,
 * unverified and unconstrained.
 *
 * That makes it the one value on this row a caller could use to steer a write.
 * The whole safety argument is that nothing does — and an argument is not a
 * guard, so the property is asserted over source here.
 *
 * ── WHAT THIS CAN AND CANNOT SEE, SAID PLAINLY ────────────────────────────
 * It reads source text. It proves no line in the scanned files passes this
 * value into a path builder, a Blob call, an href or a src. It cannot prove a
 * value laundered through a variable two hops away, and it cannot prove
 * anything about code outside the scanned set. The CONTROL below exists
 * because a matcher that silently matched nothing would satisfy every negative
 * in this file forever, which would be worse than having no guard.
 */

const MODEL = 'src/models/WebrootDocumentFile.js';
const ACTION = 'src/lib/actions/webroot-documents.js';
const CLIENT = 'src/app/admin/media/webroot-documents/_components/WebrootDocumentsClient.jsx';
const ROUTE = 'src/app/api/admin/webroot-documents/upload/route.js';
const TARGET = 'src/lib/webrootDocuments.mjs';

/** Every construct that turns a value into a path, a key, a URL or a request. */
const PATH_SINKS = [
  'webrootUploadTarget', 'webrootArchivePathname', 'webrootBlobPathname', 'webrootPublicPath',
  'put', 'copy', 'head', 'del',
  'blobPathname:', 'publicPath:', 'pathname:', 'archivePathname:',
  'href=', 'src=', 'fetch(', 'redirect(',
];

/**
 * Does `line` both mention the field AND reach a sink?
 *
 * Line-scoped on purpose: a file that merely contains both somewhere is not
 * evidence, and a whole-file test would flag the model (which declares the
 * field beside the derived ones) forever.
 */
function sinkHitsIn(code) {
  const hits = [];
  for (const [i, line] of code.split('\n').entries()) {
    if (!line.includes('sourceFilename')) continue;
    for (const sink of PATH_SINKS) {
      if (line.includes(sink)) hits.push({ line: i + 1, sink, text: line.trim() });
    }
  }
  return hits;
}

test('CONTROL: the files under scan exist and really were read', () => {
  for (const rel of [MODEL, ACTION, CLIENT, ROUTE, TARGET]) {
    const { code } = readSource(rel);
    assert.ok(code.length > 300, `${rel} scanned to ${code.length} chars`);
  }
});

// ══ THE PROPERTY ═══════════════════════════════════════════════════════════

test('sourceFilename NEVER feeds a pathname, key, URL or request', () => {
  const offenders = [];
  for (const rel of [MODEL, ACTION, CLIENT, ROUTE, TARGET]) {
    for (const h of sinkHitsIn(readSource(rel).code)) {
      offenders.push(`${rel}:${h.line} reaches "${h.sink}" — ${h.text.slice(0, 100)}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'the unverified source filename reaches a path sink:\n  ' + offenders.join('\n  '),
  );
});

test('CONTROL: the matcher WOULD catch it — synthetic wrong source, owned here', () => {
  /**
   * The assertion above is a negative. If PATH_SINKS were misspelled, or the
   * line scan were broken, it would pass against code that did exactly the
   * thing it forbids. So the matcher is run against fixtures this test owns,
   * shaped like the mistakes that are actually plausible.
   */
  const WRONG = [
    "    const target = webrootUploadTarget(sourceFilename);",
    "      blobPathname: `webroot-documents/${sourceFilename}`,",
    "  await copy(live, `webroot-archive/${sourceFilename}`, { token });",
    '  <a href={`/${r.sourceFilename}`}>open</a>',
    "  await fetch(`/api/x/${sourceFilename}`);",
  ];
  for (const line of WRONG) {
    assert.equal(
      sinkHitsIn(line).length > 0, true,
      `the matcher missed a real misuse: ${line.trim()}`,
    );
  }

  const SAFE = [
    "    sourceFilename: String(sourceFilename ?? '').slice(0, 255),",
    '    sourceFilename: { type: String, default: \'\' },',
    '        sourceFilename: 1,',
    '                  ? <span data-source-filename>{r.sourceFilename}</span>',
  ];
  for (const line of SAFE) {
    assert.equal(
      sinkHitsIn(line).length, 0,
      `the matcher flagged a legitimate use: ${line.trim()}`,
    );
  }
});

// ══ THE DESTINATION STAYS DERIVED ══════════════════════════════════════════

test('the destination is still derived from the ENUM-LOCKED filename, not the label', () => {
  const { code } = readSource(ACTION);
  assert.match(
    code, /const target = webrootUploadTarget\(filename\);/,
    'the target is no longer derived from the enum-locked destination name',
  );
  // and the row's path fields come from that target, not from anything supplied
  assert.match(code, /blobPathname: target\.blobPathname,/);
  assert.match(code, /publicPath: target\.publicPath,/);
});

test('the value is BOUNDED before it is stored', () => {
  // An unverified client writes this into a row a listing renders.
  assert.match(
    readSource(ACTION).code,
    /sourceFilename: String\(sourceFilename \?\? ''\)\.slice\(0, 255\)/,
    'the stored label is unbounded',
  );
});

test('the CLIENT actually sends it, from the picked File', () => {
  /**
   * Added deliberately, and the reason is a defect from earlier this week: the
   * byte-formatter extraction had every pure assertion it needed and NONE that
   * the component called the shared function, so reverting the call site left
   * the suite green. The same shape applies here — every assertion below is
   * about what the action and the model do with the value, and none of them
   * would notice the client never sending one.
   */
  const { code } = readSource(CLIENT);
  assert.match(
    code, /sourceFilename: file\.name,/,
    'the client does not send the picked file name — every row would record an empty label',
  );
  // and it is sent to the RECORD call, not smuggled into the upload
  const rec = code.slice(code.indexOf('recordWebrootReplacement({'));
  assert.match(rec.slice(0, 900), /sourceFilename: file\.name,/,
    'the name is sent somewhere other than the record call');
});

test('it is recorded at RECORD time, never at PREPARE time', () => {
  /**
   * prepare issues the receipt the upload route trusts and re-derives the
   * destination from. An unverified name in that object would cross the trust
   * boundary the receipt exists to hold.
   */
  const { code } = readSource(ACTION);
  const prep = code.slice(code.indexOf('export async function prepareWebrootReplacement'),
    code.indexOf('export async function recordWebrootReplacement'));
  assert.ok(prep.length > 200, 'could not bound prepareWebrootReplacement');
  assert.equal(
    prep.includes('sourceFilename'), false,
    'the source filename reached the prepare/receipt path — it must only reach the record',
  );
  // and the receipt model does not carry it at all
  assert.equal(
    readSource('src/models/WebrootUploadReceipt.js').code.includes('sourceFilename'), false,
    'the receipt gained a client-supplied name',
  );
});

// ══ IT REACHES THE DOM, SAFELY ═════════════════════════════════════════════

test('it is rendered as an escaped JSX child, never through dangerouslySetInnerHTML', () => {
  const { code } = readSource(CLIENT);
  assert.match(code, /\{r\.sourceFilename\}/, 'the source name is stored but never shown');
  assert.equal(
    /dangerouslySetInnerHTML/.test(code), false,
    'this component uses dangerouslySetInnerHTML — an unverified name must not go near it',
  );
});

test('AN UNKNOWN SOURCE RENDERS AS UNKNOWN, never as the destination', () => {
  /**
   * The one that matters most. Rows written before this field existed have '',
   * and there is no honest way to invent a name for them. Falling back to
   * `r.filename` would print the file that was OVERWRITTEN as though it were
   * the file that was PICKED — which is precisely the confusion this change
   * exists to end.
   */
  const { code } = readSource(CLIENT);
  const block = code.slice(code.indexOf('ไฟล์ต้นทาง'), code.indexOf('archivePathname ?'));
  assert.ok(block.length > 40, 'could not bound the source-filename render');
  assert.match(block, /ไม่ทราบ/, 'there is no unknown rendering');
  assert.equal(
    /sourceFilename\s*\|\|\s*r\.filename|sourceFilename\s*\?\?\s*r\.filename/.test(code), false,
    'an unknown source falls back to the DESTINATION filename',
  );
});

test('CONTROL: no OTHER admin component renders this field, so the scan is complete', () => {
  const renderers = walkSources('src/app')
    .filter((f) => /sourceFilename/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(
    renderers, [CLIENT],
    'another component renders the unverified label and is not covered by this file',
  );
});
