/** @type {import('tailwindcss').Config} */
// Design from the Technicon Services ERP (app/client/tailwind.config.js). Every colour is a CSS variable in
// src/index.css with a light and a dark value. Stored as RGB channels so opacity modifiers keep working.
// The older sales names (ink, accent, brand...) mean something different in the ERP, so they're kept here and
// pointed at the ERP's variables rather than replaced by its config.
const t = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      screens: {
        'desktop-xl': '1440px',
        'desktop-lg': '1180px',
        'tablet-lg': '860px',
        'mobile-sm': '390px',
      },
      colors: {
        // Sales names
        brand: { DEFAULT: t('accent'), dark: t('brand-navy'), soft: 'rgb(var(--accent) / 0.1)' },
        accent: { DEFAULT: t('cta'), dark: t('warn'), soft: t('warn-bg') },
        ink: { DEFAULT: t('fg'), muted: t('muted'), faint: t('faint') },
        line: 'rgb(var(--line-rgb) / 0.13)',
        canvas: t('bg'),
        danger: { DEFAULT: t('bad'), soft: t('bad-bg') },
        ok: { DEFAULT: t('good'), soft: t('good-bg') },

        // ERP names
        surface: t('surface'),
        surface2: t('surface-2'),
        tile: t('tile'),
        fg: t('fg'),
        subtle: t('muted'),
        faint: t('faint'),
        onaccent: t('on-accent'),
        cta: t('cta'),
        oncta: t('on-cta'),
        good: t('good'),
        goodbg: t('good-bg'),
        bad: t('bad'),
        badbg: t('bad-bg'),
        warn: t('warn'),
        warnbg: t('warn-bg'),
        line2: 'rgb(var(--line-rgb) / 0.13)',
        // The ERP's base rules use border-border.
        border: 'rgb(var(--line-rgb) / 0.13)',
      },
      borderRadius: {
        xl: '18px',
        '2xl': '22px',
        lg: '16px',
        md: '10px',
        sm: '8px',
        card: '22px',
        ctl: '12px',
      },
      boxShadow: {
        card: 'var(--shadow)',
        lift: 'var(--shadow), 0 0 0 1px rgb(var(--line-rgb) / 0.07), 0 30px 60px -24px rgba(0,0,0,.35)',
        rail: '0 18px 40px -18px rgba(0,0,0,.55)',
        navy: '0 10px 22px -12px rgba(0,0,0,.45)',
        hero: '0 18px 36px -22px rgba(0,0,0,.6)',
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(.65,0,.35,1)',
        spring: 'cubic-bezier(.2,.9,.25,1.04)',
        out: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(16px) scale(.985)', filter: 'blur(5px)' }, to: { opacity: '1', transform: 'none', filter: 'none' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        titleIn: { from: { opacity: '0', filter: 'blur(10px)', transform: 'translateY(6px)' }, to: { opacity: '1', filter: 'blur(0)', transform: 'none' } },
        panelIn: { from: { opacity: '0', transform: 'translateY(-6px) scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        growY: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
      },
      animation: {
        rise: 'rise .7s cubic-bezier(.16,1,.3,1) both',
        'fade-up': 'fadeUp .45s cubic-bezier(.16,1,.3,1) both',
        'title-in': 'titleIn .7s cubic-bezier(.16,1,.3,1) both',
        'panel-in': 'panelIn .35s cubic-bezier(.2,.9,.25,1.04) both',
      },
    },
  },
  plugins: [],
};
