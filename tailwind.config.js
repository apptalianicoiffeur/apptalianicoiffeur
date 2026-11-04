/** @type {import('tailwindcss').Config} */
// Tailwind configuration: dark barber-shop theme with gold accents.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Arabic font used across the whole UI.
        sans: ['Cairo', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Theme-aware surfaces; values are switched by ThemeProvider.
        ink: {
          950: 'rgb(var(--color-ink-950) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
          800: 'rgb(var(--color-ink-800) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          600: 'rgb(var(--color-ink-600) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
        },
        slate: {
          100: 'rgb(var(--color-slate-100) / <alpha-value>)',
          200: 'rgb(var(--color-slate-200) / <alpha-value>)',
          300: 'rgb(var(--color-slate-300) / <alpha-value>)',
          400: 'rgb(var(--color-slate-400) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
        },
        red: {
          200: 'rgb(var(--color-red-200) / <alpha-value>)',
          300: 'rgb(var(--color-red-300) / <alpha-value>)',
          400: 'rgb(var(--color-red-400) / <alpha-value>)',
        },
        emerald: {
          200: 'rgb(var(--color-emerald-200) / <alpha-value>)',
          300: 'rgb(var(--color-emerald-300) / <alpha-value>)',
          400: 'rgb(var(--color-emerald-400) / <alpha-value>)',
        },
        // Brand gold
        gold: {
          200: 'rgb(var(--color-gold-200) / <alpha-value>)',
          300: 'rgb(var(--color-gold-300) / <alpha-value>)',
          400: '#E0BC5C',
          500: '#D4AF37',
          600: '#B8952B',
          700: '#8C6F1F',
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(212, 175, 55, 0.25)',
        card: 'var(--shadow-card)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(212, 175, 55, 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(212, 175, 55, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(212, 175, 55, 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'pop': 'pop 0.25s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
