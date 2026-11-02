import { assertPlayEnabled } from '@/lib/play/flag';
import { EXCEL_BEGINNER_CHAPTERS, EXCEL_BEGINNER_LEVELS } from '@/lib/play/levels/excel/beginner';
import { PlayHub } from '@/components/play/hub/PlayHub';

export const metadata = {
  title: '9Expert Play · ฝึก Excel ผ่านภารกิจ',
  robots: { index: false, follow: false },
};

export default function Page() {
  assertPlayEnabled();
  return (
    <PlayHub
      // Only what the map and the hero CTA read — not every level's sheet.
      levels={EXCEL_BEGINNER_LEVELS.map(({ id, chapter, order }) => ({ id, chapter, order }))}
      chapterNames={EXCEL_BEGINNER_CHAPTERS}
    />
  );
}
