/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: 'var(--bg-card)',
        slate: {
          50: 'var(--bg-color)',
          100: 'var(--accent-secondary)',
          200: 'var(--border-color)',
          300: 'var(--border-color-muted)',
          400: 'var(--text-muted)',
          500: 'var(--text-muted)',
          600: 'var(--text-muted)',
          700: 'var(--text-main)',
          800: 'var(--text-main)',
          900: 'var(--text-main)',
          950: 'var(--text-main)',
        },
        indigo: {
          50: 'var(--accent-secondary)',
          100: 'var(--accent-secondary-hover)',
          600: 'var(--accent-primary)',
          700: 'var(--accent-primary-hover)',
        }
      }
    },
  },
  plugins: [],
}
