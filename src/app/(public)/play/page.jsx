import { assertPlayEnabled } from '@/lib/play/flag';
import { EXCEL_TIERS } from '@/lib/play/levels/excel/tiers';
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
      tiers={EXCEL_TIERS.map(({ levels, ...tier }) => ({ ...tier, levels: levels.map(({ id, chapter, order }) => ({ id, chapter, order })) }))}
    />
  );
}
