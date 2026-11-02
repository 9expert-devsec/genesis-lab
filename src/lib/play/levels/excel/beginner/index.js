import l11 from './1-1.json';
import l12 from './1-2.json';
import l13 from './1-3.json';
import l14 from './1-4.json';
import l15 from './1-5.json';
import l21 from './2-1.json';
import l22 from './2-2.json';
import l23 from './2-3.json';
import l24 from './2-4.json';
import l25 from './2-5.json';
import l31 from './3-1.json';
import l32 from './3-2.json';
import l33 from './3-3.json';
import l34 from './3-4.json';
import l35 from './3-5.json';
import boss from './boss.json';

/** Excel Beginner levels in play order: CH.1 → CH.3, then the boss. */
export const EXCEL_BEGINNER_LEVELS = [
  l11, l12, l13, l14, l15,
  l21, l22, l23, l24, l25,
  l31, l32, l33, l34, l35,
  boss,
];

export function getLevel(id) {
  return EXCEL_BEGINNER_LEVELS.find((l) => l.id === id) || null;
}
