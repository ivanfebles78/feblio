/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd7fe',
          300: '#93bbfd',
          400: '#6096fa',
          500: '#3b74f6',
          600: '#2563eb',
          700: '#1d54d4',
          800: '#1e46ab',
          900: '#1e3d87',
          950: '#172654',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)',
        float: '0 20px 45px -20px rgba(37,99,235,.35)',
      },
    },
  },
  plugins: [],
}
