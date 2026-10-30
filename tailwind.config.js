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
        // Neutral dark surfaces
        ink: {
          950: '#07080B',
          900: '#0B0C10',
          800: '#101218',
          700: '#15171D',
          600: '#1B1E26',
          500: '#23262F',
          400: '#2E323D',
        },
        // Brand gold
        gold: {
          200: '#F4E3AE',
          300: '#EBD48C',
          400: '#E0BC5C',
          500: '#D4AF37',
          600: '#B8952B',
          700: '#8C6F1F',
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(212, 175, 55, 0.25)',
        card: '0 8px 30px rgba(0, 0, 0, 0.35)',
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
