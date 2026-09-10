import { paletteByKey } from '@/lib/brand/palette';

/**
 * THE CONTENT OF /brand, as data.
 *
 * Every string here is the approved copy from the Master Brand Guideline v1.0
 * (21 July 2026), transcribed in prompts/brand-page-content-reference.md. It is
 * NOT rewritten, translated, paraphrased or tidied — a brand guideline is a
 * document someone signed off, and "improving" a sentence here silently forks
 * the page from the document it claims to reproduce.
 *
 * It sits in a module rather than inline in the JSX for two reasons: the logo
 * downloader in section 06 becomes two loops over two lists instead of a block
 * per form per ink, and it keeps page.jsx free of colour LITERALS — every hex
 * the page prints is either read from the brand palette or declared exactly
 * once, here.
 *
 * ══ THE LANGUAGE SPLIT IS THE SOURCE DOCUMENT'S, NOT A CHOICE MADE HERE ═════
 * ENGLISH — section and subsection titles, labels, colour names, keywords,
 *           table headers, button text.
 * THAI    — explanatory sentences, role descriptions, do/don't items.
 *
 * The guideline itself pairs English headings with Thai body copy throughout,
 * so this mirrors it rather than deciding per string. One consequence looks
 * like an oversight and is not: MINIMUM_SIZE_COLUMNS reads
 * `Logo form · Screen · Print · หมายเหตุ` — three English headers and one Thai.
 * That is the source table, verbatim.
 *
 * ── THE ASSET FILES ARE NOT IN THIS REPO ────────────────────────────────────
 * All 31 files are already uploaded and served from the legacy `/files` root,
 * which next.config.mjs rewrites to Cloudinary delivery. Referenced by path
 * only; nothing here is imported, bundled, or committed.
 *
 *   /files/ci-svg/<shape>-<variant>.svg   vector, delivered untransformed
 *   /files/ci/<shape>-<variant>.png       raster
 *   /files/ci/wallpaper-desktop.png       8000 x 4500, ~4.7 MB on disk
 */

// ═══════════════════════════════════════════════════════════════════════════
//  THE SECTION LIST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The six sections, in order. `id` is derived from the English title and is
 * PUBLIC API: these anchors get shared as links, so renaming one breaks
 * somebody's bookmark. Change an id only deliberately.
 *
 * ══ TYPOGRAPHY AND GRADIENTS ARE ABSENT ON PURPOSE ═════════════════════════
 *
 * Anyone reading the guideline's table of contents will notice two headings
 * that have no section here, conclude the page is incomplete, and add them.
 * It is not incomplete. Both were cut deliberately:
 *
 *   TYPOGRAPHY  Chapter 04, "TYPOGRAPHY & GRAPHIC LANGUAGE", is listed in the
 *               contents at pages 27-29. The document is 26 PAGES LONG and
 *               ends at 3.1. The chapter was never written — the contents page
 *               is describing a document that does not exist, so there is
 *               nothing to transcribe and no way to invent it that would not
 *               be us writing brand policy.
 *
 *   GRADIENTS   Appears exactly once in the whole guideline, as a PROHIBITION.
 *               A section built around a single "don't" would give it a
 *               prominence the document does not.
 *
 * So: no section, no placeholder, no "coming soon" row. test/render/brandPage
 * asserts neither word appears anywhere on the page, precisely because the
 * contents page makes restoring them look like a fix. When the chapter is
 * actually written, that assertion is the thing to delete first, deliberately.
 */
export const BRAND_SECTIONS = Object.freeze([
  Object.freeze({ number: '01', id: 'brand-story', title: 'Brand Story' }),
  Object.freeze({ number: '02', id: 'logo', title: 'Logo' }),
  Object.freeze({ number: '03', id: 'logo-usage', title: 'Logo Usage' }),
  Object.freeze({ number: '04', id: 'colors', title: 'Colors' }),
  Object.freeze({ number: '05', id: 'do-and-dont', title: "Do & Don't" }),
  Object.freeze({ number: '06', id: 'brand-assets', title: 'Brand Assets' }),
]);

/** Look one up by id, so page.jsx names a section rather than an array index. */
export const sectionById = Object.freeze(
  Object.fromEntries(BRAND_SECTIONS.map((s) => [s.id, s])),
);

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE HEADER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The page title and its sub-line.
 *
 * ⚠ THE SUB-LINE IS LIFTED, NOT WRITTEN. The content reference has no dedicated
 * h1 sub-line — its only page-level Thai sentence is the provenance clause that
 * opens the closing note. Rather than invent a Thai sentence (which the brief
 * forbids and which would be us writing copy), that clause is used here and the
 * closing note now begins at its second sentence. Nothing is duplicated and
 * nothing is paraphrased; one approved sentence moved to the top of the page.
 * If a real sub-line is written, replace this and restore the closing note.
 */
export const PAGE_HEADER = Object.freeze({
  eyebrow: 'Brand Asset Package',
  title: 'Brand Guidelines',
  subline: 'ข้อมูลทั้งหมดในหน้านี้อ้างอิงจาก Master Brand Guideline เวอร์ชัน 1.0',
});

/** The closing note's remaining sentence. `หน้าติดต่อเรา` becomes the link. */
export const CLOSING_NOTE = Object.freeze({
  before: 'หากต้องการไฟล์รูปแบบอื่น เช่น EPS หรือ AI สำหรับงานพิมพ์ หรือมีข้อสงสัยเรื่องการใช้อัตลักษณ์ ติดต่อทีมงาน 9Expert ได้ที่',
  linkText: 'หน้าติดต่อเรา',
  href: '/contact-us',
});

// ═══════════════════════════════════════════════════════════════════════════
//  01 · BRAND STORY
// ═══════════════════════════════════════════════════════════════════════════

export const ABOUT_PARAGRAPHS = Object.freeze([
  'จุดเริ่มต้นของ 9Expert Training มาจากความเชื่อว่าเทคโนโลยีสามารถเปลี่ยนแปลงวิธีการทำงานและเพิ่มศักยภาพของคนไทยได้จริง',
  'เราจึงมุ่งมั่นพัฒนาหลักสูตรที่ทันสมัย เข้าใจง่ายและใช้งานได้จริง โดยทีมวิทยากรและผู้เชี่ยวชาญที่มีประสบการณ์จากการทำงานจริง',
  'ตลอดระยะเวลากว่า 21 ปี เราได้ช่วยพัฒนาทักษะให้กับบุคคลและองค์กรจำนวนมาก และเราจะยังคงก้าวต่อไป เพื่อเป็นเข็มทิศนำทางทุกคนไปสู่ความเชี่ยวชาญ',
]);

export const VISION =
  'เป็นผู้นำด้านการพัฒนาทักษะและความรู้ด้านเทคโนโลยีในประเทศไทยที่ได้รับความไว้วางใจมากที่สุด';

export const MISSION = Object.freeze([
  'พัฒนาหลักสูตรและเนื้อหาที่ทันสมัยและตอบโจทย์การทำงานจริง',
  'ส่งมอบประสบการณ์การเรียนรู้ที่เข้าใจง่ายและใช้ได้จริง',
  'สร้างชุมชนแห่งการเรียนรู้และการแบ่งปัน',
  'เป็นพันธมิตรทางความรู้ที่ช่วยให้องค์กรเติบโตอย่างยั่งยืน',
]);

export const BRAND_PURPOSE =
  'เรามุ่งมั่นสร้างโอกาสในการเรียนรู้ เพื่อให้ทุกคนก้าวสู่ความเชี่ยวชาญ และเติบโตไปพร้อมกับเทคโนโลยีอย่างมั่นใจ';

/**
 * Brand Positioning. The reference gives the framing sentence and then asks for
 * a TWO-POINT CONTRAST rather than a paragraph, with the second point marked as
 * where 9Expert sits — `isOurs`, which the markup turns into the emphasis.
 */
export const BRAND_POSITIONING = Object.freeze({
  lead: 'คอร์สและบริการของเราออกแบบมาเพื่อตอบโจทย์คนทำงานยุคใหม่ ที่ต้องการพัฒนาทักษะเพื่อสร้างผลลัพธ์ที่ดีขึ้นในองค์กร',
  points: Object.freeze([
    Object.freeze({ key: 'general', copy: 'สอนทั่วไป — เน้นทฤษฎีและพื้นฐาน', isOurs: false }),
    Object.freeze({ key: 'ours', copy: 'สอนเพื่อการใช้งานจริง', isOurs: true }),
  ]),
});

/**
 * Core Values — five, each an English name with a Thai line.
 *
 * The lead-in is the block's own. Brand Personality below has always had one,
 * and Core Values having none was half of why the two read as the same block
 * printed twice — see BrandTraits for the other half.
 */
export const CORE_VALUES_LEAD =
  'สิ่งที่เรายึดถือในการทำงานและส่งมอบให้ผู้เรียนทุกครั้ง';

export const CORE_VALUES = Object.freeze([
  Object.freeze({ name: 'Expertise', copy: 'เราพัฒนาความรู้และความเชี่ยวชาญอย่างต่อเนื่อง' }),
  Object.freeze({ name: 'Friendly', copy: 'เราเป็นมิตร เข้าถึงง่าย พร้อมช่วยเหลือ' }),
  Object.freeze({ name: 'Practical', copy: 'เราสอนสิ่งที่ใช้งานได้จริง นำไปใช้ได้ทันที' }),
  Object.freeze({ name: 'Forward-Thinking', copy: 'เรามองไปข้างหน้า พร้อมปรับตัว และสร้างสรรค์สิ่งใหม่' }),
  Object.freeze({ name: 'Trustworthy', copy: 'เราเชื่อถือได้ โปร่งใส ยึดมั่นในคุณภาพ' }),
]);

export const BRAND_PERSONALITY = Object.freeze({
  lead: 'บุคลิกของแบรนด์ที่เราต้องการสื่อสาร ผ่านทุกการออกแบบและทุกการสื่อสารบนสาธารณะ',
  // `Friendly` and `Practical` appear in CORE_VALUES too, with DIFFERENT Thai
  // lines. Both are the document's; neither is a copy-paste slip.
  traits: Object.freeze([
    Object.freeze({ name: 'Smart', copy: 'ชาญฉลาด ทันสมัย เข้าใจเทคโนโลยี' }),
    Object.freeze({ name: 'Friendly', copy: 'เป็นมิตร เข้าถึงง่าย และจริงใจ' }),
    Object.freeze({ name: 'Professional', copy: 'มืออาชีพ น่าเชื่อถือ และมีคุณภาพ' }),
    Object.freeze({ name: 'Practical', copy: 'เน้นการใช้งานจริง เกิดประโยชน์' }),
    Object.freeze({ name: 'Inspiring', copy: 'สร้างแรงบันดาลใจ และผลักดันให้ก้าวไปข้างหน้า' }),
  ]),
});

export const VOICE_AND_TONE = Object.freeze({
  lead: 'น้ำเสียงและรูปแบบการสื่อสารของ 9Expert Training',
  do: Object.freeze({
    title: 'Do',
    items: Object.freeze([
      'เป็นมืออาชีพ แต่เข้าใจง่าย',
      'กระชับ ชัดเจน ตรงประเด็น',
      'สร้างแรงบันดาลใจ และให้คุณค่า',
      'มั่นใจ แต่ไม่โอ้อวด',
      'เป็นมิตร และเข้าถึงง่าย',
    ]),
  }),
  avoid: Object.freeze({
    title: 'Avoid',
    items: Object.freeze([
      'การใช้ภาษาทางเทคนิคมากจนเกินไป',
      'การโอ้อวดหรือเกินจริง',
      'ประโยคยาว ซับซ้อน เข้าใจยาก',
      'ภาษาที่เป็นทางการเกินไป',
      'ข้อความที่ทำให้ผู้เรียนรู้สึกห่างเหิน',
    ]),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
//  02 · LOGO
// ═══════════════════════════════════════════════════════════════════════════

export const LOGO_MEANING = Object.freeze({
  lead: 'โลโก้ 9Expert ออกแบบมาเพื่อสื่อถึงความเป็นผู้เชี่ยวชาญ (Expertise) การนำทาง (Direction) และการก้าวไปข้างหน้าอย่างต่อเนื่อง ในการเรียนรู้เทคโนโลยีอย่างมีเป้าหมายและชัดเจน',
  // The Element column is Thai here — these are the shapes' Thai names in the
  // source table, not headings. See the language note at the top of this file.
  elements: Object.freeze([
    Object.freeze({ name: 'เลข 9', copy: 'สื่อถึงอัตลักษณ์ของแบรนด์ 9Expert และการจดจำที่ชัดเจน' }),
    Object.freeze({ name: 'เข็มทิศ / ทิศทาง', copy: 'สื่อถึงการนำทาง การชี้เป้า และการพาผู้เรียนไปสู่ความเชี่ยวชาญ' }),
    Object.freeze({ name: 'การเคลื่อนไปข้างหน้า', copy: 'สะท้อนการพัฒนาอย่างต่อเนื่องและความก้าวหน้าด้านเทคโนโลยี' }),
    Object.freeze({ name: 'รูปทรงที่เรียบง่าย', copy: 'ช่วยให้แบรนด์ดูทันสมัย น่าเชื่อถือ และใช้งานได้หลากหลาย' }),
  ]),
});

/** The four brand keywords, printed with the meaning grid. */
export const BRAND_KEYWORDS = Object.freeze(['Expertise', 'Direction', 'Growth', 'Clarity']);

export const LOGO_ANATOMY = Object.freeze({
  parts: Object.freeze([
    Object.freeze({ name: 'Symbol', copy: 'สัญลักษณ์ของแบรนด์' }),
    Object.freeze({ name: 'Direction Marker', copy: 'รูปทรงคล้ายเข็มทิศ สื่อถึงการชี้นำและทิศทาง' }),
    Object.freeze({ name: 'Wordmark', copy: 'ตัวอักษร Expert ที่ทำงานร่วมกับสัญลักษณ์' }),
  ]),
  rules: Object.freeze({
    title: 'Rules',
    items: Object.freeze([
      'ห้ามแยกองค์ประกอบและจัดวางใหม่โดยไม่ได้รับอนุมัติ',
      'ต้องคงสัดส่วนความสัมพันธ์ระหว่าง Symbol และ Wordmark',
      'ใช้เฉพาะ Artwork มาตรฐานขององค์กร',
    ]),
  }),
});

/**
 * Logo Construction. The reference writes the five measurements as one line
 * separated by ` · ` for compactness; they are five independent statements, so
 * they are stored as five entries and the markup lists them. Splitting a
 * separator is not rewriting — no word changes.
 */
export const LOGO_CONSTRUCTION = Object.freeze({
  measurements: Object.freeze([
    'Hs = ความสูงของ Symbol',
    'Hw = ความสูงของ Wordmark = 79% ของ Hs',
    'W = ความกว้างรวมของโลโก้ = 7.00 Hs',
    'H = ความสูงรวม = Hs',
    'ระยะห่างระหว่าง Symbol กับ Wordmark = 2x โดย 1x คือระยะห่างของตัวอักษรใน Wordmark',
  ]),
  note: 'การสร้างโลโก้ขึ้นใหม่จากการกะระยะด้วยสายตาอาจทำให้รูปทรงผิดเพี้ยน ให้ใช้ไฟล์ต้นฉบับจาก Brand Asset Package เท่านั้น',
});

// ═══════════════════════════════════════════════════════════════════════════
//  03 · LOGO USAGE
// ═══════════════════════════════════════════════════════════════════════════

export const CLEAR_SPACE =
  'กำหนดให้ X = ความกว้างของแกนภายในสัญลักษณ์ เว้นระยะอย่างน้อย 1x รอบทุกด้านของโลโก้ ห้ามให้ข้อความ กราฟิก หรือองค์ประกอบอื่นเข้ามาในพื้นที่ว่างที่กำหนดโดยเด็ดขาด';

/** Minimum Size — four columns, four rows. Three English headers and one Thai. */
export const MINIMUM_SIZE_COLUMNS = Object.freeze([
  'Logo form',
  'Screen',
  'Print',
  'หมายเหตุ',
]);

export const MINIMUM_SIZE_ROWS = Object.freeze([
  Object.freeze(['Signature Logo (Primary)', '160 px', '35 mm', 'ใช้งานหลักในสื่อส่วนใหญ่']),
  Object.freeze(['Square Logo (Secondary)', '120 px', '25 mm', 'ใช้เมื่อพื้นที่จำกัดในแนวตั้ง']),
  Object.freeze(['Wordmark', '90 px', '20 mm', 'ใช้เฉพาะกรณีที่ได้รับอนุมัติ']),
  Object.freeze(['Symbol', '24 px', '8 mm', 'เหมาะกับไอคอนและ favicon']),
]);

export const MINIMUM_SIZE_NOTE =
  'หากเล็กกว่าค่าที่กำหนด ความชัดเจนอาจลดลง ให้ทดสอบการอ่านจริงบนสื่อแต่ละขนาดและแพลตฟอร์มทุกครั้ง';

export const BACKGROUND_GUIDANCE = Object.freeze({
  do: Object.freeze({
    title: 'Do',
    items: Object.freeze([
      'โลโก้สีน้ำเงินบนพื้นหลังอ่อนหรือขาว',
      'โลโก้สีขาวหรือ Cloud Base บนพื้นสีเข้ม',
      'วางบนภาพได้ ถ้าภาพเรียบและตัดกับโลโก้เพียงพอ',
      'เหลือพื้นที่ว่างรอบโลโก้ให้เพียงพอ',
    ]),
  }),
  avoid: Object.freeze({
    title: 'Avoid',
    items: Object.freeze([
      'วางบนพื้นหลังที่สีใกล้เคียงกับโลโก้',
      'วางบนภาพที่มีรายละเอียดรบกวนมากเกินไป',
      'วางทับองค์ประกอบสำคัญของภาพ',
      'ใช้พื้นหลังที่คอนทราสต์ต่ำ',
    ]),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
//  04 · COLORS
// ═══════════════════════════════════════════════════════════════════════════
//
// The VALUES are not here. Name, hex, RGB, CMYK and the Thai role sentence all
// come from src/lib/brand/palette.js, which test/pure/brandPalette checks
// against tailwind.config.js. Retyping them into this page is the exact drift
// that guard exists to prevent.

export const COLOR_GUIDANCE = Object.freeze({
  do: Object.freeze({
    title: 'Do',
    items: Object.freeze([
      'ให้สีน้ำเงินเป็นตัวนำในงานส่วนใหญ่',
      'ใช้ Action Blue เมื่อต้องการเน้นการกระทำ เช่น ปุ่ม',
      'ใช้ Cloud Base เปิดพื้นที่ ลดความอึดอัดของเลย์เอาต์',
      'เลือกคู่สีที่คอนทราสต์ชัดเจน อ่านง่าย',
      'ตรวจค่าสีก่อนส่งออกทุกครั้ง',
    ]),
  }),
  avoid: Object.freeze({
    title: 'Avoid',
    items: Object.freeze([
      'ใช้สีเน้นมากเกินไปจนแย่งความสนใจกันเอง',
      'วาง Signal Lime เป็นตัวอักษรบนพื้นสว่าง คอนทราสต์ต่ำเกินไป ให้ใช้เป็นพื้นปุ่มหรือ badge แล้วใส่ตัวอักษรสี Deep Navy',
      'แทนค่าสีโดยพลการ หรือกะสีด้วยสายตา',
    ]),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
//  05 · DO & DON'T
// ═══════════════════════════════════════════════════════════════════════════

export const MISUSE_LEAD =
  'การใช้งานโลโก้อย่างไม่ถูกต้องอาจทำให้แบรนด์สูญเสียความน่าเชื่อถือ ลดความสม่ำเสมอในการสื่อสาร และทำให้ผู้รับสารจดจำแบรนด์ผิดไป';

export const PROHIBITIONS = Object.freeze({
  title: "Don't",
  items: Object.freeze([
    'ห้ามยืดโลโก้',
    'ห้ามบีบสัดส่วนโลโก้',
    'ห้ามหมุนโลโก้',
    'ห้ามเปลี่ยนเป็นสีอื่นนอกเหนือที่กำหนด',
    'ห้ามใส่เงาหรือเอฟเฟกต์',
    'ห้ามจัดองค์ประกอบใหม่',
    'ห้ามใช้พื้นหลังที่อ่านยาก',
    'ห้ามเปลี่ยนรูปแบบตัวอักษร',
  ]),
});

export const REQUIREMENTS = Object.freeze({
  title: 'Requirements',
  items: Object.freeze([
    'ใช้เฉพาะไฟล์โลโก้ที่ได้รับอนุมัติเท่านั้น',
    'ห้ามสร้างเวอร์ชันใหม่ด้วยตนเอง',
    'ห้ามเปลี่ยนสัดส่วน สี หรือรูปแบบตัวอักษร',
    'เมื่อไม่แน่ใจ ให้ตรวจสอบจาก Brand Asset Package',
  ]),
});

// ═══════════════════════════════════════════════════════════════════════════
//  06 · BRAND ASSETS
// ═══════════════════════════════════════════════════════════════════════════

/** `/files/...` — the served path, not a repo path. */
export const svgHref = (shape, variant) => `/files/ci-svg/${shape}-${variant}.svg`;
export const pngHref = (shape, variant) => `/files/ci/${shape}-${variant}.png`;

/**
 * THE FIVE APPROVED LOGO INKS.
 *
 * ── `tile` IS NOT DECORATION AND DOES NOT FOLLOW THE THEME ──────────────────
 * It records which background the guideline says this ink is FOR: a Cloud Base
 * logo is the knockout, so it can only be shown on dark; a Deep Navy logo can
 * only be shown on light. See BrandAssetExplorer, where that is enforced — the
 * selected ink drives all three tiles at once, and the theme never does.
 *
 * ── WHERE EACH HEX COMES FROM ───────────────────────────────────────────────
 * Three of the five inks ARE brand palette colours and read their hex from the
 * palette, so a value can never be printed here that the swatch grid in section
 * 04 disagrees with.
 *
 * State Deep and State Light are the other two, and they are NOT brand palette
 * colours — they are logo inks and nothing else. They carry their own hex here,
 * which is the only place either value appears, and they are deliberately
 * absent from src/lib/brand/palette.js and from section 04.
 */
export const LOGO_VARIANTS = Object.freeze([
  Object.freeze({
    key: 'nineblue',
    name: paletteByKey['nine-blue'].name,
    hex: paletteByKey['nine-blue'].hex,
    tile: 'light',
  }),
  Object.freeze({
    key: 'deepnavy',
    name: paletteByKey['deep-navy'].name,
    hex: paletteByKey['deep-navy'].hex,
    tile: 'light',
  }),
  Object.freeze({
    key: 'cloud',
    name: paletteByKey['cloud-base'].name,
    hex: paletteByKey['cloud-base'].hex,
    tile: 'dark',
  }),
  Object.freeze({ key: 'statedeep', name: 'State Deep', hex: '#5E6A7E', tile: 'light' }),
  Object.freeze({ key: 'statelight', name: 'State Light', hex: '#B7C3D4', tile: 'dark' }),
]);

/**
 * THE THREE LOGO SHAPES. `stageHeight` caps the artwork inside its tile so the
 * three grids read as one system: the signature lockup is wide and short, the
 * symbol and square marks are close to 1:1 and get more room.
 */
export const LOGO_SHAPES = Object.freeze([
  Object.freeze({
    key: 'signature',
    title: 'Signature Logo',
    blurb: 'โลโก้หลักแนวนอน ใช้เป็นค่าเริ่มต้นในสื่อทั่วไป',
    alt: 'Signature Logo',
    stageHeight: 'max-h-[74px]',
  }),
  Object.freeze({
    key: 'symbol',
    title: 'Symbol Logo',
    blurb: 'สัญลักษณ์เดี่ยว ใช้เมื่อพื้นที่จำกัด เช่น ไอคอนหรือ favicon',
    alt: 'Symbol Logo',
    stageHeight: 'max-h-[104px]',
  }),
  Object.freeze({
    key: 'square',
    title: 'Square Logo',
    blurb: 'ทรงสี่เหลี่ยมจัตุรัส ใช้กับช่องทางที่บังคับสัดส่วน 1:1',
    alt: 'Square Logo',
    stageHeight: 'max-h-[104px]',
  }),
]);

export const BRAND_ASSETS_LEAD =
  'Three logo forms, five approved colour variants each, available as SVG and PNG.';

/**
 * THE WALLPAPER.
 *
 * `downloadHref` is the stored asset. `previewHref` is THE SAME FILE requested
 * through the `/_img/w800` delivery variant next.config.mjs already defines
 * (f_webp,q_80,w_800,c_limit). Measured against the deployed site: 14,286 bytes
 * of WebP, against 39,296 for the default w_1600 variant and 4,846,891 for the
 * stored 8000 x 4500 PNG. See WallpaperPanel for why the preview must not be
 * the download URL.
 */
export const WALLPAPER = Object.freeze({
  downloadHref: '/files/ci/wallpaper-desktop.png',
  previewHref: '/_img/w800/files/ci/wallpaper-desktop.png',
  alt: 'Wallpaper 9Expert สำหรับเดสก์ท็อป',
  width: 8000,
  height: 4500,
  title: 'Wallpaper',
  blurb: 'วอลเปเปอร์เดสก์ท็อปลายอัตลักษณ์ 9Expert ความละเอียด 8000 × 4500 พิกเซล',
  cta: 'Download Wallpaper',
});
