/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
    // ALL of lib, not a per-folder allowlist. Class literals do not only live in
    // components: any module that centralises a preset→class map holds them too
    // (Page Builder's theme presets, scheduleStatus's status colours). The JIT
    // only emits what it can SEE, so a class map outside these globs compiles to
    // nothing and the surface renders unstyled — with no build error, no failing
    // test, and no runtime warning.
    //
    // This entry was `lib/pageBuilder/**` alone. Centralising the five duplicated
    // schedule-status maps into lib/scheduleStatus.js moved four hex colours out
    // of scanned components and into an unscanned file, and every status badge
    // silently lost its colour. Naming one folder is what let that happen, so the
    // rule is now general: if it is in src/lib and it holds a class string, it is
    // scanned. test/pure/tailwindContentCoverage.test.mjs enforces it.
    './src/lib/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── 9Expert CI Color System ───────────────────────────────────
      // Ratio rule: Blues 60% / Highlights 30% / Lime 10%
      colors: {
        '9e': {
          // Primary Blues (60%)
          brand:      '#2486FF',  // Primary brand/logo color — large text/icons/dark bg; NOT small text on white (3.4:1 contrast)
          action:     '#005CFF',  // Links, small text on light bg, interactive (5.3:1 contrast ✅ WCAG AA)
          air:        '#48B0FF',  // Decorative, gradient, icons — dark backgrounds only; NOT text on light bg (2.3:1 contrast)
          ice:        '#F8FAFD',  // Light backgrounds, text on dark

          // Accent Lime (10%) — CTAs, on dark backgrounds only
          lime:       '#D4F73F',
          'lime-lt':  '#D8F852',  // Hover state
          'lime-dk':  '#B8D930',  // Active/pressed state

          // Supporting
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
        // Slate split: lt for light mode, dp for dark mode (parity per step)
        '9e-slate-lt': {
          50:  '#b7c3d4', 100: '#BEC9D8', 200: '#C5CFDD', 300: '#CDD5E1',
          400: '#D4DBE5', 500: '#DBE1EA', 600: '#E2E7EE', 700: '#E9EDF2',
          800: '#F1F3F6', 900: '#F8F9FB', 950: '#FBFCFD',
        },
        '9e-slate-dp': {
          50:  '#5E6A7E', 100: '#6E798B', 200: '#7E8898', 300: '#8E97A5',
          400: '#9EA6B2', 500: '#AEB4BE', 600: '#BFC3CB', 700: '#CFD2D8',
          800: '#DFE1E5', 900: '#EFF0F2', 950: '#F7F8F9',
        },

        // ── Page Builder accent scales (§7 accentColor / theme presets) ──
        // Same construction as the blues/lime: step 50 = base, tinting toward
        // white. These hex values are LIGHT-mode; dark-mode adaptation lives
        // in the --9e-<name>-<step> CSS vars (globals.css .dark), same split
        // as the other scales. Bases derived at brand-blue's S100/L57 EXCEPT
        // green, which is a deliberate emerald (see globals.css note).
        '9e-purple': {
          50:  '#9124FF', 100: '#9C3AFF', 200: '#A750FF', 300: '#B266FF',
          400: '#BD7CFF', 500: '#C892FF', 600: '#D3A7FF', 700: '#DEBDFF',
          800: '#E9D3FF', 900: '#F4E9FF', 950: '#FAF4FF',
        },
        '9e-orange': {
          50:  '#FF9124', 100: '#FF9C3A', 200: '#FFA750', 300: '#FFB266',
          400: '#FFBD7C', 500: '#FFC892', 600: '#FFD3A7', 700: '#FFDEBD',
          800: '#FFE9D3', 900: '#FFF4E9', 950: '#FFFAF4',
        },
        '9e-cyan': {
          50:  '#24DAFF', 100: '#3ADEFF', 200: '#50E1FF', 300: '#66E5FF',
          400: '#7CE9FF', 500: '#92EDFF', 600: '#A7F0FF', 700: '#BDF4FF',
          800: '#D3F8FF', 900: '#E9FBFF', 950: '#F4FDFF',
        },
        '9e-green': {
          50:  '#1FC17E', 100: '#35C78B', 200: '#4CCD98', 300: '#62D4A5',
          400: '#79DAB2', 500: '#8FE0BF', 600: '#A5E6CB', 700: '#BCECD8',
          800: '#D2F3E5', 900: '#E9F9F2', 950: '#F4FCF9',
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
      // Color comes from the --shadow-color CSS var (navy in light, black in
      // dark — see globals.css). In light this resolves to the exact original
      // rgba(13,27,42,α), so light mode is unchanged; in dark it becomes
      // rgba(0,0,0,α) so faint depth still registers on the dark canvas.
      boxShadow: {
        '9e-sm': '0 1px 2px rgb(var(--shadow-color) / 0.05)',
        '9e-md': '0 4px 12px rgb(var(--shadow-color) / 0.08)',
        '9e-lg': '0 8px 24px rgb(var(--shadow-color) / 0.12)',
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

      // ── Stacking scale (z-index) — one documented ladder for the ────
      // whole public site. Native Tailwind already provides 0/10/20/30/40/50;
      // we ADD 60/70/80 so the header (60) actually generates — a bare `z-60`
      // is NOT in the default scale and silently falls back to `auto` — and so
      // future chrome has gaps to slot into. Elements, low → high:
      //   40  CourseStickyCTA sticky bar   (below the sidebar + button)
      //   50  sidebar <aside>, back-to-top (above the bar)
      //   60  PublicHeader                 (above the hero cover slider)
      //   70, 80  reserved for future chrome
      // Overlay tier — must cover all chrome; kept as arbitrary values so the
      // ladder above stays readable: SitePopup z-[9000], drawer backdrop
      // z-[9998], mobile drawer z-[9999] (portalled to <body>).
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
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
  plugins: [
    require('@tailwindcss/container-queries'),
    require('@tailwindcss/typography'),
  ],
};
