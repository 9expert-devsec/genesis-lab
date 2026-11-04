import { Anton, JetBrains_Mono } from 'next/font/google';

import { assertPlayEnabled } from '@/lib/play/flag';

import styles from './play.module.css';

// Play-only faces, loaded here so no page outside /play fetches them. Anton is
// the hub's "LEVEL UP" display face; JetBrains Mono sets the formulas and scene
// numbers (play.module.css maps font-mono to it).
const anton = Anton({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-play-display' });
const playMono = JetBrains_Mono({ weight: ['400', '700'], subsets: ['latin'], display: 'swap', variable: '--font-play-mono' });

// Dark launch: no page under /play is indexed or followed this round.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function PlayLayout({ children }) {
  assertPlayEnabled();
  // display: contents — the wrapper only carries the font variables and rules.
  return <div className={`contents ${styles.root} ${anton.variable} ${playMono.variable}`}>{children}</div>;
}
