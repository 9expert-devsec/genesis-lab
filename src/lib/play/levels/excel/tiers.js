import { EXCEL_BEGINNER_CHAPTERS, EXCEL_BEGINNER_LEVELS } from './beginner/index.js';
import { EXCEL_INTERMEDIATE_LEVELS } from './intermediate/index.js';

/**
 * The three Excel tiers as the map and the routes read them. A `comingSoon`
 * chapter has a name and a place on the map but no levels; `dots` is how many
 * empty progress dots its label shows until it is built.
 */

const soon = (name) => ({ name, comingSoon: true, dots: 5 });

export const EXCEL_TIERS = [
  {
    series: 'beginner',
    label: 'Beginner',
    sub: 'แผนที่ภารกิจของดาวที่คุณเลือก · ตอนนี้คือดาว Excel',
    levels: EXCEL_BEGINNER_LEVELS,
    chapters: Object.fromEntries(Object.entries(EXCEL_BEGINNER_CHAPTERS).map(([c, name]) => [c, { name }])),
  },
  {
    series: 'intermediate',
    label: 'Intermediate',
    sub: 'แผนที่ภารกิจระดับ Intermediate · IF, VLOOKUP, วันที่ + บอสคิดโบนัสพนักงาน',
    levels: EXCEL_INTERMEDIATE_LEVELS,
    chapters: {
      1: { name: 'ตัดสินใจด้วย IF' },
      2: soon('ค้นหาข้อมูล'),
      3: soon('ทำงานกับวันที่'),
      4: soon('BOSS คิดโบนัสพนักงาน'),
    },
  },
  {
    series: 'advanced',
    label: 'Advanced',
    sub: 'แผนที่ภารกิจระดับ Advanced · IFS, SUMIFS, XLOOKUP/UNIQUE + บอสรวมหลายบท',
    levels: [],
    chapters: {
      1: soon('เงื่อนไขหลายทาง'),
      2: soon('สรุปแบบมีเงื่อนไข'),
      3: soon('ค้นหาและจัดข้อมูล'),
      4: soon('BOSS ภารกิจรวมทุกบท'),
    },
  },
];

export const getTier = (series) => EXCEL_TIERS.find((t) => t.series === series) || null;
