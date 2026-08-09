import { Suspense } from 'react';
import localFont from 'next/font/local';
import { siteConfig } from '@/config/site';
import { OG_DEFAULT_IMAGE } from '@/lib/seo/ogImage';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Analytics } from '@/components/analytics/Analytics';
import { AnalyticsPageTracker } from '@/components/analytics/AnalyticsPageTracker';
import { FloatingActionDock } from '@/components/ui/FloatingActionDock';
import { ChatLauncher } from '@/components/chat/ChatLauncher';
import { ReadingProgressRing } from '@/components/ui/ReadingProgressRing';
import './globals.css';

// ── Fonts ────────────────────────────────────────────────────────
// Both families are self-hosted from /public/fonts/ via next/font/local.
// --font-en  → Google Sans (body / detail / EN)
// --font-thai → LINE Seed Sans TH (Thai + headings)

const googleSans = localFont({
  src: [
    { path: '../fonts/GoogleSans-Regular.ttf',        weight: '400', style: 'normal' },
    { path: '../fonts/GoogleSans-Medium.ttf',         weight: '500', style: 'normal' },
    { path: '../fonts/GoogleSans-SemiBold.ttf',       weight: '600', style: 'normal' },
    { path: '../fonts/GoogleSans-Bold.ttf',           weight: '700', style: 'normal' },
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
  description:
    'อบรมคอร์สเทคโนโลยีชั้นนำ AI, Data, Power BI, Excel, Power Automate, Automation ด้วยผู้เชี่ยวชาญตัวจริง สอนสไตล์ใช้งานจริง Never Stop Learning',
  keywords: [
    '9Expert Training',
    'คอร์สอบรม',
    'อบรมคอมพิวเตอร์',
    'Power BI',
    'Excel',
    'Power Automate',
    'AI',
    'Data Analytics',
    'Automation',
    'RPA',
    'Programming',
    'Microsoft',
    'สอน Excel',
    'สอน Power BI',
    'อบรม AI',
  ],
  authors: [{ name: siteConfig.nameFull }],
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    type:        'website',
    locale:      'th_TH',
    url:         siteConfig.url,
    siteName:    siteConfig.name,
    title:       `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    // Dedicated 1.91:1 (1200×630) social card. metadataBase makes the
    // root-relative url absolute in the emitted tag. width/height let
    // crawlers lay out the card before downloading the image.
    images: [OG_DEFAULT_IMAGE],
  },
  twitter: {
    card:        'summary_large_image',
    title:       siteConfig.name,
    description: siteConfig.description,
    images: [OG_DEFAULT_IMAGE.url],
  },
  // Next.js App Router auto-discovers src/app/favicon.ico; the entries
  // below add a PNG fallback (Apple/Android home-screen icons need it).
  // These stay on the SQUARE asset (9exp-stand.png is 400×400) — icons
  // must be square, which is why the OG card above uses a separate file.
  icons: {
    icon: '/logo/9exp-stand.png',
    apple: '/logo/9exp-stand.png',
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
  // Server-side. `Boolean(...)` rather than the raw value: nothing downstream
  // needs the URL, and a boolean cannot leak one into the RSC payload.
  const chatEnabled = Boolean(process.env.CHATBOT_V2_API_URL);

  return (
    <html
      lang="th"
      className={`${googleSans.variable} ${lineSeedSansTH.variable}`}
      suppressHydrationWarning
    >
      <body className="font-en antialiased ">
        <Analytics />
        <Suspense fallback={null}>
          <AnalyticsPageTracker />
        </Suspense>
        <ThemeProvider>
          {children}
          {/* ── THE FLOATING DOCK IS MOUNTED HERE, ONCE ──────────────────
              Not in (public)/layout.jsx, and not in page.jsx — it used to be
              in BOTH, because the home page sits outside the (public) group
              and does not inherit that layout.

              Two mounts are two separate React trees. Walking from the home
              page to any (public) page unmounts one and mounts the other, so
              anything the dock holds is destroyed in transit. That is
              survivable for a scroll listener and fatal for a chat
              conversation, which is why the mount moved before the chat
              arrived rather than after.

              The dock returns null on /admin itself (client-side, via
              usePathname) — see src/lib/floatingDock.js. Doing it there and
              not here is what keeps the rule in one testable place instead of
              becoming a condition in a server layout that cannot see the
              path. */}
          {/* THE ENV GATE LIVES HERE AND ONLY HERE. This layout is a server
              component, so CHATBOT_V2_API_URL is read on the server and never
              reaches the browser — no NEXT_PUBLIC_ variable, and no dead
              launcher shipped to production ahead of the backend. When the
              service is unconfigured the element is simply never created.

              The dock is handed an ELEMENT, not a flag: it owns the position
              and knows nothing about chat. Whether the launcher is appropriate
              on THIS path is a third question, answered inside ChatLauncher
              itself via shouldRenderChatLauncher. */}
          <FloatingActionDock
            topSlot={<ReadingProgressRing />}
            bottomSlot={chatEnabled ? <ChatLauncher /> : null}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
