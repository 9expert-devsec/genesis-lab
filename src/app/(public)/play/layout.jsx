import { assertPlayEnabled } from '@/lib/play/flag';

// Dark launch: no page under /play is indexed or followed this round.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function PlayLayout({ children }) {
  assertPlayEnabled();
  return children;
}
