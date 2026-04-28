import localFont from 'next/font/local';
import { siteConfig } from '@/config/site';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import './globals.css';

// ── Fonts ────────────────────────────────────────────────────────
// Both families are self-hosted from /public/fonts/ via next/font/local.
// --font-en  → Google Sans (body / detail / EN)
// --font-thai → LINE Seed Sans TH (Thai + headings)

const googleSans = localFont({
  src: [
    { path: '../fonts/GoogleSans-Regular.ttf',        weight: '400', style: 'normal' },
    { path: '../fonts/GoogleSans-Italic.ttf',         weight: '400', style: 'italic' },
    { path: '../fonts/GoogleSans-Medium.ttf',         weight: '500', style: 'normal' },
    { path: '../fonts/GoogleSans-MediumItalic.ttf',   weight: '500', style: 'italic' },
    { path: '../fonts/GoogleSans-SemiBold.ttf',       weight: '600', style: 'normal' },
    { path: '../fonts/GoogleSans-Bold.ttf',           weight: '700', style: 'normal' },
    { path: '../fonts/GoogleSans-BoldItalic.ttf',     weight: '700', style: 'italic' },
  ],
  variable: '--font-en',
  display: 'swap',
});

const lineSeedSansTH = localFont({
  src: [
    { path: '../fonts/LINESeedSansTH_W_Th.woff2',  weight: '100', style: 'normal' },
    { path: '../fonts/LINESeedSansTH_W_Rg.woff2',  weight: '400', style: 'normal' },
    { path: '../fonts/LINESeedSansTH_W_Bd.woff2',  weight: '700', style: 'normal' },
    { path: '../fonts/LINESeedSansTH_W_He.woff2',  weight: '800', style: 'normal' },
    { path: '../fonts/LINESeedSansTH_W_XBd.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-thai',
  display: 'swap',
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
    icon: '/brand/logo-g.ico',
    shortcut: '/brand/logo-g.ico',
    apple: '/brand/logo-g.ico',
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
      className={`${googleSans.variable} ${lineSeedSansTH.variable}`}
      suppressHydrationWarning
    >
      <body className="font-en antialiased ">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
