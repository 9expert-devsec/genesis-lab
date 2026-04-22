'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * App-wide theme provider. Light is the landing state; users opt into dark
 * explicitly via the header toggle. We deliberately disable system following
 * so SEO crawlers and first-time visitors see the same light-mode look.
 */
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
