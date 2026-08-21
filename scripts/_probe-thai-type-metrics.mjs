/**
 * WHAT LINE SEED SANS TH ACTUALLY MEASURES — read from the font, not estimated.
 *
 *   node scripts/_probe-thai-type-metrics.mjs
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *
 * Two questions on the registration detail screens could only be answered by
 * guessing, and both were answered wrongly at least once:
 *
 *   1. HOW MUCH LINE-HEIGHT DOES THAI NEED AT A GIVEN px? Round 3 clipped upper
 *      marks at 27px inside a 30px block and dropped to 24px. That fix was
 *      arrived at by looking, and the number that would have predicted it — the
 *      font's own ascent/descent — was never read.
 *   2. HOW WIDE IS THE LONGEST LABEL? `FIELD_ROW_COLUMNS`' docstring said
 *      `เลขประจำตัวผู้เสียภาษี` "needs roughly 130px at 11px" and used that to
 *      choose the `lg` breakpoint. IT IS 97.3px. The conclusion survived; the
 *      arithmetic under it did not, and round 11's label-size decision could not
 *      be taken on a number that was 34% out.
 *
 * ══ WHAT IT READS, AND WHAT IT CANNOT ═══════════════════════════════════════
 *
 * The Thai family ships as woff2 — brotli over a repacked SFNT — so this file
 * carries a minimal extractor rather than a dependency. It reads `head`, `hhea`,
 * `OS/2`, `cmap` (format 4) and `hmtx`, all of which woff2 stores untransformed.
 * It does NOT reconstruct `glyf`/`loca`, which woff2 does transform, so per-glyph
 * ink extents are not available here — the `head` bounding box is the whole
 * font's, which is the conservative direction for a clearance floor.
 *
 * ── THE WIDTHS ARE ADVANCE SUMS, WITH NO GPOS ─────────────────────────────
 * Thai combining marks carry a zero advance, so the sum IS the set width for
 * ordinary Thai. What is missing is kerning and any GPOS adjustment, which for
 * this family is mark positioning (already zero-advance) rather than tracking.
 * STATED AS A LIMIT: treat the numbers as ±1-2% and never as the last word on
 * whether a label fits. A browser is the only thing that settles that.
 */
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const THAI_REGULAR = path.join(ROOT, 'src', 'fonts', 'LINESeedSansTH_W_Rg.woff2');

// The 63 tags woff2 encodes by index, in spec order; 63 itself means "a 4-byte
// tag follows".
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

function readUIntBase128(buf, cursor) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[cursor.at]; cursor.at += 1;
    value = ((value << 7) | (byte & 0x7f)) >>> 0;
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('UIntBase128 longer than 5 bytes — not a woff2');
}

/** The SFNT tables, keyed by tag, out of a woff2 file. */
function woff2Tables(buf) {
  if (buf.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const cursor = { at: 48 };
  const directory = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[cursor.at]; cursor.at += 1;
    const index = flags & 0x3f;
    const transform = (flags >> 6) & 0x03;
    let tag;
    if (index === 63) { tag = buf.toString('ascii', cursor.at, cursor.at + 4); cursor.at += 4; }
    else tag = KNOWN_TAGS[index];
    const origLength = readUIntBase128(buf, cursor);
    // glyf/loca invert the convention: 3 means null-transform for those two, 0
    // for everything else.
    const untransformed = (tag === 'glyf' || tag === 'loca') ? transform === 3 : transform === 0;
    const length = untransformed ? origLength : readUIntBase128(buf, cursor);
    directory.push({ tag, length, untransformed });
  }
  const stream = brotliDecompressSync(buf.subarray(cursor.at, cursor.at + compressedSize));
  const tables = {};
  let offset = 0;
  for (const entry of directory) {
    tables[entry.tag] = { ...entry, data: stream.subarray(offset, offset + entry.length) };
    offset += entry.length;
  }
  return tables;
}

/**
 * The vertical metrics that decide a line-height, in em.
 *
 * `naturalLineEm` — (ascent − descent + lineGap) / unitsPerEm — is the line box
 * the browser gives this font at `line-height: normal`, and it is the FLOOR any
 * explicit `leading-` must clear: below it the half-leading goes NEGATIVE, the
 * glyph box grows out of its own line box, and any ancestor with
 * `overflow:hidden` (which is what `truncate` is) shears the upper marks off.
 *
 * `inkEm` is `head`'s bounding box, i.e. the tallest-to-lowest extent any glyph
 * in the font reaches. It is the conservative clearance target — most strings
 * never reach it — and it is what stops two wrapped lines touching.
 */
export function fontMetrics(file = THAI_REGULAR) {
  const tables = woff2Tables(readFileSync(file));
  const head = tables.head.data;
  const hhea = tables.hhea.data;
  const os2 = tables['OS/2'].data;
  const unitsPerEm = head.readUInt16BE(18);
  const ascent = hhea.readInt16BE(4);
  const descent = hhea.readInt16BE(6);
  const lineGap = hhea.readInt16BE(8);
  const yMax = head.readInt16BE(42);
  const yMin = head.readInt16BE(38);
  return {
    file,
    unitsPerEm,
    ascent, descent, lineGap, yMax, yMin,
    typoAscent: os2.readInt16BE(68),
    typoDescent: os2.readInt16BE(70),
    naturalLineEm: (ascent - descent + lineGap) / unitsPerEm,
    inkEm: (yMax - yMin) / unitsPerEm,
    tables,
  };
}

/** Advance widths, in em, for a string. See the GPOS caveat in the header. */
export function textWidthEm(text, metrics = fontMetrics()) {
  const { tables, unitsPerEm } = metrics;
  const cmap = tables.cmap.data;
  const numberOfHMetrics = tables.hhea.data.readUInt16BE(34);
  const hmtx = tables.hmtx;
  if (!hmtx.untransformed) throw new Error('hmtx is woff2-transformed — widths unavailable');

  let subtable = null;
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i += 1) {
    const rec = 4 + i * 8;
    const platform = cmap.readUInt16BE(rec);
    const encoding = cmap.readUInt16BE(rec + 2);
    const offset = cmap.readUInt32BE(rec + 4);
    if (platform === 3 && encoding === 1 && cmap.readUInt16BE(offset) === 4) subtable = offset;
  }
  if (subtable === null) throw new Error('no (3,1) format-4 cmap');

  const segX2 = cmap.readUInt16BE(subtable + 6);
  const segments = segX2 / 2;
  const endsAt = subtable + 14;
  const startsAt = endsAt + segX2 + 2;
  const deltasAt = startsAt + segX2;
  const rangesAt = deltasAt + segX2;

  const glyphFor = (codePoint) => {
    if (codePoint > 0xffff) return 0;
    for (let i = 0; i < segments; i += 1) {
      if (codePoint > cmap.readUInt16BE(endsAt + i * 2)) continue;
      const start = cmap.readUInt16BE(startsAt + i * 2);
      if (codePoint < start) return 0;
      const delta = cmap.readInt16BE(deltasAt + i * 2);
      const rangeOffset = cmap.readUInt16BE(rangesAt + i * 2);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = cmap.readUInt16BE(rangesAt + i * 2 + rangeOffset + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  const advance = (glyph) => hmtx.data.readUInt16BE(
    (glyph < numberOfHMetrics ? glyph : numberOfHMetrics - 1) * 4,
  );

  let units = 0;
  for (const character of text) {
    const glyph = glyphFor(character.codePointAt(0));
    if (glyph !== 0) units += advance(glyph);
  }
  return units / unitsPerEm;
}

// ── The two questions, answered ─────────────────────────────────────────────

/** Every field label on either detail screen. */
export const DETAIL_LABELS = [
  'ประเภทลูกค้า', 'ชื่อ-นามสกุล', 'ชื่อบริษัท', 'สาขา', 'เลขประจำตัวผู้เสียภาษี', 'ที่อยู่',
  'หลักสูตร', 'รหัสคอร์ส', 'รอบอบรม', 'รูปแบบการอบรม', 'อีเมล', 'เบอร์โทร',
  'วิธีชำระเงิน', 'สถานะการชำระ', 'ราคาต่อท่าน', 'VAT 7%', 'ยอดสุทธิ', 'วันที่ชำระ',
  'Omise Charge ID', 'สาเหตุที่ล้มเหลว', 'เลขอ้างอิง', 'Registration ID', 'Class ID',
  'ประเทศ', 'ชื่อบริษัท (ใบเสนอราคา)', 'บริษัท / องค์กร',
  'บริษัท / องค์กร (ที่ติดต่อ)', 'ตำแหน่ง / แผนก', 'LINE ID', 'สถานที่จัดอบรม',
  'จำนวนผู้เข้าอบรม', 'Request ID',
];

/**
 * The type pairs the detail screens ship, as [what, px, leading].
 *
 * PRINTED HERE FOR A HUMAN; NOT LOAD-BEARING. `registrationTypeScale` derives
 * the same list out of the exported constants and holds THIS against THAT, in
 * both directions — because a hand-written table is exactly what
 * `_control-round11.mjs apply leading-under-the-floor` sailed through.
 */
export const DETAIL_TYPE_PAIRS = [
  // Round 12. It was 40/48 — 1.200em against a 1.584em floor, the worst pair on
  // either screen by a factor of three, and the only one whose ink escaped its
  // line box far enough to reach the blocks above and below it.
  ['page heading', 40, 64],
  ['field value', 16, 28],
  ['field label (lg)', 13, 28],
  ['field label (stacked)', 13, 21],
  ['card heading', 14, 23],
  ['system-card heading', 12, 20],
];

/**
 * The narrowest width the 22% label track is ever drawn at.
 *
 * viewport 1024 (`lg`, the first step the split appears at) − 256 sidebar
 * − 48 page padding − 44 card padding = 676 inner; 22% of that. Below `lg` the
 * row stacks and the track does not exist, which is why this is the floor and
 * not the 768px row of `FIELD_ROW_COLUMNS`' table.
 */
export const NARROWEST_LABEL_TRACK_PX = 676 * 0.22;

if (process.argv[1]?.endsWith('_probe-thai-type-metrics.mjs')) {
  const m = fontMetrics();
  console.log(`\n${path.basename(m.file)}`);
  console.log(`  unitsPerEm ${m.unitsPerEm}  ascent ${m.ascent}  descent ${m.descent}  lineGap ${m.lineGap}`);
  console.log(`  head yMax ${m.yMax}  yMin ${m.yMin}`);
  console.log(`  NATURAL LINE BOX  ${m.naturalLineEm.toFixed(4)}em   <- the leading FLOOR`);
  console.log(`  INK EXTENT        ${m.inkEm.toFixed(4)}em   <- the clearance target`);

  console.log('\ntype pairs - leading vs the floor and the ink:');
  for (const [what, px, leading] of DETAIL_TYPE_PAIRS) {
    const floor = px * m.naturalLineEm;
    const ink = px * m.inkEm;
    console.log(`  ${leading >= floor ? 'ok   ' : 'UNDER'} ${what.padEnd(24)} ${px}px/${leading}px  `
      + `floor ${floor.toFixed(1)}  ink ${ink.toFixed(1)}  `
      + `slack ${(leading - floor).toFixed(1)} / ${(leading - ink).toFixed(1)}`);
  }

  console.log(`\nlabel advance widths - the track is ${NARROWEST_LABEL_TRACK_PX.toFixed(1)}px at the narrowest lg:`);
  for (const { label, em } of DETAIL_LABELS
    .map((label) => ({ label, em: textWidthEm(label, m) }))
    .sort((a, b) => a.em - b.em)) {
    const at13 = em * 13;
    console.log(`  ${em.toFixed(3).padStart(7)}em  11px ${(em * 11).toFixed(1).padStart(6)}  `
      + `12px ${(em * 12).toFixed(1).padStart(6)}  13px ${at13.toFixed(1).padStart(6)}  `
      + `14px ${(em * 14).toFixed(1).padStart(6)}   ${label}`
      + `${at13 > NARROWEST_LABEL_TRACK_PX ? '   <- OVERFLOWS at 13px' : ''}`);
  }

  console.log('\nPAGE HEADINGS at 40px — where each one wraps.');
  console.log('The H1 has the full content width: viewport − 256 sidebar (md and up) − 48 page padding.');
  const WIDTHS = [[375, 0], [430, 0], [768, 256], [1024, 256], [1280, 256], [1440, 256]];
  const avail = WIDTHS.map(([vp, side]) => [vp, vp - side - 48]);
  console.log('    ' + avail.map(([vp, w]) => `${vp}:${w}`.padStart(10)).join(''));
  for (const title of [
    'ข้อมูลการลงทะเบียน',
    'ข้อมูลการลงทะเบียน : สมชาย ใจดี',
    'ข้อมูลการลงทะเบียน : ปรีชา ตั้งใจมั่นคง',
    'ข้อมูลการลงทะเบียน : บริษัท ทดสอบ จำกัด',
    'ข้อมูลการลงทะเบียน : บริษัท ทดสอบระบบการอบรมและพัฒนาบุคลากร จำกัด',
  ]) {
    const px = textWidthEm(title, m) * 40;
    const cells = avail.map(([, w]) => (px <= w ? '     1 line' : '    WRAPS  ').padStart(10));
    console.log(`  ${px.toFixed(0).padStart(5)}px ${cells.join('')}   ${title}`);
  }

  console.log('\ncard headings at 14px (the h2 truncates, so this is about the card, not the row):');
  for (const heading of ['ข้อมูลสำหรับออกใบเสนอราคา', 'ตารางเวลา & รูปแบบการอบรม',
    'ผู้ประสานงาน & บริษัท', 'การชำระเงิน (Omise)', 'ผู้ประสานงาน', 'ข้อมูลคอร์ส']) {
    console.log(`  ${(textWidthEm(heading, m) * 14).toFixed(1).padStart(7)}px   ${heading}`);
  }
  console.log('');
}
