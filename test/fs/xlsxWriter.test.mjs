import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';

import { buildXlsx, zip, escapeXml, cellRef, STYLE } from '../../scripts/lib/xlsx-writer.mjs';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// scripts/lib/xlsx-writer.mjs writes a real .xlsx by hand — a ZIP of XML, with
// a CRC32 and a central directory assembled from byte offsets. There is no
// library underneath it to be correct on its behalf.
//
// The failure mode is specific and nasty: Excel refuses a malformed workbook
// with no useful message, and the person who finds out is whoever opens the
// file — in this case someone presenting a migration handover to management.
// A test that only checked "a Buffer came back" would pass for every one of
// those failures, so every assertion here READS THE ARCHIVE BACK: Node's own
// `inflateRawSync` decompresses what the writer's `deflateRawSync` produced,
// and the parts are checked as text.
//
// The CRC is the one field nothing else would catch. It is not read by this
// module, it is not needed to inflate the data, and it is what Excel and every
// other ZIP reader validate — so a wrong CRC produces a file that is perfectly
// readable here and rejected there. It is therefore recomputed independently
// below rather than trusted.

/** Parse a ZIP the writer produced. Returns `Map<name, {raw, crc, sizes}>`. */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'end-of-central-directory record present');
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);

  const out = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(cursor), 0x02014b50, `central header ${i} signature`);
    const crc = buf.readUInt32LE(cursor + 16);
    const compSize = buf.readUInt32LE(cursor + 20);
    const rawSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const local = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);

    assert.equal(buf.readUInt32LE(local), 0x04034b50, `${name}: local header signature`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = inflateRawSync(buf.subarray(start, start + compSize));

    out.set(name, { raw, crc, rawSize });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** CRC32, written independently of the module under test. */
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}

const SHEET = {
  name: 'Sheet A',
  rows: [
    { cells: [{ v: 'Header', s: STYLE.HEADER }, { v: 'Bytes', s: STYLE.HEADER }] },
    { cells: ['/files/photo/g01.jpg', { v: 266209, s: STYLE.NUMBER }] },
  ],
};

// ── the archive ─────────────────────────────────────────────────────────────

test('the CRC32 in every header matches the uncompressed bytes', () => {
  // THE ASSERTION THAT CANNOT BE SATISFIED BY ACCIDENT. Nothing in the writer
  // or the reader above needs the CRC to be right; Excel does. A wrong one
  // yields a file that round-trips perfectly here and is rejected there.
  const entries = readZip(buildXlsx([SHEET, { name: 'Sheet B', rows: [{ cells: ['x'] }] }]));
  assert.ok(entries.size >= 7, `expected all parts, got ${entries.size}`);
  for (const [name, e] of entries) {
    assert.equal(e.crc, crc32(e.raw), `${name}: CRC32 mismatch`);
    assert.equal(e.rawSize, e.raw.length, `${name}: uncompressed size mismatch`);
  }
});

test('CONTROL: the independent CRC32 disagrees when the bytes differ', () => {
  // Without this, the assertion above would pass for a crc32 that returned a
  // constant, or for two identically-wrong implementations.
  assert.notEqual(crc32(Buffer.from('a')), crc32(Buffer.from('b')));
  assert.equal(crc32(Buffer.from('')), 0);
  // A known vector, so a wholesale sign/shift error is visible.
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('every part an .xlsx requires is present and is XML', () => {
  const entries = readZip(buildXlsx([SHEET, { name: 'Sheet B', rows: [{ cells: ['x'] }] }]));
  for (const required of [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
  ]) {
    assert.ok(entries.has(required), `missing ${required}`);
    assert.match(entries.get(required).raw.toString('utf8'), /^<\?xml /, `${required} is not XML`);
  }
});

test('a sheet is declared in the workbook, the rels AND the content types', () => {
  // The three have to agree or Excel opens an empty workbook — a failure that
  // looks like "the report found nothing" rather than "the file is wrong".
  const entries = readZip(buildXlsx([SHEET, { name: 'Sheet B', rows: [{ cells: ['x'] }] }]));
  const text = (n) => entries.get(n).raw.toString('utf8');

  assert.match(text('xl/workbook.xml'), /name="Sheet A" sheetId="1" r:id="rId1"/);
  assert.match(text('xl/workbook.xml'), /name="Sheet B" sheetId="2" r:id="rId2"/);
  assert.match(text('xl/_rels/workbook.xml.rels'), /Id="rId1"[^>]*Target="worksheets\/sheet1\.xml"/);
  assert.match(text('xl/_rels/workbook.xml.rels'), /Id="rId2"[^>]*Target="worksheets\/sheet2\.xml"/);
  assert.match(text('[Content_Types].xml'), /PartName="\/xl\/worksheets\/sheet1\.xml"/);
  assert.match(text('[Content_Types].xml'), /PartName="\/xl\/worksheets\/sheet2\.xml"/);
  // The styles part is referenced by the LAST rId, after every sheet. Off by
  // one here and the sheets load with no formatting, or not at all.
  assert.match(text('xl/_rels/workbook.xml.rels'), /Id="rId3"[^>]*Target="styles\.xml"/);
});

// ── cells ───────────────────────────────────────────────────────────────────

test('a number is written as a number, not as text', () => {
  // The whole point of emitting .xlsx rather than CSV is that the byte column
  // sums. An inline string that looks like a number does not.
  const sheet = readZip(buildXlsx([SHEET])).get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(sheet, /<c r="B2"[^>]*><v>266209<\/v><\/c>/, 'numeric cell carries <v>, no t="inlineStr"');
  assert.match(sheet, /<c r="A2"[^>]*t="inlineStr"><is><t[^>]*>\/files\/photo\/g01\.jpg<\/t>/);
});

test('empty, null and undefined all become an empty cell rather than the string "null"', () => {
  const sheet = readZip(buildXlsx([{ name: 'S', rows: [{ cells: ['', null, undefined, 0] }] }]))
    .get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(sheet, /<c r="A1"\/>/);
  assert.match(sheet, /<c r="B1"\/>/);
  assert.match(sheet, /<c r="C1"\/>/);
  // …but a real zero is a value, not an absence.
  assert.match(sheet, /<c r="D1"[^>]*><v>0<\/v><\/c>/, 'zero must survive as a number');
});

test('the legacy characters that broke this migration survive a round trip', () => {
  // Every one of these is a real filename trait from the legacy tree: `&` and
  // `#` (which needed reviewed substitutions), Thai script, spaces, parentheses.
  const names = [
    '/files/course/Sales & Marketing.pdf',
    '/files/course/Programming in C#.png',
    '/files/document/case-study-excel-ช่วยทำ-project-plan.xlsx',
    '/files/photo/hello world (v1).png',
    '/files/x/quote"inside.png',
    '/files/x/less<greater>.png',
  ];
  const sheet = readZip(buildXlsx([{ name: 'S', rows: names.map((n) => ({ cells: [n] })) }]))
    .get('xl/worksheets/sheet1.xml').raw.toString('utf8');

  assert.match(sheet, /Sales &amp; Marketing/, '& is escaped, not dropped');
  assert.match(sheet, /Programming in C#/, '# needs no escaping and must not be mangled');
  assert.match(sheet, /ช่วยทำ/, 'Thai script survives');
  assert.match(sheet, /hello world \(v1\)/);
  assert.match(sheet, /quote&quot;inside/);
  assert.match(sheet, /less&lt;greater&gt;/);
  assert.doesNotMatch(sheet, /Sales & Marketing/, 'a bare & would make the XML invalid');
});

test('control characters are DROPPED, because XML 1.0 cannot carry them', () => {
  // There is no escape for these. Encoding one as &#1; is still invalid and
  // Excel rejects the whole workbook — so the writer removes them.
  const dirty = `a\u0001b\u0002c\u0008d\uFFFEe`;
  assert.equal(escapeXml(dirty), 'abcde');
  // Tab, newline and carriage return ARE legal and must not be stripped.
  assert.equal(escapeXml('a\tb\nc\rd'), 'a\tb\nc\rd');

  const sheet = readZip(buildXlsx([{ name: 'S', rows: [{ cells: [dirty] }] }]))
    .get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(sheet, /<t[^>]*>abcde<\/t>/);
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(sheet, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, 'no raw control byte reached the XML');
});

test('angle brackets balance in every part — the cheap structural check', () => {
  // The report script runs this same check on its own output before claiming
  // success. Pinning it here means a writer change that truncates a sheet
  // reddens in the suite rather than at the moment somebody opens the file.
  const entries = readZip(buildXlsx([SHEET, { name: 'Sheet B', rows: [{ cells: ['x'] }] }]));
  for (const [name, e] of entries) {
    const text = e.raw.toString('utf8');
    const open = (text.match(/</g) || []).length;
    const close = (text.match(/>/g) || []).length;
    assert.equal(open, close, `${name}: ${open} '<' vs ${close} '>'`);
  }
});

// ── references and layout ───────────────────────────────────────────────────

test('cellRef spells the columns Excel spells', () => {
  assert.equal(cellRef(0, 1), 'A1');
  assert.equal(cellRef(25, 1), 'Z1');
  // THE OFF-BY-ONE. A naive base-26 gives 'BA' here; Excel says 'AA'. With 11
  // columns today nothing reaches it, which is exactly why it is pinned — the
  // first person to add column 27 should not be the one who discovers it.
  assert.equal(cellRef(26, 1), 'AA1');
  assert.equal(cellRef(27, 5), 'AB5');
  assert.equal(cellRef(51, 2), 'AZ2');
  assert.equal(cellRef(52, 2), 'BA2');
  assert.equal(cellRef(701, 9), 'ZZ9');
  assert.equal(cellRef(702, 9), 'AAA9');
});

test('freeze panes and autofilter are emitted only when asked for', () => {
  const withBoth = readZip(buildXlsx([{ ...SHEET, freezeHeader: true, autoFilter: true }]))
    .get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(withBoth, /<pane ySplit="1" topLeftCell="A2"[^>]*state="frozen"\/>/);
  assert.match(withBoth, /<autoFilter ref="A1:B2"\/>/, 'the range spans the real used area');

  const without = readZip(buildXlsx([SHEET])).get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.doesNotMatch(without, /<pane /);
  assert.doesNotMatch(without, /<autoFilter/);
});

test('a style index reaches the cell it was set on', () => {
  const sheet = readZip(buildXlsx([SHEET])).get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(sheet, /<c r="A1" s="1"/, 'header style');
  assert.match(sheet, /<c r="B2" s="2"/, 'number style');
  // …and every index used must exist in the stylesheet, or Excel repairs the
  // file on open (which is a dialog in front of the audience).
  const styles = readZip(buildXlsx([SHEET])).get('xl/styles.xml').raw.toString('utf8');
  const declared = Number(styles.match(/<cellXfs count="(\d+)"/)[1]);
  for (const idx of Object.values(STYLE)) {
    assert.ok(idx < declared, `STYLE index ${idx} is not declared in cellXfs (count ${declared})`);
  }
});

// ── determinism and scale ───────────────────────────────────────────────────

test('the same input produces byte-identical output', () => {
  // The fixed 1980 timestamp is what makes this true, and it is the property
  // that lets two handover runs be diffed for DATA changes rather than clock
  // changes. A Date.now() creeping into the writer would break it silently.
  assert.deepEqual(buildXlsx([SHEET]), buildXlsx([SHEET]));
});

test('a 7,000-row sheet stays well under a megabyte and still reads back', () => {
  // The real inventory is ~7,100 rows over 11 columns. Inline strings are the
  // costly choice; this is the measurement that says the cost is acceptable.
  const rows = [{ cells: ['Root', 'Source path', 'Bytes'] }];
  for (let i = 0; i < 7000; i += 1) {
    rows.push({ cells: ['sites/default/files', `/sites/default/files/articles/images/file-${i}.png`, { v: i * 137, s: STYLE.NUMBER }] });
  }
  const buf = buildXlsx([{ name: 'Inventory', rows }]);
  assert.ok(buf.length < 1024 * 1024, `${(buf.length / 1024).toFixed(0)} KB — expected under 1 MB`);

  const sheet = readZip(buf).get('xl/worksheets/sheet1.xml').raw.toString('utf8');
  assert.match(sheet, /<row r="7001">/, 'the last row is present');
  assert.match(sheet, /file-6999\.png/);
});

test('zip() refuses nothing and buildXlsx() refuses an empty workbook', () => {
  // A zero-sheet workbook is a file Excel cannot open. Failing at the call is
  // better than producing it.
  assert.throws(() => buildXlsx([]), /at least one sheet/);
  // …while an empty ARCHIVE is a legitimate thing for the zip primitive to make.
  const empty = zip([]);
  assert.equal(empty.readUInt32LE(empty.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))), 0x06054b50);
});
