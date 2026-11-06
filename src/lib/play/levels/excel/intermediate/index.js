import l11 from './1-1.json';
import l12 from './1-2.json';
import l13 from './1-3.json';
import l14 from './1-4.json';
import l15 from './1-5.json';

/** Excel Intermediate levels in play order: the IF chapter, moved from Beginner. */
export const EXCEL_INTERMEDIATE_LEVELS = [l11, l12, l13, l14, l15];

export function getLevel(id) {
  return EXCEL_INTERMEDIATE_LEVELS.find((l) => l.id === id) || null;
}
