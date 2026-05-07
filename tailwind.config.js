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
          action:     '#005CFF',  // Secondary blue — links, interactive, gradients
          air:        '#48B0FF',  // Highlights, gradient light end
          ice:        '#F8FAFD',  // Light backgrounds, text on dark

          // Accent Lime (10%) — CTAs, on dark backgrounds only
          lime:       '#D4F73F',
          'lime-lt':  '#D8F852',  // Hover state
          'lime-dk':  '#B8D930',  // Active/pressed state

          // Supporting
          slate:      '#5E6A7E',  // Secondary text, captions
          navy:       '#0D1B2A',  // Dark backgrounds, primary text on light
          card:       '#132638',  // Card backgrounds on dark mode
          border:     '#1A2D42',  // Borders/dividers on dark
        },
        '9e-signature': {
          50: '#2486FF', 100: '#3A92FF', 200: '#509EFF', 300: '#66AAFF',
          400: '#7CB6FF', 500: '#92C2FF', 600: '#A7CFFF', 700: '#BDDBFF',
          800: '#D3E7FF', 900: '#E9F3FF', 950: '#F4F9FF',
        },
        '9e-action-scale': {
          50: '#005CFF', 100: '#1A6CFF', 200: '#337DFF', 300: '#4C8DFF',
          400: '#669DFF', 500: '#80AEFF', 600: '#99BEFF', 700: '#B2CEFF',
          800: '#CCDEFF', 900: '#E6EFFF', 950: '#F2F7FF',
        },
        '9e-air-scale': {
          50: '#48B0FF', 100: '#5AB8FF', 200: '#6DC0FF', 300: '#7FC8FF',
          400: '#91D0FF', 500: '#A4D8FF', 600: '#B6DFFF', 700: '#C8E7FF',
          800: '#DAEFFF', 900: '#EDF7FF', 950: '#F6FBFF',
        },
        '9e-lime-scale': {
          50: '#D4F73F', 100: '#D8F852', 200: '#DDF965', 300: '#E1F979',
          400: '#E5FA8C', 500: '#EAFB9F', 600: '#EEFCB2', 700: '#F2FDC5',
          800: '#F6FDD9', 900: '#FBFEEC', 950: '#FDFFF5',
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
        '9e-gradient-accent':    'linear-gradient(to right, #B8D930, #D8F852)',
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
