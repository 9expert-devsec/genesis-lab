/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── 9Expert CI Color System ───────────────────────────────────
      // Ratio rule: Blues 60% / Highlights 30% / Lime 10%
      colors: {
        '9e': {
          // Primary Blues (60%)
          brand:      '#2486FF',  // Primary brand/logo color — headings, key buttons
          primary:    '#005CFF',  // Secondary blue — links, interactive, gradients
          sky:        '#48B0FF',  // Highlights, gradient light end
          ice:        '#F8FAFD',  // Light backgrounds, text on dark

          // Accent Lime (10%) — CTAs, on dark backgrounds only
          lime:       '#D4F73F',
          'lime-lt':  '#E4FF6B',  // Hover state
          'lime-dk':  '#B8D930',  // Active/pressed state

          // Supporting
          slate:      '#808A95',  // Secondary text, captions
          navy:       '#0D1B2A',  // Dark backgrounds, primary text on light
          card:       '#132638',  // Card backgrounds on dark mode
          border:     '#1A2D42',  // Borders/dividers on dark
        },
      },

      // ── Typography ────────────────────────────────────────────────
      // Applied via next/font as CSS variables in src/app/layout.jsx
      fontFamily: {
        // Headings — LINE Seed Sans TH first (covers Thai + Latin), Google Sans fallback
        heading: ['"LINE Seed Sans TH"', 'var(--font-thai)', '"Google Sans"', 'var(--font-en)', 'sans-serif'],
        thai:    ['"LINE Seed Sans TH"', 'var(--font-thai)', 'sans-serif'],
        en:      ['"Google Sans"', 'var(--font-en)', 'sans-serif'],
        sans:    ['"Google Sans"', 'var(--font-en)', '"LINE Seed Sans TH"', 'var(--font-thai)', 'sans-serif'],
      },

      // ── Radii ─────────────────────────────────────────────────────
      borderRadius: {
        '9e-sm':   '8px',
        '9e-md':   '12px',
        '9e-lg':   '16px',
        '9e-xl':   '24px',
      },

      // ── Shadows ───────────────────────────────────────────────────
      boxShadow: {
        '9e-sm': '0 1px 2px rgba(13,27,42,0.05)',
        '9e-md': '0 4px 12px rgba(13,27,42,0.08)',
        '9e-lg': '0 8px 24px rgba(13,27,42,0.12)',
      },

      // ── Motion ────────────────────────────────────────────────────
      transitionTimingFunction: {
        '9e':       'cubic-bezier(0.4, 0, 0.2, 1)',
        '9e-enter': 'cubic-bezier(0, 0, 0.2, 1)',
      },
      transitionDuration: {
        '9e-micro':  '200ms',  // Hover, focus
        '9e-reveal': '300ms',  // Accordion, dropdown
        '9e-page':   '500ms',  // Page transitions
      },

      // ── Brand Gradients ───────────────────────────────────────────
      backgroundImage: {
        '9e-gradient-hero':      'linear-gradient(to right, #005CFF, #48B0FF)',
        '9e-gradient-dark':      'linear-gradient(to bottom, #0D1B2A, #005CFF)',
        '9e-gradient-subtle':    'linear-gradient(to bottom, #F8FAFD, #E8F0FE)',
        '9e-gradient-accent':    'linear-gradient(to right, #B8D930, #E4FF6B)',
        '9e-gradient-signature': 'linear-gradient(135deg, #0D1B2A 0%, #005CFF 100%)',
      },
    },

    // ── Breakpoints (locked in Manifesto) ───────────────────────────
    screens: {
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [],
};
