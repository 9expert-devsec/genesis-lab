import { Inter, Noto_Sans_Thai } from 'next/font/google';
import { siteConfig } from '@/config/site';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import './globals.css';

// ── Fonts ────────────────────────────────────────────────────────
// CI spec calls for Google Sans (restricted) → Inter as primary EN fallback.
// next/font self-hosts these, which is the Vercel-recommended path.
// LINE Seed Sans TH is not on Google Fonts — we load it via <link> below,
// with Noto Sans Thai as the self-hosted safety net.

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-en',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-thai',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

// ── Metadata ─────────────────────────────────────────────────────

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    '9Expert',
    '9Expert Training',
    'คอร์สอบรม',
    'Power BI',
    'Excel',
    'Power Automate',
    'AI',
    'Data',
    'Programming',
  ],
  authors: [{ name: siteConfig.nameFull }],
  openGraph: {
    type:        'website',
    locale:      'th_TH',
    url:         siteConfig.url,
    siteName:    siteConfig.name,
    title:       `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card:        'summary_large_image',
    title:       siteConfig.name,
    description: siteConfig.description,
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)',  color: '#0D1B2A' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// ── Layout ───────────────────────────────────────────────────────

export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${notoSansThai.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* LINE Seed Sans TH — not on Google Fonts, loaded via CDN per CI guide */}
        <link rel="preconnect" href="https://fonts.cdnfonts.com" />
        <link
          rel="stylesheet"
          href="https://fonts.cdnfonts.com/css/line-seed-sans-th"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
