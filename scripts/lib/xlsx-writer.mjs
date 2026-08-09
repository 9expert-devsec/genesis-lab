/**
 * A minimal .xlsx writer. NO DEPENDENCIES, and that is the whole reason it exists.
 *
 * ══ WHY THIS IS HERE AND NOT `npm i xlsx` ═══════════════════════════════════
 *
 * This repo has no spreadsheet library and no zip library, and the one thing
 * that wants one is a handover report generated a handful of times. Adding a
 * runtime dependency to the production `package.json` so a REPORT SCRIPT can
 * run is a permanent cost for an occasional need — every future `npm audit`,
 * every install, every supply-chain question now includes it.
 *
 * An .xlsx is a ZIP of XML. Node ships `zlib`, so the only things actually
 * missing are a CRC32 and the ZIP central directory, which are ~60 lines and
 * fully specified. That is a smaller and more inspectable surface than a
 * general-purpose spreadsheet library, and it cannot drift: the file it writes
 * is verified by reading it back with a real ZIP implementation
 * (test/fs/xlsxWriter.test.mjs uses Node's own inflate; the report script's
 * --self-check does the same at run time).
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * No formulas, no charts, no merged cells, no themes, no shared-string table.
 * Strings are written INLINE (`t="inlineStr"`), which costs bytes and buys the
 * absence of a second index that could disagree with the cells referencing it.
 * For a 7,000-row inventory that trade is free — the file deflates to well
 * under a megabyte either way.
 *
 * If a future caller needs a pivot table, that is the moment to reach for a
 * real library, and this file should be deleted rather than grown.
 *
 * ── THE ONE THING THAT IS EASY TO GET WRONG ─────────────────────────────────
 * Excel refuses the whole workbook, with no useful message, if a single cell
 * contains a raw control character. XML 1.0 forbids most of C0 and there is no
 * escape for them, so `escapeXml` DROPS them rather than encoding them. Legacy
 * filenames are the input here and they have already produced `&`, `#`, Thai
 * script and trailing spaces; assuming they contain nothing worse is exactly
 * the assumption this migration keeps disproving.
 */

import { deflateRawSync } from 'node:zlib';

// ── ZIP ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Build a ZIP archive from `[{ name, data }]`.
 *
 * Every entry is DEFLATE (method 8) with a fixed 1980-01-01 timestamp. The
 * fixed date is not laziness: it makes the output byte-identical for identical
 * input, so two runs of the report can be diffed to see whether the DATA moved
 * rather than only the clock.
 */
export function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compressed = deflateRawSync(body, { level: 9 });
    const crc = crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags: UTF-8 names
    local.writeUInt16LE(8, 8);            // method: deflate
    local.writeUInt16LE(0, 10);           // time  (fixed)
    local.writeUInt16LE(33, 12);          // date  (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra length

    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // central directory signature
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);              // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(33, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(body.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);              // extra
    cd.writeUInt16LE(0, 32);              // comment
    cd.writeUInt16LE(0, 34);              // disk number
    cd.writeUInt16LE(0, 36);              // internal attrs
    cd.writeUInt32LE(0, 38);              // external attrs
    cd.writeUInt32LE(offset, 42);         // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, cdBuf, end]);
}

// ── XML ───────────────────────────────────────────────────────────────────

/**
 * Escape for XML text, and DROP the characters XML 1.0 cannot represent.
 *
 * Tab, newline and carriage return are legal and kept; the rest of C0 and the
 * two noncharacters are removed. Excel rejects the entire workbook over one of
 * these, which is a failure that looks like "the report is broken" rather than
 * "one filename had a stray byte".
 */
export function escapeXml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A1, B1 … Z1, AA1 … for a zero-based column index. */
export function cellRef(col, row) {
  let name = '';
  let n = col;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${name}${row}`;
}

/**
 * One cell. A number stays a NUMBER — writing 2,854,505,086 as text is how a
 * byte column ends up unsummable in the spreadsheet it was made for.
 */
function cellXml(value, col, row, styleIdx) {
  const ref = cellRef(col, row);
  const s = styleIdx ? ` s="${styleIdx}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/**
 * Style indexes, matching the `cellXfs` order in STYLES below.
 *   0 default · 1 bold header · 2 thousands-separated integer · 3 bold + separated
 */
export const STYLE = Object.freeze({
  DEFAULT: 0, HEADER: 1, NUMBER: 2, BOLD_NUMBER: 3, BOLD: 4, GROUP: 5,
});

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B2A4A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet) {
  const { rows, columns = [], freezeHeader = false, autoFilter = false } = sheet;

  const cols = columns.length
    ? `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const pane = freezeHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const body = rows.map((row, r) => {
    const cells = row.cells
      .map((cell, c) => cellXml(cell?.v ?? cell, c, r + 1, cell?.s ?? row.style ?? 0))
      .join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');

  const width = rows.reduce((m, r) => Math.max(m, r.cells.length), 1);
  const filter = autoFilter && rows.length
    ? `<autoFilter ref="A1:${cellRef(width - 1, rows.length)}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`;
}

/**
 * Build a workbook.
 *
 * @param {Array<{name:string, rows:Array<{cells:Array, style?:number}>, columns?:Array<{width:number}>, freezeHeader?:boolean, autoFilter?:boolean}>} sheets
 * @returns {Buffer} the .xlsx bytes
 */
export function buildXlsx(sheets) {
  if (!sheets.length) throw new Error('a workbook needs at least one sheet');

  const sheetEntries = sheets.map((s, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: sheetXml(s),
  }));

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  return zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheetEntries,
  ]);
}
